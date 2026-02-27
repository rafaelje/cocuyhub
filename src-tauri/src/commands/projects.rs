use crate::errors::CommandError;
use crate::models::ToolTarget;
use crate::AppState;
use std::collections::HashMap;

fn get_project_mut<'a>(
    json: &'a mut serde_json::Value,
    project_path: &str,
) -> Result<&'a mut serde_json::Value, CommandError> {
    json.get_mut("projects")
        .and_then(|v| v.as_object_mut())
        .and_then(|m| m.get_mut(project_path))
        .ok_or_else(|| CommandError::WriteError {
            message: format!("Project '{}' not found in config", project_path),
        })
}

fn read_code_json(
    state: &tauri::State<AppState>,
) -> Result<(String, serde_json::Value), CommandError> {
    let settings = crate::commands::config::config_load_settings()?;
    let path = settings.code_path.ok_or_else(|| CommandError::WriteError {
        message: "No path configured for Code".to_string(),
    })?;
    let content = std::fs::read_to_string(&path).map_err(|e| CommandError::ReadError {
        message: format!("Failed to read config: {}", e),
    })?;
    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| CommandError::ParseError {
            message: format!("Invalid JSON: {}", e),
        })?;
    let _ = state; // state is used via write_pipeline
    Ok((path, json))
}

fn write_code_json(
    path: &str,
    json: &serde_json::Value,
    app: &tauri::AppHandle,
    state: &tauri::State<AppState>,
) -> Result<(), CommandError> {
    let new_content = serde_json::to_string_pretty(json).map_err(|e| CommandError::WriteError {
        message: format!("Failed to serialize config: {}", e),
    })?;
    crate::commands::config::write_pipeline(path, &new_content, &ToolTarget::Code, app, state)
}

// ── project_mcp_toggle ────────────────────────────────────────────────────────

#[tauri::command]
pub fn project_mcp_toggle(
    name: String,
    enabled: bool,
    project_path: String,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), CommandError> {
    let (path, mut json) = read_code_json(&state)?;
    apply_project_toggle(&mut json, &name, enabled, &project_path)?;
    write_code_json(&path, &json, &app, &state)
}

fn apply_project_toggle(
    json: &mut serde_json::Value,
    name: &str,
    enabled: bool,
    project_path: &str,
) -> Result<(), CommandError> {
    let project = get_project_mut(json, project_path)?;
    crate::commands::mcp::apply_toggle(project, name, enabled)
}

// ── project_mcp_delete ────────────────────────────────────────────────────────

#[tauri::command]
pub fn project_mcp_delete(
    name: String,
    project_path: String,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), CommandError> {
    let (path, mut json) = read_code_json(&state)?;
    apply_project_delete(&mut json, &name, &project_path)?;
    write_code_json(&path, &json, &app, &state)
}

fn apply_project_delete(
    json: &mut serde_json::Value,
    name: &str,
    project_path: &str,
) -> Result<(), CommandError> {
    let project = get_project_mut(json, project_path)?;
    crate::commands::mcp::apply_delete(project, name)
}

// ── project_mcp_rename ────────────────────────────────────────────────────────

#[tauri::command]
pub fn project_mcp_rename(
    old_name: String,
    new_name: String,
    project_path: String,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), CommandError> {
    let (path, mut json) = read_code_json(&state)?;
    apply_project_rename(&mut json, &old_name, &new_name, &project_path)?;
    write_code_json(&path, &json, &app, &state)
}

fn apply_project_rename(
    json: &mut serde_json::Value,
    old_name: &str,
    new_name: &str,
    project_path: &str,
) -> Result<(), CommandError> {
    let project = get_project_mut(json, project_path)?;
    crate::commands::mcp::apply_rename(project, old_name, new_name)
}

// ── project_mcp_set_description ───────────────────────────────────────────────

#[tauri::command]
pub fn project_mcp_set_description(
    name: String,
    description: Option<String>,
    project_path: String,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), CommandError> {
    let (path, mut json) = read_code_json(&state)?;
    apply_project_set_description(&mut json, &name, description.as_deref(), &project_path)?;
    write_code_json(&path, &json, &app, &state)
}

fn apply_project_set_description(
    json: &mut serde_json::Value,
    name: &str,
    description: Option<&str>,
    project_path: &str,
) -> Result<(), CommandError> {
    let project = get_project_mut(json, project_path)?;
    crate::commands::mcp::apply_set_description(project, name, description)
}

