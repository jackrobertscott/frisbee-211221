//! JavaScript `Date` behaviour: `Date.parse`, `toISOString` and `Date.now`.
//!
//! Stored dates are ISO strings produced by `new Date(...).toISOString()`, so
//! the Rust server must parse and print them exactly the same way.

use chrono::{DateTime, Datelike, Local, NaiveDate, NaiveDateTime, TimeZone, Timelike, Utc};
use std::time::{SystemTime, UNIX_EPOCH};

/// The largest absolute time value a JavaScript `Date` can hold.
pub const MAX_TIME_MS: f64 = 8.64e15;

/// `Date.now()`.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// `new Date().toISOString()`.
pub fn now_iso() -> String {
    to_iso_string(now_ms())
}

/// `new Date(ms).toISOString()`; `None` when the value is out of range.
pub fn try_to_iso_string(ms: i64) -> Option<String> {
    if (ms as f64).abs() > MAX_TIME_MS {
        return None;
    }
    let dt = DateTime::<Utc>::from_timestamp_millis(ms)?;
    let year = dt.year();
    let year_text = if (0..=9999).contains(&year) {
        format!("{year:04}")
    } else if year < 0 {
        format!("-{:06}", -year)
    } else {
        format!("+{year:06}")
    };
    Some(format!(
        "{year_text}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        dt.month(),
        dt.day(),
        dt.hour(),
        dt.minute(),
        dt.second(),
        dt.timestamp_subsec_millis()
    ))
}

/// `new Date(ms).toISOString()` for in-range values (clamped otherwise).
pub fn to_iso_string(ms: i64) -> String {
    let clamped = ms.clamp(-(MAX_TIME_MS as i64), MAX_TIME_MS as i64);
    try_to_iso_string(clamped).unwrap_or_default()
}

/// `Date.parse(value)`: milliseconds since the epoch, or `None` for `NaN`.
pub fn parse(value: &str) -> Option<i64> {
    let ms = parse_iso(value).or_else(|| parse_legacy(value))?;
    if (ms as f64).abs() > MAX_TIME_MS {
        return None;
    }
    Some(ms)
}

/// `new Date(Date.parse(value)).toISOString()`, the normalisation `io.date()` applies.
pub fn normalize(value: &str) -> Option<String> {
    parse(value).and_then(try_to_iso_string)
}

fn utc_ms(year: i64, month: u32, day: u32, h: u32, m: u32, s: u32, ms: u32) -> Option<i64> {
    let date = NaiveDate::from_ymd_opt(i32::try_from(year).ok()?, month, day)?;
    let (date, h) = if h == 24 {
        (date.succ_opt()?, 0)
    } else {
        (date, h)
    };
    let time = date.and_hms_milli_opt(h, m, s, ms)?;
    Some(time.and_utc().timestamp_millis())
}

fn local_ms(year: i64, month: u32, day: u32, h: u32, m: u32, s: u32, ms: u32) -> Option<i64> {
    let utc = utc_ms(year, month, day, h, m, s, ms)?;
    let naive: NaiveDateTime = DateTime::<Utc>::from_timestamp_millis(utc)?.naive_utc();
    let local = Local
        .from_local_datetime(&naive)
        .earliest()
        .or_else(|| Local.from_local_datetime(&(naive + chrono::Duration::hours(1))).earliest())?;
    Some(local.timestamp_millis())
}

struct Cursor<'a> {
    bytes: &'a [u8],
    index: usize,
}

impl<'a> Cursor<'a> {
    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.index).copied()
    }
    fn eat(&mut self, byte: u8) -> bool {
        if self.peek() == Some(byte) {
            self.index += 1;
            true
        } else {
            false
        }
    }
    fn digits(&mut self, count: usize) -> Option<u32> {
        let end = self.index + count;
        let slice = self.bytes.get(self.index..end)?;
        if !slice.iter().all(u8::is_ascii_digit) {
            return None;
        }
        self.index = end;
        std::str::from_utf8(slice).ok()?.parse().ok()
    }
    fn done(&self) -> bool {
        self.index >= self.bytes.len()
    }
}

