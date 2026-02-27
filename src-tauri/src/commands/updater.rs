use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use tauri_plugin_updater::UpdaterExt;

#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    percent: u8,
}

/// Check for available application updates.
/// Returns the new version string if an update is available, or None if no update
/// is found or if any error occurs (network failure, etc.). Fails silently.
#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Option<String> {
    let updater = app.updater().ok()?;
    let update = updater.check().await.ok()??;
    Some(update.version.to_string())
}

/// Download and install the latest update, emitting progress events.
/// Re-fetches the update via check() since the Update object from check_for_update
/// is dropped after that command returns. After this returns Ok, the update is
/// staged and will be applied on restart.
#[tauri::command]
pub async fn download_and_install_update(app: tauri::AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No update available".to_string())?;

    let downloaded = Arc::new(AtomicU64::new(0));
    let downloaded_clone = Arc::clone(&downloaded);
    let app_clone = app.clone();

    update
        .download_and_install(
            move |chunk_len, total| {
                let new_total =
                    downloaded_clone.fetch_add(chunk_len as u64, Ordering::Relaxed)
                        + chunk_len as u64;
                let percent = match total {
                    Some(t) if t > 0 => {
                        ((new_total as f64 / t as f64) * 100.0).min(100.0) as u8
                    }
                    _ => 0,
                };
                let _ = app_clone.emit("update://progress", ProgressPayload { percent });
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Restart the application to apply the staged update.
#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}
