import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";

/** DELETE: clear a call log entry (own calls only) */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;
  const call = await db.callLog.findUnique({ where: { id } });
  if (!call) return jsonError("Call not found", 404);
  if (call.callerId !== me.id && call.receiverId !== me.id) return jsonError("Unauthorized", 403);
  await db.callLog.delete({ where: { id } });
  return jsonOk({ ok: true });
}

/** PUT: update call duration after "ending" a simulated call */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;
  const body = await req.json();
  const call = await db.callLog.findUnique({ where: { id } });
  if (!call) return jsonError("Call not found", 404);
  if (call.callerId !== me.id && call.receiverId !== me.id) return jsonError("Unauthorized", 403);
  await db.callLog.update({
    where: { id },
    data: { duration: Math.max(0, parseInt(body.duration) || 0), outcome: body.outcome || call.outcome },
  });
  return jsonOk({ ok: true });
}
