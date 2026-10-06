//! Port of `shared/src/schemas`: one module per stored record, each with its
//! `io*` schema and a typed struct whose JSON form matches the stored document
//! (camelCase keys, `None` fields omitted).

pub mod auth_attempt_limit;
pub mod fixture;
pub mod gameday_import;
pub mod member;
pub mod report;
pub mod season;
pub mod session;
pub mod team;
pub mod user;
pub mod user_gender_matching;

pub use auth_attempt_limit::*;
pub use fixture::*;
pub use gameday_import::*;
pub use member::*;
pub use report::*;
pub use season::*;
pub use session::*;
pub use team::*;
pub use user::*;
pub use user_gender_matching::*;

/// Serde helper for `io.optional(io.null(...))` fields: the outer `Option` is
/// "key present", the inner one is "value is not null". Use with
/// `#[serde(default, skip_serializing_if = "Option::is_none", with = "double_option")]`.
pub mod double_option {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S: Serializer, T: Serialize>(
        value: &Option<Option<T>>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        match value {
            Some(inner) => inner.serialize(serializer),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D: Deserializer<'de>, T: Deserialize<'de>>(
        deserializer: D,
    ) -> Result<Option<Option<T>>, D::Error> {
        Option::<T>::deserialize(deserializer).map(Some)
    }
}
