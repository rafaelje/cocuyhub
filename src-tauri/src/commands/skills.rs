use crate::errors::CommandError;
use crate::models::{SkillInfo, SkillLocation, SkillTreeNode};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

/// Sentinel prefix for conflict errors — enables reliable frontend parsing.
const CONFLICT_PREFIX: &str = "CONFLICT:";

/// Expand a leading `~` to the HOME directory.
fn expand_tilde(path: &str) -> Result<PathBuf, CommandError> {
    if let Some(rest) = path.strip_prefix("~/") {
        let home = std::env::var("HOME").map_err(|_| CommandError::ReadError {
            message: "Could not determine HOME directory".to_string(),
        })?;
        Ok(PathBuf::from(home).join(rest))
    } else if path == "~" {
        let home = std::env::var("HOME").map_err(|_| CommandError::ReadError {
            message: "Could not determine HOME directory".to_string(),
        })?;
        Ok(PathBuf::from(home))
    } else {
        Ok(PathBuf::from(path))
    }
}

/// Canonical regex for skill slugs: lowercase alphanumeric with single hyphens, max 64 chars.
fn is_valid_slug(name: &str) -> bool {
    if name.is_empty() || name.len() > 64 {
        return false;
    }
    // ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$
    let bytes = name.as_bytes();
    // First char must be alphanumeric
    if !bytes[0].is_ascii_lowercase() && !bytes[0].is_ascii_digit() {
        return false;
    }
    // Last char must be alphanumeric
    if bytes.len() > 1 && !bytes[bytes.len() - 1].is_ascii_lowercase() && !bytes[bytes.len() - 1].is_ascii_digit() {
        return false;
    }
    // Middle chars: lowercase, digit, or hyphen (no consecutive hyphens)
    let mut prev_hyphen = false;
    for &b in &bytes[1..] {
        if b == b'-' {
            if prev_hyphen {
                return false;
            }
            prev_hyphen = true;
        } else if b.is_ascii_lowercase() || b.is_ascii_digit() {
            prev_hyphen = false;
        } else {
            return false;
        }
    }
    true
}

pub(crate) fn validate_slug(name: &str) -> Result<(), CommandError> {
    if !is_valid_slug(name) {
        return Err(CommandError::WriteError {
            message: format!(
                "Invalid skill name: must be lowercase alphanumeric with hyphens, 1-64 chars, no leading/trailing/consecutive hyphens. Got '{}'",
                name
            ),
        });
    }
    Ok(())
}

/// Parse YAML frontmatter from SKILL.md content.
/// Returns (parsed_fields, raw_unparseable_lines, body).
pub(crate) fn parse_frontmatter(content: &str) -> (Vec<(String, String)>, Vec<String>, String) {
    let mut fields: Vec<(String, String)> = Vec::new();
    let mut raw_lines: Vec<String> = Vec::new();
    let mut body = String::new();

    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        // No frontmatter — entire content is body
        return (fields, raw_lines, content.to_string());
    }

    // Find the closing ---
    let after_opening = &trimmed[3..];
    let after_opening = after_opening.strip_prefix('\n').unwrap_or(after_opening);

    if let Some(close_pos) = after_opening.find("\n---") {
        let fm_block = &after_opening[..close_pos];
        let rest = &after_opening[close_pos + 4..]; // skip \n---
        // Strip leading newline(s) from body
        body = rest.trim_start_matches('\n').to_string();

        // Parse each line of frontmatter
        for line in fm_block.lines() {
            let line_trimmed = line.trim();
            if line_trimmed.is_empty() {
                continue;
            }
            if let Some(colon_pos) = line_trimmed.find(':') {
                let key = line_trimmed[..colon_pos].trim().to_string();
                let value_raw = line_trimmed[colon_pos + 1..].trim().to_string();
                // Strip surrounding quotes
                let value = strip_quotes(&value_raw);
                if !key.is_empty() && !key.contains(' ') {
                    fields.push((key, value));
                } else {
                    raw_lines.push(line.to_string());
                }
            } else {
                raw_lines.push(line.to_string());
            }
        }
    } else {
        // No closing delimiter — treat everything after opening --- as frontmatter
        for line in after_opening.lines() {
            let line_trimmed = line.trim();
            if line_trimmed.is_empty() {
                continue;
            }
            if let Some(colon_pos) = line_trimmed.find(':') {
                let key = line_trimmed[..colon_pos].trim().to_string();
                let value_raw = line_trimmed[colon_pos + 1..].trim().to_string();
                let value = strip_quotes(&value_raw);
                if !key.is_empty() && !key.contains(' ') {
                    fields.push((key, value));
                } else {
                    raw_lines.push(line.to_string());
                }
            } else {
                raw_lines.push(line.to_string());
            }
        }
    }

    (fields, raw_lines, body)
}

fn strip_quotes(s: &str) -> String {
    let bytes = s.as_bytes();
    if bytes.len() >= 2
        && ((bytes[0] == b'\'' && bytes[bytes.len() - 1] == b'\'')
            || (bytes[0] == b'"' && bytes[bytes.len() - 1] == b'"'))
    {
        return s[1..s.len() - 1].to_string();
    }
    s.to_string()
}

/// Sanitize a frontmatter value: strip newlines to prevent YAML injection.
fn sanitize_frontmatter_value(value: &str) -> String {
    value.replace(['\n', '\r'], " ")
}

/// Serialize frontmatter fields back into SKILL.md content.
pub(crate) fn serialize_frontmatter(
    fields: &[(String, String)],
    raw_lines: &[String],
    body: &str,
) -> String {
    let mut out = String::from("---\n");
    for (key, value) in fields {
        let safe_value = sanitize_frontmatter_value(value);
        out.push_str(&format!("{}: {}\n", key, safe_value));
    }
    for line in raw_lines {
        out.push_str(line);
        out.push('\n');
    }
    out.push_str("---\n");
    if !body.is_empty() {
        out.push('\n');
        out.push_str(body);
    }
    out
}

/// Build SkillInfo from a skill directory path.
pub(crate) fn skill_info_from_path(
    dir_path: &Path,
    location: SkillLocation,
    project_path: Option<String>,
) -> Result<SkillInfo, CommandError> {
    let skill_md_path = dir_path.join("SKILL.md");
    let content = std::fs::read_to_string(&skill_md_path).map_err(|e| CommandError::ReadError {
        message: format!("Failed to read SKILL.md: {}", e),
    })?;

    let slug = dir_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let (fields, _raw_lines, body) = parse_frontmatter(&content);

    let mut name = slug.clone();
    let mut description: Option<String> = None;
    let mut disable_model_invocation = false;
    let mut user_invocable = true;
    let mut allowed_tools: Option<String> = None;
    let mut argument_hint: Option<String> = None;
    let mut disabled = false;

    for (key, value) in &fields {
        match key.as_str() {
            "name" => name = value.clone(),
            "description" => {
                if !value.is_empty() {
                    description = Some(value.clone());
                }
            }
            "disable-model-invocation" => {
                disable_model_invocation = value == "true";
            }
            "user-invocable" => {
                user_invocable = value != "false";
            }
            "allowed-tools" => {
                if !value.is_empty() {
                    allowed_tools = Some(value.clone());
                }
            }
            "argument-hint" => {
                if !value.is_empty() {
                    argument_hint = Some(value.clone());
                }
            }
            "disabled" => {
                disabled = value == "true";
            }
            _ => {}
        }
    }

    // Body preview: truncate to 200 Unicode chars
    let body_trimmed = body.trim();
    let body_preview = if body_trimmed.is_empty() {
        None
    } else {
        let char_count = body_trimmed.chars().count();
        if char_count > 200 {
            let truncated: String = body_trimmed.chars().take(200).collect();
            Some(format!("{}...", truncated))
        } else {
            Some(body_trimmed.to_string())
        }
    };

    Ok(SkillInfo {
        name,
        slug,
        description,
        disable_model_invocation,
        user_invocable,
        allowed_tools,
        argument_hint,
        location,
        project_path,
        body_preview,
        disabled,
    })
}

