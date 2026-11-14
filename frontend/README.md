# Halfbaked Playlist — Frontend

Static Astro frontend for the collaborative playlist. Swiss grid, black and white, no UI framework — plain TypeScript, GSAP for motion, Lenis for scrolling.

## Requirements

- Node.js 20+ (developed on 24)
- The FastAPI backend running locally

## Setup

```sh
npm install
```

Copy `.env.example` to `.env` and point it at the backend:

```
PUBLIC_API_URL=http://127.0.0.1:8000
```

Use `127.0.0.1` rather than `localhost` so it matches the Spotify redirect URI used by the backend.

## Scripts

```sh
npm run dev      # dev server on http://127.0.0.1:4321
npm run build    # static build into dist/
npm run preview  # serve the built output
npm run check    # Astro + TypeScript diagnostics
```

## Running locally

1. Backend (from `backend/`, with its virtualenv active):

   ```sh
   python -m uvicorn app.main:app --reload --port 8000
   ```

2. Frontend (from `frontend/`):

   ```sh
   npm run dev
   ```

3. Open <http://127.0.0.1:4321>.

## What it does

- Searches Spotify through `GET /search` with debounced input and request cancellation.
- Adds the selected track through `POST /additions` with a username; the backend fetches canonical metadata and appends to the Spotify playlist.
- Renders the newest 50 additions and polls `/additions` + `/additions/stats` every 12 seconds for live updates.
- "Load older" pages back through the full history.
- Duplicate tracks return `409` and surface as a toast.

## Structure

```
src/
  components/    Header, SearchPanel, FeedPanel
  layouts/       Base document shell
  lib/api.ts     Typed API client and error mapping
  pages/         index.astro (page composition)
  scripts/       app.ts (client behavior, GSAP, Lenis)
  styles/        global.css (design system)
public/
  fonts/         TeX Gyre Heros WOFF2 + GUST license
```

## Design notes

- Typeface: TeX Gyre Heros (Helvetica clone), self-hosted; preloaded regular + bold.
- Artwork is rendered grayscale and desaturated until hover.
- Motion respects `prefers-reduced-motion`; GSAP and Lenis are skipped entirely when reduced motion is requested.
- Keyboard: `/` focuses search, `Esc` clears the search or closes the composer, arrow keys move through results.
