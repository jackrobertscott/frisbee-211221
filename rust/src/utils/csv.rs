//! Port of `server/src/utils/csv.ts`.

use indexmap::IndexMap;
use serde_json::Value;

/// `parseCSVRows(csv)`.
pub fn parse_csv_rows(csv: &str) -> Vec<Vec<String>> {
    let chars: Vec<char> = csv.chars().collect();
    let mut rows = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut token = String::new();
    let mut in_quotes = false;
    let mut index = 0;
    while index < chars.len() {
        let c = chars[index];
        if c == '"' {
            if in_quotes && chars.get(index + 1) == Some(&'"') {
                token.push('"');
                index += 1;
            } else {
                in_quotes = !in_quotes;
            }
            index += 1;
            continue;
        }
        if c == ',' && !in_quotes {
            row.push(std::mem::take(&mut token));
            index += 1;
            continue;
        }
        if (c == '\n' || c == '\r') && !in_quotes {
            row.push(std::mem::take(&mut token));
            rows.push(std::mem::take(&mut row));
            if c == '\r' && chars.get(index + 1) == Some(&'\n') {
                index += 1;
            }
            index += 1;
            continue;
        }
        token.push(c);
        index += 1;
    }
    if !token.is_empty() || !row.is_empty() || csv.ends_with(',') {
        row.push(token);
        rows.push(row);
    }
    rows
}

/// `parseCSVString(csv)`: rows keyed by the trimmed header; later duplicate
/// headers win (keeping the first one's position).
pub fn parse_csv_string(csv: &str) -> Vec<IndexMap<String, String>> {
    let rows: Vec<Vec<String>> = parse_csv_rows(csv)
        .into_iter()
        .filter(|row| row.iter().any(|token| !crate::js::trim(token).is_empty()))
        .collect();
    let Some((head, body)) = rows.split_first() else {
        return Vec::new();
    };
    let cols: Vec<String> = head
        .iter()
        .map(|token| {
            let trimmed = crate::js::trim(token);
            trimmed.strip_prefix('\u{FEFF}').unwrap_or(trimmed).to_string()
        })
        .collect();
    body.iter()
        .map(|tokens| {
            let mut all = IndexMap::new();
            for (index, key) in cols.iter().enumerate() {
                let value = tokens.get(index).map(|t| crate::js::trim(t).to_string()).unwrap_or_default();
                all.insert(key.clone(), value);
            }
            all
        })
        .collect()
}

