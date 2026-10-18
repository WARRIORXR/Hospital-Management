"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { API_BASE_URL, apiUrl } from "@/lib/api";
import { formatClock } from "@/lib/format";
import { DEPARTMENT_KEYS, useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";

type OpdData = {
  department: string;
  code?: string;
  doctor: string;
  room: string;
  timing: string;
  status: "Available" | "Busy" | "Closed" | string;
  status_code?: "available" | "busy" | "break";
  waiting: number;
  wait_time: string;
  wait_minutes?: number;
  current_token: number | null;
};

function OpdCard({
  department,
  code,
  doctor,
  room,
  status,
  status_code,
  waiting,
  wait_minutes,
  wait_time,
  current_token,
  timing,
}: OpdData) {
  const { t } = useI18n();

  // Older API responses only carry the English label, so fall back to it.
  const statusCode =
    status_code ??
    (status === "Busy"
      ? "busy"
      : status === "Doctor on Break" || status === "Closed"
        ? "break"
        : "available");

  const isClosed = statusCode === "break";
  const isBusy = statusCode === "busy";

  const statusLabel = isClosed
    ? t("status.onBreak")
    : isBusy
    ? t("status.busy")
    : t("status.available");

  const departmentLabel =
    code && DEPARTMENT_KEYS[code] ? t(DEPARTMENT_KEYS[code]) : department;

  const waitLabel =
    (wait_minutes ?? 0) > 0
      ? `${wait_minutes} ${t("common.minutes")}`
      : wait_time === "No wait" || wait_minutes === 0
        ? t("wait.noWait")
        : wait_time;

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
              {t("card.opdDept")}
            </p>
            <h3 className="mt-1 text-xl font-black text-slate-900 tracking-tight">
              {departmentLabel}
            </h3>
          </div>

          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${statusBadge}`}
          >
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            {statusLabel}
          </div>
        </div>

        {/* Doctor & Room */}
        <div className="mt-5 rounded-xl bg-slate-50 p-4 border border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {t("card.attending")}
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
              {t("card.inQueue")}
            </p>
            <p className="mt-1 text-2xl font-black text-slate-900">
              {waiting}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">
              {waiting === 1
                ? t("card.patientWaiting")
                : t("card.patientsWaiting")}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {t("card.estWait")}
            </p>
            <p className="mt-1 text-2xl font-black text-blue-600">
              {waitLabel}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">
              {t("card.approximate")}
            </p>
          </div>
        </div>
      </div>

      {/* Serving Token & Timing */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500">
            {t("card.nowServing")}
          </p>
          <p className="mt-0.5 text-lg font-black text-blue-700">
            {current_token
              ? `Token #${current_token}`
              : t("card.noneActive")}
          </p>
        </div>

        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {t("card.opdHours")}
          </p>
          <p className="mt-0.5 text-xs font-bold text-slate-700">{timing}</p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { t } = useI18n();

  const [opds, setOpds] = useState<OpdData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchOpds = useCallback(async (showRefreshing = false) => {
    if (inFlight.current) return;

    inFlight.current = true;
    if (showRefreshing) setIsRefreshing(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(apiUrl("/opds"), {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const data: OpdData[] = await response.json();
      setOpds(data);
      setError("");
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Error fetching live OPDs:", err);
      setError(t("error.offlineTitle"));
    } finally {
      inFlight.current = false;
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [t]);

  // Poll while the tab is visible; stop entirely when it is hidden.
  useEffect(() => {
    fetchOpds();

    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval === null) {
        interval = setInterval(() => fetchOpds(false), 8000);
      }
    };

    const stop = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        fetchOpds(false);
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
                {t("brand.tagline")}
              </p>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#opds"
              className="text-sm font-semibold text-slate-600 transition hover:text-blue-600"
            >
              {t("nav.liveOpds")}
            </a>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-slate-500 transition hover:text-blue-600"
            >
              {t("nav.howItWorks")}
            </a>
            <a
              href="#features"
              className="text-sm font-medium text-slate-500 transition hover:text-blue-600"
            >
              {t("nav.features")}
            </a>
            <Link
              href="/check-token"
              className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
            >
              {t("nav.checkToken")}
            </Link>
            <Link
              href="/doctor"
              className="text-xs font-bold uppercase tracking-wider rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition"
            >
              👨‍⚕️ {t("nav.staff")}
            </Link>
            <Link
              href="/admin"
              className="text-xs font-bold uppercase tracking-wider rounded-lg bg-slate-900 px-2.5 py-1.5 text-white hover:bg-slate-800 transition shadow-sm"
            >
              📊 {t("nav.admin")}
            </Link>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 sm:flex border border-emerald-100">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-emerald-700">
                {t("home.systemOnline")}
              </span>
            </div>

            <LanguageSwitcher />

            <Link
              href="/verify"
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
            >
              {t("home.getToken")}
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
                {t("hero.badge")}
              </span>
            </div>

            <h1 className="mt-6 text-5xl font-black leading-[1.08] tracking-tight text-slate-950 sm:text-6xl">
              {t("hero.title1")}
              <span className="block text-blue-600">{t("hero.title2")}</span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 font-normal">
              {t("hero.subtitle")}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/verify"
                className="rounded-xl bg-blue-600 px-7 py-4 text-center text-sm font-bold text-white shadow-xl shadow-blue-200 transition hover:bg-blue-700"
              >
                {t("hero.ctaPrimary")}
              </Link>
              <Link
                href="/check-token"
                className="rounded-xl border border-slate-200 bg-white px-7 py-4 text-center text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-600 hover:shadow"
              >
                {t("hero.ctaSecondary")}
              </Link>
            </div>
          </div>

          {/* LIVE AGGREGATED METRICS */}
          <div className="mt-12 grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t("metrics.activeOpds")}
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900">
                {loading ? "..." : activeOpdsCount}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {t("metrics.accepting")}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t("metrics.specialists")}
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900">
                {loading ? "..." : opds.length}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {t("metrics.onDuty")}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t("metrics.waiting")}
              </p>
              <p className="mt-2 text-3xl font-black text-slate-900">
                {loading ? "..." : totalWaiting}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {t("metrics.acrossAll")}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t("metrics.avgWait")}
              </p>
              <p className="mt-2 text-3xl font-black text-blue-600">
                {loading
                  ? "..."
                  : `${averageWaitMinutes} ${t("common.minutes")}`}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {t("metrics.currentAverage")}
              </p>
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
                  {t("live.kicker")}
                </p>
              </div>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                {t("live.title")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                {t("live.description")}
              </p>
            </div>

            {/* Refresh control */}
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 font-medium">
                {lastUpdated ? (
                  <span>
                    {t("live.updated", { time: formatClock(lastUpdated) })}
                  </span>
                ) : (
                  <span>{t("live.fetching")}</span>
                )}
              </div>
              <button
                onClick={() => fetchOpds(true)}
                disabled={isRefreshing}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
                title={t("common.refresh")}
              >
                {isRefreshing ? t("common.refreshing") : t("common.refresh")}
              </button>
            </div>
          </div>

          {/* ERROR NOTICE */}
          {error && (
            <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">{t("error.offlineTitle")}</p>
                  <p className="mt-1 text-xs text-rose-600">
                    {t("error.offlineDescription", { url: API_BASE_URL })}
                  </p>
                </div>
                <button
                  onClick={() => fetchOpds(true)}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
                >
                  {t("common.retry")}
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
                  code={opd.code}
                  status_code={opd.status_code}
                  wait_minutes={opd.wait_minutes}
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
                {t("card.noOpds")}
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
              {t("how.kicker")}
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              {t("how.title")}
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition hover:shadow-md">
              <span className="text-xs font-black text-blue-600 tracking-wider">
                {t("how.stepLabel", { number: "01" })}
              </span>
              <div className="mt-4 text-3xl">🏥</div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                {t("how.step1.title")}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {t("how.step1.description")}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition hover:shadow-md">
              <span className="text-xs font-black text-blue-600 tracking-wider">
                {t("how.stepLabel", { number: "02" })}
              </span>
              <div className="mt-4 text-3xl">📱</div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                {t("how.step2.title")}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {t("how.step2.description")}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition hover:shadow-md">
              <span className="text-xs font-black text-blue-600 tracking-wider">
                {t("how.stepLabel", { number: "03" })}
              </span>
              <div className="mt-4 text-3xl">🎟️</div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                {t("how.step3.title")}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {t("how.step3.description")}
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
              {t("features.kicker")}
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              {t("features.title")}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-500">
              {t("features.description")}
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50">
              <div className="text-2xl">🎫</div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                {t("features.tokens.title")}
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                {t("features.tokens.description")}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50">
              <div className="text-2xl">⚡</div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                {t("features.priority.title")}
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                {t("features.priority.description")}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50">
              <div className="text-2xl">⏱️</div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                {t("features.wait.title")}
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                {t("features.wait.description")}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50">
              <div className="text-2xl">🔒</div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                {t("features.privacy.title")}
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                {t("features.privacy.description")}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50">
              <div className="text-2xl">🩺</div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                {t("features.staff.title")}
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                {t("features.staff.description")}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6 bg-slate-50/50">
              <div className="text-2xl">📈</div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                {t("features.insights.title")}
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                {t("features.insights.description")}
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
                {t("cta.kicker")}
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                {t("cta.title")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {t("cta.description")}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/verify"
                className="shrink-0 rounded-xl bg-blue-600 px-6 py-3.5 text-center text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-500"
              >
                {t("cta.primary")}
              </Link>
              <Link
                href="/check-token"
                className="shrink-0 rounded-xl bg-white/10 px-6 py-3.5 text-center text-sm font-bold text-white border border-white/20 transition hover:bg-white/20"
              >
                {t("cta.secondary")}
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
              {t("footer.tagline")}
            </p>
          </div>

          <div className="flex items-center gap-6 text-xs text-slate-500 font-medium">
            <Link href="/" className="hover:text-blue-600 transition">
              {t("footer.home")}
            </Link>
            <Link href="/check-token" className="hover:text-blue-600 transition">
              {t("footer.check")}
            </Link>
            <Link href="/verify" className="hover:text-blue-600 transition">
              {t("footer.get")}
            </Link>
            <Link href="/doctor" className="font-bold text-blue-600 hover:text-blue-700 transition">
              {t("footer.doctor")}
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
