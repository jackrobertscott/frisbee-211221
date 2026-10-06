//! Port of `server/src/services/userMerge.ts`.

use crate::db::{Db, Filter, Patch, Query};
use crate::js;
use crate::services::user_email;
use crate::shared::errors::{AppResult, ErrorOptions, bad_request_error};
use crate::shared::schemas::{Fixture, Member, Report, Session, User, UserEmail};
use crate::tables::{FIXTURE, MEMBER, REPORT, SESSION, USER};

/// `TMemberMergeStep`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MemberMergeStep {
    Delete { member_id: String },
    Move { member_id: String },
}

/// `TReportUserReferences`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ReportUserReferences {
    pub user_id: Option<String>,
    pub mvp_male: Option<String>,
    pub mvp_male2: Option<String>,
    pub mvp_female: Option<String>,
    pub mvp_female2: Option<String>,
    pub updated_on: String,
}

/// `TMergedUserFields`.
#[derive(Clone, Debug, PartialEq)]
pub struct MergedUserFields {
    pub admin: bool,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,
    pub emails: Vec<UserEmail>,
    pub last_season_id: Option<String>,
    pub password: Option<String>,
    pub terms_accepted: bool,
    pub updated_on: String,
    pub user_merged_ids: Vec<String>,
}

/// `mergeUsers(user1Id, user2Id)`: merges `user2` into `user1`: memberships,
/// fixtures, reports and sessions move to `user1` (the sessions ended),
/// `user2` is deleted and `user1` keeps the combined profile. All writes
/// happen in one transaction.
pub async fn merge_users(db: &Db, user1_id: &str, user2_id: &str) -> AppResult<User> {
    if user1_id == user2_id {
        return Err(bad_request_error(
            "Cannot merge a user into itself.",
            ErrorOptions::code("user.merge_invalid"),
        ));
    }
    let user1_id = user1_id.to_string();
    let user2_id = user2_id.to_string();
    db.transaction(move |c| {
        let user1 = USER.tx(c).get_one(&User::ID.eq(&user1_id))?;
        let user2 = USER.tx(c).get_one(&User::ID.eq(&user2_id))?;
        let u1_members = MEMBER
            .tx(c)
            .get_many(&Member::USER_ID.eq(&user1_id), &Query::new())?;
        let u2_members = MEMBER
            .tx(c)
            .get_many(&Member::USER_ID.eq(&user2_id), &Query::new())?;
        let updated_on = js::date::now_iso();
        for step in plan_member_merge(&u1_members, &u2_members) {
            match step {
                MemberMergeStep::Delete { member_id } => {
                    MEMBER.tx(c).delete_one(&Member::ID.eq(&member_id))?;
                }
                MemberMergeStep::Move { member_id } => {
                    MEMBER.tx(c).update_one(
                        &Member::ID.eq(&member_id),
                        &Patch::new()
                            .set(Member::USER_ID, user1.id.clone())
                            .set(Member::UPDATED_ON, updated_on.clone()),
                    )?;
                }
            }
        }
        FIXTURE.tx(c).update_many(
            &Fixture::USER_ID.eq(&user2.id),
            &Patch::new()
                .set(Fixture::USER_ID, user1.id.clone())
                .set(Fixture::UPDATED_ON, updated_on.clone()),
        )?;
        let u2_reports = REPORT.tx(c).get_many(
            &Filter::or([
                Report::USER_ID.eq(&user2.id),
                Report::MVP_MALE.eq(&user2.id),
                Report::MVP_MALE2.eq(&user2.id),
                Report::MVP_FEMALE.eq(&user2.id),
                Report::MVP_FEMALE2.eq(&user2.id),
            ]),
            &Query::new(),
        )?;
        let tasks: Vec<(Filter, Patch)> = u2_reports
            .iter()
            .map(|report| {
                let next = merge_report_user_references(report, &user1.id, &user2.id, &updated_on);
                (
                    Report::ID.eq(&report.id),
                    Patch::new()
                        .set_opt(Report::USER_ID, next.user_id)
                        .set_opt(Report::MVP_MALE, next.mvp_male)
                        .set_opt(Report::MVP_MALE2, next.mvp_male2)
                        .set_opt(Report::MVP_FEMALE, next.mvp_female)
                        .set_opt(Report::MVP_FEMALE2, next.mvp_female2)
                        .set(Report::UPDATED_ON, next.updated_on),
                )
            })
            .collect();
        REPORT.tx(c).update_bulk(&tasks)?;
        // user2's tokens name user2, so they can never authenticate as user1
        SESSION.tx(c).update_many(
            &Session::USER_ID.eq(&user2.id),
            &Patch::new()
                .set(Session::USER_ID, user1.id.clone())
                .set(Session::ENDED, true)
                .set(Session::ENDED_ON, updated_on.clone())
                .set(Session::UPDATED_ON, updated_on.clone()),
        )?;
        USER.tx(c).delete_one(&User::ID.eq(&user2.id))?;
        let fields = merge_user_fields(&user1, &user2, &updated_on);
        USER.tx(c).update_one(
            &User::ID.eq(&user1.id),
            &Patch::new()
                .set(User::ADMIN, fields.admin)
                .set_opt(User::AVATAR_URL, fields.avatar_url)
                .set_opt(User::BIO, fields.bio)
                .set_list(&User::EMAILS, &fields.emails)
                .set_opt(User::LAST_SEASON_ID, fields.last_season_id)
                .set_opt(User::PASSWORD, fields.password)
                .set(User::TERMS_ACCEPTED, fields.terms_accepted)
                .set(User::UPDATED_ON, fields.updated_on)
                .set(User::USER_MERGED_IDS, fields.user_merged_ids),
        )
    })
    .await
}

