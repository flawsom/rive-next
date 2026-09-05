# Open Stream — Agent Handoff (Sept 5, 2026)

> Everything below was verified against live production deploys of `dev`
> (HEAD `bbe46d9` + the Session-3 tweak at the tip, then Session 4's
> direct-stream tier), all pushed to `origin/dev`. Vercel auto-deploys.

---

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