/// Collect skills from a flat directory (each subdirectory with SKILL.md is a skill).
fn collect_skills_from_dir(
    dir: &Path,
    location: SkillLocation,
    project_path: Option<String>,
    skills: &mut Vec<SkillInfo>,
) {
    if !dir.is_dir() {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join("SKILL.md").exists() {
                if let Ok(info) = skill_info_from_path(&path, location.clone(), project_path.clone()) {
                    skills.push(info);
                }
            }
        }
    }
}

/// Discover the Claude Desktop "My Skills" directory.
/// Path pattern: ~/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/<uuid>/<uuid>/skills/
fn find_desktop_skills_dir(home: &str) -> Option<PathBuf> {
    let base = PathBuf::from(home)
        .join("Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin");
    if !base.is_dir() {
        return None;
    }
    // Traverse two levels of UUID directories to find the skills/ folder
    for e1 in std::fs::read_dir(&base).ok()?.flatten() {
        if !e1.path().is_dir() { continue; }
        for e2 in std::fs::read_dir(e1.path()).ok().into_iter().flatten().flatten() {
            let skills_dir = e2.path().join("skills");
            if skills_dir.is_dir() {
                return Some(skills_dir);
            }
        }
    }
    None
}

/// Discover the Claude Desktop "Examples" base directory.
/// Path pattern: ~/Library/Application Support/Claude/local-agent-mode-sessions/<uuid>/<uuid>/cowork_plugins/marketplaces/knowledge-work-plugins/
fn find_desktop_examples_base(home: &str) -> Option<PathBuf> {
    let base = PathBuf::from(home)
        .join("Library/Application Support/Claude/local-agent-mode-sessions");
    if !base.is_dir() {
        return None;
    }
    for e1 in std::fs::read_dir(&base).ok()?.flatten() {
        let p1 = e1.path();
        // Skip the skills-plugin directory
        if !p1.is_dir() || p1.file_name().map_or(false, |n| n == "skills-plugin") {
            continue;
        }
        for e2 in std::fs::read_dir(&p1).ok().into_iter().flatten().flatten() {
            let kwp = e2.path()
                .join("cowork_plugins/marketplaces/knowledge-work-plugins");
            if kwp.is_dir() {
                return Some(kwp);
            }
        }
    }
    None
}

/// Discover skills from personal, project, and Claude Desktop directories.
pub(crate) fn discover_skills(
    personal_dir: &Path,
    project_dirs: &[(String, PathBuf)],
) -> Vec<SkillInfo> {
    let mut skills = Vec::new();

    // Personal skills (~/.claude/skills/)
    collect_skills_from_dir(personal_dir, SkillLocation::Personal, None, &mut skills);

    // Project skills (<project>/.claude/skills/)
    for (project_path, skills_dir) in project_dirs {
        collect_skills_from_dir(
            skills_dir,
            SkillLocation::Project,
            Some(project_path.clone()),
            &mut skills,
        );
    }

    // Claude Desktop "My Skills"
    if let Ok(home) = std::env::var("HOME") {
        if let Some(desktop_skills_dir) = find_desktop_skills_dir(&home) {
            collect_skills_from_dir(
                &desktop_skills_dir,
                SkillLocation::DesktopSkills,
                Some(desktop_skills_dir.to_string_lossy().into_owned()),
                &mut skills,
            );
        }

        // Claude Desktop "Examples" — each category subfolder has a skills/ dir
        if let Some(examples_base) = find_desktop_examples_base(&home) {
            if let Ok(categories) = std::fs::read_dir(&examples_base) {
                for cat_entry in categories.flatten() {
                    let cat_skills_dir = cat_entry.path().join("skills");
                    if cat_skills_dir.is_dir() {
                        collect_skills_from_dir(
                            &cat_skills_dir,
                            SkillLocation::DesktopExamples,
                            Some(cat_skills_dir.to_string_lossy().into_owned()),
                            &mut skills,
                        );
                    }
                }
            }
        }
    }

    skills.sort_by(|a, b| a.slug.cmp(&b.slug));
    skills
}

/// Validate that a project path is absolute and doesn't contain traversal sequences.
fn validate_project_path(pp: &str) -> Result<(), CommandError> {
    let path = Path::new(pp);
    if !path.is_absolute() {
        return Err(CommandError::WriteError {
            message: format!("Project path must be absolute: '{}'", pp),
        });
    }
    // Reject any path components that are ".." to prevent traversal
    for component in path.components() {
        if let std::path::Component::ParentDir = component {
            return Err(CommandError::WriteError {
                message: format!("Project path must not contain '..': '{}'", pp),
            });
        }
    }
    Ok(())
}

fn resolve_skill_path(
    slug: &str,
    location: &str,
    project_path: Option<&str>,
) -> Result<PathBuf, CommandError> {
    match location {
        "personal" => {
            let home = std::env::var("HOME").map_err(|_| CommandError::ReadError {
                message: "Could not determine HOME directory".to_string(),
            })?;
            Ok(PathBuf::from(home).join(".claude").join("skills").join(slug))
        }
        "project" => {
            let pp = project_path.ok_or_else(|| CommandError::WriteError {
                message: "Project path required for project-level skills".to_string(),
            })?;
            validate_project_path(pp)?;
            Ok(PathBuf::from(pp).join(".claude").join("skills").join(slug))
        }
        "desktop_skills" => {
            // project_path carries the parent skills directory; auto-discover if absent
            let parent = match project_path {
                Some(pp) => PathBuf::from(pp),
                None => {
                    let home = std::env::var("HOME").map_err(|_| CommandError::ReadError {
                        message: "Could not determine HOME directory".to_string(),
                    })?;
                    find_desktop_skills_dir(&home).ok_or_else(|| CommandError::ReadError {
                        message: "Claude Desktop My Skills directory not found".to_string(),
                    })?
                }
            };
            Ok(parent.join(slug))
        }
        "desktop_examples" => {
            let pp = project_path.ok_or_else(|| CommandError::ReadError {
                message: "Parent path required for desktop example skills".to_string(),
            })?;
            Ok(PathBuf::from(pp).join(slug))
        }
        _ => Err(CommandError::WriteError {
            message: format!("Invalid location: '{}'", location),
        }),
    }
}

const FRONTMATTER_KEY_WHITELIST: &[&str] = &[
    "description",
    "disable-model-invocation",
    "user-invocable",
    "allowed-tools",
    "argument-hint",
    "disabled",
];

// ── Tauri Commands ──

#[tauri::command]
pub fn skill_list(project_paths: Vec<String>) -> Result<Vec<SkillInfo>, CommandError> {
    let home = std::env::var("HOME").map_err(|_| CommandError::ReadError {
        message: "Could not determine HOME directory".to_string(),
    })?;
    let personal_dir = PathBuf::from(&home).join(".claude").join("skills");

    let project_dirs: Vec<(String, PathBuf)> = project_paths
        .iter()
        .map(|p| (p.clone(), PathBuf::from(p).join(".claude").join("skills")))
        .collect();

    Ok(discover_skills(&personal_dir, &project_dirs))
}

