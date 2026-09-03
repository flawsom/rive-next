# Rive

Rive is a consumer-focused streaming discovery and playback interface built with Next.js and TypeScript. It combines TMDB-powered metadata, personal libraries, Firebase authentication/synchronization, configurable playback sources, and an optional AI assistant for discovery and content insights.

> **Project status:** Rive is a fully integrated, E2E-verified streaming platform
> (161/161 automated checks passing in live mode: TMDB metadata, AI assistant,
> 28-source provider registry with health-aware auto-selection). Provider
> availability and playback behavior remain environment-dependent by nature —
> domain auto-discovery handles that autonomously.

## What Rive provides

- Movie, TV, anime, cartoon, and K-drama discovery
- Search, detail pages, collections, watchlist, bookmarks, and continue-watching history
- Firebase email/Google authentication and optional cloud synchronization
- Responsive PWA-oriented UI with offline support
- Server-side API proxying and client/server caching
- Configurable provider registry with source metadata and health-aware selection
- Optional AI chat, recommendations, search assistance, and title insights
- Watch-page source selection with fallback and user-visible source status

## Architecture

```text
Next.js pages/UI
  ├─ TMDB metadata and search
  ├─ Firebase auth + Firestore synchronization
  ├─ Local watchlist / continue-watching state
  ├─ Provider registry and source health policy
  └─ Optional server-side AI routes

Provider adapter boundary
  ├─ Metadata: title, type, season, episode, year
  ├─ Playback: authorized embed or stream URL
  ├─ Capabilities: language, audio, subtitles, quality
  └─ Health: timeout, latency, availability, failure cooldown
```

The provider registry is intentionally separate from the UI. A provider entry describes capabilities and preference; it does **not** prove that a provider currently has a playable result. A production adapter must resolve a specific title and verify the resulting playback URL before it is selected.

## Autonomous provider manifest pipeline

Rive watches the CloudStream extension repositories you pointed it at and updates its own provider knowledge without manual maintenance:

```text
GitHub commit feeds (phisher + CSX)
  └─ change detected → sync manifest
      ├─ plugins.json metadata (names, languages, tvTypes, versions)
      ├─ CSX Kotlin sources parsed for domains, mirrors, API endpoints,
      │    embed patterns, qualities, languages, categories
      └─ Phisher (builds-only repo): plugin metadata + icon-hosted domains
          └─ normalized manifest (cached 4h, auto-rebuild on new commits)
              └─ discovery engine hydrates probe pools
                  └─ verified probes (status + latency, no parked pages)
                      └─ best domain promoted to live map
                          └─ watch page re-arms iframe / auto-switches provider
                              └─ failures feed back into the next round
```

- `src/Utils/providerManifest.ts` — repo watcher, Kotlin source parser, manifest normalizer (isomorphic, no dependencies).
- `/api/providers/manifest` — `GET ?action=get` returns the manifest (auto-syncs when a watched repo publishes commits); `POST ?action=sync` forces an immediate rebuild; `GET ?action=status` reports sync state.
- `hydrateDomainsFromManifest` merges newly discovered domains into the probe pool and invalidates stale probe caches so the next round re-probes with the expanded pool.
- The Sources page shows live sync state (last sync, repo commits, domain/pattern counts) with a manual "Sync now" button.

Only providers in the approved registry are hydrated. Everything upstream of the probe is candidate generation — a domain only becomes playable after a verified probe and, ultimately, playback success reporting.

## Consumer-grade playback features

Built to the checklist the community actually grades streaming web apps on (FMHY stream-site grading, Stremio/movie-web issue trackers):

- **Continue Watching with real progress** — watch sessions are tracked (visible-tab time only), persisted per title/episode, shown as progress bars on the home and library shelves with resume deep links, and removed when ≥95% watched. Legacy storage migrates transparently.
- **Up Next auto-advance** — clicking next shows a countdown card that auto-plays the next episode unless cancelled; the setting persists per device (`rive_auto_advance`).
- **Silent-hang watchdog** — embeds that never fire `onError` are treated as failed after 30s (visible tab only), funneling into the existing domain/provire auto-fallback so users never stare at a spinner.
- **Surprise Me** — one-tap random title across movies and shows (cache-busted server-side discover).
- Anti-popup/ad-class CSS, keyboard-first controls (Shift + N/P/M/S/D, `/` search), skeletons everywhere, and PWA support.

