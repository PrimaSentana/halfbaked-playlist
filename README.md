# Halfbaked Playlist

A shared Spotify playlist just for fun.

Search a song, sign your name, and it lands in one playlist everyone can listen to.

Live site: **https://www.halfbaked.web.id**

---

## Why I built this

I built Halfbaked Playlist as a small side project for my campus. I wanted a
place where people could drop their favourite tracks and show what they
actually listen to. Not just the songs everyone already knows, but the weird
stuff, the guilty pleasures, the local bands, the 3 a.m. discoveries.

The idea is simple: share your music taste, find something new from someone
else, and get a rough picture of what PNB sounds like. Any genre is welcome.
There is no gatekeeping, no follower count, and no algorithm deciding what
matters. Just one playlist built by the people on campus, for fun.

---

## What it does

- **Search the Spotify catalogue** directly from the site.
- **Add a track with your name**, which appends it to the shared Spotify
  playlist in real time.
- **See recent additions** with who added each track and when — the history of
  how the playlist was built.
- **See the live playlist** (the newest 50 tracks as Spotify actually has them),
  numbered by their real playlist position, with a link to the full playlist.
- **Duplicate protection** — one row per track, so the same song cannot be added
  twice.
- **Works on mobile and desktop**, with a black-and-white Swiss-style layout and
  motion that respects `prefers-reduced-motion`.

Visitors never need a Spotify login. Only the playlist owner authorizes the app
once, and the backend handles Spotify on everyone's behalf.

---

## How it works

```text
Browser (static Astro site)
   │  JSON over HTTP
   ▼
FastAPI backend ─── SQLAlchemy ─── PostgreSQL
   │  httpx
   ▼
Spotify Web API
   (search, track metadata, playlist reads and writes)
```

- The frontend is fully static. All behaviour lives in one TypeScript entry
  point, with no React/Vue islands.
- The backend stores a single Spotify refresh token for the playlist owner and
  refreshes access tokens automatically.
- Each addition is validated and snapshotted in PostgreSQL, then appended to
  Spotify. If Spotify rejects the write, the database row is rolled back.
- The live playlist section reads from Spotify and is cached for 60 seconds to
  stay well inside rate limits. The cache is invalidated after a successful add
  so a new song appears immediately.
- Spotify rate limits are honoured through `Retry-After` handling and a shared
  cooldown, with friendly errors in the UI.

---

## Tech stack

| Layer     | Tools                                                        |
| --------- | ------------------------------------------------------------ |
| Frontend  | Astro (static), vanilla TypeScript, GSAP, Lenis, plain CSS    |
| Backend   | FastAPI, SQLAlchemy 2, Alembic, Pydantic, httpx               |
| Database  | PostgreSQL (psycopg 3)                                        |
| External  | Spotify Web API                                               |

Design notes: self-hosted TeX Gyre Heros, a 12-column grid, breakpoints at
900px and 640px, and no CSS framework.

---

## Project structure

```text
.
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI app and CORS
│   │   ├── config.py           # env-driven settings
│   │   ├── database.py         # engine and session factory
│   │   ├── models.py           # playlist_additions, spotify_auth
│   │   ├── schemas.py          # request/response models
│   │   ├── spotify.py          # OAuth, search, playlist read/write
│   │   ├── errors.py           # Spotify error → HTTP mapping
│   │   └── routers/
│   │       ├── additions.py    # add, list, stats, update, delete
│   │       ├── auth.py         # Spotify login and callback
│   │       ├── health.py
│   │       ├── playlist.py     # live playlist proxy
│   │       └── search.py
│   ├── alembic/                # migrations
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── components/         # Header, SearchPanel, FeedPanel, PlaylistPanel
    │   ├── layouts/Base.astro
    │   ├── lib/api.ts          # typed API client
    │   ├── pages/index.astro
    │   ├── scripts/app.ts      # all client behaviour
    │   └── styles/global.css   # design system
    └── package.json
```

---

## API

| Method | Route                        | Purpose                                      |
| ------ | ---------------------------- | -------------------------------------------- |
| GET    | `/health`                    | Health check                                 |
| GET    | `/search?q=...`              | Search Spotify tracks                        |
| GET    | `/additions`                 | Submission history (newest first, paginated) |
| GET    | `/additions/stats`           | Total number of submissions                  |
| POST   | `/additions`                 | Add a track and append it to Spotify         |
| GET    | `/additions/{id}`            | One submission                               |
| PATCH  | `/additions/{id}`            | Change the name on a submission              |
| DELETE | `/additions/{id}`            | Remove a submission row                      |
| GET    | `/playlist?limit=50`         | Live playlist (newest items, max 50)         |
| GET    | `/auth/spotify/login`        | Start Spotify authorization (admin only)     |
| GET    | `/auth/spotify/callback`     | Spotify OAuth callback                       |

