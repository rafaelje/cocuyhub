use crate::errors::CommandError;
use crate::models::{AppSettings, DetectedPaths, ExternalChangeEvent, ToolTarget};
use crate::AppState;
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, mpsc};
use std::collections::HashSet;
use tauri::Emitter;

/// Returns the path to the app settings file:
/// ~/Library/Application Support/CocuyHub/settings.json
pub fn get_settings_file_path() -> Result<PathBuf, CommandError> {
    settings_file_path()
}

fn settings_file_path() -> Result<PathBuf, CommandError> {
    let home = std::env::var("HOME").map_err(|_| CommandError::WriteError {
        message: "Cannot determine HOME directory".to_string(),
    })?;
    Ok(PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("CocuyHub")
        .join("settings.json"))
}

/// Detect Claude config file paths on disk.
/// Returns None for paths that do not exist.
fn detect_paths_on_disk() -> DetectedPaths {
    let home = std::env::var("HOME").unwrap_or_default();

    let code_candidate = PathBuf::from(&home).join(".claude").join("claude.json");
    let desktop_candidate = PathBuf::from(&home)
        .join("Library")
        .join("Application Support")
        .join("Claude")
        .join("claude_desktop_config.json");

    DetectedPaths {
        code_path: if code_candidate.exists() {
            Some(code_candidate.to_string_lossy().to_string())
        } else {
            None
        },
        desktop_path: if desktop_candidate.exists() {
            Some(desktop_candidate.to_string_lossy().to_string())
        } else {
            None
        },
    }
}

#[tauri::command]
pub fn config_detect_paths() -> Result<DetectedPaths, CommandError> {
    let settings_path = settings_file_path()?;

    // If settings file exists, load and return stored paths
    if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path).map_err(|e| {
            CommandError::ReadError {
                message: format!("Failed to read settings file: {}", e),
            }
        })?;
        let settings: AppSettings =
            serde_json::from_str(&content).map_err(|e| CommandError::ParseError {
                message: format!("Failed to parse settings file: {}", e),
            })?;
        return Ok(DetectedPaths {
            code_path: settings.code_path,
            desktop_path: settings.desktop_path,
        });
    }

    // First launch: detect paths and save them
    let detected = detect_paths_on_disk();

    let settings = AppSettings {
        code_path: detected.code_path.clone(),
        desktop_path: detected.desktop_path.clone(),
    };

    // Ensure directory exists
    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| CommandError::WriteError {
            message: format!("Failed to create settings directory: {}", e),
        })?;
    }

    let json = serde_json::to_string_pretty(&settings).map_err(|e| CommandError::WriteError {
        message: format!("Failed to serialize settings: {}", e),
    })?;

    std::fs::write(&settings_path, json).map_err(|e| CommandError::WriteError {
        message: format!("Failed to write settings file: {}", e),
    })?;

    Ok(detected)
}

/// Always scans disk for Claude config paths, saves result to settings, and returns it.
/// Use this when the user explicitly requests re-detection (e.g., "Detect Paths" button).
#[tauri::command]
pub fn config_rescan_paths() -> Result<DetectedPaths, CommandError> {
    let detected = detect_paths_on_disk();

    let settings = AppSettings {
        code_path: detected.code_path.clone(),
        desktop_path: detected.desktop_path.clone(),
    };

    let settings_path = settings_file_path()?;

    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| CommandError::WriteError {
            message: format!("Failed to create settings directory: {}", e),
        })?;
    }

    let json = serde_json::to_string_pretty(&settings).map_err(|e| CommandError::WriteError {
        message: format!("Failed to serialize settings: {}", e),
    })?;

    std::fs::write(&settings_path, json).map_err(|e| CommandError::WriteError {
        message: format!("Failed to write settings file: {}", e),
    })?;

    Ok(detected)
}

#[tauri::command]
pub fn config_save_settings(settings: AppSettings) -> Result<(), CommandError> {
    let settings_path = settings_file_path()?;

    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| CommandError::WriteError {
            message: format!("Failed to create settings directory: {}", e),
        })?;
    }

    let json = serde_json::to_string_pretty(&settings).map_err(|e| CommandError::WriteError {
        message: format!("Failed to serialize settings: {}", e),
    })?;

    std::fs::write(&settings_path, json).map_err(|e| CommandError::WriteError {
        message: format!("Failed to write settings file: {}", e),
    })?;

    Ok(())
}

#[tauri::command]
pub fn config_load_settings() -> Result<AppSettings, CommandError> {
    let settings_path = settings_file_path()?;

    if !settings_path.exists() {
        return Ok(AppSettings::default());
    }

    let content =
        std::fs::read_to_string(&settings_path).map_err(|e| CommandError::ReadError {
            message: format!("Failed to read settings file: {}", e),
        })?;

    let settings: AppSettings =
        serde_json::from_str(&content).map_err(|e| CommandError::ParseError {
            message: format!("Failed to parse settings file: {}", e),
        })?;

    Ok(settings)
}

