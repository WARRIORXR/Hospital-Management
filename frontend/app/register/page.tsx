"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();

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
      newErrors.name = "Please enter your name.";
    }

    if (!age) {
      newErrors.age = "Please enter your age.";
    } else if (
      Number(age) < 1 ||
      Number(age) > 120
    ) {
      newErrors.age = "Please enter a valid age.";
    }

    if (!department) {
      newErrors.department =
        "Please select a department.";
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
      const response = await fetch(
        apiUrl("/patients"),
        {
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
        }
      );

      if (!response.ok) {
        const errorData =
          await response.json().catch(() => null);

        console.error(
          "Backend error:",
          errorData
        );

        throw new Error(
          `Backend returned status ${response.status}`
        );
      }

      const data = await response.json();

      console.log(
        "Patient created successfully:",
        data
      );

      router.push(`/queue/${data.id}`);

    } catch (error) {
      console.error(
        "Registration error:",
        error
      );

      setServerError(
        "Unable to create your token. Please make sure the QueueLess server is running."
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
            Get Your Token
          </h1>

          <p className="mt-3 text-slate-500">
            Your mobile number has been verified.
            Complete your details to join the queue.
          </p>

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
                  Mobile Verified
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
                Full Name
              </label>

              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
                placeholder="Enter your full name"
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
                Age
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
                placeholder="Enter age"
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
                Department
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
                  Select department
                </option>

                <option value="general">
                  General
                </option>

                <option value="dental">
                  Dental
                </option>

                <option value="cardiology">
                  Cardiology
                </option>

                <option value="gastro">
                  Gastro
                </option>

                <option value="orthopedics">
                  Orthopedics
                </option>

                <option value="neurology">
                  Neurology
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
                Priority
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
                  Regular
                </option>

                <option value="emergency">
                  Emergency
                </option>

                <option value="elderly">
                  Elderly
                </option>

                <option value="pregnant">
                  Pregnant
                </option>

                <option value="follow_up">
                  Follow-up
                </option>

              </select>

              <p className="mt-2 text-xs leading-5 text-slate-400">
                Priority should follow the hospital's
                authorized workflow rules.
              </p>

            </div>

            {/* SYMPTOMS */}

            <div>

              <label
                htmlFor="symptoms"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Symptoms
                <span className="ml-1 font-normal text-slate-400">
                  (Optional)
                </span>
              </label>

              <textarea
                id="symptoms"
                value={symptoms}
                onChange={(e) =>
                  setSymptoms(e.target.value)
                }
                rows={4}
                placeholder="Briefly describe your symptoms"
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
                ? "Creating Your Token..."
                : "Get My Token"}

            </button>

            <p className="text-center text-xs text-slate-400">
              Your verified mobile number will be linked
              to this queue registration.
            </p>

          </form>

        </div>

        {/* FOOTER */}

        <div className="mt-5 text-center text-xs text-slate-400">
          🔒 Your information is securely handled by QueueLess.
        </div>

      </div>

    </main>
  );
}