/// The ECMAScript date time string format (`YYYY-MM-DDTHH:mm:ss.sssZ` and its
/// shorter forms). Date-only forms are UTC, date-time forms without an offset
/// are local time.
fn parse_iso(value: &str) -> Option<i64> {
    let mut c = Cursor { bytes: value.as_bytes(), index: 0 };
    let year: i64 = match c.peek()? {
        b'+' | b'-' => {
            let negative = c.peek() == Some(b'-');
            c.index += 1;
            let y = i64::from(c.digits(6)?);
            if negative && y == 0 {
                return None;
            }
            if negative { -y } else { y }
        }
        _ => i64::from(c.digits(4)?),
    };
    let mut month = 1;
    let mut day = 1;
    if c.eat(b'-') {
        month = c.digits(2)?;
        if c.eat(b'-') {
            day = c.digits(2)?;
        }
    }
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    if c.done() {
        return utc_ms(year, month, day, 0, 0, 0, 0);
    }
    if !(c.eat(b'T') || c.eat(b't')) {
        return None;
    }
    let hour = c.digits(2)?;
    if !c.eat(b':') {
        return None;
    }
    let minute = c.digits(2)?;
    let mut second = 0;
    let mut millis = 0;
    if c.eat(b':') {
        second = c.digits(2)?;
        if c.eat(b'.') || c.eat(b',') {
            let start = c.index;
            while c.peek().is_some_and(|b| b.is_ascii_digit()) {
                c.index += 1;
            }
            let fraction = std::str::from_utf8(&c.bytes[start..c.index]).ok()?;
            if fraction.is_empty() {
                return None;
            }
            let padded = format!("{fraction:0<3}");
            millis = padded[..3].parse().ok()?;
        }
    }
    if hour > 24 || minute > 59 || second > 59 || (hour == 24 && (minute > 0 || second > 0 || millis > 0)) {
        return None;
    }
    if c.done() {
        return local_ms(year, month, day, hour, minute, second, millis);
    }
    let offset_minutes: i64 = match c.peek()? {
        b'Z' | b'z' => {
            c.index += 1;
            0
        }
        b'+' | b'-' => {
            let sign = if c.peek() == Some(b'-') { -1 } else { 1 };
            c.index += 1;
            let oh = i64::from(c.digits(2)?);
            c.eat(b':');
            let om = i64::from(c.digits(2)?);
            if oh > 23 || om > 59 {
                return None;
            }
            sign * (oh * 60 + om)
        }
        _ => return None,
    };
    if !c.done() {
        return None;
    }
    Some(utc_ms(year, month, day, hour, minute, second, millis)? - offset_minutes * 60_000)
}

#[derive(Debug, PartialEq)]
enum Token {
    Number(String),
    Word(String),
    Symbol(char),
}

fn tokenize(value: &str) -> Option<Vec<Token>> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = value.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        let c = chars[index];
        if c == '(' {
            // parenthesised comments are ignored, and may nest
            let mut depth = 0;
            while index < chars.len() {
                if chars[index] == '(' {
                    depth += 1;
                } else if chars[index] == ')' {
                    depth -= 1;
                    if depth == 0 {
                        break;
                    }
                }
                index += 1;
            }
            index += 1;
            continue;
        }
        if c.is_ascii_digit() {
            let start = index;
            while index < chars.len() && chars[index].is_ascii_digit() {
                index += 1;
            }
            tokens.push(Token::Number(chars[start..index].iter().collect()));
            continue;
        }
        if c.is_alphabetic() {
            let start = index;
            while index < chars.len() && chars[index].is_alphabetic() {
                index += 1;
            }
            tokens.push(Token::Word(chars[start..index].iter().collect::<String>().to_lowercase()));
            continue;
        }
        if super::is_whitespace(c) || c == ',' {
            index += 1;
            continue;
        }
        tokens.push(Token::Symbol(c));
        index += 1;
    }
    Some(tokens)
}

