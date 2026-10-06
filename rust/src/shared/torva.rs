//! Port of `shared/src/torva` — the validation library behind every payload,
//! result and stored-record schema.
//!
//! A schema ([`Io`]) validates a JSON value and returns the *normalised*
//! value (trimmed strings, ISO dates, dropped unknown keys) or an error string
//! such as `[email]: Value is not a valid email.`. Those strings feed
//! `errorCode`/`userMessage` derivation, so they match the TS library exactly.
//!
//! `undefined` is modelled as `None`: validators take `Option<&Value>` and a
//! successful result of `None` means "leave the key out".

use crate::js;
use crate::shared::utils::regex as shared_regex;
use indexmap::IndexMap;
use regex::Regex;
use serde_json::{Map, Value};
use std::fmt;
use std::sync::Arc;

/// Why a validator failed. `Thrown` stands in for a JS validator throwing a
/// non-string, which object/array validation report as `An error occurred.`.
#[derive(Clone, Debug, PartialEq)]
pub enum IoError {
    Message(String),
    Thrown,
}

impl IoError {
    pub fn message(text: impl Into<String>) -> Self {
        IoError::Message(text.into())
    }

    fn into_string(self) -> String {
        match self {
            IoError::Message(text) => text,
            IoError::Thrown => "An error occurred.".into(),
        }
    }
}

/// The result of validating a possibly-undefined value.
pub type IoResult = Result<Option<Value>, IoError>;

type CustomFn = Arc<dyn Fn(Option<&Value>) -> IoResult + Send + Sync>;
type LazyFn = Arc<dyn Fn() -> Io + Send + Sync>;

#[derive(Clone, Debug, Default)]
pub struct NumberOptions {
    pub coerce: bool,
    pub integer: bool,
    pub min: Option<f64>,
    pub max: Option<f64>,
}

#[derive(Clone, Debug, Default)]
pub struct StringOptions {
    pub regex: Option<Regex>,
    pub trim: bool,
    pub email: bool,
    pub nowhitespace: bool,
    pub emptyok: bool,
}

#[derive(Clone)]
enum Kind {
    Any,
    Array(Io),
    Boolean,
    Color,
    Custom(CustomFn),
    Date,
    Enum(Vec<String>),
    Id,
    Lazy(LazyFn),
    Null(Io),
    Number(NumberOptions),
    Object(IndexMap<String, Io>),
    Optional(Io),
    String(StringOptions),
    Timestamp,
}

/// A schema. Cheap to clone; builders return new schemas and never mutate.
#[derive(Clone)]
pub struct Io(Arc<Kind>);

impl fmt::Debug for Io {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Io({})", self.type_name())
    }
}

/// Constructors mirroring the TS `io.*` namespace.
pub mod io {
    use super::*;

    pub fn any() -> Io {
        Io::new(Kind::Any)
    }
    pub fn array(of_type: Io) -> Io {
        Io::new(Kind::Array(of_type))
    }
    pub fn boolean() -> Io {
        Io::new(Kind::Boolean)
    }
    pub fn color() -> Io {
        Io::new(Kind::Color)
    }
    /// `io.custom(validate)`; `None` input means `undefined`.
    pub fn custom(validate: impl Fn(Option<&Value>) -> IoResult + Send + Sync + 'static) -> Io {
        Io::new(Kind::Custom(Arc::new(validate)))
    }
    pub fn date() -> Io {
        Io::new(Kind::Date)
    }
    pub fn enumeration<S: AsRef<str>>(choices: &[S]) -> Io {
        Io::new(Kind::Enum(choices.iter().map(|c| c.as_ref().to_string()).collect()))
    }
    pub fn id() -> Io {
        Io::new(Kind::Id)
    }
    pub fn lazy(callback: impl Fn() -> Io + Send + Sync + 'static) -> Io {
        Io::new(Kind::Lazy(Arc::new(callback)))
    }
    pub fn null(of_type: Io) -> Io {
        Io::new(Kind::Null(of_type))
    }
    pub fn number() -> Io {
        Io::new(Kind::Number(NumberOptions::default()))
    }
    /// `io.object({...})`, keeping field order.
    pub fn object<K: Into<String>>(fields: impl IntoIterator<Item = (K, Io)>) -> Io {
        Io::new(Kind::Object(fields.into_iter().map(|(k, v)| (k.into(), v)).collect()))
    }
    pub fn optional(of_type: Io) -> Io {
        Io::new(Kind::Optional(of_type))
    }
    pub fn string() -> Io {
        Io::new(Kind::String(StringOptions::default()))
    }
    pub fn timestamp() -> Io {
        Io::new(Kind::Timestamp)
    }
}

