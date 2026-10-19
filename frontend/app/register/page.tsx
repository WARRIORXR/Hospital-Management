"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { clearPatientSession, patientFetch } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [verifiedPhone, setVerifiedPhone] = useState("");

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [department, setDepartment] = useState("");
  const [priority, setPriority] = useState("regular");
  const [symptoms, setSymptoms] = useState("");

  const [errors, setErrors] = useState<{
    name?: string;
    age?: string;
    department?: string;
  }>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

  // --------------------------------------------------
  // CHECK MOBILE VERIFICATION
  // --------------------------------------------------

  useEffect(() => {
    const phoneVerified =
      sessionStorage.getItem("phoneVerified");

    const phone =
      sessionStorage.getItem("verifiedPhone");

    if (phoneVerified !== "true" || !phone) {
      router.replace("/verify");
      return;
    }

    setVerifiedPhone(phone);
  }, [router]);

  // --------------------------------------------------
  // VALIDATION
  // --------------------------------------------------

  const validateForm = () => {
    const newErrors: {
      name?: string;
      age?: string;
      department?: string;
    } = {};

    if (!name.trim()) {
      newErrors.name = t("register.errorName");
    }

    if (!age) {
      newErrors.age = t("register.errorAge");
    } else if (
      Number(age) < 1 ||
      Number(age) > 120
    ) {
      newErrors.age = t("register.errorAgeValid");
    }

    if (!department) {
      newErrors.department = t("register.errorDepartment");
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  // --------------------------------------------------
  // SUBMIT REGISTRATION
  // --------------------------------------------------

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    const isValid = validateForm();

    if (!isValid) {
      return;
    }

    setServerError("");
    setIsSubmitting(true);

    try {
      const response = await patientFetch("/patients", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          name: name.trim(),
          age: Number(age),
          phone: verifiedPhone,
          department: department,
          priority: priority,
          symptoms: symptoms.trim() || null,
        }),
      });

      const data =
        await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 401) {
          // The OTP session expired — verify again, then come back.
          clearPatientSession();
          router.replace(`/verify?phone=${verifiedPhone}`);
          return;
        }

        const detail = data?.detail;

        // 409: this mobile number already holds a live token.
        if (
          response.status === 409 &&
          detail &&
          typeof detail === "object" &&
          typeof detail.patient_id === "number"
        ) {
          sessionStorage.setItem("phoneVerified", "true");
          sessionStorage.setItem("verifiedPhone", verifiedPhone);
          router.push(`/queue/${detail.patient_id}`);
          return;
        }

        throw new Error(
          typeof detail === "string"
            ? detail
            : t("register.errorGeneric")
        );
      }

      router.push(`/queue/${data.id}`);

    } catch (error) {
      console.error(
        "Registration error:",
        error
      );

      setServerError(
        error instanceof Error && error.message
          ? error.message
          : t("register.errorGeneric")
      );

    } finally {
      setIsSubmitting(false);
    }
  };

  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

  return (
    <main className="min-h-screen bg-[#f6f9fc] px-6 py-10">

      <div className="mx-auto max-w-3xl">

        {/* HEADER */}

        <div className="mb-8">

          <p className="text-sm font-bold uppercase tracking-widest text-blue-600">
            QUEUELESS
          </p>

          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-950">
            {t("register.title")}
          </h1>

          <p className="mt-3 text-slate-500">
            {t("register.subtitle")}
          </p>

          <div className="mt-4">
            <LanguageSwitcher />
          </div>

        </div>

        {/* REGISTRATION CARD */}

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/50">

          {/* VERIFIED MOBILE */}

          <div className="border-b border-slate-100 bg-emerald-50 px-6 py-5 sm:px-8">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                ✓
              </div>

              <div>

                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                  {t("register.verified")}
                </p>

                <p className="mt-1 text-sm font-semibold text-slate-800">
                  +91 {verifiedPhone}
                </p>

              </div>

            </div>

          </div>

          {/* FORM */}

          <form
            onSubmit={handleSubmit}
            className="space-y-6 p-6 sm:p-8"
          >

            {/* NAME */}

            <div>

              <label
                htmlFor="name"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                {t("register.nameLabel")}
              </label>

              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
                placeholder={t("register.namePlaceholder")}
                className={`w-full rounded-xl border ${
                  errors.name
                    ? "border-red-400"
                    : "border-slate-200"
                } bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100`}
              />

              {errors.name && (
                <p className="mt-1.5 text-xs font-medium text-red-500">
                  {errors.name}
                </p>
              )}

            </div>

            {/* AGE */}

            <div>

              <label
                htmlFor="age"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                {t("register.ageLabel")}
              </label>

              <input
                id="age"
                type="number"
                min="1"
                max="120"
                value={age}
                onChange={(e) =>
                  setAge(e.target.value)
                }
                placeholder={t("register.agePlaceholder")}
                className={`w-full rounded-xl border ${
                  errors.age
                    ? "border-red-400"
                    : "border-slate-200"
                } bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100`}
              />

              {errors.age && (
                <p className="mt-1.5 text-xs font-medium text-red-500">
                  {errors.age}
                </p>
              )}

            </div>

            {/* DEPARTMENT */}

            <div>

              <label
                htmlFor="department"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                {t("register.departmentLabel")}
              </label>

              <select
                id="department"
                value={department}
                onChange={(e) =>
                  setDepartment(e.target.value)
                }
                className={`w-full rounded-xl border ${
                  errors.department
                    ? "border-red-400"
                    : "border-slate-200"
                } bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100`}
              >

                <option value="">
                  {t("register.departmentPlaceholder")}
                </option>

                <option value="general">
                  {t("dept.general")}
                </option>

                <option value="dental">
                  {t("dept.dental")}
                </option>

                <option value="cardiology">
                  {t("dept.cardiology")}
                </option>

                <option value="gastro">
                  {t("dept.gastro")}
                </option>

                <option value="orthopedics">
                  {t("dept.orthopedics")}
                </option>

                <option value="neurology">
                  {t("dept.neurology")}
                </option>

                <option value="emergency">
                  {t("dept.emergency")}
                </option>

                <option value="surgery">
                  {t("dept.surgery")}
                </option>

                <option value="general_medicine">
                  {t("dept.general_medicine")}
                </option>

                <option value="icu">
                  {t("dept.icu")}
                </option>

              </select>

              {errors.department && (
                <p className="mt-1.5 text-xs font-medium text-red-500">
                  {errors.department}
                </p>
              )}

            </div>

            {/* PRIORITY */}

            <div>

              <label
                htmlFor="priority"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                {t("register.priorityLabel")}
              </label>

              <select
                id="priority"
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value)
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >

                <option value="regular">
                  {t("priority.regular")}
                </option>

                <option value="emergency">
                  {t("priority.emergency")}
                </option>

                <option value="elderly">
                  {t("priority.elderly")}
                </option>

                <option value="pregnant">
                  {t("priority.pregnant")}
                </option>

                <option value="follow_up">
                  {t("priority.follow_up")}
                </option>

              </select>

              <p className="mt-2 text-xs leading-5 text-slate-400">
                {t("register.priorityNote")}
              </p>

            </div>

            {/* SYMPTOMS */}

            <div>

              <label
                htmlFor="symptoms"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                {t("register.symptomsLabel")}
                <span className="ml-1 font-normal text-slate-400">
                  {t("register.optional")}
                </span>
              </label>

              <textarea
                id="symptoms"
                value={symptoms}
                onChange={(e) =>
                  setSymptoms(e.target.value)
                }
                rows={4}
                placeholder={t("register.symptomsPlaceholder")}
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />

            </div>

            {/* SERVER ERROR */}

            {serverError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">

                <p className="text-sm font-medium text-red-600">
                  {serverError}
                </p>

              </div>
            )}

            {/* SUBMIT */}

            <button
              type="submit"
              disabled={
                isSubmitting || !verifiedPhone
              }
              className="w-full rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
            >

              {isSubmitting
                ? t("register.submitting")
                : t("register.submit")}

            </button>

            <p className="text-center text-xs text-slate-400">
              {t("register.linkNote")}
            </p>

          </form>

        </div>

        {/* FOOTER */}

        <div className="mt-5 text-center text-xs text-slate-400">
          {t("register.security")}
        </div>

      </div>

    </main>
  );
}