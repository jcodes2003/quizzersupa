export function sanitizeStudentId(value: unknown): string {
  return String(value ?? "").replace(/[^A-Za-z0-9]/g, "");
}

export function sameStudentId(left: unknown, right: unknown): boolean {
  const a = sanitizeStudentId(left);
  const b = sanitizeStudentId(right);
  return Boolean(a) && a === b;
}