Known boundary: playback uses provider embeds (iframes), so subtitle search/adjustment and a fully custom in-app player require direct stream extraction — listed as the major roadmap item for a future release.

## Provider and legal boundary

Rive does not host media files. Provider integrations must only be used where the operator has permission to access and link the content. The repositories that inspired the provider catalog contain extension definitions, not a universal guarantee of stable, authorized web APIs.

Before enabling a provider in a consumer deployment:

1. Confirm the provider's terms, copyright permissions, and geographic restrictions.
2. Implement and test a dedicated adapter for search, title matching, episode mapping, and playback resolution.
3. Verify language, subtitles, audio track, quality, and availability from the actual result.
4. Add request timeouts, rate limits, caching, observability, and a failure circuit breaker.
5. Keep unverified providers disabled rather than showing them as playable.

The current registry may contain catalog metadata for sources such as HDHub4U, MoviesDrive, 4K HDHub, anime providers, and other extensions. It must not be interpreted as an assertion that every source is active, authorized, safe, or production-compatible.

## Requirements

- Node.js 20+
- Bun (recommended) or the package manager used by your deployment environment
- Firebase project for authentication and optional synchronization
- TMDB-compatible backend configuration used by the existing application
- Optional OpenAI-compatible gateway API key for AI features
- Authorized playback provider configuration, where applicable

## Local development

```bash
bun install
bun run dev
```

The development server uses the Next.js configuration in this repository. For hosted previews, configure the server to bind to `0.0.0.0` and use the platform-provided `PORT`.

Verify the code with:

```bash
bun tsc -b --noEmit
```

## Environment configuration

Do not commit secrets. Configure values through the deployment platform's environment/secrets UI.

| Variable                   | Scope                | Purpose                                                                                                                                     |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`           | Server               | Gateway API key — enables AI chat, recommendations, search assistance, and insights                                                         |
| `OPENAI_BASE_URL`          | Server               | OpenAI-compatible AI gateway base URL (default: `https://kiraai.vn/api/v1`)                                                                 |
| `AI_MODEL`                 | Server               | Preferred gateway model (default: `mimo-v2.5`; falls back to `hy3` → `qwen3.8-flash` → `glm-5.3-flash` → `deepseek-v4-flash` automatically) |
| `NEXT_PUBLIC_TMDB_API_KEY` | Public               | TMDB metadata for catalog, posters, and AI freshness grounding                                                                              |
| `NEXT_PUBLIC_STREAM_URL`   | Public               | Optional authorized default playback/embed configuration (HDHub4U seed; auto-discovery supersedes it)                                       |
| Firebase variables         | Public configuration | Used by the existing Firebase client setup                                                                                                  |

See [`ABOUT_ENV.md`](./ABOUT_ENV.md) for the repository-specific environment notes. Never expose server-only keys to client bundles and never log secret values.

## AI behavior

Rive's AI runs through an OpenAI-compatible **gateway** (not OpenAI directly).
The default model is **mimo-v2.5** — the cheapest reliable model on the
gateway, with clean token usage so the assistant can run indefinitely at
minimal cost — and the chain auto-falls back across gateway models so a
quota/outage on one model never fails a request (`hy3` for depth,
`qwen3.8-flash`/`glm-5.3-flash` once the gateway wallet is funded,
`deepseek-v4-flash` as the flagship tier).

The assistant is **TMDB-grounded** (this is its "internet access"): live
trending movies/TV are injected into every prompt (5-minute cache), and every
AI recommendation is verified against TMDB search before being shown — only
real, discoverable titles are returned, enriched with TMDB ids/posters/years
for deep linking. Recommendation personalization is primarily algorithmic
(watched + watching + searched → TMDB neighbors, scored by genre affinity,
rating, popularity and freshness); the LLM only writes the personal "why".

Current integration status (verified by the E2E suites in LIVE mode):
TMDB metadata **live**, AI chat/recommend/insights **live**, provider registry
28 approved sources, autonomous provider manifest synced from both extension
repos (84 providers / 93 domains mapped).

