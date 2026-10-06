//! Port of `server/src/http/intrusion.test.ts`.

use super::*;
use serde_json::json;
use std::sync::atomic::{AtomicUsize, Ordering};

fn make_req(remote_address: Option<&str>, forwarded_for: &[&str]) -> ClientInfo {
    ClientInfo {
        remote_address: remote_address.map(str::to_string),
        forwarded_for: forwarded_for.iter().map(|s| s.to_string()).collect(),
    }
}

static IP_COUNTER: AtomicUsize = AtomicUsize::new(0);

/// Each test uses fresh public IPs, as in the TS suite.
fn fresh_ip() -> String {
    let counter = IP_COUNTER.fetch_add(1, Ordering::Relaxed) + 1;
    format!("203.0.{}.{}", counter / 250, (counter % 250) + 1)
}

fn clean(pathname: &str) -> InspectOptions<'_> {
    InspectOptions { pathname, known_route: true, origin_allowed: true, origin: None }
}

fn tarpit_of(error: &AppError) -> Option<serde_json::Value> {
    error.tarpit.clone()
}

mod get_pathname_tests {
    use super::*;

    #[test]
    fn extracts_the_pathname() {
        assert_eq!(get_pathname(None), "/");
        assert_eq!(get_pathname(Some("")), "/");
        assert_eq!(get_pathname(Some("/")), "/");
        assert_eq!(get_pathname(Some("/api/user?x=1#y")), "/api/user");
        assert_eq!(get_pathname(Some("/a/../b")), "/b");
        assert_eq!(get_pathname(Some("/a b")), "/a%20b");
    }

    #[test]
    fn resolves_absolute_and_protocol_relative_urls() {
        assert_eq!(get_pathname(Some("http://evil.com/x?y")), "/x");
        assert_eq!(get_pathname(Some("//evil.com/path")), "/path");
    }

    #[test]
    fn falls_back_to_splitting_on_question_mark_for_unparseable_urls() {
        assert_eq!(get_pathname(Some("http://[bad?x=1")), "http://[bad");
    }
}

mod get_client_ip_tests {
    use super::*;

    #[test]
    fn uses_the_socket_address_when_not_behind_a_trusted_proxy() {
        assert_eq!(get_client_ip(&make_req(Some("8.8.8.8"), &["1.2.3.4"])), "8.8.8.8");
        assert_eq!(get_client_ip(&make_req(Some(" 8.8.8.8 "), &[])), "8.8.8.8");
        assert_eq!(get_client_ip(&make_req(Some("::ffff:8.8.8.8"), &[])), "8.8.8.8");
        assert_eq!(get_client_ip(&make_req(None, &["1.2.3.4"])), "unknown");
        assert_eq!(get_client_ip(&make_req(Some(""), &[])), "unknown");
    }

    #[test]
    fn walks_forwarded_hops_from_the_right_past_trusted_proxies() {
        assert_eq!(get_client_ip(&make_req(Some("10.0.0.1"), &["spoofed, 1.2.3.4, 10.0.0.2"])), "1.2.3.4");
        assert_eq!(get_client_ip(&make_req(Some("10.0.0.1"), &["1.2.3.4"])), "1.2.3.4");
        assert_eq!(get_client_ip(&make_req(Some("::ffff:10.0.0.1"), &[" 5.6.7.8 , ,"])), "5.6.7.8");
        assert_eq!(get_client_ip(&make_req(Some("10.0.0.1"), &["::ffff:1.2.3.4"])), "1.2.3.4");
    }

    #[test]
    fn returns_the_leftmost_hop_when_every_hop_is_trusted() {
        assert_eq!(get_client_ip(&make_req(Some("10.0.0.1"), &["192.168.1.5, 172.16.0.1"])), "192.168.1.5");
    }

    #[test]
    fn falls_back_to_the_proxy_address_without_a_forwarded_header() {
        assert_eq!(get_client_ip(&make_req(Some("10.0.0.1"), &[])), "10.0.0.1");
        assert_eq!(get_client_ip(&make_req(Some("10.0.0.1"), &[""])), "10.0.0.1");
    }

