import gsap from "gsap";
import Lenis from "lenis";

import {
  createAddition,
  errorMessage,
  getPlaylist,
  getStats,
  listAdditions,
  searchTracks,
  type Addition,
  type PlaylistItem,
  type PlaylistResponse,
  type Track,
} from "../lib/api";

/* ------------------------------------------------------------------
   DOM
   ------------------------------------------------------------------ */

function el<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return node;
}

function optionalEl<T extends HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

const searchForm = el<HTMLFormElement>("#search-form");
const searchInput = el<HTMLInputElement>("#search-input");
const resultsList = el<HTMLUListElement>("#results");

const composer = el<HTMLDivElement>("#composer");
const composerArt = el<HTMLDivElement>("#composer-art");
const composerName = el<HTMLParagraphElement>("#composer-name");
const composerArtist = el<HTMLParagraphElement>("#composer-artist");
const addForm = el<HTMLFormElement>("#add-form");
const usernameInput = el<HTMLInputElement>("#username");
const addButton = el<HTMLButtonElement>("#add-button");
const cancelButton = el<HTMLButtonElement>("#cancel-button");

const feedList = el<HTMLOListElement>("#feed");
const feedEmpty = el<HTMLParagraphElement>("#feed-empty");
const feedCount = el<HTMLSpanElement>("#feed-count");
const loadMoreButton = el<HTMLButtonElement>("#load-more");

const playlistList = el<HTMLOListElement>("#playlist");
const playlistEmpty = el<HTMLParagraphElement>("#playlist-empty");
const playlistCount = el<HTMLSpanElement>("#playlist-count");
const playlistLink = el<HTMLAnchorElement>("#playlist-link");

const statCount = optionalEl<HTMLSpanElement>("#stat-count");
const engineStatus = el<HTMLSpanElement>("#engine-status");
const engineStatusText = optionalEl<HTMLSpanElement>("#engine-status-text");
const toast = el<HTMLDivElement>("#toast");

/* ------------------------------------------------------------------
   State
   ------------------------------------------------------------------ */

type State = {
  additions: Map<number, Addition>;
  selected: Track | null;
  cursor: number;
  hasMore: boolean;
  hasRendered: boolean;
  searchAbort: AbortController | null;
  pollBusy: boolean;
  playlistRendered: boolean;
  playlistSignature: string;
};

const state: State = {
  additions: new Map(),
  selected: null,
  cursor: 0,
  hasMore: false,
  hasRendered: false,
  searchAbort: null,
  pollBusy: false,
  playlistRendered: false,
  playlistSignature: "",
};

const PAGE_SIZE = 50;
const POLL_MS = 12_000;
const PLAYLIST_POLL_MS = 60_000;
const USERNAME_KEY = "halfbaked.username";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return dateFormatter.format(date).replace(",", " ·").toUpperCase();
}

function spotifyUrl(item: { spotify_url: string | null; track_uri: string }): string | null {
  if (item.spotify_url) return item.spotify_url;
  const id = item.track_uri.split(":").pop();
  return id ? `https://open.spotify.com/track/${id}` : null;
}

function makeTrackArt(
  url: string | null,
  alt: string,
  kind: "result" | "feed",
  size: number,
): HTMLElement {
  if (url) {
    const image = document.createElement("img");
    image.className = kind === "result" ? "result__art" : "feed__art";
    image.src = url;
    image.alt = alt;
    image.loading = "lazy";
    image.decoding = "async";
    image.width = size;
    image.height = size;
    return image;
  }

  const placeholder = document.createElement("div");
  placeholder.className = kind === "result" ? "result__art--empty" : "feed__art--empty";
  placeholder.textContent = "—";
  return placeholder;
}

function makeComposerArt(url: string | null, alt: string): HTMLElement {
  if (url) {
    const image = document.createElement("img");
    image.className = "composer__art";
    image.src = url;
    image.alt = alt;
    image.width = 72;
    image.height = 72;
    return image;
  }

  const placeholder = document.createElement("div");
  placeholder.className = "composer__art--empty";
  placeholder.textContent = "—";
  return placeholder;
}

