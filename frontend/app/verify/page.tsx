"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { patientLandingRoute, setPatientSession } from "@/lib/auth";

const RESEND_COOLDOWN_SECONDS = 30;

export default function VerifyPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f6f9fc] px-6 py-10" />}>
      <VerifyFlow />
    </Suspense>
  );
}

function VerifyFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  // ?phone=... (from Check Token) pre-fills the number to verify.
  const [phone, setPhone] = useState(() => {
    const preset = searchParams.get("phone") ?? "";
    return /^[0-9]{10}$/.test(preset) ? preset : "";
  });
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (resendIn <= 0) return;

    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function requestOtp() {
    setError("");
    setMessage("");

    if (!/^[0-9]{10}$/.test(phone)) {
      setError(t("verify.errorPhone"));
      return;
    }

    setSending(true);

    try {
      const response = await fetch(apiUrl("/auth/request-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === "string" ? data.detail : t("verify.errorSend")
        );
      }

      setOtpSent(true);
      setOtp("");
      setDevCode(typeof data?.dev_code === "string" ? data.dev_code : "");
      setMessage(t("verify.sentNotice"));
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("verify.errorUnreachable")
      );
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyOtp() {
    setError("");
    setMessage("");

    if (!otp) {
      setError(t("verify.errorEnterOtp"));
      return;
    }

    setVerifying(true);

    try {
      const response = await fetch(apiUrl("/auth/verify-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: otp }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === "string" ? data.detail : t("verify.errorVerify")
        );
      }

      sessionStorage.setItem("verifiedPhone", phone);
      sessionStorage.setItem("phoneVerified", "true");
      setPatientSession(phone, data.patient_token);

      // `?next=` (from Check Token) opens that token; otherwise an existing
      // visit reopens and a first-time patient continues to registration.
      const next = new URLSearchParams(window.location.search).get("next");
      if (next && next.startsWith("/queue/")) {
        router.push(next);
      } else {
        router.push(await patientLandingRoute(phone));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("verify.errorVerify"));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f9fc] px-6 py-10">
      <div className="mx-auto flex min-h-[85vh] max-w-md items-center justify-center">
        <div className="w-full">
          <div className="mb-8 text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-blue-600">
              QUEUELESS
            </p>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">
              {t("verify.title")}
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              {t("verify.subtitle")}
            </p>

            <div className="mt-4 flex justify-center">
              <LanguageSwitcher />
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8">
            {!otpSent && (
              <div>
                <label
                  htmlFor="phone"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  {t("verify.mobileLabel")}
                </label>

                <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                  <span className="flex items-center border-r border-slate-200 px-3 text-sm font-semibold text-slate-500">
                    +91
                  </span>

                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    maxLength={10}
                    placeholder="9876543210"
                    className="w-full px-4 py-3 text-sm outline-none"
                  />
                </div>

                <p className="mt-2 text-xs text-slate-400">
                  {t("verify.sendHint")}
                </p>

                <button
                  type="button"
                  onClick={requestOtp}
                  disabled={sending}
                  className="mt-6 w-full rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? t("verify.sending") : t("verify.sendOtp")}
                </button>
              </div>
            )}

            {otpSent && (
              <div>
                <div className="mb-6 rounded-xl bg-blue-50 p-4">
                  <p className="text-sm font-semibold text-blue-700">
                    {t("verify.sentTo", { phone })}
                  </p>

                  {devCode ? (
                    <p className="mt-1 text-xs text-blue-500">
                      {t("verify.devOtp", { code: devCode })}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-blue-500">
                      {t("verify.checkMessages")}
                    </p>
                  )}
                </div>

                <label
                  htmlFor="otp"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  {t("verify.otpLabel")}
                </label>

                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  maxLength={6}
                  placeholder={t("verify.otpPlaceholder")}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-lg font-bold tracking-[0.4em] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />

                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={verifying}
                  className="mt-6 w-full rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {verifying ? t("verify.verifying") : t("verify.verify")}
                </button>

                <button
                  type="button"
                  onClick={requestOtp}
                  disabled={sending || resendIn > 0}
                  className="mt-3 w-full rounded-xl px-6 py-2.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                >
                  {resendIn > 0
                    ? t("verify.resendIn", { seconds: resendIn })
                    : t("verify.resend")}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                    setDevCode("");
                    setMessage("");
                    setError("");
                    setResendIn(0);
                  }}
                  className="mt-1 w-full rounded-xl px-6 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  {t("verify.changeNumber")}
                </button>
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-600">{error}</p>
              </div>
            )}

            {message && !error && (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-sm font-medium text-emerald-600">{message}</p>
              </div>
            )}
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            {t("verify.security")}
          </p>
        </div>
      </div>
    </main>
  );
}
