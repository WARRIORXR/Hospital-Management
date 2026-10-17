# QueueLess 🏥
### Intelligent Hospital Queue & Patient Flow Management System

QueueLess is a modern, full-stack web application designed to streamline patient registration, queue flow, and consultation management across hospital Outpatient Departments (OPDs). It eliminates physical crowding and chaotic waiting rooms through digital token generation, real-time wait-time estimation, priority-aware triage, and role-based portals for patients, doctors, and hospital administrators.

---

## 🚀 Key Features

- **📱 Patient Self-Service Portal**
  - Mobile verification with OTP.
  - Department selection with real-time OPD status and doctor availability.
  - Priority category selection (Emergency, Elderly, Pregnant, Follow-up, Regular).
  - Instant token generation with live queue position and estimated wait time tracking.
  - Token and queue lookup by registered phone number.

- **🩺 Doctor & Staff Portal**
  - Department-specific queue dashboard.
  - Priority-based patient queue with "Call Next", "Start Consultation", "Complete", "Skip", and "Cancel" actions.
  - Real-time doctor availability toggle.

- **📊 Admin Operations Dashboard**
  - Hospital-wide operational metrics: total registrations, active consultations, waiting patients, and completed visits.
  - Department workload distribution and bottleneck indicators.
  - Visual analytics for patient flow and department performance.

- **⚡ Priority-Aware Queue Algorithm**
  - Intelligent queue ordering based on clinical priority (Emergency > Pregnant/Elderly > Follow-up > Regular).
  - Dynamic estimated wait time calculations based on active consultations and queue length.

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

## ☁️ Deployment

QueueLess includes a ready-to-deploy **Render Blueprint** (`render.yaml`) for deploying the FastAPI backend, Next.js frontend, and a managed PostgreSQL database.

See [DEPLOY_RENDER.md](DEPLOY_RENDER.md) for full step-by-step deployment instructions.

---

## 📄 Academic Synopsis

For the complete academic synopsis including problem statement, system architecture, database design, and methodology, see [PROJECT_SYNOPSIS.md](PROJECT_SYNOPSIS.md).

---

## 📜 License

This project is licensed under the MIT License.