const MONTHS: [&str; 12] = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS: [&str; 7] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/// A best-effort port of V8's legacy date parser fallback, covering the
/// formats browsers and people commonly send (`2024/03/05 10:20`,
/// `March 5, 2024`, RFC 2822, `Date.prototype.toString()` output).
fn parse_legacy(value: &str) -> Option<i64> {
    let tokens = tokenize(value)?;
    let mut numbers: Vec<(u32, usize)> = Vec::new(); // (value, digit count) of date parts
    let mut month_name: Option<u32> = None;
    let mut time: Option<(u32, u32, u32, u32)> = None;
    let mut offset: Option<i64> = None;
    let mut pm: Option<bool> = None;
    let mut seen_number = false;
    let mut iso_like_date = false;
    let mut index = 0;
    while index < tokens.len() {
        match &tokens[index] {
            Token::Number(text) => {
                seen_number = true;
                let n: u32 = text.parse().ok()?;
                if matches!(tokens.get(index + 1), Some(Token::Symbol(':'))) && time.is_none() {
                    // h:m[:s[.ms]]
                    let minute = match tokens.get(index + 2) {
                        Some(Token::Number(m)) => m.parse().ok()?,
                        _ => return None,
                    };
                    index += 3;
                    let mut second = 0;
                    let mut millis = 0;
                    if matches!(tokens.get(index), Some(Token::Symbol(':'))) {
                        second = match tokens.get(index + 1) {
                            Some(Token::Number(s)) => s.parse().ok()?,
                            _ => return None,
                        };
                        index += 2;
                        if matches!(tokens.get(index), Some(Token::Symbol('.'))) {
                            if let Some(Token::Number(f)) = tokens.get(index + 1) {
                                let padded = format!("{f:0<3}");
                                millis = padded[..3].parse().ok()?;
                                index += 2;
                            }
                        }
                    }
                    time = Some((n, minute, second, millis));
                    continue;
                }
                if matches!(tokens.get(index + 1), Some(Token::Symbol('-'))) && text.len() == 4 && numbers.is_empty() {
                    iso_like_date = true;
                }
                numbers.push((n, text.len()));
                index += 1;
            }
            Token::Word(word) => {
                if word == "am" || word == "pm" {
                    pm = Some(word == "pm");
                } else if word == "utc" || word == "gmt" || word == "z" || word == "ut" {
                    offset = Some(offset.unwrap_or(0));
                } else if word == "t" && seen_number {
                    // ISO-like separator
                } else if let Some(m) = MONTHS.iter().position(|m| word.starts_with(m) && word.len() >= 3) {
                    month_name = Some(m as u32 + 1);
                } else if WEEKDAYS.iter().any(|d| word.starts_with(d)) {
                    // weekday names are ignored
                } else if seen_number {
                    return None;
                }
                index += 1;
            }
            Token::Symbol(sign @ ('+' | '-')) if time.is_some() || offset.is_some() => {
                // time zone offset: +hhmm or +hh:mm
                let sign = if *sign == '-' { -1 } else { 1 };
                let (hours, minutes) = match (tokens.get(index + 1), tokens.get(index + 2), tokens.get(index + 3)) {
                    (Some(Token::Number(h)), Some(Token::Symbol(':')), Some(Token::Number(m))) => {
                        index += 4;
                        (h.parse::<i64>().ok()?, m.parse::<i64>().ok()?)
                    }
                    (Some(Token::Number(hm)), _, _) => {
                        index += 2;
                        let v: i64 = hm.parse().ok()?;
                        if hm.len() <= 2 { (v, 0) } else { (v / 100, v % 100) }
                    }
                    _ => return None,
                };
                offset = Some(sign * (hours * 60 + minutes));
            }
            Token::Symbol('-' | '/' | '.') => index += 1,
            Token::Symbol(_) => return None,
        }
    }
    let (year, month, day) = if let Some(month) = month_name {
        let mut day = None;
        let mut year = None;
        for (n, len) in &numbers {
            if day.is_none() && *len <= 2 && *n <= 31 {
                day = Some(*n);
            } else if year.is_none() {
                year = Some(expand_year(*n, *len));
            } else {
                return None;
            }
        }
        (year?, month, day.unwrap_or(1))
    } else {
        match numbers.as_slice() {
            [(y, 4), (m, _), (d, _)] => (i64::from(*y), *m, *d),
            [(y, 4), (m, _)] => (i64::from(*y), *m, 1),
            [(m, _), (d, _), (y, len)] => (expand_year(*y, *len), *m, *d),
            _ => return None,
        }
    };
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let (mut hour, minute, second, millis) = time.unwrap_or((0, 0, 0, 0));
    if let Some(is_pm) = pm {
        if hour > 12 {
            return None;
        }
        if hour == 12 {
            hour = 0;
        }
        if is_pm {
            hour += 12;
        }
    }
    if hour > 24 || minute > 59 || second > 59 {
        return None;
    }
    let _ = iso_like_date;
    match offset {
        Some(offset) => Some(utc_ms(year, month, day, hour, minute, second, millis)? - offset * 60_000),
        None => local_ms(year, month, day, hour, minute, second, millis),
    }
}

fn expand_year(value: u32, digits: usize) -> i64 {
    let value = i64::from(value);
    if digits <= 2 {
        if value < 50 { 2000 + value } else { 1900 + value }
    } else {
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_iso_strings_like_date_parse() {
        assert_eq!(normalize("2024-03-05T10:20:30.000Z").as_deref(), Some("2024-03-05T10:20:30.000Z"));
        assert_eq!(normalize("2024-03-05").as_deref(), Some("2024-03-05T00:00:00.000Z"));
        assert_eq!(normalize("2024-03-05T10:20:30+10:00").as_deref(), Some("2024-03-05T00:20:30.000Z"));
        assert_eq!(normalize("2024").as_deref(), Some("2024-01-01T00:00:00.000Z"));
        assert_eq!(normalize("2024-03-05T10:20:30.1234Z").as_deref(), Some("2024-03-05T10:20:30.123Z"));
        assert_eq!(normalize("+012024-03-05T00:00:00Z").as_deref(), Some("+012024-03-05T00:00:00.000Z"));
        assert_eq!(normalize("not a date"), None);
        assert_eq!(normalize("2024-13-01"), None);
    }

    #[test]
    fn parses_common_legacy_formats() {
        assert_eq!(normalize("Tue, 05 Mar 2024 10:20:30 GMT").as_deref(), Some("2024-03-05T10:20:30.000Z"));
        assert_eq!(normalize("March 5, 2024 10:20 UTC").as_deref(), Some("2024-03-05T10:20:00.000Z"));
        assert_eq!(
            normalize("Tue Mar 05 2024 10:20:30 GMT+1000 (Australian Eastern Standard Time)").as_deref(),
            Some("2024-03-05T00:20:30.000Z")
        );
    }

    #[test]
    fn prints_iso_strings_like_to_iso_string() {
        assert_eq!(to_iso_string(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(to_iso_string(1_700_000_000_123), "2023-11-14T22:13:20.123Z");
        assert_eq!(now_iso().len(), 24);
    }
}
