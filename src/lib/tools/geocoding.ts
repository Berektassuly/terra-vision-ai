/**
 * OpenStreetMap Nominatim geocoding for TerraVision AI.
 * Rate-limited, User-Agent compliant, with BBox normalization to app standard.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "TerraVision-AI/1.0 (Agronomist Agent; contact@terravision.example)";

/** App standard: [minLon, minLat, maxLon, maxLat] (numbers). */
export type BBox = [number, number, number, number];

/** Nominatim returns boundingbox as [minLat, maxLat, minLon, maxLon] (strings). */
function nominatimBboxToAppBbox(
  bbox: [string, string, string, string]
): BBox {
  const [minLat, maxLat, minLon, maxLon] = bbox.map(Number);
  if ([minLat, maxLat, minLon, maxLon].some(Number.isNaN)) {
    throw new Error("Invalid Nominatim bbox");
  }
  return [minLon, minLat, maxLon, maxLat];
}

let lastRequestTime = 0;
const RATE_LIMIT_MS = 1000;

function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    return new Promise((resolve) =>
      setTimeout(resolve, RATE_LIMIT_MS - elapsed)
    );
  }
  lastRequestTime = Date.now();
  return Promise.resolve();
}

export interface LookupLocationResult {
  displayName: string;
  bbox: BBox;
  placeId: string;
}

/**
 * Look up a place by name (e.g. "Iowa", "Berlin") via Nominatim.
 * Returns null if not found so the LLM can ask for clarification.
 */
export async function lookupLocation(
  query: string
): Promise<LookupLocationResult | null> {
  await rateLimit();

  const params = new URLSearchParams({
    q: query.trim(),
    format: "json",
    limit: "1",
    addressdetails: "0",
  });

  const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as Array<{
    boundingbox?: [string, string, string, string];
    display_name?: string;
    place_id?: string;
  }>;

  const first = data?.[0];
  if (!first?.boundingbox || first.boundingbox.length !== 4) {
    return null;
  }

  try {
    const bbox = nominatimBboxToAppBbox(first.boundingbox);
    return {
      displayName: first.display_name ?? query,
      bbox,
      placeId: String(first.place_id ?? ""),
    };
  } catch {
    return null;
  }
}
