# StreamZone Deployment Guide

## Option A — Vercel only (Recommended)
Everything deploys to one place. Vercel handles the React frontend + runs
the proxy as serverless functions in `/api/`.

### Steps

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "initial"
   gh repo create streamzone --public --push
   # or: git remote add origin https://github.com/YOU/streamzone && git push -u origin main
   ```

2. **Import on Vercel**
   - Go to https://vercel.com → New Project → Import your repo
   - Framework: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Click **Deploy**

3. **Set environment variables** (Vercel dashboard → Settings → Environment Variables)
   ```
   SPORTSRC_KEY_1   = 276e4fed3f3ee938748bdddffacafded
   SPORTSRC_KEY_2   = d9f1eec2f1a57ceaf4d0b170c9e552f3
   VITE_TMDB_KEY    = your_tmdb_key_here
   ```
   Redeploy after setting env vars.

4. **Done.** Your site is live at `https://streamzone-xxx.vercel.app`

---

## Option B — Split: Vercel (frontend) + Railway (proxy)
Use this if SportSRC requires a whitelisted domain and you want a
stable backend URL to register.

### Railway (proxy)

1. Go to https://railway.app → New Project → Deploy from GitHub repo
2. Railway auto-detects Node — set the start command to `node server.js`
3. Set env vars in Railway dashboard:
   ```
   SPORTSRC_KEY_1   = 276e4fed3f3ee938748bdddffacafded
   SPORTSRC_KEY_2   = d9f1eec2f1a57ceaf4d0b170c9e552f3
   FRONTEND_ORIGIN  = https://your-vercel-app.vercel.app
   PORT             = 3001
   ```
4. Railway gives you a URL like `https://streamzone-proxy.up.railway.app`
5. Register THAT domain with SportSRC dashboard as the allowed host

### Vercel (frontend)

Same steps as Option A, but add one extra env var:
```
VITE_API_BASE = https://streamzone-proxy.up.railway.app
```
This tells the frontend to call your Railway proxy instead of Vercel functions.

---

## Option C — All on Railway

1. Railway → New Project → GitHub repo
2. Start command: `node server.js`  
   *(server.js already serves the Express API — add static file serving below)*
3. Add to the bottom of `server.js`:
   ```js
   import { fileURLToPath } from 'url';
   import path from 'path';
   const __dirname = path.dirname(fileURLToPath(import.meta.url));
   app.use(express.static(path.join(__dirname, 'dist')));
   app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'dist/index.html')));
   ```
4. Build the frontend first:
   ```bash
   npm run build
   git add dist -f   # force-add dist if .gitignored
   git commit -m "add dist"
   git push
   ```
5. Set env vars in Railway. No VITE_API_BASE needed (same origin).

---

## Local dev (reminder)
```bash
npm run dev:all   # starts proxy on :3001 + Vite on :5173
```
