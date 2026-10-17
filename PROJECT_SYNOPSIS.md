# PROJECT SYNOPSIS

## QueueLess: Intelligent Hospital Queue and Patient Flow Management System

### Submitted by

| Particular | Details |
|---|---|
| Student name(s) | `[Enter student name(s)]` |
| Roll number(s) | `[Enter roll number(s)]` |
| Course / branch | `[Enter course and branch]` |
| Academic year | `[Enter academic year]` |
| Project guide | `[Enter guide name and designation]` |
| Department | `[Enter department]` |
| Institution | `[Enter college / university name]` |

> Replace the bracketed fields with your details before submission.

## 1. Abstract

Hospitals and outpatient departments (OPDs) often manage patient queues using physical registers, verbal announcements, or disconnected systems. These methods can make it difficult for patients to understand their turn, create crowding in waiting areas, and leave staff without a current view of department workload. QueueLess is a web-based hospital queue and patient-flow management prototype designed to address these problems.

The system lets a patient complete a mobile-number verification flow, register for an OPD department, receive a department token, and view queue position and estimated waiting time. Its queue logic supports priority categories such as emergency, elderly, pregnant, follow-up, and regular. A doctor-facing portal supports queue operations and doctor availability updates. An administration dashboard presents department workload, patient status counts, and operational indicators. The public landing page presents OPD availability and queue summaries.

The application uses a Next.js and React frontend, a FastAPI backend, Pydantic request validation, SQLAlchemy data access, and a relational database. SQLite is used as the local development fallback; a configured PostgreSQL database can be used when its connection and driver are available. The mobile verification currently uses a fixed prototype OTP and is not a live SMS service. QueueLess is an academic prototype and requires security, privacy, workflow, and deployment enhancements before use with real patient data.

**Keywords:** hospital queue, OPD, patient flow, token management, priority queue, FastAPI, Next.js.

## 2. Introduction

Patient waiting time and uncertainty about service order are common operational challenges in outpatient care. A patient may need to visit a hospital only to discover that the queue is long, a doctor is unavailable, or the estimated time to consultation is unclear. Staff may also have limited visibility into current waiting lists across departments.

QueueLess provides a shared digital view of patient registration and queue progress. It is intended to demonstrate how a lightweight web application can connect patient self-service with staff queue operations and an administrative overview. It focuses on OPD flow rather than replacing a hospital information system, electronic medical record, appointment platform, or clinical decision-support system.

## 3. Problem Statement

In a manual or fragmented OPD process:

- Patients may have to wait at the hospital to learn their queue position.
- Queue order and patient priority may be difficult to manage consistently.
- Staff may need to maintain or communicate queue updates manually.
- Patients may not know whether a department is open, busy, or temporarily unavailable.
- Administrators may lack a consolidated view of queues and department workload.

The project aims to provide a simple system for issuing department tokens, estimating queue progress, and sharing operational status with patients, doctors, and administrators.

## 4. Aim and Objectives

### Aim

To design and implement a web-based prototype that improves visibility and coordination of patient queues in hospital outpatient departments.

### Objectives

1. Provide a patient-facing flow for mobile verification, OPD registration, and token generation.
2. Maintain patient queue records with department, token, priority, and visit status.
3. Calculate queue position and an approximate waiting time from the active queue.
4. Apply priority-aware ordering when staff call the next waiting patient.
5. Provide staff actions to call patients, start consultations, complete visits, skip patients, and update doctor availability.
6. Display live department status and queue summaries to patients and staff.
7. Present administrators with department workload and operational analytics.
8. Validate incoming registration data and persist application records using a relational database.

## 5. Existing System and Its Limitations

The existing process in many settings may depend on paper registers, tokens issued at a counter, verbal calls, or separate spreadsheets. Such workflows can be familiar and inexpensive, but they may not offer a single, current view of patient status. Patients can be uncertain about how long they will wait, while staff may have to relay changes repeatedly.

The project does not assume that every hospital uses the same process. QueueLess is proposed as a prototype that demonstrates a digital alternative; any real deployment would need to be adapted to the hospital's approved clinical and administrative procedures.

## 6. Proposed System

QueueLess provides role-oriented views over a shared queue service:

- **Patient view:** review OPD status, complete the prototype mobile verification, register, receive a token, and check queue status.
- **Doctor/staff view:** select a department, review waiting and active patients, update patient visit status, and toggle doctor availability.
- **Administration view:** review hospital-level counts, department workload, bottleneck indicators, and chart-based analytics.
- **Backend API:** validate requests, apply token and priority logic, compute queue status, and expose data to the frontend.
- **Database:** persist departments, doctors, OPD schedules, and patient queue records.

