import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { BOT_DEFAULT_AVATAR } from "@/lib/bots";

/** PUT /api/contacts/avatar — owner changes the BOT's display photo (100% owner access).
 *  body: { userId: string, avatarUrl: dataURI | "" }   ("" = reset to the default DP)
 *  Only the bot account can be changed here — invited real users keep their own DP. */
export async function PUT(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId || "");
  if (!userId || userId === me.id) return jsonError("Invalid user", 400);

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return jsonError("User not found", 404);
  if (!target.isBot) return jsonError("You can only change your Bot's photo", 403);

  let avatarUrl: string;
  const url = typeof body.avatarUrl === "string" ? body.avatarUrl : "";
  if (url === "") {
    avatarUrl = BOT_DEFAULT_AVATAR; // reset to default DP
  } else if (url.startsWith("data:image/") && url.length <= 400_000) {
    avatarUrl = url; // small uploaded photo (320px square JPEG)
  } else {
    return jsonError("Photo is too large — please choose a smaller one");
  }

  const updated = await db.user.update({ where: { id: userId }, data: { avatarUrl } });
  return jsonOk({ avatarUrl: updated.avatarUrl });
}
