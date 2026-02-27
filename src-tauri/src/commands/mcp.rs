use crate::errors::CommandError;
use crate::models::ToolTarget;
use crate::AppState;
use std::collections::HashMap;

/// Toggle the enabled/disabled state of a named MCP in a config file.
/// Uses serde_json::Value internally to preserve unknown fields (e.g. "type", custom env keys).
#[tauri::command]
pub fn mcp_toggle(
    name: String,
    enabled: bool,
    tool: ToolTarget,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), CommandError> {
    // 1. Get the config file path from saved settings
    let settings = crate::commands::config::config_load_settings()?;
    let path = match &tool {
        ToolTarget::Code => settings.code_path,
        ToolTarget::Desktop => settings.desktop_path,
    }
    .ok_or_else(|| CommandError::WriteError {
        message: format!("No path configured for {:?}", tool),
    })?;

    // 2. Read current config as raw JSON (preserves unknown fields)
    let content = std::fs::read_to_string(&path).map_err(|e| CommandError::ReadError {
        message: format!("Failed to read config: {}", e),
    })?;

    let mut json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| CommandError::ParseError {
            message: format!("Invalid JSON: {}", e),
        })?;

    // 3. Navigate to the MCP entry and update disabled field
    apply_toggle(&mut json, &name, enabled)?;

    // 4. Serialize and write via the full pipeline (auto-snapshot → validate → atomic write → emit)
    let new_content = serde_json::to_string_pretty(&json).map_err(|e| CommandError::WriteError {
        message: format!("Failed to serialize config: {}", e),
    })?;

    crate::commands::config::write_pipeline(&path, &new_content, &tool, &app, &state)?;

    Ok(())
}

/// Pure function: apply toggle to a parsed JSON value.
/// Extracted for unit testing without AppHandle.
fn apply_toggle(
    json: &mut serde_json::Value,
    name: &str,
    enabled: bool,
) -> Result<(), CommandError> {
    let mcp_servers = json
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| CommandError::WriteError {
            message: "Config has no mcpServers field".to_string(),
        })?;

    let mcp = mcp_servers
        .get_mut(name)
        .ok_or_else(|| CommandError::WriteError {
            message: format!("MCP '{}' not found in config", name),
        })?;

    if enabled {
        // Enabling: remove "disabled" key entirely (absent = enabled)
        if let Some(obj) = mcp.as_object_mut() {
            obj.remove("disabled");
        }
    } else {
        // Disabling: set "disabled": true
        if let Some(obj) = mcp.as_object_mut() {
            obj.insert("disabled".to_string(), serde_json::Value::Bool(true));
        }
    }

    Ok(())
}

/// Delete a named MCP from a config file via the full write pipeline.
/// Uses serde_json::Value to preserve unknown fields on other MCPs.
#[tauri::command]
pub fn mcp_delete(
    name: String,
    tool: ToolTarget,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), CommandError> {
    let settings = crate::commands::config::config_load_settings()?;
    let path = match &tool {
        ToolTarget::Code => settings.code_path,
        ToolTarget::Desktop => settings.desktop_path,
    }
    .ok_or_else(|| CommandError::WriteError {
        message: format!("No path configured for {:?}", tool),
    })?;

    let content = std::fs::read_to_string(&path).map_err(|e| CommandError::ReadError {
        message: format!("Failed to read config: {}", e),
    })?;

    let mut json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| CommandError::ParseError {
            message: format!("Invalid JSON: {}", e),
        })?;

    apply_delete(&mut json, &name)?;

    let new_content = serde_json::to_string_pretty(&json).map_err(|e| CommandError::WriteError {
        message: format!("Failed to serialize config: {}", e),
    })?;

    crate::commands::config::write_pipeline(&path, &new_content, &tool, &app, &state)?;

    Ok(())
}

/// Pure function: remove a named MCP from the mcpServers map.
fn apply_delete(
    json: &mut serde_json::Value,
    name: &str,
) -> Result<(), CommandError> {
    let mcp_servers = json
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| CommandError::WriteError {
            message: "Config has no mcpServers field".to_string(),
        })?;

    if mcp_servers.remove(name).is_none() {
        return Err(CommandError::WriteError {
            message: format!("MCP '{}' not found in config", name),
        });
    }

    Ok(())
}

/// Copy the entire config from one tool to another via the full write pipeline.
/// The source config is read as-is and written to the destination (auto-snapshot included).
/// Returns an error if source and destination are the same tool.
#[tauri::command]
pub fn copy_config(
    source: ToolTarget,
    destination: ToolTarget,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), CommandError> {
    if source == destination {
        return Err(CommandError::WriteError {
            message: "Source and destination cannot be the same tool".to_string(),
        });
    }

    let settings = crate::commands::config::config_load_settings()?;

    let source_path = match &source {
        ToolTarget::Code => settings.code_path.clone(),
        ToolTarget::Desktop => settings.desktop_path.clone(),
    }
    .ok_or_else(|| CommandError::WriteError {
        message: format!("No path configured for source {:?}", source),
    })?;

    let destination_path = match &destination {
        ToolTarget::Code => settings.code_path,
        ToolTarget::Desktop => settings.desktop_path,
    }
    .ok_or_else(|| CommandError::WriteError {
        message: format!("No path configured for destination {:?}", destination),
    })?;

    // Read source content as raw string — preserves exact JSON formatting
    let content = std::fs::read_to_string(&source_path).map_err(|e| CommandError::ReadError {
        message: format!("Failed to read source config: {}", e),
    })?;

    // Write to destination via full pipeline (auto-snapshot → atomic write → emit)
    crate::commands::config::write_pipeline(&destination_path, &content, &destination, &app, &state)?;

    Ok(())
}

