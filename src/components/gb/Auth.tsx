"use client";

/** GB Chat — splash, welcome, signup (Gmail) and username login screens */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MessageCircleMore, Mail, User as UserIcon, Lock, Eye, EyeOff, ChevronRight, ShieldCheck, ArrowRight, BadgeCheck, UserRoundPlus } from "lucide-react";
import { api } from "@/lib/gb-api";
import type { Me } from "@/lib/gb-types";
import { useGB } from "@/lib/gb-store";

const AVATAR_COLORS = ["0ea47a", "0288d1", "7b1fa2", "e91e63", "f57c00", "e53935", "3949ab", "00897b"];

export function Splash() {
  return (
    <div className="h-full flex flex-col items-center justify-center" style={{ background: "var(--gb-panel)" }}>
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
        className="w-24 h-24 rounded-[26px] flex items-center justify-center shadow-xl"
        style={{ background: "var(--gb-accent)" }}
      >
        <MessageCircleMore size={52} className="text-white" strokeWidth={1.8} />
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mt-6 text-[28px] font-bold text-[var(--gb-text)]"
      >
        GB Chat
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
        className="text-[var(--gb-text-2)] text-[13px] mt-1"
      >
        simple. secure. reliable messaging
      </motion.p>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="absolute bottom-10 flex flex-col items-center gap-2"
      >
        <div className="w-40 h-1 rounded-full overflow-hidden bg-[var(--gb-border)]">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "var(--gb-accent)" }}
            initial={{ width: "5%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.6, ease: "easeInOut" }}
          />
        </div>
        <span className="text-[11px] text-[var(--gb-text-2)]">from GB MODS</span>
      </motion.div>
    </div>
  );
}

/* ---------------- Welcome ---------------- */
export function Welcome({ onSignup, onLogin }: { onSignup: () => void; onLogin: () => void }) {
  return (
    <div className="h-full flex flex-col" style={{ background: "var(--gb-panel)" }}>
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="w-24 h-24 rounded-[26px] flex items-center justify-center shadow-lg" style={{ background: "var(--gb-accent)" }}>
          <MessageCircleMore size={52} className="text-white" strokeWidth={1.8} />
        </div>
        <h1 className="mt-6 text-[30px] font-bold text-[var(--gb-text)]">Welcome to GB Chat</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--gb-text-2)] max-w-[300px]">
      To create your account you only need a <span className="font-medium text-[var(--gb-text)]">Gmail</span> address — no phone number required. Later you can log in with just your{" "}
          <span className="font-medium text-[var(--gb-text)]">username</span>.
        </p>
        <div className="mt-6 flex flex-col gap-2.5 w-full max-w-[300px]">
          {[
            { icon: <Mail size={16} />, text: "Sign up with Gmail — no number" },
            { icon: <UserIcon size={16} />, text: "Log in with username, anytime" },
            { icon: <ShieldCheck size={16} />, text: "GB privacy features built-in" },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-3 justify-center text-[13px] text-[var(--gb-text-2)]">
              <span className="text-[var(--gb-accent)]">{f.icon}</span>
              {f.text}
            </div>
          ))}
        </div>
      </div>
      <div className="p-6 pb-8 border-t border-[var(--gb-border)]">
        <button
          onClick={onSignup}
          className="w-full h-12 rounded-full text-white font-medium text-[15px] flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.99] transition"
          style={{ background: "var(--gb-accent)" }}
        >
          Agree and continue <ChevronRight size={18} />
        </button>
        <button
          onClick={onLogin}
          className="w-full h-11 mt-3 rounded-full font-medium text-[14px] text-[var(--gb-accent)] border border-[var(--gb-accent)]/60 hover:bg-[var(--gb-accent)]/5 transition"
        >
          Already have an account? Log in
        </button>
        <p className="mt-4 text-[11px] text-center text-[var(--gb-text-2)] leading-relaxed">
          This is a demo messaging app. Logging in means you agree to our Terms & Privacy Policy.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Signup (Gmail + OTP simulation) ---------------- */
