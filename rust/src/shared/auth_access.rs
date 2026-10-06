//! Port of `shared/src/auth/authAccess.ts`: named access points and the rule
//! (signed in / on a team / admin) each one requires.

/// `authPoint`: every access point an endpoint can declare.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum AuthPoint {
    UserSelf,
    UserManage,
    TeamJoin,
    TeamManage,
    TeamDirectoryManage,
    MemberRead,
    MemberManage,
    ReportWrite,
    ReportManage,
    FixtureManage,
    SeasonManage,
    PortManage,
}

impl AuthPoint {
    pub const ALL: [AuthPoint; 12] = [
        AuthPoint::UserSelf,
        AuthPoint::UserManage,
        AuthPoint::TeamJoin,
        AuthPoint::TeamManage,
        AuthPoint::TeamDirectoryManage,
        AuthPoint::MemberRead,
        AuthPoint::MemberManage,
        AuthPoint::ReportWrite,
        AuthPoint::ReportManage,
        AuthPoint::FixtureManage,
        AuthPoint::SeasonManage,
        AuthPoint::PortManage,
    ];

    /// The TS string value, e.g. `team.directory.manage`.
    pub fn as_str(self) -> &'static str {
        match self {
            AuthPoint::UserSelf => "user.self",
            AuthPoint::UserManage => "user.manage",
            AuthPoint::TeamJoin => "team.join",
            AuthPoint::TeamManage => "team.manage",
            AuthPoint::TeamDirectoryManage => "team.directory.manage",
            AuthPoint::MemberRead => "member.read",
            AuthPoint::MemberManage => "member.manage",
            AuthPoint::ReportWrite => "report.write",
            AuthPoint::ReportManage => "report.manage",
            AuthPoint::FixtureManage => "fixture.manage",
            AuthPoint::SeasonManage => "season.manage",
            AuthPoint::PortManage => "port.manage",
        }
    }

    /// `authRuleByPoint[point]`.
    pub fn rule(self) -> AuthRule {
        let signed_in = AuthRule {
            signed_in: true,
            team: false,
            admin: false,
        };
        let team = AuthRule {
            signed_in: false,
            team: true,
            admin: false,
        };
        let admin = AuthRule {
            signed_in: false,
            team: false,
            admin: true,
        };
        match self {
            AuthPoint::UserSelf | AuthPoint::TeamJoin => signed_in,
            AuthPoint::TeamManage
            | AuthPoint::MemberRead
            | AuthPoint::MemberManage
            | AuthPoint::ReportWrite => team,
            AuthPoint::UserManage
            | AuthPoint::TeamDirectoryManage
            | AuthPoint::ReportManage
            | AuthPoint::FixtureManage
            | AuthPoint::SeasonManage
            | AuthPoint::PortManage => admin,
        }
    }
}

/// `TAuthRule`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AuthRule {
    pub signed_in: bool,
    pub team: bool,
    pub admin: bool,
}

/// `TAuthState`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AuthState {
    pub signed_in: bool,
    pub team: bool,
    pub admin: bool,
}

/// The reason `readAuthDeny` gives.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthDeny {
    Admin,
    Team,
    SignIn,
}

impl AuthDeny {
    pub fn as_str(self) -> &'static str {
        match self {
            AuthDeny::Admin => "admin",
            AuthDeny::Team => "team",
            AuthDeny::SignIn => "sign_in",
        }
    }
}

/// `readAuthDeny(state, point)`.
pub fn read_auth_deny(state: AuthState, point: AuthPoint) -> Option<AuthDeny> {
    let rule = point.rule();
    if rule.admin && !state.admin {
        return Some(if state.signed_in {
            AuthDeny::Admin
        } else {
            AuthDeny::SignIn
        });
    }
    if rule.team && !state.admin && !state.team {
        return Some(if state.signed_in {
            AuthDeny::Team
        } else {
            AuthDeny::SignIn
        });
    }
    if rule.signed_in && !state.signed_in {
        return Some(AuthDeny::SignIn);
    }
    None
}

/// `canAccessAuthPoint(state, point)`.
pub fn can_access_auth_point(state: AuthState, point: AuthPoint) -> bool {
    read_auth_deny(state, point).is_none()
}

#[cfg(test)]
mod tests {
    use super::*;

