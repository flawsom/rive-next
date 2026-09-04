/**
 * Consumer E2E — exercises the platform the way a real user would:
 * page loads, metadata proxy, provider registry/sources, domains & manifest
 * APIs, media proxy guards, AI endpoints, and API hardening (405/400s).
 *
 * Mode-aware: it asks the server which credentials are configured
 * (GET /api/e2e/env). Without keys it asserts *graceful degradation*
 * (clean JSON errors, no hangs, no stack leaks). When TMDB / OpenAI keys
 * are present, the same checks escalate to *live-data* assertions —
 * real metadata payloads and real AI responses are required.
 *
 * Run against a running Next.js server (default http://localhost:3000):
 *   node scripts/consumer-e2e.js
 */
const BASE =
  process.env.OPENSTREAM_E2E_BASE ||
  process.env.RIVE_E2E_BASE ||
  "http://localhost:3000";

let passed = 0;
let failed = 0;
const failures = [];

/** Credential modes detected via preflight (graceful if preflight itself fails). */
const MODE = {
  tmdb: false, // NEXT_PUBLIC_TMDB_API_KEY live → metadata must return real data
  openai: false, // OPENAI_API_KEY live → AI endpoints must return real content
};

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Server errors must be structured JSON, never a stack trace or HTML crash. */
function cleanErrorShape(r) {
  if (r.status < 500) return true;
  if (r.json && typeof r.json.error === "string") return true;
  return !/at .+ \(?.*:\d+:\d+\)?/.test(r.text || "");
}

async function get(path, { timeout = 20000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* html or empty */
    }
    return { status: res.status, text, json, headers: res.headers };
  } catch (e) {
    return { status: 0, text: "", json: null, error: e.message };
  } finally {
    clearTimeout(t);
  }
}

async function post(path, body, { timeout = 60000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }
    return { status: res.status, text, json };
  } catch (e) {
    return { status: 0, text: "", json: null, error: e.message };
  } finally {
    clearTimeout(t);
  }
}

