use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub mcp_servers: HashMap<String, McpServerConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled_mcps: Option<HashMap<String, McpServerConfig>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeConfig {
    pub mcp_servers: HashMap<String, McpServerConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub projects: Option<HashMap<String, ProjectConfig>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub command: String,
    pub args: Vec<String>,
    pub env: Option<HashMap<String, String>>,
    pub disabled: Option<bool>,
    #[serde(rename = "_description", skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMcpServers {
    pub code: HashMap<String, McpServerConfig>,
    pub desktop: HashMap<String, McpServerConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub mcp_servers: ProfileMcpServers,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: String,
    pub name: String,
    pub timestamp: String,
    pub tool: ToolTarget,
    pub content: String,
    pub is_auto: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ToolTarget {
    Code,
    Desktop,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub code_path: Option<String>,
    pub desktop_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedPaths {
    pub code_path: Option<String>,
    pub desktop_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalChangeEvent {
    pub path: String,
    pub tool: ToolTarget,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStatusChangedEvent {
    pub tool: ToolTarget,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotCreatedEvent {
    pub tool: ToolTarget,
    pub snapshot_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStats {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub entries_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanLimits {
    pub message_limit: u64,
    pub token_limit: u64,
    pub cost_limit_usd: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionBlock {
    pub start_time: String,
    pub end_time: String,
    pub is_active: bool,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub total_tokens: u64,
    pub message_count: u64,
    pub model_stats: HashMap<String, ModelStats>,
    pub limit_reached: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillLocation {
    Personal,
    Project,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub disable_model_invocation: bool,
    pub user_invocable: bool,
    pub allowed_tools: Option<String>,
    pub argument_hint: Option<String>,
    pub location: SkillLocation,
    pub project_path: Option<String>,
    pub body_preview: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricsPayload {
    pub active_session: Option<SessionBlock>,
    pub past_sessions: Vec<SessionBlock>,
    pub global_model_stats: HashMap<String, ModelStats>,
    pub projects_path: String,
    pub detected_plan: String,
    pub plan_confidence: String,
    pub plan_limits: PlanLimits,
}