impl Io {
    fn new(kind: Kind) -> Self {
        Io(Arc::new(kind))
    }

    /// The TS `_type` tag.
    pub fn type_name(&self) -> &'static str {
        match &*self.0 {
            Kind::Any => "any",
            Kind::Array(_) => "array",
            Kind::Boolean => "boolean",
            Kind::Color => "color",
            Kind::Custom(_) => "custom",
            Kind::Date => "date",
            Kind::Enum(_) => "enum",
            Kind::Id => "id",
            Kind::Lazy(_) => "lazy",
            Kind::Null(_) => "null",
            Kind::Number(_) => "number",
            Kind::Object(_) => "object",
            Kind::Optional(_) => "optional",
            Kind::String(_) => "string",
            Kind::Timestamp => "timestamp",
        }
    }

    /// The wrapped schema of `array`, `null` and `optional` schemas.
    pub fn of_type(&self) -> Option<&Io> {
        match &*self.0 {
            Kind::Array(of) | Kind::Null(of) | Kind::Optional(of) => Some(of),
            _ => None,
        }
    }

    /// `lazy.getType()`.
    pub fn get_type(&self) -> Option<Io> {
        match &*self.0 {
            Kind::Lazy(callback) => Some(callback()),
            _ => None,
        }
    }

    /// `object.shape`.
    pub fn shape(&self) -> Option<&IndexMap<String, Io>> {
        match &*self.0 {
            Kind::Object(fields) => Some(fields),
            _ => None,
        }
    }

    /// `object.shape[key]`; panics on a programming error (unknown key).
    pub fn field(&self, key: &str) -> Io {
        match self.shape().and_then(|shape| shape.get(key)) {
            Some(io) => io.clone(),
            None => panic!("schema has no field {key:?}"),
        }
    }

    fn object_fields(&self) -> IndexMap<String, Io> {
        self.shape().cloned().unwrap_or_default()
    }

    /// `object.extend({...})`: overrides keep their position, new keys append.
    pub fn extend<K: Into<String>>(&self, fields: impl IntoIterator<Item = (K, Io)>) -> Io {
        let mut current = self.object_fields();
        for (key, io) in fields {
            current.insert(key.into(), io);
        }
        Io::new(Kind::Object(current))
    }

    /// `object.pick([...])`, in the order of `keys`.
    pub fn pick(&self, keys: &[&str]) -> Io {
        let current = self.object_fields();
        Io::new(Kind::Object(
            keys.iter()
                .filter_map(|key| current.get(*key).map(|io| (key.to_string(), io.clone())))
                .collect(),
        ))
    }

    /// `object.omit([...])`.
    pub fn omit(&self, keys: &[&str]) -> Io {
        let current = self.object_fields();
        Io::new(Kind::Object(
            current.into_iter().filter(|(key, _)| !keys.contains(&key.as_str())).collect(),
        ))
    }

    fn number_options(&self) -> NumberOptions {
        match &*self.0 {
            Kind::Number(options) => options.clone(),
            _ => NumberOptions::default(),
        }
    }

    fn string_options(&self) -> StringOptions {
        match &*self.0 {
            Kind::String(options) => options.clone(),
            _ => StringOptions::default(),
        }
    }

    pub fn coerce(&self) -> Io {
        Io::new(Kind::Number(NumberOptions { coerce: true, ..self.number_options() }))
    }
    pub fn integer(&self) -> Io {
        Io::new(Kind::Number(NumberOptions { integer: true, ..self.number_options() }))
    }
    pub fn min(&self, value: f64) -> Io {
        Io::new(Kind::Number(NumberOptions { min: Some(value), ..self.number_options() }))
    }
    pub fn max(&self, value: f64) -> Io {
        Io::new(Kind::Number(NumberOptions { max: Some(value), ..self.number_options() }))
    }
    pub fn positive(&self) -> Io {
        let options = self.number_options();
        let min = options.min.unwrap_or(1.0).max(1.0);
        Io::new(Kind::Number(NumberOptions { min: Some(min), ..options }))
    }

    /// `string.regex(pattern)`; the pattern uses Rust `regex` syntax.
    pub fn regex(&self, pattern: Regex) -> Io {
        Io::new(Kind::String(StringOptions { regex: Some(pattern), ..self.string_options() }))
    }
    pub fn trim(&self) -> Io {
        Io::new(Kind::String(StringOptions { trim: true, ..self.string_options() }))
    }
    pub fn email(&self) -> Io {
        Io::new(Kind::String(StringOptions { email: true, ..self.string_options() }))
    }
    pub fn nowhitespace(&self) -> Io {
        Io::new(Kind::String(StringOptions { nowhitespace: true, ..self.string_options() }))
    }
    pub fn emptyok(&self) -> Io {
        Io::new(Kind::String(StringOptions { emptyok: true, ..self.string_options() }))
    }

    /// Validates a defined value. Returns the normalised value, or `Value::Null`
    /// standing in for `undefined` when the schema maps it away (rare).
    pub fn validate(&self, value: &Value) -> Result<Value, String> {
        self.validate_opt(Some(value)).map(|v| v.unwrap_or(Value::Null))
    }

    /// Validates a possibly-undefined value (`None` = `undefined`).
    pub fn validate_opt(&self, value: Option<&Value>) -> Result<Option<Value>, String> {
        self.check(value).map_err(IoError::into_string)
    }

    /// Validation with the raw [`IoError`] (for composing custom validators).
    pub fn check(&self, value: Option<&Value>) -> IoResult {
        let fail = |text: &str| Err(IoError::message(text));
        match &*self.0 {
            Kind::Any => Ok(value.cloned()),
            Kind::Array(of_type) => {
                let Some(Value::Array(items)) = value else {
                    return Err(IoError::message(format!(
                        "Expect type \"array\" but got \"{}\".",
                        js::type_of(value)
                    )));
                };
                let mut out = Vec::with_capacity(items.len());
                for (index, item) in items.iter().enumerate() {
                    match of_type.check(Some(item)) {
                        Ok(v) => out.push(v.unwrap_or(Value::Null)),
                        Err(IoError::Message(error)) => {
                            return Err(IoError::message(format!("[{index}]: {error}")));
                        }
                        Err(IoError::Thrown) => return Err(IoError::message("An error occurred.")),
                    }
                }
                Ok(Some(Value::Array(out)))
            }
            Kind::Boolean => match value {
                Some(Value::Bool(b)) => Ok(Some(Value::Bool(*b))),
                _ => fail("Value is not a boolean."),
            },
            Kind::Color => validate_color(value),
            Kind::Custom(callback) => callback(value),
            Kind::Date => match value {
                Some(Value::String(text)) => match js::date::normalize(text) {
                    Some(iso) => Ok(Some(Value::String(iso))),
                    None => fail("Value is not a valid date string."),
                },
                _ => fail("Date value is not a string."),
            },
            Kind::Enum(choices) => match value {
                Some(Value::String(text)) if choices.iter().any(|c| c == text) => Ok(Some(Value::String(text.clone()))),
                Some(Value::String(_)) => fail("Value is not a valid enum option."),
                _ => fail("Enum value is not a string."),
            },
            Kind::Id => match value {
                Some(Value::String(text)) => {
                    let normalized = js::trim(text);
                    if normalized.is_empty() {
                        return fail("ID can not be empty.");
                    }
                    if js::has_whitespace(normalized) {
                        return fail("ID can not contain whitespace.");
                    }
                    Ok(Some(Value::String(normalized.to_string())))
                }
                _ => fail("ID value is not a string."),
            },
            Kind::Lazy(callback) => callback().check(value),
            Kind::Null(of_type) => match value {
                Some(Value::Null) => Ok(Some(Value::Null)),
                _ => of_type.check(value),
            },
            Kind::Number(options) => validate_number(options, value),
            Kind::Object(fields) => {
                let Some(Value::Object(map)) = value else {
                    let got = match value {
                        Some(Value::Null) => "null",
                        Some(Value::Array(_)) => "array",
                        other => js::type_of(other),
                    };
                    return Err(IoError::message(format!("Expect type \"object\" but got \"{got}\".")));
                };
                let mut out = Map::new();
                for (key, of_type) in fields {
                    match of_type.check(map.get(key)) {
                        Ok(Some(v)) => {
                            out.insert(key.clone(), v);
                        }
                        Ok(None) => {}
                        Err(IoError::Message(error)) => {
                            return Err(IoError::message(format!("[{key}]: {error}")));
                        }
                        Err(IoError::Thrown) => return Err(IoError::message("An error occurred.")),
                    }
                }
                Ok(Some(Value::Object(out)))
            }
            Kind::Optional(of_type) => match value {
                None => Ok(None),
                Some(_) => of_type.check(value),
            },
            Kind::String(options) => validate_string(options, value),
            Kind::Timestamp => match value {
                Some(Value::Number(n)) => {
                    let f = n.as_f64().unwrap_or(f64::NAN);
                    if !f.is_finite() {
                        return fail("Timestamp must be a finite number.");
                    }
                    if !js::is_integer(f) {
                        return fail("Timestamp must be an integer.");
                    }
                    if f < 0.0 {
                        return fail("Timestamp must be zero or greater.");
                    }
                    Ok(Some(js::number(f)))
                }
                _ => fail("Timestamp value is not a number."),
            },
        }
    }
}

