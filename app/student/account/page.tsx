"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MeResponse = {
  ok: boolean;
  student?: { id: string; name: string; studentId?: string; username?: string };
  error?: string;
};

export default function StudentAccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [studentId, setStudentId] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/student-me", { credentials: "include", cache: "no-store" });
        if (res.status === 401) {
          router.push("/student/login");
          return;
        }
        const data = (await res.json().catch(() => null)) as MeResponse | null;
        if (!data?.ok || !data.student) {
          if (!cancelled) setError(data?.error ?? "Failed to load account");
          return;
        }
        if (!cancelled) {
          setFullName(data.student.name ?? "");
          setUsername(data.student.username ?? "");
          setStudentId(data.student.studentId ?? "");
        }
      } catch {
        if (!cancelled) setError("Failed to load account");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!username.trim()) {
      setError("Username is required.");
      return;
    }
    if (!currentPassword) {
      setError("Current password is required.");
      return;
    }
    if (newPassword && newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/student-account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: fullName.trim(),
          username: username.trim().toLowerCase(),
          currentPassword,
          newPassword: newPassword || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to update account");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Account updated successfully.");
    } catch {
      setError("Failed to update account");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 flex items-center justify-center">
        <p className="text-slate-400">Loading account...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 md:p-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <Link href="/student" className="text-slate-500 hover:text-cyan-400 text-sm">
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold mt-2 text-emerald-300">Student Account</h1>
          <p className="text-slate-400 text-sm mt-1">
            Update your name, username, and password.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-900/20 border border-red-700/30 p-4 text-red-200">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded-xl bg-emerald-900/20 border border-emerald-700/30 p-4 text-emerald-200">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="rounded-2xl bg-slate-800/60 border border-slate-600/50 p-6 shadow-2xl space-y-5">
          <div>
            <label className="block text-slate-300 text-sm mb-2">Full Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="block text-slate-300 text-sm mb-2">Username / Email</label>
            <input
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="name@phinmaed.com"
            />
            <p className="mt-2 text-xs text-slate-500">Use your `@phinmaed.com` email.</p>
          </div>

          <div>
            <label className="block text-slate-300 text-sm mb-2">Student ID</label>
            <input
              value={studentId}
              disabled
              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-400"
            />
          </div>

          <div className="pt-2 border-t border-slate-700">
            <label className="block text-slate-300 text-sm mb-2">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="Enter current password to save changes"
            />
          </div>

          <div>
            <label className="block text-slate-300 text-sm mb-2">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="Leave blank to keep current password"
            />
          </div>

          <div>
            <label className="block text-slate-300 text-sm mb-2">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="Repeat new password"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