    const ANONYMOUS: AuthState = AuthState {
        signed_in: false,
        team: false,
        admin: false,
    };
    const SIGNED_IN: AuthState = AuthState {
        signed_in: true,
        team: false,
        admin: false,
    };
    const TEAM_MEMBER: AuthState = AuthState {
        signed_in: true,
        team: true,
        admin: false,
    };
    const ADMIN: AuthState = AuthState {
        signed_in: true,
        team: false,
        admin: true,
    };

    mod auth_rule_by_point {
        use super::*;

        #[test]
        fn defines_a_rule_for_every_auth_point() {
            let mut names: Vec<&str> = AuthPoint::ALL.iter().map(|p| p.as_str()).collect();
            names.sort();
            names.dedup();
            assert_eq!(names.len(), 12);
            for point in AuthPoint::ALL {
                let rule = point.rule();
                assert!(rule.signed_in || rule.team || rule.admin, "{point:?}");
            }
        }
    }

    mod read_auth_deny_tests {
        use super::*;

        #[test]
        fn denies_everything_requiring_access_to_anonymous_users_with_sign_in() {
            for point in AuthPoint::ALL {
                assert_eq!(
                    read_auth_deny(ANONYMOUS, point),
                    Some(AuthDeny::SignIn),
                    "{point:?}"
                );
            }
        }

        #[test]
        fn lets_admins_through_every_point() {
            for point in AuthPoint::ALL {
                assert_eq!(read_auth_deny(ADMIN, point), None, "{point:?}");
            }
        }

        #[test]
        fn handles_signed_in_rules() {
            assert_eq!(read_auth_deny(SIGNED_IN, AuthPoint::UserSelf), None);
            assert_eq!(read_auth_deny(SIGNED_IN, AuthPoint::TeamJoin), None);
        }

        #[test]
        fn requires_a_team_for_team_rules_unless_admin() {
            for point in [
                AuthPoint::TeamManage,
                AuthPoint::MemberRead,
                AuthPoint::MemberManage,
                AuthPoint::ReportWrite,
            ] {
                assert_eq!(
                    read_auth_deny(SIGNED_IN, point),
                    Some(AuthDeny::Team),
                    "{point:?}"
                );
                assert_eq!(read_auth_deny(TEAM_MEMBER, point), None, "{point:?}");
            }
        }

        #[test]
        fn requires_admin_for_admin_rules() {
            for point in [
                AuthPoint::UserManage,
                AuthPoint::TeamDirectoryManage,
                AuthPoint::ReportManage,
                AuthPoint::FixtureManage,
                AuthPoint::SeasonManage,
                AuthPoint::PortManage,
            ] {
                assert_eq!(
                    read_auth_deny(SIGNED_IN, point),
                    Some(AuthDeny::Admin),
                    "{point:?}"
                );
                assert_eq!(
                    read_auth_deny(TEAM_MEMBER, point),
                    Some(AuthDeny::Admin),
                    "{point:?}"
                );
            }
        }

        #[test]
        fn trusts_the_state_flags_as_given_even_if_inconsistent() {
            // admin/team without signedIn still count, but deny reasons fall back to sign_in
            assert_eq!(
                read_auth_deny(
                    AuthState {
                        signed_in: false,
                        team: false,
                        admin: true
                    },
                    AuthPoint::UserSelf
                ),
                Some(AuthDeny::SignIn)
            );
            assert_eq!(
                read_auth_deny(
                    AuthState {
                        signed_in: false,
                        team: true,
                        admin: false
                    },
                    AuthPoint::MemberRead
                ),
                None
            );
            assert_eq!(
                read_auth_deny(
                    AuthState {
                        signed_in: false,
                        team: true,
                        admin: false
                    },
                    AuthPoint::SeasonManage
                ),
                Some(AuthDeny::SignIn)
            );
        }
    }

    mod can_access_auth_point_tests {
        use super::*;

        #[test]
        fn mirrors_read_auth_deny() {
            assert!(can_access_auth_point(TEAM_MEMBER, AuthPoint::ReportWrite));
            assert!(!can_access_auth_point(SIGNED_IN, AuthPoint::ReportWrite));
            assert!(!can_access_auth_point(ANONYMOUS, AuthPoint::UserSelf));
            assert!(can_access_auth_point(ADMIN, AuthPoint::PortManage));
        }
    }
}