fn validate_color(value: Option<&Value>) -> IoResult {
    let Some(Value::String(text)) = value else {
        return Err(IoError::message("Color value is not a string."));
    };
    let normalized = js::trim(text);
    let Some(captures) = shared_regex::hsla().captures(normalized) else {
        return Err(IoError::message("Value is not a valid hsla string."));
    };
    let channel = |index: usize| js::string_to_number(captures.get(index).map_or("", |m| m.as_str()));
    let (hue, saturation, lightness, alpha) = (channel(1), channel(2), channel(3), channel(4));
    if !hue.is_finite() {
        return Err(IoError::message("Hue must be a finite number."));
    }
    if !(0.0..=100.0).contains(&saturation) {
        return Err(IoError::message("Saturation must be between 0 and 100."));
    }
    if !(0.0..=100.0).contains(&lightness) {
        return Err(IoError::message("Lightness must be between 0 and 100."));
    }
    if !(0.0..=1.0).contains(&alpha) {
        return Err(IoError::message("Alpha must be between 0 and 1."));
    }
    Ok(Some(Value::String(normalized.to_string())))
}

fn validate_number(options: &NumberOptions, value: Option<&Value>) -> IoResult {
    let number = match value {
        Some(Value::String(text)) if options.coerce => {
            let trimmed = js::trim(text);
            if trimmed.is_empty() {
                return Err(IoError::message("Value can not be empty."));
            }
            js::string_to_number(trimmed)
        }
        Some(Value::Number(n)) => n.as_f64().unwrap_or(f64::NAN),
        _ => return Err(IoError::message("Value is not a number.")),
    };
    if !number.is_finite() {
        return Err(IoError::message("Value must be a finite number."));
    }
    if options.integer && !js::is_integer(number) {
        return Err(IoError::message("Value must be an integer."));
    }
    if let Some(min) = options.min {
        if number < min {
            return Err(IoError::message(format!(
                "Value must be greater than or equal to {}.",
                js::number_to_string(min)
            )));
        }
    }
    if let Some(max) = options.max {
        if number > max {
            return Err(IoError::message(format!(
                "Value must be less than or equal to {}.",
                js::number_to_string(max)
            )));
        }
    }
    // keep the original JSON number when nothing was coerced
    match value {
        Some(Value::Number(n)) => Ok(Some(Value::Number(n.clone()))),
        _ => Ok(Some(js::number(number))),
    }
}

