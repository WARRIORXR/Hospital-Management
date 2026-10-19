"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/api";
import { formatClock } from "@/lib/format";
import { clearPortalSession, portalFetch, useHydrated, usePortalSession } from "@/lib/auth";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type OverviewData = {
  total_patients: number;
  waiting_patients: number;
  consulting_patients: number;
  completed_patients: number;
  skipped_patients: number;
  emergency_cases: number;
  total_doctors: number;
  active_doctors: number;
  open_opds: number;
  avg_wait_minutes: number;
  avg_consultation_time: number;
};

type DepartmentLoad = {
  department_id: number;
  department_name: string;
  department_code: string;
  doctor_name: string;
  room_number: string;
  is_available: boolean;
  timing: string;
  waiting: number;
  consulting: number;
  completed: number;
  total_registered: number;
  avg_wait_minutes: number;
  current_token: number | null;
  load_level: "Normal" | "Elevated" | "Critical";
  bottleneck_alert: boolean;
  suggestion: string;
};

type AnalyticsData = {
  department_workload: { name: string; code: string; waiting: number; completed: number; total: number }[];
  priority_distribution: { priority: string; count: number }[];
  hourly_patient_flow: { hour: string; patients: number; capacity: number }[];
  doctor_utilization: {
    id: number;
    doctor: string;
    department: string;
    room: string;
    is_available: boolean;
    patients_served: number;
    pending_queue: number;
    utilization_pct: number;
  }[];
};

type DemoServiceStats = {
  service: string;
  visits: number;
  avg_length_of_stay: number;
  avg_satisfaction: number;
  staff: number;
  attendance_pct: number;
};

type DemoWeek = {
  week: number;
  requested: number;
  admitted: number;
  refused: number;
  satisfaction: number;
  morale: number;
};

type DemoStaffAttendance = {
  name: string;
  role: string;
  service: string;
  present: number;
  total: number;
  attendance_pct: number;
};

type DemoOverview = {
  available: boolean;
  dataset: {
    visits: number;
    staff: number;
    weeks: number;
    services: number;
    shifts: number;
    avg_length_of_stay: number;
    avg_satisfaction: number;
  } | null;
  services: DemoServiceStats[];
  weekly: DemoWeek[];
  staff_attendance: DemoStaffAttendance[];
  data_quality: {
    schedule?: {
      rows?: number;
      accepted?: number;
      rejected?: number;
      rejected_name_count?: number;
      role_service_conflicts?: number;
    };
    live_queue?: { queued_now?: number };
    generated_at?: string;
  } | null;
};

const SERVICE_LABELS: Record<string, string> = {
  emergency: "Emergency",
  surgery: "Surgery",
  general_medicine: "General Medicine Ward",
  icu: "Intensive Care Unit",
};

const PRIORITY_COLORS = ["#ef4444", "#f59e0b", "#ec4899", "#3b82f6", "#64748b"];

