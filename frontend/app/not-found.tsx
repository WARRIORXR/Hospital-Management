"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Static-export 404 page that doubles as a deep-link fallback.
 *
 * GitHub Pages serves 404.html for unknown URLs, and static exports emit no
 * HTML for dynamically addressed routes (e.g. /queue/42). This component
 * reads the real URL and routes back into the app so patient deep links
 * survive a static hosting environment.
 */
export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    const pathname = window.location.pathname.replace(/\/+$/, "");
    const segments = pathname.split("/").filter(Boolean);
    const queueIndex = segments.lastIndexOf("queue");

    if (queueIndex !== -1 && queueIndex + 1 < segments.length) {
      const id = segments[queueIndex + 1];
      if (/^\d+$/.test(id) || id === "active") {
        router.replace(`/queue/${id}`);
        return;
      }
    }

    if (segments[segments.length - 1] === "register") {
      router.replace("/register");
      return;
    }

    if (segments[segments.length - 1] === "verify") {
      router.replace("/verify");
      return;
    }
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f6f9fc] px-6 text-center">
      <p className="text-6xl font-black text-slate-200">404</p>

      <h1 className="mt-4 text-2xl font-extrabold text-slate-950">
        Page not found
      </h1>

      <p className="mt-2 max-w-sm text-sm text-slate-500">
        This link does not exist. If you followed a queue link, open your token
        from the home page with your mobile number.
      </p>

      <Link
        href="/"
        className="mt-6 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
      >
        ← Back to Home
      </Link>
    </main>
  );
}
