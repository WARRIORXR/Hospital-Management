"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  LOGIN_ROUTES,
  ROLE_ROUTES,
  clearPatientSession,
  patientLandingRoute,
  setPortalSession,
  useHydrated,
  usePatientSession,
  usePortalSession,
  type PortalRole,
} from "@/lib/auth";

const PORTAL_SECTIONS = ["admin", "hospital", "staff"] as const;

type SectionKey = "admin" | "hospital" | "staff" | "patient";

const TITLE_KEYS = {
  admin: "login.adminTitle",
  hospital: "login.hospitalTitle",
  staff: "login.staffTitle",
  patient: "login.patientTitle",
} as const;

const SUBTITLE_KEYS = {
  admin: "login.adminSubtitle",
  hospital: "login.hospitalSubtitle",
  staff: "login.staffSubtitle",
  patient: "login.patientSubtitle",
} as const;

export default function SectionLoginClient() {
  const router = useRouter();
  const params = useParams<{ section?: string }>();
  const { t } = useI18n();

  const rawSection = params?.section ?? "";
  const isPortal = (PORTAL_SECTIONS as readonly string[]).includes(rawSection);
  const isValid = isPortal || rawSection === "patient";
  const section = (isValid ? rawSection : "patient") as SectionKey;

  const session = usePortalSession();
  const patientSession = usePatientSession();
  const hydrated = useHydrated();

  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mismatchRole, setMismatchRole] = useState<PortalRole | null>(null);

  useEffect(() => {
    if (!isValid) {
      router.replace("/");
      return;
    }
    // Wait for the stored session before bouncing a signed-in employee away.
    if (hydrated && session && isPortal && session.role === section) {
      router.replace(ROLE_ROUTES[session.role]);
    }
  }, [hydrated, isValid, isPortal, section, session, router]);

  async function continueAsPatient() {
    if (!patientSession) return;
    setBusy(true);
    try {
      router.push(await patientLandingRoute(patientSession.phone));
    } finally {
      setBusy(false);
    }
  }

  function signOutPatient() {
    clearPatientSession();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMismatchRole(null);

    if (!code.trim() || pin.length < 4) {
      setError(t("login.errorInvalid"));
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(apiUrl("/auth/staff-login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_code: code.trim(), pin }),
      });

      const data = await response.json().catch(() => null);

      if (response.status === 429) {
        setError(t("login.errorRateLimited"));
        return;
      }

      if (!response.ok) {
        setError(t("login.errorInvalid"));
        return;
      }

      const role = data?.role as PortalRole;

      if (role !== section) {
        setMismatchRole(role);
        return;
      }

      setPortalSession({
        role,
        name: typeof data?.name === "string" ? data.name : "",
        token: data.access_token,
      });
      router.replace(ROLE_ROUTES[role]);
    } catch {
      setError(t("login.errorUnreachable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f9fc] px-6 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-slate-600 transition hover:text-blue-600">
            {t("common.backHome")}
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
          <div className="border-b border-slate-100 bg-blue-50/60 px-8 py-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-xl font-black text-white shadow-lg shadow-blue-200">
              Q
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
              {t("login.kicker")}
            </p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">
              {t(TITLE_KEYS[section])}
            </h1>
            <p className="mt-2 text-sm text-slate-500">{t(SUBTITLE_KEYS[section])}</p>
          </div>

          {section === "patient" ? (
            <div className="px-8 py-8">
              {patientSession && (
                <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-900">
                  <p className="text-sm font-bold">
                    {t("login.patientSignedIn", { phone: patientSession.phone })}
                  </p>
                  <button
                    type="button"
                    onClick={continueAsPatient}
                    disabled={busy}
                    className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {busy ? t("common.loading") : t("login.continueToken")}
                  </button>
                  <button
                    type="button"
                    onClick={signOutPatient}
                    className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50"
                  >
                    {t("login.signOut")}
                  </button>
                </div>
              )}

              <p className="text-sm leading-6 text-slate-600">{t("login.patientHint")}</p>
              <Link
                href="/verify"
                className="mt-6 block w-full rounded-xl bg-blue-600 px-6 py-3.5 text-center text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
              >
                {t("login.patientCta")}
              </Link>
              <Link
                href="/check-token"
                className="mt-3 block w-full rounded-xl border border-slate-200 px-6 py-3.5 text-center text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-600"
              >
                {t("nav.checkToken")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 px-8 py-8">
              <div>
                <label htmlFor="employee-code" className="mb-2 block text-sm font-semibold text-slate-700">
                  {t("login.employeeCode")}
                </label>
                <input
                  id="employee-code"
                  type="text"
                  autoComplete="username"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder={t("login.codePlaceholder")}
                  disabled={busy}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="pin" className="mb-2 block text-sm font-semibold text-slate-700">
                  {t("login.pin")}
                </label>
                <input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("login.pinPlaceholder")}
                  disabled={busy}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm tracking-[0.4em] text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
                  {error}
                </div>
              )}

              {mismatchRole && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p>
                    {t("login.roleMismatch", { role: t(`login.role.${mismatchRole}`) })}
                  </p>
                  <Link
                    href={LOGIN_ROUTES[mismatchRole]}
                    className="mt-2 inline-block font-bold text-blue-600 underline hover:text-blue-700"
                  >
                    {t("login.openSection", { section: t(`login.role.${mismatchRole}`) })}
                  </Link>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? t("login.signingIn") : t("login.submit")}
              </button>
            </form>
          )}
        </div>

        <div className="mt-5 text-center text-xs text-slate-400">
          {t(section === "patient" ? "login.patientSecurity" : "login.security")}
        </div>
      </div>
    </main>
  );
}
