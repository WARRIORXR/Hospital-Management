"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiUrl } from "@/lib/api";

type Patient = {
  id: number;
  name: string;
  age: number;
  phone: string;
  department: string;
  token_number: number;
  status: "waiting" | "called" | "consulting" | "completed" | "skipped" | "cancelled" | string;
  symptoms: string | null;
  priority: "emergency" | "elderly" | "pregnant" | "follow_up" | "regular" | string;
};

const DEPARTMENTS = [
  { id: "cardiology", name: "Cardiology", doctor: "Dr. Sharma", room: "Room 204" },
  { id: "general", name: "General Medicine", doctor: "Dr. Singh", room: "Room 101" },
  { id: "orthopedics", name: "Orthopedics", doctor: "Dr. Kapoor", room: "Room 302" },
  { id: "dental", name: "Dental", doctor: "Dr. Mehta", room: "Room 108" },
  { id: "neurology", name: "Neurology", doctor: "Dr. Verma", room: "Room 401" },
  { id: "gastro", name: "Gastroenterology", doctor: "Dr. Malhotra", room: "Room 205" },
];

type DoctorData = {
  id: number;
  name: string;
  specialization: string | null;
  room_number: string;
  is_available: boolean;
  department_id: number;
  department_name: string;
  department_code: string;
};

type DepartmentData = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

