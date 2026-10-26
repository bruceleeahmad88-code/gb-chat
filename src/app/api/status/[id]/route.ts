import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { broadcast, userRoom } from "@/lib/realtime";

const REACTIONS = ["❤️", "😂", "😮", "🥲", "🙏", "👍"];

/** POST: view a status (optional body.reaction also sets an emoji reaction) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;

  const status = await db.statusUpdate.findUnique({ where: { id } });
  if (!status) return jsonError("Status not found", 404);

  let reaction: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.reaction === "string" && REACTIONS.includes(body.reaction)) {
      reaction = body.reaction;
    }
  } catch {
    /* no body — plain view */
  }

  await db.statusView.upsert({
    where: { statusId_viewerId: { statusId: id, viewerId: me.id } },
    update: reaction ? { reaction } : {},
    create: { statusId: id, viewerId: me.id, reaction },
  });
  broadcast(userRoom(status.userId), "status:invalidate", { statusId: id });
  return jsonOk({ ok: true, reaction });
}

/** PUT: change my reaction on a status */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;

  const status = await db.statusUpdate.findUnique({ where: { id } });
  if (!status) return jsonError("Status not found", 404);

  const body = await req.json().catch(() => ({}));
  const emoji = typeof body?.reaction === "string" ? body.reaction : "";
  if (!REACTIONS.includes(emoji)) return jsonError("Invalid reaction");

  const view = await db.statusView.upsert({
    where: { statusId_viewerId: { statusId: id, viewerId: me.id } },
    update: { reaction: emoji },
    create: { statusId: id, viewerId: me.id, reaction: emoji },
  });
  broadcast(userRoom(status.userId), "status:invalidate", { statusId: id });
  return jsonOk({ ok: true, reaction: view.reaction });
}

/** DELETE: remove a status — owner access (this is the user's own app) */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;
  const status = await db.statusUpdate.findUnique({ where: { id } });
  if (!status) return jsonError("Status not found", 404);
  await db.statusUpdate.delete({ where: { id } });
  broadcast(userRoom(status.userId), "status:invalidate", { statusId: id });
  broadcast(userRoom(me.id), "status:invalidate", { statusId: id });
  return jsonOk({ ok: true });
}
