use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;
use url::Url;

/// Content categories for clipboard items
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Category {
    Text,
    Link,
    Image,
    Code,
    Email,
    FilePath,
}

impl std::fmt::Display for Category {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Category::Text => write!(f, "text"),
            Category::Link => write!(f, "link"),
            Category::Image => write!(f, "image"),
            Category::Code => write!(f, "code"),
            Category::Email => write!(f, "email"),
            Category::FilePath => write!(f, "file_path"),
        }
    }
}

// ─── Pre-compiled patterns ──────────────────────────────────────────

static EMAIL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$").unwrap()
});

static WINDOWS_PATH_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"^[A-Za-z]:\\(.+\\)*[^\\/:*?"<>|]+$"#).unwrap()
});

static UNIX_PATH_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(/[^/\x00]+)+/?$").unwrap()
});

// ─── Code detection patterns (used for scoring) ─────────────────────

/// Keywords that strongly indicate code (weight: 3 each)
static CODE_KEYWORDS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?m)\b(fn|func|function|def|class|struct|enum|interface|trait|impl|module|package|import|export|from|require|include|const|let|var|val|mut|public|private|protected|async|await|return|throw|try|catch|finally|match|switch|foreach|typeof|instanceof)\b|#include|<\?php|<!DOCTYPE|<html|@media|@keyframes|@import").unwrap()
});

/// Syntax patterns that indicate code (weight: 2 each)
static CODE_SYNTAX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"=>\s*[\{\(]|->\s*[\{\(]|\b\w+\s*::\s*\w+|\.\w+\s*\([^)]*\)|\bnew\s+\w+").unwrap()
});

/// CSS property declarations: `property: value;` or `property: value}`
static CSS_PROPERTY_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(margin|padding|width|height|display|flex|grid|position|color|background|border|font-size|font-weight|font-family|text-align|text-decoration|overflow|transform|transition|animation|justify-content|align-items|flex-direction|box-shadow|border-radius|z-index|opacity|cursor|outline|top|left|right|bottom|min-width|max-width|min-height|max-height|line-height|letter-spacing|white-space|word-break|vertical-align|float|clear|visibility|content|src|gap|object-fit|pointer-events|user-select|box-sizing|list-style)\s*:\s*[^;}{]+[;}]").unwrap()
});

/// CSS selector block: `selector { ... }`
static CSS_SELECTOR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[.#][\w\-]+\s*\{[^}]*\}|[\w\-]+\s*\{[^}]*:[^}]*\}").unwrap()
});

/// HTML/XML tags
static HTML_TAG_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"<\/?[a-zA-Z][\w\-]*(\s+[\w\-]+(="[^"]*")?)*\s*/?\s*>|<\w+\s[^>]+>"#).unwrap()
});

/// SQL keywords
static SQL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(SELECT|INSERT INTO|UPDATE.*SET|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE|FROM\s+\w+|WHERE\s+\w+|JOIN\s+\w+|GROUP BY|ORDER BY|HAVING|UNION|INDEX)\b").unwrap()
});

/// Shell/command patterns
static SHELL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?m)^\s*\$\s+\w+|#!/bin/|\b(sudo|apt-get|apt|npm|pnpm|yarn|pip|cargo|docker|git|curl|wget|chmod|chown|mkdir)\b").unwrap()
});

/// Generic code structure
static CODE_STRUCTURE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?m)\{[\s]*$|^[\s]*\}|;\s*$|//[^\n]*$|/\*.*\*/"#).unwrap()
});

// Threshold to classify as code
const CODE_SCORE_THRESHOLD: i32 = 4;

/// Score the content for code-likeness and classify
fn score_code(text: &str) -> i32 {
    let mut score: i32 = 0;
    let line_count = text.lines().count();

    // Strong keywords: 3 points each, max 9
    let kw_matches: usize = CODE_KEYWORDS.find_iter(text).take(3).count();
    score += kw_matches as i32 * 3;

    // Syntax patterns: 2 points each, max 6
    let syn_matches: usize = CODE_SYNTAX.find_iter(text).take(3).count();
    score += syn_matches as i32 * 2;

    // CSS property declarations: 2 points each, max 6
    let css_prop_matches: usize = CSS_PROPERTY_RE.find_iter(text).take(3).count();
    score += css_prop_matches as i32 * 2;

    // CSS selector blocks: 3 points (strong signal)
    if CSS_SELECTOR_RE.is_match(text) {
        score += 3;
    }

    // HTML tags: 2 points each, max 4
    let html_matches: usize = HTML_TAG_RE.find_iter(text).take(2).count();
    score += html_matches as i32 * 2;

    // SQL keywords: 2 points each, max 4
    let sql_matches: usize = SQL_RE.find_iter(text).take(2).count();
    score += sql_matches as i32 * 2;

    // Shell patterns: 2 points each, max 4
    let shell_matches: usize = SHELL_RE.find_iter(text).take(2).count();
    score += shell_matches as i32 * 2;

    // Generic code structure: 1 point each, max 5
    let struct_matches: usize = CODE_STRUCTURE.find_iter(text).take(5).count();
    score += struct_matches as i32;

    // Multi-line bonus: +2 if more than 1 line
    if line_count > 1 {
        score += 2;
    }

    // Heavy multi-line bonus: +3 if more than 5 lines with structure
    if line_count > 5 && struct_matches >= 2 {
        score += 3;
    }

    // Penalty: if text looks like natural language (no structure markers)
    let has_semicolon = text.contains(';');
    let has_braces = text.contains('{') || text.contains('}');
    if !has_semicolon && !has_braces && line_count <= 3
        && kw_matches == 0 && css_prop_matches == 0
        && html_matches == 0 && !CSS_SELECTOR_RE.is_match(text)
    {
        score -= 3;
    }

    score
}

