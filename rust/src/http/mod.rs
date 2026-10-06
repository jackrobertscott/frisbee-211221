//! Port of `server/src/http`: the request pipeline.
//!
//! [`request_handler::respond`] mirrors `cors()(capture.handle(prerequest(handler)))`:
//! CORS headers on every response, errors serialised (or tarpitted), `OPTIONS`
//! and infrastructure paths answered, requests screened by [`intrusion`],
//! then the endpoint registered for the path runs ([`endpoint`]).

pub mod body;
pub mod capture;
pub mod cors;
pub mod endpoint;
pub mod headers;
pub mod intrusion;
pub mod origin;
pub mod prerequest;
pub mod request_handler;
pub mod tarpit;
pub mod uploads;
