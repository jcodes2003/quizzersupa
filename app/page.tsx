"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/student-me", { credentials: "include" });
        if (cancelled) return;
        if (res.ok) {
          router.push("/student");
          return;
        }
        const tRes = await fetch("/api/teacher-attempts", { credentials: "include" });
        if (cancelled) return;
        if (tRes.ok) {
          router.push("/teacher");
          return;
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 md:p-10 flex items-center justify-center">
      <div className="max-w-xl w-full">
        <div className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-8 shadow-2xl">
          <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Quiz Maker
          </h1>
          <p className="text-center text-slate-400 mb-8">Log in to access your dashboard</p>

          <div className="space-y-3">
            <button
              onClick={() => router.push("/login")}
              className="w-full py-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-lg transition-colors"
            >
              Login
            </button>
            <button
              onClick={() => router.push("/admin")}
              className="w-full py-3 rounded-xl bg-amber-700/70 hover:bg-amber-700 text-white font-semibold transition-colors"
            >
              Admin
            </button>
          </div>
        </div>
        <p className="mt-6 text-center text-slate-500 text-sm">
          Students can create an account at <span className="font-mono">/student/register</span>.
        </p>
      </div>
    </div>
  );
}
