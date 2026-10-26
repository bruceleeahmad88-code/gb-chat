import { jsonOk } from "@/lib/auth";

/** GET /api/time — server epoch ms.
 *  The app measures the difference between this and the device clock ONCE,
 *  then every displayed timestamp (messages, chats, status, calls) is corrected
 *  by that offset — so the chat always shows the DEVICE's time, and each user's
 *  own timezone (Pakistan, UK, anywhere) automatically. */
export async function GET() {
  return jsonOk({ now: Date.now() });
}