/// Add a new MCP from a parsed snippet to a config file via the full write pipeline.
/// This is an upsert — it inserts or overwrites the named MCP in mcpServers.
/// Uses serde_json::Value to preserve unknown fields on other MCPs.
#[tauri::command]
pub fn mcp_add_from_snippet(
    name: String,
    command: String,
    args: Vec<String>,
    env: Option<HashMap<String, String>>,
    tool: ToolTarget,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), CommandError> {
    let settings = crate::commands::config::config_load_settings()?;
    let path = match &tool {
        ToolTarget::Code => settings.code_path,
        ToolTarget::Desktop => settings.desktop_path,
    }
    .ok_or_else(|| CommandError::WriteError {
        message: format!("No path configured for {:?}", tool),
    })?;

    let content = std::fs::read_to_string(&path).map_err(|e| CommandError::ReadError {
        message: format!("Failed to read config: {}", e),
    })?;

    let mut json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| CommandError::ParseError {
            message: format!("Invalid JSON: {}", e),
        })?;

    apply_add_from_snippet(&mut json, &name, &command, &args, env.as_ref())?;

    let new_content = serde_json::to_string_pretty(&json).map_err(|e| CommandError::WriteError {
        message: format!("Failed to serialize config: {}", e),
    })?;

    crate::commands::config::write_pipeline(&path, &new_content, &tool, &app, &state)?;

    Ok(())
}

