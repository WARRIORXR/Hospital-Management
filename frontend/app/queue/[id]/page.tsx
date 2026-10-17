
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";

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


  // --------------------------------------------------
  // FETCH QUEUE DATA
  // --------------------------------------------------

  const fetchQueueData = async () => {
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
  };


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

  }, [patientId]);


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

  const priority =
    patient.priority.replace("_", " ");


  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

  return (

    <main className="min-h-screen bg-[#f6f9fc] px-6 py-10">

      <div className="mx-auto max-w-5xl">


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

                    Updated{" "}
                    {lastUpdated.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}

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