/// Classify text content into a category
pub fn classify_text(text: &str) -> Category {
    let trimmed = text.trim();

    // Empty or whitespace
    if trimmed.is_empty() {
        return Category::Text;
    }

    // Check for URL/Link (must be a single URL, not embedded in other text)
    if trimmed.lines().count() <= 2
        && Url::parse(trimmed).is_ok()
        && (trimmed.starts_with("http://")
            || trimmed.starts_with("https://")
            || trimmed.starts_with("ftp://"))
    {
        return Category::Link;
    }

    // Check for email
    if EMAIL_RE.is_match(trimmed) {
        return Category::Email;
    }

    // Check for file path (single line only)
    if trimmed.lines().count() == 1
        && (WINDOWS_PATH_RE.is_match(trimmed) || UNIX_PATH_RE.is_match(trimmed))
    {
        return Category::FilePath;
    }

    // Check for JSON-like content
    if (trimmed.starts_with('{') && trimmed.ends_with('}'))
        || (trimmed.starts_with('[') && trimmed.ends_with(']'))
    {
        if trimmed.contains(':') || trimmed.contains(',') {
            return Category::Code;
        }
    }

    // Score-based code detection
    if score_code(trimmed) >= CODE_SCORE_THRESHOLD {
        return Category::Code;
    }

    Category::Text
}

/// Classify image content
pub fn classify_image() -> Category {
    Category::Image
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_link() {
        assert_eq!(classify_text("https://example.com"), Category::Link);
        assert_eq!(classify_text("http://foo.bar/baz?q=1"), Category::Link);
    }

    #[test]
    fn test_classify_email() {
        assert_eq!(classify_text("user@example.com"), Category::Email);
    }

    #[test]
    fn test_classify_code_rust() {
        let code = "fn main() {\n    println!(\"hello\");\n}";
        assert_eq!(classify_text(code), Category::Code);
    }

    #[test]
    fn test_classify_code_css_multiline() {
        let css = "figure.elementor-image-box-img {\n  width: 100% !important;\n  display: flex;\n  justify-content: center;\n}";
        assert_eq!(classify_text(css), Category::Code, "CSS multi-line should be code");
    }

    #[test]
    fn test_classify_code_css_inline() {
        let css = ".container { display: flex; align-items: center; }";
        assert_eq!(classify_text(css), Category::Code, "CSS inline should be code");
    }

    #[test]
    fn test_classify_code_css_property() {
        let css = "justify-content: center; display: flex;";
        assert_eq!(classify_text(css), Category::Code, "CSS properties should be code");
    }

    #[test]
    fn test_classify_code_js() {
        let js = "const arr = [1, 2, 3].map(x => x * 2);\nconsole.log(arr);";
        assert_eq!(classify_text(js), Category::Code, "JS should be code");
    }

    #[test]
    fn test_classify_code_python() {
        let py = "def hello():\n    print(\"world\")\n    return True";
        assert_eq!(classify_text(py), Category::Code, "Python should be code");
    }

    #[test]
    fn test_classify_code_html() {
        let html = "<div class=\"container\">\n  <h1>Hello</h1>\n  <p>World</p>\n</div>";
        assert_eq!(classify_text(html), Category::Code, "HTML should be code");
    }

    #[test]
    fn test_classify_json() {
        let json = "{\n  \"name\": \"test\",\n  \"version\": \"1.0\"\n}";
        assert_eq!(classify_text(json), Category::Code, "JSON should be code");
    }

    #[test]
    fn test_classify_text() {
        assert_eq!(classify_text("Hello, world!"), Category::Text);
        assert_eq!(classify_text("这是一段普通的中文文本"), Category::Text);
        assert_eq!(classify_text("The quick brown fox jumps over the lazy dog"), Category::Text);
    }

    #[test]
    fn test_classify_windows_path() {
        assert_eq!(classify_text(r"C:\Users\test\file.txt"), Category::FilePath);
    }

    #[test]
    fn test_natural_text_not_code() {
        assert_ne!(classify_text("今天天气不错，适合出去走走"), Category::Code);
        assert_ne!(classify_text("Check out the documentation for more info"), Category::Code);
    }
}
