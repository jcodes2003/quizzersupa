"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StudentForgotPasswordPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    const sid = studentId.trim();

    if (!name || !mail || !newPassword) {
      setError("Please complete all required fields.");
      return;
    }
    if (!/^[a-z0-9._%+-]+@phinmaed\.com$/.test(mail)) {
      setError("Use your @phinmaed.com email.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/student-forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: name,
          email: mail,
          studentId: sid || undefined,
          newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Unable to reset password");
        return;
      }
      setSuccess(data.message ?? "Password updated. Redirecting to login...");
      setFullName("");
      setEmail("");
      setStudentId("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => router.push("/login"), 1200);
    } catch {
      setError("Unable to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl bg-slate-800/60 border border-slate-600/50 p-8 shadow-2xl">
        <h1 className="text-xl font-bold text-center mb-2 text-cyan-300">Student Password Recovery</h1>
        <p className="text-slate-400 text-sm text-center mb-6">
          Enter the same details you used on your student account, then choose a new password.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="PHINMAed email"
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <input
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="Student ID (required if it was saved on your account)"
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <div className="relative">
            <input
              type={showNewPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 pr-12 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword((prev) => !prev)}
              aria-label={showNewPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200"
            >
              {showNewPassword ? "Hide" : "Show"}
            </button>
          </div>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-3 pr-12 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200"
            >
              {showConfirmPassword ? "Hide" : "Show"}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          {success && <p className="text-emerald-400 text-sm text-center">{success}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold"
          >
            {loading ? "Updating..." : "Reset Password"}
          </button>
        </form>

        <p className="mt-6 text-center text-slate-500 text-sm">
          <Link href="/login" className="hover:text-cyan-400">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}
