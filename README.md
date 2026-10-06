# Momentum

Momentum is an installable web app (PWA) with daily, weekly, monthly, quarterly and yearly checklists for building a career. Every item comes from Austin labor market data or published research on job searching and long-term success. You can add it to an iPhone Home Screen, and it syncs with the same app on a computer.

**Live app:** https://matthew-uhlar.github.io/momentum/

![Momentum demo](momentum-demo.gif)

## Features

- Five checklists that reset at the start of each day, week, month, quarter and year.
- A 14-day history strip for the daily list.
- Each item is tagged "research" (linked to a numbered source) or "practice".
- A Why tab with the Austin market snapshot and the studies behind each habit.
- Works offline. Changes are saved on the device and sync when the connection comes back.
- Item-level merge. Each checkbox carries a timestamp, so edits made on a phone and a laptop at the same time combine instead of overwriting each other.

## How it works

| Part | Details |
| --- | --- |
| Front end | Plain HTML, CSS and JavaScript with no build step and no framework. |
| Install | Web app manifest, Apple touch icon and a service worker that caches the app shell. |
| Auth | Supabase Auth (email and password), called directly through its REST API. |
| Sync | One `checks` row per user per period (`d-2026-10-05`, `w-2026-10-05`, `m-2026-10`, `q-2026-Q4`, `y-2026`). The client pulls, merges by timestamp and upserts. |
| Security | Row level security limits each account to its own rows. The browser only holds the publishable key. See `supabase-schema.sql`. |
| Hosting | GitHub Pages. |

## Install on iPhone

1. Open https://matthew-uhlar.github.io/momentum/ in Safari.
2. Tap Share, then **Add to Home Screen**.
3. Open Momentum from the Home Screen and sign in.

On a computer, open the same link in Chrome or Edge and choose **Install** in the address bar, or just bookmark it.

## Run locally

Serve the folder with any static server, for example `python -m http.server 8080`, then open http://localhost:8080. Point `config.js` at your own Supabase project and run `supabase-schema.sql` in its SQL editor.
