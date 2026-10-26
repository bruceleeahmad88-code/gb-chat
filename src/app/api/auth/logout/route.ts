import { destroySession, jsonOk, tokenFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const token = tokenFromRequest(req);
  if (token) {
    const session = await db.session.findUnique({ where: { token } });
    if (session) {
      await db.user.update({
        where: { id: session.userId },
        data: { isOnline: false, lastSeen: new Date() },
      });
    }
    await destroySession(token);
  }
  return jsonOk({ ok: true });
}
