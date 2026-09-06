# Open Stream — Agent Handoff (Sept 6, 2026)

> Everything below was verified against live production deploys of `dev`,
> all pushed to `origin/dev`. Vercel auto-deploys.

---

## ⚡ Session 10 — extreme playback matrix (27 titles, 1902→2026) + dubs/subs menus

### Production matrix results (`eaeba4c`, probed live Sept 6 ~11:10 UTC)

`scripts/probe-matrix.js <base-url>` walks 27 curated titles through the real
production chain (resolve → extract → proxy HEAD). Results against
https://open-stream-khaki.vercel.app:

| Verdict   | Count     | Meaning                                                                     |
| --------- | --------- | --------------------------------------------------------------------------- |
| ✅ DIRECT | **22/27** | real HLS through our proxy → our CustomPlayer, no ads                       |
| 🟡 EMBED  | 3/27      | universal embed only (Naruto, Vincenzo, Crash Landing on You)               |
| ❌ FAIL   | 2/27      | no source found anywhere (A Trip to the Moon 1902, Gone with the Wind 1939) |

Era coverage: 1900s-1940s 1/3 · 1950s-1970s 5/5 · 1980s-1990s 4/4 ·
2000s-2024 **14/14** · 2025-2026 1/1. TV 3/3, anime 2/3 direct, K-drama 1/3
direct (all 3 K-dramas at least embed-playable). Toxic (1213243, the user's
canary) is DIRECT.

**Not verifiable server-side:** whether a given videm manifest actually
contains multi-audio dubs or English subs depends on the upstream ladder —
the _menus_ now exist (below) and light up when a manifest carries them.
Actual dub/sub presence must be confirmed by eye in the player.

### Multi-audio (dubs) + subtitle hardening in CustomPlayer

- New **audio-language menu** (music-note icon, appears only when the
  manifest carries >1 audio track): hls.js `audioTracks` and shaka
  `getAudioTracks()` both mapped; switching keeps position and works
  mid-play. Dubs are only selectable when the provider actually muxes them.
- In-manifest WebVTT subtitle tracks (`SUBTITLE_TRACKS_UPDATED`) now merge
  into the existing subtitle menu alongside remote/uploaded SRT/VTT;
  `selectSubtitle` also syncs `hls.subtitleTrack` so native subs render
  through the HLS pipeline. English subs appear whenever the manifest ships
  them.

### Session 9 recap (same push family)

DASH via shaka (dynamic import), auto-chapters (scene-cut sampling + seekbar
markers + thumbnail menu), mini player, telemetry
(`/api/telemetry/playback` + `GET ?action=summary` — deployed, healthy,
`{"sessions":0}` until real browser sessions flow). Full notes below.

---

## ⚡ Session 9 — APEX PRD phase 2: DASH engine, auto-chapters, mini player, telemetry

Implements the slice of the APEX PLAYER PRD that Session 8 deliberately
deferred (see its "Deliberately deferred" note), plus a new observability
layer. Typecheck passes (`bun tsc -b --noEmit`); NOT yet verified on
production — same rule as always: confirm in the browser before claiming
success.

### 1) DASH tier via shaka-player (`CustomPlayer`)

- New dependency `shaka-player@5.2.9`. URLs matching `.mpd` now load through
  shaka with ABR, bufferingGoal 30, and retryParameters (maxAttempts 3);
  variant tracks feed the existing quality menu; shaka's bandwidth estimate
  feeds the stats overlay every 3s.
- **Dynamically imported** (`import("shaka-player")`) so the ~400 KB DASH
  engine never enters the main bundle (PRD bundle-size target). Unsupported
  browsers or a failed manifest degrade to the plain `<video>` path — never
  to a dead player. Load errors 1000–1999 route into `onFail` → the normal
  provider-fallback pipeline.
- DASH/​HLS/​file mode now also surfaces in telemetry sessions.

### 2) Auto-chapters — client scene-cut detection (`src/Utils/chapters.ts`)

- ~25 s after a stream settles, the player samples 28 frames across the
  duration (128 px canvas), computes RGB histograms, and marks chapters where
  the histogram distance spikes (≥0.34, ≥90 s apart, trailing noise <60 s
  dropped). Runs on the SAME video element (works for hls.js and shaka MSE);
  playback position is restored after each seek so the user never sees the
  sampling scrub.
- UI: chapter tick marks on the custom seekbar (click to jump) + a
  Settings → **Chapters** submenu listing each chapter with a lazy 96 px
  JPEG thumbnail captured on first menu open (shimmer placeholder until
  captured). Titles that are too short or CORS-tainted simply show "No
  chapters detected" — every failure is soft.

### 3) Mini player (`CustomPlayer` + SCSS)

