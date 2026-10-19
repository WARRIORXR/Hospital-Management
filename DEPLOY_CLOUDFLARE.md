# Deploy QueueLess Frontend on Cloudflare Pages ⛅

This guide explains how to deploy the **QueueLess Next.js frontend** on **Cloudflare Pages** and connect it to your hosted FastAPI backend (e.g., on Render).

---

## 🌐 Architecture Overview

- **Frontend:** Hosted on Cloudflare Pages' global edge network (`https://queueless.pages.dev` or your custom domain).
- **Backend API & Database:** Hosted on Render (`https://queueless-api-lvf5.onrender.com`) running FastAPI and PostgreSQL.
- **Connection:** The frontend communicates with the backend via `NEXT_PUBLIC_API_URL`.

---

## Method 1: Automated Git Deployment (Recommended)

Connecting your GitHub repository to Cloudflare Pages enables automatic builds and deployments on every `git push origin main`.

### Steps:

1. **Sign in to Cloudflare Dashboard:**
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Create Pages Application:**
   - In the sidebar, navigate to **Compute (Workers & Pages)** → **Create application** → **Pages** tab.
   - Click **Connect to Git**.
3. **Select Repository:**
   - Authorize Cloudflare with your GitHub account (`WARRIORXR`).
   - Select the repository: `WARRIORXR/Hospital-Management`.
4. **Configure Build Settings:**
   - **Project name:** `queueless` (or your choice, e.g., `hospital-management`).
   - **Production branch:** `main`
   - **Framework preset:** `Next.js (Static HTML Export)` or `None`
   - **Root directory:** `frontend`
   - **Build command:** `npm run build`
   - **Build output directory:** `out`
5. **Set Environment Variables:**
   Under **Environment variables (advanced)**, add:
   - `NEXT_PUBLIC_API_URL`: `https://queueless-api-lvf5.onrender.com` (or your Render API URL)
   - `NODE_VERSION`: `20`
6. **Deploy:**
   - Click **Save and Deploy**.
   - Cloudflare will build the Next.js frontend and provide your live URL:  
     👉 **`https://queueless.pages.dev`**

---

## Method 2: Deploy via Wrangler CLI

You can also deploy directly from your local terminal using Cloudflare's Wrangler CLI:

```bash
# 1. Navigate to the frontend directory
cd frontend

# 2. Authenticate Wrangler with Cloudflare
npx wrangler login
# (Or set CLOUDFLARE_API_TOKEN environment variable)

# 3. Build the static production bundle
npm run build

# 4. Deploy to Cloudflare Pages
npx wrangler pages deploy out --project-name queueless
```

---

## 🔄 Updating Backend CORS for Cloudflare

Ensure your backend accepts requests from your Cloudflare Pages domain:
1. In `render.yaml` or Render Environment Settings for `queueless-api`:
2. Add your Cloudflare domain to `FRONTEND_ORIGINS`:
   ```env
   FRONTEND_ORIGINS=https://queueless.pages.dev,https://queueless-web.onrender.com
   ```
3. Redeploy the backend so cross-origin requests are permitted.
