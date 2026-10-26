import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";

export function hashPassword(password: string): string {
  return createHash("sha256").update(`gbchat::${password}`).digest("hex");
}

export function generateToken(): string {
  return randomBytes(24).toString("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  await db.session.create({ data: { token, userId } });
  return token;
}

export async function destroySession(token: string) {
  await db.session.deleteMany({ where: { token } });
}

/** Extract token from Authorization header */
export function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

/** Returns the authenticated user or null */
export async function getAuthUser(req: Request) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  return session.user;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function jsonOk(data: unknown, status = 200) {
  return Response.json(data, { status });
}
