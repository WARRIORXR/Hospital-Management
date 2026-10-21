use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

use crate::{
    auth::{create_token, verify_pin},
    db::DbPool,
    models::*,
};

#[derive(Clone)]
pub struct AppState {
    pub pool: DbPool,
    pub jwt_secret: String,
}

#[allow(dead_code)]
pub fn get_bearer_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| {
            if h.starts_with("Bearer ") {
                Some(h[7..].trim().to_string())
            } else {
                None
            }
        })
}

// ----------------------------------------------------
// Root & Health
// ----------------------------------------------------

pub async fn root() -> impl IntoResponse {
    Json(json!({
        "message": "QueueLess API is running",
        "status": "success"
    }))
}

pub async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let check: Result<(i64,), _> = sqlx::query_as("SELECT 1")
        .fetch_one(&state.pool)
        .await;

    match check {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({
                "status": "ok",
                "database": "connected"
            })),
        ),
        Err(e) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "status": "error",
                "database": e.to_string()
            })),
        ),
    }
}

// ----------------------------------------------------
// Authentication
// ----------------------------------------------------

pub async fn request_otp(Json(payload): Json<OtpRequest>) -> impl IntoResponse {
    let clean_phone = payload.phone.trim();
    if clean_phone.len() < 10 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "detail": "Valid 10-digit phone number is required" })),
        );
    }

    (
        StatusCode::OK,
        Json(json!({
            "message": "OTP sent successfully",
            "phone": clean_phone,
            "expires_in_seconds": 300,
            "debug_otp": "123456"
        })),
    )
}

pub async fn verify_otp(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<OtpVerifyRequest>,
) -> impl IntoResponse {
    let clean_phone = payload.phone.trim();
    let clean_code = payload.code.trim();

    // Default prototype accepts 123456 or 6-digit code
    if clean_code != "123456" && clean_code.len() != 6 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "detail": "Invalid or expired OTP" })),
        );
    }

    match create_token(clean_phone, "patient", None, &state.jwt_secret, 12 * 3600) {
        Ok(token) => (
            StatusCode::OK,
            Json(json!({
                "access_token": token,
                "token_type": "bearer",
                "phone": clean_phone
            })),
        ),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": "Failed to create token" })),
        ),
    }
}

pub async fn staff_login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<StaffLoginRequest>,
) -> impl IntoResponse {
    let code = payload.employee_code.trim().to_uppercase();
    let pin = payload.pin.trim();

    let user: Result<User, _> = sqlx::query_as("SELECT * FROM users WHERE employee_code = ? AND is_active = 1")
        .bind(&code)
        .fetch_one(&state.pool)
        .await;

    match user {
        Ok(u) => {
            if verify_pin(pin, &u.pin_hash) {
                let token = create_token(
                    &u.employee_code,
                    &u.role,
                    Some(&u.name),
                    &state.jwt_secret,
                    12 * 3600,
                )
                .unwrap_or_default();

                (
                    StatusCode::OK,
                    Json(json!({
                        "access_token": token,
                        "token_type": "bearer",
                        "role": u.role,
                        "name": u.name,
                        "employee_code": u.employee_code
                    })),
                )
            } else {
                (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({ "detail": "Invalid credentials or PIN" })),
                )
            }
        }
        Err(_) => (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "detail": "Invalid credentials or employee code" })),
        ),
    }
}

// ----------------------------------------------------
// Departments & Doctors
// ----------------------------------------------------

pub async fn list_departments(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let depts: Vec<Department> = sqlx::query_as(
        "SELECT * FROM departments WHERE is_active = 1 ORDER BY id ASC"
    )
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let outs: Vec<DepartmentOut> = depts
        .into_iter()
        .map(|d| DepartmentOut {
            id: d.id,
            code: d.code,
            name: d.name,
            description: d.description,
            is_active: d.is_active,
        })
        .collect();

    Json(outs)
}

