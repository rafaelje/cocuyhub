use serde::Serialize;
use thiserror::Error;

/// Serializes as internally-tagged JSON: {"type": "FileNotFound", "path": "..."}
/// Matches the TypeScript CommandError interface in src/types/index.ts
#[derive(Debug, Serialize, Error)]
#[serde(tag = "type")]
pub enum CommandError {
    #[error("File not found: {path}")]
    FileNotFound { path: String },
    #[error("JSON parse error: {message}")]
    ParseError { message: String },
    #[error("Read failed: {message}")]
    ReadError { message: String },
    #[error("Write failed: {message}")]
    WriteError { message: String },
    #[error("Snapshot error: {message}")]
    SnapshotError { message: String },
    #[error("Process detection error: {message}")]
    ProcessError { message: String },
}

// Required for Tauri commands to return CommandError
impl From<CommandError> for String {
    fn from(e: CommandError) -> Self {
        e.to_string()
    }
}