function canAnimate(): boolean {
  return !reduceMotion.matches;
}

function animateIn(nodes: Element[], stagger = 0.04, distance = 12): void {
  if (!canAnimate() || nodes.length === 0) return;
  gsap.from(nodes, {
    y: distance,
    autoAlpha: 0,
    duration: 0.5,
    stagger,
    ease: "power2.out",
    clearProps: "opacity,visibility,transform",
  });
}

let toastTimer: number | undefined;

function showToast(message: string, isError = false): void {
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 5_200);
}

function setStatus(text: string, isError = false): void {
  engineStatus.classList.toggle("is-error", isError);
  if (engineStatusText) engineStatusText.textContent = text;
}

function updateCount(count: number): void {
  if (statCount) statCount.textContent = `${count} TRACK${count === 1 ? "" : "S"}`;
}

/* ------------------------------------------------------------------
   Feed
   ------------------------------------------------------------------ */

type TrackRowInput = {
  index: string;
  track_name: string | null;
  artists: string[] | null;
  image_url: string | null;
  spotify_url: string | null;
  track_uri: string;
  username: string | null;
  added_at: string | null;
  dataId?: number;
};

function createTrackRow(input: TrackRowInput): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "feed__item";
  if (input.dataId !== undefined) item.dataset.id = String(input.dataId);

  const number = document.createElement("span");
  number.className = "feed__index";
  number.textContent = input.index;

  const url = spotifyUrl(input);
  const artLink: HTMLElement = document.createElement(url ? "a" : "span");
  artLink.className = "feed__art-link";
  if (url && artLink instanceof HTMLAnchorElement) {
    artLink.href = url;
    artLink.target = "_blank";
    artLink.rel = "noopener noreferrer";
    artLink.setAttribute("aria-label", `Open ${input.track_name ?? "track"} on Spotify`);
  }
  artLink.append(makeTrackArt(input.image_url, input.track_name ?? "Track artwork", "feed", 56));

  const body = document.createElement("div");
  body.className = "feed__body";

  const name: HTMLElement = document.createElement(url ? "a" : "span");
  name.className = "feed__name";
  name.textContent = input.track_name ?? "Unknown track";
  if (url && name instanceof HTMLAnchorElement) {
    name.href = url;
    name.target = "_blank";
    name.rel = "noopener noreferrer";
  }

  const artist = document.createElement("span");
  artist.className = "feed__artist";
  artist.textContent = input.artists?.length
    ? input.artists.join(", ")
    : input.track_uri;

  const meta = document.createElement("span");
  meta.className = "feed__meta";

  if (input.username) {
    const user = document.createElement("span");
    user.className = "feed__user";
    user.textContent = `+ ${input.username}`;
    meta.append(user);
  }

  if (input.added_at) {
    const time = document.createElement("time");
    time.dateTime = input.added_at;
    time.textContent = formatDate(input.added_at);
    meta.append(time);
  }

  body.append(name, artist, meta);
  item.append(number, artLink, body);
  return item;
}

function createFeedItem(addition: Addition, index: number): HTMLLIElement {
  return createTrackRow({
    index: String(index + 1).padStart(2, "0"),
    track_name: addition.track_name,
    artists: addition.artists,
    image_url: addition.image_url,
    spotify_url: addition.spotify_url,
    track_uri: addition.track_uri,
    username: addition.username,
    added_at: addition.added_at,
    dataId: addition.id,
  });
}

function renderFeed(newIds = new Set<number>()): void {
  const items = Array.from(state.additions.values()).sort(
    (a, b) => b.added_at.localeCompare(a.added_at) || b.id - a.id,
  );

  feedList.replaceChildren(...items.map(createFeedItem));
  feedEmpty.hidden = items.length > 0;
  if (items.length === 0) feedEmpty.textContent = "NO TRACKS YET. BE THE FIRST.";
  feedCount.textContent = items.length ? `${items.length} SHOWN` : "NO ENTRIES";

  if (!state.hasRendered) {
    animateIn(Array.from(feedList.children), 0.035, 10);
    state.hasRendered = true;
    return;
  }

  if (newIds.size === 0) return;
  const nodes = items
    .filter((addition) => newIds.has(addition.id))
    .map((addition) => feedList.querySelector(`[data-id="${addition.id}"]`))
    .filter((node): node is Element => node !== null);
  animateIn(nodes, 0.04, 10);
}