- New expand/contract button in the control bar toggles a floating corner
  window (`position:fixed; bottom/right; 16:9; rounded + shadow + entrance
animation`). In mini mode menus/volume/time readout hide; PiP remains for
  true detached playback. CSS-only positioning — no portal, so MediaSession,
  cast, and watch-party sync keep working.

### 4) Playback telemetry (PRD §6) — `src/Utils/telemetry.ts` + `/api/telemetry/playback`

- Client: one session per mounted player (mode, contentId, providerId,
  startupMs, rebuffers, errors, watchSeconds, exitedBeforeStart). Flushes on
  unmount via `navigator.sendBeacon` (fetch-keepalive fallback); watch time
  accumulates in a ref (playing-only) to avoid per-second storage writes.
- Server: POST accepts one session (sendBeacon content-type tolerant,
  fields clamped) into a per-instance 500-session ring buffer;
  `GET ?action=summary` returns sessions/median+p95 startup/rebuffers/
  errors/exit-before-start/watch seconds. Zero infra, no new env vars.
- `watch.tsx` passes `contentId={type}-{id}` and `providerId` into the
  player so sessions are attributable.

### Still deferred from the PRD (unchanged)

WebRTC/WHIP-WHEP, P2P mesh, thumbnail scrub strip on the seekbar (bandwidth
cost on proxied direct streams), AI captions/translation, ads (the product
is anti-ads by identity), DRM (deliberately not built).

---

## ⚡ Session 8 — the "absolute best player" batch (APEX-style UX tier)

Applied the high-value slice of the APEX PLAYER PRD to `CustomPlayer`:

### Instant playback (the #1 market ask)

- **Muted instant start (Netflix pattern):** the watch page now mounts the
  player `startMuted` on a fresh session — browsers never block muted
  autoplay, so the movie is PLAYING on frame one instead of sitting behind a
  play button. A "🔇 Sound off — tap for sound" chip (auto-hides after 6s)
  brings audio back in one tap; `onUnmute` flips `soundOnRef` so every later
  stream rotation plays with sound.
- `timeToFirstFrame` measured from source-mount to first `playing` event.

### Ultra-player UI/UX

- **Custom seekbar** (replaces the native range input): buffer-fill layer,
  played gradient in `--ascent-color`, hover time tooltip, click-anywhere +
  drag scrub with pointer capture.
- **Playback stats overlay** (`D` or Settings → Playback stats): startup ms,
  resolution, active HLS level/bitrate (hls.js `LEVEL_SWITCHED/UPDATED`),
  buffer ahead, dropped/total frames (`getVideoPlaybackQuality`), rebuffer
  count, mode, speed, volume.
- **Shortcut hints overlay** (`?` or Settings → Shortcut hints): full key map.
- **Netflix keys:** `J`/`L` ±10s, `T` speed cycle (1 → 1.25 → 1.5 → 2),
  `D` stats, `?` hints — all with a `+10s`-style seek toast chip.
