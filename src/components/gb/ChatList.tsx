"use client";

/** GB Chat — chats list (main tab)
 *  WhatsApp-style chat management: long-press a chat → it gets selected and the header
 *  turns into an action bar (pin / mute / archive / clear / delete) — delete or clear
 *  a chat right from the list, exactly like real WhatsApp. Multi-select supported. */
import { useMemo, useRef, useState } from "react";
import {
  Search,
  MessageCirclePlus,
  Camera,
  MoreVertical,
  Pin,
  VolumeOff,
  Volume2,
  Check,
  CheckCheck,
  Archive,
  ArchiveRestore,
  Trash2,
  Eraser,
  X,
  ArrowLeft,
  Image as ImageIcon,
  Video,
  FileText,
  Mic,
  MapPin,
  PhoneMissed,
  Clapperboard,
} from "lucide-react";
import { useGB } from "@/lib/gb-store";
import { api, formatListTime } from "@/lib/gb-api";
import { GbAvatar, Ticks, ScreenHeader, HeaderIcon } from "@/components/gb/ui-bits";
import type { ChatSummary } from "@/lib/gb-types";

function lastMsgPreview(chat: ReturnType<typeof useGB.getState>["chats"][number], myId: string) {
  const lm = chat.lastMessage;
  if (!lm) return { icon: null as React.ReactNode, text: "Tap to start chatting", tick: null as string | null, mine: false };
  const mine = lm.senderId === myId;
  let icon: React.ReactNode = null;
  if (lm.type === "image") icon = <ImageIcon size={14} className="inline -mt-0.5" />;
  else if (lm.type === "video") icon = <Video size={14} className="inline -mt-0.5" />;
  else if (lm.type === "audio") icon = <Mic size={14} className="inline -mt-0.5" />;
  else if (lm.type === "document") icon = <FileText size={14} className="inline -mt-0.5" />;
  else if (lm.type === "location") icon = <MapPin size={14} className="inline -mt-0.5" />;
  else if (lm.type === "gif") icon = <Clapperboard size={14} className="inline -mt-0.5" />;
  const text =
    lm.type === "text"
      ? lm.deletedForAll
        ? "This message was deleted"
        : lm.content
      : lm.type === "image"
        ? "Photo"
        : lm.type === "video"
          ? "Video"
          : lm.type === "audio"
            ? "Voice message"
            : lm.type === "gif"
              ? "GIF"
              : lm.type === "document"
                ? lm.content || "Document"
                : lm.type === "location"
                  ? "Location"
                  : lm.content;
  return { icon, text, tick: mine ? lm.status : null, mine, deleted: lm.deletedForAll };
}