// ── project_mcp_add ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn project_mcp_add(
    name: String,
    command: String,
    args: Vec<String>,
    env: Option<HashMap<String, String>>,
    project_path: String,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), CommandError> {
    let (path, mut json) = read_code_json(&state)?;
    apply_project_add(&mut json, &name, &command, &args, env.as_ref(), &project_path)?;
    write_code_json(&path, &json, &app, &state)
}

fn apply_project_add(
    json: &mut serde_json::Value,
    name: &str,
    command: &str,
    args: &[String],
    env: Option<&HashMap<String, String>>,
    project_path: &str,
) -> Result<(), CommandError> {
    // Ensure projects object exists
    if json.get("projects").is_none() {
        json["projects"] = serde_json::Value::Object(serde_json::Map::new());
    }
    let projects = json
        .get_mut("projects")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| CommandError::WriteError {
            message: "projects field is not an object".to_string(),
        })?;

    // Ensure the specific project key exists
    if !projects.contains_key(project_path) {
        projects.insert(
            project_path.to_string(),
            serde_json::Value::Object(serde_json::Map::new()),
        );
    }

    let project = projects
        .get_mut(project_path)
        .ok_or_else(|| CommandError::WriteError {
            message: format!("Project '{}' not found in config", project_path),
        })?;

    crate::commands::mcp::apply_add_from_snippet(project, name, command, args, env)
}

// ── project_delete ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn project_delete(
    project_path: String,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), CommandError> {
    let (path, mut json) = read_code_json(&state)?;
    apply_project_delete_key(&mut json, &project_path)?;
    write_code_json(&path, &json, &app, &state)
}

