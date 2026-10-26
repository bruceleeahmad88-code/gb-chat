"use client";

/** GB Chat — status tab, add status & status viewer (original implementation)
 *  Full owner access: post as Jannat too, react & reply to any status,
 *  delete/viewers for any status, real device photo/video upload.
 */
import { useEffect, useRef, useState } from "react";
import {
  Pencil,
  Camera,
  MoreVertical,
  Eye,
  Trash2,
  Reply,
  X,
  Plus,
  Loader2,
  Send,
  ImagePlus,
  Type,
} from "lucide-react";
import { useGB } from "@/lib/gb-store";
import { api, apiForm, formatListTime, formatTime, resolveMedia, pickFile } from "@/lib/gb-api";
import { GbAvatar, ScreenHeader, HeaderIcon } from "@/components/gb/ui-bits";
import type { StatusItem, StatusGroup } from "@/lib/gb-types";

const BG_COLORS = ["0ea47a", "0288d1", "7b1fa2", "e91e63", "f57c00", "e53935", "3949ab", "607d8b"];
const REACTIONS = ["❤️", "😂", "😮", "🥲", "🙏", "👍"];

export function StatusScreen() {
  const me = useGB((s) => s.me);
  const groups = useGB((s) => s.statusGroups);
  const refreshStatus = useGB((s) => s.refreshStatus);
  const pushView = useGB((s) => s.pushView);
  const toast = useGB((s) => s.toast);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const myGroup = groups.find((g) => g.user.id === me?.id);
  const recent = groups.filter((g) => g.user.id !== me?.id && !g.allViewed);
  const viewed = groups.filter((g) => g.user.id !== me?.id && g.allViewed);

  const openViewer = (group: StatusGroup, idx: number) => {
    useGB.getState().setStatusViewer({ groupId: group.user.id, itemIdx: idx });
    pushView({ name: "statusview" });
  };

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader
        title="Status"
        right={
          <>
            <HeaderIcon label="add status" onClick={() => pushView({ name: "addstatus" })}>
              <Camera size={20} />
            </HeaderIcon>
            <HeaderIcon label="menu" onClick={() => toast("Status privacy: My contacts")}>
              <MoreVertical size={20} />
            </HeaderIcon>
          </>
        }
      />
      <div className="flex-1 overflow-y-auto">
        {/* my status */}
        <button
          onClick={() =>
            myGroup ? openViewer(myGroup, 0) : pushView({ name: "addstatus" })
          }
          className="w-full flex items-center gap-3.5 px-4 py-3 hover:bg-[var(--gb-panel-2)] transition-colors text-left"
        >
          <div className="relative">
            <GbAvatar name={me?.name || "Me"} color={me?.avatarColor || "0ea47a"} emoji={me?.avatarEmoji} url={me?.avatarUrl} size={49} ring={!myGroup} />
            {!myGroup && (
              <span
                className="absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full border-2 border-[var(--gb-bg)] flex items-center justify-center text-white"
                style={{ background: "var(--gb-accent)" }}
              >
                <Plus size={12} />
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-medium text-[var(--gb-text)]">My status</div>
            <div className="text-[13px] text-[var(--gb-text-2)]">
              {myGroup ? `${formatListTime(myGroup.items[0].createdAt)} • ${myGroup.items.length} update(s)` : "Tap to add a status update"}
            </div>
          </div>
        </button>

        {recent.length > 0 && (
          <>
            <div className="px-5 pt-4 pb-1.5 text-[13px] font-medium text-[var(--gb-text-2)]">Recent updates</div>
            {recent.map((g) => (
              <StatusRow key={g.user.id} group={g} onOpen={() => openViewer(g, 0)} />
            ))}
          </>
        )}
        {viewed.length > 0 && (
          <>
            <div className="px-5 pt-4 pb-1.5 text-[13px] font-medium text-[var(--gb-text-2)]">Viewed updates</div>
            {viewed.map((g) => (
              <StatusRow key={g.user.id} group={g} onOpen={() => openViewer(g, 0)} />
            ))}
          </>
        )}
        {groups.length === 0 && (
          <div className="p-10 text-center text-[var(--gb-text-2)] text-sm">
            No statuses yet. Post the first one! ✨
          </div>
        )}
      </div>

      <button
        onClick={() => pushView({ name: "addstatus" })}
        aria-label="add status"
        className="absolute bottom-[76px] right-4 w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform z-10"
        style={{ background: "var(--gb-accent)" }}
      >
        <Pencil size={22} />
      </button>
    </div>
  );
}

function StatusRow({ group, onOpen }: { group: StatusGroup; onOpen: () => void }) {
  const item = group.items[0];
  return (
    <button onClick={onOpen} className="w-full flex items-center gap-3.5 px-4 py-3 hover:bg-[var(--gb-panel-2)] transition-colors text-left">
      <div className={`rounded-full p-[2.5px] ${group.allViewed ? "bg-[var(--gb-border)]" : ""}`} style={!group.allViewed ? { background: "var(--gb-accent)" } : {}}>
        <div className="rounded-full p-[2px] bg-[var(--gb-bg)]">
          <GbAvatar name={group.user.name} color={group.user.avatarColor} emoji={group.user.avatarEmoji} url={group.user.avatarUrl} size={46} online={group.user.isOnline} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[16px] font-medium text-[var(--gb-text)]">{group.user.name}</div>
        <div className="text-[13px] text-[var(--gb-text-2)] truncate">
          {formatListTime(item.createdAt)} • {item.type === "text" ? item.content.slice(0, 40) : item.type === "video" ? "Video status" : "Photo status"}
        </div>
      </div>
    </button>
  );
}

/* ---------------- Add status (photo/video + text, post as me or Zoya) ---------------- */
export function AddStatus() {
  const refreshStatus = useGB((s) => s.refreshStatus);
  const statusGroups = useGB((s) => s.statusGroups);
  const me = useGB((s) => s.me);
  const popView = useGB((s) => s.popView);
  const toast = useGB((s) => s.toast);
  const [text, setText] = useState("");
  const [bg, setBg] = useState(BG_COLORS[0]);
  const [mode, setMode] = useState<"media" | "text">("media");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [media, setMedia] = useState<{ url: string; mime: string; name: string } | null>(null);
  const [asUserId, setAsUserId] = useState<string>(""); // "" = me, else bot id (Zoya)

  // the app owner can post a status as their AI contact (Zoya) too
  const botUser = statusGroups.find((g) => g.user.isBot)?.user || null;

  const chooseMedia = () => {
    pickFile("image/*,video/*", async (file) => {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await apiForm<{ url: string; name: string; size: number; mime: string }>("/api/upload", fd);
        setMedia({ url: res.url, mime: res.mime, name: res.name });
        setText("");
      } catch (e) {
        toast((e as Error).message || "Upload failed", "error");
      } finally {
        setUploading(false);
      }
    });
  };

  const post = async () => {
    setBusy(true);
    try {
      const asBody = asUserId ? { asUserId } : {};
      if (mode === "media" && media) {
        const type = media.mime.startsWith("video/") ? "video" : "image";
        await api("/api/status", {
          method: "POST",
          body: { type, content: text.trim(), mediaSeed: media.url, bg, ...asBody },
        });
      } else {
        if (!text.trim()) { toast("Type something first", "error"); setBusy(false); return; }
        await api("/api/status", { method: "POST", body: { type: "text", content: text.trim(), bg, ...asBody } });
      }
      await refreshStatus();
      toast(asUserId && botUser ? `Status posted as ${botUser.name} ✨` : "Status posted ✨");
      popView();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const canPost = mode === "text" ? !!text.trim() : !!media;

  return (
    <div className="h-full flex flex-col" style={{ background: mode === "text" ? `#${bg}` : "#000" }}>
      <ScreenHeader
        onBack={popView}
        title="New status"
        right={
          <button
            onClick={post}
            disabled={busy || uploading || !canPost}
            className="px-4 h-9 rounded-full bg-white/20 text-white text-[13px] font-medium disabled:opacity-50"
          >
            {busy || uploading ? "Posting..." : "Post"}
          </button>
        }
      />

      {mode === "text" ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            placeholder="Type something..."
            className="w-full bg-transparent text-center text-white text-[24px] font-medium outline-none resize-none placeholder:text-white/50 leading-relaxed"
            rows={6}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4 relative">
          {uploading ? (
            <div className="flex flex-col items-center gap-3 text-white/80">
              <Loader2 size={34} className="animate-spin" />
              <span className="text-[14px]">Uploading...</span>
            </div>
          ) : media ? (
            <div className="relative w-full h-full flex items-center justify-center">
              {media.mime.startsWith("video/") ? (
                <video
                  key={media.url}
                  src={media.url}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-full max-w-full rounded-xl"
                />
              ) : (
                <img src={media.url} alt="status preview" className="max-h-full max-w-full rounded-xl" />
              )}
              <button
                onClick={chooseMedia}
                className="absolute bottom-2 right-2 px-3 h-9 rounded-full bg-black/50 text-white text-[12px] flex items-center gap-1.5"
              >
                <ImagePlus size={14} /> Change
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <button
                onClick={chooseMedia}
                className="w-40 h-40 rounded-3xl bg-white/10 border-2 border-dashed border-white/30 flex flex-col items-center justify-center gap-2 text-white/85 active:scale-95 transition-transform"
              >
                <ImagePlus size={34} />
                <span className="text-[14px] font-medium">Choose photo / video</span>
              </button>
              <p className="text-white/50 text-[12.5px]">Pick a photo or video from your device</p>
            </div>
          )}
        </div>
      )}

      {/* caption for photo/video status */}
      {mode === "media" && media && !uploading && (
        <div className="px-4 pb-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a caption (optional)..."
            maxLength={200}
            className="w-full h-10 rounded-full bg-white/10 px-4 text-white text-[14px] outline-none placeholder:text-white/50"
          />
        </div>
      )}

      {/* owner access: post as the Bot (renamed bot keeps working) */}
      {botUser && (
        <div className="px-4 pb-2 flex items-center gap-2">
          <span className="text-white/60 text-[12px]">Post as:</span>
          <button
            onClick={() => setAsUserId("")}
            className={`px-3 h-8 rounded-full text-[12px] font-medium ${!asUserId ? "bg-white text-black" : "bg-white/15 text-white"}`}
          >
            {me?.name || "Me"}
          </button>
          <button
            onClick={() => setAsUserId(botUser.id)}
            className={`px-3 h-8 rounded-full text-[12px] font-medium flex items-center gap-1 ${asUserId ? "bg-white text-black" : "bg-white/15 text-white"}`}
          >
            <GbAvatar name={botUser.name} color={botUser.avatarColor} emoji={botUser.avatarEmoji} url={botUser.avatarUrl} size={18} />
            {botUser.name}
          </button>
        </div>
      )}

      <div className="p-4 flex items-center gap-2 bg-black/20">
        <button
          onClick={() => setMode(mode === "text" ? "media" : "text")}
          className="px-3 h-10 rounded-full bg-white/15 text-white text-[13px] font-medium flex items-center gap-1.5"
        >
          {mode === "text" ? <Camera size={15} /> : <Type size={15} />}
          {mode === "text" ? "Photo / Video" : "Text"}
        </button>
        <div className="flex-1" />
        {mode === "text" &&
          BG_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setBg(c)}
              aria-label={`bg ${c}`}
              className={`w-7 h-7 rounded-full border-2 ${bg === c ? "border-white scale-110" : "border-white/40"} transition-transform`}
              style={{ background: `#${c}` }}
            />
          ))}
      </div>
    </div>
  );
}

