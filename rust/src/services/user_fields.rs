//! Port of `server/src/services/userFields.ts`.

use crate::shared::schemas::{User, UserEmailSafe, UserPublic, UserSafe};

/// `selectPublicUserFields(user)`: the profile fields any signed-in user may
/// see about another user.
pub fn select_public_user_fields(user: &User) -> UserPublic {
    UserPublic {
        id: user.id.clone(),
        created_on: user.created_on.clone(),
        updated_on: user.updated_on.clone(),
        first_name: user.first_name.clone(),
        last_name: user.last_name.clone(),
        gender_matching: user.gender_matching,
        avatar_url: user.avatar_url.clone(),
    }
}

/// `selectSafeUserFields(user)`: the full user without the password or email
/// verification codes.
pub fn select_safe_user_fields(user: &User) -> UserSafe {
    UserSafe {
        id: user.id.clone(),
        created_on: user.created_on.clone(),
        updated_on: user.updated_on.clone(),
        user_merged_ids: user.user_merged_ids.clone(),
        admin: user.admin,
        is_mock: user.is_mock,
        first_name: user.first_name.clone(),
        last_name: user.last_name.clone(),
        gender_matching: user.gender_matching,
        avatar_url: user.avatar_url.clone(),
        bio: user.bio.clone(),
        terms_accepted: user.terms_accepted,
        last_season_id: user.last_season_id.clone(),
        emails: user
            .emails
            .iter()
            .map(|email| UserEmailSafe {
                value: email.value.clone(),
                verified: email.verified,
                created_on: email.created_on.clone(),
                primary: email.primary,
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shared::schemas::{GenderMatching, UserEmail};
    use serde_json::json;

    #[test]
    fn strips_passwords_and_codes() {
        let user = User {
            id: "u".into(),
            created_on: "c".into(),
            updated_on: "u".into(),
            user_merged_ids: None,
            admin: Some(true),
            is_mock: None,
            first_name: "A".into(),
            last_name: "B".into(),
            gender_matching: GenderMatching::Female,
            password: Some("hash".into()),
            emails: vec![UserEmail { value: "a@b.co".into(), verified: true, code: "x".into(), created_on: "c".into(), primary: true }],
            avatar_url: None,
            bio: None,
            terms_accepted: true,
            last_season_id: None,
        };
        let safe = serde_json::to_value(select_safe_user_fields(&user)).unwrap();
        assert!(safe.get("password").is_none());
        assert_eq!(safe["emails"], json!([{"value": "a@b.co", "verified": true, "createdOn": "c", "primary": true}]));
        let public = serde_json::to_value(select_public_user_fields(&user)).unwrap();
        assert_eq!(
            public,
            json!({"id": "u", "createdOn": "c", "updatedOn": "u", "firstName": "A", "lastName": "B", "genderMatching": "female"})
        );
    }
}