pub async fn list_doctors(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let doctors: Vec<Doctor> = sqlx::query_as("SELECT * FROM doctors ORDER BY id ASC")
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

    let depts: Vec<Department> = sqlx::query_as("SELECT * FROM departments")
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

    let dept_map: std::collections::HashMap<i64, String> = depts
        .into_iter()
        .map(|d| (d.id, d.name))
        .collect();

    let outs: Vec<DoctorOut> = doctors
        .into_iter()
        .map(|doc| {
            let dept_name = dept_map
                .get(&doc.department_id)
                .cloned()
                .unwrap_or_else(|| "General".to_string());
            DoctorOut {
                id: doc.id,
                name: doc.name,
                specialization: doc.specialization,
                room_number: doc.room_number,
                is_available: doc.is_available,
                department_id: doc.department_id,
                department_name: dept_name,
            }
        })
        .collect();

    Json(outs)
}

pub async fn toggle_doctor_availability(
    State(state): State<Arc<AppState>>,
    Path(doctor_id): Path<i64>,
) -> impl IntoResponse {
    let res = sqlx::query(
        "UPDATE doctors SET is_available = CASE WHEN is_available = 1 THEN 0 ELSE 1 END WHERE id = ?"
    )
    .bind(doctor_id)
    .execute(&state.pool)
    .await;

    match res {
        Ok(_) => {
            let doc: Result<Doctor, _> = sqlx::query_as("SELECT * FROM doctors WHERE id = ?")
                .bind(doctor_id)
                .fetch_one(&state.pool)
                .await;
            match doc {
                Ok(d) => (StatusCode::OK, Json(json!(d))),
                Err(_) => (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "detail": "Doctor not found" })),
                ),
            }
        }
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "detail": "Database error" })),
        ),
    }
}

// ----------------------------------------------------
// Public OPDs
// ----------------------------------------------------

