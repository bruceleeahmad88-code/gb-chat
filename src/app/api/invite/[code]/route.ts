import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/auth";
import { findByNumberOrCode } from "@/lib/gb-number";

/** GET /api/invite/[code] — PUBLIC: who invited me?
 *  Accepts an invite code (gbxxxxxx) or a GB number. Returns only the
 *  display name so the signup screen can show "X invited you". */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const user = await findByNumberOrCode(decodeURIComponent(code));
  if (!user) return jsonError("Invite not valid", 404);
  return jsonOk({
    name: user.name,
    code: user.inviteCode,
    gbNumber: user.gbNumber,
  });
}