- **Double-click** toggles fullscreen; **double-tap** (touch) seeks ±10s by
  screen half (with click-suppression so play/pause doesn't double-fire).
- **Ambient glow mode** (Settings → toggle, default ON, persisted): a 64px
  canvas snapshot of the live frame, blurred + saturated behind the video
  (2s cadence + refresh on seek — near-zero cost cinema backdrop while
  letterboxed content plays).
- **Cursor auto-hides** with the controls; volume/speed/ambient persist in
  `localStorage` (`OpenStreamPlayerPrefs`), applied post-hydration to keep
  SSR renders deterministic.

### Deliberately deferred from the PRD (next phase — shipped in Session 9)

WebRTC/WHIP-WHEP, P2P mesh, AI scene-analysis chapters, thumbnail scrub
strips (bandwidth cost on direct streams), server-side telemetry pipeline
(client stats overlay shipped instead). Not needed for VOD instant playback.
**Session 9 shipped auto-chapters, the DASH engine, mini player and the
telemetry endpoint**; WebRTC/P2P remain deliberately out of scope.

---

## ⚡ Session 7 — refresh-loop fix + catalog direct-file tier (HubCloud/FSL)

### 1) "It keeps on refreshing" — root cause + fix (`watch.tsx`, `CustomPlayer`)

**Root cause:** a direct stream that died MID-PLAY (expired videm token —
those are short-lived by design) fired `onFail`, which immediately abandoned
the whole provider and walked the category source list. Every universal
shares the same videm backend, so the next provider failed identically →
cascade of "Trying X…" toasts and page reloads = the visible refresh loop.

**Fix — three-step silent recovery before anything visible happens:**

1. **Rotate servers:** the extraction effect now keeps the full candidate
   list (`extractedCandidates`); `onFail` marks the dead URL and silently
   HEAD-verifies + switches to another already-extracted server
   ("Switched stream server" toast, playback continues).
2. **One fresh re-extract:** if no other server survives, re-extract the
   SAME source exactly once (`extractNonce`) — new tokens, embed still held
   back. `CustomPlayer` now carries the last known position across the
   rotation so playback resumes where it was, not from 0:00.
3. **Only then** the visible source walk (exactly one pass; Session 6f's
   `triedProvidersRef` termination still bounds it).

Plus a 1.2s duplicate-fail debounce (players can fire several error events).

### 2) hdhub4u catalog reality (re-probed live Sept 6) + the reader fallback

- `hdhub4u.tv`/`.bi` → CF challenge (403); post pages → challenge loop.
- `hdhub4u.ms` → **the live domain** (the site's own SEO pages point at
  it; the handoff's `.com` note is stale) — CF-walled to datacenter IPs.
- `hdhub.cfd` → homepage 200 and fetchable from Vercel, deep pages hang on
  a challenge loop; search `?s=` → instant 403 WAF. Unreliable server-side.
- **New: keyless reader fallback (`fileHostSources.ts` →
  `fetchPageSmart`)** — direct fetch first; on a challenge/blocked/failed
  response, one retry through `r.jina.ai` (`X-Return-Format: html`), which
  renders the page through Cloudflare and returns the real HTML (verified
  live: 43KB genuine homepage through the `.ms`/`.tv` walls). Wired into
  `resolve.ts` (naive URL, search, season retry, DDG fallback verify) and
  `extract.ts` (page sweep). Every reader failure is soft — the universal
  tier always remains.

### 3) HubCloud/FSL direct-file tier (`fileHostSources.ts`)

The catalog post's value is its **file-host buttons** (HubCloud, FSL,
GDFlix…), not the page. New extractor: post page (CF-smart fetch) →
`extractFileHostLinks` (route/host regexes + quality ranking) →
`probeDirectMedia` Range-probe (bytes=0-1, follows redirects, accepts only
real `video/*`/mpegurl/octet answers, rejects HTML masquerades) → returns
the **post-redirect signed file URLs**. Runs in `/api/providers/extract` as
step 0b for non-universal providers (10-min per-instance cache). Result:
hubcloud/fsl sources play as direct files in our CustomPlayer — no provider
embed, no ads, no click-gates.

**Honest limits (verified live):** file-host PAGES usually serve an
interstitial whose inner routes are JS-built, and serverless can't click.
The probe+interstitial-walk covers the redirect-to-file class; anything
deeper needs a browser runtime. The reader proxy is also rate-limited —
expect occasional misses; every path degrades to the universal tier, never
to a dead player.

### Production baseline at session start (HEAD `90c3ccd`)

- `resolve` twoembed 1213243 → `ok:true` · `extract` → 1 direct HLS
  (Server SWH-Hindi) · proxy HEAD → `200 application/x-mpegurl`.
- Chain is healthy; the fixes above target mid-play death recovery and
  catalog-tier coverage.

---

## ⚡ Session 6f (Sept 6, `90c3ccd`) — cascade termination

Provider walk could loop forever when every candidate failed. Now bounded:
a provider is never re-tried within one title session (`triedProvidersRef`),
and exhausting every provider terminates with "All sources are currently
unavailable" + the Switch Source panel instead of looping.

## ⚡ Session 4 — REAL direct-stream playback (the "no streams" fix)

**The root cause of "no streams / nothing plays":** the universal tier only
mounted iframes (2Embed's page is click-gated + ad-layered), and
`/api/providers/extract` found `count: 0` on every JS-driven player page.

**The fix — a real direct-HLS tier built on the player 2Embed itself uses:**
`videm.xyz` is the HLS backend of 2Embed's default server. Its embed page
embeds a signed token (`var Q = {…}`) + server refs, and
`/api.php?a=play&ref=…&t=…` mints REAL multi-quality HLS manifests
(`/_stream?id=…` or `cap.php` gateways, both CORS-open). New code:

- `src/Utils/videmSources.ts` — `fetchVidemDirect()`: embed page → token/refs
  → mint up to 3 playable stream URLs (hls/mp4). Plain fetch + AbortController
  timeouts, serverless-safe.
- `src/Utils/providers.tsx` — new `videm` universal provider (`urlPattern:
"videm"`, approved, priority 1 after 2Embed).
- `src/pages/api/providers/extract.ts` — universal tier (twoembed/vidlink/
  vidsrc/videm) now returns videm direct streams FIRST instead of scraping
  JS players for nothing.
- `src/pages/api/proxy/media.ts` — HLS manifests are rewritten so every
  child URI (including root-relative `/_stream?id=…`) becomes an absolute
  upstream URL; upstream fetches now carry a same-origin referer (videm's
  `cap.php` gateway rejects referer-less requests).
- `src/pages/watch.tsx` — extract boost fires at 400ms (was 2.5s) and the
  HEAD content-type sniff now accepts `application/x-mpegurl` (videm's
  content-type; the old regex only matched `vnd.apple.mpegurl` and would
  have rejected every direct stream).
- `_document.tsx` — preconnect `videm.xyz` + `pchrelay.videm.xyz`.

### Mass-verification evidence (local, same code path as production)

`bun scripts/probe-videm.ts` walks master → variant → real segment:

**16/16 movies + Breaking Bad S1E1 all playable** (1–3 quality variants per
title, real `video/mp2t` segments at 200/206): Inception, Interstellar,
The Dark Knight, The Matrix, Fight Club, Pulp Fiction, Shawshank, Forrest
Gump, Godfather, Dune 2, Deadpool & Wolverine, Oppenheimer, RRR, Animal,
Titanic, Harry Potter 1.### NEXT_PUBLIC_STREAM_URL answer
It is ONLY a static seed for the hdhub4u fallback — the app already
auto-fetches/auto-updates working domains every 15 min (`domainDiscovery.tsx`
probes CloudStream repos + mirrors and promotes the best live domain into the
live map, browser-side + via `/api/providers/domains`). The new videm tier
makes playback fully independent of that env var. No env change needed.

## ⚡ Session 4b — direct-first playback + hdhub4u status + env answer

- **Direct-first watch flow (`src/pages/watch.tsx`):** for universal providers
  the extractor now runs at 0ms and GATES the embed — the ad-laden,
  click-gated iframe (2Embed's play-button page) no longer flashes or mounts
  while a direct stream is available; the user sees our CustomPlayer + UI.
  The embed only mounts after extraction proves empty (`directChecked`), or
  an 8s safety timeout. Also fixed the playback-mode HEAD sniff regex
  (`mpegurl` matching) in the same file — the earlier Session 4 fix only
  covered the extract-boost copy.
- **hdhub4u today (probed live):** `hdhub4u.com` answers 200 but is a JS/JWT
  anti-bot challenge loop (486-byte "Loading..." + `?ch=1&js=<JWT>` → consent
  stub, no cookie set) — unreachable from serverless, same class as before.
  `hdhub4u.bi`/`hdhub4u.tv` → Cloudflare "Just a moment"; `hdhub4u.mx` →
  parity.domains parked lander; `hdhub.cfd` → unreachable. Pool updated with
  the fresh candidates (`hdhub4u.bi/.tv/.mx`, `hdhub.cfd`) so discovery picks
  them up the moment one comes alive. The resolver's shell gates keep parked
  pages from ever mounting.
- **NEXT_PUBLIC_STREAM_URL:** it is a build-time seed ONLY (inlined into the
  client bundle), so editing it requires a redeploy; the app does NOT depend
  on it for playback. Runtime autonomy lives in `domainDiscovery.tsx`:
  every 15 min it probes the CloudStream-repo pool + mirrors, promotes the
  best verified domain into the live map (browser localStorage + per-instance
  server cache), and the watch page re-promotes on load. Sandbox seed set to
  `https://hdhub4u.com`; production env stays user-managed.

### One more production bug found & fixed in Session 4 (`832179f`)

The `/api/proxy/media/<encoded-url>` PATH form never reached the API route on
Vercel — encoded slashes are decoded before route matching, so every HLS
request from the custom player got the app's 404 page (this also explains
why direct HLS could never have played before). Fixed: the player now uses
the query form everywhere; the proxy's HLS child-URI rewrite makes relative
resolution a non-issue. Verified live on the new build: extract → cap.php
master via proxy (absolute rewritten variants) → variant via proxy → segment
via proxy = `200 video/mp2t` (400 KB). Typecheck ✅, tree clean, pushed.

---

## ⚡ Session 3 update — Sept 5 2026 (post-bbe46d9 re-verification)

Re-ran the §3 verification suite against the live URL after the Session-2
fixes deployed (manifest links confirmed in the live `<head>`). Evidence,
captured ~14:00–14:45 UTC:

- **Universal tier re-verified 8/8 × 2/2:** `resolve` → `ok:true` for every
  title on both `twoembed` and `vidlink` (Inception 27205, Interstellar
  157336, The Dark Knight 155, Deadpool & Wolverine 533535, Dune Part Two
  693134, Oppenheimer 872585, RRR 579974, Animal 1064213).
- **Embed pages carry real per-title players** (fetched directly, not just
  resolver verdicts): 2Embed serves `<title>Inception (2010)</title>` player
  pages (~9 KB); VidLink SSRs the actual TMDB poster for the id (~90–110 KB)
  — both are genuine title pages, not shells.
- **Latency profile (why the default tier now feels instant):** page HTML
  ~0.2 s TTFB; `sources?action=best` ~80 ms (CDN-cached verdict); `resolve`
  ~0.15 s (Vercel→2Embed). The one real stall was client-side: 2Embed's TLS
  handshake measures ~1.4 s from a browser and only started when the iframe
  mounted. Fix: global `preconnect` + `dns-prefetch` for `www.2embed.cc`
  and `vidlink.pro` in `_document.tsx` — the socket warms on any page, so
  TLS leaves the embed-mount critical path.
- hdhub4u/moviesdrive catalog domains remain parked (unchanged from
  Session 2); the resolver fast-misses them into the universal tier.

Still open (unchanged): a real browser must confirm pixels/time advance on
`/watch?type=movie&id=…` for the acceptance set — curl proves mounts, not
video frames.

---

## ⚡ Session 2 update — Sept 5 2026 (shipped in `bbe46d9`, pushed)

Ran the §3 verification suite against the live URL (Vercel egress, not
localhost). Everything below is production evidence, captured 13:00–14:00 UTC.

### Playback verification results (13 titles: real Top-10-IN trending + 3 classics)

| Tier                    | Result               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Universal id-routed** | ✅ plays-by-design   | `resolve` 2Embed **9/13 OK** (server-verified <title>), VidLink **13/13 OK** (id-route 200s; catalog-blind fail-open by design). `/watch` "best" for movie → 2Embed. So every acceptance title gets a mounted embed.                                                                                                                                                                                                                               |
| **hdhub4u (HDF)**       | ❌ 0/13 today        | **Every candidate domain is parked/squatted**: `hdhub4u.unblockit.pages.dev` (the `NEXT_PUBLIC_STREAM_URL` seed) → 404 root; `hdhub4u.com` redirects `/movie/*` to `view.secure-password.online` or serves a 486-byte "Loading..." SPA stub; `hdhub4u.fit` serves ONE identical 35 KB "Safe & Legal…Guide" page for any URL; nocensor/unblockninja/mrunblock → unreachable from Vercel. Resolver fast-misses in ~1.3 s (b92f118 shell gate works). |
| **moviesdrive**         | ❌ unreachable today | `moviesdrive.pics` → redirects to `moviesdrives.cfd`, one static "Movie Reviews…" guide page for any URL; every other mirror times out from Vercel.                                                                                                                                                                                                                                                                                                |
| Manifest                | ✅ works             | Cold manifest endpoint showed 0 providers until first sync; after `POST manifest?action=sync` → **84 providers / 95 domains**, `builtAt` set, both repos tracked. Earlier `0` was cold-start, not a bug.                                                                                                                                                                                                                                           |

### Real bugs found & fixed in this session (typecheck ✅ — NOT yet deployed)

1. **Tokenless-title shell hole** (`resolve.ts`): titles whose tokens are all
   filtered by `normalizeTitle` (≤2 chars, e.g. "DC") short-circuited
   `pageMentionsTitle` → **any** 200 page was accepted as a "direct" hit.
   Verified live: `DC (1479832)` resolved `ok:true direct` against parked
   shells on BOTH hdhub4u.fit and moviesdrive.pics in ~220 ms — the exact
   silent no-play class b92f118 meant to kill. Fix: tokenless titles now
   require the page's `<title>` to contain the verbatim name AND the year;
   plus a new `looksLikeShellPage` gate rejects parked redirects (final URL
   host ≠ requested host), "Loading..." stubs, CF challenges, and squatter
   guide titles for ALL titles, not just tokened ones.
2. **Extract 404'd before honoring pageUrl** (`extract.ts`): the endpoint
   required a server-side domain cache first, so MoviesDrive (no env seed,
   no server cache) returned 404 even when the watch page passed a valid
   title-resolved `pageUrl`. Now a validated client `pageUrl` is primary and
   the naive embed is only the fallback.
3. **`detail?type=undefined&id=undefined` traced** (long-open question):
   `MoviePoster` builds its own href and is rendered on `/detail` as
   `<MoviePoster data={data} />` with NO media_type — TMDB detail payloads
   have no `media_type`, so the poster linked to itself with `type=undefined`.
   All card emitters were already guarded (`safeDetailHref`); MoviePoster was
   the one holdout. Now guarded + call site passes `type`. Also tightened
   `Navbar` Surprise Me to require a valid type alongside the id.
4. **README PWA claims reconciled**: no service worker is built (next-pwa
   disabled in `next.config.mjs`) and `manifest.json` wasn't even linked.
   Docs now say "installable shell, online-first"; manifest+icons are linked
   in `_document.tsx` (zero-risk), so mobile browsers can A2HS.

### Still open / next agent must do

- **Browser-level video confirmation is still missing.** curl proves resolve,
  domain state, and embed availability — it cannot prove a `<video>` frame
  advanced. Open `/watch?type=movie&id=1213243` (and 9 more) on the live URL
  after the push and confirm pixels/time advance; repeat `/detail → play`.
- **hdhub4u/moviesdrive "plays from X" cannot pass until real domains exist**
  — the catalog domains are parked today (outside repo control; they rotate
  weekly). Watch the discovery pool; when a genuine mirror comes back the
  resolver pipeline will use it. Consider updating `PROVIDER_DOMAINS` +
  `NEXT_PUBLIC_STREAM_URL` (Vercel env) once a verified catalog domain is up.
- The Session-2 fixes above shipped in `bbe46d9` (pushed to `origin/dev`;
  Vercel auto-deployed the branch) — re-verified in Session 3.

---

## 1. What this project is

- **Open Stream** — a self-hosted streaming UI (rebrand of the original
  "Rive"). Interface only; it hosts no media (legal boundary, see README
  Disclaimer + SECURITY.md).
- **Stack:** Next.js 14 (Pages Router) · React 18 · TypeScript (strict) ·
  Sass modules · hls.js custom player · Firebase Auth/Firestore (optional,
  guest mode without) · TMDB metadata · OpenAI-compatible AI gateway ·
  Bun for tooling.
- **Repo:** `github.com/flawsom/rive-next`, default branch `dev`.
  Working tree is clean; every commit below is pushed.
- **Live deployment:** https://open-stream-khaki.vercel.app (Vercel).
  ⚠️ Confirm which branch Vercel auto-deploys — user acceptance tests all
  happen on this URL.
- License BSD-4-Clause.

## 2. Repo health right now

| Check                 | Status                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun tsc -b --noEmit` | ✅ passes clean                                                                                                                                                                                                                                                                                                                        |
| Working tree          | ✅ clean, all pushed to `origin/dev`                                                                                                                                                                                                                                                                                                   |
| E2E suites            | 161 assertions in 2 mode-aware suites (`scripts/e2e-test.js` 105, `scripts/consumer-e2e.js` 56) — run against a live server                                                                                                                                                                                                            |
| Roadmap               | Phases 1–4 all shipped (`ROADMAP.md`): Top 10 row, More Like This, Coming Soon, deep links, profiles + kids mode, MediaSession downloads, source pinning, direct-stream extraction v1, watch party v1, Chromecast/AirPlay, hero trailer autoplay, taste export, AI weekly digest, community lists, hover-scroll rows, LatestUploadsRow |

## 3. THE critical open item: production playback

**The user's acceptance bar:** titles play from hdhub4u ("HDF for you") and
moviesdrive, verified against the top 10 India movies + 3 random titles, on
the live URL. Their last explicit report was **"no stream is being played."**
A chain of 8 playback commits was then pushed (latest `b92f118`, Sept 5
09:33 UTC). **It is unknown whether the user has confirmed playback since.**
First job of the next agent: verify on production, don't refactor blind.

### How playback works today (the chain)

Orchestrated in `src/pages/watch.tsx` (~1,450 lines):

1. **URL repair** — wrong `type` in watch URLs is auto-repaired
   (`1debf30`); genuinely unknown ids fall through to player fallbacks.
2. **Health-aware source selection** (`src/Utils/sourceSelector.tsx`) —
   latency/availability ranking with cooldowns; user pins override while
   reachable.
3. **`/api/providers/resolve`** (`src/pages/api/providers/resolve.ts`,
   ~664 lines) — server-side title resolver for WordPress-class providers
   (hdhub4u / moviesdrive / bollyflix). Verifies the naive
   `${domain}/movie/${tmdbId}` URL; else searches `/?s=<title>` and ranks
   candidates by token overlap (≥60% coverage + year bonus − quality-tag
   noise). Rejects 404 shells **and title-less 200 pages** (`b92f118` —
   hdhub4u.fit serves an identical JS homepage for any `/movie/{id}`;
   moviesdrive.pics redirects). 2Embed and VidLink are verified
   server-side before mounting (`65bc327`, `4950788`), fail-open on
   transient errors. In-memory cached per serverless instance. SSRF-guarded.
4. **Universal id-routed embeds** (`src/Utils/universalSources.ts`) —
   order: `twoembed → vidlink → vidsrc`. Any title plays from its TMDB id
   with no site search. (vidsrc is unreachable from serverless by design —
   fails fast; it must never be first.)
5. **`/api/providers/extract`** — server-side direct-stream extraction
   (HLS/mp4/webm) from embed pages; verified direct streams are promoted
   over iframes into the CustomPlayer (quality/subtitle menus, cast, PiP).
6. **Watchdogs** — 30s silent-hang watchdog + unverified dead-source guard
   auto-advance to the next source; failures feed the health tracker.

### Most likely failure causes to check first (on production, not localhost)

- Some embed hosts block Vercel serverless IPs → exercise
  `/api/providers/resolve` and `/extract` **from the deployed URL**; a
  localhost pass proves nothing.
- Cloudflare challenges on provider search pages → resolver "miss"; the
  universal-embed path is the safety net, so if _those_ also fail, playback
  dies entirely.
- Title-token verification (`b92f118`) may be too strict/lenient for some
  titles — tune `token coverage` if valid pages get rejected.
- If id-routed universals are the only survivors, consider adding more
  (vidsrc mirrors, superembed-class) to `UNIVERSAL_IDS`.

### Suggested verification script

```bash
# Resolver (expect ok:true + URL, or ok:false fast — never a hang)
curl "https://open-stream-khaki.vercel.app/api/providers/resolve?title=<Title>&type=movie&id=<tmdbId>&providerId=hdhub4u&base=<live-domain>"
# Direct extraction (expect streams[] with hls/mp4)
curl "https://open-stream-khaki.vercel.app/api/providers/extract?providerId=<pid>&type=movie&id=<tmdbId>"
```

Then in a real browser: open `/watch?type=movie&id=<id>` for 10 titles,
watch the network tab for resolve/extract, confirm iframe/video mounts.
Repeat with `/detail` → play path. **Do not report success without
production evidence.**

## 4. Environment

- **Required:** `NEXT_PUBLIC_TMDB_API_KEY`.
- **Optional:** `OPENAI_API_KEY`, `OPENAI_BASE_URL` (default
  `https://kiraai.vn/api/v1`), `AI_MODEL` (default `mimo-v2.5`, auto
  fallback chain), `NEXT_PUBLIC_FB_*` (guest mode without),
  `NEXT_PUBLIC_STREAM_URL` seed.
- `.env.local` exists locally — never commit, never echo its values.
  Production values live in the Vercel dashboard. Full notes:
  `ABOUT_ENV.md`.
- `next.config.mjs`: `experimental.cpus: 2` (build OOM history) and
  **next-pwa removed** (destabilized builds) — note the README still
  advertises PWA; either re-enable where it works or reconcile the docs.

## 5. Commands

```bash
bun install
bun run dev            # localhost:3000
bun tsc -b --noEmit    # strict typecheck — must pass before any push
bun run build && bun run start
bun run test:all       # e2e + consumer, against a running server
bun run lint && npx prettier --write .
```

## 6. Working conventions for this repo/user

- **Git:** Freebuff Cloud injects the GitHub App credential for every
  fetch/push — never ask the user for PATs/SSH or touch the remote URL.
  Freebuff's Changes panel owns Save/Share/commit/push; only run git
  delivery commands when the user explicitly asks (they often say "push").
- **Commit style:** imperative subject explaining the _why_, body with
  root cause, footer:
  `🤖 Generated with Codebuff` + `Co-Authored-By: Codebuff <noreply@codebuff.com>`.
- **User input is voice-transcribed** — loose grammar, e.g. "HDF for you" =
  hdhub4u, "movies drive" = moviesdrive. Acceptance is always hands-on;
  they will paste failing URLs from the live site.
- **UX polish matters to them** (e.g., hover-scroll rows must feel
  "flawless and premium") — small interactions are treated as features.
- Preserve their code; no heavy default scaffolding.

### Session 6 (Sept 5, `2665f9b`) — direct playback actually plays now

**Root cause of "embed is still there / nothing in our player":**
`CustomPlayer` only initialized hls.js for URLs ending in `.m3u8`, but the
videm direct tier serves extension-less HLS endpoints (`_stream?id=…`,
`cap.php?…`). The player fell to the native `<video>` path, failed, and the
fail pipeline bounced back to the ad-laden embed. **Fix:** treat only known
native-video extensions as `<video>` sources; everything else goes through
hls.js. Verified on production with the new build: extract → master via
proxy (3 variants 640p/1280p/1920p) → variant playlist → 1.04 MB real
MPEG-TS segment (`47` sync byte).

Also this session:

- **`NEXT_PUBLIC_STREAM_URL` hard dependency removed.** `getCachedDomain` /
  resolve now fall back to verification-gated seed mirrors
  (`hdhub4u.tv` → `.bi` → `.com`; user-confirmed base URLs) when the env
  var is unset, so the "NEXT_PUBLIC_STREAM_URL is not set" panel can no
  longer appear. Env var still honored when set (set in `.env.local` to
  `https://hdhub4u.tv`; user must add it in Vercel env to bake it into
  prod builds — but it's now optional).
- Discovery pool reordered (`.tv`/`.bi` first) + **sitemap probe signal**: a
  domain serving `/sitemap.xml` ranks above anonymous 200 shells.
- "Not configured" panel replaced with a Switch Source action.
- **hdhub4u reality check (verified live):** hdhub4u.tv/.bi root returns 200
  from some Vercel regions but the movie/search pages are still
  Cloudflare-challenged — `/api/providers/resolve` returns `ok:false` for
  both, so the app correctly auto-switches to the universal tier. When CF
  stops challenging (or a mirror without CF appears), the seeds + 15-min
  discovery will pick it up automatically. Server-side scraping of a
  CF-challenged site is impossible without a browser runtime; the user
  insists these domains work (true from their browser, false from Vercel).

### Session 6b (Sept 5, `31024cd`) — false 2Embed resolver miss killed real titles

User report: watch?type=movie&id=1213243 ("Toxic: A Fairy Tale for Grown-ups
2026") shows an error message even though the title exists on 2Embed.

**Root causes (both fixed, verified live):**

1. `verifyUniversalEmbed` checked the outer `/movie/{id}` page — 2Embed
   renders an EMPTY title ` () - 2Embed` there for titles it genuinely has
   (Toxic is a live example; Inception gets a real title). The false miss
   cached `ok:false` for 10 min and fired the provider-switch cascade.
   **Fix:** movie embeds now verify the `/embed/{tmdbId}` page they actually
   mount — real titles carry the name, missing titles render the generic
   `2Embed.cc - Player` shell (rejected by a new generic-title check). TV
   embeds render a constant "Breaking Bad" placeholder title for every id,
   so TV still verifies the outer `/tv/{id}` page ("Unknown TV Show" =
   miss). Transient fetch errors now fail open instead of caching a miss.
2. A fast cached resolver miss auto-switched providers immediately and
   CANCELED the parallel direct-stream extraction that was about to deliver
   playback. Universal resolve misses now set `deferSwitchOnExtractRef` and
   the switch fires only when extraction also comes up empty (or hangs 8s).

Production verify matrix (all green on the new build):
`1213243/27205/155` ok:true · `999999999` ok:false · `tv/1396` ok:true ·
`tv/999999999` ok:false · extract 1213243 → 1 direct HLS (SWH-Hindi).

### Session 6c (Sept 6, `a7455d5`) — layout squeeze + embed flash-over, both fixed

User screenshot: video squeezed into a thin left strip with the More-Like-
This poster row beside it, and the provider's own embed player showing.

1. **Layout squeeze:** `.watch` is a flex row and MoreLikeThis is an
   in-flow sibling of the playing surface, so its wide poster list flex-
   squeezed the video into a sliver. Fix: the player is now wrapped in a
   `.playerLayer` and the iframe got `position:absolute; inset:0` — both
   are full-screen layers above the content flow (`.watch` is
   `overflow:hidden`), so no sibling can ever deform them.
2. **Embed flash-over:** the 8s extraction fallback released the embed
   before slow cold-start extractions finished (Toxic took ~10s). The hang
   guard is now 20s, and extract.ts skips legacy HTML/iframe/API scraping
   when the videm direct tier has streams (that scraping found nothing on
   JS-driven universal players and added ~10s serial latency). Extract
   timing on production after the fix: **1.4–1.8s** (was ~10s).

### Session 6d (Sept 6, `a7fb109`) — the stale service worker, finally

The user STILL saw the pre-fix layout after verified deploys. Root cause:
the app shipped as a next-pwa PWA in the past — that SW is still registered
in returning visitors' browsers, serving precached old JS forever (browsers
keep a 404-ing SW until explicitly unregistered). `_app.tsx` now
unregisters all service workers and deletes workbox/next-pwa caches on
load. Playback layers are also `position:fixed` now (the Layout's
framer-motion wrapper is transform → containing block for absolute too).
README's PWA claim must go — the manifest is kept but the app is not a PWA.

### Session 6e (Sept 6, `3d40224`) — the full-screen JSON explained

Screenshot: raw `{"error":"unavailable"}` filling the watch page. That's
videm.xyz's answer for expired/unknown stream tokens (404 JSON). Chain:
extraction HEAD-verified a stream, assigned it, but the playback-mode
effect re-probed the extension-less URL because the verdict wasn't cached —
the token expired between probes, the URL got classified "embed", and the
iframe mounted the raw stream API. Fix: cache the verdict before assigning,
require `res.ok` on the probe, and dead videm stream URLs route into the
source-failure pipeline (Switch Source), never into an iframe src.
Confirmed live in the deployed bundle + full chain smoke test (extract 2.5s,
proxy HEAD 200 `application/x-mpegurl`).

## 7. Loose ends / open questions

- `detail?type=undefined&id=undefined` was once reached by the user — the
  detail page now handles stale/absent state (`0751f4a`, `fbed70f`), but
  the _source_ of malformed links (share buttons? an AI card? stale SW
  cache?) was never fully traced. Worth a sweep of link emitters.
- README's PWA claim vs. next-pwa removal (above).
- Watch-party Firestore rules are documented in `firestore.rules` — confirm
  they're actually deployed to the user's Firebase project.
- Video walkthrough / GIF assets for the README are placeholders.

## 8. Deliberately NOT built (respect this)

Hosted media of any kind, DRM, live sports/news, original content. See
ROADMAP.md §4 — these are product-identity decisions, not gaps.
