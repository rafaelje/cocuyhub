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
/// Moves the MCP entry between `mcpServers` (enabled) and `disabledMcps` (disabled).
/// Extracted for unit testing without AppHandle.
fn apply_toggle(
    json: &mut serde_json::Value,
    name: &str,
    enabled: bool,
) -> Result<(), CommandError> {
    if enabled {
        // No-op if already in mcpServers
        if json
            .get("mcpServers")
            .and_then(|v| v.as_object())
            .map(|m| m.contains_key(name))
            .unwrap_or(false)
        {
            return Ok(());
        }
        // Move from disabledMcps → mcpServers
        let entry = json
            .get_mut("disabledMcps")
            .and_then(|v| v.as_object_mut())
            .and_then(|m| m.remove(name))
            .ok_or_else(|| CommandError::WriteError {
                message: format!("MCP '{}' not found in disabledMcps", name),
            })?;
        if json.get("mcpServers").is_none() {
            json["mcpServers"] = serde_json::Value::Object(serde_json::Map::new());
        }
        json["mcpServers"]
            .as_object_mut()
            .ok_or_else(|| CommandError::WriteError {
                message: "mcpServers is not an object".to_string(),
            })?
            .insert(name.to_string(), entry);
    } else {
        // Move from mcpServers → disabledMcps
        let entry = json
            .get_mut("mcpServers")
            .and_then(|v| v.as_object_mut())
            .and_then(|m| m.remove(name))
            .ok_or_else(|| CommandError::WriteError {
                message: format!("MCP '{}' not found in mcpServers", name),
            })?;
        if json.get("disabledMcps").is_none() {
            json["disabledMcps"] = serde_json::Value::Object(serde_json::Map::new());
        }
        json["disabledMcps"]
            .as_object_mut()
            .ok_or_else(|| CommandError::WriteError {
                message: "disabledMcps is not an object".to_string(),
            })?
            .insert(name.to_string(), entry);
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

/// Pure function: remove a named MCP from mcpServers or disabledMcps.
/// Searches mcpServers first, then disabledMcps. Returns error if not found in either.
fn apply_delete(
    json: &mut serde_json::Value,
    name: &str,
) -> Result<(), CommandError> {
    // Try mcpServers first
    let removed_active = json
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
        .map(|m| m.remove(name).is_some())
        .unwrap_or(false);

    if removed_active {
        return Ok(());
    }

    // Try disabledMcps
    let removed_disabled = json
        .get_mut("disabledMcps")
        .and_then(|v| v.as_object_mut())
        .map(|m| m.remove(name).is_some())
        .unwrap_or(false);

    if removed_disabled {
        return Ok(());
    }

    Err(CommandError::WriteError {
        message: format!("MCP '{}' not found in config", name),
    })
}


/// Rename a named MCP in a config file via the full write pipeline.
/// Searches mcpServers first, then disabledMcps. Preserves all original fields.
#[tauri::command]
pub fn mcp_rename(
    old_name: String,
    new_name: String,
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

    apply_rename(&mut json, &old_name, &new_name)?;

    let new_content = serde_json::to_string_pretty(&json).map_err(|e| CommandError::WriteError {
        message: format!("Failed to serialize config: {}", e),
    })?;

    crate::commands::config::write_pipeline(&path, &new_content, &tool, &app, &state)?;

    Ok(())
}

/// Pure function: rename an MCP entry key in mcpServers or disabledMcps.
/// Searches mcpServers first, then disabledMcps.
/// Returns WriteError if old_name is not found, or if new_name already exists in either node.
fn apply_rename(
    json: &mut serde_json::Value,
    old_name: &str,
    new_name: &str,
) -> Result<(), CommandError> {
    // F4: server-side validation — reject empty or non-alphanumeric names
    if new_name.is_empty() {
        return Err(CommandError::WriteError {
            message: "MCP name cannot be empty".to_string(),
        });
    }
    if !new_name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(CommandError::WriteError {
            message: "MCP name can only contain letters, numbers, hyphens and underscores"
                .to_string(),
        });
    }

    // F6: no-op if old_name == new_name — avoids unnecessary write pipeline execution
    if old_name == new_name {
        return Err(CommandError::WriteError {
            message: format!("MCP '{}' already exists in config", new_name),
        });
    }

    // Check collision: new_name must not already exist in either node
    let new_exists_in_active = json
        .get("mcpServers")
        .and_then(|v| v.as_object())
        .map(|m| m.contains_key(new_name))
        .unwrap_or(false);

    let new_exists_in_disabled = json
        .get("disabledMcps")
        .and_then(|v| v.as_object())
        .map(|m| m.contains_key(new_name))
        .unwrap_or(false);

    if new_exists_in_active || new_exists_in_disabled {
        return Err(CommandError::WriteError {
            message: format!("MCP '{}' already exists in config", new_name),
        });
    }

    // Try mcpServers first
    let entry_from_active = json
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
        .and_then(|m| m.remove(old_name));

    if let Some(entry) = entry_from_active {
        json["mcpServers"]
            .as_object_mut()
            .ok_or_else(|| CommandError::WriteError {
                message: "mcpServers is not an object".to_string(),
            })?
            .insert(new_name.to_string(), entry);
        return Ok(());
    }

    // Try disabledMcps
    let entry_from_disabled = json
        .get_mut("disabledMcps")
        .and_then(|v| v.as_object_mut())
        .and_then(|m| m.remove(old_name));

    if let Some(entry) = entry_from_disabled {
        json["disabledMcps"]
            .as_object_mut()
            .ok_or_else(|| CommandError::WriteError {
                message: "disabledMcps is not an object".to_string(),
            })?
            .insert(new_name.to_string(), entry);
        return Ok(());
    }

    Err(CommandError::WriteError {
        message: format!("MCP '{}' not found in config", old_name),
    })
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

    // apply_toggle tests

    #[test]
    fn test_toggle_disables_mcp_moves_to_disabled_node() {
        let mut config = json!({
            "mcpServers": {
                "my-mcp": { "command": "node", "args": [] }
            }
        });
        apply_toggle(&mut config, "my-mcp", false).unwrap();
        assert!(config["mcpServers"].get("my-mcp").is_none(), "MCP should be removed from mcpServers");
        assert!(config["disabledMcps"].get("my-mcp").is_some(), "MCP should appear in disabledMcps");
    }

    #[test]
    fn test_toggle_enables_mcp_moves_to_active_node() {
        let mut config = json!({
            "mcpServers": {},
            "disabledMcps": {
                "my-mcp": { "command": "node", "args": [] }
            }
        });
        apply_toggle(&mut config, "my-mcp", true).unwrap();
        assert!(config["disabledMcps"].get("my-mcp").is_none(), "MCP should be removed from disabledMcps");
        assert!(config["mcpServers"].get("my-mcp").is_some(), "MCP should appear in mcpServers");
    }

    #[test]
    fn test_toggle_creates_disabled_mcps_node_if_absent() {
        let mut config = json!({
            "mcpServers": {
                "my-mcp": { "command": "node", "args": [] }
            }
        });
        assert!(config.get("disabledMcps").is_none());
        apply_toggle(&mut config, "my-mcp", false).unwrap();
        assert!(config.get("disabledMcps").is_some(), "disabledMcps node should be created");
    }

    #[test]
    fn test_toggle_preserves_all_mcp_fields_when_moving() {
        let mut config = json!({
            "mcpServers": {
                "my-mcp": {
                    "command": "python",
                    "args": ["-m", "server"],
                    "env": { "TOKEN": "abc123" }
                }
            }
        });
        apply_toggle(&mut config, "my-mcp", false).unwrap();
        let mcp = &config["disabledMcps"]["my-mcp"];
        assert_eq!(mcp["command"], json!("python"));
        assert_eq!(mcp["args"], json!(["-m", "server"]));
        assert_eq!(mcp["env"]["TOKEN"], json!("abc123"));
    }

    #[test]
    fn test_toggle_disable_returns_error_if_mcp_not_in_active() {
        let mut config = json!({
            "mcpServers": {
                "other-mcp": { "command": "node", "args": [] }
            }
        });
        let result = apply_toggle(&mut config, "nonexistent-mcp", false);
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("nonexistent-mcp"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    #[test]
    fn test_toggle_enable_returns_error_if_not_in_either_node() {
        let mut config = json!({
            "mcpServers": {},
            "disabledMcps": {}
        });
        let result = apply_toggle(&mut config, "ghost-mcp", true);
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("ghost-mcp"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    #[test]
    fn test_toggle_enable_is_noop_if_already_in_mcpservers() {
        let mut config = json!({
            "mcpServers": {
                "my-mcp": { "command": "node", "args": [] }
            }
        });
        let result = apply_toggle(&mut config, "my-mcp", true);
        assert!(result.is_ok(), "should be a no-op Ok(())");
        assert!(config["mcpServers"].get("my-mcp").is_some(), "MCP should still be in mcpServers");
    }

    #[test]
    fn test_toggle_preserves_other_active_mcps() {
        let mut config = json!({
            "mcpServers": {
                "my-mcp": { "command": "node", "args": [] },
                "other-mcp": { "command": "python", "args": ["-m", "server"] }
            }
        });
        apply_toggle(&mut config, "my-mcp", false).unwrap();
        assert!(config["mcpServers"].get("my-mcp").is_none());
        assert!(config["mcpServers"].get("other-mcp").is_some(), "other MCPs should be untouched");
        assert_eq!(config["mcpServers"]["other-mcp"]["command"], json!("python"));
    }

    // apply_delete tests

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
                assert!(message.contains("any-mcp"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    #[test]
    fn test_delete_removes_from_disabled_mcps() {
        let mut config = json!({
            "mcpServers": {},
            "disabledMcps": {
                "my-mcp": { "command": "node", "args": [] }
            }
        });
        apply_delete(&mut config, "my-mcp").unwrap();
        assert!(config["disabledMcps"].get("my-mcp").is_none(), "MCP should be removed from disabledMcps");
    }

    #[test]
    fn test_delete_returns_error_when_not_in_either_node() {
        let mut config = json!({
            "mcpServers": {},
            "disabledMcps": {}
        });
        let result = apply_delete(&mut config, "ghost-mcp");
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("ghost-mcp"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    // apply_rename tests

    #[test]
    fn test_rename_in_mcp_servers() {
        let mut config = json!({
            "mcpServers": {
                "old-name": { "command": "node", "args": ["index.js"] }
            }
        });
        apply_rename(&mut config, "old-name", "new-name").unwrap();
        assert!(config["mcpServers"].get("old-name").is_none(), "old key should be gone");
        assert!(config["mcpServers"].get("new-name").is_some(), "new key should exist");
    }

    #[test]
    fn test_rename_in_disabled_mcps() {
        let mut config = json!({
            "mcpServers": {},
            "disabledMcps": {
                "old-name": { "command": "node", "args": [] }
            }
        });
        apply_rename(&mut config, "old-name", "new-name").unwrap();
        assert!(config["disabledMcps"].get("old-name").is_none(), "old key should be gone from disabledMcps");
        assert!(config["disabledMcps"].get("new-name").is_some(), "new key should exist in disabledMcps");
    }

    #[test]
    fn test_rename_returns_error_if_old_name_not_found() {
        let mut config = json!({
            "mcpServers": {},
            "disabledMcps": {}
        });
        let result = apply_rename(&mut config, "nonexistent", "new-name");
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("nonexistent"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    #[test]
    fn test_rename_returns_error_when_no_sections_present() {
        let mut config = json!({});
        let result = apply_rename(&mut config, "any-mcp", "new-name");
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("any-mcp"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    #[test]
    fn test_rename_returns_error_for_empty_new_name() {
        let mut config = json!({
            "mcpServers": { "my-mcp": { "command": "node", "args": [] } }
        });
        let result = apply_rename(&mut config, "my-mcp", "");
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("empty"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    #[test]
    fn test_rename_returns_error_for_invalid_characters_in_new_name() {
        let mut config = json!({
            "mcpServers": { "my-mcp": { "command": "node", "args": [] } }
        });
        let result = apply_rename(&mut config, "my-mcp", "bad name");
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("letters"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    #[test]
    fn test_rename_returns_error_if_new_name_exists_in_mcp_servers() {
        let mut config = json!({
            "mcpServers": {
                "old-name": { "command": "node", "args": [] },
                "existing": { "command": "python", "args": [] }
            }
        });
        let result = apply_rename(&mut config, "old-name", "existing");
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("existing"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    #[test]
    fn test_rename_returns_error_if_new_name_exists_in_disabled_mcps() {
        let mut config = json!({
            "mcpServers": {
                "old-name": { "command": "node", "args": [] }
            },
            "disabledMcps": {
                "disabled-one": { "command": "python", "args": [] }
            }
        });
        let result = apply_rename(&mut config, "old-name", "disabled-one");
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("disabled-one"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    #[test]
    fn test_rename_preserves_all_fields() {
        let mut config = json!({
            "mcpServers": {
                "old-name": {
                    "command": "python",
                    "args": ["-m", "server"],
                    "env": { "TOKEN": "abc123" }
                }
            }
        });
        apply_rename(&mut config, "old-name", "new-name").unwrap();
        let mcp = &config["mcpServers"]["new-name"];
        assert_eq!(mcp["command"], json!("python"));
        assert_eq!(mcp["args"], json!(["-m", "server"]));
        assert_eq!(mcp["env"]["TOKEN"], json!("abc123"));
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