pub async fn get_opds(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let depts: Vec<Department> = sqlx::query_as(
        "SELECT * FROM departments WHERE is_active = 1 ORDER BY id ASC"
    )
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let mut cards: Vec<OpdCard> = Vec::new();

    for dept in depts {
        let code_lower = dept.code.to_lowercase();

        // Count waiting patients today
        let waiting_count: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM patients WHERE LOWER(department) = ? AND LOWER(status) = 'waiting' AND DATE(created_at) = DATE('now')"
        )
        .bind(&code_lower)
        .fetch_one(&state.pool)
        .await
        .unwrap_or((0,));

        // Get active serving token
        let active_token: Option<(i64,)> = sqlx::query_as(
            "SELECT token_number FROM patients WHERE LOWER(department) = ? AND LOWER(status) IN ('called', 'consulting') AND DATE(created_at) = DATE('now') ORDER BY id DESC LIMIT 1"
        )
        .bind(&code_lower)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

        // Doctor info
        let doc: Option<Doctor> = sqlx::query_as(
            "SELECT * FROM doctors WHERE department_id = ? LIMIT 1"
        )
        .bind(dept.id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

        let sched: Option<OpdSchedule> = sqlx::query_as(
            "SELECT * FROM opd_schedules WHERE department_id = ? AND is_active = 1 LIMIT 1"
        )
        .bind(dept.id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

        let is_available = doc.as_ref().map(|d| d.is_available).unwrap_or(true);
        let doctor_name = doc.map(|d| d.name).unwrap_or_else(|| "Duty Doctor".to_string());
        let room = sched.as_ref().map(|_| "Room 101".to_string()).unwrap_or_else(|| "Room 101".to_string());
        let timing = sched.map(|s| s.timing).unwrap_or_else(|| "9 AM - 5 PM".to_string());

        let (status, status_code) = if !is_available {
            ("Doctor on Break".to_string(), "break".to_string())
        } else if active_token.is_some() || waiting_count.0 > 0 {
            ("Busy".to_string(), "busy".to_string())
        } else {
            ("Available".to_string(), "available".to_string())
        };

        let wait_minutes = waiting_count.0 * 8;

        cards.push(OpdCard {
            department: dept.name,
            code: dept.code,
            doctor: doctor_name,
            room,
            timing,
            status,
            status_code,
            waiting: waiting_count.0,
            wait_time: format!("{} mins", wait_minutes),
            wait_minutes,
            current_token: active_token.map(|t| t.0),
        });
    }

    Json(cards)
}

// ----------------------------------------------------
// Patient & Queue Management
// ----------------------------------------------------

pub async fn register_patient(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<PatientRegisterRequest>,
) -> impl IntoResponse {
    let clean_phone = payload.phone.trim();
    let dept_lower = payload.department.trim().to_lowercase();

    // Check for existing active token today
    let existing: Option<Patient> = sqlx::query_as(
        "SELECT * FROM patients WHERE phone = ? AND LOWER(status) IN ('waiting', 'called', 'consulting') AND DATE(created_at) = DATE('now') ORDER BY id DESC LIMIT 1"
    )
    .bind(clean_phone)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    if let Some(p) = existing {
        return (StatusCode::OK, Json(json!(p)));
    }

    // Determine next token number for this department today
    let max_token: (i64,) = sqlx::query_as(
        "SELECT COALESCE(MAX(token_number), 0) FROM patients WHERE LOWER(department) = ? AND DATE(created_at) = DATE('now')"
    )
    .bind(&dept_lower)
    .fetch_one(&state.pool)
    .await
    .unwrap_or((0,));

    let next_token = max_token.0 + 1;
    let priority = payload.priority.unwrap_or_else(|| "Regular".to_string());
    let symptoms = payload.symptoms.unwrap_or_default();

    let id = sqlx::query(
        "INSERT INTO patients (name, age, phone, department, token_number, status, symptoms, priority, created_at) VALUES (?, ?, ?, ?, ?, 'Waiting', ?, ?, CURRENT_TIMESTAMP)"
    )
    .bind(&payload.name)
    .bind(payload.age)
    .bind(clean_phone)
    .bind(&dept_lower)
    .bind(next_token)
    .bind(&symptoms)
    .bind(&priority)
    .execute(&state.pool)
    .await
    .map(|r| r.last_insert_rowid())
    .unwrap_or(0);

    let created: Patient = sqlx::query_as("SELECT * FROM patients WHERE id = ?")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .unwrap();

    (StatusCode::CREATED, Json(json!(created)))
}

#[derive(Debug, Deserialize)]
pub struct PatientFilter {
    pub department: Option<String>,
    pub status: Option<String>,
    pub today: Option<bool>,
}

pub fn priority_rank(p: &str) -> i32 {
    match p.to_lowercase().as_str() {
        "emergency" => 1,
        "elderly" | "pregnant" => 2,
        "follow_up" | "follow-up" => 3,
        _ => 4,
    }
}

pub async fn list_patients(
    State(state): State<Arc<AppState>>,
    Query(query): Query<PatientFilter>,
) -> impl IntoResponse {
    let mut sql = "SELECT * FROM patients WHERE 1=1".to_string();
    if let Some(ref dept) = query.department {
        if !dept.is_empty() {
            sql.push_str(&format!(" AND LOWER(department) = '{}'", dept.to_lowercase()));
        }
    }
    if let Some(ref st) = query.status {
        if !st.is_empty() {
            sql.push_str(&format!(" AND LOWER(status) = '{}'", st.to_lowercase()));
        }
    }
    if query.today.unwrap_or(true) {
        sql.push_str(" AND DATE(created_at) = DATE('now')");
    }

    let mut patients: Vec<Patient> = sqlx::query_as(&sql)
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

    if query.status.as_deref().map(|s| s.to_lowercase()) == Some("waiting".to_string()) {
        patients.sort_by(|a, b| {
            let rank_a = priority_rank(a.priority.as_deref().unwrap_or("regular"));
            let rank_b = priority_rank(b.priority.as_deref().unwrap_or("regular"));
            rank_a.cmp(&rank_b).then_with(|| a.token_number.cmp(&b.token_number))
        });
    } else {
        patients.sort_by_key(|p| p.token_number);
    }

    Json(patients)
}

pub async fn get_patient_by_phone(
    State(state): State<Arc<AppState>>,
    Path(phone): Path<String>,
) -> impl IntoResponse {
    let patient: Option<Patient> = sqlx::query_as(
        "SELECT * FROM patients WHERE phone = ? AND DATE(created_at) = DATE('now') ORDER BY id DESC LIMIT 1"
    )
    .bind(phone.trim())
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    match patient {
        Some(p) => (StatusCode::OK, Json(json!(p))),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "No visit found for this mobile number today" })),
        ),
    }
}

pub async fn get_patient_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let patient: Option<Patient> = sqlx::query_as("SELECT * FROM patients WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

    match patient {
        Some(p) => (StatusCode::OK, Json(json!(p))),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "Patient not found" })),
        ),
    }
}

