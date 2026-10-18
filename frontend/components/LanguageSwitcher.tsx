"use client";

import { LOCALES, LOCALE_LABELS, useI18n } from "@/lib/i18n";

export default function LanguageSwitcher({
  className = "",
}: {
  className?: string;
}) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("language.label")}
      className={`inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5 shadow-sm ${className}`}
    >
      {LOCALES.map((code) => {
        const active = locale === code;

        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={active}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
              active
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 hover:text-blue-600"
            }`}
          >
            {LOCALE_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