Queue position and wait estimates are operational estimates only. They are not a promise of consultation time and do not replace clinical triage.

## 7. Scope

### Included in the prototype

- Six seeded departments: Cardiology, General Medicine, Orthopedics, Dental, Neurology, and Gastroenterology.
- Patient registration with name, age, 10-digit phone number, department, optional symptoms, and priority.
- Per-department sequential token assignment.
- Priority-aware ordering of waiting patients.
- Queue lookup by registered phone number and queue status by patient record.
- Staff actions for calling, consultation, completion, skipping, and cancellation.
- Doctor availability updates.
- Public OPD status, estimated queue waiting time, and currently serving token.
- Administration overview, department load, and analytics endpoints and dashboard.
- Local relational persistence through SQLAlchemy and SQLite fallback.

### Outside the current scope

- Production SMS/OTP delivery, patient identity verification, or identity-provider integration.
- Clinical diagnosis, treatment recommendations, prescriptions, billing, or electronic medical records.
- Appointment booking and integration with external hospital systems.
- Production authentication, role-based access control, audit trails, and consent management.
- High availability, multi-hospital tenancy, and production-grade concurrency controls.

## 8. System Modules

### 8.1 Patient registration and token module

Validates registration fields and creates a patient queue record for the selected department. A token is assigned using the latest token number recorded for that department. The current frontend verification flow uses the prototype OTP `123456`; this is only for demonstration.

### 8.2 Queue management module

Stores visit statuses such as waiting, called, consulting, completed, skipped, and cancelled. Waiting patients are ordered by configured priority and then token number. Staff can call the next patient or update an individual patient's status.

### 8.3 Queue status module

Provides the patient's token, department, queue position, number of patients ahead, currently serving token, and an estimated waiting time based on an assumed average consultation time. The current estimate uses eight minutes per patient ahead and should be calibrated with real operational data before deployment.

### 8.4 OPD and doctor module

Lists active departments, associated doctors, room information, schedules, availability, waiting counts, and current queue status. Staff can toggle doctor availability.

### 8.5 Administration and analytics module

Provides high-level patient counts, department load, bottleneck indicators, priority distribution, hourly-flow visualization, and doctor utilization visualization. Some displayed analytics—especially hourly patient flow and utilization—are prototype estimates and are not derived from timestamped consultation events.

### 8.6 Database and API module

The FastAPI backend exposes HTTP endpoints for registration, patient lookup, queue actions, OPD information, doctor availability, and administration analytics. SQLAlchemy maps application objects to relational tables, and Pydantic schemas validate selected request fields.

## 9. High-Level Architecture

```text
Patient / Staff / Administrator
              |
              v
 Next.js and React web application
              |
       HTTP / JSON requests
              |
              v
        FastAPI REST API
        |             |
 Pydantic validation  Queue / priority logic
        |             |
        +------ SQLAlchemy ORM
                      |
                      v
        SQLite (local fallback) / configured SQL database
```

The frontend and backend run as separate development services. The frontend currently calls the backend at `http://127.0.0.1:8000`; deployment on another host requires configuring the API base URL and CORS origins for that environment.

## 10. Data Model

The principal database entities are:

| Entity | Key fields | Purpose |
|---|---|---|
| Patient | ID, name, age, phone, department, token number, status, symptoms, priority | Stores patient queue and visit information |
| Department | ID, code, name, description, active status | Represents an OPD department |
| Doctor | ID, name, specialization, room, availability, department ID | Represents a doctor assigned to a department |
| OPD Schedule | ID, department ID, doctor ID, timing, active status | Stores department/doctor OPD timing |

Patients are associated with a department using its department code. Doctors and OPD schedules reference departments and doctors through foreign keys.

## 11. Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Charts and icons | Recharts, Lucide React |
| Backend API | Python, FastAPI, Uvicorn |
| Validation | Pydantic |
| ORM and database | SQLAlchemy, SQLite local fallback; configured PostgreSQL where available |
| Development tools | Node.js/npm and Python virtual environment |

## 12. Functional Requirements

1. The system shall accept a patient registration for a supported department.
2. The system shall validate required registration fields and the phone-number format.
3. The system shall generate a token number for each registered patient within their department.
4. The system shall store the patient's priority and visit status.
5. The system shall return queue position and an estimated wait for a waiting patient.
6. The system shall order waiting patients by priority category and token number.
7. Staff shall be able to call the next patient and update patient visit status.
8. Staff shall be able to update a doctor's availability.
9. The public view shall show active OPD information and queue summaries.
10. The administration view shall present hospital and department workload indicators.

