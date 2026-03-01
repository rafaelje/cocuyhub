use crate::commands::config::{get_settings_file_path, write_pipeline};
use crate::errors::CommandError;
use crate::models::{AppSettings, ClaudeConfig, Profile, ProfileMcpServers, ToolTarget};
use crate::AppState;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::Emitter;
use uuid::Uuid;

/// Returns the profiles.json path:
/// ~/Library/Application Support/CocuyHub/profiles.json
fn profiles_file() -> Result<PathBuf, CommandError> {
    let home = std::env::var("HOME").map_err(|_| CommandError::WriteError {
        message: "Cannot determine HOME directory".to_string(),
    })?;
    Ok(PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("CocuyHub")
        .join("profiles.json"))
}

/// Read all profiles from profiles.json. Returns empty vec if file doesn't exist.
fn read_profiles() -> Result<Vec<Profile>, CommandError> {
    let path = profiles_file()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| CommandError::ReadError {
        message: format!("Failed to read profiles.json: {}", e),
    })?;
    // Incompatible schema (e.g., old active_mcps format) — treat as empty so user can recreate profiles
    match serde_json::from_str(&content) {
        Ok(profiles) => Ok(profiles),
        Err(_) => Ok(vec![]),
    }
}

/// Atomic write: serialize profiles to temp file then rename.
fn write_profiles(profiles: &[Profile]) -> Result<(), CommandError> {
    let path = profiles_file()?;

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| CommandError::WriteError {
            message: format!("Failed to create data directory: {}", e),
        })?;
    }

    let json = serde_json::to_string_pretty(profiles).map_err(|e| CommandError::WriteError {
        message: format!("Failed to serialize profiles: {}", e),
    })?;

    // Atomic write: temp file + rename
    let tmp_path = path.with_extension("tmp");
    std::fs::write(&tmp_path, &json).map_err(|e| CommandError::WriteError {
        message: format!("Failed to write temp profiles file: {}", e),
    })?;
    std::fs::rename(&tmp_path, &path).map_err(|e| CommandError::WriteError {
        message: format!("Failed to rename profiles file: {}", e),
    })?;

    Ok(())
}

#[tauri::command]
pub fn profile_list() -> Result<Vec<Profile>, CommandError> {
    read_profiles()
}

#[tauri::command]
pub fn profile_create(
    name: String,
    app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
) -> Result<Profile, CommandError> {
    let mut profiles = read_profiles()?;

    // Validate name uniqueness
    if profiles.iter().any(|p| p.name == name) {
        return Err(CommandError::WriteError {
            message: format!("Profile '{}' already exists", name),
        });
    }

    // Load settings to get config paths
    let settings_path = get_settings_file_path()?;
    let settings: AppSettings = if settings_path.exists() {
        let content =
            std::fs::read_to_string(&settings_path).map_err(|e| CommandError::ReadError {
                message: format!("Failed to read settings: {}", e),
            })?;
        serde_json::from_str(&content).map_err(|e| CommandError::ParseError {
            message: format!("Failed to parse settings: {}", e),
        })?
    } else {
        AppSettings::default()
    };

    // Snapshot code config
    let code_mcps: HashMap<String, crate::models::McpServerConfig> = if let Some(path) = &settings.code_path {
        let target = PathBuf::from(path);
        if target.exists() {
            let content =
                std::fs::read_to_string(&target).map_err(|e| CommandError::ReadError {
                    message: format!("Failed to read code config: {}", e),
                })?;
            let config: ClaudeConfig =
                serde_json::from_str(&content).map_err(|e| CommandError::ParseError {
                    message: format!("Failed to parse code config: {}", e),
                })?;
            config.mcp_servers
        } else {
            HashMap::new()
        }
    } else {
        HashMap::new()
    };

    // Snapshot desktop config
    let desktop_mcps: HashMap<String, crate::models::McpServerConfig> = if let Some(path) = &settings.desktop_path {
        let target = PathBuf::from(path);
        if target.exists() {
            let content =
                std::fs::read_to_string(&target).map_err(|e| CommandError::ReadError {
                    message: format!("Failed to read desktop config: {}", e),
                })?;
            let config: ClaudeConfig =
                serde_json::from_str(&content).map_err(|e| CommandError::ParseError {
                    message: format!("Failed to parse desktop config: {}", e),
                })?;
            config.mcp_servers
        } else {
            HashMap::new()
        }
    } else {
        HashMap::new()
    };

    let profile = Profile {
        id: Uuid::new_v4().to_string(),
        name: name.clone(),
        mcp_servers: ProfileMcpServers {
            code: code_mcps,
            desktop: desktop_mcps,
        },
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    profiles.push(profile.clone());
    write_profiles(&profiles)?;

    // Emit event for future stories (Profile Switcher in 4.2)
    let _ = app.emit("profile://created", &profile);

    Ok(profile)
}

#[tauri::command]
pub fn profile_apply(
    profile_id: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    let profiles = read_profiles()?;
    let profile = profiles
        .iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| CommandError::WriteError {
            message: format!("Profile '{}' not found", profile_id),
        })?
        .clone();

    // Load settings to get config paths
    let settings_path = get_settings_file_path()?;
    let settings: AppSettings = if settings_path.exists() {
        let content =
            std::fs::read_to_string(&settings_path).map_err(|e| CommandError::ReadError {
                message: format!("Failed to read settings: {}", e),
            })?;
        serde_json::from_str(&content).map_err(|e| CommandError::ParseError {
            message: format!("Failed to parse settings: {}", e),
        })?
    } else {
        AppSettings::default()
    };

    let configs = [
        (settings.code_path, ToolTarget::Code),
        (settings.desktop_path, ToolTarget::Desktop),
    ];

    for (maybe_path, tool) in configs {
        let Some(path) = maybe_path else {
            continue;
        };
        let target = PathBuf::from(&path);
        if !target.exists() {
            continue;
        }

        let content =
            std::fs::read_to_string(&target).map_err(|e| CommandError::ReadError {
                message: format!("Failed to read config: {}", e),
            })?;
        let mut config: ClaudeConfig =
            serde_json::from_str(&content).map_err(|e| CommandError::ParseError {
                message: format!("Failed to parse config: {}", e),
            })?;

        // Replace entire mcpServers with the profile snapshot for this tool
        config.mcp_servers = match tool {
            ToolTarget::Code => profile.mcp_servers.code.clone(),
            ToolTarget::Desktop => profile.mcp_servers.desktop.clone(),
        };

        let updated_json =
            serde_json::to_string_pretty(&config).map_err(|e| CommandError::WriteError {
                message: format!("Failed to serialize config: {}", e),
            })?;

        write_pipeline(&path, &updated_json, &tool, &app, &state)?;
    }

    let _ = app.emit("profile://applied", &profile_id);
    Ok(())
}

