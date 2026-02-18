/**
 * Sample Next.js App Router API route – TerraVision AI Satellite / Sentinel Hub.
 * Demonstrates calling the sentinel service from the frontend.
 *
 * Requires Next.js (e.g. npm install next). Set SENTINEL_CLIENT_ID and
 * SENTINEL_CLIENT_SECRET in .env.local.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  searchSatelliteImages,
  generateNDVIImage,
  getVegetationStats,
  extractNDVIStatsForLLM,
  type BBox,
  type GeoJsonPolygon,
} from "@/lib/services/sentinel";

/** GET /api/satellite?action=search&bbox=minLon,minLat,maxLon,maxLat&from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    if (action === "search") {
      const bboxStr = searchParams.get("bbox");
      const from = searchParams.get("from");
      const to = searchParams.get("to");
      if (!bboxStr || !from || !to) {
        return NextResponse.json(
          { error: "Missing bbox, from, or to for search" },
          { status: 400 }
        );
      }
      const bbox = bboxStr.split(",").map(Number) as BBox;
      if (bbox.length !== 4 || bbox.some(Number.isNaN)) {
        return NextResponse.json({ error: "Invalid bbox (minLon,minLat,maxLon,maxLat)" }, { status: 400 });
      }
      const result = await searchSatelliteImages(bbox, { from, to });
      return NextResponse.json(result ?? { message: "No suitable image found" });
    }

    if (action === "ndvi-image") {
      const bboxStr = searchParams.get("bbox");
      const date = searchParams.get("date");
      const width = Math.min(1024, Math.max(64, parseInt(searchParams.get("width") ?? "512", 10) || 512));
      const height = Math.min(1024, Math.max(64, parseInt(searchParams.get("height") ?? "512", 10) || 512));
      if (!bboxStr || !date) {
        return NextResponse.json(
          { error: "Missing bbox or date for ndvi-image" },
          { status: 400 }
        );
      }
      const bbox = bboxStr.split(",").map(Number) as BBox;
      if (bbox.length !== 4 || bbox.some(Number.isNaN)) {
        return NextResponse.json({ error: "Invalid bbox" }, { status: 400 });
      }
      const buffer = await generateNDVIImage(bbox, date, width, height);
      return new NextResponse(buffer, {
        headers: { "Content-Type": "image/png" },
      });
    }

    if (action === "stats") {
      const geometryStr = searchParams.get("geometry");
      const date = searchParams.get("date");
      if (!geometryStr || !date) {
        return NextResponse.json(
          { error: "Missing geometry (JSON) or date for stats" },
          { status: 400 }
        );
      }
      let geometry: GeoJsonPolygon;
      try {
        geometry = JSON.parse(geometryStr) as GeoJsonPolygon;
      } catch {
        return NextResponse.json({ error: "Invalid geometry JSON" }, { status: 400 });
      }
      if (geometry?.type !== "Polygon" || !Array.isArray(geometry?.coordinates)) {
        return NextResponse.json({ error: "geometry must be a GeoJSON Polygon" }, { status: 400 });
      }
      const response = await getVegetationStats(geometry, date);
      const stats = extractNDVIStatsForLLM(response);
      return NextResponse.json({
        raw: response,
        ndviStats: stats,
        forLLM: stats
          ? `Mean NDVI: ${stats.mean.toFixed(3)}, Min: ${stats.min.toFixed(3)}, Max: ${stats.max.toFixed(3)}, StdDev: ${stats.stDev.toFixed(3)}. ${stats.mean < 0.3 ? "Low vegetation index may indicate stress or drought." : stats.mean > 0.6 ? "Healthy vegetation." : "Moderate vegetation cover."}`
          : null,
      });
    }

    return NextResponse.json(
      {
        usage: {
          search: "GET ?action=search&bbox=minLon,minLat,maxLon,maxLat&from=YYYY-MM-DD&to=YYYY-MM-DD",
          ndviImage: "GET ?action=ndvi-image&bbox=...&date=YYYY-MM-DD&width=512&height=512",
          stats: "GET ?action=stats&geometry=<GeoJSON Polygon string>&date=YYYY-MM-DD",
        },
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
