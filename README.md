# QueueLess 🏥
### Intelligent Hospital Queue & Patient Flow Management System

QueueLess is a modern, full-stack web application designed to streamline patient registration, queue flow, and consultation management across hospital Outpatient Departments (OPDs). It eliminates physical crowding and chaotic waiting rooms through digital token generation, real-time wait-time estimation, priority-aware triage, and role-based portals for patients, doctors, and hospital administrators.

---

## 🚀 Key Features

- **📱 Patient Self-Service Portal**
  - Server-issued OTP verification with expiry, resend cooldown, and attempt limits.
  - Department selection with real-time OPD status and doctor availability.
  - Priority category selection (Emergency, Elderly, Pregnant, Follow-up, Regular).
  - Instant token generation with live queue position and estimated wait time tracking.
  - Printable token slip and self-service "leave queue" cancellation.
  - Token and queue lookup by registered phone number.
  - One live token per phone number, so patients cannot double-book.

- **🩺 Doctor & Staff Portal**
  - Department-specific queue dashboard scoped to the current hospital day.
  - Priority-based patient queue with "Call Next", "Start Consultation", "Complete", "Skip", and "Cancel" actions.
  - Requeue action restores a skipped/cancelled patient to the waiting queue.
  - Room-occupancy guard: only one patient can be called into a department at a time.
  - Real-time doctor availability toggle.

- **📊 Admin Operations Dashboard**
  - Hospital-wide operational metrics: total registrations, active consultations, waiting patients, and completed visits.
  - Department workload distribution and bottleneck indicators.
  - Visual analytics for patient flow and department performance.

- **⚡ Priority-Aware Queue Algorithm**
  - Intelligent queue ordering based on clinical priority (Emergency > Pregnant/Elderly > Follow-up > Regular).
  - Dynamic estimated wait time calculations based on active consultations and queue length.
  - Tokens restart at #1 for each department every hospital day.

- **🔒 Consistency & Safety Rules**
  - Visit state machine (waiting → called → consulting → completed) rejects invalid transitions.
  - Duplicate active registrations return the patient's existing token instead of issuing a new one.
  - Day-scoped analytics use real registration timestamps in hospital (IST) time.

---

## 🔐 Portals & Access

QueueLess ships four separate sections. `/sections` is the hub; each section has its own sign-in and only exposes what its role allows.

| Section | Sign in at | Credentials | Can do |
| --- | --- | --- | --- |
| **Patient** | `/login/patient` | 10-digit mobile + OTP | Register a token, track position, leave the queue, read only their own visits |
| **Staff** | `/login/staff` | Employee code + PIN | Call, consult, complete, skip or requeue patients; toggle doctor availability |
| **Hospital** | `/login/hospital` | Employee code + PIN | Manage departments, doctors, OPD hours and availability |
| **Admin** | `/login/admin` | Employee code + PIN | Hospital-wide analytics, bottleneck oversight, plus hospital and staff consoles |

Employee logins are created on first backend start and can be overridden with environment variables:

| Section | Variables | Development default |
| --- | --- | --- |
| Admin | `ADMIN_CODE` / `ADMIN_PIN` | `ADM-001` / `123456` |
| Hospital | `HOSPITAL_CODE` / `HOSPITAL_PIN` | `HOSP-001` / `123456` |
| Staff | `STAFF_CODE` / `STAFF_PIN` | `DR-101` / `123456` |

Each section verifies the role twice: the login response must match the section the employee
opened (a Hospital code tried on `/login/admin` is rejected and linked to its own section), and
the API enforces the same matrix through `require_role`, `require_patient_token` and
`claims_may_access` — so opening a console URL directly still cannot bypass it.

Sessions are signed JWTs. Set `AUTH_SECRET` in production; without it the backend generates an
ephemeral per-process secret, so employees are signed out whenever the API restarts.

---

## 🛠️ Tech Stack

### Frontend
- **Framework:** Next.js (App Router, TypeScript)
- **Styling:** Tailwind CSS, Lucide Icons
- **HTTP Client:** Fetch API with centralized API utilities

### Backend
- **Framework:** FastAPI (Python 3.10+)
- **ORM / Database:** SQLAlchemy with PostgreSQL (Production) / SQLite (Local Fallback)
- **Validation:** Pydantic models
- **Deployment:** Render Blueprint ready (`render.yaml`)

