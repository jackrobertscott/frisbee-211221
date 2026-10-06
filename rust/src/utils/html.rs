//! Port of `server/src/utils/html.ts`.

/// `html.escape(value)`: escapes every HTML special character, ampersands first.
pub fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    use super::*;

    // html.escape (utils/mail.test.ts)
    #[test]
    fn escapes_every_html_special_character_ampersands_first() {
        assert_eq!(
            escape(r#"<a href="x" title='y'>&amp;</a>"#),
            "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;amp;&lt;/a&gt;"
        );
        assert_eq!(escape("plain"), "plain");
    }
}
