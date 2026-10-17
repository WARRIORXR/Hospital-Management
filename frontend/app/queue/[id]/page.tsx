
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { formatClock, formatDateTime } from "@/lib/format";

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

export default function QueuePage() {
  const params = useParams();
  const router = useRouter();

  const patientId = params.id;

  const [patient, setPatient] = useState<Patient | null>(null);

  const [queueStatus, setQueueStatus] =
    useState<QueueStatus | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [lastUpdated, setLastUpdated] =
    useState<Date | null>(null);

  const [actionError, setActionError] = useState("");

  const [cancelling, setCancelling] = useState(false);

  const [confirmingLeave, setConfirmingLeave] = useState(false);


  // --------------------------------------------------
  // FETCH QUEUE DATA
  // --------------------------------------------------

  const fetchQueueData = useCallback(async () => {
    try {
      setError("");

      // ----------------------------------------------
      // Get patient information
      // ----------------------------------------------

      const patientResponse = await fetch(
        apiUrl(`/patients/${patientId}`)
      );

      if (!patientResponse.ok) {
        throw new Error("Patient not found");
      }

      const patientData = await patientResponse.json();

      setPatient(patientData);


      // ----------------------------------------------
      // Get queue status
      // ----------------------------------------------

      const queueResponse = await fetch(
        apiUrl(`/patients/${patientId}/queue-status`)
      );

      if (!queueResponse.ok) {
        throw new Error(
          "Unable to load queue status"
        );
      }

      const queueData = await queueResponse.json();

      setQueueStatus(queueData);


      // ----------------------------------------------
      // Update timestamp
      // ----------------------------------------------

      setLastUpdated(new Date());

    } catch (error) {

      console.error("Queue error:", error);

      setError(
        "Unable to load your queue information."
      );

    } finally {

      setLoading(false);

    }
  }, [patientId]);


  // --------------------------------------------------
  // INITIAL LOAD + AUTO REFRESH
  // --------------------------------------------------

  useEffect(() => {

    // Load immediately
    fetchQueueData();


    // Refresh every 5 seconds
    const interval = setInterval(() => {

      fetchQueueData();

    }, 5000);


    // Cleanup timer when leaving page
    return () => {

      clearInterval(interval);

    };

  }, [fetchQueueData]);


  // --------------------------------------------------
  // PATIENT ACTIONS
  // --------------------------------------------------

  const handleCancelVisit = async () => {
    if (!patient) return;

    setCancelling(true);
    setActionError("");

    try {
      const response = await fetch(apiUrl(`/patients/${patient.id}/cancel`), {
        method: "PUT",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : "Could not cancel this token."
        );
      }

      await fetchQueueData();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not cancel this token."
      );
    } finally {
      setCancelling(false);
      setConfirmingLeave(false);
    }
  };


  // --------------------------------------------------
  // LOADING
  // --------------------------------------------------

  if (loading) {

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f9fc]">

        <div className="text-center">

          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />

          <p className="text-sm font-medium text-slate-500">
            Loading your queue...
          </p>

        </div>

      </main>
    );

  }


  // --------------------------------------------------
  // ERROR
  // --------------------------------------------------

  if (error || !patient) {

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f9fc] px-6">

        <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg">

          <div className="mb-3 text-4xl">
            ⚠️
          </div>

          <h1 className="text-xl font-bold text-slate-900">
            Queue information unavailable
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            {error ||
              "Patient information could not be found."}
          </p>

          <button
            onClick={() => router.push("/")}
            className="mt-6 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white"
          >
            Back to Home
          </button>

        </div>

      </main>
    );

  }


  // --------------------------------------------------
  // FORMATTING
  // --------------------------------------------------

  const department =
    patient.department.charAt(0).toUpperCase() +
    patient.department.slice(1);

  const priority = (patient.priority || "regular").replace("_", " ");

  const isTerminal =
    patient.status === "completed" ||
    patient.status === "cancelled" ||
    patient.status === "skipped";

  const canLeaveQueue =
    patient.status === "waiting" || patient.status === "called";


  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

  return (

    <main className="min-h-screen bg-[#f6f9fc] px-6 py-10">

      {/* Printable token slip: only rendered when the patient prints the page */}

      <div className="hidden print:block text-slate-900">

        <p className="text-xs font-bold uppercase tracking-[0.3em]">
          QueueLess · OPD Token Slip
        </p>

        <h1 className="mt-3 text-4xl font-black">
          Token #{patient.token_number}
        </h1>

        <p className="mt-1 text-sm font-semibold">
          {department} Department
        </p>

        <div className="mt-6 space-y-1 border-y border-slate-300 py-4 text-sm">
          <p>
            <span className="font-semibold">Patient:</span> {patient.name}
          </p>
          <p>
            <span className="font-semibold">Age:</span> {patient.age}
          </p>
          <p>
            <span className="font-semibold">Mobile:</span> +91 {patient.phone}
          </p>

          <p>
            <span className="font-semibold">Priority:</span> {priority}
          </p>

          <p>
            <span className="font-semibold">Printed:</span>{" "}
            {formatDateTime(new Date())}
          </p>
        </div>

        <p className="mt-4 text-xs">
          Keep this slip with you. Your queue position is shown on the QueueLess
          dashboard and refreshes every 5 seconds.
        </p>

      </div>

      <div className="mx-auto max-w-5xl print:hidden">


        {/* ------------------------------------------------ */}
        {/* TOP NAVIGATION */}
        {/* ------------------------------------------------ */}

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

          <button
            onClick={() => router.push("/")}
            className="text-left text-sm font-semibold text-slate-500 transition hover:text-blue-600"
          >
            ← Back to Home
          </button>


          <button
            onClick={() => router.push("/check-token")}
            className="text-left text-sm font-semibold text-blue-600 transition hover:text-blue-700 sm:text-right"
          >
            Check My Token →
          </button>

        </div>


        {/* ------------------------------------------------ */}
        {/* HEADER */}
        {/* ------------------------------------------------ */}

        <div className="mb-8">

          <p className="text-sm font-bold uppercase tracking-widest text-blue-600">
            QUEUELESS
          </p>

          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-950">
            Your Queue
          </h1>

          <p className="mt-3 text-slate-500">
            Track your position while you wait.
          </p>

        </div>


        {/* ------------------------------------------------ */}
        {/* MAIN CARD */}
        {/* ------------------------------------------------ */}

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/50">


          {/* ------------------------------------------------ */}
          {/* TOKEN */}
          {/* ------------------------------------------------ */}

          <div className="bg-blue-600 px-6 py-10 text-center text-white sm:px-10">

            <p className="text-sm font-semibold uppercase tracking-widest text-blue-100">
              Your Token
            </p>

            <h2 className="mt-3 text-7xl font-black tracking-tight">
              #{patient.token_number}
            </h2>

            <p className="mt-3 text-blue-100">
              {department} Department
            </p>

          </div>


          {/* ------------------------------------------------ */}
          {/* TOKEN ACTIONS */}
          {/* ------------------------------------------------ */}

          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 px-6 py-4 sm:flex-row sm:justify-end">

            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-600"
            >
              🖨️ Print token slip
            </button>

            {canLeaveQueue && !confirmingLeave && (
              <button
                type="button"
                onClick={() => setConfirmingLeave(true)}
                className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-600 shadow-sm transition hover:bg-rose-50"
              >
                Leave queue
              </button>
            )}

            {canLeaveQueue && confirmingLeave && (
              <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">

                <span className="text-xs font-semibold text-rose-700">
                  Cancel this token?
                </span>

                <button
                  type="button"
                  onClick={handleCancelVisit}
                  disabled={cancelling}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancelling ? "Cancelling..." : "Yes, leave queue"}
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmingLeave(false)}
                  disabled={cancelling}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Keep waiting
                </button>

              </div>
            )}

          </div>


          {actionError && (
            <div className="border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm font-semibold text-rose-700">
              {actionError}
            </div>
          )}


          {/* ------------------------------------------------ */}
          {/* PATIENT SUMMARY */}
          {/* ------------------------------------------------ */}

          <div className="grid gap-6 p-6 sm:grid-cols-3 sm:p-8">


            <div className="rounded-2xl bg-slate-50 p-5">

              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Patient
              </p>

              <p className="mt-2 text-lg font-bold text-slate-900">
                {patient.name}
              </p>

            </div>


            <div className="rounded-2xl bg-slate-50 p-5">

              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Status
              </p>

              <div className="mt-2 flex items-center gap-2">

                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />

                <p className="font-bold capitalize text-emerald-600">
                  {patient.status}
                </p>

              </div>

            </div>


            <div className="rounded-2xl bg-slate-50 p-5">

              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Priority
              </p>

              <p className="mt-2 font-bold capitalize text-slate-900">
                {priority}
              </p>

            </div>

          </div>


          {/* ------------------------------------------------ */}
          {/* LIVE QUEUE */}
          {/* ------------------------------------------------ */}

          <div className="border-t border-slate-100 p-6 sm:p-8">


            <div className="flex items-center justify-between">

              <div>

                <p className="text-sm font-semibold text-blue-600">
                  Live Queue
                </p>

                <h3 className="mt-1 text-2xl font-bold text-slate-900">
                  Your Current Position
                </h3>

              </div>


              <div className="flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1">

                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />

                <span className="text-xs font-bold text-emerald-600">
                  LIVE
                </span>

              </div>

            </div>


            {/* ------------------------------------------------ */}
            {/* QUEUE STATS */}
            {/* ------------------------------------------------ */}

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">


              <div className="rounded-2xl bg-slate-50 p-5">

                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Currently Serving
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
                  Patients Ahead
                </p>

                <p className="mt-2 text-3xl font-black text-blue-600">
                  {queueStatus?.patients_ahead ?? "—"}
                </p>

              </div>


              <div className="rounded-2xl bg-slate-50 p-5">

                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Your Position
                </p>

                <p className="mt-2 text-3xl font-black text-slate-900">

                  {queueStatus?.queue_position
                    ? `#${queueStatus.queue_position}`
                    : "—"}

                </p>

              </div>


              <div className="rounded-2xl bg-emerald-50 p-5">

                <p className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                  Estimated Wait
                </p>

                <p className="mt-2 text-3xl font-black text-emerald-600">
                  {queueStatus?.estimated_wait_minutes ?? "—"} min
                </p>

              </div>

            </div>


            {isTerminal && (

              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">

                <p className="text-sm font-semibold text-amber-800">
                  {patient.status === "completed"
                    ? "Visit completed"
                    : patient.status === "cancelled"
                      ? "Token cancelled"
                      : "Token skipped"}
                </p>

                <p className="mt-1 text-sm leading-6 text-amber-700">
                  {patient.status === "completed"
                    ? "Your consultation is finished. Take care, and follow any advice given by the doctor."
                    : "This token is no longer active. You can register for a new token at any time."}
                </p>

                <Link
                  href="/verify"
                  className="mt-3 inline-block rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-700"
                >
                  Get a new token →
                </Link>

              </div>

            )}


            {/* ------------------------------------------------ */}
            {/* LIVE UPDATE INFO */}
            {/* ------------------------------------------------ */}

            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-5">

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

                <div>

                  <p className="text-sm font-semibold text-blue-600">
                    Queue is live
                  </p>

                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Your queue information automatically refreshes
                    every 5 seconds.
                  </p>

                </div>


                {lastUpdated && (

                  <p className="text-xs font-medium text-slate-400">

                    Updated {formatClock(lastUpdated)}

                  </p>

                )}

              </div>

            </div>

          </div>


          {/* ------------------------------------------------ */}
          {/* REGISTRATION DETAILS */}
          {/* ------------------------------------------------ */}

          <div className="border-t border-slate-100 p-6 sm:p-8">

            <h3 className="text-lg font-bold text-slate-900">
              Registration Details
            </h3>


            <div className="mt-5 space-y-4">


              <div className="flex justify-between border-b border-slate-100 pb-3">

                <span className="text-sm text-slate-500">
                  Department
                </span>

                <span className="text-sm font-semibold text-slate-900">
                  {department}
                </span>

              </div>


              <div className="flex justify-between border-b border-slate-100 pb-3">

                <span className="text-sm text-slate-500">
                  Age
                </span>

                <span className="text-sm font-semibold text-slate-900">
                  {patient.age}
                </span>

              </div>


              <div className="flex justify-between border-b border-slate-100 pb-3">

                <span className="text-sm text-slate-500">
                  Phone
                </span>

                <span className="text-sm font-semibold text-slate-900">
                  {patient.phone}
                </span>

              </div>


              <div className="flex justify-between">

                <span className="text-sm text-slate-500">
                  Priority
                </span>

                <span className="text-sm font-semibold capitalize text-slate-900">
                  {priority}
                </span>

              </div>


            </div>

          </div>

        </div>


        {/* ------------------------------------------------ */}
        {/* FOOTER */}
        {/* ------------------------------------------------ */}

        <div className="mt-5 text-center text-xs text-slate-400">
          🔒 Your queue information is securely handled by QueueLess.
        </div>


      </div>

    </main>

  );
}