#[tauri::command]
pub fn config_read_file(path: String) -> Result<String, CommandError> {
    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Err(CommandError::FileNotFound { path });
    }

    let content = std::fs::read_to_string(file_path).map_err(|e| CommandError::ReadError {
        message: format!("Failed to read file: {}", e),
    })?;

    // Validate that content is valid JSON
    serde_json::from_str::<serde_json::Value>(&content).map_err(|e| CommandError::ParseError {
        message: format!("Invalid JSON: {}", e),
    })?;

    Ok(content)
}

/// Core atomic write: validate JSON, write to {path}.tmp, rename to {path}.
/// Does NOT manage writing_paths or emit events — testable without AppHandle/State.
fn atomic_write(target_path: &Path, content: &str) -> Result<(), CommandError> {
    serde_json::from_str::<serde_json::Value>(content).map_err(|e| CommandError::ParseError {
        message: format!("Invalid JSON: {}", e),
    })?;

    let tmp_path = PathBuf::from(format!("{}.tmp", target_path.to_string_lossy()));

    if let Some(parent) = target_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| CommandError::WriteError {
            message: format!("Failed to create parent directory: {}", e),
        })?;
    }

    std::fs::write(&tmp_path, content).map_err(|e| CommandError::WriteError {
        message: format!("Failed to write temp file: {}", e),
    })?;

    std::fs::rename(&tmp_path, target_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        CommandError::WriteError {
            message: format!("Failed to rename temp file: {}", e),
        }
    })?;

    Ok(())
}

/// Schedule delayed removal of path from writing_paths.
/// Keeps the suppression flag active for 200ms after the rename so FSEvents
/// notifications (which arrive asynchronously) are still suppressed.
fn schedule_writing_paths_removal(writing_paths: Arc<Mutex<HashSet<PathBuf>>>, path: PathBuf) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(200));
        let mut writing = writing_paths.lock().unwrap();
        writing.remove(&path);
    });
}

#[tauri::command]
pub fn config_write_file(
    path: String,
    content: String,
    tool: ToolTarget,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), CommandError> {
    write_pipeline(&path, &content, &tool, &app, &state)
}

