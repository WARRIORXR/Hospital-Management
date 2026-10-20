#![allow(dead_code)]

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, Clone, FromRow)]
pub struct User {
    pub id: i64,
    pub employee_code: String,
    pub pin_hash: String,
    pub role: String,
    pub name: String,
    pub department_id: Option<i64>,
    pub is_active: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, FromRow)]
pub struct Department {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, FromRow)]
pub struct Doctor {
    pub id: i64,
    pub name: String,
    pub specialization: String,
    pub room_number: String,
    pub is_available: bool,
    pub department_id: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, FromRow)]
pub struct OpdSchedule {
    pub id: i64,
    pub department_id: i64,
    pub doctor_id: i64,
    pub timing: String,
    pub is_active: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, FromRow)]
pub struct Patient {
    pub id: i64,
    pub name: String,
    pub age: i64,
    pub phone: String,
    pub department: String,
    pub token_number: i64,
    pub status: Option<String>,
    pub symptoms: Option<String>,
    pub priority: Option<String>,
    pub created_at: Option<NaiveDateTime>,
}

// ----------------------------------------------------
// DTOs / Request & Response
// ----------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct OtpRequest {
    pub phone: String,
}

#[derive(Debug, Serialize)]
pub struct OtpResponse {
    pub message: String,
    pub phone: String,
    pub expires_in_seconds: i64,
    pub debug_otp: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OtpVerifyRequest {
    pub phone: String,
    pub code: String,
}

#[derive(Debug, Deserialize)]
pub struct StaffLoginRequest {
    pub employee_code: String,
    pub pin: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub token_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub employee_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DepartmentOut {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Serialize)]
pub struct DoctorOut {
    pub id: i64,
    pub name: String,
    pub specialization: String,
    pub room_number: String,
    pub is_available: bool,
    pub department_id: i64,
    pub department_name: String,
}

#[derive(Debug, Serialize)]
pub struct OpdCard {
    pub department: String,
    pub code: String,
    pub doctor: String,
    pub room: String,
    pub timing: String,
    pub status: String,
    pub status_code: String,
    pub waiting: i64,
    pub wait_time: String,
    pub wait_minutes: i64,
    pub current_token: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct PatientRegisterRequest {
    pub name: String,
    pub age: i64,
    pub phone: String,
    pub department: String,
    pub symptoms: Option<String>,
    pub priority: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct QueueStatusResponse {
    pub patient_id: i64,
    pub name: String,
    pub department: String,
    pub token_number: i64,
    pub status: String,
    pub priority: String,
    pub position: i64,
    pub estimated_wait_minutes: i64,
    pub estimated_wait_time: String,
    pub serving_token: Option<i64>,
    pub doctor_name: String,
    pub room_number: String,
}

#[derive(Debug, Serialize)]
pub struct AdminOverviewResponse {
    pub total_registered_today: i64,
    pub waiting_now: i64,
    pub consulting_now: i64,
    pub completed_today: i64,
    pub active_departments_count: i64,
    pub available_doctors_count: i64,
}

#[derive(Debug, Serialize)]
pub struct AdminDepartmentItem {
    pub department: String,
    pub code: String,
    pub waiting: i64,
    pub consulting: i64,
    pub completed: i64,
    pub total: i64,
    pub current_token: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct AdminAnalyticsResponse {
    pub total_patients: i64,
    pub priority_distribution: serde_json::Value,
    pub status_distribution: serde_json::Value,
    pub average_wait_time_minutes: f64,
}