fn validate_string(options: &StringOptions, value: Option<&Value>) -> IoResult {
    let Some(Value::String(text)) = value else {
        return Err(IoError::message("String value is not a string."));
    };
    let mut normalized = text.clone();
    if options.trim {
        normalized = js::trim(&normalized).to_string();
    }
    if options.nowhitespace {
        normalized = normalized.chars().filter(|c| !js::is_whitespace(*c)).collect();
    }
    if normalized.is_empty() {
        if options.emptyok {
            return Ok(Some(Value::String(normalized)));
        }
        return Err(IoError::message("Value can not be empty."));
    }
    if let Some(pattern) = &options.regex {
        if !pattern.is_match(&normalized) {
            return Err(IoError::message("Value does not match regular expression."));
        }
    }
    if options.email && !shared_regex::email().is_match(&normalized) {
        return Err(IoError::message("Value is not a valid email."));
    }
    Ok(Some(Value::String(normalized)))
}

/// `ensure.object(value)`: a plain object (not an array, not null).
pub fn ensure_object(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::Object(_)))
}

/// `ensure.array(value)`.
pub fn ensure_array(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::Array(_)))
}

#[cfg(test)]
#[path = "torva_tests.rs"]
mod tests;

/// Declares a schema constructor that builds its [`Io`] once and hands out
/// cheap clones: `io_schema! { pub fn io_team() { io::object([...]) } }`.
#[macro_export]
macro_rules! io_schema {
    ($(#[$meta:meta])* $vis:vis fn $name:ident() $body:block) => {
        $(#[$meta])*
        $vis fn $name() -> $crate::shared::torva::Io {
            static CELL: ::std::sync::OnceLock<$crate::shared::torva::Io> = ::std::sync::OnceLock::new();
            CELL.get_or_init(|| $body).clone()
        }
    };
}