export function ChatList() {
  const me = useGB((s) => s.me);
  const chats = useGB((s) => s.chats);
  const chatsLoaded = useGB((s) => s.chatsLoaded);
  const openChat = useGB((s) => s.openChat);
  const pushView = useGB((s) => s.pushView);
  const online = useGB((s) => s.online);
  const search = useGB((s) => s.searchQuery);
  const setSearch = useGB((s) => s.setSearch);
  const toast = useGB((s) => s.toast);

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [delIds, setDelIds] = useState<string[] | null>(null);
  const [clearIds, setClearIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  /* ---- WhatsApp-style long-press → select (with scroll/move tolerance) ---- */
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressPos = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const startPress = (chat: ChatSummary, e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pressPos.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(15);
      suppressClick.current = true;
      setSelected(new Set([chat.id]));
    }, 450);
  };
  const movePress = (e: React.PointerEvent) => {
    if (!pressPos.current || !pressTimer.current) return;
    const dx = Math.abs(e.clientX - pressPos.current.x);
    const dy = Math.abs(e.clientY - pressPos.current.y);
    if (dx > 10 || dy > 10) cancelPress(); // user is scrolling, not long-pressing
  };
  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const onRowClick = (chat: ChatSummary) => {
    if (suppressClick.current) {
      suppressClick.current = false; // click that follows a long-press — ignore
      return;
    }
    if (selected.size > 0) {
      toggleSelect(chat.id);
      return;
    }
    openChat(chat.id);
  };

  const selChats = useMemo(() => chats.filter((c) => selected.has(c.id)), [chats, selected]);
  const allPinned = selChats.length > 0 && selChats.every((c) => c.pinned);
  const allMuted = selChats.length > 0 && selChats.every((c) => c.muted);
  const allArchived = selChats.length > 0 && selChats.every((c) => c.archived);

  const bulkUpdate = async (patch: Record<string, boolean>) => {
    try {
      setBusy(true);
      for (const id of selected) {
        await api(`/api/chats/${id}/archive`, { method: "POST", body: patch });
      }
      setSelected(new Set());
      await useGB.getState().refreshChats();
    } catch (e) {
      useGB.getState().toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const confirmClear = async () => {
    if (!clearIds?.length) return;
    try {
      setBusy(true);
      for (const id of clearIds) {
        await api(`/api/chats/${id}`, { method: "POST" });
      }
      useGB.setState((s) => {
        const mb = { ...s.messagesByChat };
        for (const id of clearIds) mb[id] = [];
        return { messagesByChat: mb };
      });
      await useGB.getState().refreshChats();
      useGB.getState().toast(clearIds.length > 1 ? `${clearIds.length} chats cleared 🧹` : "Chat cleared 🧹");
      setClearIds(null);
    } catch (e) {
      useGB.getState().toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!delIds?.length) return;
    try {
      setBusy(true);
      for (const id of delIds) {
        await api(`/api/chats/${id}`, { method: "DELETE" });
      }
      await useGB.getState().refreshChats();
      useGB.getState().toast(delIds.length > 1 ? `${delIds.length} chats deleted 🗑️` : "Chat deleted 🗑️");
      setDelIds(null);
    } catch (e) {
      useGB.getState().toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const delNames = useMemo(() => {
    if (!delIds) return [];
    return delIds.map((id) => chats.find((c) => c.id === id)?.name || "Chat");
  }, [delIds, chats]);
  const clearNames = useMemo(() => {
    if (!clearIds) return [];
    return clearIds.map((id) => chats.find((c) => c.id === id)?.name || "Chat");
  }, [clearIds, chats]);

  const filtered = useMemo(() => {
    if (!search.trim()) return chats.filter((c) => !c.archived);
    const q = search.toLowerCase();
    return chats.filter(
      (c) =>
        !c.archived &&
        (c.name.toLowerCase().includes(q) ||
          c.lastMessage?.content.toLowerCase().includes(q) ||
          c.otherUser?.username.toLowerCase().includes(q))
    );
  }, [chats, search]);

  const archivedCount = chats.filter((c) => c.archived).length;
  const archivedUnread = chats.filter((c) => c.archived).reduce((a, c) => a + c.unread, 0);
  const selecting = selected.size > 0;

  const actionBtn = (label: string, onClick: () => void, icon: React.ReactNode) => (
    <button
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className="p-2 rounded-full text-white hover:bg-white/10 active:bg-white/20 transition-colors disabled:opacity-50"
    >
      {icon}
    </button>
  );

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      {selecting ? (
        /* ---- WhatsApp-style action bar (appears when chats are selected) ---- */
        <div className="h-14 flex items-center gap-0.5 px-1.5 shrink-0 z-20" style={{ background: "var(--gb-header)" }}>
          <button
            onClick={() => setSelected(new Set())}
            aria-label="clear selection"
            className="p-2 rounded-full text-white hover:bg-white/10 transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
          <span className="flex-1 text-white font-medium text-[16px] pl-1">{selected.size} selected</span>
          {actionBtn(allPinned ? "Unpin" : "Pin", () => void bulkUpdate({ pinned: !allPinned }), <Pin size={20} className={allPinned ? "rotate-45" : ""} />)}
          {actionBtn(allMuted ? "Unmute" : "Mute", () => void bulkUpdate({ muted: !allMuted }), allMuted ? <Volume2 size={20} /> : <VolumeOff size={20} />)}
          {actionBtn(allArchived ? "Unarchive" : "Archive", () => void bulkUpdate({ archived: !allArchived }), allArchived ? <ArchiveRestore size={20} /> : <Archive size={20} />)}
          {actionBtn("Clear chat", () => setClearIds([...selected]), <Eraser size={20} />)}
          {actionBtn("Delete chat", () => setDelIds([...selected]), <Trash2 size={20} />)}
        </div>
      ) : (
        <ScreenHeader
          title={searchMode ? undefined : "GB Chat"}
          left={
            searchMode ? (
              <div className="flex items-center flex-1 h-9 bg-white/15 rounded-full px-3 gap-2 -mr-2">
                <Search size={15} className="text-white/80" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 bg-transparent text-white text-[14px] outline-none placeholder:text-white/60"
                />
                <button
                  onClick={() => {
                    setSearchMode(false);
                    setSearch("");
                  }}
                  aria-label="close search"
                >
                  <X size={18} className="text-white" />
                </button>
              </div>
            ) : undefined
          }
          right={
            !searchMode && (
              <>
                <HeaderIcon label="camera" onClick={() => toast("Camera is not available in demo mode 📷")}>
                  <Camera size={21} />
                </HeaderIcon>
                <HeaderIcon label="search" onClick={() => setSearchMode(true)}>
                  <Search size={20} />
                </HeaderIcon>
                <div className="relative">
                  <HeaderIcon label="menu" onClick={() => setMenuOpen(!menuOpen)}>
                    <MoreVertical size={20} />
                  </HeaderIcon>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-1 top-10 z-40 w-52 rounded-lg shadow-2xl overflow-hidden bg-[var(--gb-panel)] border border-[var(--gb-border)] py-1 text-[15px] text-[var(--gb-text)]">
                        {[
                          { label: "New group", action: () => pushView({ name: "newgroup" }) },
                          { label: "Invite friends", action: () => pushView({ name: "invite" }) },
                          { label: "Starred messages", action: () => pushView({ name: "starred" }) },
                          { label: `Archived (${archivedCount})`, action: () => pushView({ name: "archived" }) },
                          { label: "Settings", action: () => pushView({ name: "settings" }) },
                        ].map((item) => (
                          <button
                            key={item.label}
                            onClick={() => {
                              setMenuOpen(false);
                              item.action();
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-[var(--gb-panel-2)]"
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )
          }
        />
      )}

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {archivedCount > 0 && !search && !selecting && (
          <button
            onClick={() => pushView({ name: "archived" })}
            className="w-full flex items-center gap-4 px-4 py-3 hover:bg-[var(--gb-panel-2)] transition-colors"
          >
            <Archive size={20} className="text-[var(--gb-accent)] ml-1" />
            <span className="flex-1 text-left text-[15px] text-[var(--gb-text)]">Archived</span>
            {archivedUnread > 0 && (
              <span className="text-[11px] font-bold text-[var(--gb-accent)]">{archivedUnread}</span>
            )}
          </button>
        )}

        {!chatsLoaded && (
          <div className="p-8 text-center text-[var(--gb-text-2)] text-sm">Loading chats...</div>
        )}

        {chatsLoaded && filtered.length === 0 && search && (
          <div className="p-8 text-center text-[var(--gb-text-2)] text-sm">
            No chats found for &quot;{search}&quot;
          </div>
        )}
        {chatsLoaded && filtered.length === 0 && !search && (
          <div className="p-10 text-center">
            <MessageCirclePlus size={40} className="mx-auto text-[var(--gb-text-2)]" />
            <p className="mt-3 text-[var(--gb-text-2)] text-sm">Start a new chat</p>
          </div>
        )}

        {filtered.map((chat) => {
          const preview = lastMsgPreview(chat, me?.id || "");
          const isOnline = chat.otherUser && online.has(chat.otherUser.id);
          const isSelected = selected.has(chat.id);
          return (
            <button
              key={chat.id}
              onClick={() => onRowClick(chat)}
              onContextMenu={(e) => {
                e.preventDefault();
                suppressClick.current = true;
                if (navigator.vibrate) navigator.vibrate(15);
                setSelected(new Set([chat.id]));
              }}
              onPointerDown={(e) => startPress(chat, e)}
              onPointerMove={movePress}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--gb-panel-2)] active:bg-[var(--gb-panel-2)] transition-colors text-left select-none"
              style={
                isSelected
                  ? { background: "color-mix(in srgb, var(--gb-accent) 14%, transparent)" }
                  : undefined
              }
            >
              <GbAvatar
                name={chat.type === "group" ? chat.emoji : chat.name}
                color={chat.color}
                emoji={chat.type === "group" ? chat.emoji : chat.otherUser?.avatarEmoji}
                url={chat.type === "individual" ? chat.otherUser?.avatarUrl : undefined}
                online={isOnline}
                size={49}
              />
              <div className="flex-1 min-w-0 border-b border-[var(--gb-border)] pb-2.5 -my-2.5 pt-1">
                <div className="flex items-center gap-2">
                  {chat.pinned && <Pin size={13} className="text-[var(--gb-text-2)] rotate-45 shrink-0" />}
                  <span className="flex-1 truncate text-[16px] text-[var(--gb-text)] font-medium">
                    {chat.type === "group" ? chat.name : chat.name}
                  </span>
                  <span
                    className={`text-[12px] shrink-0 ${
                      chat.unread > 0 ? "text-[var(--gb-accent)] font-semibold" : "text-[var(--gb-text-2)]"
                    }`}
                  >
                    {formatListTime(chat.updatedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {preview.mine && !preview.deleted && (
                    <Ticks status={preview.tick || "sent"} />
                  )}
                  {chat.muted && <VolumeOff size={13} className="text-[var(--gb-text-2)] shrink-0" />}
                  <span className="flex-1 truncate text-[14px] text-[var(--gb-text-2)]">
                    {chat.type === "group" && chat.lastMessage && !preview.deleted && (
                      <span className="text-[var(--gb-text-2)]">
                        {preview.mine ? "You" : chat.lastMessage.senderName.split(" ")[0]}:{" "}
                      </span>
                    )}
                    {preview.icon}
                    {preview.deleted ? (
                      <span className="italic"> This message was deleted</span>
                    ) : (
                      <span> {preview.text}</span>
                    )}
                  </span>
                  {chat.unread > 0 && !isSelected && (
                    <span
                      className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-white text-[11px] font-bold flex items-center justify-center"
                      style={{ background: "var(--gb-unread)" }}
                    >
                      {chat.unread}
                    </span>
                  )}
                  {isSelected && (
                    <span
                      className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white"
                      style={{ background: "var(--gb-accent)" }}
                    >
                      <Check size={13} />
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
        <div className="h-2" />
      </div>

      {!selecting && (
        <button
          onClick={() => pushView({ name: "newchat" })}
          aria-label="new chat"
          className="absolute bottom-[76px] right-4 w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform z-10"
          style={{ background: "var(--gb-accent)" }}
        >
          <MessageCirclePlus size={24} />
        </button>
      )}

      {/* clear chat confirm dialog */}
      {clearIds && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-6" onClick={() => !busy && setClearIds(null)}>
          <div
            className="w-full max-w-[320px] rounded-2xl p-5 bg-[var(--gb-panel)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center">
                <Eraser size={18} className="text-amber-500" />
              </span>
              <h3 className="font-semibold text-[16px] text-[var(--gb-text)]">
                {clearNames.length > 1 ? `Clear ${clearNames.length} chats?` : "Clear chat?"}
              </h3>
            </div>
            <p className="text-[13.5px] text-[var(--gb-text-2)] leading-relaxed mb-4">
              {clearNames.length > 1 ? (
                <>All messages in <b className="text-[var(--gb-text)]">{clearNames.length} chats</b> will be removed. The chats will stay in your list.</>
              ) : (
                <>All messages in <b className="text-[var(--gb-text)]">{clearNames[0]}</b> will be removed. The chat will stay in your list.</>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setClearIds(null)}
                disabled={busy}
                className="px-4 h-9 rounded-full text-[13px] font-medium text-[var(--gb-accent)] hover:bg-[var(--gb-panel-2)]"
              >
                CANCEL
              </button>
              <button
                onClick={confirmClear}
                disabled={busy}
                className="px-5 h-9 rounded-full text-[13px] font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60"
              >
                {busy ? "CLEARING..." : "CLEAR"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* delete chat confirm dialog */}
      {delIds && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-6" onClick={() => !busy && setDelIds(null)}>
          <div
            className="w-full max-w-[320px] rounded-2xl p-5 bg-[var(--gb-panel)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center">
                <Trash2 size={18} className="text-red-500" />
              </span>
              <h3 className="font-semibold text-[16px] text-[var(--gb-text)]">
                {delNames.length > 1 ? `Delete ${delNames.length} chats?` : "Delete chat?"}
              </h3>
            </div>
            <p className="text-[13.5px] text-[var(--gb-text-2)] leading-relaxed mb-4">
              {delNames.length > 1 ? (
                <><b className="text-[var(--gb-text)]">{delNames.length} chats</b> will be removed from your list along with all their messages. This cannot be undone.</>
              ) : (
                <><b className="text-[var(--gb-text)]">{delNames[0]}</b> will be removed from your list along with all its messages. This cannot be undone.</>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDelIds(null)}
                disabled={busy}
                className="px-4 h-9 rounded-full text-[13px] font-medium text-[var(--gb-accent)] hover:bg-[var(--gb-panel-2)]"
              >
                CANCEL
              </button>
              <button
                onClick={confirmDelete}
                disabled={busy}
                className="px-5 h-9 rounded-full text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60"
              >
                {busy ? "DELETING..." : "DELETE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
