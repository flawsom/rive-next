// Resilient title links.
//
// Root cause of "links go undefined": cards render <Link href="/detail?type=undefined&id=undefined">
// whenever an upstream list item lacks id/media_type (e.g. a provider upload
// that did not match TMDB, or a partial API result). These guards centralize
// the rule: never emit a dead link — omit the element instead.
export function safeDetailHref(data: any, mediaType?: string): string | null {
  const type = (data?.media_type || mediaType || "").toString();
  const id = data?.id;
  if (!id && id !== 0) return null;
  if (type !== "movie" && type !== "tv" && type !== "collection") return null;
  return type === "collection"
    ? `/collections/${id}`
    : `/detail?type=${type}&id=${id}`;
}

export function safeWatchHref(
  data: any,
  mediaType?: string,
  opts?: { download?: boolean },
): string | null {
  const type = (data?.media_type || mediaType || "").toString();
  const id = data?.id;
  if ((type !== "movie" && type !== "tv") || (!id && id !== 0)) return null;
  const suffix = type === "tv" ? "&season=1&episode=1" : "";
  const dl = opts?.download ? "&source=download" : "";
  return `/watch?type=${type}&id=${id}${suffix}${dl}`;
}
