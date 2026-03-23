"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const mail = email.trim().toLowerCase();
    if (!mail || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: mail, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      router.push(typeof data.redirect === "string" ? data.redirect : "/");
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl bg-slate-800/60 border border-slate-600/50 p-8 shadow-2xl">
        <h1 className="text-xl font-bold text-center mb-2 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          Login
        </h1>
        <p className="text-slate-400 text-sm text-center mb-6">
          One login for students and teachers. Admin login stays separate.
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (students: @phinmaed.com)"
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
          <p className="text-center text-sm text-slate-400">
            <Link href="/student/forgot-password" className="hover:text-cyan-300">
              Forgot your student password?
            </Link>
          </p>
        </form>

        <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-center text-sm font-semibold text-emerald-300">New student here?</p>
          <p className="mt-1 text-center text-sm text-slate-300">
            Create your student account first before logging in.
          </p>
          <Link
            href="/student/register"
            className="mt-4 block w-full rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Create Student Account
          </Link>
        </div>

        <p className="mt-4 text-center text-slate-500 text-sm">
          <Link href="/admin" className="hover:text-amber-400">Admin</Link>
        </p>

        <div className="mt-6 border-t border-slate-700/50 pt-4 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">System Created By</p>
          <p className="mt-2 text-sm font-semibold text-slate-200">Joshua A. Calma</p>
          <p className="text-xs text-slate-400">PHINMA COC</p>
        </div>
      </div>
    </div>
  );
}