Interactive docs are available at `http://127.0.0.1:8000/docs` when the backend
is running.

> `PATCH` and `DELETE` exist in the API, but the v1 UI is add-only by design.

---

## Running locally

### Requirements

- Python 3.12+ (the project uses the psycopg 3 driver)
- Node.js 20+
- PostgreSQL
- A Spotify Developer app and a playlist you own

### 1. Backend

From `backend/`:

```sh
python -m venv .venv

# Windows
.\.venv\Scripts\activate
# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
```

Create `backend/.env`:

```sh
DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/halfbaked

SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8000/auth/spotify/callback
SPOTIFY_PLAYLIST_ID=your_playlist_id_or_share_url
SPOTIFY_SCOPE=playlist-modify-public playlist-modify-private playlist-read-private
ADMIN_KEY=choose_a_long_random_key
```

Run the migrations, then the API:

```sh
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

From `frontend/`:

```sh
npm install
```

Create `frontend/.env`:

```sh
PUBLIC_API_URL=http://127.0.0.1:8000
```

Then:

```sh
npm run dev
```

Open <http://127.0.0.1:4321>.

`PUBLIC_API_URL` is inlined at build time. If you change it, restart the dev
server or rebuild.

### 3. Authorize Spotify once

Open this in a browser and approve the playlist owner's Spotify account:

```text
http://127.0.0.1:8000/auth/spotify/login?admin_key=YOUR_ADMIN_KEY
```

Spotify redirects to `SPOTIFY_REDIRECT_URI` (which must match the Spotify
Developer Dashboard exactly) and the page returns:

```json
{ "status": "authorized" }
```

The refresh token is stored in the database, so this only needs to be repeated
if the token is revoked or `SPOTIFY_SCOPE` changes.

---

## Environment variables

### Backend — `backend/.env`

| Name                     | Required | Notes                                                        |
| ------------------------ | -------- | ------------------------------------------------------------ |
| `DATABASE_URL`           | yes      | Must use the `postgresql+psycopg://` scheme                   |
| `SPOTIFY_CLIENT_ID`      | yes      | From the Spotify Developer Dashboard                          |
| `SPOTIFY_CLIENT_SECRET`  | yes      | Never expose this in the frontend                             |
| `SPOTIFY_REDIRECT_URI`   | yes      | Must match the dashboard entry exactly                        |
| `SPOTIFY_PLAYLIST_ID`    | yes      | Bare ID or a full share URL                                   |
| `SPOTIFY_SCOPE`          | no       | Defaults in `app/config.py`; changing it requires re-auth     |
| `ADMIN_KEY`              | yes      | Protects the manual Spotify login route                       |

### Frontend — `frontend/.env`

| Name             | Required | Notes                                             |
| ---------------- | -------- | ------------------------------------------------- |
| `PUBLIC_API_URL` | no       | Backend origin, e.g. `http://127.0.0.1:8000`       |

---

## Spotify notes

- The authorized account must **own the playlist or be an accepted
  collaborator**.
- `playlist-modify-public` is used for public playlists;
  `playlist-modify-private` covers private and collaborative playlists.
- Reading a private or collaborative playlist needs `playlist-read-private`
  (and often `playlist-read-collaborative`). Public playlists can be read
  without those scopes.
- Scopes are only applied when a token is issued, so update `SPOTIFY_SCOPE` and
  run the login route again after changing it.
- If the token is missing, expired, or revoked, the API returns `503` and the
  site shows a re-authorization message.

---

## Deployment

- Run `python -m alembic upgrade head` against the production database before
  starting the API.
- Set the backend environment variables in the host, not in a committed file.
  `app/config.py` loads `.env` relative to the backend working directory.
- Update CORS in `backend/app/main.py` with the deployed frontend origin.
- Build the static frontend with `npm run build`, with `PUBLIC_API_URL` pointing
  at the public backend origin over HTTPS. Rebuild when it changes.
- Update `SPOTIFY_REDIRECT_URI` and the Spotify Developer Dashboard redirect
  entry to match the production API URL, then re-authorize once.
- Never commit Spotify credentials, the admin key, or `.env` files.

---

## Limitations

- The v1 UI is **add-only**; editing and deleting submissions is API-only.
- A track can appear only once in the site's history (`track_uri` is unique).
  Adding a duplicate returns `409` and a toast.
- The submission feed and the live playlist section are different things: the
  feed is the site's own log, while the playlist section reflects the real
  Spotify playlist, including tracks added directly in Spotify.
- There is no automated test suite; verification is manual.

---

## Credits

Built for Politeknik Negeri Bali. Playlist data, track metadata, and album art
come from the Spotify Web API. This is a personal, non-commercial project and is
not affiliated with or endorsed by Spotify.
