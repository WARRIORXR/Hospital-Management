import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LanguageProvider } from "@/lib/i18n";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://queueless-web.onrender.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "QueueLess — Smart Hospital Queue & OPD Flow",
    template: "%s | QueueLess",
  },
  description:
    "Real-time OPD queues, priority-aware digital tokens, and live wait times for hospital outpatients.",
  applicationName: "QueueLess",
  openGraph: {
    title: "QueueLess — Smart Hospital Queue & OPD Flow",
    description:
      "Know the queue before you arrive: live OPD boards, priority-aware digital tokens, and real-time wait estimates for hospital outpatients.",
    url: "/",
    siteName: "QueueLess",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "QueueLess — Smart Hospital Queue & OPD Flow",
    description:
      "Know the queue before you arrive: live OPD boards, priority-aware digital tokens, and real-time wait estimates.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      style={{ colorScheme: "light" }}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
