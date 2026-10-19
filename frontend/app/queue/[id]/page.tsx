"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatClock, formatDateTime } from "@/lib/format";
import { patientFetch } from "@/lib/auth";
import {
  DEPARTMENT_KEYS,
  PRIORITY_KEYS,
  VISIT_STATUS_KEYS,
  useI18n,
} from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";

type Patient = {
  id: number;
  name: string;
  age: number;
  phone: string;
  department: string;
  token_number: number;
  status: string;
  symptoms: string | null;
  priority: string;
};

type QueueStatus = {
  your_token: number;
  current_token: number | null;
  queue_position: number | null;
  patients_ahead: number;
  estimated_wait_minutes: number;
};

const REFRESH_INTERVAL_MS = 5000;

export default function QueuePage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();

  const patientId = params.id;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [actionError, setActionError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  // Prevents overlapping polls and lets us cancel the request on unmount.
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchQueueData = useCallback(async () => {
    if (inFlight.current) return;

    inFlight.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setError("");

      const [patientResponse, queueResponse] = await Promise.all([
        patientFetch(`/patients/${patientId}`, { signal: controller.signal }),
        patientFetch(`/patients/${patientId}/queue-status`, {
          signal: controller.signal,
        }),
      ]);

      if (patientResponse.status === 401 || patientResponse.status === 403) {
        // Not signed in for this number — OTP verification unlocks the dashboard.
        router.replace(`/verify?next=/queue/${patientId}`);
        return;
      }

      if (!patientResponse.ok) {
        throw new Error("Patient not found");
      }

      if (!queueResponse.ok) {
        throw new Error("Unable to load queue status");
      }

      const [patientData, queueData] = await Promise.all([
        patientResponse.json(),
        queueResponse.json(),
      ]);

      setPatient(patientData);
      setQueueStatus(queueData);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Queue error:", err);
      setError(t("queue.errorLoad"));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [patientId, t, router]);

  // Initial load + polling that pauses while the tab is hidden.
  useEffect(() => {
    fetchQueueData();

    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval === null) {
        interval = setInterval(fetchQueueData, REFRESH_INTERVAL_MS);
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
        fetchQueueData();
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
  }, [fetchQueueData]);

  const handleCancelVisit = async () => {
    if (!patient) return;

    setCancelling(true);
    setActionError("");

    try {
      const response = await patientFetch(`/patients/${patient.id}/cancel`, {
        method: "PUT",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : t("queue.cancelFailed")
        );
      }

      await fetchQueueData();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : t("queue.cancelFailed")
      );
    } finally {
      setCancelling(false);
      setConfirmingLeave(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f9fc]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <p className="text-sm font-medium text-slate-500">
            {t("queue.loading")}
          </p>
        </div>
      </main>
    );
  }

  if (error || !patient) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f9fc] px-6">
        <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <div className="mb-3 text-4xl">⚠️</div>

          <h1 className="text-xl font-bold text-slate-900">
            {t("queue.errorUnavailable")}
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            {error || t("queue.errorPatientMissing")}
          </p>

          <button
            onClick={() => router.push("/")}
            className="mt-6 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white"
          >
            {t("common.backHome")}
          </button>
        </div>
      </main>
    );
  }

  const departmentKey = DEPARTMENT_KEYS[patient.department];
  const department = departmentKey
    ? t(departmentKey)
    : patient.department.charAt(0).toUpperCase() + patient.department.slice(1);

  const priorityKey = PRIORITY_KEYS[patient.priority || "regular"];
  const priority = priorityKey ? t(priorityKey) : patient.priority;

  const statusKey = VISIT_STATUS_KEYS[patient.status];
  const statusLabel = statusKey ? t(statusKey) : patient.status;

  const isTerminal =
    patient.status === "completed" ||
    patient.status === "cancelled" ||
    patient.status === "skipped";

  const canLeaveQueue =
    patient.status === "waiting" || patient.status === "called";

  return (
    <main className="min-h-screen bg-[#f6f9fc] px-6 py-10">
      {/* Printable token slip: only rendered when printing */}
      <div className="hidden print:block text-slate-900">
        <p className="text-xs font-bold uppercase tracking-[0.3em]">
          {t("queue.slip.kicker")}
        </p>

        <h1 className="mt-3 text-4xl font-black">
          Token #{patient.token_number}
        </h1>

        <p className="mt-1 text-sm font-semibold">
          {t("queue.departmentSuffix", { department })}
        </p>

        <div className="mt-6 space-y-1 border-y border-slate-300 py-4 text-sm">
          <p>
            <span className="font-semibold">{t("queue.slip.patient")}:</span>{" "}
            {patient.name}
          </p>
          <p>
            <span className="font-semibold">{t("queue.slip.age")}:</span>{" "}
            {patient.age}
          </p>
          <p>
            <span className="font-semibold">{t("queue.slip.mobile")}:</span> +91{" "}
            {patient.phone}
          </p>
          <p>
            <span className="font-semibold">{t("queue.slip.priority")}:</span>{" "}
            {priority}
          </p>
          <p>
            <span className="font-semibold">{t("queue.slip.printed")}:</span>{" "}
            {formatDateTime(new Date())}
          </p>
        </div>

        <p className="mt-4 text-xs">{t("queue.slip.note")}</p>
      </div>

      <div className="mx-auto max-w-5xl print:hidden">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            onClick={() => router.push("/")}
            className="text-left text-sm font-semibold text-slate-500 transition hover:text-blue-600"
          >
            {t("common.backHome")}
          </button>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button
              onClick={() => router.push("/check-token")}
              className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
            >
              {t("common.checkToken")}
            </button>
          </div>
        </div>

        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-widest text-blue-600">
            QUEUELESS
          </p>

          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-950">
            {t("queue.title")}
          </h1>

          <p className="mt-3 text-slate-500">{t("queue.subtitle")}</p>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
          <div className="bg-blue-600 px-6 py-10 text-center text-white sm:px-10">
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-100">
              {t("queue.yourToken")}
            </p>

            <h2 className="mt-3 text-7xl font-black tracking-tight">
              #{patient.token_number}
            </h2>

            <p className="mt-3 text-blue-100">
              {t("queue.departmentSuffix", { department })}
            </p>
          </div>

          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 px-6 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-600"
            >
              {t("common.print")}
            </button>

            {canLeaveQueue && !confirmingLeave && (
              <button
                type="button"
                onClick={() => setConfirmingLeave(true)}
                className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-600 shadow-sm transition hover:bg-rose-50"
              >
                {t("queue.leave")}
              </button>
            )}

            {canLeaveQueue && confirmingLeave && (
              <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                <span className="text-xs font-semibold text-rose-700">
                  {t("queue.cancelQuestion")}
                </span>

                <button
                  type="button"
                  onClick={handleCancelVisit}
                  disabled={cancelling}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancelling ? t("queue.cancelling") : t("queue.yesLeave")}
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmingLeave(false)}
                  disabled={cancelling}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  {t("queue.keepWaiting")}
                </button>
              </div>
            )}
          </div>

          {actionError && (
            <div className="border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm font-semibold text-rose-700">
              {actionError}
            </div>
          )}

          {/* PATIENT SUMMARY */}
          <div className="grid gap-6 p-6 sm:grid-cols-3 sm:p-8">
            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t("queue.patient")}
              </p>

              <p className="mt-2 text-lg font-bold text-slate-900">
                {patient.name}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t("queue.status")}
              </p>

              <div className="mt-2 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />

                <p className="font-bold text-emerald-600">{statusLabel}</p>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t("queue.priority")}
              </p>

              <p className="mt-2 font-bold text-slate-900">{priority}</p>
            </div>
          </div>

          {/* LIVE QUEUE */}
          <div className="border-t border-slate-100 p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-600">
                  {t("queue.liveQueue")}
                </p>

                <h3 className="mt-1 text-2xl font-bold text-slate-900">
                  {t("queue.positionTitle")}
                </h3>
              </div>

              <div className="flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />

                <span className="text-xs font-bold text-emerald-600">
                  {t("queue.live")}
                </span>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {t("queue.currentlyServing")}
                </p>

                <p className="mt-2 text-3xl font-black text-slate-900">
                  {queueStatus?.current_token !== null &&
                  queueStatus?.current_token !== undefined
                    ? `#${queueStatus.current_token}`
                    : "—"}
                </p>
              </div>

              <div className="rounded-2xl bg-blue-50 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-500">
                  {t("queue.patientsAhead")}
                </p>

                <p className="mt-2 text-3xl font-black text-blue-600">
                  {queueStatus?.patients_ahead ?? "—"}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {t("queue.yourPosition")}
                </p>

                <p className="mt-2 text-3xl font-black text-slate-900">
                  {queueStatus?.queue_position
                    ? `#${queueStatus.queue_position}`
                    : "—"}
                </p>
              </div>

              <div className="rounded-2xl bg-emerald-50 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                  {t("queue.estWait")}
                </p>

                <p className="mt-2 text-3xl font-black text-emerald-600">
                  {queueStatus?.estimated_wait_minutes ?? "—"}{" "}
                  {t("common.minutes")}
                </p>
              </div>
            </div>

            {isTerminal && (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <p className="text-sm font-semibold text-amber-800">
                  {patient.status === "completed"
                    ? t("queue.completedTitle")
                    : patient.status === "cancelled"
                      ? t("queue.cancelledTitle")
                      : t("queue.skippedTitle")}
                </p>

                <p className="mt-1 text-sm leading-6 text-amber-700">
                  {patient.status === "completed"
                    ? t("queue.completedDescription")
                    : t("queue.inactiveDescription")}
                </p>

                <Link
                  href="/verify"
                  className="mt-3 inline-block rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-700"
                >
                  {t("queue.newToken")}
                </Link>
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-blue-600">
                    {t("queue.liveMessage")}
                  </p>

                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {t("queue.autoRefresh")}
                  </p>
                </div>

                {lastUpdated && (
                  <p className="text-xs font-medium text-slate-400">
                    {t("queue.updated", { time: formatClock(lastUpdated) })}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* REGISTRATION DETAILS */}
          <div className="border-t border-slate-100 p-6 sm:p-8">
            <h3 className="text-lg font-bold text-slate-900">
              {t("queue.registrationDetails")}
            </h3>

            <div className="mt-5 space-y-4">
              <div className="flex justify-between border-b border-slate-100 pb-3">
                <span className="text-sm text-slate-500">
                  {t("register.departmentLabel")}
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {department}
                </span>
              </div>

              <div className="flex justify-between border-b border-slate-100 pb-3">
                <span className="text-sm text-slate-500">
                  {t("queue.age")}
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {patient.age}
                </span>
              </div>

              <div className="flex justify-between border-b border-slate-100 pb-3">
                <span className="text-sm text-slate-500">
                  {t("queue.phone")}
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {patient.phone}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-sm text-slate-500">
                  {t("queue.priority")}
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {priority}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 text-center text-xs text-slate-400">
          {t("queue.security")}
        </div>
      </div>
    </main>
  );
}
