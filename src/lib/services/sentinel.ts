/**
 * TerraVision AI – Sentinel Hub API Service Layer
 * EU-Central-1 (Frankfurt) deployment. Catalog, Process, and Statistical APIs only.
 */

const SENTINEL_BASE = "https://services.sentinel-hub.com";
const AUTH_URL = `${SENTINEL_BASE}/auth/realms/main/protocol/openid-connect/token`;
const CATALOG_SEARCH_URL = `${SENTINEL_BASE}/api/v1/catalog/1.0.0/search`;
const PROCESS_URL = `${SENTINEL_BASE}/api/v1/process`;
const STATISTICS_URL = `${SENTINEL_BASE}/api/v1/statistics`;

const COLLECTION_S2L2A = "sentinel-2-l2a";
const CRS_WGS84 = "http://www.opengis.net/def/crs/OGC/1.3/CRS84";
const MAX_CLOUD_COVER_PERCENT = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BBox = [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]

export interface DateRange {
  from: string; // ISO 8601
  to: string;
}

export interface CatalogImageResult {
  id: string;
  timestamp: string;
  cloudCover?: number;
}

export interface VegetationStats {
  mean: number;
  min: number;
  max: number;
  stDev: number;
  sampleCount?: number;
  noDataCount?: number;
}

export interface VegetationStatsResponse {
  status: string;
  data: Array<{
    interval: { from: string; to: string };
    outputs: {
      ndvi?: {
        bands?: {
          B0?: { stats?: VegetationStats };
          [key: string]: { stats?: VegetationStats } | undefined;
        };
      };
      [key: string]: unknown;
    };
  }>;
}

/** GeoJSON Polygon (WGS84: coordinates as [lon, lat][]). */
export type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

// Token cache: reuse until ~60s before exp to avoid race conditions
let cachedToken: { access_token: string; exp: number } | null = null;

function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.SENTINEL_CLIENT_ID;
  const clientSecret = process.env.SENTINEL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing SENTINEL_CLIENT_ID or SENTINEL_CLIENT_SECRET in environment"
    );
  }
  return { clientId, clientSecret };
}

/**
 * Decode JWT payload to read exp (seconds since epoch). No signature check.
 */
function getExpFromToken(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const raw =
      typeof Buffer !== "undefined"
        ? Buffer.from(payload, "base64url").toString("utf8")
        : atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const decoded = JSON.parse(raw) as { exp?: number };
    return decoded.exp ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 1. Authentication (OAuth2 Client Credentials)
 * Obtain an access token and cache it until it expires.
 */
export async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) {
    return cachedToken.access_token;
  }

  const { clientId, clientSecret } = getClientCredentials();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentinel Hub auth failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };
  const exp = data.expires_in
    ? now + data.expires_in
    : getExpFromToken(data.access_token);
  cachedToken = { access_token: data.access_token, exp };
  return data.access_token;
}

/**
 * 2. Catalog API – search for Sentinel-2 L2A images with < 10% cloud cover.
 * Returns the most recent, cleanest scene (id + timestamp).
 */
export async function searchSatelliteImages(
  bbox: BBox,
  dateRange: DateRange
): Promise<CatalogImageResult | null> {
  const token = await getAccessToken();
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const fromStr = dateRange.from.includes("T") ? dateRange.from : `${dateRange.from}T00:00:00Z`;
  const toStr = dateRange.to.includes("T") ? dateRange.to : `${dateRange.to}T23:59:59Z`;
  const datetime = `${fromStr}/${toStr}`;

  const payload = {
    bbox: [minLon, minLat, maxLon, maxLat],
    datetime,
    collections: [COLLECTION_S2L2A],
    limit: 50,
    "filter-lang": "cql2-json",
    filter: {
      op: "<",
      args: [{ property: "eo:cloud_cover" }, MAX_CLOUD_COVER_PERCENT]
    },
  };

  const res = await fetch(CATALOG_SEARCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/geo+json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentinel Hub Catalog search failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    features?: Array<{
      id?: string;
      properties?: { datetime?: string; "eo:cloud_cover"?: number };
    }>;
  };

  const features = (data.features ?? []).slice().sort((a, b) => {
    const aTime = a.properties?.datetime ?? "";
    const bTime = b.properties?.datetime ?? "";
    if (aTime === bTime) return 0;
    // Newest first (descending)
    return aTime < bTime ? 1 : -1;
  });
  if (features.length === 0) return null;

  const best = features[0];
  return {
    id: best.id ?? "",
    timestamp: best.properties?.datetime ?? "",
    cloudCover: best.properties?.["eo:cloud_cover"],
  };
}

/** True Color evalscript: B04 (R), B03 (G), B02 (B) with brightness boost. */
const TRUE_COLOR_EVALSCRIPT = `
//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04"],
    output: { bands: 3, sampleType: "AUTO" }
  };
}
function evaluatePixel(sample) {
  // Multiply by 2.5 to increase brightness
  return [2.5 * sample.B04, 2.5 * sample.B03, 2.5 * sample.B02];
}
`.trim();