#[tauri::command]
pub fn config_start_watcher(
    paths: Vec<String>,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), CommandError> {
    // Guard: only start one watcher thread — prevents thread leak on multiple calls
    {
        let mut active = state.watcher_active.lock().unwrap();
        if *active {
            return Ok(());
        }
        *active = true;
    }

    let (tx, rx) = mpsc::channel();

    let mut watcher =
        RecommendedWatcher::new(tx, Config::default()).map_err(|e| CommandError::WriteError {
            message: format!("Failed to create file watcher: {}", e),
        })?;

    let path_to_tool: Vec<(PathBuf, ToolTarget)> = paths
        .iter()
        .filter_map(|p| {
            let pb = PathBuf::from(p);
            let tool = if p.contains(".claude/claude.json") || p.contains("claude.json") && !p.contains("Claude/") {
                Some(ToolTarget::Code)
            } else if p.contains("claude_desktop_config.json") {
                Some(ToolTarget::Desktop)
            } else {
                None
            };
            tool.map(|t| (pb, t))
        })
        .collect();

    for (pb, _) in &path_to_tool {
        // Watch parent directory to catch atomic renames
        if let Some(parent) = pb.parent() {
            if parent.exists() {
                let _ = watcher.watch(parent, RecursiveMode::NonRecursive);
            }
        }
    }

    let writing_paths = state.writing_paths.clone();
    let app_clone = app.clone();

    // Spawn a thread to receive file events
    std::thread::spawn(move || {
        // Keep watcher alive in this thread
        let _watcher = watcher;

        for result in rx {
            match result {
                Ok(event) => {
                    // Only handle modify/create events
                    let is_relevant = matches!(
                        event.kind,
                        EventKind::Modify(_) | EventKind::Create(_)
                    );
                    if !is_relevant {
                        continue;
                    }

                    for changed_path in &event.paths {
                        let writing = writing_paths.lock().unwrap();
                        if writing.contains(changed_path) {
                            // Skip - we wrote this ourselves
                            continue;
                        }
                        drop(writing);

                        // Find matching tool
                        for (watched_path, tool) in &path_to_tool {
                            if changed_path == watched_path {
                                let evt = ExternalChangeEvent {
                                    path: changed_path.to_string_lossy().to_string(),
                                    tool: tool.clone(),
                                };
                                let _ = app_clone.emit("config://external-change", &evt);
                                break;
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}

/// Atomic write pipeline: validates JSON, writes atomically (write-to-temp + rename),
/// suppresses watcher false positives, and emits write-complete event.
/// Pipeline order: (1) auto-snapshot → (2) validate JSON → (3) atomic write → (4) emit write-complete.
/// Used by config_write_file (Tauri command), snapshot_restore, and future MCP commands.
pub fn write_pipeline(
    path: &str,
    content: &str,
    tool: &ToolTarget,
    app: &tauri::AppHandle,
    state: &tauri::State<AppState>,
) -> Result<(), CommandError> {
    let target_path = PathBuf::from(path);

    // Step 1: Create auto-snapshot of current file BEFORE overwriting it.
    // Skip gracefully if the file does not exist yet (first write — nothing to snapshot).
    if target_path.exists() {
        crate::commands::snapshots::create_auto_snapshot(path, tool, app)?;
    }

    // Steps 2–3: Atomic write (validates JSON internally, writes tmp, renames).
    {
        let mut writing = state.writing_paths.lock().unwrap();
        writing.insert(target_path.clone());
    }

    atomic_write(&target_path, content).map_err(|e| {
        let mut writing = state.writing_paths.lock().unwrap();
        writing.remove(&target_path);
        e
    })?;

    schedule_writing_paths_removal(state.writing_paths.clone(), target_path);

    // Step 4: Emit write-complete.
    let _ = app.emit("config://write-complete", path);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_paths_on_disk_matches_filesystem() {
        // Calls the real detect_paths_on_disk() and verifies results match the filesystem
        let result = detect_paths_on_disk();

        let home = std::env::var("HOME").unwrap_or_default();
        let code_candidate = PathBuf::from(&home).join(".claude").join("claude.json");
        let desktop_candidate = PathBuf::from(&home)
            .join("Library")
            .join("Application Support")
            .join("Claude")
            .join("claude_desktop_config.json");

        assert_eq!(result.code_path.is_some(), code_candidate.exists(),
            "code_path detection should match ~/.claude/claude.json existence");
        assert_eq!(result.desktop_path.is_some(), desktop_candidate.exists(),
            "desktop_path detection should match claude_desktop_config.json existence");

        if let Some(ref path) = result.code_path {
            assert_eq!(path, &code_candidate.to_string_lossy().to_string());
        }
        if let Some(ref path) = result.desktop_path {
            assert_eq!(path, &desktop_candidate.to_string_lossy().to_string());
        }
    }

    #[test]
    fn test_settings_serialization() {
        let settings = AppSettings {
            code_path: Some("/path/to/claude.json".to_string()),
            desktop_path: None,
        };
        let json = serde_json::to_string(&settings).unwrap();
        let parsed: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.code_path, settings.code_path);
        assert_eq!(parsed.desktop_path, settings.desktop_path);
    }

    #[test]
    fn test_detected_paths_serialization() {
        let detected = DetectedPaths {
            code_path: Some("/home/user/.claude/claude.json".to_string()),
            desktop_path: Some(
                "/home/user/Library/Application Support/Claude/claude_desktop_config.json"
                    .to_string(),
            ),
        };
        let json = serde_json::to_string(&detected).unwrap();
        assert!(json.contains("codePath"));
        assert!(json.contains("desktopPath"));
    }

    #[test]
    fn test_config_read_file_returns_file_not_found_for_missing() {
        let result = config_read_file("/nonexistent/path/that/does/not/exist.json".to_string());
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::FileNotFound { path } => {
                assert_eq!(path, "/nonexistent/path/that/does/not/exist.json");
            }
            other => panic!("Expected FileNotFound, got {:?}", other),
        }
    }

    #[test]
    fn test_settings_default_has_none_paths() {
        let settings = AppSettings::default();
        assert!(settings.code_path.is_none());
        assert!(settings.desktop_path.is_none());
    }

    #[test]
    fn test_atomic_write_creates_file_with_correct_content() {
        let dir = std::env::temp_dir().join("cocuyhub_test_write");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test_write_content.json");
        let content = r#"{"mcpServers":{}}"#;

        atomic_write(&path, content).unwrap();

        let written = std::fs::read_to_string(&path).unwrap();
        assert_eq!(written, content);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn test_atomic_write_rejects_invalid_json() {
        let path = std::env::temp_dir().join("test_invalid_json.json");
        let result = atomic_write(&path, "not valid json {{ at all");
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::ParseError { .. } => {}
            other => panic!("Expected ParseError, got {:?}", other),
        }
    }

    #[test]
    fn test_atomic_write_leaves_no_tmp_file_on_success() {
        let dir = std::env::temp_dir().join("cocuyhub_test_cleanup");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test_no_tmp.json");
        let tmp_path = PathBuf::from(format!("{}.tmp", path.to_string_lossy()));

        atomic_write(&path, r#"{"mcpServers":{}}"#).unwrap();

        assert!(path.exists(), "target file should exist after write");
        assert!(!tmp_path.exists(), "tmp file should be removed after successful rename");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn test_atomic_write_does_not_modify_original_on_json_error() {
        let dir = std::env::temp_dir().join("cocuyhub_test_original");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test_original_intact.json");
        let original = r#"{"mcpServers":{"original":{}}}"#;

        // Create original file
        std::fs::write(&path, original).unwrap();

        // Attempt write with invalid JSON
        let _ = atomic_write(&path, "invalid json");

        // Original should be untouched
        let still_there = std::fs::read_to_string(&path).unwrap();
        assert_eq!(still_there, original);
        std::fs::remove_file(&path).ok();
    }
}
