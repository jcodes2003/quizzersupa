import { NextResponse } from "next/server";
import { getCookieName } from "../../lib/teacher-auth";
import { getTeacherDBCookieName } from "../../lib/teacher-db-auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  for (const name of [getCookieName(), getTeacherDBCookieName()]) {
    res.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
  }
  return res;
}
