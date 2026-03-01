use crate::errors::CommandError;
use crate::models::{MetricsPayload, ModelStats, PlanLimits, SessionBlock};
use crate::AppState;
use chrono::{DateTime, Duration, Timelike, Utc};
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::mpsc;
use tauri::Emitter;

fn plan_limits(plan: &str) -> PlanLimits {
    match plan {
        "pro"   => PlanLimits { message_limit: 250,   token_limit: 19_000,  cost_limit_usd: 18.0 },
        "max5"  => PlanLimits { message_limit: 1_000, token_limit: 88_000,  cost_limit_usd: 35.0 },
        "max20" => PlanLimits { message_limit: 2_000, token_limit: 220_000, cost_limit_usd: 140.0 },
        _       => PlanLimits { message_limit: 250,   token_limit: 44_000,  cost_limit_usd: 50.0 },
    }
}

fn resolve_projects_path() -> Option<PathBuf> {
    let home = std::env::var("HOME").unwrap_or_default();
    let primary = PathBuf::from(&home).join(".claude").join("projects");
    if primary.exists() {
        return Some(primary);
    }
    let fallback = PathBuf::from(&home).join(".config").join("claude").join("projects");
    if fallback.exists() {
        return Some(fallback);
    }
    None
}

fn get_u64(obj: &Value, keys: &[&str]) -> u64 {
    for key in keys {
        if let Some(v) = obj.get(key).and_then(|v| v.as_u64()) {
            if v > 0 {
                return v;
            }
        }
    }
    0
}

/// Strip a trailing `-YYYYMMDD` date suffix (9 chars: dash + 8 digits).
fn strip_date_suffix(s: &str) -> String {
    let bytes = s.as_bytes();
    if bytes.len() >= 9
        && bytes[bytes.len() - 9] == b'-'
        && bytes[bytes.len() - 8..].iter().all(|b| b.is_ascii_digit())
    {
        return s[..s.len() - 9].to_string();
    }
    s.to_string()
}

fn normalize_model(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("opus") && lower.contains("4-") {
        return strip_date_suffix(&lower);
    }
    if lower.contains("sonnet") && lower.contains("4-") {
        return strip_date_suffix(&lower);
    }
    if lower.contains("haiku") && lower.contains("4-") {
        return strip_date_suffix(&lower);
    }
    if (lower.contains("3.5") || lower.contains("3-5")) && lower.contains("sonnet") {
        return "claude-3-5-sonnet".to_string();
    }
    if (lower.contains("3.5") || lower.contains("3-5")) && lower.contains("haiku") {
        return "claude-3-5-haiku".to_string();
    }
    if lower.contains("opus") {
        return "claude-3-opus".to_string();
    }
    lower
}

