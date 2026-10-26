# GB Chat — FREE Publish Guide (GitHub + Render + Neon)

Ye aap ka poora GB WhatsApp-style chat app hai — **same design, same features**.
Is ko internet par **100% FREE** publish karne ke liye 3 free services use hongi:

| Service | Kaam | Cost |
|---------|------|------|
| **GitHub** | Aap ka code save rakhega | Free |
| **Neon** | Database (accounts, messages, photos) | Free |
| **Render** | App ko chalayega + live link dega | Free |

> **Note:** GitHub Pages sirf static pages chala sakta hai (server/database nahi).
> Is app me accounts, real chat aur calls ke liye server chahiye — is liye code
> GitHub par rahega aur Render usi se app chalayega. Sab free hai.

Deploy hone ke baad aap ko ek **live link** milega jaise:
`https://gb-chat-xxxx.onrender.com` — ye link kisi ko bhi bhej sakte hain,
duniya mein kahin se bhi khol sakte hain (mobile/laptop, har device par).

---

## STEP 1 — Code GitHub par upload karein (5 minute)

1. **https://github.com** par jayein → Sign up (ya login)
2. Right-top par **+** icon → **New repository**
3. Repository name: `gb-chat` | Visibility: **Public** → **Create repository**
4. Ab page par **"uploading an existing file"** ka link click karein
5. Is ZIP ko pehle **extract** karein — us ke andar ki **SAB files aur folders**
   (`src`, `public`, `prisma`, `package.json`, `server.js`, `render.yaml` waghera)
   select kar ke **drag karke GitHub ke upload box par drop** kar dein
6. Neeche **Commit changes** button dabayein
7. Upload complete hone tak intezaar karein (2–3 minute)

## STEP 2 — Free database banayein — Neon (3 minute)

1. **https://neon.com** par jayein → **Sign up with GitHub**
2. **Create project** dabayein (naam kuch bhi — `gb-chat`)
3. Dashboard par **Connection string** copy karein. Ye aisa hoga:
   ```
   postgresql://user:xxxxxxxx@ep-xxxx.neon.tech/neondb?sslmode=require
   ```
4. Is string ko Notepad me save kar lein — agle step me chahiye

## STEP 3 — App deploy karein — Render (5 minute + build)

1. **https://render.com** par jayein → **Sign in with GitHub** → access **Allow** karein
2. Dashboard par **New +** → **Blueprint** select karein
3. Apna `gb-chat` repository choose karein → **Connect**
4. Render khud `render.yaml` parh lega (settings already set hain)
5. Sirf **DATABASE_URL** ke box me STEP 2 wali connection string **paste** karein
6. **Apply** (ya **Create Resources**) dabayein
7. Build **5–10 minute** leta hai — logs chalte dikhenge
8. Done! Page ke upar aap ka **FREE live link** aajayega 🎉

---

## Pehli baar app kholein

1. Link kholein → **Sign up with Gmail** (koi bhi Gmail + password + username)
2. Aap ko apna **GB number** milega (jaise `+88 4221 5267`)
3. Doosre device se doosra account banayein (dost/bhai ka)
4. **Settings → Invite friends** se number/link share karein, ya
   **New chat → Add contact** me GB number daal kar add karein
5. Chat, photos, videos, voice notes, GIFs, **voice/video calls** — sab chalega!

## App ko update karna (baad me)

- GitHub repository me koi bhi file edit karein (ya nayi upload karein)
- Render khud-ba-khud nayi version deploy kar dega

## Zaroori baatein (free plan ki)

- **Cold start:** Free plan par app 15 minute idle ke baad so jati hai.
  Agli khulne par ~1 minute lag sakta hai ("waking up" dikhega) — ye normal hai.
  **Trick:** https://cron-job.org par free account banayein → apne app ke link ka
  har 10 minute wala ping bana dein → app hamesha jaagi rahegi.
- **Media storage:** Photos/videos/voice notes database (Neon) me store hote hain.
  Neon free = 0.5 GB — personal use ke liye kaafi. Barhane ho to Neon ka cheap plan le sakte hain.
- **Calls:** Voice/video calls direct device-to-device (WebRTC) hoti hain — server ka
  bandwidth use nahi hota. Kam network par bhi call chalti rehti hai (fallback mode).

## Masla aaye to (Troubleshooting)

| Masla | Hal |
|-------|-----|
| Build fail ho gaya | Render → apni service → **Events/Logs** dekhein; phir se **Manual Deploy → Clear build cache & deploy** try karein |
| Database error aaye | Render → **Environment** → DATABASE_URL dobara check karein (poori string, `?sslmode=require` ke sath) |
| App 1 minute load ho rahi hai | Free plan ka cold start — normal hai (upar wali trick use karein) |
| Doosra user offline dikhta hai | Wo apna app khole rakhe (minimize na ho) — presence live hai |
| Notification nahi aa rahi | Browser me notification permission **Allow** karein (site settings se) |

## Local computer par chalana (optional)

```bash
npm install
# .env file banayein (.env.example dekhein) — DATABASE_URL Neon wali
npx prisma db push
node server.js
# http://localhost:3000
```

---

**Files ka short intro:**

| File | Kaam |
|------|------|
| `src/` | Poora app (design + features + API) |
| `server.js` | Production server (Next.js + realtime socket ek sath) |
| `prisma/schema.prisma` | Database ka design |
| `render.yaml` | Render deploy ki ready-made settings |
| `package.json` | Project ki dependencies aur commands |
