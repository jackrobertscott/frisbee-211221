//! Port of `server/src/utils/random.ts`: random alphanumeric strings and ids
//! from a cryptographically secure generator.

pub const ALPHANUMERICS: &[u8; 62] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/// `random.randomString(length)`.
pub fn random_string(length: usize) -> String {
    (0..length)
        .map(|_| ALPHANUMERICS[rand::random_range(0..ALPHANUMERICS.len())] as char)
        .collect()
}

/// `random.generateId()`: 24 random alphanumerics.
pub fn generate_id() -> String {
    random_string(24)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_alphanumeric_ids() {
        let id = generate_id();
        assert_eq!(id.len(), 24);
        assert!(id.bytes().all(|b| b.is_ascii_alphanumeric()));
        assert_ne!(generate_id(), id);
        assert_eq!(random_string(8).len(), 8);
    }
}