    #[test]
    fn only_uses_the_first_forwarded_header_value() {
        assert_eq!(get_client_ip(&make_req(Some("10.0.0.1"), &["1.1.1.1, 2.2.2.2", "3.3.3.3"])), "2.2.2.2");
    }

    #[test]
    fn recognises_private_loopback_shared_and_ula_ranges_as_trusted() {
        for proxy in [
            "10.1.2.3",
            "127.0.0.1",
            "100.64.0.1",
            "100.127.255.255",
            "192.168.0.1",
            "172.16.0.1",
            "172.31.255.255",
            "::1",
            "localhost",
            "fd00::1",
            "fc00::1",
        ] {
            assert_eq!(get_client_ip(&make_req(Some(proxy), &["9.9.9.9"])), "9.9.9.9", "{proxy}");
        }
        for proxy in [
            "100.63.0.1",
            "100.128.0.1",
            "172.15.0.1",
            "172.32.0.1",
            "192.169.0.1",
            "11.0.0.1",
            "fe80::1",
            "10.0.0",
            "10.0.0.256",
        ] {
            assert_eq!(get_client_ip(&make_req(Some(proxy), &["9.9.9.9"])), proxy, "{proxy}");
        }
    }
}

mod inspect {
    use super::*;

    #[test]
    fn allows_clean_requests_without_tracking() {
        let intrusion = Intrusion::new();
        let ip = fresh_ip();
        let capture = log::capture();
        let req = make_req(Some(&ip), &[]);
        for _ in 0..10 {
            assert!(intrusion.inspect(&req, &clean("/api/user")).is_none());
        }
        assert!(capture.matching(log::Level::Warn, &ip).is_empty());
    }

    #[test]
    fn allows_unknown_routes_from_an_allowed_origin() {
        let intrusion = Intrusion::new();
        let req = make_req(Some(&fresh_ip()), &[]);
        let options = InspectOptions { pathname: "/not/a/route", known_route: false, origin_allowed: true, origin: None };
        assert!(intrusion.inspect(&req, &options).is_none());
    }

    #[test]
    fn flags_exploit_probe_paths() {
        let intrusion = Intrusion::new();
        for pathname in [
            "/.git/config",
            "/.git",
            "/wp-admin/install",
            "/WP-CONTENT/x",
            "/cgi-bin/test",
            "/xmlrpc.php",
            "/xmrlpc.php",
            "/.well-known/security.txt",
            "/index.php",
            "/shell.php5/x",
            "/default.aspx",
            "/login.jsp",
        ] {
            let error = intrusion.inspect(&make_req(Some(&fresh_ip()), &[]), &clean(pathname)).expect(pathname);
            assert_eq!(error.status_code, 404, "{pathname}");
            assert_eq!(error.error_code, "intrusion.exploit_probe", "{pathname}");
            assert_eq!(
                tarpit_of(&error),
                Some(json!({"body": "Not found.", "dripIntervalMs": 5000, "holdMs": 25000, "statusCode": 404}))
            );
        }
    }

    #[test]
    fn does_not_flag_lookalike_paths() {
        let intrusion = Intrusion::new();
        for pathname in ["/.gitignore", "/api/git", "/php/info", "/wp-admins"] {
            assert!(intrusion.inspect(&make_req(Some(&fresh_ip()), &[]), &clean(pathname)).is_none(), "{pathname}");
        }
    }

    #[test]
    fn blocks_an_ip_immediately_after_an_exploit_probe() {
        let intrusion = Intrusion::new();
        let req = make_req(Some(&fresh_ip()), &[]);
        assert_eq!(intrusion.inspect(&req, &clean("/.git/config")).unwrap().error_code, "intrusion.exploit_probe");
        let blocked = intrusion.inspect(&req, &clean("/api/user")).unwrap();
        assert_eq!(blocked.status_code, 404);
        assert_eq!(blocked.error_code, "intrusion.blocked");
        let tarpit = tarpit_of(&blocked).unwrap();
        assert_eq!((tarpit["dripIntervalMs"].clone(), tarpit["holdMs"].clone(), tarpit["statusCode"].clone()), (json!(4000), json!(45000), json!(404)));
    }