pub async fn call_patient(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let patient: Option<Patient> = sqlx::query_as("SELECT * FROM patients WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

    let Some(p) = patient else {
        return (StatusCode::NOT_FOUND, Json(json!({ "detail": "Patient not found" })));
    };

    // Room guard: check if another patient is Called/Consulting
    let active: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM patients WHERE LOWER(department) = LOWER(?) AND id != ? AND LOWER(status) IN ('called', 'consulting') AND DATE(created_at) = DATE('now') LIMIT 1"
    )
    .bind(&p.department)
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    if active.is_some() {
        return (
            StatusCode::CONFLICT,
            Json(json!({ "detail": "Another patient is already called or consulting in this department" })),
        );
    }

    let _ = sqlx::query("UPDATE patients SET status = 'Called' WHERE id = ?")
        .bind(id)
        .execute(&state.pool)
        .await;

    let updated: Patient = sqlx::query_as("SELECT * FROM patients WHERE id = ?")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .unwrap();

    (StatusCode::OK, Json(json!(updated)))
}

pub async fn consult_patient(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let _ = sqlx::query("UPDATE patients SET status = 'Consulting' WHERE id = ?")
        .bind(id)
        .execute(&state.pool)
        .await;

    let updated: Patient = sqlx::query_as("SELECT * FROM patients WHERE id = ?")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .unwrap();

    (StatusCode::OK, Json(json!(updated)))
}

pub async fn complete_patient(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let _ = sqlx::query("UPDATE patients SET status = 'Completed' WHERE id = ?")
        .bind(id)
        .execute(&state.pool)
        .await;

    let updated: Patient = sqlx::query_as("SELECT * FROM patients WHERE id = ?")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .unwrap();

    (StatusCode::OK, Json(json!(updated)))
}

pub async fn skip_patient(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let _ = sqlx::query("UPDATE patients SET status = 'Skipped' WHERE id = ?")
        .bind(id)
        .execute(&state.pool)
        .await;

    let updated: Patient = sqlx::query_as("SELECT * FROM patients WHERE id = ?")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .unwrap();

    (StatusCode::OK, Json(json!(updated)))
}

pub async fn cancel_patient(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let _ = sqlx::query("UPDATE patients SET status = 'Cancelled' WHERE id = ?")
        .bind(id)
        .execute(&state.pool)
        .await;

    let updated: Patient = sqlx::query_as("SELECT * FROM patients WHERE id = ?")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .unwrap();

    (StatusCode::OK, Json(json!(updated)))
}

pub async fn requeue_patient(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let _ = sqlx::query("UPDATE patients SET status = 'Waiting' WHERE id = ?")
        .bind(id)
        .execute(&state.pool)
        .await;

    let updated: Patient = sqlx::query_as("SELECT * FROM patients WHERE id = ?")
        .bind(id)
        .fetch_one(&state.pool)
        .await
        .unwrap();

    (StatusCode::OK, Json(json!(updated)))
}

#[derive(Debug, Deserialize)]
pub struct CallNextParams {
    pub department: Option<String>,
}

pub async fn call_next(
    State(state): State<Arc<AppState>>,
    Query(params): Query<CallNextParams>,
) -> impl IntoResponse {
    let Some(dept) = params.department else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "detail": "department query parameter is required" })),
        );
    };

    let dept_lower = dept.to_lowercase();

    // Check room guard
    let active: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM patients WHERE LOWER(department) = ? AND LOWER(status) IN ('called', 'consulting') AND DATE(created_at) = DATE('now') LIMIT 1"
    )
    .bind(&dept_lower)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    if active.is_some() {
        return (
            StatusCode::CONFLICT,
            Json(json!({ "detail": "A patient is already being called or consulting in this department" })),
        );
    }

    let mut waiting: Vec<Patient> = sqlx::query_as(
        "SELECT * FROM patients WHERE LOWER(department) = ? AND LOWER(status) = 'waiting' AND DATE(created_at) = DATE('now')"
    )
    .bind(&dept_lower)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    if waiting.is_empty() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "No waiting patients in this department" })),
        );
    }

    waiting.sort_by(|a, b| {
        let rank_a = priority_rank(a.priority.as_deref().unwrap_or("regular"));
        let rank_b = priority_rank(b.priority.as_deref().unwrap_or("regular"));
        rank_a.cmp(&rank_b).then_with(|| a.token_number.cmp(&b.token_number))
    });

    let next = &waiting[0];
    let _ = sqlx::query("UPDATE patients SET status = 'Called' WHERE id = ?")
        .bind(next.id)
        .execute(&state.pool)
        .await;

    let updated: Patient = sqlx::query_as("SELECT * FROM patients WHERE id = ?")
        .bind(next.id)
        .fetch_one(&state.pool)
        .await
        .unwrap();

    (StatusCode::OK, Json(json!(updated)))
}

