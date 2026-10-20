"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  LOGIN_ROUTES,
  ROLE_ROUTES,
  clearPatientSession,
  clearPortalSession,
  patientLandingRoute,
  useHydrated,
  usePatientSession,
  usePortalSession,
  type PortalRole,
} from "@/lib/auth";

type SectionCard = {
  key: "patient" | PortalRole;
  badge: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  criteriaKeys: readonly [TranslationKey, TranslationKey];
  accent: { chip: string; badge: string };
};

const SECTIONS: SectionCard[] = [
  {
    key: "patient",
    badge: "🧑‍🦽",
    titleKey: "sections.patient.title",
    descriptionKey: "sections.patient.description",
    criteriaKeys: ["sections.patient.criterion1", "sections.patient.criterion2"],
    accent: {
      chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
      badge: "bg-emerald-100 text-emerald-700",
    },
  },
  {
    key: "staff",
    badge: "🩺",
    titleKey: "sections.staff.title",
    descriptionKey: "sections.staff.description",
    criteriaKeys: ["sections.staff.criterion1", "sections.staff.criterion2"],
    accent: {
      chip: "border-blue-200 bg-blue-50 text-blue-700",
      badge: "bg-blue-100 text-blue-700",
    },
  },
  {
    key: "hospital",
    badge: "🏥",
    titleKey: "sections.hospital.title",
    descriptionKey: "sections.hospital.description",
    criteriaKeys: ["sections.hospital.criterion1", "sections.hospital.criterion2"],
    accent: {
      chip: "border-violet-200 bg-violet-50 text-violet-700",
      badge: "bg-violet-100 text-violet-700",
    },
  },
  {
    key: "admin",
    badge: "📊",
    titleKey: "sections.admin.title",
    descriptionKey: "sections.admin.description",
    criteriaKeys: ["sections.admin.criterion1", "sections.admin.criterion2"],
    accent: {
      chip: "border-slate-300 bg-slate-100 text-slate-700",
      badge: "bg-slate-900 text-white",
    },
  },
];

export default function HomePage() {
  const router = useRouter();
  const { t } = useI18n();
  const hydrated = useHydrated();
  const portalSession = usePortalSession();
  const patientSession = usePatientSession();

  const [busy, setBusy] = useState(false);

  // Until the stored sessions are readable (SSR + hydrating render) every card
  // is shown in its signed-out state, so nothing flashes a wrong role.
  const activePortal = hydrated ? portalSession : null;
  const activePatient = hydrated ? patientSession : null;

  async function openPatientQueue() {
    if (!activePatient) return;
    setBusy(true);
    try {
      router.push(await patientLandingRoute(activePatient.phone));
    } finally {
      setBusy(false);
    }
  }

  function signOutPortal() {
    clearPortalSession();
  }

  function signOutPatient() {
    clearPatientSession();
  }

  return (
    <main className="min-h-screen bg-[#f6f9fc] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-black text-white shadow-lg shadow-blue-200">
              Q
            </div>
            <div>
              <p className="text-lg font-extrabold tracking-tight">QueueLess</p>
              <p className="hidden text-[10px] font-semibold uppercase tracking-widest text-slate-400 sm:block">
                {t("brand.tagline")}
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/opds"
              className="text-xs font-semibold text-slate-600 transition hover:text-blue-600 hidden sm:inline"
            >
              🏥 Live OPD Board
            </Link>
            <Link
              href="/check-token"
              className="text-xs font-semibold text-blue-600 transition hover:text-blue-700 hidden sm:inline"
            >
              🔍 Check Token
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
            {t("sections.kicker")}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            {t("sections.title")}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-500">
            {t("sections.subtitle")}
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {SECTIONS.map((section) => {
            const isPortalCard = section.key !== "patient";
            const role = isPortalCard ? (section.key as PortalRole) : null;
            const signedInPortal = role && activePortal?.role === role;
            const signedInPatient = section.key === "patient" && Boolean(activePatient);

            return (
              <section
                key={section.key}
                className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl text-xl ${section.accent.badge}`}
                  >
                    {section.badge}
                  </div>

                  {signedInPortal && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      {t("sections.signedInAs", { name: activePortal?.name || role || "" })}
                    </span>
                  )}
                  {signedInPatient && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      {t("sections.patientSignedIn", { phone: activePatient?.phone || "" })}
                    </span>
                  )}
                </div>

                <h2 className="mt-4 text-xl font-extrabold tracking-tight text-slate-950">
                  {t(section.titleKey)}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {t(section.descriptionKey)}
                </p>

                <ul className="mt-4 space-y-2">
                  {section.criteriaKeys.map((criterionKey) => (
                    <li
                      key={criterionKey}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${section.accent.chip}`}
                    >
                      {t(criterionKey)}
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex flex-col gap-2">
                  {section.key === "patient" ? (
                    activePatient ? (
                      <>
                        <button
                          type="button"
                          onClick={openPatientQueue}
                          disabled={busy}
                          className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {busy ? t("common.loading") : t("sections.patientContinue")}
                        </button>
                        <button
                          type="button"
                          onClick={signOutPatient}
                          className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                        >
                          {t("login.signOut")}
                        </button>
                      </>
                    ) : (
                      <>
                        <Link
                          href="/login/patient"
                          className="rounded-xl bg-emerald-600 px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
                        >
                          {t("sections.patient.cta")}
                        </Link>
                        <Link
                          href="/check-token"
                          className="rounded-xl border border-slate-200 px-5 py-2.5 text-center text-xs font-bold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
                        >
                          {t("sections.patient.secondary")}
                        </Link>
                      </>
                    )
                  ) : signedInPortal && role ? (
                    <>
                      <Link
                        href={ROLE_ROUTES[role]}
                        className="rounded-xl bg-blue-600 px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                      >
                        {t("sections.continue")}
                      </Link>
                      <button
                        type="button"
                        onClick={signOutPortal}
                        className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                      >
                        {t("login.signOut")}
                      </button>
                    </>
                  ) : (
                    <Link
                      href={role ? LOGIN_ROUTES[role] : "/login/patient"}
                      className="rounded-xl bg-blue-600 px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                    >
                      {t(
                        section.key === "staff"
                          ? "sections.staff.cta"
                          : section.key === "hospital"
                            ? "sections.hospital.cta"
                            : "sections.admin.cta"
                      )}
                    </Link>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-5 text-slate-400">
          {t("sections.issuedNote")}
        </p>
      </div>
    </main>
  );
}