---

## 📂 Project Structure

```text
Hospital-Management/
├── backend/
│   ├── models/            # SQLAlchemy database models
│   ├── schemas/           # Pydantic request/response schemas
│   ├── database.py        # Database connection & session management
│   ├── main.py            # FastAPI routes, endpoints & seeding
│   ├── requirements.txt   # Python dependencies
│   └── .env.example       # Backend environment variables template
├── frontend/
│   ├── app/
│   │   ├── admin/         # Admin analytics dashboard
│   │   ├── doctor/        # Doctor consultation & queue management
│   │   ├── register/      # Patient OPD registration
│   │   ├── queue/         # Live queue tracking
│   │   ├── verify/        # Mobile OTP verification
│   │   ├── check-token/   # Token lookup by phone number
│   │   └── page.tsx       # Landing page with OPD statuses
│   ├── lib/               # Shared utilities & API client
│   ├── package.json       # Node dependencies
│   └── .env.local.example # Frontend environment variables template
├── render.yaml            # Render Blueprint deployment definition
├── DEPLOY_RENDER.md       # Render deployment instructions
├── PROJECT_SYNOPSIS.md    # Detailed project academic synopsis
└── README.md
```

---

## ⚙️ Getting Started

### Prerequisites
- **Python 3.10+**
- **Node.js 18+ & npm**
- **Git**

---

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# (Optional) Configure environment variables
cp .env.example .env

# Run FastAPI server
uvicorn main:app --reload --port 8000
```
Backend API will be accessible at: `http://127.0.0.1:8000`  
Swagger API Documentation: `http://127.0.0.1:8000/docs`

---

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# (Optional) Configure environment variables
cp .env.local.example .env.local

# Run development server
npm run dev
```
Frontend application will be accessible at: `http://localhost:3000`

---

### 3. Running the Backend Tests

The API ships with an end-to-end pytest suite that runs against a throwaway SQLite database.

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest tests -q
```

Coverage includes OTP issuance/verification, duplicate registrations, the full visit flow,
priority dispatch, room-occupancy conflicts, requeue, daily token reset, and analytics shape.

---

## 🔌 API Reference (selected)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Readiness probe (API + database) |
| `POST` | `/auth/request-otp` | Issue a 6-digit OTP for a mobile number |
| `POST` | `/auth/verify-otp` | Verify an OTP (5 min TTL, 5 attempts) and issue a patient session token |
| `POST` | `/auth/staff-login` | Employee code + PIN sign-in for the admin, hospital and staff sections |
| `GET` | `/hospital/overview` | Departments, doctors and OPD hours for the hospital section |
| `GET` | `/opds` | Public OPD load, wait times, and serving token |
| `POST` | `/patients` | Register a visit and issue a daily token |
| `GET` | `/patients?department=&status=&today=` | Filter queue records |
| `GET` | `/patients/by-phone/{phone}` | Latest/active visit for a mobile number |
| `PUT` | `/patients/call-next?department=` | Priority-aware dispatch |
| `PUT` | `/patients/{id}/consult` \| `/complete` \| `/skip` \| `/cancel` | Visit state transitions |
| `PUT` | `/patients/{id}/requeue` | Return a skipped/cancelled visit to the queue |
| `GET` | `/patients/{id}/queue-status` | Live position and estimated wait |
| `GET` | `/admin/overview` \| `/admin/department-load` \| `/admin/analytics` | Operations dashboards (admin only) |

Protected routes return `401` without a session, `403` when the role is wrong, and patient
tokens are scoped to their own mobile number (`403` on another patient's record).

Interactive docs are available at `http://127.0.0.1:8000/docs`.

---

## ☁️ Deployment

QueueLess includes a ready-to-deploy **Render Blueprint** (`render.yaml`) for deploying the FastAPI backend, Next.js frontend, and a managed PostgreSQL database.

See [DEPLOY_RENDER.md](DEPLOY_RENDER.md) for full step-by-step deployment instructions.

---

## 📄 Academic Synopsis

For the complete academic synopsis including problem statement, system architecture, database design, and methodology, see [PROJECT_SYNOPSIS.md](PROJECT_SYNOPSIS.md).

---

## 📜 License

This project is licensed under the MIT License.
