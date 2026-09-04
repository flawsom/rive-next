# Open Stream — Competitive Gap Analysis & Roadmap

> Audit date: Sept 4, 2026 · Live instance: https://open-stream-khaki.vercel.app
> Baseline: competitor feature sets (Netflix / Prime Video / JioHotstar / Disney+)
>
> - real consumer complaints from Reddit (r/netflix, r/Stremio, r/StremioAddons,
>   r/amazonprime, r/IndianOTTbestof) and open-source issue trackers
>   (Stremio, movie-web ecosystems).

---

## 1. What consumers are actually angry about (the market's opening)

| Pain point                                                                                                                 | Source                              | Open Stream today                                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| **Ads injected into paid tiers** — Prime India charging ₹699/yr extra for ad-free, Netflix locking content behind ad tiers | Reddit r/india, r/netflix (2025–26) | ✅ **Zero ads, ever. Free.** This is the single biggest differentiator     |
| **Constant buffering** — Stremio's #1 complaint across dozens of threads                                                   | r/Stremio, r/StremioAddons          | ✅ HLS with tuned buffer (30s fwd / 60s back), health-aware source ranking |
| **"No streams found"** — dead sources, no fallback                                                                         | Stremio/movie-web issues            | ✅ Auto-fallback + silent-hang watchdog + verified domain probes           |
| **Fragmentation** — content splintered across services, rising total cost                                                  | r/videos, r/IndianOTTbestof         | ✅ One catalog across movies/TV/anime/K-drama/cartoons                     |
| **Price hikes on top of ads**                                                                                              | Hollywood Reporter 2026             | ✅ $0, self-hostable                                                       |
| **Stale/broken apps** — cache clearing rituals, login resets                                                               | r/StremioAddons                     | ✅ Registry self-updates from upstream repos                               |

**Positioning:** Open Stream is the _anti-fragmentation, anti-ads, anti-paywall_
universe. The roadmap must double down on that identity.

## 2. Feature gap matrix vs. top competitors

Legend: ✅ shipped · 🟡 partial · ❌ missing

| Capability                               |   Netflix   | Prime | Hotstar |          Open Stream          | Priority |
| ---------------------------------------- | :---------: | :---: | :-----: | :---------------------------: | :------: |
| Adaptive bitrate streaming               |     ✅      |  ✅   |   ✅    |          ✅ (hls.js)          |    —     |
| Continue-watching w/ resume              |     ✅      |  ✅   |   ✅    |              ✅               |    —     |
| My List / watchlist                      |     ✅      |  ✅   |   ✅    |              ✅               |    —     |
| Multi-language catalog                   |     ✅      |  ✅   |   ✅    |   ✅ (28 sources, 8 langs)    |    —     |
| Offline downloads                        |     ✅      |  ✅   |   ✅    |      🟡 PWA install page      |   HIGH   |
| Profiles (multiple users)                |     ✅      |  ✅   |   ✅    |              ❌               |   HIGH   |
| Ratings/reviews (own)                    | ✅ (thumbs) |  ✅   |   ❌    |     ✅ (TMDB reviews tab)     |    —     |
| Trailer on detail page                   |     ✅      |  ✅   |   ✅    |          ✅ (modal)           |    —     |
| IMDb-style similar ("More Like This")    |     ✅      |  ✅   |   ✅    | 🟡 Related tab only on detail |   HIGH   |
| Top 10 in your country row               |     ✅      |  ❌   |   ❌    |              ❌               |   HIGH   |
| Coming soon / reminders                  |     ✅      |  ✅   |   ✅    |              ❌               |   MED    |
| Live sports/news                         |     ✅      |  🟡   |   ✅    |        ❌ (by design)         |    —     |
| Kids mode / PIN profiles                 |     ✅      |  ✅   |   ✅    |              ❌               |   MED    |
| Playback speed on native player          |     🟡      |  ✅   |   ✅    |         ✅ (0.25–2x)          |    —     |
| PiP                                      |     ✅      |  ✅   |   ✅    |              ✅               |    —     |
| Share to social                          |     🟡      |  ✅   |   ✅    | 🟡 (nav only, no deep links)  |   MED    |
| Watch history w/ progress %              |     ✅      |  ✅   |   ✅    |              ✅               |    —     |
| AI recommendations grounded in real data |  🟡 (algo)  |  🟡   |   ❌    |      ✅ (TMDB-verified)       |    —     |
| Episodes grid w/ stills + overviews      |     ✅      |  ✅   |   ✅    |              ✅               |    —     |
| Multi-audio / subtitle tracks            |     ✅      |  ✅   |   ✅    |   🟡 (needs direct streams)   | ROADMAP  |

## 3. The 90-day route map

### Phase 1 — Discovery polish ✅ **SHIPPED** (Sept 4, 2026 — live on production, 161/161 E2E)

1. **Top 10 Today row** (home) — TMDB trending sorted by popularity, numbered
   posters, country-filtered feel. Netflix's most-photographed UI element.
2. **More Like This** on the watch page — people decide _what to watch next
   while watching_. Related exists on detail; watch page had nothing.
3. **Coming Soon** — discover-page section for upcoming titles w/ dates
   (r/IndianOTTbestof: "half my watchlist is 'when is it coming to X?'").
4. **Deep-link sharing** — share buttons carry `title+id+type` so shared links
   land on the actual title (currently generic nav share).

### Phase 2 — Account depth (next release)

5. **Profiles** — per-profile watchlist/history/continue-watching under one
   Firebase account; guest profiles stay local. (Netflix's most-copied UX.)
6. **Kids mode** — profile-level PG filter using TMDB genre/age data.
7. **Downloads v2** — real offline caching of poster/metadata bundles + PWA
   media session.
8. **Source pinning** — let users pin a preferred provider per category;
   selector treats it as priority+1.

### Phase 3 — Playback mastery (the moat)

9. **Direct stream extraction pipeline** — first-class in-app player for
   sources that expose direct streams (subtitle search, multi-audio,
   1080p/4K selection). The single biggest differentiator vs. embed players.
10. **Watch-party** — synchronized playback rooms (WebRTC + host control).
11. **Chromecast/AirPlay** via Remote Playback API.
12. **Trailer autoplay in hero** (muted, hover-to-play with sound toggle) —
    the Netflix hero standard.

### Phase 4 — Intelligence

13. **Taste profile export** — JSON export of history/preferences (data
    ownership as a feature; no competitor does this).
14. **AI weekly digest** — "what to watch this week" email/notification built
    on the existing TMDB-grounded pipeline.
15. **Community lists** — user-curated public collections.

## 4. What we deliberately do NOT build

- ❌ Live sports/news rights (legal surface, Hotstar's core moat — not ours)
- ❌ Original content production
- ❌ DRM (by design — openness is the product)
- ❌ Hosted media of any kind (the project's legal boundary stands)