pub async fn queue_status(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let patient: Option<Patient> = sqlx::query_as("SELECT * FROM patients WHERE id = ?")
        .bind(id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

    let Some(p) = patient else {
        return (StatusCode::NOT_FOUND, Json(json!({ "detail": "Patient not found" })));
    };

    let dept_lower = p.department.to_lowercase();

    // Calculate queue position if waiting
    let position = if p.status.as_deref().map(|s| s.to_lowercase()) == Some("waiting".to_string()) {
        let mut waiting: Vec<Patient> = sqlx::query_as(
            "SELECT * FROM patients WHERE LOWER(department) = ? AND LOWER(status) = 'waiting' AND DATE(created_at) = DATE('now')"
        )
        .bind(&dept_lower)
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

        waiting.sort_by(|a, b| {
            let rank_a = priority_rank(a.priority.as_deref().unwrap_or("regular"));
            let rank_b = priority_rank(b.priority.as_deref().unwrap_or("regular"));
            rank_a.cmp(&rank_b).then_with(|| a.token_number.cmp(&b.token_number))
        });

        waiting.iter().position(|x| x.id == p.id).map(|pos| (pos + 1) as i64).unwrap_or(1)
    } else {
        0
    };

    let serving_token: Option<(i64,)> = sqlx::query_as(
        "SELECT token_number FROM patients WHERE LOWER(department) = ? AND LOWER(status) IN ('called', 'consulting') AND DATE(created_at) = DATE('now') ORDER BY id DESC LIMIT 1"
    )
    .bind(&dept_lower)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    let wait_min = if position > 0 { (position - 1) * 8 } else { 0 };

    (
        StatusCode::OK,
        Json(json!({
            "patient_id": p.id,
            "name": p.name,
            "department": p.department,
            "token_number": p.token_number,
            "status": p.status.unwrap_or_else(|| "Waiting".to_string()),
            "priority": p.priority.unwrap_or_else(|| "Regular".to_string()),
            "position": position,
            "estimated_wait_minutes": wait_min,
            "estimated_wait_time": format!("{} mins", wait_min),
            "serving_token": serving_token.map(|t| t.0),
            "doctor_name": "Duty Doctor",
            "room_number": "Room 101"
        })),
    )
}

// ----------------------------------------------------
// Admin & Hospital Operations
// ----------------------------------------------------

pub async fn admin_overview(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let total_reg: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM patients WHERE DATE(created_at) = DATE('now')"
    )
    .fetch_one(&state.pool)
    .await
    .unwrap_or((0,));

    let waiting: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM patients WHERE LOWER(status) = 'waiting' AND DATE(created_at) = DATE('now')"
    )
    .fetch_one(&state.pool)
    .await
    .unwrap_or((0,));

    let consulting: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM patients WHERE LOWER(status) IN ('called', 'consulting') AND DATE(created_at) = DATE('now')"
    )
    .fetch_one(&state.pool)
    .await
    .unwrap_or((0,));

    let completed: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM patients WHERE LOWER(status) = 'completed' AND DATE(created_at) = DATE('now')"
    )
    .fetch_one(&state.pool)
    .await
    .unwrap_or((0,));

    let active_depts: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM departments WHERE is_active = 1"
    )
    .fetch_one(&state.pool)
    .await
    .unwrap_or((0,));

    let avail_docs: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM doctors WHERE is_available = 1"
    )
    .fetch_one(&state.pool)
    .await
    .unwrap_or((0,));

    Json(json!({
        "total_registered_today": total_reg.0,
        "waiting_now": waiting.0,
        "consulting_now": consulting.0,
        "completed_today": completed.0,
        "active_departments_count": active_depts.0,
        "available_doctors_count": avail_docs.0
    }))
}