    #[test]
    fn flags_unknown_routes_from_forbidden_origins_as_suspicious_and_blocks() {
        let intrusion = Intrusion::new();
        let req = make_req(Some(&fresh_ip()), &[]);
        let options =
            InspectOptions { pathname: "/random", known_route: false, origin_allowed: false, origin: Some("https://evil.com") };
        let error = intrusion.inspect(&req, &options).unwrap();
        assert_eq!(error.status_code, 404);
        assert_eq!(error.error_code, "intrusion.suspicious_request");
        let tarpit = tarpit_of(&error).unwrap();
        assert_eq!((tarpit["dripIntervalMs"].clone(), tarpit["holdMs"].clone()), (json!(6000), json!(12000)));
        assert_eq!(intrusion.inspect(&req, &clean("/")).unwrap().error_code, "intrusion.blocked");
    }

    #[test]
    fn forbids_known_routes_from_forbidden_origins_and_blocks_on_the_third_strike() {
        let intrusion = Intrusion::new();
        let req = make_req(Some(&fresh_ip()), &[]);
        let options =
            InspectOptions { pathname: "/api/user", known_route: true, origin_allowed: false, origin: Some("https://evil.com") };
        for _ in 0..3 {
            let error = intrusion.inspect(&req, &options).unwrap();
            assert_eq!(error.status_code, 403);
            assert_eq!(error.error_code, "intrusion.origin_forbidden");
            assert_eq!(error.message, "Forbidden origin \"https://evil.com\" attempted \"/api/user\"");
            assert!(error.tarpit.is_none());
        }
        assert_eq!(intrusion.inspect(&req, &options).unwrap().error_code, "intrusion.blocked");
    }

    #[test]
    fn tracks_blocks_per_client_ip_behind_a_trusted_proxy() {
        let intrusion = Intrusion::new();
        let client = fresh_ip();
        let other = fresh_ip();
        intrusion.inspect(&make_req(Some("10.0.0.1"), &[&client]), &clean("/.env.php"));
        assert_eq!(
            intrusion.inspect(&make_req(Some("10.0.0.2"), &[&client]), &clean("/")).unwrap().error_code,
            "intrusion.blocked"
        );
        assert!(intrusion.inspect(&make_req(Some("10.0.0.1"), &[&other]), &clean("/")).is_none());
    }

    #[test]
    fn expires_blocks_and_escalates_the_duration_of_repeat_blocks() {
        let intrusion = Intrusion::new();
        let start = js::date::parse("2030-01-01T00:00:00.000Z").unwrap();
        let req = make_req(Some(&fresh_ip()), &[]);
        let minute = 60 * 1000;

        intrusion.inspect_at(&req, &clean("/.git/config"), start);
        assert_eq!(
            intrusion.inspect_at(&req, &clean("/"), start + 15 * minute - 1).unwrap().error_code,
            "intrusion.blocked"
        );
        assert!(intrusion.inspect_at(&req, &clean("/"), start + 15 * minute).is_none());

        // second block lasts 60 minutes
        let second = start + 15 * minute;
        intrusion.inspect_at(&req, &clean("/.git/config"), second);
        assert_eq!(
            intrusion.inspect_at(&req, &clean("/"), second + 60 * minute - 1).unwrap().error_code,
            "intrusion.blocked"
        );
        assert!(intrusion.inspect_at(&req, &clean("/"), second + 60 * minute).is_none());
    }

    #[test]
    fn logs_strikes_and_blocks() {
        let intrusion = Intrusion::new();
        let ip = fresh_ip();
        let capture = log::capture();
        intrusion.inspect(&make_req(Some(&ip), &[]), &clean("/.git/config"));
        let lines = capture.matching(log::Level::Warn, &format!("[intrusion] {ip} "));
        assert_eq!(lines.len(), 1);
        assert!(
            lines[0].starts_with(&format!("[intrusion] {ip} exploit probe on \"/.git/config\" blocked-until=")),
            "{}",
            lines[0]
        );
    }
}
