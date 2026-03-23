"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function StudentRegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    if (!name || !mail || !password) {
      setError("Please complete all required fields.");
      return;
    }
    if (!/^[a-z0-9._%+-]+@phinmaed\.com$/.test(mail)) {
      setError("Use your @phinmaed.com email (e.g. jacalma.coc@phinmaed.com).");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/student-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: name,
          email: mail,
          studentId: studentId.trim() || undefined,
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Registration failed");
        return;
      }
      setSuccess("Account created. You can now log in.");
      setFullName("");
      setEmail("");
      setStudentId("");
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => router.push("/login"), 800);
    } catch {
      setError("Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl bg-slate-800/60 border border-slate-600/50 p-8 shadow-2xl">
        <h1 className="text-xl font-bold text-center mb-2 text-emerald-300">Student Registration</h1>
        <p className="text-slate-400 text-sm text-center mb-6">
          Your username must be your <span className="font-mono">@phinmaed.com</span> email.
        </p>

        <form onSubmit={handleRegister} className="space-y-4">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="PHINMAed email (e.g. jacalma.coc@phinmaed.com)"
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <input
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="Student ID (optional)"
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 6 characters)"
              className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 pr-12 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200"
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.58 10.58A2 2 0 0012 16a2 2 0 001.42-.58" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.88 5.09A9.77 9.77 0 0112 4.8c5.4 0 9.27 4.66 9.43 4.86a.55.55 0 010 .68 17.6 17.6 0 01-4.09 3.77" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.61 6.61A17.37 17.37 0 002.57 10a.55.55 0 000 .68C2.73 10.89 6.6 15.55 12 15.55c1.5 0 2.88-.29 4.12-.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.57 12.68a.55.55 0 010-.68C2.73 11.8 6.6 7.14 12 7.14s9.27 4.66 9.43 4.86a.55.55 0 010 .68c-.16.2-4.03 4.86-9.43 4.86s-9.27-4.66-9.43-4.86z" />
                  <circle cx="12" cy="12.34" r="2.75" />
                </svg>
              )}
            </button>
          </div>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 pr-12 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200"
            >
              {showConfirmPassword ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.58 10.58A2 2 0 0012 16a2 2 0 001.42-.58" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.88 5.09A9.77 9.77 0 0112 4.8c5.4 0 9.27 4.66 9.43 4.86a.55.55 0 010 .68 17.6 17.6 0 01-4.09 3.77" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.61 6.61A17.37 17.37 0 002.57 10a.55.55 0 000 .68C2.73 10.89 6.6 15.55 12 15.55c1.5 0 2.88-.29 4.12-.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.57 12.68a.55.55 0 010-.68C2.73 11.8 6.6 7.14 12 7.14s9.27 4.66 9.43 4.86a.55.55 0 010 .68c-.16.2-4.03 4.86-9.43 4.86s-9.27-4.66-9.43-4.86z" />
                  <circle cx="12" cy="12.34" r="2.75" />
                </svg>
              )}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          {success && <p className="text-emerald-400 text-sm text-center">{success}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-center text-slate-500 text-sm">
          <Link href="/student/login" className="hover:text-cyan-400">Back to Student Login</Link>
        </p>
      </div>
    </div>
  );
}
