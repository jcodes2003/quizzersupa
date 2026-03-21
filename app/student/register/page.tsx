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
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 6 characters)"
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
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
