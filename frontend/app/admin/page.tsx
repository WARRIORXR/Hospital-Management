"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { API_BASE_URL, apiUrl } from "@/lib/api";
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

const PRIORITY_COLORS = ["#ef4444", "#f59e0b", "#ec4899", "#3b82f6", "#64748b"];

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [deptLoads, setDeptLoads] = useState<DepartmentLoad[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [error, setError] = useState("");

  const fetchData = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    try {
      const [ovRes, dlRes, anRes] = await Promise.all([
        fetch(apiUrl("/admin/overview")),
        fetch(apiUrl("/admin/department-load")),
        fetch(apiUrl("/admin/analytics")),
      ]);

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
      console.error("Admin dashboard fetch error:", err);
      setError("Unable to connect to hospital analytics service.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Poll every 5 seconds for real-time monitoring
    const timer = setInterval(() => {
      fetchData(false);
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchData]);

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
              Auto-refreshing • Last: {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
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
              📅 Today's Live Flow
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
      </div>
    </main>
  );
}