function updateLoadMore(): void {
  loadMoreButton.hidden = !state.hasMore;
}

async function loadInitial(): Promise<void> {
  try {
    const [rows, stats] = await Promise.all([listAdditions(0, PAGE_SIZE), getStats()]);
    state.cursor = rows.length;
    state.hasMore = rows.length === PAGE_SIZE;
    for (const row of rows) state.additions.set(row.id, row);
    renderFeed(new Set(rows.map((row) => row.id)));
    updateCount(stats.count);
    setStatus("SYSTEM READY");
    if (rows.length === 0) feedEmpty.textContent = "NO TRACKS YET. BE THE FIRST.";
  } catch (error) {
    setStatus("OFFLINE", true);
    feedEmpty.hidden = false;
    feedEmpty.textContent = "COULD NOT REACH THE API. RETRYING…";
    showToast(errorMessage(error), true);
  } finally {
    updateLoadMore();
  }
}

async function loadOlder(): Promise<void> {
  if (!state.hasMore || loadMoreButton.disabled) return;

  loadMoreButton.disabled = true;
  loadMoreButton.textContent = "LOADING…";

  try {
    const rows = await listAdditions(state.cursor, PAGE_SIZE);
    const newIds = new Set(
      rows.filter((row) => !state.additions.has(row.id)).map((row) => row.id),
    );
    state.cursor += rows.length;
    state.hasMore = rows.length === PAGE_SIZE;
    for (const row of rows) state.additions.set(row.id, row);
    renderFeed(newIds);
  } catch (error) {
    showToast(errorMessage(error), true);
  } finally {
    loadMoreButton.disabled = false;
    loadMoreButton.textContent = "LOAD OLDER ↓";
    updateLoadMore();
  }
}

async function refreshLatest(): Promise<void> {
  if (state.pollBusy || document.hidden) return;
  state.pollBusy = true;

  try {
    const rows = await listAdditions(0, PAGE_SIZE);
    const newIds = new Set<number>();
    for (const row of rows) {
      if (!state.additions.has(row.id)) newIds.add(row.id);
      state.additions.set(row.id, row);
    }
    if (newIds.size > 0) renderFeed(newIds);
    const stats = await getStats();
    updateCount(stats.count);
    setStatus("SYSTEM READY");
  } catch {
    setStatus("OFFLINE", true);
  } finally {
    state.pollBusy = false;
  }
}

/* ------------------------------------------------------------------
   Playlist
   ------------------------------------------------------------------ */

function createPlaylistItem(item: PlaylistItem): HTMLLIElement {
  return createTrackRow({
    index: String(item.position).padStart(2, "0"),
    track_name: item.track_name,
    artists: item.artists,
    image_url: item.image_url,
    spotify_url: item.spotify_url,
    track_uri: item.track_uri,
    username: item.username,
    added_at: item.added_at,
  });
}

function renderPlaylist(data: PlaylistResponse): void {
  const items = [...data.items].reverse(); // newest first
  const signature =
    `${data.total}|` +
    items
      .map((item) => `${item.position}:${item.track_uri}:${item.username ?? ""}`)
      .join("|");

  playlistEmpty.hidden = items.length > 0;
  if (items.length === 0) playlistEmpty.textContent = "NOTHING IN THE PLAYLIST YET.";
  playlistCount.textContent = items.length
    ? `${items.length} OF ${data.total}`
    : "NO ENTRIES";

  playlistLink.href = data.playlist_url;
  playlistLink.hidden = false;

  if (signature === state.playlistSignature) return;
  state.playlistSignature = signature;

  playlistList.replaceChildren(...items.map(createPlaylistItem));

  if (!state.playlistRendered) {
    animateIn(Array.from(playlistList.children), 0.02, 8);
    state.playlistRendered = true;
  }
}

