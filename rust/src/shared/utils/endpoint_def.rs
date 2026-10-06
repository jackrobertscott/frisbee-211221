//! Port of `shared/src/utils/endpointDef.ts`: list paging/sorting schemas and
//! the endpoint definition shape every contract entry uses.

use crate::io_schema;
use crate::shared::auth_access::AuthPoint;
use crate::shared::torva::{Io, io};
use serde::{Deserialize, Serialize};

pub const LIST_LIMIT_MAX: f64 = 100.0;

io_schema! {
    /// Page size for list endpoints, bounded so one request cannot load a collection.
    pub fn io_list_limit() {
        io::optional(io::number().integer().min(1.0).max(LIST_LIMIT_MAX))
    }
}

io_schema! {
    pub fn io_list_skip() {
        io::optional(io::number().integer().min(0.0))
    }
}

pub const SORT_DIRECTIONS: [&str; 2] = ["asc", "desc"];

/// `TSortDirection`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortDirection {
    Asc,
    Desc,
}

io_schema! {
    pub fn io_sort_direction() {
        io::optional(io::enumeration(&SORT_DIRECTIONS))
    }
}

/// `TEndpointDef`: the shared definition of one endpoint. Domain contract
/// modules declare these as constants; the server registers handlers for them.
#[derive(Clone, Copy, Debug)]
pub struct EndpointDef {
    /// The export name without `Def`, e.g. `SeasonList`.
    pub name: &'static str,
    pub path: &'static str,
    pub access: Option<AuthPoint>,
    pub payload: Option<fn() -> Io>,
    pub result: Option<fn() -> Io>,
    pub multipart: bool,
}

impl EndpointDef {
    pub const fn new(name: &'static str, path: &'static str) -> Self {
        EndpointDef {
            name,
            path,
            access: None,
            payload: None,
            result: None,
            multipart: false,
        }
    }
    pub const fn access(mut self, access: AuthPoint) -> Self {
        self.access = Some(access);
        self
    }
    pub const fn payload(mut self, payload: fn() -> Io) -> Self {
        self.payload = Some(payload);
        self
    }
    pub const fn result(mut self, result: fn() -> Io) -> Self {
        self.result = Some(result);
        self
    }
    pub const fn multipart(mut self) -> Self {
        self.multipart = true;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    fn check(schema: &Io, value: Option<Value>) -> Result<Option<Value>, String> {
        schema.validate_opt(value.as_ref())
    }

    mod io_list_limit_tests {
        use super::*;

        #[test]
        fn is_optional() {
            assert_eq!(check(&io_list_limit(), None), Ok(None));
        }

        #[test]
        fn accepts_whole_page_sizes_from_1_to_the_maximum() {
            assert_eq!(check(&io_list_limit(), Some(json!(1))), Ok(Some(json!(1))));
            assert_eq!(
                check(&io_list_limit(), Some(json!(100))),
                Ok(Some(json!(100)))
            );
        }

        #[test]
        fn rejects_page_sizes_that_could_load_a_whole_collection() {
            assert!(check(&io_list_limit(), Some(json!(101))).is_err());
            assert!(check(&io_list_limit(), Some(json!(0))).is_err());
            assert!(check(&io_list_limit(), Some(json!(-5))).is_err());
            assert!(check(&io_list_limit(), Some(json!(2.5))).is_err());
            assert!(check(&io_list_limit(), Some(json!(1e300))).is_err());
        }
    }

    mod io_list_skip_tests {
        use super::*;

        #[test]
        fn accepts_zero_and_positive_whole_offsets() {
            assert!(check(&io_list_skip(), None).is_ok());
            assert_eq!(check(&io_list_skip(), Some(json!(0))), Ok(Some(json!(0))));
            assert_eq!(
                check(&io_list_skip(), Some(json!(500))),
                Ok(Some(json!(500)))
            );
        }

        #[test]
        fn rejects_negative_and_fractional_offsets() {
            assert!(check(&io_list_skip(), Some(json!(-1))).is_err());
            assert!(check(&io_list_skip(), Some(json!(1.5))).is_err());
        }
    }

    mod io_sort_direction_tests {
        use super::*;

        #[test]
        fn accepts_asc_desc_or_nothing() {
            assert!(check(&io_sort_direction(), Some(json!("asc"))).is_ok());
            assert!(check(&io_sort_direction(), Some(json!("desc"))).is_ok());
            assert!(check(&io_sort_direction(), None).is_ok());
        }

        #[test]
        fn rejects_other_spellings() {
            assert!(check(&io_sort_direction(), Some(json!("ASC"))).is_err());
            assert!(check(&io_sort_direction(), Some(json!("ascending"))).is_err());
            assert!(check(&io_sort_direction(), Some(json!(1))).is_err());
        }
    }
}