/// Pure function: insert or overwrite a named MCP in the mcpServers map.
/// Extracted for unit testing without AppHandle.
fn apply_add_from_snippet(
    json: &mut serde_json::Value,
    name: &str,
    command: &str,
    args: &[String],
    env: Option<&HashMap<String, String>>,
) -> Result<(), CommandError> {
    // Ensure mcpServers exists; create it if config is empty/new
    if json.get("mcpServers").is_none() {
        json["mcpServers"] = serde_json::Value::Object(serde_json::Map::new());
    }

    let mcp_servers = json
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| CommandError::WriteError {
            message: "mcpServers field is not an object".to_string(),
        })?;

    let mut entry = serde_json::Map::new();
    entry.insert(
        "command".to_string(),
        serde_json::Value::String(command.to_string()),
    );
    entry.insert(
        "args".to_string(),
        serde_json::Value::Array(
            args.iter()
                .map(|a| serde_json::Value::String(a.clone()))
                .collect(),
        ),
    );
    if let Some(env_map) = env {
        if !env_map.is_empty() {
            let env_obj: serde_json::Map<String, serde_json::Value> = env_map
                .iter()
                .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
                .collect();
            entry.insert("env".to_string(), serde_json::Value::Object(env_obj));
        }
    }

    mcp_servers.insert(name.to_string(), serde_json::Value::Object(entry));

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_toggle_enables_mcp_removes_disabled_key() {
        let mut config = json!({
            "mcpServers": {
                "my-mcp": { "command": "node", "args": [], "disabled": true }
            }
        });
        apply_toggle(&mut config, "my-mcp", true).unwrap();
        let mcp = &config["mcpServers"]["my-mcp"];
        assert!(mcp.get("disabled").is_none(), "disabled key should be removed when enabling");
    }

    #[test]
    fn test_toggle_disables_mcp_sets_disabled_true() {
        let mut config = json!({
            "mcpServers": {
                "my-mcp": { "command": "node", "args": [] }
            }
        });
        apply_toggle(&mut config, "my-mcp", false).unwrap();
        assert_eq!(config["mcpServers"]["my-mcp"]["disabled"], json!(true));
    }

    #[test]
    fn test_toggle_preserves_unknown_fields() {
        let mut config = json!({
            "mcpServers": {
                "my-mcp": {
                    "command": "node",
                    "args": [],
                    "type": "stdio",
                    "customField": "some-value"
                }
            }
        });
        apply_toggle(&mut config, "my-mcp", false).unwrap();
        assert_eq!(config["mcpServers"]["my-mcp"]["type"], json!("stdio"));
        assert_eq!(config["mcpServers"]["my-mcp"]["customField"], json!("some-value"));
        assert_eq!(config["mcpServers"]["my-mcp"]["disabled"], json!(true));
    }

    #[test]
    fn test_toggle_returns_error_for_missing_mcp() {
        let mut config = json!({
            "mcpServers": {
                "other-mcp": { "command": "node", "args": [] }
            }
        });
        let result = apply_toggle(&mut config, "nonexistent-mcp", true);
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("nonexistent-mcp"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    #[test]
    fn test_toggle_returns_error_when_no_mcp_servers_field() {
        let mut config = json!({ "otherField": "value" });
        let result = apply_toggle(&mut config, "any-mcp", true);
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("mcpServers"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    #[test]
    fn test_toggle_enable_when_already_enabled_is_noop() {
        let mut config = json!({
            "mcpServers": {
                "my-mcp": { "command": "node", "args": [] }
            }
        });
        apply_toggle(&mut config, "my-mcp", true).unwrap();
        // disabled should still not be present
        assert!(config["mcpServers"]["my-mcp"].get("disabled").is_none());
    }

    // apply_delete tests (Story 2.5)

    #[test]
    fn test_delete_removes_mcp() {
        let mut config = json!({
            "mcpServers": {
                "target-mcp": { "command": "node", "args": [] },
                "other-mcp": { "command": "python", "args": [] }
            }
        });
        apply_delete(&mut config, "target-mcp").unwrap();
        assert!(config["mcpServers"].get("target-mcp").is_none());
    }

    #[test]
    fn test_delete_preserves_other_mcps() {
        let mut config = json!({
            "mcpServers": {
                "target-mcp": { "command": "node", "args": [] },
                "other-mcp": { "command": "python", "args": [] }
            }
        });
        apply_delete(&mut config, "target-mcp").unwrap();
        assert!(config["mcpServers"].get("other-mcp").is_some());
        assert_eq!(config["mcpServers"]["other-mcp"]["command"], json!("python"));
    }

    #[test]
    fn test_delete_returns_error_for_missing_mcp() {
        let mut config = json!({
            "mcpServers": {
                "other-mcp": { "command": "node", "args": [] }
            }
        });
        let result = apply_delete(&mut config, "nonexistent-mcp");
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("nonexistent-mcp"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    #[test]
    fn test_delete_returns_error_when_no_mcp_servers() {
        let mut config = json!({ "otherField": "value" });
        let result = apply_delete(&mut config, "any-mcp");
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("mcpServers"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    // apply_add_from_snippet tests (Story 6.2)

    #[test]
    fn test_add_inserts_new_mcp() {
        let mut config = json!({ "mcpServers": {} });
        apply_add_from_snippet(&mut config, "new-mcp", "node", &["index.js".to_string()], None)
            .unwrap();
        assert_eq!(config["mcpServers"]["new-mcp"]["command"], json!("node"));
        assert_eq!(config["mcpServers"]["new-mcp"]["args"], json!(["index.js"]));
    }

    #[test]
    fn test_add_overwrites_existing_mcp() {
        let mut config = json!({
            "mcpServers": {
                "my-mcp": { "command": "old-command", "args": ["old-arg"] }
            }
        });
        apply_add_from_snippet(&mut config, "my-mcp", "new-command", &["new-arg".to_string()], None)
            .unwrap();
        assert_eq!(config["mcpServers"]["my-mcp"]["command"], json!("new-command"));
        assert_eq!(config["mcpServers"]["my-mcp"]["args"], json!(["new-arg"]));
    }

    #[test]
    fn test_add_preserves_other_mcps() {
        let mut config = json!({
            "mcpServers": {
                "other-mcp": { "command": "python", "args": ["-m", "server"] }
            }
        });
        apply_add_from_snippet(&mut config, "new-mcp", "node", &[], None).unwrap();
        assert_eq!(config["mcpServers"]["other-mcp"]["command"], json!("python"));
    }

    #[test]
    fn test_add_with_env() {
        let mut env = HashMap::new();
        env.insert("GITHUB_TOKEN".to_string(), "abc123".to_string());
        let mut config = json!({ "mcpServers": {} });
        apply_add_from_snippet(&mut config, "my-mcp", "node", &[], Some(&env)).unwrap();
        assert_eq!(config["mcpServers"]["my-mcp"]["env"]["GITHUB_TOKEN"], json!("abc123"));
    }

    #[test]
    fn test_add_without_env_omits_env_key() {
        let mut config = json!({ "mcpServers": {} });
        apply_add_from_snippet(&mut config, "my-mcp", "node", &[], None).unwrap();
        assert!(config["mcpServers"]["my-mcp"].get("env").is_none());
    }

    #[test]
    fn test_add_creates_mcp_servers_if_absent() {
        let mut config = json!({});
        apply_add_from_snippet(&mut config, "new-mcp", "node", &[], None).unwrap();
        assert_eq!(config["mcpServers"]["new-mcp"]["command"], json!("node"));
    }

    #[test]
    fn test_add_returns_error_when_mcp_servers_is_not_object() {
        let mut config = json!({ "mcpServers": "bad-value" });
        let result = apply_add_from_snippet(&mut config, "new-mcp", "node", &[], None);
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("mcpServers"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    #[test]
    fn test_add_empty_env_map_omits_env_key() {
        let env: HashMap<String, String> = HashMap::new();
        let mut config = json!({ "mcpServers": {} });
        apply_add_from_snippet(&mut config, "my-mcp", "node", &[], Some(&env)).unwrap();
        assert!(config["mcpServers"]["my-mcp"].get("env").is_none());
    }
}
