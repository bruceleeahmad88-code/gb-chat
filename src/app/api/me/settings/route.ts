import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { parseSettings } from "@/lib/settings";
import { broadcast, userRoom } from "@/lib/realtime";

/** Update any section of user settings (privacy / gb / chat / notifications / pin) */
export async function PUT(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return jsonError("Unauthorized", 401);
  const body = await req.json();

  const current = parseSettings(user.settingsJson);
  const next = { ...current };

  if (body.privacy) next.privacy = { ...current.privacy, ...body.privacy };
  if (body.gb) next.gb = { ...current.gb, ...body.gb };
  if (body.chat) next.chat = { ...current.chat, ...body.chat };
  if (body.notifications) next.notifications = { ...current.notifications, ...body.notifications };
  if ("pin" in body) next.pin = body.pin === null ? null : String(body.pin).slice(0, 6);

  const updated = await db.user.update({
    where: { id: user.id },
    data: { settingsJson: JSON.stringify(next) },
  });

  broadcast(userRoom(user.id), "settings:updated", parseSettings(updated.settingsJson));
  return jsonOk({ settings: next });
}