fn apply_project_delete_key(
    json: &mut serde_json::Value,
    project_path: &str,
) -> Result<(), CommandError> {
    let removed = json
        .get_mut("projects")
        .and_then(|v| v.as_object_mut())
        .map(|m| m.remove(project_path).is_some())
        .unwrap_or(false);

    if removed {
        Ok(())
    } else {
        Err(CommandError::WriteError {
            message: format!("Project '{}' not found in config", project_path),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn config_with_project() -> serde_json::Value {
        json!({
            "mcpServers": {},
            "projects": {
                "/Users/rafa/myproject": {
                    "mcpServers": {
                        "my-mcp": { "command": "node", "args": [] }
                    }
                }
            }
        })
    }

    fn config_with_project_disabled() -> serde_json::Value {
        json!({
            "mcpServers": {},
            "projects": {
                "/Users/rafa/myproject": {
                    "mcpServers": {},
                    "disabledMcps": {
                        "my-mcp": { "command": "node", "args": [] }
                    }
                }
            }
        })
    }

    // get_project_mut tests

    #[test]
    fn test_get_project_mut_returns_error_when_projects_missing() {
        let mut json = json!({ "mcpServers": {} });
        let result = get_project_mut(&mut json, "/nonexistent");
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("/nonexistent"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    #[test]
    fn test_get_project_mut_returns_error_when_project_path_not_found() {
        let mut json = config_with_project();
        let result = get_project_mut(&mut json, "/not/a/real/path");
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("/not/a/real/path"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    // apply_project_toggle tests

    #[test]
    fn test_apply_project_toggle_delegates_to_mcp_toggle() {
        let mut json = config_with_project();
        apply_project_toggle(&mut json, "my-mcp", false, "/Users/rafa/myproject").unwrap();
        assert!(
            json["projects"]["/Users/rafa/myproject"]["mcpServers"]
                .get("my-mcp")
                .is_none()
        );
        assert!(
            json["projects"]["/Users/rafa/myproject"]["disabledMcps"]
                .get("my-mcp")
                .is_some()
        );
    }

    #[test]
    fn test_apply_project_toggle_returns_error_for_missing_project() {
        let mut json = config_with_project();
        let result = apply_project_toggle(&mut json, "my-mcp", false, "/nonexistent");
        assert!(result.is_err());
    }

    // apply_project_delete tests

    #[test]
    fn test_apply_project_delete_delegates_to_mcp_delete() {
        let mut json = config_with_project();
        apply_project_delete(&mut json, "my-mcp", "/Users/rafa/myproject").unwrap();
        assert!(
            json["projects"]["/Users/rafa/myproject"]["mcpServers"]
                .get("my-mcp")
                .is_none()
        );
    }

    #[test]
    fn test_apply_project_delete_returns_error_for_missing_project() {
        let mut json = config_with_project();
        let result = apply_project_delete(&mut json, "my-mcp", "/nonexistent");
        assert!(result.is_err());
    }

    // apply_project_rename tests

    #[test]
    fn test_apply_project_rename_delegates_to_mcp_rename() {
        let mut json = config_with_project();
        apply_project_rename(&mut json, "my-mcp", "new-name", "/Users/rafa/myproject").unwrap();
        assert!(
            json["projects"]["/Users/rafa/myproject"]["mcpServers"]
                .get("my-mcp")
                .is_none()
        );
        assert!(
            json["projects"]["/Users/rafa/myproject"]["mcpServers"]
                .get("new-name")
                .is_some()
        );
    }

    #[test]
    fn test_apply_project_rename_returns_error_for_missing_project() {
        let mut json = config_with_project();
        let result = apply_project_rename(&mut json, "my-mcp", "new-name", "/nonexistent");
        assert!(result.is_err());
    }

    // apply_project_set_description tests

    #[test]
    fn test_apply_project_set_description_delegates_to_mcp_set_description() {
        let mut json = config_with_project();
        apply_project_set_description(
            &mut json,
            "my-mcp",
            Some("A description"),
            "/Users/rafa/myproject",
        )
        .unwrap();
        assert_eq!(
            json["projects"]["/Users/rafa/myproject"]["mcpServers"]["my-mcp"]["_description"],
            json!("A description")
        );
    }

    #[test]
    fn test_apply_project_set_description_returns_error_for_missing_project() {
        let mut json = config_with_project();
        let result =
            apply_project_set_description(&mut json, "my-mcp", Some("desc"), "/nonexistent");
        assert!(result.is_err());
    }

    // apply_project_add tests

    #[test]
    fn test_apply_project_add_creates_project_if_absent() {
        let mut json = json!({
            "mcpServers": {},
            "projects": {}
        });
        apply_project_add(
            &mut json,
            "new-mcp",
            "node",
            &["index.js".to_string()],
            None,
            "/Users/rafa/newproject",
        )
        .unwrap();
        assert_eq!(
            json["projects"]["/Users/rafa/newproject"]["mcpServers"]["new-mcp"]["command"],
            json!("node")
        );
    }

    #[test]
    fn test_apply_project_add_creates_projects_section_if_absent() {
        let mut json = json!({ "mcpServers": {} });
        apply_project_add(
            &mut json,
            "new-mcp",
            "node",
            &[],
            None,
            "/Users/rafa/myproject",
        )
        .unwrap();
        assert!(json.get("projects").is_some());
        assert_eq!(
            json["projects"]["/Users/rafa/myproject"]["mcpServers"]["new-mcp"]["command"],
            json!("node")
        );
    }

    // apply_project_delete_key tests

    #[test]
    fn test_apply_project_delete_key_removes_project_entry() {
        let mut json = config_with_project();
        apply_project_delete_key(&mut json, "/Users/rafa/myproject").unwrap();
        assert!(json["projects"]
            .as_object()
            .unwrap()
            .get("/Users/rafa/myproject")
            .is_none());
    }

    #[test]
    fn test_apply_project_delete_key_returns_error_when_not_found() {
        let mut json = config_with_project();
        let result = apply_project_delete_key(&mut json, "/nonexistent");
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("/nonexistent"));
            }
            other => panic!("Expected WriteError, got {:?}", other),
        }
    }

    #[test]
    fn test_apply_project_delete_key_preserves_other_projects() {
        let mut json = json!({
            "mcpServers": {},
            "projects": {
                "/Users/rafa/project-a": {
                    "mcpServers": { "mcp-a": { "command": "node", "args": [] } }
                },
                "/Users/rafa/project-b": {
                    "mcpServers": { "mcp-b": { "command": "python", "args": [] } }
                }
            }
        });
        apply_project_delete_key(&mut json, "/Users/rafa/project-a").unwrap();
        assert!(json["projects"]
            .as_object()
            .unwrap()
            .get("/Users/rafa/project-a")
            .is_none());
        assert!(json["projects"]
            .as_object()
            .unwrap()
            .get("/Users/rafa/project-b")
            .is_some());
    }

    // Extra: disabled mcp in project toggle
    #[test]
    fn test_apply_project_toggle_enables_from_disabled() {
        let mut json = config_with_project_disabled();
        apply_project_toggle(&mut json, "my-mcp", true, "/Users/rafa/myproject").unwrap();
        assert!(
            json["projects"]["/Users/rafa/myproject"]["mcpServers"]
                .get("my-mcp")
                .is_some()
        );
        assert!(
            json["projects"]["/Users/rafa/myproject"]["disabledMcps"]
                .get("my-mcp")
                .is_none()
        );
    }
}
