/**
 * GB Chat — production server (SINGLE process, deploy-friendly)
 * ============================================================
 * Next.js app + socket.io (realtime: presence, chat, call signaling, relay)
 * ek hi HTTP server par — is liye Render/Railway/Fly jaisi free hosting par
 * sirf EK service chahiye hoti hai.
 *
 * Start: next build ke baad -> node server.js
 * Env:   PORT (default 3000), DATABASE_URL, SOCKET_PATH (default /socket.io)
 *
 * Realtime logic mini-services/gbchat-socket ka exact production port hai:
 *   - auth -> personal room "user:<id>"  (API broadcasts yahan pohanchte hain)
 *   - presence (online/offline) + snapshot
 *   - call:signal relay (offer/answer/ICE/invite) + offline auto-bounce
 *   - chat room join/leave, typing, msg:ack delivery/read relay
 * Socket instance globalThis.__gbIO par set hota hai — API routes
 * (src/lib/realtime.ts) seedha isi se events emit karte hain (koi extra port nahi).
 */
const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");

const port = parseInt(process.env.PORT || "3000", 10);
const socketPath = process.env.SOCKET_PATH || "/socket.io";

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server(httpServer, {
    path: socketPath,
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000,
    // voice/video relay fallback chunks (PCM/JPEG) ke liye generous buffer
    maxHttpBufferSize: 5e6,
  });

  /** API routes isi instance se direct emit karte hain (same process) */
  globalThis.__gbIO = io;

  /** userId -> Set<socketId> */
  const onlineUsers = new Map();

  function broadcastPresence(userId, online) {
    io.emit("presence", { userId, online, at: new Date().toISOString() });
  }

  io.on("connection", (socket) => {
    let myUserId = null;

    socket.on("auth", (data) => {
      myUserId = String((data && data.userId) || "");
      if (!myUserId) return;
      // Personal room: API routes userRoom(userId) par chats:invalidate,
      // calls:invalidate, message:new, call signaling broadcast karte hain.
      socket.join(`user:${myUserId}`);
      if (!onlineUsers.has(myUserId)) {
        onlineUsers.set(myUserId, new Set());
        broadcastPresence(myUserId, true);
      }
      onlineUsers.get(myUserId).add(socket.id);
      // naya client abhi ke online users ki list dekh leta hai
      socket.emit("presence:snapshot", { online: Array.from(onlineUsers.keys()) });
    });

    /** Call signaling relay: caller/callee SDP/ICE/invite exchange.
     *  Envelope: { to, t, ...payload } -> target user room.
     *  AUTO-CUT: offline user ko invite -> foran t:"offline" bounce wapas
     *  (caller ki ringing 1 second me cut ho jati hai). */
    socket.on("call:signal", (data) => {
      if (!myUserId || !data || !data.to || !data.t) return;
      const { to, ...rest } = data;
      const target = String(to);
      if (data.t === "invite" && !onlineUsers.has(target)) {
        socket.emit("call:signal", { t: "offline", callId: (data && data.callId) || "" });
        return;
      }
      io.to(`user:${target}`).emit("call:signal", { from: myUserId, ...rest });
    });

    socket.on("chat:join", (data) => {
      if (data && data.chatId) socket.join(`chat:${data.chatId}`);
    });

    socket.on("chat:leave", (data) => {
      if (data && data.chatId) socket.leave(`chat:${data.chatId}`);
    });

    socket.on("typing", (data) => {
      if (!data || !data.chatId || !myUserId) return;
      socket.to(`chat:${data.chatId}`).emit("typing", {
        chatId: data.chatId,
        userId: myUserId,
        name: data.name || "",
        isTyping: !!data.isTyping,
      });
    });

    // Delivery/read acknowledgements -> chat room relay
    socket.on("msg:ack", (data) => {
      if (!data || !data.chatId || !myUserId) return;
      socket.to(`chat:${data.chatId}`).emit("message:status", {
        chatId: data.chatId,
        status: data.status,
        by: myUserId,
        senderId: data.senderId,
      });
    });

    socket.on("disconnect", () => {
      if (!myUserId) return;
      const set = onlineUsers.get(myUserId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          onlineUsers.delete(myUserId);
          broadcastPresence(myUserId, false);
        }
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`GB Chat running on port ${port} (socket path: ${socketPath})`);
  });

  const shutdown = () => {
    try {
      httpServer.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref();
    } catch {
      process.exit(0);
    }
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
});
