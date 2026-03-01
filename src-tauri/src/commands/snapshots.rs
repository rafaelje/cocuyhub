use crate::errors::CommandError;
use crate::models::{Snapshot, SnapshotCreatedEvent, ToolTarget};
use crate::AppState;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use uuid::Uuid;

/// Returns the snapshots directory for the given tool:
/// ~/Library/Application Support/CocuyHub/snapshots/{code|desktop}/
fn snapshots_dir(tool: &ToolTarget) -> Result<PathBuf, CommandError> {
    let home = std::env::var("HOME").map_err(|_| CommandError::SnapshotError {
        message: "Cannot determine HOME directory".to_string(),
    })?;
    let tool_str = match tool {
        ToolTarget::Code => "code",
        ToolTarget::Desktop => "desktop",
    };
    Ok(PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("CocuyHub")
        .join("snapshots")
        .join(tool_str))
}

/// Get current timestamp in milliseconds since epoch as a string.
fn current_timestamp_ms() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}

/// Internal helper: create an auto-snapshot before writing a config file.
/// Not a Tauri command — called internally by config_write_file and mcp commands.
pub fn create_auto_snapshot(
    path: &str,
    tool: &ToolTarget,
    app: &tauri::AppHandle,
) -> Result<String, CommandError> {
    // Read current file content
    let content = std::fs::read_to_string(path).map_err(|e| CommandError::SnapshotError {
        message: format!("Failed to read file for snapshot: {}", e),
    })?;

    let id = Uuid::new_v4().to_string();
    let timestamp = current_timestamp_ms();
    let name = "auto";

    let snapshot = Snapshot {
        id: id.clone(),
        name: name.to_string(),
        timestamp: timestamp.clone(),
        tool: tool.clone(),
        content,
        is_auto: true,
    };

    // Ensure snapshot directory exists
    let dir = snapshots_dir(tool)?;
    std::fs::create_dir_all(&dir).map_err(|e| CommandError::SnapshotError {
        message: format!("Failed to create snapshots directory: {}", e),
    })?;

    // Filename: {timestamp}_{name}.json
    let filename = format!("{}_{}.json", timestamp, name);
    let file_path = dir.join(&filename);

    let json = serde_json::to_string_pretty(&snapshot).map_err(|e| CommandError::SnapshotError {
        message: format!("Failed to serialize snapshot: {}", e),
    })?;

    std::fs::write(&file_path, json).map_err(|e| CommandError::SnapshotError {
        message: format!("Failed to write snapshot file: {}", e),
    })?;

    // Emit snapshot created event
    let _ = app.emit(
        "snapshot://created",
        &SnapshotCreatedEvent {
            tool: tool.clone(),
            snapshot_id: id.clone(),
        },
    );

    Ok(id)
}

/// Create a named snapshot for a tool.
#[tauri::command]
pub fn snapshot_create(
    name: String,
    tool: ToolTarget,
    is_auto: bool,
    content: String,
    app: tauri::AppHandle,
) -> Result<Snapshot, CommandError> {
    let id = Uuid::new_v4().to_string();
    let timestamp = current_timestamp_ms();

    let snapshot = Snapshot {
        id: id.clone(),
        name: name.clone(),
        timestamp: timestamp.clone(),
        tool: tool.clone(),
        content,
        is_auto,
    };

    let dir = snapshots_dir(&tool)?;
    std::fs::create_dir_all(&dir).map_err(|e| CommandError::SnapshotError {
        message: format!("Failed to create snapshots directory: {}", e),
    })?;

    // Sanitize name for filename
    let safe_name = name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|', ' '], "_");
    let filename = format!("{}_{}.json", timestamp, safe_name);
    let file_path = dir.join(&filename);

    let json = serde_json::to_string_pretty(&snapshot).map_err(|e| CommandError::SnapshotError {
        message: format!("Failed to serialize snapshot: {}", e),
    })?;

    std::fs::write(&file_path, json).map_err(|e| CommandError::SnapshotError {
        message: format!("Failed to write snapshot file: {}", e),
    })?;

    let _ = app.emit(
        "snapshot://created",
        &SnapshotCreatedEvent {
            tool: tool.clone(),
            snapshot_id: id.clone(),
        },
    );

    Ok(snapshot)
}

/// List all snapshots, optionally filtered by tool.
/// Returns sorted by timestamp descending (newest first).
#[tauri::command]
pub fn snapshot_list(tool: Option<ToolTarget>) -> Result<Vec<Snapshot>, CommandError> {
    let tools = match &tool {
        Some(t) => vec![t.clone()],
        None => vec![ToolTarget::Code, ToolTarget::Desktop],
    };

    let mut snapshots = Vec::new();

    for t in &tools {
        let dir = snapshots_dir(t)?;
        if !dir.exists() {
            continue;
        }

        let entries = std::fs::read_dir(&dir).map_err(|e| CommandError::SnapshotError {
            message: format!("Failed to read snapshots directory: {}", e),
        })?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }

            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    match serde_json::from_str::<Snapshot>(&content) {
                        Ok(snapshot) => snapshots.push(snapshot),
                        Err(_) => {
                            // Skip malformed snapshot files
                            continue;
                        }
                    }
                }
                Err(_) => continue,
            }
        }
    }

    // Sort by timestamp descending (newest first)
    // Timestamps are milliseconds as string — lexicographic sort works for same-length strings
    // but to be safe, parse as u128
    snapshots.sort_by(|a, b| {
        let ta = a.timestamp.parse::<u128>().unwrap_or(0);
        let tb = b.timestamp.parse::<u128>().unwrap_or(0);
        tb.cmp(&ta)
    });

    Ok(snapshots)
}

