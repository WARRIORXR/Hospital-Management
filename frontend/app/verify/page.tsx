"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VerifyPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");

  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSendOtp = () => {
    setError("");
    setMessage("");

    if (!/^[0-9]{10}$/.test(phone)) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    /*
      PROTOTYPE OTP

      In the real version:
      Mobile number
          ↓
      SMS provider
          ↓
      Real OTP
          ↓
      Patient enters OTP
    */

    setOtpSent(true);
    setMessage("OTP sent successfully. For prototype testing, use 123456.");
  };

  const handleVerifyOtp = () => {
    setError("");
    setMessage("");

    if (!otp) {
      setError("Please enter the OTP.");
      return;
    }

    if (otp !== "123456") {
      setError("Invalid OTP. Please try again.");
      return;
    }

    /*
      Verification successful.

      We temporarily store the verified phone number
      so the registration page can use it.
    */

    sessionStorage.setItem(
      "verifiedPhone",
      phone
    );

    sessionStorage.setItem(
      "phoneVerified",
      "true"
    );

    router.push("/register");
  };

  return (
    <main className="min-h-screen bg-[#f6f9fc] px-6 py-10">

      <div className="mx-auto flex min-h-[85vh] max-w-md items-center justify-center">

        <div className="w-full">

          {/* Brand */}

          <div className="mb-8 text-center">

            <p className="text-sm font-bold uppercase tracking-widest text-blue-600">
              QUEUELESS
            </p>

            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">
              Verify Your Mobile
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              Verify your mobile number before getting your
              hospital queue token.
            </p>

          </div>

          {/* Card */}

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8">

            {/* Mobile Number */}

            {!otpSent && (
              <div>

                <label
                  htmlFor="phone"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Mobile Number
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
                      setPhone(
                        e.target.value
                          .replace(/\D/g, "")
                          .slice(0, 10)
                      )
                    }
                    maxLength={10}
                    placeholder="Enter mobile number"
                    className="w-full px-4 py-3 text-sm outline-none"
                  />

                </div>

                <p className="mt-2 text-xs text-slate-400">
                  We'll send a verification code to this number.
                </p>

                <button
                  type="button"
                  onClick={handleSendOtp}
                  className="mt-6 w-full rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
                >
                  Send OTP
                </button>

              </div>
            )}

            {/* OTP */}

            {otpSent && (
              <div>

                <div className="mb-6 rounded-xl bg-blue-50 p-4">

                  <p className="text-sm font-semibold text-blue-700">
                    OTP sent to +91 {phone}
                  </p>

                  <p className="mt-1 text-xs text-blue-500">
                    Prototype OTP: 123456
                  </p>

                </div>

                <label
                  htmlFor="otp"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Enter OTP
                </label>

                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) =>
                    setOtp(
                      e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6)
                    )
                  }
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-lg font-bold tracking-[0.4em] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />

                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  className="mt-6 w-full rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
                >
                  Verify & Continue
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                    setMessage("");
                    setError("");
                  }}
                  className="mt-3 w-full rounded-xl px-6 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  Change Mobile Number
                </button>

              </div>
            )}

            {/* Error */}

            {error && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">

                <p className="text-sm font-medium text-red-600">
                  {error}
                </p>

              </div>
            )}

            {/* Message */}

            {message && !error && (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">

                <p className="text-sm font-medium text-emerald-600">
                  {message}
                </p>

              </div>
            )}

          </div>

          {/* Security */}

          <p className="mt-5 text-center text-xs text-slate-400">
            🔒 Your mobile number is securely handled by QueueLess.
          </p>

        </div>

      </div>

    </main>
  );
}