export default function DoctorPortalPage() {
  const [selectedDept, setSelectedDept] = useState("cardiology");
  const [departments, setDepartments] = useState<DepartmentData[]>([]);
  const [doctors, setDoctors] = useState<DoctorData[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [activeTab, setActiveTab] = useState<"waiting" | "history">("waiting");
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Load departments and doctors on mount
  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const [deptRes, docRes] = await Promise.all([
          fetch(apiUrl("/departments")),
          fetch(apiUrl("/doctors")),
        ]);
        if (deptRes.ok) {
          const deptData: DepartmentData[] = await deptRes.json();
          if (deptData.length > 0) setDepartments(deptData);
        }
        if (docRes.ok) {
          const docData: DoctorData[] = await docRes.json();
          setDoctors(docData);
        }
      } catch (err) {
        console.error("Meta fetch error:", err);
      }
    };
    fetchMeta();
  }, []);

  const deptList = departments.length > 0
    ? departments.map(d => ({ id: d.code, name: d.name }))
    : DEPARTMENTS.map(d => ({ id: d.id, name: d.name }));

  const assignedDoctor = doctors.find(
    (d) => d.department_code === selectedDept
  );

  const currentOpd = {
    id: selectedDept,
    name: departments.find(d => d.code === selectedDept)?.name || DEPARTMENTS.find(d => d.id === selectedDept)?.name || "Department",
    doctor: assignedDoctor ? assignedDoctor.name : (DEPARTMENTS.find(d => d.id === selectedDept)?.doctor || "Attending Specialist"),
    room: assignedDoctor ? assignedDoctor.room_number : (DEPARTMENTS.find(d => d.id === selectedDept)?.room || "OPD Room"),
  };

  const isDoctorAvailable = assignedDoctor ? assignedDoctor.is_available : true;

  const handleToggleAvailability = async () => {
    if (!assignedDoctor) return;
    try {
      const res = await fetch(
        apiUrl(`/doctors/${assignedDoctor.id}/toggle-availability`),
        { method: "PUT" }
      );
      if (res.ok) {
        const updated = await res.json();
        setDoctors((prev) =>
          prev.map((d) => (d.id === updated.id ? { ...d, is_available: updated.is_available } : d))
        );
        setMessage({
          text: `${updated.name} status set to ${updated.is_available ? "Available" : "On Break"}. Public OPD updated!`,
          type: "info",
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --------------------------------------------------
  // FETCH PATIENTS FOR DEPARTMENT
  // --------------------------------------------------
  const fetchDepartmentPatients = useCallback(async () => {
    try {
      const response = await fetch(
        apiUrl(`/patients?department=${selectedDept}`)
      );
      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }
      const data: Patient[] = await response.json();
      setPatients(data);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Failed to fetch department patients:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedDept]);

  useEffect(() => {
    setLoading(true);
    fetchDepartmentPatients();

    // Auto-refresh queue every 4 seconds
    const timer = setInterval(() => {
      fetchDepartmentPatients();
    }, 4000);

    return () => clearInterval(timer);
  }, [fetchDepartmentPatients]);

  // Derive Patient Subsets
  const activePatient = patients.find(
    (p) => p.status === "called" || p.status === "consulting"
  );

  const waitingPatients = patients
    .filter((p) => p.status === "waiting")
    .sort((a, b) => {
      const order: Record<string, number> = {
        emergency: 1,
        elderly: 2,
        pregnant: 2,
        follow_up: 3,
        regular: 4,
      };
      const pA = order[a.priority] || 4;
      const pB = order[b.priority] || 4;
      if (pA !== pB) return pA - pB;
      return a.token_number - b.token_number;
    });

  const completedPatients = patients.filter(
    (p) => p.status === "completed" || p.status === "skipped"
  );

  const emergencyCount = waitingPatients.filter(
    (p) => p.priority === "emergency" || p.priority === "elderly" || p.priority === "pregnant"
  ).length;

  // --------------------------------------------------
  // QUEUE ACTIONS
  // --------------------------------------------------
  const handleCallNext = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch(
        apiUrl(`/patients/call-next?department=${selectedDept}`),
        { method: "PUT" }
      );
      const data = await res.json();
      if (data.message === "No waiting patients") {
        setMessage({ text: "No patients currently waiting in this department.", type: "info" });
      } else {
        setMessage({
          text: `Token #${data.token_number} (${data.name}) has been called to ${currentOpd.room}.`,
          type: "success",
        });
        await fetchDepartmentPatients();
      }
    } catch (err) {
      console.error(err);
      setMessage({ text: "Failed to call next patient. Backend unreachable.", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async (
    patientId: number,
    action: "consult" | "complete" | "skip" | "call"
  ) => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch(
        apiUrl(`/patients/${patientId}/${action}`),
        { method: "PUT" }
      );
      if (!res.ok) throw new Error("Status update failed");
      const updated = await res.json();

      const actionLabels: Record<string, string> = {
        consult: "Consultation started with",
        complete: "Consultation finished for",
        skip: "Marked as skipped for",
        call: "Called specific patient",
      };

      setMessage({
        text: `${actionLabels[action]} Token #${updated.token_number} (${updated.name}).`,
        type: "success",
      });
      await fetchDepartmentPatients();
    } catch (err) {
      console.error(err);
      setMessage({ text: `Failed to update status to ${action}.`, type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "emergency":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-black text-rose-700 uppercase tracking-wider">
            🚨 Emergency
          </span>
        );
      case "elderly":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">
            👴 Elderly
          </span>
        );
      case "pregnant":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-0.5 text-xs font-bold text-pink-700">
            🤰 Pregnant
          </span>
        );
      case "follow_up":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
            🔄 Follow-up
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            Regular
          </span>
        );
    }
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      {/* STAFF CONSOLE HEADER */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 font-black text-white shadow-sm">
                Q
              </div>
              <div>
                <p className="font-extrabold tracking-tight text-slate-900 leading-tight">
                  QueueLess
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
                  Staff & Doctor Portal
                </p>
              </div>
            </Link>

            <span className="hidden h-6 w-px bg-slate-200 sm:block" />

            {/* Current Department Badge */}
            <div className="hidden sm:flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              <span>🩺 {currentOpd.doctor}</span>
              <span className="text-slate-400">•</span>
              <span>{currentOpd.room}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Live Polling Status */}
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="hidden md:inline">
                Live (Refreshed {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })})
              </span>
            </div>

            {/* Doctor Availability Toggle */}
            <button
              onClick={handleToggleAvailability}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition ${
                isDoctorAvailable
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-800 border border-amber-200"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${isDoctorAvailable ? "bg-emerald-500" : "bg-amber-500"}`} />
              {isDoctorAvailable ? "Doctor Available" : "Doctor On Break"}
            </button>

            <Link
              href="/"
              className="text-xs font-semibold text-slate-600 hover:text-blue-600 transition"
            >
              Public View ↗
            </Link>
          </div>
        </div>
      </header>

      {/* MAIN CONSOLE BODY */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* DEPARTMENT SELECTOR TABS */}
        <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-2">
            Select Department:
          </span>
          {deptList.map((dept) => {
            const isSelected = dept.id === selectedDept;
            return (
              <button
                key={dept.id}
                onClick={() => {
                  setSelectedDept(dept.id);
                  setMessage(null);
                }}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                }`}
              >
                {dept.name}
              </button>
            );
          })}
        </div>

        {/* FEEDBACK BANNER */}
        {message && (
          <div
            className={`mb-6 flex items-center justify-between rounded-2xl border p-4 text-xs font-semibold ${
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : message.type === "error"
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-blue-200 bg-blue-50 text-blue-800"
            }`}
          >
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="text-slate-400 hover:text-slate-600 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* LIVE METRICS ROW */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Waiting Patients
            </p>
            <p className="mt-2 text-3xl font-black text-slate-900">
              {waitingPatients.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">In line for {currentOpd.name}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Priority Cases
            </p>
            <p className="mt-2 text-3xl font-black text-rose-600">
              {emergencyCount}
            </p>
            <p className="mt-1 text-xs text-rose-500 font-medium">Emergency / Special care</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Currently Serving
            </p>
            <p className="mt-2 text-3xl font-black text-blue-600">
              {activePatient ? `Token #${activePatient.token_number}` : "None"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {activePatient ? activePatient.status.toUpperCase() : "Waiting to call"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Treated Today
            </p>
            <p className="mt-2 text-3xl font-black text-emerald-600">
              {completedPatients.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">Completed visits</p>
          </div>
        </div>

        {/* GRID: LEFT ACTIVE SERVING CARD, RIGHT QUEUE LIST */}
        <div className="grid gap-8 lg:grid-cols-12">
          {/* LEFT: ACTIVE PATIENT CONSOLE (5 COLS) */}
          <div className="lg:col-span-5 space-y-6">
            {/* CURRENT ACTIVE PATIENT BOX */}
            <div className="rounded-3xl border-2 border-blue-600/20 bg-white p-6 shadow-xl shadow-blue-500/5 relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
                    Active Consultation
                  </p>
                  <h2 className="mt-0.5 text-lg font-black text-slate-950">
                    Currently In Room
                  </h2>
                </div>

                {activePatient && (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${
                      activePatient.status === "consulting"
                        ? "bg-emerald-100 text-emerald-800 animate-pulse"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    ● {activePatient.status}
                  </span>
                )}
              </div>

              {activePatient ? (
                <div className="mt-5 space-y-5">
                  {/* Token & Patient Name Banner */}
                  <div className="rounded-2xl bg-blue-50/80 p-5 border border-blue-100">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
                      Token Number
                    </p>
                    <p className="text-4xl font-black text-blue-700 mt-1">
                      #{activePatient.token_number}
                    </p>

                    <div className="mt-3 pt-3 border-t border-blue-200/60 flex items-center justify-between">
                      <div>
                        <p className="text-base font-black text-slate-900">
                          {activePatient.name}
                        </p>
                        <p className="text-xs text-slate-500 font-medium">
                          Age: {activePatient.age} • Mobile: +91 {activePatient.phone}
                        </p>
                      </div>
                      <div>{getPriorityBadge(activePatient.priority)}</div>
                    </div>
                  </div>

                  {/* Symptoms / Notes */}
                  <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Reason For Visit / Reported Symptoms
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-700 italic">
                      {activePatient.symptoms || "No specific symptoms reported during registration."}
                    </p>
                  </div>

                  {/* ACTION BUTTONS FOR ACTIVE PATIENT */}
                  <div className="space-y-2.5 pt-2">
                    {activePatient.status === "called" && (
                      <button
                        onClick={() => handleUpdateStatus(activePatient.id, "consult")}
                        disabled={actionLoading}
                        className="w-full rounded-xl bg-emerald-600 py-3.5 text-xs font-bold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        ▶ Patient Entered — Start Consultation
                      </button>
                    )}

                    {activePatient.status === "consulting" && (
                      <button
                        onClick={() => handleUpdateStatus(activePatient.id, "complete")}
                        disabled={actionLoading}
                        className="w-full rounded-xl bg-blue-600 py-3.5 text-xs font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-50"
                      >
                        ✓ Complete Consultation & Free Room
                      </button>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateStatus(activePatient.id, "skip")}
                        disabled={actionLoading}
                        className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                      >
                        ⏭ Skip Patient (No Show)
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-400">
                    🚪
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm">Consultation Room Empty</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    No patient is currently called. Click below to call the next eligible patient according to priority.
                  </p>
                </div>
              )}
            </div>

            {/* CALL NEXT PATIENT BANNER */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Priority Dispatch</h3>
                  <p className="text-xs text-slate-500">
                    Auto-selects Emergency → Elderly → Pregnant → Follow-up → Regular
                  </p>
                </div>
                <span className="text-xs font-black rounded-lg bg-blue-50 px-2.5 py-1 text-blue-700">
                  {waitingPatients.length} waiting
                </span>
              </div>

              <button
                onClick={handleCallNext}
                disabled={actionLoading || waitingPatients.length === 0}
                className="mt-4 w-full rounded-2xl bg-blue-600 py-4 text-sm font-black text-white shadow-xl shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? "Calling Patient..." : "📢 Call Next Patient"}
              </button>
            </div>
          </div>

          {/* RIGHT: WAITING QUEUE LIST & HISTORY (7 COLS) */}
          <div className="lg:col-span-7">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {/* TABS HEADER */}
              <div className="flex border-b border-slate-200 bg-slate-50/70 px-6 pt-4">
                <button
                  onClick={() => setActiveTab("waiting")}
                  className={`pb-3.5 text-xs font-bold transition border-b-2 mr-6 ${
                    activeTab === "waiting"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Waiting Queue ({waitingPatients.length})
                </button>
                <button
                  onClick={() => setActiveTab("history")}
                  className={`pb-3.5 text-xs font-bold transition border-b-2 ${
                    activeTab === "history"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Completed Today ({completedPatients.length})
                </button>
              </div>

              {/* TAB CONTENT: WAITING QUEUE */}
              {activeTab === "waiting" && (
                <div className="p-6">
                  {loading ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      Loading queue records...
                    </div>
                  ) : waitingPatients.length === 0 ? (
                    <div className="py-16 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl text-emerald-600">
                        ✓
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm">Queue is Clear</h4>
                      <p className="text-xs text-slate-500 mt-1">
                        There are no patients waiting in {currentOpd.name}.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {waitingPatients.map((patient, index) => (
                        <div
                          key={patient.id}
                          className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition hover:bg-slate-50/50 rounded-xl px-2"
                        >
                          <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 font-bold text-slate-600 text-xs">
                              #{index + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-black text-slate-900 text-sm">
                                  Token #{patient.token_number}
                                </span>
                                <span className="text-slate-400">•</span>
                                <span className="font-bold text-slate-800 text-sm">
                                  {patient.name}
                                </span>
                                <span className="text-xs text-slate-400">
                                  ({patient.age}y)
                                </span>
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                {getPriorityBadge(patient.priority)}
                                {patient.symptoms && (
                                  <span className="text-xs text-slate-500 truncate max-w-xs">
                                    "{patient.symptoms}"
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleUpdateStatus(patient.id, "call")}
                              disabled={actionLoading}
                              className="rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
                            >
                              Call Now
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB CONTENT: HISTORY */}
              {activeTab === "history" && (
                <div className="p-6">
                  {completedPatients.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      No patients treated yet today.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {completedPatients.map((patient) => (
                        <div
                          key={patient.id}
                          className="py-3.5 flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">
                                Token #{patient.token_number}
                              </span>
                              <span className="text-slate-400">•</span>
                              <span className="text-sm font-semibold text-slate-700">
                                {patient.name}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Phone: +91 {patient.phone} • Priority: {patient.priority}
                            </p>
                          </div>

                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                              patient.status === "completed"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {patient.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
