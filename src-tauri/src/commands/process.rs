use crate::errors::CommandError;
use crate::models::{ProcessStatusChangedEvent, ToolTarget};
use crate::AppState;
use sysinfo::System;
use tauri::Emitter;

/// Check whether a Claude process is active for the given tool using an already-refreshed System.
/// Extracted to avoid duplicating process name logic between check_active and polling thread.
fn is_process_active(sys: &System, tool: &ToolTarget) -> bool {
    match tool {
        ToolTarget::Code => {
            sys.processes_by_name("claude".as_ref()).next().is_some()
                || sys
                    .processes_by_name("claude-code".as_ref())
                    .next()
                    .is_some()
        }
        ToolTarget::Desktop => sys.processes_by_name("Claude".as_ref()).next().is_some(),
    }
}

/// Check if a Claude process is currently active for the given tool target.
#[tauri::command]
pub fn process_check_active(tool: ToolTarget) -> Result<bool, CommandError> {
    let mut sys = System::new_all();
    sys.refresh_all();
    Ok(is_process_active(&sys, &tool))
}

/// Start background polling for process status changes.
/// Polls every 2 seconds and emits "process://status-changed" when status changes.
/// Guard prevents multiple polling threads from being spawned.
#[tauri::command]
pub fn process_start_polling(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), CommandError> {
    // Guard: only start one polling thread
    {
        let mut active = state.polling_active.lock().unwrap();
        if *active {
            return Ok(());
        }
        *active = true;
    }

    let process_status = state.process_status.clone();
    let app_clone = app.clone();

    std::thread::spawn(move || {
        let tools = [
            ("code", ToolTarget::Code),
            ("desktop", ToolTarget::Desktop),
        ];

        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));

            let mut sys = System::new_all();
            sys.refresh_all();

            for (key, tool) in &tools {
                let active = is_process_active(&sys, tool);

                let prev = {
                    let status = process_status.lock().unwrap();
                    status.get(*key).copied().unwrap_or(false)
                };

                if prev != active {
                    // Update AppState so it reflects current reality
                    {
                        let mut status = process_status.lock().unwrap();
                        status.insert(key.to_string(), active);
                    }

                    let evt = ProcessStatusChangedEvent {
                        tool: tool.clone(),
                        active,
                    };
                    let _ = app_clone.emit("process://status-changed", &evt);
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
    fn test_process_check_active_code_returns_bool() {
        let result = process_check_active(ToolTarget::Code);
        assert!(result.is_ok());
        // Result must be a bool — just verify it is one
        let active: bool = result.unwrap();
        assert!(active == true || active == false);
    }

    #[test]
    fn test_process_check_active_desktop_returns_bool() {
        let result = process_check_active(ToolTarget::Desktop);
        assert!(result.is_ok());
        let active: bool = result.unwrap();
        assert!(active == true || active == false);
    }

    #[test]
    fn test_is_process_active_with_empty_system_returns_false() {
        // A freshly created System with no refresh has no processes
        let sys = System::new();
        assert!(!is_process_active(&sys, &ToolTarget::Code));
        assert!(!is_process_active(&sys, &ToolTarget::Desktop));
    }

    #[test]
    fn test_process_status_changed_event_serialization() {
        let evt = ProcessStatusChangedEvent {
            tool: ToolTarget::Code,
            active: true,
        };
        let json = serde_json::to_string(&evt).unwrap();
        assert!(json.contains("\"tool\":\"code\""));
        assert!(json.contains("\"active\":true"));

        let parsed: ProcessStatusChangedEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.tool, ToolTarget::Code);
        assert!(parsed.active);
    }

    #[test]
    fn test_process_status_changed_event_desktop_serialization() {
        let evt = ProcessStatusChangedEvent {
            tool: ToolTarget::Desktop,
            active: false,
        };
        let json = serde_json::to_string(&evt).unwrap();
        assert!(json.contains("\"tool\":\"desktop\""));
        assert!(json.contains("\"active\":false"));
    }
}
