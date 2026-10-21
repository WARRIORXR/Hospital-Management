use hmac::Hmac;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;

pub const PBKDF2_ITERATIONS: u32 = 260_000;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub exp: usize,
}

pub fn hash_pin(pin: &str) -> String {
    let mut salt_bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt_bytes);
    let salt = hex::encode(salt_bytes);

    let mut buf = [0u8; 32];
    pbkdf2::pbkdf2::<Hmac<Sha256>>(pin.as_bytes(), &salt_bytes, PBKDF2_ITERATIONS, &mut buf)
        .expect("pbkdf2 computation failed");

    format!(
        "pbkdf2_sha256${}${}${}",
        PBKDF2_ITERATIONS,
        salt,
        hex::encode(buf)
    )
}

pub fn verify_pin(pin: &str, stored: &str) -> bool {
    let parts: Vec<&str> = stored.split('$').collect();
    if parts.len() != 4 || parts[0] != "pbkdf2_sha256" {
        return false;
    }

    let iterations: u32 = match parts[1].parse() {
        Ok(i) => i,
        Err(_) => return false,
    };

    let salt_bytes = match hex::decode(parts[2]) {
        Ok(s) => s,
        Err(_) => return false,
    };

    let expected = parts[3];

    let mut buf = [0u8; 32];
    if pbkdf2::pbkdf2::<Hmac<Sha256>>(pin.as_bytes(), &salt_bytes, iterations, &mut buf).is_err() {
        return false;
    }

    hex::encode(buf) == expected
}

pub fn create_token(
    sub: &str,
    role: &str,
    name: Option<&str>,
    secret: &str,
    ttl_seconds: usize,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = chrono::Utc::now().timestamp() as usize;
    let claims = Claims {
        sub: sub.to_string(),
        role: role.to_string(),
        name: name.map(|s| s.to_string()),
        exp: now + ttl_seconds,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

#[allow(dead_code)]
pub fn decode_token(
    token: &str,
    secret: &str,
) -> Result<Claims, jsonwebtoken::errors::Error> {
    let validation = Validation::default();
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )?;
    Ok(token_data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_and_verify_pin() {
        let pin = "123456";
        let hashed = hash_pin(pin);
        assert!(hashed.starts_with("pbkdf2_sha256$260000$"));
        assert!(verify_pin(pin, &hashed));
        assert!(!verify_pin("wrong_pin", &hashed));
    }

    #[test]
    fn test_jwt_create_and_decode() {
        let secret = "test-secret-key-32-chars-long!!";
        let token = create_token("ADM-001", "admin", Some("Administrator"), secret, 3600)
            .expect("token creation should succeed");

        let claims = decode_token(&token, secret).expect("token decode should succeed");
        assert_eq!(claims.sub, "ADM-001");
        assert_eq!(claims.role, "admin");
        assert_eq!(claims.name.as_deref(), Some("Administrator"));

        // Wrong secret must fail
        assert!(decode_token(&token, "wrong-secret-key-must-fail!!!").is_err());
    }

    #[test]
    fn test_verify_pin_invalid_format() {
        assert!(!verify_pin("123456", "invalid_format"));
        assert!(!verify_pin("123456", "pbkdf2_sha256$invalid$salt$hash"));
    }
}