async function loadPlaylist(): Promise<void> {
  try {
    renderPlaylist(await getPlaylist());
  } catch (error) {
    if (state.playlistSignature) return; // keep the last good render
    playlistEmpty.hidden = false;
    playlistEmpty.textContent = errorMessage(error).toUpperCase();
    playlistCount.textContent = "UNAVAILABLE";
  }
}

/* ------------------------------------------------------------------
   Search
   ------------------------------------------------------------------ */

function setResultsStatus(text: string, isError = false): void {
  resultsList.replaceChildren();
  const item = document.createElement("li");
  item.className = `results__status${isError ? " is-error" : ""}`;
  item.textContent = text;
  resultsList.append(item);
}

function clearResults(): void {
  resultsList.replaceChildren();
}

function renderResults(tracks: Track[]): void {
  if (tracks.length === 0) {
    setResultsStatus("NO MATCHES. TRY ANOTHER SPELLING.");
    return;
  }

  resultsList.replaceChildren();

  const unique = tracks.filter(
    (track, index) => tracks.findIndex((other) => other.uri === track.uri) === index,
  );

  for (const track of unique) {
    const item = document.createElement("li");
    item.className = "result";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "result__button";
    button.setAttribute(
      "aria-label",
      `Select ${track.name} by ${track.artists.join(", ")}`,
    );

    const text = document.createElement("span");
    text.className = "result__text";

    const name = document.createElement("span");
    name.className = "result__name";
    name.textContent = track.name;

    const artist = document.createElement("span");
    artist.className = "result__artist";
    artist.textContent = track.artists.join(", ");

    const action = document.createElement("span");
    action.className = "result__action";
    action.textContent = "ADD +";

    text.append(name, artist);
    button.append(
      makeTrackArt(track.image_url, track.name, "result", 56),
      text,
      action,
    );
    button.addEventListener("click", () => selectTrack(track, item));

    item.append(button);
    resultsList.append(item);
  }

  animateIn(Array.from(resultsList.children), 0.03, 8);
}

async function runSearch(query: string): Promise<void> {
  state.searchAbort?.abort();
  const controller = new AbortController();
  state.searchAbort = controller;

  setResultsStatus("SEARCHING…");

  try {
    const tracks = await searchTracks(query, controller.signal);
    if (controller.signal.aborted) return;
    renderResults(tracks);
  } catch (error) {
    if (controller.signal.aborted) return;
    const message = errorMessage(error);
    setResultsStatus(message.toUpperCase(), true);
    showToast(message, true);
  }
}

let searchTimer: number | undefined;

function queueSearch(): void {
  window.clearTimeout(searchTimer);
  const query = searchInput.value.trim();

  if (!query) {
    state.searchAbort?.abort();
    clearResults();
    return;
  }

  searchTimer = window.setTimeout(() => {
    void runSearch(query);
  }, 350);
}

/* ------------------------------------------------------------------
   Composer
   ------------------------------------------------------------------ */

function selectTrack(track: Track, item: HTMLElement): void {
  state.selected = track;

  document
    .querySelectorAll(".result.is-selected")
    .forEach((node) => node.classList.remove("is-selected"));
  item.classList.add("is-selected");

  composerArt.replaceChildren(makeComposerArt(track.image_url, track.name));
  composerName.textContent = track.name;
  composerArtist.textContent = track.artists.join(", ");

  if (!usernameInput.value.trim()) {
    usernameInput.value = localStorage.getItem(USERNAME_KEY) ?? "";
  }

  composer.hidden = false;

  if (window.matchMedia("(max-width: 900px)").matches) {
    composer.scrollIntoView({
      behavior: canAnimate() ? "smooth" : "auto",
      block: "nearest",
    });
  }

  usernameInput.focus({ preventScroll: true });
}

function clearSelection(): void {
  state.selected = null;
  composer.hidden = true;
  document
    .querySelectorAll(".result.is-selected")
    .forEach((node) => node.classList.remove("is-selected"));
}

