"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiUrl } from "@/lib/api";

export default function CheckTokenPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const cleanPhone = phone.trim();

    if (!/^[0-9]{10}$/.test(cleanPhone)) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        apiUrl(`/patients/by-phone/${cleanPhone}`)
      );

      if (response.status === 404) {
        setError(
          "No active record found for this mobile number. Would you like to get a new token?"
        );
        return;
      }

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const patient = await response.json();

      // Set session so patient dashboard recognises identity
      sessionStorage.setItem("phoneVerified", "true");
      sessionStorage.setItem("verifiedPhone", cleanPhone);

      // Redirect to private queue dashboard
      router.push(`/queue/${patient.id}`);
    } catch (err) {
      console.error("Check token error:", err);
      setError(
        "Unable to connect to hospital queue server. Please ensure the backend is running."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
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

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm font-semibold text-slate-600 transition hover:text-blue-600"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl text-blue-600">
              🔍
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
              Patient Queue Lookup
            </p>
            <h1 className="mt-2 text-2xl font-black text-slate-950">
              Check Your Token
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Enter the 10-digit mobile number you used during OPD registration.
            </p>
          </div>

          <form onSubmit={handleLookup} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="phone"
                className="block text-xs font-bold uppercase tracking-wider text-slate-600"
              >
                Mobile Number
              </label>
              <div className="relative mt-2">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 text-sm font-semibold">
                  +91
                </div>
                <input
                  id="phone"
                  type="tel"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, ""));
                    setError("");
                  }}
                  placeholder="9876543210"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3.5 pl-14 pr-4 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
                  disabled={loading}
                  autoFocus
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
                <p>{error}</p>
                {error.includes("No active record") && (
                  <Link
                    href="/verify"
                    className="mt-2 inline-block font-bold text-blue-600 underline hover:text-blue-700"
                  >
                    Register for an OPD token now →
                  </Link>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || phone.length < 10}
              className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Searching Records...
                </span>
              ) : (
                "Find My Queue Status →"
              )}
            </button>
          </form>

          <div className="mt-8 border-t border-slate-100 pt-6 text-center">
            <p className="text-xs text-slate-400">
              New to the hospital today?{" "}
              <Link
                href="/verify"
                className="font-bold text-blue-600 hover:underline"
              >
                Get a new token
              </Link>
            </p>
          </div>
        </div>

        {/* SECURITY & PRIVACY NOTE */}
        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 text-center text-xs text-slate-500">
          🔒 Only verified records matching your registered mobile number are
          accessible. Private medical information is never publicly displayed.
        </div>
      </div>
    </main>
  );
}