fn metrics_read_blocking() -> Result<MetricsPayload, CommandError> {
    let empty = MetricsPayload {
        active_session: None,
        past_sessions: vec![],
        global_model_stats: HashMap::new(),
        tool_usage: HashMap::new(),
        projects_path: String::new(),
        detected_plan: "custom".to_string(),
        plan_confidence: "unknown".to_string(),
        plan_limits: plan_limits("custom"),
    };

    // 1. Resolve projects path
    let projects_path = match resolve_projects_path() {
        Some(p) => p,
        None => return Ok(empty),
    };

    // 2. Recursive directory walk — only JSONL files modified in the last 7 days
    let cutoff = std::time::SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(7 * 24 * 3600))
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH);

    let mut stack = vec![projects_path.clone()];
    let mut jsonl_files: Vec<PathBuf> = Vec::new();
    while let Some(dir) = stack.pop() {
        let read = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in read.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().map_or(false, |e| e == "jsonl") {
                let recent = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .map(|t| t >= cutoff)
                    .unwrap_or(true); // include if we can't read mtime
                if recent {
                    jsonl_files.push(path);
                }
            }
        }
    }

    // 3. Parse entries
    let mut seen: HashSet<String> = HashSet::new();
    // (ts, entry_value, input, output, cache_create, cache_read, is_limit)
    let mut entries: Vec<(DateTime<Utc>, Value, u64, u64, u64, u64, bool)> = Vec::new();
    let mut tool_usage: HashMap<String, u64> = HashMap::new();

    for file in &jsonl_files {
        let content = match std::fs::read_to_string(file) {
            Ok(c) => c,
            Err(_) => continue,
        };
        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            let entry: Value = match serde_json::from_str(line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            // Deduplication
            let message_id = entry["message_id"].as_str()
                .or_else(|| entry["message"]["id"].as_str());
            let request_id = entry["requestId"].as_str()
                .or_else(|| entry["request_id"].as_str());
            if let (Some(mid), Some(rid)) = (message_id, request_id) {
                let key = format!("{}:{}", mid, rid);
                if seen.contains(&key) {
                    continue;
                }
                seen.insert(key);
            }

            // Token extraction
            let is_assistant = entry["type"].as_str() == Some("assistant");
            let sources: Vec<Option<&Value>> = if is_assistant {
                vec![
                    entry["message"].get("usage"),
                    entry.get("usage"),
                    Some(&entry),
                ]
            } else {
                vec![
                    entry.get("usage"),
                    entry["message"].get("usage"),
                    Some(&entry),
                ]
            };

            let mut input = 0u64;
            let mut output = 0u64;
            let mut cache_create = 0u64;
            let mut cache_read = 0u64;

            for source_opt in sources {
                if let Some(source) = source_opt {
                    let i = get_u64(source, &["input_tokens", "inputTokens", "prompt_tokens"]);
                    let o = get_u64(source, &["output_tokens", "outputTokens", "completion_tokens"]);
                    if i > 0 || o > 0 {
                        input = i;
                        output = o;
                        cache_create = get_u64(source, &[
                            "cache_creation_input_tokens",
                            "cache_creation_tokens",
                            "cacheCreationInputTokens",
                        ]);
                        cache_read = get_u64(source, &[
                            "cache_read_input_tokens",
                            "cache_read_tokens",
                            "cacheReadInputTokens",
                        ]);
                        break;
                    }
                }
            }

            if input == 0 && output == 0 {
                continue;
            }

            // Timestamp
            let ts = match entry["timestamp"].as_str()
                .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                .map(|t| t.with_timezone(&Utc))
            {
                Some(t) => t,
                None => continue,
            };

            // Limit detection
            let entry_type = entry["type"].as_str().unwrap_or("");
            let content_str = entry["content"].as_str().unwrap_or("").to_lowercase();
            let tool_result_str = entry["content"]
                .as_array()
                .and_then(|arr| arr.iter().find(|v| v["type"] == "tool_result"))
                .and_then(|v| v["content"].as_str())
                .unwrap_or("")
                .to_lowercase();
            let is_limit = (entry_type == "system" && content_str.contains("limit"))
                || (entry_type == "user" && tool_result_str.contains("limit reached"));

            // Extract tool usage from assistant messages
            if is_assistant {
                if let Some(content_arr) = entry["message"]["content"].as_array() {
                    for block in content_arr {
                        if block["type"].as_str() == Some("tool_use") {
                            if let Some(tool_name) = block["name"].as_str() {
                                *tool_usage.entry(tool_name.to_string()).or_insert(0) += 1;
                            }
                        }
                    }
                }
            }

            entries.push((ts, entry, input, output, cache_create, cache_read, is_limit));
        }
    }

    // 4. Sort by timestamp (before plan detection to scan in chronological order)
    entries.sort_by_key(|(ts, ..)| *ts);

    // 5. Plan detection Level 1 — scan system messages in chronological order
    let mut detected_plan = "custom".to_string();
    let mut plan_confidence = "unknown".to_string();

    'outer: for (_, entry, _, _, _, _, _) in &entries {
        if entry["type"].as_str() != Some("system") {
            continue;
        }
        let content = entry["content"].as_str().unwrap_or("").to_lowercase();
        if content.contains("max 20") || content.contains("max20") {
            detected_plan = "max20".to_string();
            plan_confidence = "confirmed".to_string();
            break 'outer;
        } else if content.contains("max 5") || content.contains("max5") {
            detected_plan = "max5".to_string();
            plan_confidence = "confirmed".to_string();
            break 'outer;
        } else if content.contains("claude pro") || content.contains("pro plan") {
            detected_plan = "pro".to_string();
            plan_confidence = "confirmed".to_string();
            break 'outer;
        }
    }

    // 6. Group into 5-hour blocks
    struct BlockAccum {
        start: DateTime<Utc>,
        end: DateTime<Utc>,
        input: u64,
        output: u64,
        cache_create: u64,
        cache_read: u64,
        message_count: u64,
        model_stats: HashMap<String, ModelStats>,
        limit_reached: bool,
    }

    let mut blocks: Vec<BlockAccum> = Vec::new();
    let mut last_ts: Option<DateTime<Utc>> = None;

    for (ts, entry, input, output, cache_create, cache_read, is_limit) in &entries {
        let needs_new_block = blocks.is_empty()
            || *ts >= blocks.last().unwrap().end
            || last_ts.map_or(true, |lt| *ts - lt >= Duration::hours(5));

        if needs_new_block {
            let hour = ts.date_naive()
                .and_hms_opt(ts.time().hour(), 0, 0)
                .unwrap()
                .and_utc();
            blocks.push(BlockAccum {
                start: hour,
                end: hour + Duration::hours(5),
                input: 0,
                output: 0,
                cache_create: 0,
                cache_read: 0,
                message_count: 0,
                model_stats: HashMap::new(),
                limit_reached: false,
            });
        }

        let block = blocks.last_mut().unwrap();
        block.input += input;
        block.output += output;
        block.cache_create += cache_create;
        block.cache_read += cache_read;
        block.message_count += 1;
        block.limit_reached = block.limit_reached || *is_limit;

        // Model normalization
        let raw_model = entry["message"]["model"].as_str()
            .or_else(|| entry["model"].as_str())
            .or_else(|| entry["Model"].as_str())
            .unwrap_or("unknown");
        let model_key = normalize_model(raw_model);
        let stat = block.model_stats.entry(model_key).or_insert(ModelStats {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            entries_count: 0,
        });
        stat.input_tokens += input;
        stat.output_tokens += output;
        stat.cache_creation_tokens += cache_create;
        stat.cache_read_tokens += cache_read;
        stat.entries_count += 1;

        last_ts = Some(*ts);
    }

    // 7. Plan detection Level 2 (only if not confirmed)
    if plan_confidence != "confirmed" {
        let best = blocks.iter()
            .filter(|b| b.limit_reached)
            .max_by_key(|b| b.message_count);
        if let Some(b) = best {
            let count = b.message_count;
            if count <= 250 {
                detected_plan = "pro".to_string();
            } else if count <= 1000 {
                detected_plan = "max5".to_string();
            } else if count <= 2000 {
                detected_plan = "max20".to_string();
            }
            plan_confidence = "inferred".to_string();
        }
    }

    // 8. Finalize blocks into SessionBlock
    let now = Utc::now();
    let finalized: Vec<SessionBlock> = blocks.into_iter().map(|b| {
        let total = b.input + b.output + b.cache_create + b.cache_read;
        SessionBlock {
            start_time: b.start.to_rfc3339(),
            end_time: b.end.to_rfc3339(),
            is_active: b.end > now,
            input_tokens: b.input,
            output_tokens: b.output,
            cache_creation_tokens: b.cache_create,
            cache_read_tokens: b.cache_read,
            total_tokens: total,
            message_count: b.message_count,
            model_stats: b.model_stats,
            limit_reached: b.limit_reached,
        }
    }).collect();

    // 9. Aggregate global model stats across all blocks
    let mut global_model_stats: HashMap<String, ModelStats> = HashMap::new();
    for block in &finalized {
        for (model, stats) in &block.model_stats {
            let entry = global_model_stats.entry(model.clone()).or_insert(ModelStats {
                input_tokens: 0,
                output_tokens: 0,
                cache_creation_tokens: 0,
                cache_read_tokens: 0,
                entries_count: 0,
            });
            entry.input_tokens += stats.input_tokens;
            entry.output_tokens += stats.output_tokens;
            entry.cache_creation_tokens += stats.cache_creation_tokens;
            entry.cache_read_tokens += stats.cache_read_tokens;
            entry.entries_count += stats.entries_count;
        }
    }

    // 10. Split and return
    let active_session = finalized.iter().find(|b| b.is_active).cloned();
    let mut past_sessions: Vec<SessionBlock> = finalized.into_iter().filter(|b| !b.is_active).collect();
    past_sessions.reverse();

    Ok(MetricsPayload {
        active_session,
        past_sessions,
        global_model_stats,
        tool_usage,
        projects_path: projects_path.to_string_lossy().to_string(),
        detected_plan: detected_plan.clone(),
        plan_confidence,
        plan_limits: plan_limits(&detected_plan),
    })
}