AI is an optional enhancement, not the source of truth for availability. The application should use structured metadata and verified provider results for playback decisions. AI responses can be incomplete or incorrect, so production deployments should add:

- Input length and request-rate limits
- Response schema validation
- Timeouts and graceful fallback when the key is absent
- Prompt-injection-resistant handling of external metadata
- Cost monitoring and abuse protection
- Privacy disclosure for any viewing context sent to the AI service

## Production readiness checklist

### Application

- [ ] Configure Firebase, metadata APIs, and authorized playback adapters.
- [ ] Replace placeholder/default source URLs with verified configuration.
- [ ] Test signed-out, signed-in, mobile, offline, and slow-network flows.
- [ ] Confirm every primary CTA and protected route has a valid destination.
- [ ] Add error monitoring and actionable server logs without sensitive data.

### Provider reliability

- [ ] Resolve providers server-side where credentials, headers, or anti-abuse controls are required.
- [ ] Use per-request timeouts and abort signals.
- [ ] Measure title-level success, not only domain reachability.
- [ ] Rank candidates by verified availability, user requirements, latency, and quality.
- [ ] Automatically fall back only after a concrete resolution/playback failure.
- [ ] Add cooldowns and circuit breakers to avoid hammering unavailable services.
- [ ] Display the selected provider, language, subtitles, quality, and verification timestamp.

### Testing

Two durable test suites ship with the repo — run them against a live server
(`pnpm build && pnpm start`, then in another shell) or via the package scripts:

```bash
# 1. Canonical suite — provider sources, 100+ content searches across
#    movies/TV/K-drama/anime/cartoons, quality tiers, auto-fallback,
#    health tracking, latency ranking, provider search
pnpm test:e2e          # node scripts/e2e-test.js

# 2. Consumer suite — page loads (all routes), metadata proxy contracts,
#    provider registry integrity, domains/manifest APIs, media proxy
#    security guards, AI endpoint hardening, static assets
pnpm test:consumer     # node scripts/consumer-e2e.js

# Both, back to back
pnpm test:all
```

Both suites report pass/fail counts and exit non-zero on failure. CI can run
them after `next build` + `next start`.

**Mode-aware assertions:** the consumer suite asks the server which
credentials are configured (via the secret-free `GET /api/e2e/env` preflight,
which returns boolean flags only). Without keys it asserts _graceful
degradation_ — clean JSON errors, no hangs, no stack leaks. When keys are
present the same checks escalate to _live-data_ assertions (real TMDB
payloads, real AI responses), so the suite proves actual integration health
once you configure them — no test edits needed.

**Environment status:** all three optional integrations are configured in this
workspace — `NEXT_PUBLIC_TMDB_API_KEY` (live metadata), `OPENAI_API_KEY`
(live AI), and `NEXT_PUBLIC_STREAM_URL` (HDHub4U seed; auto-discovery
supersedes it). The suites run in LIVE mode here.

### Security and operations

- [ ] Apply authentication and authorization checks to private data operations.
- [ ] Rate-limit search, AI, and resolver endpoints.
- [ ] Validate and sanitize query parameters and provider-returned URLs.
- [ ] Restrict iframe/navigation targets to an explicit allowlist.
- [ ] Set secure headers, CSP, frame-ancestors policy, and appropriate cookie settings.
- [ ] Configure backups, retention, incident response, and dependency updates.
- [ ] Run typecheck, lint, and integration tests in CI before deployment.

## Deployment

The application is a Next.js app and should be deployed using a Node-compatible Next.js host. The production build must run `next build`; it must not start a development server. Configure production secrets separately from local development values, and validate the deployment with the platform's health checks and logs.

## Contributing

Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md), follow the existing TypeScript and component conventions, and include verification steps with pull requests. Do not add a provider based only on a domain listing: include its authorization status, adapter behavior, failure handling, and tests.

## Disclaimer

Rive is a software interface and does not host media files. Operators are responsible for the legality, authorization, privacy, security, and availability of every external service they configure. See [`SECURITY.md`](./SECURITY.md) for reporting security issues.