#[tauri::command]
pub fn skill_create(
    name: String,
    description: String,
    location: String,
    project_path: Option<String>,
    instructions: Option<String>,
) -> Result<SkillInfo, CommandError> {
    validate_slug(&name)?;

    let skill_dir = resolve_skill_path(&name, &location, project_path.as_deref())?;

    if skill_dir.exists() {
        return Err(CommandError::WriteError {
            message: format!("Skill '{}' already exists", name),
        });
    }

    std::fs::create_dir_all(&skill_dir).map_err(|e| CommandError::WriteError {
        message: format!("Failed to create skill directory: {}", e),
    })?;

    let safe_name = sanitize_frontmatter_value(&name);
    let safe_desc = sanitize_frontmatter_value(&description);
    let mut content = format!("---\nname: {}\n", safe_name);
    if !safe_desc.is_empty() {
        content.push_str(&format!("description: {}\n", safe_desc));
    }
    content.push_str("---\n");

    // Append instructions body if provided
    if let Some(ref body) = instructions {
        let trimmed = body.trim();
        if !trimmed.is_empty() {
            content.push('\n');
            content.push_str(trimmed);
            content.push('\n');
        }
    }

    let skill_md_path = skill_dir.join("SKILL.md");
    std::fs::write(&skill_md_path, &content).map_err(|e| CommandError::WriteError {
        message: format!("Failed to write SKILL.md: {}", e),
    })?;

    let loc = match location.as_str() {
        "personal" => SkillLocation::Personal,
        "project" => SkillLocation::Project,
        "desktop_skills" => SkillLocation::DesktopSkills,
        _ => {
            return Err(CommandError::WriteError {
                message: format!("Invalid location: '{}'", location),
            });
        }
    };

    skill_info_from_path(&skill_dir, loc, project_path)
}

#[tauri::command]
pub fn skill_delete(
    slug: String,
    location: String,
    project_path: Option<String>,
) -> Result<(), CommandError> {
    validate_slug(&slug)?;

    let skill_dir = resolve_skill_path(&slug, &location, project_path.as_deref())?;

    if !skill_dir.exists() {
        return Err(CommandError::WriteError {
            message: format!("Skill '{}' not found", slug),
        });
    }

    std::fs::remove_dir_all(&skill_dir).map_err(|e| CommandError::WriteError {
        message: format!("Failed to delete skill directory: {}", e),
    })?;

    Ok(())
}