/// `planMemberMerge(u1Members, u2Members)`: the member writes that move
/// `user2`'s memberships to `user1`, in order. When both are on the same
/// team in a season one membership is dropped, keeping `user2`'s only when it
/// is confirmed and `user1`'s is pending.
pub fn plan_member_merge(u1_members: &[Member], u2_members: &[Member]) -> Vec<MemberMergeStep> {
    let mut steps = Vec::new();
    for u2m in u2_members {
        let overlap = u1_members
            .iter()
            .find(|u1m| u1m.season_id == u2m.season_id && u1m.team_id == u2m.team_id);
        match overlap {
            None => steps.push(MemberMergeStep::Move {
                member_id: u2m.id.clone(),
            }),
            Some(u1m) if u1m.pending && !u2m.pending => {
                steps.push(MemberMergeStep::Delete {
                    member_id: u1m.id.clone(),
                });
                steps.push(MemberMergeStep::Move {
                    member_id: u2m.id.clone(),
                });
            }
            Some(_) => steps.push(MemberMergeStep::Delete {
                member_id: u2m.id.clone(),
            }),
        }
    }
    steps
}

/// `mergeUserFields(user1, user2, updatedOn)`: the profile `user1` keeps
/// after absorbing `user2`.
pub fn merge_user_fields(user1: &User, user2: &User, updated_on: &str) -> MergedUserFields {
    MergedUserFields {
        admin: user1.admin == Some(true) || user2.admin == Some(true),
        avatar_url: user1
            .avatar_url
            .clone()
            .or_else(|| user2.avatar_url.clone()),
        bio: user1.bio.clone().or_else(|| user2.bio.clone()),
        emails: merge_user_emails(user1, user2),
        last_season_id: user1
            .last_season_id
            .clone()
            .or_else(|| user2.last_season_id.clone()),
        password: user1.password.clone().or_else(|| user2.password.clone()),
        terms_accepted: user1.terms_accepted || user2.terms_accepted,
        updated_on: updated_on.to_string(),
        user_merged_ids: merge_user_merged_ids(user1, user2),
    }
}

/// `mergeUserMergedIds(user1, user2)`: every id ever merged into either user,
/// plus `user2` itself (first occurrence order, without `user1`).
pub fn merge_user_merged_ids(user1: &User, user2: &User) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    let all = user1
        .user_merged_ids
        .iter()
        .flatten()
        .chain(std::iter::once(&user2.id))
        .chain(user2.user_merged_ids.iter().flatten());
    for id in all {
        if !ids.contains(id) {
            ids.push(id.clone());
        }
    }
    ids.retain(|id| *id != user1.id);
    ids
}