## 13. Non-Functional Requirements

- **Usability:** Provide clear patient, staff, and administration screens.
- **Performance:** Support responsive reads and updates for a small demonstration deployment.
- **Maintainability:** Keep the user interface, API, database models, and validation schemas separated.
- **Reliability:** Return explicit API errors for invalid or missing records.
- **Portability:** Support local development without a separately installed database server using SQLite.
- **Privacy and security:** A production version must use authentication, authorization, secure transport, data minimization, audit logging, and applicable health-data protections. These controls are not fully implemented in the prototype.

## 14. Methodology

The project follows an iterative development approach:

1. Identify the OPD queue problem and define the user roles.
2. Define core data entities, queue states, and patient priority categories.
3. Implement database models and API endpoints.
4. Build patient, staff, and administrator interfaces.
5. Integrate frontend requests with backend APIs.
6. Validate registration, queue ordering, staff actions, and dashboard data.
7. Run the application locally and refine the workflow based on test results.

## 15. Feasibility

- **Technical feasibility:** The implementation uses widely adopted web technologies and can be run locally with Node.js and Python.
- **Operational feasibility:** The patient, staff, and administrator views map to common OPD queue responsibilities; a hospital would need to validate the workflow before adoption.
- **Economic feasibility:** The prototype relies on open-source frameworks and local development storage. Production hosting, messaging, monitoring, backups, and security controls would introduce additional costs.
- **Schedule feasibility:** The work can be completed in an academic project cycle by delivering the API, frontend workflows, integration, and testing in stages.

## 16. Testing Plan

| Test area | Example verification |
|---|---|
| Registration validation | Reject a phone number that is not 10 digits or an unsupported department |
| Token assignment | Register patients in the same and different departments and verify department-specific token progression |
| Priority ordering | Verify that higher-priority waiting patients are called before regular patients, with token order used within a priority |
| Queue status | Verify queue position, patients ahead, current token, and estimated wait for waiting and active patients |
| Patient status transitions | Verify call, consultation, completion, skip, and cancellation updates |
| Doctor availability | Toggle availability and verify the public OPD status reflects the change |
| Analytics | Compare overview and department counts with records in the database |
| Integration | Run the frontend and backend together and verify registration and queue lookup flows |
| Build and startup | Verify backend import/startup and frontend production build |

## 17. Current Limitations and Future Enhancements

The current mobile OTP is a fixed demonstration code, not an SMS verification service. The prototype also lacks robust authentication and role-based authorization; patient records and dashboard endpoints must not be treated as production-secure. Token generation is based on the latest stored token and needs transactional/concurrency protection for simultaneous registration. Queue estimates rely on a fixed average consultation duration. Analytics that require event timestamps use simulated or approximate values. The local SQLite database is suitable for development, not a substitute for a properly managed production database and backup strategy.

Future work may include:

- Integrate a verified SMS provider and expire, rate-limit, and securely validate OTPs.
- Add authenticated patient, staff, and administrator accounts with role-based permissions.
- Protect patient data, minimize stored personal information, and introduce consent and audit controls.
- Use transactional token allocation and robust handling of concurrent queue updates.
- Record event timestamps to calculate measured waiting times and accurate hourly statistics.
- Add queue notifications, appointment scheduling, accessibility and multilingual support.
- Integrate with approved hospital systems and deploy with monitoring, backups, and disaster recovery.
- Review clinical escalation and emergency-priority procedures with qualified hospital personnel.

## 18. Expected Outcome

The expected outcome is a working academic prototype that demonstrates digital patient registration, department token management, priority-aware queues, staff queue operations, live OPD status, and administration-facing workload summaries. The system is intended to improve visibility and illustrate a practical approach to reducing uncertainty around outpatient waiting—not to guarantee shorter clinical wait times or replace hospital staff decisions.

## 19. Conclusion

QueueLess addresses a practical hospital operations problem by connecting patient queue information with staff actions and an administration overview. Its modular web architecture demonstrates how registration, queue prioritization, patient status updates, and workload visibility can be implemented using a modern frontend and API-based backend. The project is suitable as an academic prototype. Before real-world use, it requires production-grade security, privacy, concurrency, messaging, analytics, and operational validation.

## 20. References

1. FastAPI documentation, https://fastapi.tiangolo.com/
2. Next.js documentation, https://nextjs.org/docs
3. React documentation, https://react.dev/
4. SQLAlchemy documentation, https://docs.sqlalchemy.org/
5. Pydantic documentation, https://docs.pydantic.dev/
6. SQLite documentation, https://www.sqlite.org/docs.html
