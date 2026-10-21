use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::path::Path;
use tracing::info;

use crate::auth::hash_pin;

pub type DbPool = Pool<Sqlite>;

pub async fn init_db(database_url: &str) -> Result<DbPool, sqlx::Error> {
    // If it's a relative path, ensure parent directory exists
    if database_url.starts_with("sqlite:") {
        let path_part = database_url.trim_start_matches("sqlite:");
        if let Some(parent) = Path::new(path_part).parent() {
            if !parent.as_os_str().is_empty() {
                let _ = std::fs::create_dir_all(parent);
            }
        }
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await?;

    create_tables(&pool).await?;
    seed_initial_data(&pool).await?;

    Ok(pool)
}

async fn create_tables(pool: &DbPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_code TEXT UNIQUE NOT NULL,
            pin_hash TEXT NOT NULL,
            role TEXT NOT NULL,
            name TEXT NOT NULL,
            department_id INTEGER,
            is_active BOOLEAN NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS departments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS doctors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            specialization TEXT NOT NULL,
            room_number TEXT NOT NULL,
            is_available BOOLEAN NOT NULL DEFAULT 1,
            department_id INTEGER NOT NULL,
            FOREIGN KEY (department_id) REFERENCES departments(id)
        );
        CREATE TABLE IF NOT EXISTS opd_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            department_id INTEGER NOT NULL,
            doctor_id INTEGER NOT NULL,
            timing TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            FOREIGN KEY (department_id) REFERENCES departments(id),
            FOREIGN KEY (doctor_id) REFERENCES doctors(id)
        );
        CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            age INTEGER NOT NULL,
            phone TEXT NOT NULL,
            department TEXT NOT NULL,
            token_number INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'Waiting',
            symptoms TEXT,
            priority TEXT NOT NULL DEFAULT 'Regular',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_patients_department ON patients(department);
        CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
        CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
        CREATE INDEX IF NOT EXISTS idx_patients_created_at ON patients(created_at);
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_initial_data(pool: &DbPool) -> Result<(), sqlx::Error> {
    let dept_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM departments")
        .fetch_one(pool)
        .await?;

    if dept_count.0 == 0 {
        info!("Seeding initial departments and doctors...");
        let seeds = [
            ("cardiology", "Cardiology", "Heart and cardiovascular care", "Dr. Sharma", "Cardiologist", "Room 204", "9 AM - 5 PM"),
            ("general", "General Medicine", "Primary healthcare & diagnostics", "Dr. Singh", "Physician", "Room 101", "9 AM - 6 PM"),
            ("orthopedics", "Orthopedics", "Bone, joint, and trauma care", "Dr. Kapoor", "Orthopedic Surgeon", "Room 302", "10 AM - 5 PM"),
            ("dental", "Dental", "Oral health and dental surgery", "Dr. Mehta", "Dentist", "Room 108", "10 AM - 4 PM"),
            ("neurology", "Neurology", "Brain, spine, and nerve disorders", "Dr. Verma", "Neurologist", "Room 401", "9 AM - 3 PM"),
            ("gastro", "Gastroenterology", "Digestive and liver health", "Dr. Malhotra", "Gastroenterologist", "Room 205", "9 AM - 2 PM"),
        ];

        for (code, name, desc, doc_name, spec, room, timing) in seeds {
            let dept_id = sqlx::query(
                "INSERT INTO departments (code, name, description, is_active) VALUES (?, ?, ?, 1)"
            )
            .bind(code)
            .bind(name)
            .bind(desc)
            .execute(pool)
            .await?
            .last_insert_rowid();

            let doc_id = sqlx::query(
                "INSERT INTO doctors (name, specialization, room_number, is_available, department_id) VALUES (?, ?, ?, 1, ?)"
            )
            .bind(doc_name)
            .bind(spec)
            .bind(room)
            .bind(dept_id)
            .execute(pool)
            .await?
            .last_insert_rowid();

            sqlx::query(
                "INSERT INTO opd_schedules (department_id, doctor_id, timing, is_active) VALUES (?, ?, ?, 1)"
            )
            .bind(dept_id)
            .bind(doc_id)
            .bind(timing)
            .execute(pool)
            .await?;
        }
    }

    // Seed portal staff logins
    let portal_users = [
        ("ADM-001", "123456", "admin", "System Administrator"),
        ("HOSP-001", "123456", "hospital", "Hospital Manager"),
        ("DR-101", "123456", "staff", "Duty Doctor"),
    ];

    for (code, pin, role, name) in portal_users {
        let exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE employee_code = ?")
            .bind(code)
            .fetch_one(pool)
            .await?;

        if exists.0 == 0 {
            let pin_hash = hash_pin(pin);
            sqlx::query(
                "INSERT INTO users (employee_code, pin_hash, role, name, is_active) VALUES (?, ?, ?, ?, 1)"
            )
            .bind(code)
            .bind(pin_hash)
            .bind(role)
            .bind(name)
            .execute(pool)
            .await?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_init_db_in_memory() {
        let pool = init_db("sqlite::memory:").await.expect("in-memory db init should succeed");

        let dept_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM departments")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(dept_count.0 >= 6);

        let user_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(user_count.0, 3);
    }
}
