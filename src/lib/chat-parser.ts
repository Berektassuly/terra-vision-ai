/**
 * Rule-based intent parser for TerraVision chat.
 * Detects requests for satellite search, NDVI image, or stats and extracts bbox/dates.
 */

const BBOX_REGEX = /(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/;
const DATE_REGEX = /\b(\d{4}-\d{2}-\d{2})\b/g;

export type ParsedIntent =
  | { action: "search"; bbox: [number, number, number, number]; from: string; to: string }
  | { action: "ndvi-image"; bbox: [number, number, number, number]; date: string }
  | { action: "stats"; bbox: [number, number, number, number]; date: string }
  | null;

function extractBbox(text: string): [number, number, number, number] | null {
  const match = text.match(BBOX_REGEX);
  if (!match) return null;
  const [minLon, minLat, maxLon, maxLat] = match.slice(1, 5).map(Number);
  if ([minLon, minLat, maxLon, maxLat].some(Number.isNaN)) return null;
  return [minLon, minLat, maxLon, maxLat];
}

function extractDates(text: string): string[] {
  const dates: string[] = [];
  let m: RegExpExecArray | null;
  DATE_REGEX.lastIndex = 0;
  while ((m = DATE_REGEX.exec(text)) !== null) {
    dates.push(m[1]);
  }
  return dates;
}

/**
 * Parse user message into an API intent (search, ndvi-image, stats) with bbox and dates.
 * Example: "Show NDVI for 13.4,52.5,13.5,52.6 from 2024-01-01 to 2024-01-15"
 */
export function parseUserIntent(text: string): ParsedIntent {
  const lower = text.toLowerCase().trim();
  const bbox = extractBbox(text);
  const dates = extractDates(text);

  // "show ndvi" or "ndvi" + bbox + single date -> ndvi-image
  if ((lower.includes("ndvi") || lower.includes("vegetation")) && bbox && dates.length >= 1) {
    return { action: "ndvi-image", bbox, date: dates[0] };
  }

  // "search" / "find" / "imagery" + bbox + two dates -> search
  if (
    (lower.includes("search") || lower.includes("find") || (lower.includes("show") && lower.includes("imagery"))) &&
    bbox &&
    dates.length >= 2
  ) {
    const [from, to] = dates[0] < dates[1] ? [dates[0], dates[1]] : [dates[1], dates[0]];
    return { action: "search", bbox, from, to };
  }

  // "stats" / "statistics" + bbox + date -> stats (we use bbox as polygon)
  if ((lower.includes("stats") || lower.includes("statistics")) && bbox && dates.length >= 1) {
    return { action: "stats", bbox, date: dates[0] };
  }

  // Fallback: if we have bbox and at least one date, try NDVI image
  if (bbox && dates.length >= 1 && (lower.includes("show") || lower.includes("for") || lower.includes("image"))) {
    return { action: "ndvi-image", bbox, date: dates[0] };
  }

  return null;
}

/** Convert bbox [minLon, minLat, maxLon, maxLat] to GeoJSON Polygon (WGS84). */
export function bboxToPolygon(bbox: [number, number, number, number]) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return {
    type: "Polygon" as const,
    coordinates: [[[minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]]],
  };
}