const main = async () => {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║ OPEN STREAM — CONSUMER E2E (pages, proxy, sources, media) ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Target: ${BASE}`);

  // ─── 0. Preflight: which credentials does the server have? ────────────
  console.log("\n🔑 TEST: Preflight — credential detection (/api/e2e/env)");
  const env = await get("/api/e2e/env", { timeout: 15000 });
  if (env.status === 200 && env.json && typeof env.json === "object") {
    MODE.tmdb = env.json.tmdb === true;
    MODE.openai = env.json.openai === true;
    check(
      "env introspection",
      true,
      `mode: ${MODE.tmdb ? "LIVE-TMDB" : "gate-tmdb"} / ${MODE.openai ? "LIVE-AI" : "gate-ai"}`,
    );
  } else {
    check(
      "env introspection (fallback: gate mode)",
      env.status === 404,
      `→ ${env.status}, defaulting to gate mode`,
    );
  }

  // ─── 1. Pages (consumer journeys) ──────────────────────────────────────
  console.log("\n🌐 TEST: Page loads (200 + meaningful HTML)");
  const pages = [
    "/",
    "/movie",
    "/tv",
    "/anime",
    "/kdrama",
    "/search",
    "/detail?type=movie&id=872585",
    "/watch?type=movie&id=872585",
    "/library",
    "/sources",
    "/settings",
    "/login",
    "/signup",
    "/disclaimer",
    "/downloads",
    "/404-these-does-not-exist",
  ];
  for (const page of pages) {
    const r = await get(page, { timeout: 60000 });
    const is404Page = page.includes("404-these");
    if (is404Page) {
      check(`GET ${page}`, r.status === 404, `→ ${r.status}`);
      continue;
    }
    const hasHtml = r.status === 200 && r.text.length > 500;
    check(`GET ${page}`, hasHtml, `→ ${r.status}, ${r.text.length} bytes`);
  }

  // ─── 2. Metadata proxy (TMDB via backendfetch) ─────────────────────────
  console.log("\n🎞️ TEST: Metadata proxy (/api/backendfetch)");
  const metaChecks = [
    ["trending", "/api/backendfetch?requestID=trending"],
    ["movieData", "/api/backendfetch?requestID=movieData&id=872585"],
    ["tvData", "/api/backendfetch?requestID=tvData&id=1396"],
    ["movieVideos", "/api/backendfetch?requestID=movieVideos&id=872585"],
    ["movieImages", "/api/backendfetch?requestID=movieImages&id=872585"],
    ["searchMulti", "/api/backendfetch?requestID=searchMulti&query=pushpa"],
    ["tvEpisodes", "/api/backendfetch?requestID=tvEpisodes&id=1396&season=1"],
    ["random", "/api/backendfetch?requestID=random"],
  ];
  for (const [name, path] of metaChecks) {
    const r = await get(path);
    if (MODE.tmdb) {
      // Live mode: TMDB key configured → these must be real 200 payloads.
      const okLive =
        r.status === 200 &&
        r.json &&
        typeof r.json === "object" &&
        !r.json.error &&
        (name === "trending" || name === "searchMulti"
          ? Array.isArray(r.json.results) && r.json.results.length > 0
          : true);
      check(
        `requestID=${name}`,
        okLive,
        `→ ${r.status}${r.json?.error ? ` error:${r.json.error}` : ""}`,
      );
    } else {
      // Gate mode: either real data or the clean 502 degradation.
      const okShape =
        (r.status === 200 && r.json !== null && typeof r.json === "object") ||
        (r.status === 502 && r.json?.error === "Metadata service unavailable");
      check(
        `requestID=${name}`,
        okShape && cleanErrorShape(r),
        `→ ${r.status}`,
      );
    }
  }
  // Guard rails
  const badReq = await get("/api/backendfetch?requestID=hackMe");
  check(
    "unknown requestID rejected",
    badReq.status === 400,
    `→ ${badReq.status}`,
  );
  const postMeta = await post("/api/backendfetch", { requestID: "trending" });
  check(
    "POST to GET-only proxy rejected",
    postMeta.status === 405,
    `→ ${postMeta.status}`,
  );

  // ─── 3. Provider registry & source selection ───────────────────────────
  console.log("\n🔌 TEST: Provider registry (/api/providers/sources)");
  const list = await get("/api/providers/sources?action=list");
  const providers = Array.isArray(list.json) ? list.json : [];
  const registryOk =
    providers.length > 0 &&
    providers.every(
      (p) =>
        p.id &&
        p.name &&
        Array.isArray(p.categories) &&
        p.capabilities &&
        typeof p.capabilities.hq === "boolean" &&
        typeof p.capabilities.subtitle === "boolean" &&
        typeof p.capabilities.dub === "boolean",
    );
  check(
    "action=list registry integrity",
    list.status === 200 && registryOk,
    `→ ${providers.length} providers`,
  );

  const expectedDefaults = ["hdhub4u", "moviesdrive", "fourkhdhub", "anichi"];
  for (const pid of expectedDefaults) {
    check(
      `registry contains approved provider "${pid}"`,
      providers.some((p) => p.id === pid),
    );
  }

  for (const cat of ["movie", "tv", "anime", "cartoon", "asianDrama"]) {
    const r = await get(`/api/providers/sources?action=best&category=${cat}`);
    const shape =
      r.status === 200 &&
      r.json &&
      r.json.provider &&
      r.json.provider.id &&
      Array.isArray(r.json.alternatives) &&
      Array.isArray(r.json.allAvailable);
    check(
      `action=best (${cat})`,
      shape,
      `→ ${r.json?.provider?.name || r.status}`,
    );
  }
  // Documented contract: no approved provider serves "live" → clean 502, no provider.
  const liveEmpty = await get(
    `/api/providers/sources?action=best&category=live`,
  );
  check(
    "action=best (live) returns documented empty-category contract",
    (liveEmpty.status === 502 && !liveEmpty.json?.provider) ||
      (liveEmpty.status === 200 &&
        liveEmpty.json &&
        liveEmpty.json.provider == null),
    `→ ${liveEmpty.status}${liveEmpty.json?.error ? ` (${liveEmpty.json.error})` : ""}`,
  );

  const detail = await get(
    "/api/providers/sources?action=detail&providerId=hdhub4u",
  );
  check(
    "action=detail hdhub4u",
    detail.status === 200 && detail.json?.capabilities,
    "",
  );
  const health = await get("/api/providers/sources?action=health");
  check(
    "action=health report",
    health.status === 200 && Array.isArray(health.json),
    `→ ${Array.isArray(health.json) ? health.json.length : 0} tracked`,
  );

  // Hardening: invalid provider id
  const badFail = await post("/api/providers/sources?action=reportFailure", {
    providerId: "not-a-provider",
  });
  check(
    "reportFailure unknown provider rejected",
    badFail.status === 400 || badFail.status === 404,
    `→ ${badFail.status}`,
  );
  const getMutation = await get("/api/providers/sources?action=reportFailure");
  check(
    "GET on mutation rejected",
    getMutation.status === 405,
    `→ ${getMutation.status}`,
  );

  // ─── 4. Domains & autonomous manifest ──────────────────────────────────
  console.log("\n🛰️ TEST: Domains + autonomous manifest");
  const dom = await get("/api/providers/domains?action=status");
  check("domains status", dom.status === 200, `→ ${dom.status}`);
  const mft = await get("/api/providers/manifest?action=status", {
    timeout: 30000,
  });
  const mftShape =
    mft.status === 200 && mft.json && typeof mft.json === "object";
  check(
    "manifest status",
    mftShape,
    `→ providers:${mft.json?.providerCount ?? "?"} domains:${mft.json?.domainCount ?? "?"} fresh:${mft.json?.fresh ?? "?"}`,
  );
  const sync = await post(
    "/api/providers/manifest?action=sync",
    {},
    { timeout: 60000 },
  );
  check("manifest sync (POST)", sync.status === 200, `→ ${sync.status}`);

  // ─── 5. Media proxy guards ────────────────────────────────────────────
  console.log("\n🛡️ TEST: Media proxy guards (/api/proxy/media)");
  const privateUrl = await get(
    "/api/proxy/media?url=http://127.0.0.1:9999/x.m3u8",
  );
  check(
    "private/local URL rejected",
    privateUrl.status === 400,
    `→ ${privateUrl.status}`,
  );
  const ftpUrl = await get("/api/proxy/media?url=ftp://example.com/v.mp4");
  check(
    "unsupported scheme rejected",
    ftpUrl.status === 400,
    `→ ${ftpUrl.status}`,
  );
  const noUrl = await get("/api/proxy/media");
  check("missing url rejected", noUrl.status === 400, `→ ${noUrl.status}`);
  const proxyPost = await post("/api/proxy/media", {
    url: "https://example.com/v.mp4",
  });
  check(
    "POST to media proxy rejected",
    proxyPost.status === 405,
    `→ ${proxyPost.status}`,
  );

  // ─── 6. AI endpoints (mode-aware) ─────────────────────────────────────
  console.log("\n🤖 TEST: AI endpoints (must respond cleanly, never hang)");
  if (!MODE.openai) {
    console.log(
      "  (gate mode — OPENAI_API_KEY not configured; asserting graceful degradation)",
    );
  }
  const aiChecks = [
    // /api/ai/search is provider-based (keyless) → 200 expected in both modes
    ["/api/ai/search", { query: "pushpa 2", type: "movie" }, "search"],
    [
      "/api/ai/recommend",
      {
        viewingHistory: {
          recentlyWatched: [
            {
              title: "Interstellar",
              type: "movie",
              genres: ["Sci-Fi", "Drama"],
            },
          ],
          favoriteGenres: ["Sci-Fi", "Drama"],
        },
      },
      "recommend",
    ],
    [
      "/api/ai/insights",
      {
        title: "Interstellar",
        type: "movie",
        overview: "Space exploration drama",
      },
      "insights",
    ],
    ["/api/ai/chat", { messages: [{ role: "user", content: "hi" }] }, "chat"],
  ];
  for (const [path, body, kind] of aiChecks) {
    // 60s: free-tier reasoning models need real generation time, and serverless
    // functions cap at 60s — the client must not give up before the server does.
    const r = await post(path, body, { timeout: 60000 });
    if (r.status === 0) {
      check(`POST ${path}`, false, `network error: ${r.error}`);
      continue;
    }
    if (kind === "search") {
      // Keyless — should work regardless of credentials.
      const ok =
        r.status === 200 &&
        r.json?.bestSource?.provider?.id &&
        Array.isArray(r.json.availableSources);
      check(
        `POST ${path}`,
        ok,
        `→ ${r.status}, best=${r.json?.bestSource?.provider?.id ?? "?"}`,
      );
      continue;
    }
    if (MODE.openai) {
      // Live mode: real AI responses required.
      let okLive = r.status === 200 && r.json && !r.json.error;
      let detailTxt = `→ ${r.status}`;
      if (kind === "chat")
        okLive =
          okLive &&
          typeof r.json.response === "string" &&
          r.json.response.length > 0;
      if (kind === "insights")
        okLive = okLive && typeof r.json === "object" && !("error" in r.json);
      if (!okLive && r.json?.error) detailTxt += ` error:${r.json.error}`;
      check(`POST ${path} (live)`, okLive, detailTxt);
    } else {
      // Gate mode: degrade cleanly — never hang, never leak a stack.
      const graceful =
        [200, 502, 503].includes(r.status) &&
        cleanErrorShape(r) &&
        !(r.status >= 500 && !(r.json && typeof r.json.error === "string"));
      check(
        `POST ${path}`,
        graceful,
        `→ ${r.status}${r.json?.error ? ` (${r.json.error})` : ""}`,
      );
    }
  }
  // Oversized payload guard (asBoundedString rejects >2000-char messages → 400)
  const big = await post("/api/ai/chat", {
    messages: [{ role: "user", content: "x".repeat(20000) }],
  });
  check(
    "oversized AI payload bounded",
    [400, 413].includes(big.status),
    `→ ${big.status}`,
  );

  // ─── 7. Static assets ──────────────────────────────────────────────────
  console.log("\n📦 TEST: Static assets");
  const logo = await get("/images/logo.svg");
  check(
    "logo asset",
    logo.status === 200 && logo.text.includes("svg"),
    `→ ${logo.status}`,
  );
  const favicon = await get("/favicon.ico");
  check(
    "favicon present",
    favicon.status === 200 || favicon.status === 404,
    `→ ${favicon.status}`,
  );

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════");
  console.log(
    `Mode: TMDB ${MODE.tmdb ? "LIVE" : "gated"} · AI ${MODE.openai ? "LIVE" : "gated"}`,
  );
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("Failed checks:");
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log("══════════════════════════════════════════════════════");
  process.exit(failed === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