export default function AdminDashboardPage() {
  const router = useRouter();
  const session = usePortalSession();
  const hydrated = useHydrated();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [deptLoads, setDeptLoads] = useState<DepartmentLoad[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [demoOverview, setDemoOverview] = useState<DemoOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Starts empty: rendering `new Date()` during SSR guarantees a mismatch.
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState("");

  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (manual = false) => {
    if (inFlight.current) return;

    inFlight.current = true;
    if (manual) setIsRefreshing(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const [ovRes, dlRes, anRes] = await Promise.all([
        portalFetch("/admin/overview", { signal: controller.signal }),
        portalFetch("/admin/department-load", { signal: controller.signal }),
        portalFetch("/admin/analytics", { signal: controller.signal }),
      ]);

      if ([ovRes, dlRes, anRes].some((r) => r.status === 401 || r.status === 403)) {
        clearPortalSession();
        router.replace("/login/admin");
        return;
      }

      if (!ovRes.ok || !dlRes.ok || !anRes.ok) {
        throw new Error("Failed to load admin analytics");
      }

      const ovData = await ovRes.json();
      const dlData = await dlRes.json();
      const anData = await anRes.json();

      setOverview(ovData);
      setDeptLoads(dlData);
      setAnalytics(anData);
      setLastUpdated(new Date());
      setError("");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Admin dashboard fetch error:", err);
      setError("Unable to connect to hospital analytics service.");
    } finally {
      inFlight.current = false;
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [router]);

  // The historical dataset changes only when the importer runs, so it is not
  // part of the 5-second live poll.
  const fetchDemoOverview = useCallback(async () => {
    try {
      const response = await portalFetch("/demo/overview");
      if (!response.ok) return;
      const data: DemoOverview = await response.json();
      setDemoOverview(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Demo overview fetch error:", err);
    }
  }, []);

  // Admin console is gated: employees sign in with their code + PIN.
  useEffect(() => {
    if (!hydrated) return;
    if (!session || session.role !== "admin") {
      router.replace("/login/admin");
      return;
    }

    fetchData();
    void fetchDemoOverview();

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) {
        timer = setInterval(() => fetchData(false), 5000);
      }
    };

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        fetchData(false);
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      abortRef.current?.abort();
    };
  }, [fetchData, fetchDemoOverview, hydrated, session, router]);

  const activeBottlenecks = deptLoads.filter((d) => d.bottleneck_alert);

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 pb-16">
      {/* ADMIN TOP NAVIGATION */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 font-black text-white shadow-md">
                Q
              </div>
              <div>
                <p className="text-base font-extrabold tracking-tight text-slate-950">
                  QueueLess
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
                  Operations & Analytics Console
                </p>
              </div>
            </Link>

            <span className="hidden h-6 w-px bg-slate-200 sm:block" />

            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 sm:flex">
              <span
                className={`h-2 w-2 rounded-full ${
                  activeBottlenecks.length > 0 ? "bg-amber-500 animate-ping" : "bg-emerald-500"
                }`}
              />
              {activeBottlenecks.length > 0
                ? `${activeBottlenecks.length} Bottleneck Alert(s)`
                : "Hospital Flow Nominal"}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-xs text-slate-400 font-medium hidden md:block">
              Auto-refreshing • Last: {formatClock(lastUpdated) || "—"}
            </div>

            <button
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
            >
              {isRefreshing ? "Refreshing..." : "↻ Refresh"}
            </button>

            <Link
              href="/doctor"
              className="rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
            >
              Doctor Console →
            </Link>

            <button
              onClick={() => {
                clearPortalSession();
                router.replace("/login/admin");
              }}
              className="text-xs font-semibold text-slate-500 hover:text-rose-600 transition"
            >
              Sign out
            </button>

            <Link
              href="/"
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
            >
              Public View ↗
            </Link>
          </div>
        </div>
      </header>

      {/* DASHBOARD CONTAINER */}
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* TITLE BANNER */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-950 tracking-tight sm:text-3xl">
              Hospital Operations Overview
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Live patient queues, department workloads, physician capacity, and operational bottleneck detection.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">
              📅 Today&apos;s Live Flow
            </span>
          </div>
        </div>

        {/* ERROR NOTICE */}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
            ⚠️ {error} Ensure the backend server is running at {API_BASE_URL}.
          </div>
        )}

        {/* 1. OVERVIEW STATS CARDS */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Total Intake
            </p>
            <p className="mt-1 text-3xl font-black text-slate-900">
              {loading ? "..." : overview?.total_patients}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">Registered today</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Waiting in Queue
            </p>
            <p className="mt-1 text-3xl font-black text-blue-600">
              {loading ? "..." : overview?.waiting_patients}
            </p>
            <p className="mt-1 text-[11px] text-blue-600/80 font-medium">
              ~{overview?.avg_wait_minutes}m avg wait
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Consulting Now
            </p>
            <p className="mt-1 text-3xl font-black text-indigo-600">
              {loading ? "..." : overview?.consulting_patients}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">In doctor rooms</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Completed Visits
            </p>
            <p className="mt-1 text-3xl font-black text-emerald-600">
              {loading ? "..." : overview?.completed_patients}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">Finished care</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Priority / Special
            </p>
            <p className="mt-1 text-3xl font-black text-rose-600">
              {loading ? "..." : overview?.emergency_cases}
            </p>
            <p className="mt-1 text-[11px] text-rose-500 font-medium">Emergency / Elderly</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Physicians Active
            </p>
            <p className="mt-1 text-3xl font-black text-slate-900">
              {loading ? "..." : `${overview?.active_doctors}/${overview?.total_doctors}`}
            </p>
            <p className="mt-1 text-[11px] text-emerald-600 font-medium">On duty</p>
          </div>
        </div>

        {/* 2. BOTTLENECK DETECTION & RECOMMENDATIONS ENGINE */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-base text-amber-600">
                ⚡
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-950">
                  Operational Bottleneck Engine & Resource Suggestions
                </h2>
                <p className="text-xs text-slate-500">
                  Automated operational recommendations based on active queue loads, doctor presence, and wait velocity.
                </p>
              </div>
            </div>

            <span className="text-xs font-black rounded-lg bg-slate-100 px-3 py-1 text-slate-700">
              Rule-Based Intelligence
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {activeBottlenecks.length > 0 ? (
              activeBottlenecks.map((item) => (
                <div
                  key={item.department_id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-base">⚠️</span>
                    <div>
                      <p className="font-bold text-amber-900 text-sm">
                        {item.department_name} — {item.load_level} Queue Load
                      </p>
                      <p className="mt-0.5 text-amber-800 font-medium">{item.suggestion}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-amber-900 border border-amber-200 shadow-sm">
                      {item.waiting} waiting (~{item.avg_wait_minutes}m)
                    </span>
                    <Link
                      href="/doctor"
                      className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white hover:bg-amber-700 transition"
                    >
                      Manage OPD →
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs font-medium text-emerald-800">
                <span className="text-base">✓</span>
                <span>
                  All OPDs are operating within normal queue capacities. No bottlenecks detected. Average wait times are optimal.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 3. INTERACTIVE RECHARTS VISUALIZATIONS */}
        <div className="grid gap-8 lg:grid-cols-12">
          {/* A. HOURLY PATIENT INTAKE FLOW (8 COLS) */}
          <div className="lg:col-span-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div>
                <h3 className="text-base font-bold text-slate-950">
                  Hourly Patient Arrival Velocity vs Capacity
                </h3>
                <p className="text-xs text-slate-500">
                  Patient registrations across OPD hours compared against peak handling capacity.
                </p>
              </div>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                OPD Hours (08:00 - 17:00)
              </span>
            </div>

            <div className="h-72 w-full">
              {analytics && analytics.hourly_patient_flow.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.hourly_patient_flow} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="patientFlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                    <Area
                      type="monotone"
                      dataKey="patients"
                      name="Patient Intake"
                      stroke="#2563eb"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#patientFlow)"
                    />
                    <Area
                      type="monotone"
                      dataKey="capacity"
                      name="Handling Capacity"
                      stroke="#94a3b8"
                      strokeDasharray="4 4"
                      fill="transparent"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-400">
                  Loading flow data...
                </div>
              )}
            </div>
          </div>

          {/* B. PRIORITY BREAKDOWN PIE CHART (4 COLS) */}
          <div className="lg:col-span-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-base font-bold text-slate-950">
                Intake Priority Breakdown
              </h3>
              <p className="text-xs text-slate-500">
                Emergency vs regular hospital intake distribution.
              </p>
            </div>

            <div className="h-56 w-full">
              {analytics && analytics.priority_distribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.priority_distribution}
                      dataKey="count"
                      nameKey="priority"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                    >
                      {analytics.priority_distribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PRIORITY_COLORS[index % PRIORITY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-400">
                  No priority data
                </div>
              )}
            </div>

            {/* Legend pills */}
            <div className="mt-2 flex flex-wrap gap-2 justify-center text-[11px]">
              {analytics?.priority_distribution.map((item, idx) => (
                <div key={item.priority} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: PRIORITY_COLORS[idx % PRIORITY_COLORS.length] }}
                  />
                  <span className="font-semibold text-slate-700">{item.priority}:</span>
                  <span className="text-slate-500 font-bold">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 4. DEPARTMENT WORKLOAD & QUEUE COMPARISON (BAR CHART) */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
            <div>
              <h3 className="text-base font-bold text-slate-950">
                Department Workload Comparison
              </h3>
              <p className="text-xs text-slate-500">
                Active waiting queues versus completed consultations per OPD department.
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            {analytics && analytics.department_workload.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.department_workload} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                  <Bar dataKey="waiting" name="Waiting in Queue" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="completed" name="Completed Visits" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Loading department comparison...
              </div>
            )}
          </div>
        </div>

        {/* 5. DEPARTMENT LIVE LOAD MONITORING TABLE */}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
            <h3 className="text-base font-bold text-slate-950">
              Live Department Queue Matrix & Doctor Availability
            </h3>
            <p className="text-xs text-slate-500">
              Granular metrics for each outpatient department, current serving tokens, and status.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/30 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-6 py-3.5">Department</th>
                  <th className="px-6 py-3.5">Attending Doctor</th>
                  <th className="px-6 py-3.5">Room</th>
                  <th className="px-6 py-3.5">Waiting</th>
                  <th className="px-6 py-3.5">Now Serving</th>
                  <th className="px-6 py-3.5">Est. Wait</th>
                  <th className="px-6 py-3.5">Load Level</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {deptLoads.map((opd) => (
                  <tr key={opd.department_id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 font-bold text-slate-900 text-sm">
                      {opd.department_name}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${opd.is_available ? "bg-emerald-500" : "bg-amber-500"}`} />
                        <span className="font-semibold text-slate-800">{opd.doctor_name}</span>
                        {!opd.is_available && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                            Break
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{opd.room_number}</td>
                    <td className="px-6 py-4">
                      <span className="font-black text-slate-900 text-sm">{opd.waiting}</span>
                      <span className="text-slate-400 text-[11px] ml-1">patients</span>
                    </td>
                    <td className="px-6 py-4">
                      {opd.current_token ? (
                        <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
                          #{opd.current_token}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-blue-600">
                      {opd.avg_wait_minutes > 0 ? `${opd.avg_wait_minutes} min` : "No wait"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          opd.load_level === "Critical"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : opd.load_level === "Elevated"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}
                      >
                        {opd.load_level}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href="/doctor"
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
                      >
                        Open Console →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 6. HISTORICAL DATASET */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-950">
                Historical Hospital Dataset
              </h3>
              <p className="text-xs text-slate-500">
                Imported completed visits, weekly service load and the staff roster. Reported separately from today&apos;s live queue.
              </p>
            </div>
            <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Demo import
            </span>
          </div>

          {demoOverview?.available && demoOverview.dataset ? (
            <div className="space-y-6 p-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: "Historical Visits",
                    value: demoOverview.dataset.visits.toLocaleString(),
                    hint: `${demoOverview.dataset.weeks} weeks · ${demoOverview.dataset.services} services`,
                  },
                  {
                    label: "Avg. Length of Stay",
                    value: `${demoOverview.dataset.avg_length_of_stay}d`,
                    hint: "Arrival to departure",
                  },
                  {
                    label: "Avg. Patient Satisfaction",
                    value: `${demoOverview.dataset.avg_satisfaction}%`,
                    hint: "Across imported visits",
                  },
                  {
                    label: "Staff Roster",
                    value: demoOverview.dataset.staff.toLocaleString(),
                    hint: `${demoOverview.dataset.shifts.toLocaleString()} weekly shifts imported`,
                  },
                ].map((card) => (
                  <div key={card.label} className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {card.label}
                    </p>
                    <p className="mt-2 text-2xl font-black text-slate-950">{card.value}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{card.hint}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-5">
                  <h4 className="text-sm font-bold text-slate-950">
                    Weekly Demand vs Admissions
                  </h4>
                  <p className="text-xs text-slate-500">
                    Summed across the four services for all 52 imported weeks.
                  </p>
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={demoOverview.weekly}>
                        <defs>
                          <linearGradient id="demoRequested" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="demoAdmitted" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                        <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#64748b" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#ffffff",
                            borderRadius: "12px",
                            border: "1px solid #e2e8f0",
                            fontSize: "12px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                        <Area
                          type="monotone"
                          dataKey="requested"
                          name="Patients Requested"
                          stroke="#3b82f6"
                          fill="url(#demoRequested)"
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="admitted"
                          name="Patients Admitted"
                          stroke="#10b981"
                          fill="url(#demoAdmitted)"
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="refused"
                          name="Patients Refused"
                          stroke="#f59e0b"
                          fill="transparent"
                          strokeWidth={2}
                          strokeDasharray="4 3"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-5">
                  <h4 className="text-sm font-bold text-slate-950">Service Performance</h4>
                  <p className="text-xs text-slate-500">
                    Visits, stay length, satisfaction and roster attendance per service.
                  </p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="py-2 pr-3">Service</th>
                          <th className="px-3 py-2">Visits</th>
                          <th className="px-3 py-2">Avg Stay</th>
                          <th className="px-3 py-2">Satisfaction</th>
                          <th className="px-3 py-2">Staff</th>
                          <th className="py-2 pl-3 text-right">Attendance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {demoOverview.services.map((row) => (
                          <tr key={row.service}>
                            <td className="py-2.5 pr-3 font-bold text-slate-900">
                              {SERVICE_LABELS[row.service] ?? row.service}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">{row.visits}</td>
                            <td className="px-3 py-2.5 text-slate-600">{row.avg_length_of_stay}d</td>
                            <td className="px-3 py-2.5 text-slate-600">{row.avg_satisfaction}%</td>
                            <td className="px-3 py-2.5 text-slate-600">{row.staff}</td>
                            <td className="py-2.5 pl-3 text-right font-bold text-blue-600">
                              {row.attendance_pct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-5">
                  <h4 className="text-sm font-bold text-slate-950">Roster Attendance</h4>
                  <p className="text-xs text-slate-500">
                    Highest attendance across the imported 52-week schedule.
                  </p>
                  <ul className="mt-4 space-y-3">
                    {demoOverview.staff_attendance.slice(0, 6).map((person) => (
                      <li key={`${person.name}-${person.service}`}>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="font-bold text-slate-800">
                            {person.name}
                            <span className="ml-2 font-medium text-slate-400 capitalize">
                              {person.role.replace("_", " ")}
                            </span>
                          </span>
                          <span className="font-bold text-slate-600">{person.attendance_pct}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${Math.min(person.attendance_pct, 100)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
                  <h4 className="text-sm font-bold text-amber-900">Import Quality Report</h4>
                  <p className="mt-2 text-xs leading-5 text-amber-800">
                    {demoOverview.data_quality?.schedule ? (
                      <>
                        Read {demoOverview.data_quality.schedule.rows?.toLocaleString()} schedule rows;{" "}
                        {demoOverview.data_quality.schedule.accepted?.toLocaleString()} matched to the roster and{" "}
                        {demoOverview.data_quality.schedule.rejected?.toLocaleString()} rejected because{" "}
                        {demoOverview.data_quality.schedule.rejected_name_count} names are not on it.{" "}
                        {demoOverview.data_quality.schedule.role_service_conflicts} matched names had conflicting
                        role/service values, resolved in the roster&apos;s favour.
                      </>
                    ) : (
                      "The importer did not leave a quality report for this dataset."
                    )}
                  </p>
                  <p className="mt-3 text-xs leading-5 text-amber-800">
                    {demoOverview.data_quality?.live_queue?.queued_now ?? 0} dataset visits were also seeded as
                    today&apos;s waiting tokens so the live screens stay populated. Historical rows never affect
                    today&apos;s counters.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              No historical dataset imported yet. Run{" "}
              <code className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800">
                python import_demo_data.py
              </code>{" "}
              inside <code className="text-xs font-bold text-slate-800">backend/</code> to load the CSVs.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
