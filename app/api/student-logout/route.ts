import { NextResponse } from "next/server";
import { getStudentCookieName } from "../../lib/student-auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(getStudentCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}

