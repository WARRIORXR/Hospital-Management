"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  clearPortalSession,
  portalFetch,
  useHydrated,
  usePortalSession,
  type PortalSession,
} from "@/lib/auth";

type Doctor = {
  id: number;
  name: string;
  specialization: string | null;
  room_number: string;
  is_available: boolean;
};

type DepartmentRow = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  timing: string | null;
  doctors: Doctor[];
};

export default function HospitalPage() {
  const router = useRouter();
  const { t } = useI18n();
  const session = usePortalSession();
  const hydrated = useHydrated();

  const [data, setData] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const [showAddDept, setShowAddDept] = useState(false);
  const [newDept, setNewDept] = useState({ code: "", name: "", description: "" });

  const [timingDrafts, setTimingDrafts] = useState<Record<number, string>>({});

  const [addDoctorFor, setAddDoctorFor] = useState<number | null>(null);
  const [newDoctor, setNewDoctor] = useState({
    name: "",
    specialization: "",
    room_number: "",
  });

  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [doctorDraft, setDoctorDraft] = useState({
    name: "",
    specialization: "",
    room_number: "",
  });

  const allowed: PortalSession | null =
    session && (session.role === "hospital" || session.role === "admin") ? session : null;

  const load = useCallback(async () => {
    try {
      const response = await portalFetch("/hospital/overview");
      if (response.status === 401 || response.status === 403) {
        clearPortalSession();
        router.replace("/login/hospital");
        return;
      }
      if (!response.ok) throw new Error();
      const rows: DepartmentRow[] = await response.json();
      setData(rows);
      setError("");
      setTimingDrafts((drafts) => {
        const next = { ...drafts };
        for (const row of rows) {
          if (next[row.id] === undefined && row.timing) next[row.id] = row.timing;
        }
        return next;
      });
    } catch {
      setError(t("hospital.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    if (!hydrated) return;
    if (!allowed) {
      router.replace("/login/hospital");
      return;
    }
    void load();
  }, [hydrated, allowed, router, load]);

  async function action(
    key: string,
    path: string,
    method: "POST" | "PUT" | "PATCH",
    body?: unknown
  ): Promise<boolean> {
    setBusyKey(key);
    try {
      const response = await portalFetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 401 || response.status === 403) {
        router.replace("/login/hospital");
        return false;
      }
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        setError(
          typeof detail?.detail === "string" ? detail.detail : t("hospital.errorSave")
        );
        return false;
      }
      setError("");
      return true;
    } catch {
      setError(t("hospital.errorSave"));
      return false;
    } finally {
      setBusyKey("");
    }
  }

  function signOut() {
    clearPortalSession();
    router.replace("/login/hospital");
  }

  return (
    <main className="min-h-screen bg-[#f6f9fc] px-6 py-10">
      <div className="mx-auto max-w-5xl">
        {/* HEADER */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-blue-600">
              {t("login.kicker")}
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950">
              {t("hospital.title")}
            </h1>
            <p className="mt-2 text-slate-500">{t("hospital.subtitle")}</p>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {allowed && (
              <span className="hidden text-sm font-semibold text-slate-500 sm:inline">
                {allowed.name}
              </span>
            )}
            <Link
              href="/"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-600"
            >
              {t("common.backHome")}
            </Link>
            <button
              onClick={signOut}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-rose-300 hover:text-rose-600"
            >
              {t("login.signOut")}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
            {error}
          </div>
        )}

        {/* ADD DEPARTMENT */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!showAddDept ? (
            <button
              onClick={() => setShowAddDept(true)}
              className="text-sm font-bold text-blue-600 hover:text-blue-700"
            >
              + {t("hospital.addDepartment")}
            </button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                placeholder={t("hospital.codePlaceholder")}
                value={newDept.code}
                onChange={(e) =>
                  setNewDept({ ...newDept, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })
                }
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              <input
                placeholder={t("hospital.name")}
                value={newDept.name}
                onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              <input
                placeholder={t("hospital.description")}
                value={newDept.description}
                onChange={(e) => setNewDept({ ...newDept, description: e.target.value })}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              <div className="flex gap-2 sm:col-span-3">
                <button
                  disabled={busyKey === "add-dept" || !newDept.code || !newDept.name}
                  onClick={async () => {
                    const ok = await action(
                      "add-dept",
                      "/hospital/departments",
                      "POST",
                      newDept
                    );
                    if (ok) {
                      setNewDept({ code: "", name: "", description: "" });
                      setShowAddDept(false);
                      void load();
                    }
                  }}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {t("hospital.save")}
                </button>
                <button
                  onClick={() => setShowAddDept(false)}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:border-slate-300"
                >
                  {t("hospital.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* DEPARTMENTS */}
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
          {t("hospital.departments")}
        </p>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
            {t("common.loading")}
          </div>
        ) : (
          <div className="space-y-4">
            {data.map((dept) => (
              <div
                key={dept.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-slate-900">{dept.name}</h2>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      {dept.code}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        dept.is_active
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {dept.is_active ? t("hospital.active") : t("hospital.inactive")}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        await action(
                          `dept-${dept.id}`,
                          `/hospital/departments/${dept.id}`,
                          "PUT",
                          { is_active: !dept.is_active }
                        );
                        void load();
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
                    >
                      {dept.is_active ? t("hospital.deactivate") : t("hospital.activate")}
                    </button>
                  </div>
                </div>

                {dept.description && (
                  <p className="mt-1 text-sm text-slate-500">{dept.description}</p>
                )}

                {/* OPD HOURS */}
                <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("hospital.timing")}
                    </label>
                    <input
                      value={timingDrafts[dept.id] ?? ""}
                      disabled={dept.doctors.length === 0}
                      onChange={(e) =>
                        setTimingDrafts({ ...timingDrafts, [dept.id]: e.target.value })
                      }
                      placeholder={t("hospital.timingPlaceholder")}
                      className="mt-1.5 w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                    />
                  </div>
                  <button
                    disabled={
                      busyKey === `timing-${dept.id}` ||
                      !timingDrafts[dept.id] ||
                      timingDrafts[dept.id] === dept.timing ||
                      dept.doctors.length === 0
                    }
                    onClick={async () => {
                      const ok = await action(
                        `timing-${dept.id}`,
                        `/hospital/departments/${dept.id}/schedule`,
                        "PUT",
                        { timing: timingDrafts[dept.id] }
                      );
                      if (ok) void load();
                    }}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {t("hospital.save")}
                  </button>
                  {dept.doctors.length === 0 && (
                    <span className="text-xs font-medium text-amber-600">
                      {t("hospital.needDoctorForTiming")}
                    </span>
                  )}
                </div>

                {/* DOCTORS */}
                <div className="mt-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("hospital.doctors")}
                    </p>
                    <button
                      onClick={() => {
                        setAddDoctorFor(addDoctorFor === dept.id ? null : dept.id);
                        setNewDoctor({ name: "", specialization: "", room_number: "" });
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700"
                    >
                      + {t("hospital.addDoctor")}
                    </button>
                  </div>

                  {dept.doctors.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">{t("hospital.noDoctors")}</p>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {dept.doctors.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
                        >
                          <div>
                            <p className="text-sm font-bold text-slate-900">{doc.name}</p>
                            <p className="text-xs text-slate-500">
                              {doc.specialization || "—"} · {t("hospital.room")} {doc.room_number}
                            </p>
                            <span
                              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                doc.is_available
                                  ? "bg-emerald-50 text-emerald-600"
                                  : "bg-amber-50 text-amber-600"
                              }`}
                            >
                              {doc.is_available ? t("hospital.available") : t("status.onBreak")}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={async () => {
                                await action(
                                  `toggle-${doc.id}`,
                                  `/doctors/${doc.id}/toggle-availability`,
                                  "PUT"
                                );
                                void load();
                              }}
                              className="rounded-lg border border-slate-200 px-3 py-1 text-[11px] font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
                            >
                              {doc.is_available ? t("hospital.markBreak") : t("hospital.markAvailable")}
                            </button>
                            <button
                              onClick={() => {
                                setEditingDoctor(doc);
                                setDoctorDraft({
                                  name: doc.name,
                                  specialization: doc.specialization ?? "",
                                  room_number: doc.room_number,
                                });
                              }}
                              className="rounded-lg border border-slate-200 px-3 py-1 text-[11px] font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
                            >
                              {t("hospital.edit")}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ADD DOCTOR FORM */}
                  {addDoctorFor === dept.id && (
                    <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-4">
                      <input
                        placeholder={t("hospital.doctorName")}
                        value={newDoctor.name}
                        onChange={(e) => setNewDoctor({ ...newDoctor, name: e.target.value })}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <input
                        placeholder={t("hospital.specialization")}
                        value={newDoctor.specialization}
                        onChange={(e) =>
                          setNewDoctor({ ...newDoctor, specialization: e.target.value })
                        }
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <input
                        placeholder={t("hospital.room")}
                        value={newDoctor.room_number}
                        onChange={(e) =>
                          setNewDoctor({ ...newDoctor, room_number: e.target.value })
                        }
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <button
                        disabled={busyKey === `doctor-${dept.id}` || !newDoctor.name || !newDoctor.room_number}
                        onClick={async () => {
                          const ok = await action(
                            `doctor-${dept.id}`,
                            "/hospital/doctors",
                            "POST",
                            { ...newDoctor, department_id: dept.id }
                          );
                          if (ok) {
                            setAddDoctorFor(null);
                            void load();
                          }
                        }}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                      >
                        {t("hospital.save")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* EDIT DOCTOR INLINE */}
        {editingDoctor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-6">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-slate-900">{t("hospital.editDoctor")}</h3>
              <div className="mt-4 space-y-3">
                <input
                  value={doctorDraft.name}
                  onChange={(e) => setDoctorDraft({ ...doctorDraft, name: e.target.value })}
                  placeholder={t("hospital.doctorName")}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
                <input
                  value={doctorDraft.specialization}
                  onChange={(e) =>
                    setDoctorDraft({ ...doctorDraft, specialization: e.target.value })
                  }
                  placeholder={t("hospital.specialization")}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
                <input
                  value={doctorDraft.room_number}
                  onChange={(e) =>
                    setDoctorDraft({ ...doctorDraft, room_number: e.target.value })
                  }
                  placeholder={t("hospital.room")}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
              <div className="mt-5 flex gap-2">
                <button
                  disabled={busyKey === `edit-doc-${editingDoctor.id}` || !doctorDraft.name || !doctorDraft.room_number}
                  onClick={async () => {
                    const ok = await action(
                      `edit-doc-${editingDoctor.id}`,
                      `/hospital/doctors/${editingDoctor.id}`,
                      "PUT",
                      doctorDraft
                    );
                    if (ok) {
                      setEditingDoctor(null);
                      void load();
                    }
                  }}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {t("hospital.save")}
                </button>
                <button
                  onClick={() => setEditingDoctor(null)}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:border-slate-300"
                >
                  {t("hospital.cancel")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