/* ---------------- Status viewer ---------------- */
export function StatusViewer() {
  const groups = useGB((s) => s.statusGroups);
  const me = useGB((s) => s.me);
  const popView = useGB((s) => s.popView);
  const refreshStatus = useGB((s) => s.refreshStatus);
  const toast = useGB((s) => s.toast);
  const [showViewers, setShowViewers] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const paused = useRef(false);

  // lazy init from store (component mounts fresh per view push)
  const [position, setPosition] = useState<{ gi: number; ii: number }>(() => {
    const vs = useGB.getState().statusViewer;
    const g = useGB.getState().statusGroups;
    if (vs) {
      const gi = g.findIndex((x) => x.user.id === vs.groupId);
      if (gi >= 0) return { gi, ii: vs.itemIdx };
    }
    return { gi: 0, ii: 0 };
  });

  const group = groups[position.gi];
  const item = group?.items[position.ii];

  // mark viewed
  useEffect(() => {
    if (item && item.userId !== me?.id && !item.viewed) {
      api(`/api/status/${item.id}`, { method: "POST" }).then(refreshStatus).catch(() => {});
    }
  }, [item?.id, item?.viewed, item?.userId, me?.id, refreshStatus]);

  function next() {
    const g = groups[position.gi];
    if (!g) return;
    if (position.ii + 1 < g.items.length) {
      setPosition({ gi: position.gi, ii: position.ii + 1 });
    } else if (position.gi + 1 < groups.length) {
      setPosition({ gi: position.gi + 1, ii: 0 });
    } else {
      popView();
    }
  }

  function prev() {
    if (position.ii > 0) {
      setPosition({ gi: position.gi, ii: position.ii - 1 });
    } else if (position.gi > 0) {
      const g = groups[position.gi - 1];
      setPosition({ gi: position.gi - 1, ii: Math.max(0, g.items.length - 1) });
    }
  }

  if (!group || !item) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <button onClick={popView} className="text-white text-sm">
          Back
        </button>
      </div>
    );
  }

  const isMine = item.userId === me?.id;

  const deleteStatus = async () => {
    try {
      await api(`/api/status/${item.id}`, { method: "DELETE" });
      await refreshStatus();
      toast("Status deleted");
      popView();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const react = async (emoji: string) => {
    try {
      await api(`/api/status/${item.id}`, { method: "PUT", body: { reaction: emoji } });
      await refreshStatus();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  /** Reply to a status — auto-creates the chat if it doesn't exist yet */
  const sendReply = async () => {
    const text = replyText.trim();
    if (!text || sendingReply) return;
    setSendingReply(true);
    try {
      // find or create the individual chat with this user
      let chat = useGB.getState().chats.find((c) => c.otherUser?.id === item.userId);
      if (!chat) {
        const created = await api<{ chatId: string }>("/api/chats", {
          method: "POST",
          body: { username: group.user.username },
        });
        await useGB.getState().refreshChats();
        chat = useGB.getState().chats.find((c) => c.id === created.chatId);
      }
      if (!chat) throw new Error("Could not start the chat");
      await api(`/api/chats/${chat.id}/messages`, {
        method: "POST",
        body: { content: text, type: "text", statusReply: true },
      });
      useGB.getState().refreshChats();
      setReplyText("");
      toast("Reply sent ✓");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSendingReply(false);
    }
  };

  const reactionNames = item.reactions
    .map((r) => r.name)
    .filter((n, i, arr) => n && arr.indexOf(n) === i)
    .slice(0, 3)
    .join(", ");

  return (
    <div className="h-full flex flex-col bg-black relative select-none">
      {/* progress bars */}
      <StatusProgress
        key={item.id}
        total={group.items.length}
        idx={position.ii}
        pausedRef={paused}
        onDone={next}
        durationMs={item.type === "video" ? 30000 : item.type === "image" ? 5000 : 4000}
      />

      {/* header */}
      <div className="absolute top-6 left-3 right-3 z-30 flex items-center gap-2.5 pt-2">
        <button onClick={popView} aria-label="close" className="p-1 text-white">
          <X size={26} />
        </button>
        <GbAvatar name={isMine ? me?.name || "Me" : group.user.name} color={isMine ? me?.avatarColor || "0ea47a" : group.user.avatarColor} emoji={isMine ? me?.avatarEmoji : group.user.avatarEmoji} url={isMine ? me?.avatarUrl : group.user.avatarUrl} size={36} />
        <div className="flex-1 min-w-0">
          <div className="text-white text-[14px] font-medium truncate">{isMine ? "My status" : group.user.name}</div>
          <div className="text-white/70 text-[11.5px]">{formatTime(item.createdAt)}</div>
        </div>
        {/* owner access: views + delete for ANY status */}
        <button onClick={() => setShowViewers(true)} aria-label="views" className="p-2 text-white flex items-center gap-1">
          <Eye size={19} />
          <span className="text-[12px]">{item.viewCount}</span>
        </button>
        <button onClick={deleteStatus} aria-label="delete" className="p-2 text-white">
          <Trash2 size={19} />
        </button>
      </div>

      {/* content */}
      <div
        className="flex-1 flex items-center justify-center relative"
        onMouseDown={() => (paused.current = true)}
        onMouseUp={() => (paused.current = false)}
        onTouchStart={() => (paused.current = true)}
        onTouchEnd={() => (paused.current = false)}
      >
        {item.type === "text" ? (
          <div
            className="w-full h-full flex items-center justify-center px-10"
            style={{ background: `#${item.bg}` }}
          >
            <p className="text-white text-[24px] font-medium text-center leading-relaxed whitespace-pre-wrap">
              {item.content}
            </p>
          </div>
        ) : item.type === "video" ? (
          <video
            key={item.id}
            src={resolveMedia(item.mediaSeed)}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <img src={resolveMedia(item.mediaSeed)} alt="status" className="max-h-full max-w-full object-contain" />
        )}

        {/* tap zones */}
        <button aria-label="previous" onClick={prev} className="absolute left-0 top-0 bottom-0 w-1/3 z-10" />
        <button aria-label="next" onClick={next} className="absolute right-0 top-0 bottom-0 w-1/3 z-10" />
      </div>

      {/* reactions strip */}
      {item.reactions.length > 0 && (
        <div className="px-4 pb-1 text-white/85 text-[12.5px] z-20">
          {item.reactions.map((r, i) => (
            <span key={i} className="mr-1">{r.emoji}</span>
          ))}
          {reactionNames && <span> by {reactionNames}</span>}
        </div>
      )}

      {/* footer: emoji reactions + real reply input */}
      {!isMine && (
        <div className="p-3 bg-black/40 z-20">
          <div className="flex items-center gap-1.5 mb-2">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => react(emoji)}
                aria-label={`react ${emoji}`}
                className={`flex-1 h-10 rounded-full text-[19px] flex items-center justify-center transition-transform active:scale-125 ${item.myReaction === emoji ? "bg-white/25 scale-110" : "bg-white/10"}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendReply()}
              onFocus={() => (paused.current = true)}
              onBlur={() => (paused.current = false)}
              placeholder="Reply to status..."
              className="flex-1 h-11 rounded-full bg-white/10 px-4 text-white text-[14px] outline-none placeholder:text-white/50"
            />
            <button
              onClick={sendReply}
              disabled={!replyText.trim() || sendingReply}
              aria-label="send reply"
              className="w-11 h-11 rounded-full flex items-center justify-center text-white disabled:opacity-50"
              style={{ background: "var(--gb-accent)" }}
            >
              {sendingReply ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      )}

      {/* viewers sheet — owner access works for any status */}
      {showViewers && (
        <div className="absolute inset-0 z-40 bg-black/60 flex items-end" onClick={() => setShowViewers(false)}>
          <div
            className="w-full max-h-[65%] rounded-t-2xl bg-[var(--gb-panel)] p-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-[var(--gb-text)] mb-3">
              Viewed by {item.viewCount}
            </h3>
            {item.viewCount === 0 && (
              <p className="text-[14px] text-[var(--gb-text-2)] pb-4">Nobody has seen it yet</p>
            )}
            {item.viewers.map((v, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <GbAvatar name={v.name || "Viewer"} color={v.avatarColor || "607d8b"} url={v.avatarUrl} size={36} />
                <span className="flex-1 text-[15px] text-[var(--gb-text)]">{v.name || "Viewer"}</span>
                {(() => {
                  const r = item.reactions.find((x) => x.viewerId === v.id);
                  return r ? <span className="text-[16px]">{r.emoji}</span> : null;
                })()}
                <span className="text-[12px] text-[var(--gb-text-2)]">{formatTime(v.viewedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Self-timing progress bar — remounts per status item via key prop */
function StatusProgress({
  total,
  idx,
  pausedRef,
  onDone,
  durationMs = 4000,
}: {
  total: number;
  idx: number;
  pausedRef: { current: boolean };
  onDone: () => void;
  durationMs?: number;
}) {
  const [progress, setProgress] = useState(0);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const step = 100 / (durationMs / 100);
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(timer);
          setTimeout(() => onDoneRef.current(), 60);
          return 100;
        }
        return p + step;
      });
    }, 100);
    return () => clearInterval(timer);
  }, [durationMs]);

  return (
    <div className="absolute top-2 left-2 right-2 z-30 flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-none"
            style={{ width: i < idx ? "100%" : i === idx ? `${progress}%` : "0%" }}
          />
        </div>
      ))}
    </div>
  );
}

export type { StatusItem };
