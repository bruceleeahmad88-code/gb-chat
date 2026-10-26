import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";

/** Presence heartbeat: mark user online */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return jsonError("Unauthorized", 401);
  await db.user.update({
    where: { id: user.id },
    data: { isOnline: true, lastSeen: new Date() },
  });
  return jsonOk({ ok: true });
}
