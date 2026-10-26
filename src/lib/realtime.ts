/** Server-side helper: forward real-time events to connected socket.io clients.
 *
 *  Two modes (auto-detected):
 *  1. MERGED SERVER (production, e.g. Render): server.js attaches the socket.io
 *     instance to globalThis.__gbIO — events are emitted directly in-process.
 *  2. SEPARATE MINI-SERVICE (sandbox/dev): HTTP POST to the broadcast endpoint
 *     (localhost:3004), configurable via BROADCAST_URL env var.
 */

type MinimalIO = { to: (room: string) => { emit: (event: string, payload: unknown) => void } };

const g = globalThis as unknown as { __gbIO?: MinimalIO };

export async function broadcast(
  rooms: string | string[],
  event: string,
  payload: unknown
): Promise<void> {
  const roomList = (Array.isArray(rooms) ? rooms : [rooms]).map(String);

  // Mode 1 — merged custom server: direct in-process emit
  if (g.__gbIO) {
    try {
      for (const room of roomList) g.__gbIO!.to(room).emit(event, payload);
    } catch {
      // never let realtime failures break an API response
    }
    return;
  }

  // Mode 2 — separate socket mini-service via HTTP broadcast
  const url = process.env.BROADCAST_URL || "http://localhost:3004/broadcast";
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rooms: roomList, event, payload }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // socket service may be down — ignore, clients still get data via refetch
  }
}

export const userRoom = (userId: string) => `user:${userId}`;
export const chatRoom = (chatId: string) => `chat:${chatId}`;
