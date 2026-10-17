"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { API_BASE_URL, apiUrl } from "@/lib/api";

type OpdData = {
  department: string;
  doctor: string;
  room: string;
  timing: string;
  status: "Available" | "Busy" | "Closed" | string;
  waiting: number;
  wait_time: string;
  current_token: number | null;
};

function OpdCard({
  department,
  doctor,
  room,
  status,
  waiting,
  wait_time,
  current_token,
  timing,
}: OpdData) {
  const isClosed = status === "Closed";
  const isBusy = status === "Busy";

  const statusBadge = isClosed
    ? "bg-slate-100 text-slate-500 border-slate-200"
    : isBusy
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-emerald-50 text-emerald-700 border-emerald-200";

  const dotColor = isClosed
    ? "bg-slate-400"
    : isBusy
    ? "bg-amber-500 animate-pulse"
    : "bg-emerald-500";

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:border-blue-200">
      <div>
        {/* Header: Dept name + Status badge */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-blue-600">
              OPD Department
            </p>
            <h3 className="mt-1 text-xl font-black text-slate-900 tracking-tight">
              {department}
            </h3>
          </div>

          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${statusBadge}`}
          >
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            {status}
          </div>
        </div>

        {/* Doctor & Room */}
        <div className="mt-5 rounded-xl bg-slate-50 p-4 border border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Attending Specialist
          </p>
          <div className="mt-1.5 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-900 text-sm">{doctor}</p>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{room}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100/70 text-base shadow-sm">
              👨‍⚕️
            </div>
          </div>
        </div>

        {/* Live Queue Numbers */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              In Queue
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900">
              {waiting}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">
              {waiting === 1 ? "patient waiting" : "patients waiting"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Est. Wait
            </p>
            <p className="mt-1 text-2xl font-black text-blue-600">
              {wait_time}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">approximate</p>
          </div>
        </div>
      </div>

      {/* Serving Token & Timing */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500">
            Now Serving
          </p>
          <p className="mt-0.5 text-lg font-black text-blue-700">
            {current_token ? `Token #${current_token}` : "None active"}
          </p>
        </div>

        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            OPD Hours
          </p>
          <p className="mt-0.5 text-xs font-bold text-slate-700">{timing}</p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [opds, setOpds] = useState<OpdData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchOpds = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const response = await fetch(apiUrl("/opds"));
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const data: OpdData[] = await response.json();
      setOpds(data);
      setError("");
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error fetching live OPDs:", err);
      setError("Unable to connect to live hospital queue server.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOpds();
    // Auto refresh queue data every 8 seconds
    const interval = setInterval(() => {
      fetchOpds(false);
    }, 8000);

    return () => clearInterval(interval);
  }, [fetchOpds]);

  // Aggregate statistics dynamically from live data
  const totalWaiting = opds.reduce((sum, item) => sum + item.waiting, 0);
  const activeOpdsCount = opds.filter((o) => o.status !== "Closed").length;
  const averageWaitMinutes =
    activeOpdsCount > 0 ? Math.round((totalWaiting * 8) / activeOpdsCount) : 0;

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-black text-white shadow-lg shadow-blue-200">
              Q
            </div>
            <div>
              <p className="text-lg font-extrabold tracking-tight">QueueLess</p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Smart Hospital Flow
              </p>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#opds"
              className="text-sm font-semibold text-slate-600 transition hover:text-blue-600"
            >
              Live OPDs
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-slate-500 transition hover:text-blue-600"
            >
              How It Works
            </a>
            <a
              href="#features"
              className="text-sm font-medium text-slate-500 transition hover:text-blue-600"
            >
              Features
            </a>
            <Link
              href="/check-token"
              className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
            >
              Check My Token
            </Link>
            <Link
              href="/doctor"
              className="text-xs font-bold uppercase tracking-wider rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition"
            >
              👨‍⚕️ Staff
            </Link>
            <Link
              href="/admin"
              className="text-xs font-bold uppercase tracking-wider rounded-lg bg-slate-900 px-2.5 py-1.5 text-white hover:bg-slate-800 transition shadow-sm"
            >
              📊 Admin
            </Link>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 sm:flex border border-emerald-100">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-emerald-700">
                Hospital System Online
              </span>
            </div>

            <Link
              href="/verify"
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
            >
              Get My Token →
            </Link>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden">
        <div className="absolute -left-32 top-10 h-72 w-72 rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute -right-32 top-32 h-96 w-96 rounded-full bg-cyan-200/30 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-6 py-16 lg:py-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                Live OPD Wait-Time Transparency
              </span>
            </div>

            <h1 className="mt-6 text-5xl font-black leading-[1.08] tracking-tight text-slate-950 sm:text-6xl">
              Know the queue
              <span className="block text-blue-600">before you arrive.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 font-normal">
              QueueLess provides real-time visibility into hospital outpatient
              departments, doctor availability, live patient queues, and estimated wait
              times. No more standing blindly in crowded waiting rooms.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/verify"
                className="rounded-xl bg-blue-600 px-7 py-4 text-center text-sm font-bold text-white shadow-xl shadow-blue-200 transition hover:bg-blue-700"
              >
                Get My Digital Token →
              </Link>
              <Link
                href="/check-token"
                className="rounded-xl border border-slate-200 bg-white px-7 py-4 text-center text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-600 hover:shadow"
              >
                Track Existing Token
              </Link>
            </div>
          </div>

          {/* LIVE AGGREGATED METRICS */}
          <div className="mt-12 grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Active OPDs
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900">
                {loading ? "..." : activeOpdsCount}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Accepting patients</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Specialists
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900">
                {loading ? "..." : opds.length}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">On duty today</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Patients Waiting
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900">
                {loading ? "..." : totalWaiting}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Across all OPDs</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Avg. Queue Wait
              </p>
              <p className="mt-2 text-3xl font-black text-blue-600">
                {loading ? "..." : `${averageWaitMinutes}m`}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Current hospital average</p>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE OPD DASHBOARD */}
      <section id="opds" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
                <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
                  Live Hospital Database
                </p>
              </div>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Current OPD Queue & Availability
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Real-time queue loads directly from the hospital database. To protect
                patient confidentiality, personal tokens and names are only visible on
                your private verified queue dashboard.
              </p>
            </div>

            {/* Refresh control */}
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 font-medium">
                {lastUpdated ? (
                  <span>
                    Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                ) : (
                  <span>Fetching live data...</span>
                )}
              </div>
              <button
                onClick={() => fetchOpds(true)}
                disabled={isRefreshing}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
                title="Refresh queue status"
              >
                {isRefreshing ? "Refreshing..." : "↻ Refresh"}
              </button>
            </div>
          </div>

          {/* ERROR NOTICE */}
          {error && (
            <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">⚠️ Queue Server Offline</p>
                  <p className="mt-1 text-xs text-rose-600">
                    FastAPI backend is currently unreachable at {API_BASE_URL}.
                    Please start the backend server to view live data.
                  </p>
                </div>
                <button
                  onClick={() => fetchOpds(true)}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* CARDS GRID */}
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              // Skeleton loading cards
              Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/70 p-6"
                />
              ))
            ) : opds.length > 0 ? (
              opds.map((opd) => (
                <OpdCard
                  key={opd.department}
                  department={opd.department}
                  doctor={opd.doctor}
                  room={opd.room}
                  timing={opd.timing}
                  status={opd.status}
                  waiting={opd.waiting}
                  wait_time={opd.wait_time}
                  current_token={opd.current_token}
                />
              ))
            ) : (
              <div className="col-span-3 py-12 text-center text-slate-400">
                No OPD records currently active.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="bg-[#f8fafc]">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
              Transparent Patient Flow
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Public transparency first. Private queue after verification.
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition hover:shadow-md">
              <span className="text-xs font-black text-blue-600 tracking-wider">
                STEP 01
              </span>
              <div className="mt-4 text-3xl">🏥</div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                Check OPD Availability
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Explore real-time queues, assigned doctors, and estimated wait times
                before stepping out of your house.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition hover:shadow-md">
              <span className="text-xs font-black text-blue-600 tracking-wider">
                STEP 02
              </span>
              <div className="mt-4 text-3xl">📱</div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                Verify Mobile & Register
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Verify your 10-digit phone number with an OTP to prevent fraudulent
                entries and generate your department token.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition hover:shadow-md">
              <span className="text-xs font-black text-blue-600 tracking-wider">
                STEP 03
              </span>
              <div className="mt-4 text-3xl">🎟️</div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                Track Live Queue Position
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Watch your live queue position, see how many patients are ahead, and
                receive prompt alerts when the doctor is ready.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="bg-white border-t border-slate-200">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
              Built for Modern Healthcare
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Engineered for realistic hospital flow.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-500">
              QueueLess blends patient-facing convenience with hospital staff operational
              support, priority management, and bottleneck visibility.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50">
              <div className="text-2xl">🎫</div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                Department-Aware Tokens
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                Tokens are sequential and isolated per department. Every registration is
                recorded directly in PostgreSQL as the single source of truth.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50">
              <div className="text-2xl">⚡</div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                Priority-Aware Scheduling
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                Emergency, elderly, and pregnant cases are prioritized based on hospital
                workflow rules, avoiding naive first-come-first-served bottlenecks.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50">
              <div className="text-2xl">⏱️</div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                Transparent Wait Estimation
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                Clear calculations based on active patients ahead and historical
                consultation durations, transitioning to machine learning models.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50">
              <div className="text-2xl">🔒</div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                Privacy-First Design
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                Public screens display only operational statistics. Medical reasons,
                personal names, and private tokens are strictly protected.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50">
              <div className="text-2xl">🩺</div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                Staff Queue Control
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                Authorized doctors and attendants can call, consult, complete, or skip
                patients with full audit traceability across all transitions.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50">
              <div className="text-2xl">📈</div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                Hospital Operational Insights
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                Track queue arrival velocities, peak congestion hours, and doctor
                utilization to optimize resource allocations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl bg-slate-950 px-8 py-12 text-white sm:px-12 sm:py-14 shadow-2xl">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-400">
                Skip The Physical Line
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Ready to get your OPD token?
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Verify your mobile number, select your department, and monitor your
                turn from your phone. Arrive when your doctor is ready.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/verify"
                className="shrink-0 rounded-xl bg-blue-600 px-6 py-3.5 text-center text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-500"
              >
                Get My Token Now →
              </Link>
              <Link
                href="/check-token"
                className="shrink-0 rounded-xl bg-white/10 px-6 py-3.5 text-center text-sm font-bold text-white border border-white/20 transition hover:bg-white/20"
              >
                Track Existing Token
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-extrabold text-slate-900 text-sm">QueueLess</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Intelligent Hospital Queue & Patient Flow System
            </p>
          </div>

          <div className="flex items-center gap-6 text-xs text-slate-500 font-medium">
            <Link href="/" className="hover:text-blue-600 transition">
              Home
            </Link>
            <Link href="/check-token" className="hover:text-blue-600 transition">
              Check Token
            </Link>
            <Link href="/verify" className="hover:text-blue-600 transition">
              Get Token
            </Link>
            <Link href="/doctor" className="font-bold text-blue-600 hover:text-blue-700 transition">
              Doctor Console
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