fn normalize_email(value: &str) -> String {
    js::to_lower(js::trim(value))
}

/// The earlier of two ISO dates (`new Date(Math.min(...)).toISOString()`).
fn earliest(first: &str, second: &str) -> String {
    match (js::date::parse(first), js::date::parse(second)) {
        (Some(a), Some(b)) => js::date::to_iso_string(a.min(b)),
        _ => first.to_string(),
    }
}

/// `mergeUserEmails(user1, user2)`: both users' emails, deduplicated
/// case-insensitively. A verified copy wins, the earliest creation date is
/// kept, and `user1`'s primary email stays primary.
pub fn merge_user_emails(user1: &User, user2: &User) -> Vec<UserEmail> {
    let primary_key = normalize_email(
        user_email::primary(user1)
            .or_else(|| user_email::primary(user2))
            .map(|email| email.value.as_str())
            .unwrap_or(""),
    );
    let mut emails: Vec<(String, UserEmail)> = Vec::new();
    for email in user1.emails.iter().chain(user2.emails.iter()) {
        let key = normalize_email(&email.value);
        let index = emails.iter().position(|(k, _)| *k == key);
        let current = index.map(|i| &emails[i].1);
        let preferred = match current {
            Some(current) if current.verified => current,
            _ if email.verified => email,
            Some(current) => current,
            None => email,
        };
        let created_on = match current {
            Some(current) => earliest(&current.created_on, &email.created_on),
            None => preferred.created_on.clone(),
        };
        let next = UserEmail {
            value: js::trim(&preferred.value).to_string(),
            verified: current.is_some_and(|c| c.verified) || email.verified,
            code: preferred.code.clone(),
            created_on,
            primary: key == primary_key,
        };
        match index {
            Some(i) => emails[i].1 = next,
            None => emails.push((key, next)),
        }
    }
    let mut merged: Vec<UserEmail> = emails.into_iter().map(|(_, email)| email).collect();
    let primary_count = merged.iter().filter(|email| email.primary).count();
    if primary_count != 1 && !merged.is_empty() {
        for (index, email) in merged.iter_mut().enumerate() {
            email.primary = index == 0;
        }
    }
    merged
}

