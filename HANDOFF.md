# Open Stream — Agent Handoff (Sept 5, 2026)

Everything below was verified against the working tree at commit `b92f118`
(head of `dev`, clean, fully pushed to `origin/dev`).

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