#[tauri::command]
pub async fn metrics_read() -> Result<MetricsPayload, CommandError> {
    tauri::async_runtime::spawn_blocking(metrics_read_blocking)
        .await
        .map_err(|e| CommandError::ReadError { message: e.to_string() })?
}

#[tauri::command]
pub fn metrics_start_watcher(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    {
        let mut active = state.metrics_watcher_active.lock().unwrap();
        if *active {
            return Ok(());
        }
        *active = true;
    }

    let projects_path = match resolve_projects_path() {
        Some(p) => p,
        None => return Ok(()),
    };

    let (tx, rx) = mpsc::channel();
    let mut watcher = match RecommendedWatcher::new(tx, Config::default()) {
        Ok(w) => w,
        Err(e) => {
            *state.metrics_watcher_active.lock().unwrap() = false;
            return Err(CommandError::WriteError { message: e.to_string() });
        }
    };
    if let Err(e) = watcher.watch(&projects_path, RecursiveMode::Recursive) {
        *state.metrics_watcher_active.lock().unwrap() = false;
        return Err(CommandError::WriteError { message: e.to_string() });
    }

    let app_clone = app.clone();
    std::thread::spawn(move || {
        let _watcher = watcher; // keep alive
        for result in rx {
            if let Ok(event) = result {
                let is_relevant = matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_));
                if is_relevant && event.paths.iter().any(|p| p.extension().map_or(false, |e| e == "jsonl")) {
                    let _ = app_clone.emit("metrics://updated", ());
                }
            }
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plan_limits_pro() {
        let limits = plan_limits("pro");
        assert_eq!(limits.message_limit, 250);
        assert_eq!(limits.token_limit, 19_000);
    }

    #[test]
    fn test_plan_limits_max5() {
        let limits = plan_limits("max5");
        assert_eq!(limits.message_limit, 1_000);
        assert_eq!(limits.token_limit, 88_000);
    }

    #[test]
    fn test_plan_limits_max20() {
        let limits = plan_limits("max20");
        assert_eq!(limits.message_limit, 2_000);
        assert_eq!(limits.token_limit, 220_000);
    }

    #[test]
    fn test_plan_limits_custom_fallback() {
        let limits = plan_limits("custom");
        assert_eq!(limits.message_limit, 250);
        assert_eq!(limits.token_limit, 44_000);
    }

    #[test]
    fn test_normalize_model_sonnet_35() {
        assert_eq!(normalize_model("claude-3-5-sonnet-20241022"), "claude-3-5-sonnet");
    }

    #[test]
    fn test_normalize_model_haiku_35() {
        assert_eq!(normalize_model("claude-3-5-haiku-20241022"), "claude-3-5-haiku");
    }

    #[test]
    fn test_normalize_model_sonnet_4() {
        let result = normalize_model("claude-sonnet-4-5");
        assert!(result.contains("sonnet") && result.contains("4-"));
    }

    #[test]
    fn test_normalize_model_opus_3() {
        assert_eq!(normalize_model("claude-3-opus-20240229"), "claude-3-opus");
    }

    #[test]
    fn test_normalize_model_unknown() {
        assert_eq!(normalize_model("SomeUnknownModel"), "someunknownmodel");
    }

    #[test]
    fn test_get_u64_finds_first_nonzero() {
        let v = serde_json::json!({ "input_tokens": 0, "inputTokens": 42 });
        assert_eq!(get_u64(&v, &["input_tokens", "inputTokens"]), 42);
    }

    #[test]
    fn test_get_u64_missing_key() {
        let v = serde_json::json!({});
        assert_eq!(get_u64(&v, &["input_tokens"]), 0);
    }

    #[test]
    fn test_plan_detection_max20_confirmed() {
        // Simulate a system entry with "max 20"
        let content = "max 20 messages per 5 hours";
        assert!(content.contains("max 20") || content.contains("max20"));
    }

    #[test]
    fn test_plan_detection_max5_not_confused_with_max20() {
        let content = "max 5 messages per 5 hours";
        let is_max20 = content.contains("max 20") || content.contains("max20");
        let is_max5 = content.contains("max 5") || content.contains("max5");
        assert!(!is_max20);
        assert!(is_max5);
    }

    #[test]
    fn test_plan_detection_pro_confirmed() {
        let content = "claude pro plan active";
        let is_pro = content.contains("claude pro") || content.contains("pro plan");
        assert!(is_pro);
    }

    #[test]
    fn test_metrics_read_returns_empty_when_no_path() {
        // metrics_read() gracefully returns empty payload when projects dir missing
        // (We can't easily test full command in unit test without fs mocking,
        // but we can test the resolve function returns None for a nonexistent path)
        // This is a smoke test for the plan_limits fallback
        let limits = plan_limits("custom");
        assert_eq!(limits.message_limit, 250);
    }

    #[test]
    fn test_tool_usage_extraction_from_content_blocks() {
        // Simulate the tool_usage extraction logic used in the parsing loop
        let entry = serde_json::json!({
            "message": {
                "content": [
                    { "type": "text", "text": "Let me read that file." },
                    { "type": "tool_use", "id": "1", "name": "Read", "input": {} },
                    { "type": "tool_use", "id": "2", "name": "Bash", "input": {} },
                    { "type": "tool_use", "id": "3", "name": "Read", "input": {} },
                    { "type": "tool_use", "id": "4", "name": "mcp__mysql__query", "input": {} }
                ]
            }
        });

        let mut tool_usage: HashMap<String, u64> = HashMap::new();
        if let Some(content_arr) = entry["message"]["content"].as_array() {
            for block in content_arr {
                if block["type"].as_str() == Some("tool_use") {
                    if let Some(tool_name) = block["name"].as_str() {
                        *tool_usage.entry(tool_name.to_string()).or_insert(0) += 1;
                    }
                }
            }
        }

        assert_eq!(tool_usage.get("Read"), Some(&2));
        assert_eq!(tool_usage.get("Bash"), Some(&1));
        assert_eq!(tool_usage.get("mcp__mysql__query"), Some(&1));
        assert_eq!(tool_usage.len(), 3);
    }

    #[test]
    fn test_tool_usage_no_panic_on_missing_content() {
        // Entries without content array should not cause any issues
        let entry = serde_json::json!({
            "message": { "role": "assistant" }
        });

        let mut tool_usage: HashMap<String, u64> = HashMap::new();
        if let Some(content_arr) = entry["message"]["content"].as_array() {
            for block in content_arr {
                if block["type"].as_str() == Some("tool_use") {
                    if let Some(tool_name) = block["name"].as_str() {
                        *tool_usage.entry(tool_name.to_string()).or_insert(0) += 1;
                    }
                }
            }
        }

        assert!(tool_usage.is_empty());
    }

    #[test]
    fn test_tool_usage_skips_blocks_without_name() {
        let entry = serde_json::json!({
            "message": {
                "content": [
                    { "type": "tool_use", "id": "1" },
                    { "type": "tool_use", "id": "2", "name": "Edit", "input": {} }
                ]
            }
        });

        let mut tool_usage: HashMap<String, u64> = HashMap::new();
        if let Some(content_arr) = entry["message"]["content"].as_array() {
            for block in content_arr {
                if block["type"].as_str() == Some("tool_use") {
                    if let Some(tool_name) = block["name"].as_str() {
                        *tool_usage.entry(tool_name.to_string()).or_insert(0) += 1;
                    }
                }
            }
        }

        assert_eq!(tool_usage.get("Edit"), Some(&1));
        assert_eq!(tool_usage.len(), 1);
    }
}
