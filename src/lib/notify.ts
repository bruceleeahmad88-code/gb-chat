"use client";

/** GB Chat — WhatsApp-style system notifications (ROUND 12).
 *
 *  Uses the browser Notification API so a message / call / missed call that
 *  arrives while the app is in a BACKGROUND tab still pings the user like the
 *  real WhatsApp desktop does. In-app toasts remain untouched — system
 *  notifications fire only when the tab is hidden or unfocused. */

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notifyPermission(): NotificationPermission | "unsupported" {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

/** Ask once — called right after login AND on the first user tap (Chrome only
 *  shows the prompt inside a user-gesture chain). */
export function askNotifyPermission(): void {
  try {
    if (!notificationsSupported()) return;
    if (Notification.permission === "default") void Notification.requestPermission();
  } catch {
    /* ignore */
  }
}

/** Keep asking until a gesture unlocks it (silent no-op once granted/denied) */
export function armNotifyGesture(): void {
  if (!notificationsSupported() || Notification.permission !== "default") return;
  const ask = () => {
    askNotifyPermission();
    for (const ev of ["pointerdown", "touchend", "keydown"] as const) {
      document.removeEventListener(ev, ask);
    }
  };
  for (const ev of ["pointerdown", "touchend", "keydown"] as const) {
    document.addEventListener(ev, ask, { once: true });
  }
}

/** Fire a system notification. Skips silently when the tab is visible & focused
 *  (the in-app UI already shows the event), when permission is missing, or when
 *  notifications are disabled in settings — the caller checks settings. */
export function sysNotify(
  title: string,
  body: string,
  opts: { tag?: string; silent?: boolean; onClick?: () => void } = {}
): void {
  try {
    if (!notificationsSupported() || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible" && document.hasFocus()) return;
    const n = new Notification(title, {
      body,
      tag: opts.tag,
      silent: !!opts.silent,
      icon: "/logo.svg",
      badge: "/logo.svg",
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      opts.onClick?.();
      n.close();
    };
    // auto-dismiss like WhatsApp banners
    setTimeout(() => {
      try {
        n.close();
      } catch {
        /* already closed */
      }
    }, 6000);
  } catch {
    /* ignore */
  }
}