pub async fn admin_department_load(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let depts: Vec<Department> = sqlx::query_as("SELECT * FROM departments WHERE is_active = 1")
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

    let mut items = Vec::new();

    for d in depts {
        let code = d.code.to_lowercase();
        let waiting: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM patients WHERE LOWER(department) = ? AND LOWER(status) = 'waiting' AND DATE(created_at) = DATE('now')"
        )
        .bind(&code)
        .fetch_one(&state.pool)
        .await
        .unwrap_or((0,));

        let consulting: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM patients WHERE LOWER(department) = ? AND LOWER(status) IN ('called', 'consulting') AND DATE(created_at) = DATE('now')"
        )
        .bind(&code)
        .fetch_one(&state.pool)
        .await
        .unwrap_or((0,));

        let completed: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM patients WHERE LOWER(department) = ? AND LOWER(status) = 'completed' AND DATE(created_at) = DATE('now')"
        )
        .bind(&code)
        .fetch_one(&state.pool)
        .await
        .unwrap_or((0,));

        let total = waiting.0 + consulting.0 + completed.0;

        items.push(json!({
            "department": d.name,
            "code": d.code,
            "waiting": waiting.0,
            "consulting": consulting.0,
            "completed": completed.0,
            "total": total,
            "current_token": null
        }));
    }

    Json(items)
}

pub async fn admin_analytics(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM patients WHERE DATE(created_at) = DATE('now')")
        .fetch_one(&state.pool)
        .await
        .unwrap_or((0,));

    let priorities: Vec<(String, i64)> = sqlx::query_as(
        "SELECT priority, COUNT(*) FROM patients WHERE DATE(created_at) = DATE('now') GROUP BY priority"
    )
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let prio_dist: Vec<serde_json::Value> = priorities
        .into_iter()
        .map(|(p, c)| json!({ "priority": p, "count": c }))
        .collect();

    Json(json!({
        "total_patients": total.0,
        "priority_distribution": prio_dist,
        "status_distribution": [],
        "average_wait_time_minutes": 15.0
    }))
}

pub async fn demo_overview() -> impl IntoResponse {
    Json(json!({
        "imported": false,
        "dataset_summary": null
    }))
}

pub async fn hospital_overview(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let depts: Vec<Department> = sqlx::query_as("SELECT * FROM departments")
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

    let docs: Vec<Doctor> = sqlx::query_as("SELECT * FROM doctors")
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

    let scheds: Vec<OpdSchedule> = sqlx::query_as("SELECT * FROM opd_schedules")
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

    Json(json!({
        "departments": depts,
        "doctors": docs,
        "schedules": scheds
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_db;

    async fn setup_test_state() -> Arc<AppState> {
        let pool = init_db("sqlite::memory:").await.expect("init test db");
        Arc::new(AppState {
            pool,
            jwt_secret: "test-secret-key-32-chars-long!!".to_string(),
        })
    }

    #[tokio::test]
    async fn test_root_and_health() {
        let state = setup_test_state().await;
        let root_res = root().await.into_response();
        assert_eq!(root_res.status(), StatusCode::OK);

        let health_res = health(State(state)).await.into_response();
        assert_eq!(health_res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_otp_flow() {
        let state = setup_test_state().await;

        // Invalid phone
        let invalid = request_otp(Json(OtpRequest { phone: "123".into() })).await.into_response();
        assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);

        // Valid phone
        let valid = request_otp(Json(OtpRequest { phone: "9876543210".into() })).await.into_response();
        assert_eq!(valid.status(), StatusCode::OK);

        // Verify OTP
        let verify = verify_otp(
            State(state),
            Json(OtpVerifyRequest {
                phone: "9876543210".into(),
                code: "123456".into(),
            }),
        )
        .await
        .into_response();
        assert_eq!(verify.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_patient_registration_and_queue() {
        let state = setup_test_state().await;

        let reg = register_patient(
            State(state.clone()),
            Json(PatientRegisterRequest {
                name: "Rohan Sharma".into(),
                age: 32,
                phone: "9988776655".into(),
                department: "cardiology".into(),
                symptoms: Some("Chest discomfort".into()),
                priority: Some("emergency".into()),
            }),
        )
        .await
        .into_response();

        assert_eq!(reg.status(), StatusCode::CREATED);

        let q_status = queue_status(State(state), Path(1)).await.into_response();
        assert_eq!(q_status.status(), StatusCode::OK);
    }
}
