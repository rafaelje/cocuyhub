use crate::errors::CommandError;
use crate::models::{SkillInfo, SkillLocation};
use std::path::{Path, PathBuf};

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
    if bytes.len() >= 2 {
        if (bytes[0] == b'\'' && bytes[bytes.len() - 1] == b'\'')
            || (bytes[0] == b'"' && bytes[bytes.len() - 1] == b'"')
        {
            return s[1..s.len() - 1].to_string();
        }
    }
    s.to_string()
}

/// Sanitize a frontmatter value: strip newlines to prevent YAML injection.
fn sanitize_frontmatter_value(value: &str) -> String {
    value.replace('\n', " ").replace('\r', " ")
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
    })
}

/// Discover skills from personal and project directories.
pub(crate) fn discover_skills(
    personal_dir: &Path,
    project_dirs: &[(String, PathBuf)],
) -> Vec<SkillInfo> {
    let mut skills = Vec::new();

    // Personal skills
    if personal_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(personal_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() && path.join("SKILL.md").exists() {
                    if let Ok(info) =
                        skill_info_from_path(&path, SkillLocation::Personal, None)
                    {
                        skills.push(info);
                    }
                }
            }
        }
    }

    // Project skills
    for (project_path, skills_dir) in project_dirs {
        if skills_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(skills_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() && path.join("SKILL.md").exists() {
                        if let Ok(info) = skill_info_from_path(
                            &path,
                            SkillLocation::Project,
                            Some(project_path.clone()),
                        ) {
                            skills.push(info);
                        }
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
    let mut frontmatter = format!("---\nname: {}\n", safe_name);
    if !safe_desc.is_empty() {
        frontmatter.push_str(&format!("description: {}\n", safe_desc));
    }
    frontmatter.push_str("---\n");

    let skill_md_path = skill_dir.join("SKILL.md");
    std::fs::write(&skill_md_path, &frontmatter).map_err(|e| CommandError::WriteError {
        message: format!("Failed to write SKILL.md: {}", e),
    })?;

    let loc = match location.as_str() {
        "personal" => SkillLocation::Personal,
        "project" => SkillLocation::Project,
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
}