/// `csvEscape(value)` for strings.
pub fn csv_escape(value: &str) -> String {
    if value.contains(['"', ',', '\r', '\n']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

/// `csvEscape(value)` for any JSON value: `null`/missing become empty and
/// everything else is stringified like `String(value)`.
pub fn csv_escape_value(value: Option<&Value>) -> String {
    let text = match value {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => crate::js::number_to_string(n.as_f64().unwrap_or(f64::NAN)),
        Some(Value::Array(items)) => items.iter().map(|item| csv_escape_value(Some(item))).collect::<Vec<_>>().join(","),
        Some(Value::Object(_)) => "[object Object]".into(),
    };
    csv_escape(&text)
}

/// `replaceCSVHeader(buffer, headers)`: swaps the first record for `headers`,
/// keeping a BOM and the rest of the text as-is.
pub fn replace_csv_header(csv: &[u8], headers: &[&str]) -> Vec<u8> {
    let text = String::from_utf8_lossy(csv);
    let (bom, body) = match text.strip_prefix('\u{FEFF}') {
        Some(rest) => ("\u{FEFF}", rest),
        None => ("", text.as_ref()),
    };
    let end = find_first_csv_record_end(body);
    let header = headers.iter().map(|h| csv_escape(h)).collect::<Vec<_>>().join(",");
    format!("{bom}{header}{}", &body[end..]).into_bytes()
}

fn find_first_csv_record_end(text: &str) -> usize {
    let bytes = text.as_bytes();
    let mut in_quotes = false;
    let mut index = 0;
    while index < bytes.len() {
        let c = bytes[index];
        if c == b'"' {
            if in_quotes && bytes.get(index + 1) == Some(&b'"') {
                index += 1;
            } else {
                in_quotes = !in_quotes;
            }
            index += 1;
            continue;
        }
        if !in_quotes && c == b'\n' {
            return index;
        }
        index += 1;
    }
    text.len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn rows(value: &[&[&str]]) -> Vec<Vec<String>> {
        value.iter().map(|row| row.iter().map(|s| s.to_string()).collect()).collect()
    }

    fn records(value: &[&[(&str, &str)]]) -> Vec<IndexMap<String, String>> {
        value
            .iter()
            .map(|row| row.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect())
            .collect()
    }

    mod parse_csv_rows_tests {
        use super::*;

        #[test]
        fn splits_rows_and_columns() {
            assert_eq!(parse_csv_rows("a,b\n1,2"), rows(&[&["a", "b"], &["1", "2"]]));
        }

        #[test]
        fn returns_no_rows_for_an_empty_string() {
            assert_eq!(parse_csv_rows(""), rows(&[]));
        }

        #[test]
        fn does_not_emit_an_empty_row_for_a_trailing_newline() {
            assert_eq!(parse_csv_rows("a,b\n"), rows(&[&["a", "b"]]));
        }

        #[test]
        fn keeps_blank_lines_as_single_empty_token_rows() {
            assert_eq!(parse_csv_rows("a\n\nb"), rows(&[&["a"], &[""], &["b"]]));
        }

        #[test]
        fn handles_crlf_and_lone_cr_line_endings() {
            assert_eq!(parse_csv_rows("a,b\r\n1,2\r\n"), rows(&[&["a", "b"], &["1", "2"]]));
            assert_eq!(parse_csv_rows("a\rb"), rows(&[&["a"], &["b"]]));
        }

        #[test]
        fn handles_quoted_commas_newlines_and_escaped_quotes() {
            assert_eq!(parse_csv_rows("a,\"b,c\""), rows(&[&["a", "b,c"]]));
            assert_eq!(parse_csv_rows("\"x\ny\",z\n"), rows(&[&["x\ny", "z"]]));
            assert_eq!(parse_csv_rows("\"x\r\ny\""), rows(&[&["x\r\ny"]]));
            assert_eq!(parse_csv_rows("\"he said \"\"hi\"\"\""), rows(&[&["he said \"hi\""]]));
            assert_eq!(parse_csv_rows("\"\""), rows(&[]));
            assert_eq!(parse_csv_rows("\"\",a"), rows(&[&["", "a"]]));
        }

        #[test]
        fn treats_quotes_mid_token_as_toggles_and_drops_them() {
            assert_eq!(parse_csv_rows("ab\"c,d\"e"), rows(&[&["abc,de"]]));
        }

        #[test]
        fn keeps_a_trailing_empty_column_after_a_trailing_comma() {
            assert_eq!(parse_csv_rows("a,"), rows(&[&["a", ""]]));
            assert_eq!(parse_csv_rows(","), rows(&[&["", ""]]));
            assert_eq!(parse_csv_rows("a,b,\n1,2,"), rows(&[&["a", "b", ""], &["1", "2", ""]]));
        }

        #[test]
        fn does_not_trim_tokens() {
            assert_eq!(parse_csv_rows(" a , b "), rows(&[&[" a ", " b "]]));
        }
    }

    mod parse_csv_string_tests {
        use super::*;

        #[test]
        fn maps_rows_to_header_keys_trimming_keys_and_values() {
            assert_eq!(
                parse_csv_string(" name , age \nJack, 30 \nJill,25"),
                records(&[&[("name", "Jack"), ("age", "30")], &[("name", "Jill"), ("age", "25")]])
            );
        }

        #[test]
        fn strips_a_bom_from_the_header() {
            assert_eq!(parse_csv_string("\u{FEFF}name\nJack"), records(&[&[("name", "Jack")]]));
        }

        #[test]
        fn skips_blank_and_whitespace_only_rows_including_leading_ones() {
            assert_eq!(
                parse_csv_string("\n  \nname,age\n\n , \nJack,30\n"),
                records(&[&[("name", "Jack"), ("age", "30")]])
            );
        }

        #[test]
        fn fills_missing_columns_with_empty_strings_and_drops_extras() {
            assert_eq!(
                parse_csv_string("a,b\n1\n1,2,3"),
                records(&[&[("a", "1"), ("b", "")], &[("a", "1"), ("b", "2")]])
            );
        }

        #[test]
        fn lets_later_duplicate_headers_win() {
            assert_eq!(parse_csv_string("a,a\n1,2"), records(&[&[("a", "2")]]));
        }

        #[test]
        fn returns_an_empty_list_without_a_header() {
            assert!(parse_csv_string("").is_empty());
            assert!(parse_csv_string("\n\n").is_empty());
            assert!(parse_csv_string("a,b").is_empty());
        }
    }

    mod csv_escape_tests {
        use super::*;

        #[test]
        fn quotes_only_when_needed() {
            assert_eq!(csv_escape("plain"), "plain");
            assert_eq!(csv_escape("a,b"), "\"a,b\"");
            assert_eq!(csv_escape("a\"b"), "\"a\"\"b\"");
            assert_eq!(csv_escape("a\nb"), "\"a\nb\"");
            assert_eq!(csv_escape("a\rb"), "\"a\rb\"");
        }

        #[test]
        fn stringifies_non_string_values() {
            assert_eq!(csv_escape_value(Some(&Value::Null)), "");
            assert_eq!(csv_escape_value(None), "");
            assert_eq!(csv_escape_value(Some(&json!(12))), "12");
            assert_eq!(csv_escape_value(Some(&json!(false))), "false");
        }

        #[test]
        fn round_trips_through_parse_csv_rows() {
            let values = ["a", "b,c", "d\"e", "f\ng"];
            let line = values.iter().map(|v| csv_escape(v)).collect::<Vec<_>>().join(",");
            assert_eq!(parse_csv_rows(&line), rows(&[&values]));
        }
    }

    mod replace_csv_header_tests {
        use super::*;

        fn replace(text: &str, headers: &[&str]) -> String {
            String::from_utf8(replace_csv_header(text.as_bytes(), headers)).unwrap()
        }

        #[test]
        fn replaces_the_first_record_and_escapes_new_headers() {
            assert_eq!(replace("old1,old2\n1,2\n", &["A", "B,C"]), "A,\"B,C\"\n1,2\n");
        }

        #[test]
        fn preserves_a_bom() {
            assert_eq!(replace("\u{FEFF}old\n1", &["new"]), "\u{FEFF}new\n1");
        }

        #[test]
        fn skips_newlines_inside_a_quoted_header() {
            assert_eq!(replace("\"a\nb\",\"c\"\"d\"\n1,2", &["X", "Y"]), "X,Y\n1,2");
        }

        #[test]
        fn replaces_the_whole_text_when_there_is_no_newline() {
            assert_eq!(replace("a,b", &["X"]), "X");
            assert_eq!(replace("", &["X"]), "X");
        }

        #[test]
        fn drops_the_cr_of_a_crlf_header_line_ending() {
            assert_eq!(replace("a,b\r\n1,2\r\n", &["X"]), "X\n1,2\r\n");
        }
    }
}
