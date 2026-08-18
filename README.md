# NexaCore People — Deployment

This is a ready-to-run project wrapping the NexaCore People app. Follow these steps in order.

## 1. Install Node.js (skip if already installed)

Download from https://nodejs.org — get the LTS version. This gives you `node` and `npm`.

## 2. Install the project's dependencies

Open a terminal in this folder and run:

```
npm install
```

This downloads React, Vite, Tailwind, and lucide-react — the libraries the app needs.

## 3. Run it locally to check it works

```
npm run dev
```

This prints a local URL (usually `http://localhost:5173`). Open it in your browser — you should see the NexaCore login screen, styled correctly. If it looks completely unstyled (no colors, no layout), Tailwind isn't picking up — double check `tailwind.config.js` and `postcss.config.js` are present and unedited.

## 4. Put it on GitHub

1. Create a free account at https://github.com if you don't have one.
2. Create a new repository (e.g. `nexacore-people`).
3. In this folder, run:

```
git init
git add .
git commit -m "Initial deploy"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/nexacore-people.git
git push -u origin main
```

## 5. Deploy it publicly with Vercel (recommended — free)

1. Go to https://vercel.com and sign up using your GitHub account.
2. Click "Add New Project" and select the `nexacore-people` repository you just pushed.
3. Vercel auto-detects Vite. Leave the default settings and click **Deploy**.
4. In a minute or two, you'll get a live public URL like `nexacore-people.vercel.app`.

That URL is now public — anyone with the link can open it, create a business account, and use the app.

### Alternative: Netlify

Same idea — https://netlify.com, "Add new site" → "Import an existing project" → connect GitHub → deploy. Build command: `npm run build`. Publish directory: `dist`.

### Alternative: no GitHub, drag-and-drop

Run `npm run build` locally, then drag the resulting `dist` folder onto https://app.netlify.com/drop. Instant public URL, no account setup beyond that.

## 6. Optional: a custom domain

Both Vercel and Netlify let you attach your own domain (e.g. `payroll.yourbusiness.co.tz`) for free once you own the domain — under the project's "Domains" settings, add the domain and follow the DNS instructions they give you.

## Important: what "public" actually means here

Once deployed, the app is publicly reachable, but it's still the same client-side app — every visitor's data lives in *their own browser's* storage, encrypted with *their own* passcode. There's no shared server database, no way for you to see or manage other people's businesses, and no real user directory. That's fine for a public demo or an early trial with real users who each just want their own private instance — it is **not** yet ready for real employee data or government filings. See `nexacore-path-to-production.md` for what that actually requires.