export function Signup({
  onDone,
  onBack,
  goLogin,
}: {
  onDone: (token: string, me: Me) => void;
  onBack: () => void;
  goLogin: () => void;
}) {
  const [step, setStep] = useState<"email" | "otp" | "profile">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [demoCode, setDemoCode] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // invite code: auto-filled from ?ref= link, or typed manually — links both accounts as private contacts
  const [invite, setInvite] = useState(() => {
    if (typeof window === "undefined") return "";
    const ref = new URLSearchParams(window.location.search).get("ref");
    return ref ? ref.trim().toLowerCase() : "";
  });
  const toast = useGB((s) => s.toast);

  // inviter's name for the "?ref=" link — shows "X invited you" on signup (WhatsApp-style)
  const [inviter, setInviter] = useState<string | null>(null);
  useEffect(() => {
    if (!invite) {
      setInviter(null);
      return;
    }
    let alive = true;
    api<{ name: string }>(`/api/invite/${encodeURIComponent(invite)}`)
      .then((r) => {
        if (alive) setInviter(r.name);
      })
      .catch(() => {
        if (alive) setInviter(null);
      });
    return () => {
      alive = false;
    };
  }, [invite]);

  const emailValid = /^[a-z0-9][a-z0-9._%+-]*@gmail\.com$/.test(email.trim().toLowerCase());

  const sendOtp = () => {
    if (!emailValid) {
      setErr("Enter a valid Gmail address (e.g. you@gmail.com)");
      return;
    }
    setErr("");
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setDemoCode(code);
    setStep("otp");
    toast(`Demo OTP sent to your Gmail 📧 (Code: ${code})`);
  };

  const verifyOtp = () => {
    if (otp.join("") === demoCode) {
      setErr("");
      setStep("profile");
    } else {
      setErr("Wrong OTP — please check again");
    }
  };

  const finish = async () => {
    if (name.trim().length < 2) return setErr("Please enter your full name");
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return setErr("Username: lowercase letters, numbers, _ (3-20 chars)");
    if (password.length < 4) return setErr("Password must be at least 4 characters");
    setErr("");
    setBusy(true);
    try {
      const res = await api<{ token: string; me: Me; invitedBy?: string | null }>("/api/auth/signup", {
        method: "POST",
        body: {
          email: email.trim().toLowerCase(),
          name: name.trim(),
          username: username.trim().toLowerCase(),
          password,
          avatarColor: color,
          invite: invite.trim().toLowerCase(),
        },
      });
      if (res.invitedBy) toast(`Connected with ${res.invitedBy} 🎉`);
      // clean the ?ref= URL so the logged-in auto-add hook doesn't re-trigger
      window.history.replaceState({}, "", window.location.pathname);
      onDone(res.token, res.me);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--gb-panel)" }}>
      <div className="h-14 flex items-center px-3 shrink-0" style={{ background: "var(--gb-header)" }}>
        <button onClick={step === "email" ? onBack : () => setStep(step === "profile" ? "email" : "email")} className="p-1.5 rounded-full hover:bg-white/10 text-white">
          <ArrowRight size={22} className="rotate-180" />
        </button>
        <div className="ml-3 text-white font-medium">
          {step === "email" ? "Sign up with Gmail" : step === "otp" ? "Verify OTP" : "Profile setup"}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-8">
        {inviter && (
          <div
            className="mb-5 flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: "var(--gb-accent)", color: "#fff" }}
          >
            <UserRoundPlus size={20} className="shrink-0" />
            <div className="text-[13.5px] leading-snug">
              <span className="font-semibold">{inviter}</span> invited you to GB Chat — sign up and you'll both be connected automatically.
            </div>
          </div>
        )}
        {step === "email" && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "var(--gb-accent)" }}>
                <Mail size={26} className="text-white" />
              </div>
              <div className="text-[13px] text-[var(--gb-text-2)] leading-snug">
                Enter your Gmail address. The verification code will be sent there.
              </div>
            </div>
            <label className="text-[12px] font-medium text-[var(--gb-accent)]">GMAIL ADDRESS</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendOtp()}
              placeholder="youremail@gmail.com"
              type="email"
              autoFocus
              className="w-full mt-1 h-11 px-3 rounded-lg bg-transparent border-b-2 border-[var(--gb-accent)] text-[16px] text-[var(--gb-text)] outline-none placeholder:text-[var(--gb-text-2)]/60"
            />
            <p className="mt-2 text-[12px] text-[var(--gb-text-2)]">Only @gmail.com addresses are supported.</p>
            {err && <p className="mt-2 text-[13px] text-red-500">{err}</p>}
            <button
              onClick={sendOtp}
              className="w-full h-12 mt-6 rounded-full text-white font-medium flex items-center justify-center gap-2"
              style={{ background: "var(--gb-accent)" }}
            >
              Next <ChevronRight size={18} />
            </button>
          </div>
        )}

        {step === "otp" && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "var(--gb-accent)" }}>
                <ShieldCheck size={26} className="text-white" />
              </div>
              <div className="text-[13px] text-[var(--gb-text-2)] leading-snug">
                A 6-digit code was sent to <span className="font-medium text-[var(--gb-text)]">{email}</span>.
              </div>
            </div>
            <div className="flex gap-2 justify-center my-4" dir="ltr">
              {otp.map((d, i) => (
                <input
                  key={i}
                  id={`otp-${i}`}
                  value={d}
                  inputMode="numeric"
                  maxLength={1}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, "");
                    const next = [...otp];
                    next[i] = v;
                    setOtp(next);
                    if (v && i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
                  }}
                  className="w-11 h-13 text-center text-[20px] font-semibold rounded-lg border-2 border-[var(--gb-border)] focus:border-[var(--gb-accent)] outline-none text-[var(--gb-text)] bg-transparent"
                  style={{ height: 52 }}
                />
              ))}
            </div>
            <div className="text-center text-[12px] text-[var(--gb-text-2)]">
              Demo mode: your code is <span className="font-bold text-[var(--gb-text)] tracking-widest">{demoCode}</span>
            </div>
            {err && <p className="mt-2 text-[13px] text-red-500 text-center">{err}</p>}
            <button
              onClick={verifyOtp}
              className="w-full h-12 mt-6 rounded-full text-white font-medium"
              style={{ background: "var(--gb-accent)" }}
            >
              Verify
            </button>
            <button onClick={sendOtp} className="w-full mt-3 text-[13px] text-[var(--gb-accent)]">
              Resend code
            </button>
          </div>
        )}

        {step === "profile" && (
          <div className="pb-6">
            <div className="flex flex-col items-center mb-5">
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-[30px] font-semibold" style={{ background: `#${color}` }}>
                {name.trim() ? name.trim()[0].toUpperCase() : "?"}
              </div>
              <div className="flex gap-2 mt-4">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    aria-label={`color ${c}`}
                    className={`w-6 h-6 rounded-full transition ${color === c ? "ring-2 ring-offset-2 ring-[var(--gb-text-2)] scale-110" : ""}`}
                    style={{ background: `#${c}` }}
                  />
                ))}
              </div>
            </div>

            <label className="text-[12px] font-medium text-[var(--gb-accent)]">YOUR NAME</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full mt-1 h-11 px-3 rounded-lg bg-transparent border-b-2 border-[var(--gb-border)] focus:border-[var(--gb-accent)] text-[16px] text-[var(--gb-text)] outline-none"
            />

            <label className="block mt-5 text-[12px] font-medium text-[var(--gb-accent)]">USERNAME (FOR LOGIN)</label>
            <div className="flex items-center border-b-2 border-[var(--gb-border)] focus-within:border-[var(--gb-accent)] mt-1">
              <span className="pl-3 text-[var(--gb-text-2)]">@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="e.g. ali_khan"
                className="flex-1 h-11 px-2 bg-transparent text-[16px] text-[var(--gb-text)] outline-none"
              />
              {/^[a-z0-9_]{3,20}$/.test(username) && <BadgeCheck size={18} className="mr-3 text-[var(--gb-accent)]" />}
            </div>
            <p className="mt-1.5 text-[12px] text-[var(--gb-text-2)]">
              You'll use this username to log in — no number or Gmail needed again.
            </p>

            <label className="block mt-5 text-[12px] font-medium text-[var(--gb-accent)]">PASSWORD</label>
            <div className="flex items-center border-b-2 border-[var(--gb-border)] focus-within:border-[var(--gb-accent)] mt-1">
              <input
                value={password}
                type={showPass ? "text" : "password"}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 4 characters"
                className="flex-1 h-11 px-3 bg-transparent text-[16px] text-[var(--gb-text)] outline-none"
              />
              <button onClick={() => setShowPass(!showPass)} className="mr-2 text-[var(--gb-text-2)]" aria-label="show password">
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <label className="block mt-5 text-[12px] font-medium text-[var(--gb-accent)]">
              INVITE CODE (OPTIONAL)
            </label>
            <input
              value={invite}
              onChange={(e) => setInvite(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
              placeholder="Friend's invite code or GB number"
              dir="ltr"
              className="w-full mt-1 h-11 px-3 rounded-lg bg-transparent border-b-2 border-[var(--gb-border)] focus:border-[var(--gb-accent)] text-[16px] text-[var(--gb-text)] outline-none placeholder:text-[var(--gb-text-2)]/60"
            />
            <p className="mt-1.5 text-[12px] text-[var(--gb-text-2)]">
              Paste their invite code — or type their GB number (like 8831234456). You'll both be connected privately right away.
            </p>

            {err && <p className="mt-3 text-[13px] text-red-500">{err}</p>}
            <button
              onClick={finish}
              disabled={busy}
              className="w-full h-12 mt-6 rounded-full text-white font-medium disabled:opacity-60"
              style={{ background: "var(--gb-accent)" }}
            >
              {busy ? "Creating account..." : "Create account"}
            </button>
          </div>
        )}
      </div>

      {step === "email" && (
        <button onClick={goLogin} className="pb-6 text-[13px] text-[var(--gb-accent)]">
          Already have an account? Log in with username
        </button>
      )}
    </div>
  );
}

