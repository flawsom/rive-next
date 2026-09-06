// ─── AI-style auto-chapters (client-side scene-cut detection) ─────────────────
// PRD 3.4 "Auto-Chapters": sample frames across the duration, compute a cheap
// RGB histogram for each, and mark a chapter where the histogram distance
// spikes (a hard scene cut). Runs entirely in the browser on the SAME video
// element that is playing — no server round-trip, no manifest parsing, works
// for both HLS (hls.js MSE) and DASH (shaka MSE) because the element holds a
// decodable MediaSource. Draw calls are throttled and tiny (128px), so the
// cost during playback is negligible.
//
// Failure is always soft: CORS-tainted video (some proxied segments), or a
// decode hiccup just returns an empty chapter list.

export interface Chapter {
  /** Chapter start, seconds. */
  start: number;
  /** Human label: "Chapter 1", "Chapter 2", … */
  label: string;
  /** Small JPEG dataURL captured at the chapter start (lazily, on demand). */
  thumb?: string;
}

const HIST_BINS = 8; // per channel → 8³ = 512 bins, plenty for cut detection
const SAMPLE_COUNT = 28; // frames sampled across the whole duration
const CUT_THRESHOLD = 0.34; // 0..1 histogram distance that counts as a cut
const MIN_CHAPTER_LEN = 90; // seconds — never a chapter per camera cut

interface Histogram {
  r: number[];
  g: number[];
  b: number[];
  mean: number;
}

const buildHistogram = (ctx: CanvasRenderingContext2D): Histogram | null => {
  const { data } = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const r = new Array<number>(HIST_BINS).fill(0);
  const g = new Array<number>(HIST_BINS).fill(0);
  const b = new Array<number>(HIST_BINS).fill(0);
  const step = 4; // every 4th pixel — plenty of signal, 16× cheaper
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    r[data[i] >> 5] += 1;
    g[data[i + 1] >> 5] += 1;
    b[data[i + 2] >> 5] += 1;
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    count += 1;
  }
  if (count === 0) return null;
  const norm = (bins: number[]) => bins.map((v) => v / count);
  return { r: norm(r), g: norm(g), b: norm(b), mean: sum / count };
};

const histogramDistance = (a: Histogram, b: Histogram): number => {
  // ½ L1 over the three channels + a luma-delta term (fades → strong cuts).
  let dist = 0;
  for (let i = 0; i < HIST_BINS; i += 1) {
    dist +=
      Math.abs(a.r[i] - b.r[i]) +
      Math.abs(a.g[i] - b.g[i]) +
      Math.abs(a.b[i] - b.b[i]);
  }
  dist *= 0.5;
  dist += Math.abs(a.mean - b.mean) / 255;
  return Math.min(1, dist / 3);
};

const captureHistogramAt = async (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  seconds: number,
): Promise<Histogram | null> => {
  const wasTime = video.currentTime;
  try {
    if (Math.abs(video.currentTime - seconds) < 0.05) {
      // already there — decode synchronously below
    } else {
      video.currentTime = seconds;
    }
    await new Promise<void>((resolve) => {
      const done = () => {
        video.removeEventListener("seeked", done);
        resolve();
      };
      video.addEventListener("seeked", done);
      // Safety: never hang the sampler on a stalled seek.
      setTimeout(done, 1200);
    });
    // Let a frame actually present before drawing.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const w = 128;
    const h = Math.max(
      1,
      Math.round((128 * (video.videoHeight || 9)) / (video.videoWidth || 16)),
    );
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return buildHistogram(ctx);
  } catch {
    return null;
  } finally {
    // Restore playback position so the user never sees the sampling scrub.
    if (Math.abs(video.currentTime - wasTime) >= 0.05) {
      video.currentTime = wasTime;
    }
  }
};

/**
 * Sample the video and derive chapters. Runs while playback continues; the
 * caller should await this fire-and-forget and surface results when ready.
 */
export const generateChapters = async (
  video: HTMLVideoElement,
): Promise<Chapter[]> => {
  if (typeof document === "undefined") return [];
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration < MIN_CHAPTER_LEN * 2) return [];

  // A hidden offscreen canvas does all the pixel work.
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 72;
  canvas.style.display = "none";
  document.body.appendChild(canvas);

  const cuts: number[] = [];
  try {
    const step = duration / SAMPLE_COUNT;
    let prev: Histogram | null = null;
    for (let i = 1; i < SAMPLE_COUNT; i += 1) {
      const t = i * step;
      const hist = await captureHistogramAt(video, canvas, t);
      if (!hist) continue;
      if (prev) {
        const dist = histogramDistance(prev, hist);
        if (dist >= CUT_THRESHOLD) cuts.push(t);
      }
      prev = hist;
    }
  } catch {
    // tainted pixels / decode error → fall through, maybe no chapters
  } finally {
    canvas.remove();
  }

  // Collapse cuts closer than MIN_CHAPTER_LEN and drop edge noise.
  const boundaries = [0];
  for (const cut of cuts) {
    if (cut - boundaries[boundaries.length - 1] >= MIN_CHAPTER_LEN) {
      boundaries.push(cut);
    }
  }
  // A trailing boundary within 60s of the end is noise.
  if (
    boundaries.length > 1 &&
    duration - boundaries[boundaries.length - 1] < 60
  ) {
    boundaries.pop();
  }
  if (boundaries.length <= 1) return [];

  return boundaries.map((start, index) => ({
    start,
    label: `Chapter ${index + 1}`,
  }));
};

/** Lazy thumbnail capture for one chapter (called when the menu opens). */
export const captureChapterThumb = async (
  video: HTMLVideoElement,
  start: number,
): Promise<string | undefined> => {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 54;
  canvas.style.display = "none";
  document.body.appendChild(canvas);
  try {
    const wasTime = video.currentTime;
    video.currentTime = start + 0.5;
    await new Promise<void>((resolve) => {
      const done = () => {
        video.removeEventListener("seeked", done);
        resolve();
      };
      video.addEventListener("seeked", done);
      setTimeout(done, 1200);
    });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", 0.6);
    video.currentTime = wasTime;
    return url.startsWith("data:image") ? url : undefined;
  } catch {
    return undefined;
  } finally {
    canvas.remove();
  }
};
