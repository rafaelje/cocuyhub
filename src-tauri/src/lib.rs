mod commands;
mod errors;
mod models;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Shared application state managed by Tauri.
/// Must be Send + Sync.
pub struct AppState {
    /// Paths currently being written atomically (suppress watcher events for these)
    pub writing_paths: Arc<Mutex<HashSet<PathBuf>>>,
    /// Last known process status: "code" -> bool, "desktop" -> bool
    /// Arc so the polling thread can write back status changes
    pub process_status: Arc<Mutex<HashMap<String, bool>>>,
    /// Guard to prevent spawning multiple watcher threads
    pub watcher_active: Mutex<bool>,
    /// Guard to prevent spawning multiple polling threads
    pub polling_active: Mutex<bool>,
    /// Guard to prevent spawning multiple metrics watcher threads
    pub metrics_watcher_active: Mutex<bool>,
}

impl AppState {
    pub fn new() -> Self {
        let mut process_status = HashMap::new();
        process_status.insert("code".to_string(), false);
        process_status.insert("desktop".to_string(), false);

        Self {
            writing_paths: Arc::new(Mutex::new(HashSet::new())),
            process_status: Arc::new(Mutex::new(process_status)),
            watcher_active: Mutex::new(false),
            polling_active: Mutex::new(false),
            metrics_watcher_active: Mutex::new(false),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build()) // Story 7.2
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // Story 1.3 - Path detection & settings
            commands::config::config_detect_paths,
            commands::config::config_rescan_paths,
            commands::config::config_save_settings,
            commands::config::config_load_settings,
            // Story 1.4 - Config reading
            commands::config::config_read_file,
            // Story 1.5 - Atomic write & file watcher
            commands::config::config_write_file,
            commands::config::config_start_watcher,
            // Story 1.6 - Process detection
            commands::process::process_check_active,
            commands::process::process_start_polling,
            // Story 2.3 — MCP commands
            commands::mcp::mcp_toggle,
            // Story 2.5 — MCP deletion
            commands::mcp::mcp_delete,
            // Story 6.2 — MCP installation from snippet
            commands::mcp::mcp_add_from_snippet,
            // Story 6.3 — MCP rename
            commands::mcp::mcp_rename,
            // MCP inline description
            commands::mcp::mcp_set_description,
            // Per-project MCP management
            commands::projects::project_mcp_toggle,
            commands::projects::project_mcp_delete,
            commands::projects::project_mcp_rename,
            commands::projects::project_mcp_set_description,
            commands::projects::project_mcp_add,
            commands::projects::project_delete,
// Story 7.2 — Auto-update check
            commands::updater::check_for_update,
            // Story 7.3 — Update installation
            commands::updater::download_and_install_update,
            commands::updater::restart_app,
            // Story 4.1 — Profile creation
            commands::profiles::profile_list,
            commands::profiles::profile_create,
            // Story 4.3 — Profile apply
            commands::profiles::profile_apply,
            // Story 4.4 — Profile update and delete
            commands::profiles::profile_update,
            commands::profiles::profile_delete,
            // Story 2.2 — Snapshot commands
            commands::snapshots::snapshot_create,
            commands::snapshots::snapshot_list,
            commands::snapshots::snapshot_restore,
            commands::snapshots::snapshot_delete,
            // Metrics dashboard
            commands::metrics::metrics_read,
            commands::metrics::metrics_start_watcher,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