/* ---------------- Login (username only) ---------------- */
export function Login({ onDone, onBack, goSignup }: { onDone: (token: string, me: Me) => void; onBack: () => void; goSignup: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!username.trim() || !password) return setErr("Enter your username and password");
    setErr("");
    setBusy(true);
    try {
      const res = await api<{ token: string; me: Me }>("/api/auth/login", {
        method: "POST",
        body: { username: username.trim().toLowerCase(), password },
      });
      onDone(res.token, res.me);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--gb-panel)" }}>
      <div className="h-14 flex items-center px-3 shrink-0" style={{ background: "var(--gb-header)" }}>
        <button onClick={onBack} className="p-1.5 rounded-full hover:bg-white/10 text-white">
          <ArrowRight size={22} className="rotate-180" />
        </button>
        <div className="ml-3 text-white font-medium">Log in with username</div>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: "var(--gb-accent)" }}>
            <UserIcon size={38} className="text-white" />
          </div>
          <p className="mt-4 text-center text-[13px] text-[var(--gb-text-2)] max-w-[260px] leading-relaxed">
            No number or Gmail needed — just your username and password.
          </p>
        </div>

        <label className="text-[12px] font-medium text-[var(--gb-accent)]">USERNAME</label>
        <div className="flex items-center border-b-2 border-[var(--gb-border)] focus-within:border-[var(--gb-accent)] mt-1">
          <span className="pl-3 text-[var(--gb-text-2)]">@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="your_username"
            autoFocus
            className="flex-1 h-11 px-2 bg-transparent text-[16px] text-[var(--gb-text)] outline-none"
          />
        </div>

        <label className="block mt-5 text-[12px] font-medium text-[var(--gb-accent)]">PASSWORD</label>
        <div className="flex items-center border-b-2 border-[var(--gb-border)] focus-within:border-[var(--gb-accent)] mt-1">
          <input
            value={password}
            type={showPass ? "text" : "password"}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Password"
            className="flex-1 h-11 px-3 bg-transparent text-[16px] text-[var(--gb-text)] outline-none"
          />
          <button onClick={() => setShowPass(!showPass)} className="mr-2 text-[var(--gb-text-2)]" aria-label="show password">
            {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {err && <p className="mt-3 text-[13px] text-red-500">{err}</p>}

        <button
          onClick={submit}
          disabled={busy}
          className="w-full h-12 mt-8 rounded-full text-white font-medium disabled:opacity-60"
          style={{ background: "var(--gb-accent)" }}
        >
          {busy ? "Logging in..." : "Log in"}
        </button>

        <button onClick={goSignup} className="w-full mt-5 text-[13px] text-[var(--gb-text-2)]">
          New here? <span className="text-[var(--gb-accent)] font-medium">Sign up with Gmail</span>
        </button>
      </div>
    </div>
  );
}
