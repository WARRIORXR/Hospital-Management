import type { Metadata } from "next";
import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How QueueLess handles patient mobile numbers and visit data: purpose, retention, and your rights.",
};

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "What we collect",
    body: [
      "Your 10-digit mobile number, your name, your age, the department you choose, an optional priority category, and any symptoms you choose to describe. A visit record (token number, department, status, and timestamps) is stored alongside it.",
      "No health records, diagnoses, prescriptions, or payment data are collected. The symptoms field is optional free text meant only to help staff prepare for your visit.",
    ],
  },
  {
    heading: "Why we collect it",
    body: [
      "The mobile number is your identity in the queue: it verifies you with a one-time password, opens your own token dashboard, lets staff call you at the right time, and lets you leave the queue. Your name, age, and symptoms are shown only to the staff of the department you registered with.",
    ],
  },
  {
    heading: "What the public can see",
    body: [
      "The public OPD board shows department names, doctor names, consultation rooms, timings, and queue length numbers. It never shows patient names, phone numbers, or reasons for visit. Your personal dashboard is unlocked only by verifying your own mobile number with an OTP.",
    ],
  },
  {
    heading: "How long we keep it",
    body: [
      "Visit records are retained for 90 days by default, after which they are permanently deleted (configurable by the hospital operator via the PATIENT_RETENTION_DAYS setting). The historical dataset shown on the admin dashboard is synthetic demo data, not real patient records.",
    ],
  },
  {
    heading: "Your rights (DPDP Act, 2023)",
    body: [
      "Under India's Digital Personal Data Protection Act, 2023 you may request access to your data, ask for corrections, ask for erasure before the retention period ends, and withdraw consent by leaving the queue and asking the hospital desk to remove your record. Registration itself is your consent to the processing described on this page.",
      "This deployment is a prototype. Before real patient data is used, the hospital operating this instance is responsible for consent notices, grievance redressal, and any DLT registration required for SMS senders in India.",
    ],
  },
  {
    heading: "Security",
    body: [
      "Sessions are short-lived signed tokens; employee portals use role-checked credentials and the API enforces them on every request, not just in the page. OTPs expire after 5 minutes, are limited to 5 verification attempts, and both sending and verifying are rate-limited per phone number and per network.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f6f9fc] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-semibold text-slate-500 transition hover:text-blue-600"
          >
            ← Back to Home
          </Link>

          <LanguageSwitcher />
        </div>

        <p className="text-sm font-bold uppercase tracking-widest text-blue-600">
          QUEUELESS
        </p>

        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-950">
          Privacy Policy
        </h1>

        <p className="mt-3 text-slate-500">
          Plain-language summary of what QueueLess stores, why, and for how long.
        </p>

        {/* Hindi summary */}
        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm leading-6 text-slate-700">
          <p className="font-bold text-slate-900">सारांश (हिन्दी)</p>
          <p className="mt-2">
            QueueLess आपका मोबाइल नंबर, नाम, उम्र, विभाग और (वैकल्पिक) लक्षण सुरक्षित
            रखता है ताकि कतार चल सके और आपका टोकन आपके ही नंबर से खुले। सार्वजनिक OPD
            बोर्ड पर मरीज़ों के नाम या नंबर कभी नहीं दिखते। रिकॉर्ड डिफ़ॉल्ट रूप से 90
            दिन बाद स्थायी रूप से हटा दिए जाते हैं। आप अस्पताल डेस्क से अपना डेटा देखने,
            सुधारने या मिटाने का अनुरोध कर सकते हैं (DPDP अधिनियम, 2023)।
          </p>
        </div>

        <div className="mt-8 space-y-4">
          {SECTIONS.map((section) => (
            <section
              key={section.heading}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-bold text-slate-900">
                {section.heading}
              </h2>

              <div className="mt-2 space-y-2">
                {section.body.map((paragraph, index) => (
                  <p key={index} className="text-sm leading-6 text-slate-600">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-8 text-center text-xs font-medium text-slate-500">
          Questions about this policy? Ask the hospital registration desk or the
          operator running this QueueLess instance.
        </p>
      </div>
    </main>
  );
}