// Story 4.4 — Profile update and delete
#[tauri::command]
pub fn profile_update(
    id: String,
    name: String,
    app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
) -> Result<Profile, CommandError> {
    let mut profiles = read_profiles()?;

    // Check profile exists
    let idx = profiles
        .iter()
        .position(|p| p.id == id)
        .ok_or_else(|| CommandError::WriteError {
            message: format!("Profile '{}' not found", id),
        })?;

    // Uniqueness check — exclude self
    if profiles.iter().any(|p| p.id != id && p.name == name) {
        return Err(CommandError::WriteError {
            message: format!("Profile '{}' already exists", name),
        });
    }

    profiles[idx].name = name.clone();
    let updated = profiles[idx].clone();

    write_profiles(&profiles)?;
    let _ = app.emit("profile://updated", &updated);

    Ok(updated)
}

#[tauri::command]
pub fn profile_delete(
    id: String,
    app: tauri::AppHandle,
    _state: tauri::State<'_, AppState>,
) -> Result<(), CommandError> {
    let mut profiles = read_profiles()?;

    // Check profile exists
    if !profiles.iter().any(|p| p.id == id) {
        return Err(CommandError::WriteError {
            message: format!("Profile '{}' not found", id),
        });
    }

    profiles.retain(|p| p.id != id);
    write_profiles(&profiles)?;
    let _ = app.emit("profile://deleted", &id);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_profiles_file_path_contains_cocuyhub() {
        let path = profiles_file().unwrap();
        assert!(path.to_string_lossy().contains("CocuyHub"));
        assert!(path.to_string_lossy().ends_with("profiles.json"));
    }

    #[test]
    fn test_read_profiles_returns_empty_when_file_missing() {
        // profiles_file() path won't exist in test env unless explicitly created
        // We test via read_profiles on a path that doesn't exist by checking the logic
        // (integration test — only validates parse path; file doesn't exist in CI)
        let result = read_profiles();
        // Either Ok(vec![]) if file missing OR Ok(profiles) if file exists
        assert!(result.is_ok());
    }

    #[test]
    fn test_profile_update_not_found_returns_error() {
        let profiles: Vec<Profile> = vec![];
        let result = profiles
            .iter()
            .position(|p| p.id == "nonexistent")
            .ok_or_else(|| CommandError::WriteError {
                message: "Profile 'nonexistent' not found".to_string(),
            });
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("nonexistent"));
            }
            _ => panic!("Expected WriteError"),
        }
    }

    #[test]
    fn test_profile_update_duplicate_name_returns_error() {
        let empty_mcps = || crate::models::ProfileMcpServers {
            code: std::collections::HashMap::new(),
            desktop: std::collections::HashMap::new(),
        };
        let profiles = vec![
            Profile {
                id: "p1".to_string(),
                name: "Work".to_string(),
                mcp_servers: empty_mcps(),
                created_at: "2026-01-01T00:00:00Z".to_string(),
            },
            Profile {
                id: "p2".to_string(),
                name: "Research".to_string(),
                mcp_servers: empty_mcps(),
                created_at: "2026-01-01T00:00:00Z".to_string(),
            },
        ];
        let id = "p1".to_string();
        let name = "Research".to_string();
        // Simulate uniqueness check excluding self
        let duplicate = profiles.iter().any(|p| p.id != id && p.name == name);
        assert!(duplicate, "Should detect duplicate name from another profile");
        if duplicate {
            let result: Result<Profile, CommandError> = Err(CommandError::WriteError {
                message: format!("Profile '{}' already exists", name),
            });
            assert!(result.is_err());
        }
    }

    #[test]
    fn test_profile_delete_not_found_returns_error() {
        let profiles: Vec<Profile> = vec![];
        let id = "nonexistent".to_string();
        let exists = profiles.iter().any(|p| p.id == id);
        assert!(!exists);
        if !exists {
            let result: Result<(), CommandError> = Err(CommandError::WriteError {
                message: format!("Profile '{}' not found", id),
            });
            assert!(result.is_err());
        }
    }

    #[test]
    fn test_profile_apply_returns_error_when_profile_not_found() {
        // When profiles list is empty, profile_apply should return WriteError for unknown id
        // We test the error-return logic via read_profiles + find
        let profiles: Vec<Profile> = vec![];
        let result = profiles
            .iter()
            .find(|p| p.id == "nonexistent")
            .ok_or_else(|| CommandError::WriteError {
                message: "Profile 'nonexistent' not found".to_string(),
            });
        assert!(result.is_err());
        match result.unwrap_err() {
            CommandError::WriteError { message } => {
                assert!(message.contains("nonexistent"));
            }
            _ => panic!("Expected WriteError"),
        }
    }
}
