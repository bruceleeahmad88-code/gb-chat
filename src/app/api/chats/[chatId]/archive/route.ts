import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";

/** Toggle archive / pin / mute for current user in a chat */
export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { chatId } = await ctx.params;
  const body = await req.json();

  const membership = await db.chatParticipant.findUnique({
    where: { chatId_userId: { chatId, userId: me.id } },
  });
  if (!membership) return jsonError("Unauthorized", 403);

  const data: { archived?: boolean; pinned?: boolean; muted?: boolean } = {};
  if (typeof body.archived === "boolean") data.archived = body.archived;
  if (typeof body.pinned === "boolean") data.pinned = body.pinned;
  if (typeof body.muted === "boolean") data.muted = body.muted;

  await db.chatParticipant.update({
    where: { chatId_userId: { chatId, userId: me.id } },
    data,
  });
  return jsonOk({ ok: true });
}