/// `mergeReportUserReferences(report, targetUserId, sourceUserId, updatedOn)`:
/// a report's user references with `source_user_id` replaced by
/// `target_user_id`, dropping any MVP slot that would now name the same user
/// twice.
pub fn merge_report_user_references(
    report: &Report,
    target_user_id: &str,
    source_user_id: &str,
    updated_on: &str,
) -> ReportUserReferences {
    let swap = |user_id: &Option<String>| -> Option<String> {
        user_id.as_ref().map(|id| {
            if id == source_user_id {
                target_user_id.to_string()
            } else {
                id.clone()
            }
        })
    };
    let mut next = ReportUserReferences {
        user_id: swap(&report.user_id),
        mvp_male: swap(&report.mvp_male),
        mvp_male2: swap(&report.mvp_male2),
        mvp_female: swap(&report.mvp_female),
        mvp_female2: swap(&report.mvp_female2),
        updated_on: updated_on.to_string(),
    };
    // JavaScript truthiness: an empty id never counts as a repeat
    let set = |value: &Option<String>| value.as_deref().is_some_and(|v| !v.is_empty());
    if set(&next.mvp_male) && next.mvp_male == next.mvp_male2 {
        next.mvp_male2 = None;
    }
    if set(&next.mvp_female) && next.mvp_female == next.mvp_female2 {
        next.mvp_female2 = None;
    }
    if set(&next.mvp_male) && next.mvp_male == next.mvp_female {
        next.mvp_female = None;
    }
    next
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::schemas::GenderMatching;

    const NOW: &str = "2026-01-01T00:00:00.000Z";

    fn make_email(value: &str) -> UserEmail {
        UserEmail {
            value: value.into(),
            verified: false,
            code: "code".into(),
            created_on: NOW.into(),
            primary: false,
        }
    }

    fn with<T>(mut value: T, adjust: impl FnOnce(&mut T)) -> T {
        adjust(&mut value);
        value
    }

    fn make_user(id: &str) -> User {
        User {
            id: id.into(),
            created_on: NOW.into(),
            updated_on: NOW.into(),
            user_merged_ids: None,
            admin: None,
            is_mock: None,
            first_name: "First".into(),
            last_name: "Last".into(),
            gender_matching: GenderMatching::Female,
            password: None,
            emails: vec![],
            avatar_url: None,
            bio: None,
            terms_accepted: false,
            last_season_id: None,
        }
    }

    fn make_member(id: &str, team_id: &str, pending: bool) -> Member {
        Member {
            id: id.into(),
            created_on: NOW.into(),
            updated_on: NOW.into(),
            user_id: "user".into(),
            season_id: "season".into(),
            team_id: team_id.into(),
            is_mock: None,
            captain: None,
            pending,
        }
    }

    fn make_report(adjust: impl FnOnce(&mut Report)) -> Report {
        let report: Report = serde_json::from_value(serde_json::json!({
            "id": "report",
            "createdOn": NOW,
            "updatedOn": NOW,
            "teamId": "team",
            "teamAgainstId": "against",
            "fixtureId": "fixture",
            "scoreFor": 0,
            "scoreAgainst": 0,
            "spiritComment": "",
        }))
        .unwrap();
        with(report, adjust)
    }

    fn some(value: &str) -> Option<String> {
        Some(value.to_string())
    }

    mod plan_member_merge {
        use super::*;

        #[test]
        fn moves_memberships_that_do_not_overlap() {
            assert_eq!(
                plan_member_merge(&[], &[make_member("m2", "team", false)]),
                [MemberMergeStep::Move {
                    member_id: "m2".into()
                }]
            );
        }

        #[test]
        fn replaces_a_pending_user1_membership_with_a_confirmed_user2_one() {
            let u1 = [make_member("m1", "team", true)];
            let u2 = [make_member("m2", "team", false)];
            assert_eq!(
                plan_member_merge(&u1, &u2),
                [
                    MemberMergeStep::Delete {
                        member_id: "m1".into()
                    },
                    MemberMergeStep::Move {
                        member_id: "m2".into()
                    },
                ]
            );
        }

        #[test]
        fn otherwise_drops_the_overlapping_user2_membership() {
            let u1 = [make_member("m1", "team", false)];
            assert_eq!(
                plan_member_merge(&u1, &[make_member("m2", "team", true)]),
                [MemberMergeStep::Delete {
                    member_id: "m2".into()
                }]
            );
            let pending_u1 = [make_member("m1", "team", true)];
            assert_eq!(
                plan_member_merge(&pending_u1, &[make_member("m2", "team", true)]),
                [MemberMergeStep::Delete {
                    member_id: "m2".into()
                }]
            );
        }
    }

    mod merge_user_merged_ids {
        use super::*;

        #[test]
        fn combines_merged_ids_with_user2_and_excludes_user1() {
            let user1 = with(make_user("u1"), |u| {
                u.user_merged_ids = Some(vec!["a".into(), "u1".into()])
            });
            let user2 = with(make_user("u2"), |u| {
                u.user_merged_ids = Some(vec!["a".into(), "b".into()])
            });
            assert_eq!(merge_user_merged_ids(&user1, &user2), ["a", "u2", "b"]);
        }
    }

    mod merge_user_emails {
        use super::*;

        #[test]
        fn deduplicates_case_insensitively_preferring_the_verified_copy() {
            let user1 = with(make_user("u1"), |u| {
                u.emails = vec![with(make_email("a@x.com"), |e| e.primary = true)]
            });
            let user2 = with(make_user("u2"), |u| {
                u.emails = vec![with(make_email(" A@X.com "), |e| {
                    e.verified = true;
                    e.code = "verified".into();
                    e.created_on = "2025-01-01T00:00:00.000Z".into();
                })]
            });
            assert_eq!(
                merge_user_emails(&user1, &user2),
                [UserEmail {
                    value: "A@X.com".into(),
                    verified: true,
                    code: "verified".into(),
                    created_on: "2025-01-01T00:00:00.000Z".into(),
                    primary: true,
                }]
            );
        }

        #[test]
        fn keeps_user1s_primary_email_primary() {
            let user1 = with(make_user("u1"), |u| {
                u.emails = vec![
                    make_email("a@x.com"),
                    with(make_email("b@x.com"), |e| e.primary = true),
                ]
            });
            let user2 = with(make_user("u2"), |u| {
                u.emails = vec![with(make_email("c@x.com"), |e| e.primary = true)]
            });
            let pairs: Vec<(String, bool)> = merge_user_emails(&user1, &user2)
                .into_iter()
                .map(|e| (e.value, e.primary))
                .collect();
            assert_eq!(
                pairs,
                [
                    ("a@x.com".to_string(), false),
                    ("b@x.com".to_string(), true),
                    ("c@x.com".to_string(), false),
                ]
            );
        }

        #[test]
        fn falls_back_to_the_first_email_when_there_is_no_primary() {
            let user1 = make_user("u1");
            let user2 = with(make_user("u2"), |u| {
                u.emails = vec![make_email("a@x.com"), make_email("b@x.com")]
            });
            let primaries: Vec<bool> = merge_user_emails(&user1, &user2)
                .iter()
                .map(|e| e.primary)
                .collect();
            assert_eq!(primaries, [true, false]);
        }

        #[test]
        fn returns_nothing_when_neither_user_has_an_email() {
            assert!(merge_user_emails(&make_user("u1"), &make_user("u2")).is_empty());
        }
    }

    mod merge_user_fields {
        use super::*;

        #[test]
        fn prefers_user1s_values_and_fills_gaps_from_user2() {
            let user1 = with(make_user("u1"), |u| {
                u.bio = some("one");
                u.terms_accepted = false;
            });
            let user2 = with(make_user("u2"), |u| {
                u.admin = Some(true);
                u.avatar_url = some("avatar");
                u.bio = some("two");
                u.last_season_id = some("season");
                u.password = some("hash");
                u.terms_accepted = true;
            });
            assert_eq!(
                merge_user_fields(&user1, &user2, "later"),
                MergedUserFields {
                    admin: true,
                    avatar_url: some("avatar"),
                    bio: some("one"),
                    emails: vec![],
                    last_season_id: some("season"),
                    password: some("hash"),
                    terms_accepted: true,
                    updated_on: "later".into(),
                    user_merged_ids: vec!["u2".into()],
                }
            );
        }
    }

    mod merge_report_user_references {
        use super::*;

        #[test]
        fn replaces_every_reference_to_the_source_user() {
            let report = make_report(|r| {
                r.user_id = some("src");
                r.mvp_male = some("src");
                r.mvp_female2 = some("src");
            });
            assert_eq!(
                merge_report_user_references(&report, "dst", "src", "later"),
                ReportUserReferences {
                    user_id: some("dst"),
                    mvp_male: some("dst"),
                    mvp_male2: None,
                    mvp_female: None,
                    mvp_female2: some("dst"),
                    updated_on: "later".into(),
                }
            );
        }

        #[test]
        fn clears_second_mvp_slots_that_now_repeat_the_first() {
            let report = make_report(|r| {
                r.mvp_male = some("dst");
                r.mvp_male2 = some("src");
                r.mvp_female = some("other");
                r.mvp_female2 = some("other");
            });
            let next = merge_report_user_references(&report, "dst", "src", "later");
            assert_eq!(next.mvp_male2, None);
            assert_eq!(next.mvp_female, some("other"));
            assert_eq!(next.mvp_female2, None);
        }

        #[test]
        fn clears_the_female_mvp_when_it_now_repeats_the_male_mvp() {
            let report = make_report(|r| {
                r.mvp_male = some("dst");
                r.mvp_female = some("src");
            });
            let next = merge_report_user_references(&report, "dst", "src", "later");
            assert_eq!(next.mvp_male, some("dst"));
            assert_eq!(next.mvp_female, None);
        }
    }
}