function clearSearch(): void {
  window.clearTimeout(searchTimer);
  state.searchAbort?.abort();
  state.searchAbort = null;
  searchInput.value = "";
  clearResults();
  clearSelection();
}

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const track = state.selected;
  if (!track) return;

  const username = usernameInput.value.trim();
  if (!username) {
    showToast("ENTER YOUR NAME FIRST.", true);
    usernameInput.focus();
    return;
  }

  if (addButton.disabled) return;
  addButton.disabled = true;
  addButton.textContent = "ADDING…";

  try {
    const addition = await createAddition(track.uri, username);
    localStorage.setItem(USERNAME_KEY, username);

    const isNew = !state.additions.has(addition.id);
    state.additions.set(addition.id, addition);
    renderFeed(isNew ? new Set([addition.id]) : new Set());

    clearSearch();

    const stats = await getStats();
    updateCount(stats.count);
    void loadPlaylist();

    showToast(
      `ADDED — ${(addition.track_name ?? "TRACK").toUpperCase()} / ${username.toUpperCase()}`,
    );

    if (window.matchMedia("(max-width: 900px)").matches) {
      feedList.scrollIntoView({
        behavior: canAnimate() ? "smooth" : "auto",
        block: "start",
      });
    }
  } catch (error) {
    showToast(errorMessage(error), true);
  } finally {
    addButton.disabled = false;
    addButton.textContent = "ADD TO PLAYLIST ↗";
  }
});

cancelButton.addEventListener("click", () => {
  clearSelection();
  searchInput.focus();
});

/* ------------------------------------------------------------------
   Events
   ------------------------------------------------------------------ */

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  window.clearTimeout(searchTimer);
  const query = searchInput.value.trim();
  if (query) void runSearch(query);
});

searchInput.addEventListener("input", queueSearch);

resultsList.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

  const buttons = Array.from(
    resultsList.querySelectorAll<HTMLButtonElement>(".result__button"),
  );
  if (buttons.length === 0) return;

  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);

  if (current === -1) {
    event.preventDefault();
    buttons[0].focus();
    return;
  }

  event.preventDefault();
  const next =
    event.key === "ArrowDown"
      ? Math.min(current + 1, buttons.length - 1)
      : Math.max(current - 1, 0);
  buttons[next].focus();
});

document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  const typing =
    target.matches("input, textarea, select") || target.isContentEditable;

  if (event.key === "/" && !typing) {
    event.preventDefault();
    searchInput.focus();
  }

  if (event.key === "Escape") {
    if (document.activeElement === searchInput) clearSearch();
    else if (composer.contains(document.activeElement)) clearSelection();
  }
});

loadMoreButton.addEventListener("click", () => {
  void loadOlder();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    void refreshLatest();
    void loadPlaylist();
  }
});

/* ------------------------------------------------------------------
   Motion
   ------------------------------------------------------------------ */

function setupMotion(): void {
  if (!canAnimate()) return;

  const lenis = new Lenis({ lerp: 0.09 });
  const raf = (time: number): void => {
    lenis.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);

  gsap.from(".site-header__inner", {
    yPercent: -100,
    opacity: 0,
    duration: 0.6,
    ease: "power3.out",
  });
  gsap.from(".hero__meta", {
    y: 10,
    opacity: 0,
    duration: 0.6,
    delay: 0.1,
    ease: "power3.out",
  });
  gsap.from(".hero__title .line", {
    yPercent: 30,
    opacity: 0,
    duration: 0.9,
    stagger: 0.08,
    delay: 0.15,
    ease: "power3.out",
  });
  gsap.from(".hero__bottom > *", {
    y: 14,
    opacity: 0,
    duration: 0.7,
    stagger: 0.06,
    delay: 0.45,
    ease: "power3.out",
  });
  gsap.from(".workspace .section-head, .search, .micro", {
    y: 14,
    opacity: 0,
    duration: 0.7,
    stagger: 0.05,
    delay: 0.55,
    ease: "power3.out",
  });
}

/* ------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------ */

setupMotion();
void loadInitial();
void loadPlaylist();

window.setInterval(() => {
  void refreshLatest();
}, POLL_MS);

window.setInterval(() => {
  if (!document.hidden) void loadPlaylist();
}, PLAYLIST_POLL_MS);