/** NDVI evalscript: (B08 - B04) / (B08 + B04), mapped to Red (low) -> Green (high) PNG. */
const NDVI_EVALSCRIPT_IMAGE = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08"] }],
    output: { id: "default", bands: 3 }
  };
}
function evaluatePixel(sample) {
  const sum = sample.B08 + sample.B04;
  const ndvi = sum === 0 ? 0 : (sample.B08 - sample.B04) / sum;
  // Red (low/barren) -> Green (high/healthy)
  if (ndvi < -0.2) return [0.8, 0.2, 0.2];
  if (ndvi < 0) return [0.9, 0.5, 0.3];
  if (ndvi < 0.2) return [0.85, 0.6, 0.2];
  if (ndvi < 0.4) return [0.5, 0.7, 0.2];
  if (ndvi < 0.6) return [0.2, 0.75, 0.2];
  return [0.1, 0.6, 0.1];
}
`.trim();

/**
 * 3. Process API – generate NDVI Health Map as PNG (Red = low, Green = high).
 */
export async function generateNDVIImage(
  bbox: BBox,
  date: string,
  width: number,
  height: number
): Promise<ArrayBuffer> {
  const token = await getAccessToken();
  const [minLon, minLat, maxLon, maxLat] = bbox;

  const requestBody = {
    input: {
      bounds: {
        properties: { crs: CRS_WGS84 },
        bbox: [minLon, minLat, maxLon, maxLat],
      },
      data: [
        {
          type: COLLECTION_S2L2A,
          dataFilter: {
            timeRange: {
              from: `${date}T00:00:00Z`,
              to: `${date}T23:59:59Z`,
            },
          },
        },
      ],
    },
    output: {
      width,
      height,
      responses: [{ identifier: "default", format: { type: "image/png" } }],
    },
  };

  const form = new FormData();
  form.append("request", JSON.stringify(requestBody));
  form.append("evalscript", NDVI_EVALSCRIPT_IMAGE);

  const res = await fetch(PROCESS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "image/png",
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentinel Hub Process API failed (${res.status}): ${text}`);
  }

  return res.arrayBuffer();
}

/**
 * Process API – generate True Color (RGB) satellite image as PNG.
 */
export async function generateTrueColorImage(
  bbox: BBox,
  date: string,
  width: number,
  height: number
): Promise<ArrayBuffer> {
  const token = await getAccessToken();
  const [minLon, minLat, maxLon, maxLat] = bbox;

  const requestBody = {
    input: {
      bounds: {
        properties: { crs: CRS_WGS84 },
        bbox: [minLon, minLat, maxLon, maxLat],
      },
      data: [
        {
          type: COLLECTION_S2L2A,
          dataFilter: {
            timeRange: {
              from: `${date}T00:00:00Z`,
              to: `${date}T23:59:59Z`,
            },
          },
        },
      ],
    },
    output: {
      width,
      height,
      responses: [{ identifier: "default", format: { type: "image/png" } }],
    },
  };

  const form = new FormData();
  form.append("request", JSON.stringify(requestBody));
  form.append("evalscript", TRUE_COLOR_EVALSCRIPT);

  const res = await fetch(PROCESS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "image/png",
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentinel Hub Process API failed (${res.status}): ${text}`);
  }

  return res.arrayBuffer();
}

/** Evalscript for Statistical API: single-band NDVI + dataMask for valid pixels. */
const NDVI_EVALSCRIPT_STATS = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(samples) {
  const B04 = samples.B04, B08 = samples.B08;
  const sum = B08 + B04;
  const ndvi = sum === 0 ? 0 : (B08 - B04) / sum;
  const valid = samples.dataMask === 1 && sum > 0 ? 1 : 0;
  return { ndvi: [ndvi], dataMask: [valid] };
}
`.trim();

/**
 * 4. Statistical API – NDVI stats (Mean, Min, Max, StDev) for AI/LLM consumption.
 * geometry: GeoJSON Polygon in WGS84 (coordinates in lon/lat).
 */
export async function getVegetationStats(
  geometry: GeoJsonPolygon,
  date: string
): Promise<VegetationStatsResponse> {
  const token = await getAccessToken();
  const from = `${date}T00:00:00Z`;
  const to = `${date}T23:59:59Z`;

  const payload = {
    input: {
      bounds: {
        geometry,
        properties: { crs: CRS_WGS84 },
      },
      data: [
        {
          type: COLLECTION_S2L2A,
          dataFilter: { mosaickingOrder: "leastCC" as const },
        },
      ],
    },
    aggregation: {
      timeRange: { from, to },
      aggregationInterval: { of: "P1D" },
      evalscript: NDVI_EVALSCRIPT_STATS,
      resx: 100,
      resy: 100,
    },
    calculations: {
      default: {
        statistics: {
          default: {},
        },
      },
    },
  };

  const res = await fetch(STATISTICS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentinel Hub Statistical API failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<VegetationStatsResponse>;
}

/**
 * Helper: extract first-interval NDVI stats from Statistical API response for LLM.
 * Band key is typically "B0" for single-band output.
 */
export function extractNDVIStatsForLLM(
  response: VegetationStatsResponse
): VegetationStats | null {
  const first = response.data?.[0];
  const bands = first?.outputs?.ndvi?.bands;
  if (!bands) return null;
  const stats = bands.B0?.stats ?? bands[Object.keys(bands)[0]]?.stats;
  return stats ?? null;
}
