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
else, and get a rough picture of what "orang poltek" sounds like. Any genre is welcome.
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

## Credits

Built for Politeknik Negeri Bali. Playlist data, track metadata, and album art
come from the Spotify Web API. This is a personal, non-commercial project and is
not affiliated or endorsed.