/// Restore a snapshot by writing its content back to the config file.
#[tauri::command]
pub fn snapshot_restore(
    snapshot_id: String,
    tool: ToolTarget,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), CommandError> {
    // Find the snapshot file
    let dir = snapshots_dir(&tool)?;
    if !dir.exists() {
        return Err(CommandError::SnapshotError {
            message: format!("No snapshots found for tool"),
        });
    }

    let entries = std::fs::read_dir(&dir).map_err(|e| CommandError::SnapshotError {
        message: format!("Failed to read snapshots directory: {}", e),
    })?;

    let mut found_snapshot: Option<Snapshot> = None;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        match std::fs::read_to_string(&path) {
            Ok(content) => {
                if let Ok(snapshot) = serde_json::from_str::<Snapshot>(&content) {
                    if snapshot.id == snapshot_id {
                        found_snapshot = Some(snapshot);
                        break;
                    }
                }
            }
            Err(_) => continue,
        }
    }

    let snapshot = found_snapshot.ok_or_else(|| CommandError::SnapshotError {
        message: format!("Snapshot not found: {}", snapshot_id),
    })?;

    // Determine the target path from settings
    let settings_path = crate::commands::config::get_settings_file_path()?;
    let settings_content =
        std::fs::read_to_string(&settings_path).map_err(|e| CommandError::SnapshotError {
            message: format!("Failed to read settings: {}", e),
        })?;
    let settings: crate::models::AppSettings =
        serde_json::from_str(&settings_content).map_err(|e| CommandError::SnapshotError {
            message: format!("Failed to parse settings: {}", e),
        })?;

    let target_path = match &tool {
        ToolTarget::Code => settings.code_path,
        ToolTarget::Desktop => settings.desktop_path,
    }
    .ok_or_else(|| CommandError::SnapshotError {
        message: format!("No path configured for tool"),
    })?;

    // Use the write pipeline
    crate::commands::config::write_pipeline(&target_path, &snapshot.content, &tool, &app, &state)?;

    Ok(())
}

/// Delete a snapshot by ID.
#[tauri::command]
pub fn snapshot_delete(snapshot_id: String, tool: ToolTarget) -> Result<(), CommandError> {
    let dir = snapshots_dir(&tool)?;
    if !dir.exists() {
        return Err(CommandError::SnapshotError {
            message: format!("No snapshots found for tool"),
        });
    }

    let entries = std::fs::read_dir(&dir).map_err(|e| CommandError::SnapshotError {
        message: format!("Failed to read snapshots directory: {}", e),
    })?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        match std::fs::read_to_string(&path) {
            Ok(content) => {
                if let Ok(snapshot) = serde_json::from_str::<Snapshot>(&content) {
                    if snapshot.id == snapshot_id {
                        std::fs::remove_file(&path).map_err(|e| CommandError::SnapshotError {
                            message: format!("Failed to delete snapshot file: {}", e),
                        })?;
                        return Ok(());
                    }
                }
            }
            Err(_) => continue,
        }
    }

    Err(CommandError::SnapshotError {
        message: format!("Snapshot not found: {}", snapshot_id),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_snapshot_serialization() {
        let snapshot = Snapshot {
            id: "test-id".to_string(),
            name: "auto".to_string(),
            timestamp: "1700000000000".to_string(),
            tool: ToolTarget::Code,
            content: r#"{"mcpServers":{}}"#.to_string(),
            is_auto: true,
        };
        let json = serde_json::to_string(&snapshot).unwrap();
        assert!(json.contains("test-id"));
        assert!(json.contains("isAuto"));
        let parsed: Snapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "test-id");
        assert!(parsed.is_auto);
    }

    #[test]
    fn test_snapshots_dir_code() {
        let dir = snapshots_dir(&ToolTarget::Code).unwrap();
        assert!(dir.to_string_lossy().contains("snapshots/code"));
    }

    #[test]
    fn test_snapshots_dir_desktop() {
        let dir = snapshots_dir(&ToolTarget::Desktop).unwrap();
        assert!(dir.to_string_lossy().contains("snapshots/desktop"));
    }

    #[test]
    fn test_current_timestamp_ms_is_numeric() {
        let ts = current_timestamp_ms();
        let parsed = ts.parse::<u128>();
        assert!(parsed.is_ok(), "timestamp should be numeric: {}", ts);
        assert!(parsed.unwrap() > 0);
    }
}