#[tauri::command]
pub fn skill_rename(
    old_slug: String,
    new_slug: String,
    location: String,
    project_path: Option<String>,
) -> Result<(), CommandError> {
    validate_slug(&old_slug)?;
    validate_slug(&new_slug)?;

    if old_slug == new_slug {
        return Ok(());
    }

    let old_dir = resolve_skill_path(&old_slug, &location, project_path.as_deref())?;
    let new_dir = resolve_skill_path(&new_slug, &location, project_path.as_deref())?;

    std::fs::rename(&old_dir, &new_dir).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists
            || e.raw_os_error() == Some(66) // ENOTEMPTY on macOS
            || e.raw_os_error() == Some(39) // ENOTEMPTY on Linux
        {
            CommandError::WriteError {
                message: format!("Skill '{}' already exists", new_slug),
            }
        } else {
            CommandError::WriteError {
                message: format!("Failed to rename skill: {}", e),
            }
        }
    })?;

    // Update name field in SKILL.md if it matched the old slug
    let skill_md = new_dir.join("SKILL.md");
    if let Ok(content) = std::fs::read_to_string(&skill_md) {
        let (mut fields, raw_lines, body) = parse_frontmatter(&content);
        let mut updated = false;
        for (key, value) in fields.iter_mut() {
            if key == "name" && value == &old_slug {
                *value = new_slug.clone();
                updated = true;
            }
        }
        if updated {
            let new_content = serialize_frontmatter(&fields, &raw_lines, &body);
            std::fs::write(&skill_md, new_content).map_err(|e| CommandError::WriteError {
                message: format!("Directory renamed but failed to update SKILL.md: {}", e),
            })?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn skill_update_frontmatter(
    slug: String,
    key: String,
    value: Option<String>,
    location: String,
    project_path: Option<String>,
) -> Result<(), CommandError> {
    validate_slug(&slug)?;

    if !FRONTMATTER_KEY_WHITELIST.contains(&key.as_str()) {
        return Err(CommandError::WriteError {
            message: format!("Unknown frontmatter key: '{}'", key),
        });
    }

    let skill_dir = resolve_skill_path(&slug, &location, project_path.as_deref())?;
    let skill_md = skill_dir.join("SKILL.md");

    let content = std::fs::read_to_string(&skill_md).map_err(|e| CommandError::ReadError {
        message: format!("Failed to read SKILL.md: {}", e),
    })?;

    let (mut fields, raw_lines, body) = parse_frontmatter(&content);

    match value {
        Some(v) if !v.is_empty() => {
            // Update or insert
            let mut found = false;
            for (k, existing_val) in fields.iter_mut() {
                if k == &key {
                    *existing_val = v.clone();
                    found = true;
                    break;
                }
            }
            if !found {
                fields.push((key, v));
            }
        }
        _ => {
            // Remove the key
            fields.retain(|(k, _)| k != &key);
        }
    }

    let new_content = serialize_frontmatter(&fields, &raw_lines, &body);
    std::fs::write(&skill_md, new_content).map_err(|e| CommandError::WriteError {
        message: format!("Failed to write SKILL.md: {}", e),
    })?;

    Ok(())
}

// ── Workspace node path helpers ──

/// Validate a filesystem node name (no slashes, no null bytes, not empty, not hidden).
fn validate_node_name(name: &str) -> Result<(), CommandError> {
    if name.is_empty() || name.len() > 255 {
        return Err(CommandError::WriteError {
            message: "Name must be 1–255 characters".to_string(),
        });
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err(CommandError::WriteError {
            message: format!("Name contains invalid characters: '{}'", name),
        });
    }
    if name == "." || name == ".." {
        return Err(CommandError::WriteError {
            message: format!("Invalid name: '{}'", name),
        });
    }
    // Reject hidden/system names (starting with a dot) — keeps workspace clean
    if name.starts_with('.') {
        return Err(CommandError::WriteError {
            message: format!("Name cannot start with a dot: '{}'", name),
        });
    }
    Ok(())
}

/// Resolve a relative path (e.g. "/docs/guide.md") safely within skill_root.
/// Returns the absolute PathBuf. Rejects traversal attempts.
fn resolve_node_path(skill_root: &Path, rel_path: &str) -> Result<PathBuf, CommandError> {
    let clean = rel_path.trim_start_matches('/');
    if clean.is_empty() {
        return Ok(skill_root.to_path_buf()); // root "/"
    }
    for comp in Path::new(clean).components() {
        match comp {
            std::path::Component::ParentDir | std::path::Component::RootDir => {
                return Err(CommandError::WriteError {
                    message: format!("Invalid path: '{}'", rel_path),
                });
            }
            _ => {}
        }
    }
    Ok(skill_root.join(clean))
}

// ── Workspace CRUD commands (Stories 2.2 + 2.3) ──

#[tauri::command]
pub fn skill_node_create(
    slug: String,
    location: String,
    project_path: Option<String>,
    parent_rel_path: String,
    name: String,
    node_type: String,
) -> Result<(), CommandError> {
    validate_slug(&slug)?;
    validate_node_name(&name)?;

    let skill_root = resolve_skill_path(&slug, &location, project_path.as_deref())?;
    if !skill_root.is_dir() {
        return Err(CommandError::ReadError {
            message: format!("Skill directory not found: '{}'", slug),
        });
    }

    let parent = resolve_node_path(&skill_root, &parent_rel_path)?;
    if !parent.is_dir() {
        return Err(CommandError::WriteError {
            message: "Parent path is not a directory".to_string(),
        });
    }

    let new_path = parent.join(&name);
    if new_path.exists() {
        return Err(CommandError::WriteError {
            message: format!("'{}' already exists", name),
        });
    }

    match node_type.as_str() {
        "dir" => std::fs::create_dir(&new_path).map_err(|e| CommandError::WriteError {
            message: format!("Failed to create directory: {}", e),
        })?,
        "file" => std::fs::write(&new_path, b"").map_err(|e| CommandError::WriteError {
            message: format!("Failed to create file: {}", e),
        })?,
        _ => {
            return Err(CommandError::WriteError {
                message: format!("Invalid node_type: '{}'", node_type),
            });
        }
    }

    Ok(())
}

#[tauri::command]
pub fn skill_node_rename(
    slug: String,
    location: String,
    project_path: Option<String>,
    rel_path: String,
    new_name: String,
) -> Result<(), CommandError> {
    validate_slug(&slug)?;
    validate_node_name(&new_name)?;

    if rel_path == "/" {
        return Err(CommandError::WriteError {
            message: "Cannot rename skill root directory".to_string(),
        });
    }
    if rel_path == "/SKILL.md" {
        return Err(CommandError::WriteError {
            message: "Cannot rename SKILL.md".to_string(),
        });
    }

    let skill_root = resolve_skill_path(&slug, &location, project_path.as_deref())?;
    let node_path = resolve_node_path(&skill_root, &rel_path)?;

    if !node_path.exists() {
        return Err(CommandError::WriteError {
            message: format!("Path does not exist: '{}'", rel_path),
        });
    }

    let parent = node_path.parent().ok_or_else(|| CommandError::WriteError {
        message: "Cannot determine parent directory".to_string(),
    })?;
    let new_path = parent.join(&new_name);

    if new_path.exists() {
        return Err(CommandError::WriteError {
            message: format!("'{}' already exists", new_name),
        });
    }

    std::fs::rename(&node_path, &new_path).map_err(|e| CommandError::WriteError {
        message: format!("Failed to rename: {}", e),
    })?;

    Ok(())
}

#[tauri::command]
pub fn skill_node_delete(
    slug: String,
    location: String,
    project_path: Option<String>,
    rel_path: String,
) -> Result<(), CommandError> {
    validate_slug(&slug)?;

    if rel_path == "/" {
        return Err(CommandError::WriteError {
            message: "Cannot delete skill root directory".to_string(),
        });
    }
    if rel_path == "/SKILL.md" {
        return Err(CommandError::WriteError {
            message: "Cannot delete SKILL.md".to_string(),
        });
    }

    let skill_root = resolve_skill_path(&slug, &location, project_path.as_deref())?;
    let node_path = resolve_node_path(&skill_root, &rel_path)?;

    if !node_path.exists() {
        return Err(CommandError::WriteError {
            message: format!("Path does not exist: '{}'", rel_path),
        });
    }

    if node_path.is_dir() {
        std::fs::remove_dir_all(&node_path).map_err(|e| CommandError::WriteError {
            message: format!("Failed to delete directory: {}", e),
        })?;
    } else {
        std::fs::remove_file(&node_path).map_err(|e| CommandError::WriteError {
            message: format!("Failed to delete file: {}", e),
        })?;
    }

    Ok(())
}

// ── File read/write commands (Story 2.4) ──

#[tauri::command]
pub fn skill_file_read(
    slug: String,
    location: String,
    project_path: Option<String>,
    rel_path: String,
) -> Result<String, CommandError> {
    validate_slug(&slug)?;

    let skill_root = resolve_skill_path(&slug, &location, project_path.as_deref())?;
    let file_path = resolve_node_path(&skill_root, &rel_path)?;

    if !file_path.is_file() {
        return Err(CommandError::ReadError {
            message: format!("Not a file: '{}'", rel_path),
        });
    }

    std::fs::read_to_string(&file_path).map_err(|e| CommandError::ReadError {
        message: format!("Failed to read file: {}", e),
    })
}

#[tauri::command]
pub fn skill_file_write(
    slug: String,
    location: String,
    project_path: Option<String>,
    rel_path: String,
    content: String,
) -> Result<(), CommandError> {
    validate_slug(&slug)?;

    let skill_root = resolve_skill_path(&slug, &location, project_path.as_deref())?;
    let file_path = resolve_node_path(&skill_root, &rel_path)?;

    if !file_path.exists() {
        return Err(CommandError::WriteError {
            message: format!("File does not exist: '{}'", rel_path),
        });
    }

    let parent = file_path.parent().ok_or_else(|| CommandError::WriteError {
        message: "Cannot determine parent directory".to_string(),
    })?;

    let file_name = file_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("tmp");
    let temp_path = parent.join(format!(".tmp_{}", file_name));

    std::fs::write(&temp_path, content.as_bytes()).map_err(|e| CommandError::WriteError {
        message: format!("Failed to write temp file: {}", e),
    })?;

    std::fs::rename(&temp_path, &file_path).map_err(|e| {
        let _ = std::fs::remove_file(&temp_path);
        CommandError::WriteError {
            message: format!("Failed to finalize write: {}", e),
        }
    })?;

    Ok(())
}

// ── Export command (Story 4.1) ──

/// Recursively add directory contents to a zip archive.
fn zip_dir_recursive(
    writer: &mut zip::ZipWriter<std::fs::File>,
    dir: &Path,
    prefix: &str,
    options: zip::write::SimpleFileOptions,
) -> Result<(), CommandError> {
    let entries = std::fs::read_dir(dir).map_err(|e| CommandError::ReadError {
        message: format!("Failed to read directory for export: {}", e),
    })?;

    let mut sorted: Vec<_> = entries.flatten().collect();
    sorted.sort_by_key(|e| e.file_name());

    for entry in sorted {
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_str().unwrap_or("");
        if name_str.is_empty() || name_str.starts_with('.') {
            continue;
        }

        let zip_path = if prefix.is_empty() {
            name_str.to_string()
        } else {
            format!("{}/{}", prefix, name_str)
        };

        if path.is_dir() {
            writer.add_directory(&zip_path, options).map_err(|e| CommandError::WriteError {
                message: format!("Failed to add directory to zip: {}", e),
            })?;
            zip_dir_recursive(writer, &path, &zip_path, options)?;
        } else if path.is_file() {
            writer.start_file(&zip_path, options).map_err(|e| CommandError::WriteError {
                message: format!("Failed to start zip entry: {}", e),
            })?;
            let mut buf = Vec::new();
            std::fs::File::open(&path)
                .and_then(|mut f| f.read_to_end(&mut buf))
                .map_err(|e| CommandError::ReadError {
                    message: format!("Failed to read file for export: {}", e),
                })?;
            writer.write_all(&buf).map_err(|e| CommandError::WriteError {
                message: format!("Failed to write zip entry: {}", e),
            })?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn skill_export(
    slug: String,
    location: String,
    project_path: Option<String>,
    dest_path: String,
) -> Result<String, CommandError> {
    validate_slug(&slug)?;

    let skill_root = resolve_skill_path(&slug, &location, project_path.as_deref())?;
    if !skill_root.is_dir() {
        return Err(CommandError::ReadError {
            message: format!("Skill directory not found: '{}'", slug),
        });
    }

    // Determine output zip path (expand ~ before use)
    let dest = expand_tilde(&dest_path)?;
    let zip_path = if dest.is_dir() {
        dest.join(format!("{}.zip", slug))
    } else {
        // Reject paths that don't end in .zip to prevent overwriting arbitrary files
        let ext = dest.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext != "zip" {
            return Err(CommandError::WriteError {
                message: "Export destination must be a directory or a .zip file path".to_string(),
            });
        }
        dest
    };

    // Create zip file
    let zip_file = std::fs::File::create(&zip_path).map_err(|e| CommandError::WriteError {
        message: format!("Failed to create zip file: {}", e),
    })?;

    let mut writer = zip::ZipWriter::new(zip_file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // Add root directory entry
    writer.add_directory(&slug, options).map_err(|e| CommandError::WriteError {
        message: format!("Failed to create zip root dir: {}", e),
    })?;

    // Recursively add contents
    zip_dir_recursive(&mut writer, &skill_root, &slug, options)?;

    writer.finish().map_err(|e| CommandError::WriteError {
        message: format!("Failed to finalize zip: {}", e),
    })?;

    Ok(zip_path.to_string_lossy().to_string())
}

// ── Import commands (Story 5.x) ──

/// Extract a zip archive into a skill directory.
/// Returns the slug found in the zip.
fn extract_zip_to_skill(zip_path: &Path, dest_root: &Path) -> Result<String, CommandError> {
    let zip_file = std::fs::File::open(zip_path).map_err(|e| CommandError::ReadError {
        message: format!("Failed to open zip file: {}", e),
    })?;

    let mut archive = zip::ZipArchive::new(zip_file).map_err(|e| CommandError::ReadError {
        message: format!("Failed to read zip archive: {}", e),
    })?;

    // Determine the root folder name (slug) from the first entry
    let root_name = {
        let mut root: Option<String> = None;
        for i in 0..archive.len() {
            let file = archive.by_index(i).map_err(|e| CommandError::ReadError {
                message: format!("Failed to read zip entry: {}", e),
            })?;
            let name = file.name().to_string();
            let first_component = name.split('/').next().unwrap_or("").to_string();
            if !first_component.is_empty() {
                root = Some(first_component);
                break;
            }
        }
        root.ok_or_else(|| CommandError::ReadError {
            message: "Zip archive is empty".to_string(),
        })?
    };

    validate_slug(&root_name)?;

    // Validate SKILL.md exists in the zip
    let skill_md_path = format!("{}/SKILL.md", root_name);
    let has_skill_md = (0..archive.len()).any(|i| {
        archive.by_index(i).map(|f| f.name() == skill_md_path).unwrap_or(false)
    });

    if !has_skill_md {
        return Err(CommandError::ReadError {
            message: "Invalid skill package: SKILL.md not found at root".to_string(),
        });
    }

    // Extract all entries
    let skill_dest = dest_root.join(&root_name);
    std::fs::create_dir_all(&skill_dest).map_err(|e| CommandError::WriteError {
        message: format!("Failed to create skill directory: {}", e),
    })?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| CommandError::ReadError {
            message: format!("Failed to read zip entry: {}", e),
        })?;

        let entry_name = file.name().to_string();
        // Strip the root slug prefix
        let rel = entry_name.strip_prefix(&format!("{}/", root_name)).unwrap_or(&entry_name);
        if rel.is_empty() || rel == root_name {
            continue;
        }

        // Security: reject traversal
        for comp in Path::new(rel).components() {
            if let std::path::Component::ParentDir = comp {
                return Err(CommandError::WriteError {
                    message: format!("Zip contains path traversal: '{}'", entry_name),
                });
            }
        }

        let out_path = skill_dest.join(rel);

        if entry_name.ends_with('/') {
            std::fs::create_dir_all(&out_path).map_err(|e| CommandError::WriteError {
                message: format!("Failed to create directory: {}", e),
            })?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| CommandError::WriteError {
                    message: format!("Failed to create parent directory: {}", e),
                })?;
            }
            let mut content = Vec::new();
            file.read_to_end(&mut content).map_err(|e| CommandError::ReadError {
                message: format!("Failed to read zip file entry: {}", e),
            })?;
            std::fs::write(&out_path, &content).map_err(|e| CommandError::WriteError {
                message: format!("Failed to write extracted file: {}", e),
            })?;
        }
    }

    Ok(root_name)
}

#[tauri::command]
pub fn skill_import(
    zip_path: String,
    location: String,
    project_path: Option<String>,
    conflict_resolution: Option<String>,
) -> Result<SkillInfo, CommandError> {
    let zip = expand_tilde(&zip_path)?;
    if !zip.is_file() {
        return Err(CommandError::ReadError {
            message: format!("Zip file not found: '{}'", zip_path),
        });
    }

    // Determine skills root dir
    let skills_root = match location.as_str() {
        "personal" => {
            let home = std::env::var("HOME").map_err(|_| CommandError::ReadError {
                message: "Could not determine HOME directory".to_string(),
            })?;
            PathBuf::from(home).join(".claude").join("skills")
        }
        "project" => {
            let pp = project_path.as_deref().ok_or_else(|| CommandError::WriteError {
                message: "Project path required for project-level import".to_string(),
            })?;
            validate_project_path(pp)?;
            PathBuf::from(pp).join(".claude").join("skills")
        }
        _ => {
            return Err(CommandError::WriteError {
                message: format!("Invalid location: '{}'", location),
            });
        }
    };

    std::fs::create_dir_all(&skills_root).map_err(|e| CommandError::WriteError {
        message: format!("Failed to create skills directory: {}", e),
    })?;

    // Peek at zip to get slug
    let zip_file = std::fs::File::open(&zip).map_err(|e| CommandError::ReadError {
        message: format!("Failed to open zip file: {}", e),
    })?;
    let mut archive = zip::ZipArchive::new(zip_file).map_err(|e| CommandError::ReadError {
        message: format!("Failed to read zip archive: {}", e),
    })?;

    let slug = {
        let mut found: Option<String> = None;
        for i in 0..archive.len() {
            if let Ok(f) = archive.by_index(i) {
                let first = f.name().split('/').next().unwrap_or("").to_string();
                if !first.is_empty() {
                    found = Some(first);
                    break;
                }
            }
        }
        found.ok_or_else(|| CommandError::ReadError { message: "Empty zip archive".to_string() })?
    };
    drop(archive);

    validate_slug(&slug)?;

    let dest_dir = skills_root.join(&slug);
    let conflict = dest_dir.exists();

    if conflict {
        match conflict_resolution.as_deref() {
            Some("replace") => {
                // Backup existing, will restore on failure
                let backup = skills_root.join(format!(".backup_{}", slug));
                std::fs::rename(&dest_dir, &backup).map_err(|e| CommandError::WriteError {
                    message: format!("Failed to backup existing skill: {}", e),
                })?;

                let result = extract_zip_to_skill(&zip, &skills_root);
                if let Err(e) = result {
                    // Rollback
                    let _ = std::fs::remove_dir_all(&dest_dir);
                    let _ = std::fs::rename(&backup, &dest_dir);
                    return Err(e);
                }
                let _ = std::fs::remove_dir_all(&backup);
            }
            Some(resolution) if resolution.starts_with("rename:") => {
                let new_slug = resolution.strip_prefix("rename:").unwrap_or("");
                validate_slug(new_slug)?;
                let new_dest = skills_root.join(new_slug);
                if new_dest.exists() {
                    return Err(CommandError::WriteError {
                        message: format!("Skill '{}' already exists", new_slug),
                    });
                }
                // Extract with original slug then rename directory
                extract_zip_to_skill(&zip, &skills_root)?;
                if dest_dir.exists() {
                    std::fs::rename(&dest_dir, &new_dest).map_err(|e| CommandError::WriteError {
                        message: format!("Failed to rename after import: {}", e),
                    })?;
                }
                // Update name field in SKILL.md to match the new slug so display name is consistent
                let skill_md = new_dest.join("SKILL.md");
                if skill_md.is_file() {
                    if let Ok(content) = std::fs::read_to_string(&skill_md) {
                        let (mut fields, raw, body) = parse_frontmatter(&content);
                        if let Some(f) = fields.iter_mut().find(|(k, _)| k == "name") {
                            f.1 = new_slug.to_string();
                        }
                        let updated = serialize_frontmatter(&fields, &raw, &body);
                        let _ = std::fs::write(&skill_md, updated.as_bytes());
                    }
                }
                // Return info for new slug
                let loc = match location.as_str() {
                    "personal" => SkillLocation::Personal,
                    "desktop_skills" => SkillLocation::DesktopSkills,
                    "desktop_examples" => SkillLocation::DesktopExamples,
                    _ => SkillLocation::Project,
                };
                return skill_info_from_path(&new_dest, loc, project_path);
            }
            None => {
                return Err(CommandError::WriteError {
                    message: format!("{}{}", CONFLICT_PREFIX, slug),
                });
            }
            _ => {
                return Err(CommandError::WriteError {
                    message: "Invalid conflict_resolution. Use 'replace' or 'rename:<new_slug>'".to_string(),
                });
            }
        }
    } else {
        extract_zip_to_skill(&zip, &skills_root)?;
    }

    let loc = match location.as_str() {
        "personal" => SkillLocation::Personal,
        "desktop_skills" => SkillLocation::DesktopSkills,
        "desktop_examples" => SkillLocation::DesktopExamples,
        _ => SkillLocation::Project,
    };
    skill_info_from_path(&dest_dir, loc, project_path)
}

/// Recursively copy a directory and all its contents.
fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), CommandError> {
    std::fs::create_dir_all(dest).map_err(|e| CommandError::WriteError {
        message: format!("Failed to create directory: {}", e),
    })?;
    for entry in std::fs::read_dir(src)
        .map_err(|e| CommandError::ReadError {
            message: format!("Failed to read directory: {}", e),
        })?
        .flatten()
    {
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else {
            std::fs::copy(&src_path, &dest_path).map_err(|e| CommandError::WriteError {
                message: format!("Failed to copy file: {}", e),
            })?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn skill_copy(
    slug: String,
    src_location: String,
    src_project_path: Option<String>,
    dest_location: String,
    dest_project_path: Option<String>,
) -> Result<SkillInfo, CommandError> {
    validate_slug(&slug)?;

    let src_dir = resolve_skill_path(&slug, &src_location, src_project_path.as_deref())?;
    let dest_dir = resolve_skill_path(&slug, &dest_location, dest_project_path.as_deref())?;

    if !src_dir.is_dir() {
        return Err(CommandError::ReadError {
            message: format!("Source skill '{}' not found", slug),
        });
    }

    if dest_dir.exists() {
        return Err(CommandError::WriteError {
            message: format!("{}{}",  CONFLICT_PREFIX, slug),
        });
    }

    copy_dir_recursive(&src_dir, &dest_dir)?;

    let loc = match dest_location.as_str() {
        "personal" => SkillLocation::Personal,
        "desktop_skills" => SkillLocation::DesktopSkills,
        "desktop_examples" => SkillLocation::DesktopExamples,
        _ => SkillLocation::Project,
    };
    skill_info_from_path(&dest_dir, loc, dest_project_path)
}

/// Recursively build a SkillTreeNode tree from a directory.
/// Hidden files/directories (starting with '.') are skipped.
/// Directories are listed before files; entries within each group are sorted alphabetically.
fn read_tree_node(dir_path: &Path, rel_path: &str) -> SkillTreeNode {
    let name = dir_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let mut dir_children: Vec<SkillTreeNode> = Vec::new();
    let mut file_children: Vec<SkillTreeNode> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(dir_path) {
        let mut sorted: Vec<_> = entries.flatten().collect();
        sorted.sort_by_key(|e| e.file_name());

        for entry in sorted {
            let entry_name = entry.file_name();
            let entry_name_str = match entry_name.to_str() {
                Some(s) => s.to_string(),
                None => continue,
            };
            // Skip hidden files/dirs
            if entry_name_str.starts_with('.') {
                continue;
            }
            let child_path = entry.path();
            let child_rel = if rel_path == "/" {
                format!("/{}", entry_name_str)
            } else {
                format!("{}/{}", rel_path, entry_name_str)
            };

            if child_path.is_dir() {
                dir_children.push(read_tree_node(&child_path, &child_rel));
            } else if child_path.is_file() {
                file_children.push(SkillTreeNode {
                    name: entry_name_str,
                    path: child_rel,
                    node_type: "file".to_string(),
                    children: Vec::new(),
                });
            }
        }
    }

    let mut children = dir_children;
    children.extend(file_children);

    SkillTreeNode {
        name,
        path: rel_path.to_string(),
        node_type: "dir".to_string(),
        children,
    }
}

#[tauri::command]
pub fn skill_tree_read(
    slug: String,
    location: String,
    project_path: Option<String>,
) -> Result<SkillTreeNode, CommandError> {
    validate_slug(&slug)?;
    let skill_dir = resolve_skill_path(&slug, &location, project_path.as_deref())?;

    if !skill_dir.is_dir() {
        return Err(CommandError::ReadError {
            message: format!("Skill directory not found: '{}'", slug),
        });
    }

    Ok(read_tree_node(&skill_dir, "/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    // ── validate_slug tests ──

    #[test]
    fn test_validate_slug_valid() {
        for slug in &["my-skill", "skill123", "a", "a-b-c", "abc123def"] {
            assert!(is_valid_slug(slug), "Expected '{}' to be valid", slug);
        }
    }

    #[test]
    fn test_validate_slug_invalid() {
        for slug in &[
            "My Skill",
            "skill_name",
            "CAPS",
            "",
            "--double",
            "-leading",
            "trailing-",
            &"a".repeat(65),
            "../traversal",
            "a..b",
        ] {
            assert!(!is_valid_slug(slug), "Expected '{}' to be invalid", slug);
        }
    }

    // ── parse_frontmatter tests ──

    #[test]
    fn test_parse_frontmatter_basic() {
        let content = "---\nname: my-skill\ndescription: A cool skill\nuser-invocable: true\n---\n\nSome body content.";
        let (fields, raw, body) = parse_frontmatter(content);
        assert_eq!(fields.len(), 3);
        assert_eq!(fields[0], ("name".to_string(), "my-skill".to_string()));
        assert_eq!(fields[1], ("description".to_string(), "A cool skill".to_string()));
        assert_eq!(fields[2], ("user-invocable".to_string(), "true".to_string()));
        assert!(raw.is_empty());
        assert_eq!(body, "Some body content.");
    }

    #[test]
    fn test_parse_frontmatter_empty() {
        let content = "No frontmatter here.";
        let (fields, raw, body) = parse_frontmatter(content);
        assert!(fields.is_empty());
        assert!(raw.is_empty());
        assert_eq!(body, "No frontmatter here.");
    }

    #[test]
    fn test_parse_frontmatter_missing_closing_delimiter() {
        let content = "---\nname: orphan\ndescription: no close";
        let (fields, raw, body) = parse_frontmatter(content);
        assert_eq!(fields.len(), 2);
        assert_eq!(fields[0].0, "name");
        assert!(raw.is_empty());
        assert!(body.is_empty());
    }

    #[test]
    fn test_parse_frontmatter_preserves_unparseable_lines() {
        let content = "---\nname: test\n- list item\ndescription: hello\n---\n";
        let (fields, raw, _body) = parse_frontmatter(content);
        assert_eq!(fields.len(), 2);
        assert_eq!(raw.len(), 1);
        assert!(raw[0].contains("- list item"));
    }

    #[test]
    fn test_serialize_frontmatter_preserves_order() {
        let fields = vec![
            ("name".to_string(), "my-skill".to_string()),
            ("description".to_string(), "Cool".to_string()),
        ];
        let result = serialize_frontmatter(&fields, &[], "");
        let lines: Vec<&str> = result.lines().collect();
        assert_eq!(lines[0], "---");
        assert_eq!(lines[1], "name: my-skill");
        assert_eq!(lines[2], "description: Cool");
        assert_eq!(lines[3], "---");
    }

    #[test]
    fn test_serialize_frontmatter_includes_raw_lines() {
        let fields = vec![("name".to_string(), "test".to_string())];
        let raw = vec!["# a comment".to_string()];
        let result = serialize_frontmatter(&fields, &raw, "body");
        assert!(result.contains("# a comment"));
        assert!(result.contains("name: test"));
        assert!(result.contains("body"));
    }

    #[test]
    fn test_serialize_frontmatter_roundtrip() {
        let original = "---\nname: my-skill\ndescription: A cool skill\nuser-invocable: true\n---\n\nBody text here.";
        let (fields, raw, body) = parse_frontmatter(original);
        let result = serialize_frontmatter(&fields, &raw, &body);
        let (fields2, raw2, body2) = parse_frontmatter(&result);
        assert_eq!(fields, fields2);
        assert_eq!(raw, raw2);
        assert_eq!(body.trim(), body2.trim());
    }

    #[test]
    fn test_parse_frontmatter_boolean_values() {
        let content = "---\ndisable-model-invocation: true\n---\n";
        let (fields, _, _) = parse_frontmatter(content);
        assert_eq!(fields[0], ("disable-model-invocation".to_string(), "true".to_string()));
    }

    #[test]
    fn test_parse_frontmatter_quoted_values() {
        let content1 = "---\ndescription: 'My skill'\n---\n";
        let (fields1, _, _) = parse_frontmatter(content1);
        assert_eq!(fields1[0].1, "My skill");

        let content2 = "---\ndescription: \"My skill\"\n---\n";
        let (fields2, _, _) = parse_frontmatter(content2);
        assert_eq!(fields2[0].1, "My skill");
    }

    #[test]
    fn test_body_preview_truncation() {
        let long_body = "a".repeat(250);
        let content = format!("---\nname: test\n---\n\n{}", long_body);
        let dir = TempDir::new().unwrap();
        let skill_dir = dir.path().join("test");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), &content).unwrap();

        let info = skill_info_from_path(&skill_dir, SkillLocation::Personal, None).unwrap();
        let preview = info.body_preview.unwrap();
        assert!(preview.ends_with("..."));
        // 200 chars + "..."
        assert_eq!(preview.chars().count(), 203);
    }

    #[test]
    fn test_body_preview_short_body() {
        let content = "---\nname: test\n---\n\nShort body.";
        let dir = TempDir::new().unwrap();
        let skill_dir = dir.path().join("test");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), content).unwrap();

        let info = skill_info_from_path(&skill_dir, SkillLocation::Personal, None).unwrap();
        assert_eq!(info.body_preview.unwrap(), "Short body.");
    }

    #[test]
    fn test_discover_skills_skips_dirs_without_skill_md() {
        let dir = TempDir::new().unwrap();
        let personal = dir.path().join("personal");
        fs::create_dir_all(personal.join("valid-skill")).unwrap();
        fs::write(
            personal.join("valid-skill").join("SKILL.md"),
            "---\nname: valid-skill\n---\n",
        )
        .unwrap();
        fs::create_dir_all(personal.join("no-skill-md")).unwrap();
        // no SKILL.md in this one

        let skills = discover_skills(&personal, &[]);
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].slug, "valid-skill");
    }

    #[test]
    fn test_update_frontmatter_rejects_unknown_key() {
        assert!(!FRONTMATTER_KEY_WHITELIST.contains(&"unknown-key"));
    }

    // ── skill_tree_read tests ──

    #[test]
    fn test_skill_tree_read_returns_tree() {
        let dir = TempDir::new().unwrap();
        let skill_dir = dir.path().join("my-skill");
        fs::create_dir_all(skill_dir.join("docs")).unwrap();
        fs::write(skill_dir.join("SKILL.md"), "---\nname: my-skill\n---\n").unwrap();
        fs::write(skill_dir.join("docs").join("guide.md"), "Guide content").unwrap();

        let tree = read_tree_node(&skill_dir, "/");
        assert_eq!(tree.name, "my-skill");
        assert_eq!(tree.path, "/");
        assert_eq!(tree.node_type, "dir");
        // docs dir comes first
        assert_eq!(tree.children[0].name, "docs");
        assert_eq!(tree.children[0].node_type, "dir");
        // SKILL.md is a file child
        let file_child = tree.children.iter().find(|c| c.name == "SKILL.md");
        assert!(file_child.is_some());
        assert_eq!(file_child.unwrap().node_type, "file");
        assert_eq!(file_child.unwrap().path, "/SKILL.md");
    }

    #[test]
    fn test_skill_tree_skips_hidden_files() {
        let dir = TempDir::new().unwrap();
        let skill_dir = dir.path().join("my-skill");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), "---\nname: my-skill\n---\n").unwrap();
        fs::write(skill_dir.join(".hidden"), "should be skipped").unwrap();
        fs::create_dir_all(skill_dir.join(".git")).unwrap();

        let tree = read_tree_node(&skill_dir, "/");
        assert!(tree.children.iter().all(|c| !c.name.starts_with('.')));
    }

    #[test]
    fn test_skill_tree_dirs_before_files() {
        let dir = TempDir::new().unwrap();
        let skill_dir = dir.path().join("my-skill");
        fs::create_dir_all(skill_dir.join("assets")).unwrap();
        fs::write(skill_dir.join("SKILL.md"), "---\nname: my-skill\n---\n").unwrap();
        fs::write(skill_dir.join("assets").join("img.png"), "fake").unwrap();
        fs::write(skill_dir.join("readme.md"), "readme").unwrap();

        let tree = read_tree_node(&skill_dir, "/");
        let dir_idx = tree.children.iter().position(|c| c.node_type == "dir").unwrap();
        let file_idx = tree.children.iter().position(|c| c.node_type == "file").unwrap();
        assert!(dir_idx < file_idx, "dirs must come before files");
    }

    // ── validate_node_name tests ──

    #[test]
    fn test_validate_node_name_valid() {
        assert!(validate_node_name("guide.md").is_ok());
        assert!(validate_node_name("my-docs").is_ok());
        assert!(validate_node_name("file_name.txt").is_ok());
        assert!(validate_node_name("README").is_ok());
    }

    #[test]
    fn test_validate_node_name_rejects_traversal() {
        assert!(validate_node_name("..").is_err());
        assert!(validate_node_name("../secret").is_err());
    }

    #[test]
    fn test_validate_node_name_rejects_slash() {
        assert!(validate_node_name("a/b").is_err());
        assert!(validate_node_name("/abs").is_err());
    }

    #[test]
    fn test_validate_node_name_rejects_empty() {
        assert!(validate_node_name("").is_err());
    }

    #[test]
    fn test_validate_node_name_rejects_hidden() {
        assert!(validate_node_name(".hidden").is_err());
        assert!(validate_node_name(".git").is_err());
        assert!(validate_node_name(".DS_Store").is_err());
    }

    // ── resolve_node_path tests ──

    #[test]
    fn test_resolve_node_path_root() {
        let dir = TempDir::new().unwrap();
        let result = resolve_node_path(dir.path(), "/").unwrap();
        assert_eq!(result, dir.path().to_path_buf());
    }

    #[test]
    fn test_resolve_node_path_nested() {
        let dir = TempDir::new().unwrap();
        let result = resolve_node_path(dir.path(), "/docs/guide.md").unwrap();
        assert_eq!(result, dir.path().join("docs/guide.md"));
    }

    #[test]
    fn test_resolve_node_path_rejects_traversal() {
        let dir = TempDir::new().unwrap();
        assert!(resolve_node_path(dir.path(), "/../secret").is_err());
        assert!(resolve_node_path(dir.path(), "/../../etc/passwd").is_err());
    }

    // ── skill_node_create tests ──

    /// Create `{base}/.claude/skills/{slug}/SKILL.md` and return the skill dir.
    /// Tests use location="project" with base as the project_path so we avoid
    /// touching $HOME and keep tests hermetic.
    fn make_skill_dir(base: &Path, slug: &str) -> PathBuf {
        let skill_dir = base.join(".claude/skills").join(slug);
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), format!("---\nname: {}\n---\n", slug)).unwrap();
        skill_dir
    }

    #[test]
    fn test_skill_node_create_file() {
        let dir = TempDir::new().unwrap();
        let base = dir.path().to_str().unwrap().to_string();
        make_skill_dir(dir.path(), "my-skill");

        let result = skill_node_create(
            "my-skill".to_string(),
            "project".to_string(),
            Some(base.clone()),
            "/".to_string(),
            "notes.md".to_string(),
            "file".to_string(),
        );
        assert!(result.is_ok(), "{:?}", result);
        assert!(dir.path().join(".claude/skills/my-skill/notes.md").exists());
    }

    #[test]
    fn test_skill_node_create_dir() {
        let dir = TempDir::new().unwrap();
        let base = dir.path().to_str().unwrap().to_string();
        make_skill_dir(dir.path(), "my-skill");

        let result = skill_node_create(
            "my-skill".to_string(),
            "project".to_string(),
            Some(base),
            "/".to_string(),
            "assets".to_string(),
            "dir".to_string(),
        );
        assert!(result.is_ok(), "{:?}", result);
        assert!(dir.path().join(".claude/skills/my-skill/assets").is_dir());
    }

    #[test]
    fn test_skill_node_create_rejects_existing() {
        let dir = TempDir::new().unwrap();
        let base = dir.path().to_str().unwrap().to_string();
        make_skill_dir(dir.path(), "my-skill");

        // SKILL.md already exists
        let result = skill_node_create(
            "my-skill".to_string(),
            "project".to_string(),
            Some(base),
            "/".to_string(),
            "SKILL.md".to_string(),
            "file".to_string(),
        );
        assert!(result.is_err());
    }

    // ── skill_node_rename tests ──

    #[test]
    fn test_skill_node_rename_file() {
        let dir = TempDir::new().unwrap();
        let base = dir.path().to_str().unwrap().to_string();
        let skill_dir = make_skill_dir(dir.path(), "my-skill");
        fs::write(skill_dir.join("old.md"), "content").unwrap();

        let result = skill_node_rename(
            "my-skill".to_string(),
            "project".to_string(),
            Some(base),
            "/old.md".to_string(),
            "new.md".to_string(),
        );
        assert!(result.is_ok(), "{:?}", result);
        assert!(skill_dir.join("new.md").exists());
        assert!(!skill_dir.join("old.md").exists());
    }

    #[test]
    fn test_skill_node_rename_rejects_root() {
        let dir = TempDir::new().unwrap();
        let base = dir.path().to_str().unwrap().to_string();
        make_skill_dir(dir.path(), "my-skill");

        let result = skill_node_rename(
            "my-skill".to_string(),
            "project".to_string(),
            Some(base),
            "/".to_string(),
            "other".to_string(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_skill_node_rename_rejects_skill_md() {
        let dir = TempDir::new().unwrap();
        let base = dir.path().to_str().unwrap().to_string();
        make_skill_dir(dir.path(), "my-skill");

        let result = skill_node_rename(
            "my-skill".to_string(),
            "project".to_string(),
            Some(base),
            "/SKILL.md".to_string(),
            "other.md".to_string(),
        );
        assert!(result.is_err());
    }

    // ── skill_node_delete tests ──

    #[test]
    fn test_skill_node_delete_file() {
        let dir = TempDir::new().unwrap();
        let base = dir.path().to_str().unwrap().to_string();
        let skill_dir = make_skill_dir(dir.path(), "my-skill");
        fs::write(skill_dir.join("to-delete.md"), "bye").unwrap();

        let result = skill_node_delete(
            "my-skill".to_string(),
            "project".to_string(),
            Some(base),
            "/to-delete.md".to_string(),
        );
        assert!(result.is_ok(), "{:?}", result);
        assert!(!skill_dir.join("to-delete.md").exists());
    }

    #[test]
    fn test_skill_node_delete_dir_recursive() {
        let dir = TempDir::new().unwrap();
        let base = dir.path().to_str().unwrap().to_string();
        let skill_dir = make_skill_dir(dir.path(), "my-skill");
        fs::create_dir_all(skill_dir.join("docs")).unwrap();
        fs::write(skill_dir.join("docs/guide.md"), "x").unwrap();

        let result = skill_node_delete(
            "my-skill".to_string(),
            "project".to_string(),
            Some(base),
            "/docs".to_string(),
        );
        assert!(result.is_ok(), "{:?}", result);
        assert!(!skill_dir.join("docs").exists());
    }

    #[test]
    fn test_skill_node_delete_rejects_root() {
        let dir = TempDir::new().unwrap();
        let base = dir.path().to_str().unwrap().to_string();
        make_skill_dir(dir.path(), "my-skill");

        let result = skill_node_delete(
            "my-skill".to_string(),
            "project".to_string(),
            Some(base),
            "/".to_string(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_skill_node_delete_rejects_skill_md() {
        let dir = TempDir::new().unwrap();
        let base = dir.path().to_str().unwrap().to_string();
        make_skill_dir(dir.path(), "my-skill");

        let result = skill_node_delete(
            "my-skill".to_string(),
            "project".to_string(),
            Some(base),
            "/SKILL.md".to_string(),
        );
        assert!(result.is_err());
    }

    // ── skill_file_read / skill_file_write tests ──

    #[test]
    fn test_skill_file_read_returns_content() {
        let dir = TempDir::new().unwrap();
        let base = dir.path().to_str().unwrap().to_string();
        let skill_dir = make_skill_dir(dir.path(), "my-skill");
        fs::write(skill_dir.join("SKILL.md"), "---\nname: my-skill\n---\n\nHello world").unwrap();

        let result = skill_file_read(
            "my-skill".to_string(),
            "project".to_string(),
            Some(base),
            "/SKILL.md".to_string(),
        );
        assert!(result.is_ok(), "{:?}", result);
        assert!(result.unwrap().contains("Hello world"));
    }

    #[test]
    fn test_skill_file_read_rejects_directory() {
        let dir = TempDir::new().unwrap();
        let base = dir.path().to_str().unwrap().to_string();
        make_skill_dir(dir.path(), "my-skill");

        let result = skill_file_read(
            "my-skill".to_string(),
            "project".to_string(),
            Some(base),
            "/".to_string(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_skill_file_write_atomic() {
        let dir = TempDir::new().unwrap();
        let base = dir.path().to_str().unwrap().to_string();
        let skill_dir = make_skill_dir(dir.path(), "my-skill");

        let result = skill_file_write(
            "my-skill".to_string(),
            "project".to_string(),
            Some(base),
            "/SKILL.md".to_string(),
            "---\nname: my-skill\n---\n\nUpdated body".to_string(),
        );
        assert!(result.is_ok(), "{:?}", result);

        let content = fs::read_to_string(skill_dir.join("SKILL.md")).unwrap();
        assert!(content.contains("Updated body"));
        // Temp file should be cleaned up
        assert!(!skill_dir.join(".tmp_SKILL.md").exists());
    }

    #[test]
    fn test_skill_file_write_rejects_nonexistent() {
        let dir = TempDir::new().unwrap();
        let base = dir.path().to_str().unwrap().to_string();
        make_skill_dir(dir.path(), "my-skill");

        let result = skill_file_write(
            "my-skill".to_string(),
            "project".to_string(),
            Some(base),
            "/ghost.md".to_string(),
            "content".to_string(),
        );
        assert!(result.is_err());
    }
}
