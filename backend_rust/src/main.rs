mod auth;
mod db;
mod handlers;
mod models;

use axum::{
    routing::{get, post, put},
    Router,
};
use std::{env, net::SocketAddr, sync::Arc};
use tower_http::cors::CorsLayer;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use handlers::AppState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "backend_rust=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load database URL from env or use sqlite db
    let db_url = env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:queueless.db?mode=rwc".to_string());
    info!("Connecting to database: {}", db_url);

    let pool = db::init_db(&db_url).await?;
    info!("Database initialized successfully");

    let jwt_secret = env::var("AUTH_SECRET").unwrap_or_else(|_| "queueless-dev-secret-key-32-chars-min".to_string());

    let state = Arc::new(AppState {
        pool,
        jwt_secret,
    });

    let cors = CorsLayer::permissive();

    let app = Router::new()
        // Health & Root
        .route("/", get(handlers::root))
        .route("/health", get(handlers::health))
        // Auth
        .route("/auth/request-otp", post(handlers::request_otp))
        .route("/auth/verify-otp", post(handlers::verify_otp))
        .route("/auth/staff-login", post(handlers::staff_login))
        // Departments & Doctors
        .route("/departments", get(handlers::list_departments))
        .route("/doctors", get(handlers::list_doctors))
        .route("/doctors/:doctor_id/toggle-availability", put(handlers::toggle_doctor_availability))
        // Public OPD Status
        .route("/opds", get(handlers::get_opds))
        // Patients & Queue Management
        .route("/patients", post(handlers::register_patient))
        .route("/patients", get(handlers::list_patients))
        .route("/patients/call-next", put(handlers::call_next))
        .route("/patients/by-phone/:phone", get(handlers::get_patient_by_phone))
        .route("/patients/:id", get(handlers::get_patient_by_id))
        .route("/patients/:id/call", put(handlers::call_patient))
        .route("/patients/:id/consult", put(handlers::consult_patient))
        .route("/patients/:id/complete", put(handlers::complete_patient))
        .route("/patients/:id/skip", put(handlers::skip_patient))
        .route("/patients/:id/cancel", put(handlers::cancel_patient))
        .route("/patients/:id/requeue", put(handlers::requeue_patient))
        .route("/patients/:id/queue-status", get(handlers::queue_status))
        // Admin & Hospital Operations
        .route("/admin/overview", get(handlers::admin_overview))
        .route("/admin/department-load", get(handlers::admin_department_load))
        .route("/admin/analytics", get(handlers::admin_analytics))
        .route("/demo/overview", get(handlers::demo_overview))
        .route("/hospital/overview", get(handlers::hospital_overview))
        .layer(cors)
        .with_state(state);

    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8001); // Default to 8001 so it can run alongside or replace 8000

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("🚀 QueueLess Rust Server running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
