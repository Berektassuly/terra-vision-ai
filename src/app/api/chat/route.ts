/**
 * TerraVision AI – Smart Agronomist Agent (Vercel AI SDK).
 * streamText + server-side tools; JSON-based stream for useChat.
 */

import { streamText, stepCountIs, tool, convertToModelMessages, type LanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { lookupLocation } from "@/lib/tools/geocoding";
import {
  searchSatelliteImages,
  getVegetationStats,
  generateNDVIImage,
  generateTrueColorImage,
  extractNDVIStatsForLLM,
} from "@/lib/services/sentinel";
import { bboxToPolygon } from "@/lib/chat-parser";

function getSystemPrompt(): string {
  const today = new Date().toISOString().split("T")[0];
  return `You are an expert agronomist assistant for TerraVision AI, a satellite analytics platform. Today is ${today}. Use this date to resolve relative dates like "last week", "planting season 2023", or "yesterday" into specific ISO-8601 date ranges (YYYY-MM-DD).

You are interacting with strict, production-grade tools. You MUST:
- Call tools with EXACT parameter names and types as defined in their schemas. Never invent, rename, or pluralize parameters (e.g. always use "from" and "to" inside "dateRange", never "from1" or other variations).
- Only use dates in ISO format YYYY-MM-DD.

CRITICAL: Satellites do not fly every day. NEVER guess a date for getVegetationStats or generateNDVI. You MUST ALWAYS call searchScenes first with a broad dateRange (for example, the last 30 days) to find a valid image. Extract the EXACT timestamp (YYYY-MM-DD) from the searchScenes result and use ONLY that date for subsequent getVegetationStats or generateNDVI tool calls. If searchScenes finds no image, explain this to the user and DO NOT call getVegetationStats or generateNDVI.

When the user mentions a place name (e.g. "Iowa", "Berlin"), use the lookupLocation tool first to get coordinates (bbox). Then always use searchScenes to check image availability, and only then call getVegetationStats or generateNDVI as needed.

If the user asks to see a real photo, normal image, or true color view of the field, use the generateTrueColor tool (after resolving location and checking searchScenes for a valid date).

Do not dump raw JSON stats. Interpret results for the user: e.g. "NDVI is 0.2, indicating potential drought stress" or "Mean NDVI 0.65 suggests healthy vegetation." Be concise and actionable.`;
}

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages: rawMessages } = await req.json();
  const messages = await convertToModelMessages(rawMessages);

  const activeProvider = process.env.ACTIVE_AI_PROVIDER?.toLowerCase();
  const model =
    (activeProvider === "gemini"
      ? google("gemini-3-flash-preview")
      : openai("gpt-4o")) as LanguageModel;

  const result = streamText({
    model,
    system: getSystemPrompt(),
    messages,
    stopWhen: stepCountIs(5),
    tools: {
      lookupLocation: tool({
        description:
          "Look up a place by name (e.g. city, region, country) to get its bounding box. Use when the user mentions a location without coordinates.",
        inputSchema: z.object({
          query: z.string().describe("Place name or address to geocode (e.g. Iowa, Berlin, Nebraska)"),
        }),
        execute: async ({ query }) => {
          try {
            const loc = await lookupLocation(query);
            if (!loc) return { error: "Location not found. Please try another name or add more detail." };
            return {
              displayName: loc.displayName,
              bbox: loc.bbox,
              placeId: loc.placeId,
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Geocoding failed.";
            return { error: msg };
          }
        },
      }),
      searchScenes: tool({
        description:
          "Search the satellite catalog for Sentinel-2 L2A imagery in a bounding box and date range. Use to verify image availability before generating stats or NDVI.",
        inputSchema: z.object({
          bbox: z
            .array(z.number())
            .length(4)
            .describe("Bounding box [minLon, minLat, maxLon, maxLat] in WGS84"),
          dateRange: z.object({
            from: z.string().describe("Start date YYYY-MM-DD"),
            to: z.string().describe("End date YYYY-MM-DD"),
          }),
        }),
        execute: async ({ bbox, dateRange }) => {
          try {
            const scene = await searchSatelliteImages(
              bbox as [number, number, number, number],
              { from: dateRange.from, to: dateRange.to }
            );
            if (!scene)
              return {
                found: false,
                message: "No suitable image found for this area and date range (e.g. cloud cover too high).",
              };
            return {
              found: true,
              id: scene.id,
              timestamp: scene.timestamp,
              cloudCover: scene.cloudCover,
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Catalog search failed.";
            return { error: msg };
          }
        },
      }),
      getVegetationStats: tool({
        description:
          "Get NDVI statistics (mean, min, max, stDev) for a bounding box on a given date. Use after resolving location and optionally checking searchScenes.",
        inputSchema: z.object({
          bbox: z
            .array(z.number())
            .length(4)
            .describe("Bounding box [minLon, minLat, maxLon, maxLat]"),
          date: z.string().describe("Date YYYY-MM-DD"),
        }),
        execute: async ({ bbox, date }) => {
          try {
            const polygon = bboxToPolygon(bbox as [number, number, number, number]);
            const response = await getVegetationStats(polygon, date);
            const stats = extractNDVIStatsForLLM(response);
            if (!stats)
              return { error: "No NDVI statistics returned for this area/date." };
            return {
              mean: stats.mean,
              min: stats.min,
              max: stats.max,
              stDev: stats.stDev,
              sampleCount: stats.sampleCount,
              noDataCount: stats.noDataCount,
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Statistics request failed.";
            return { error: msg };
          }
        },
      }),
      generateNDVI: tool({
        description:
          "Generate an NDVI health map image (PNG) for a bounding box on a given date. Red = low vegetation, green = high. Use when the user wants to see a map.",
        inputSchema: z.object({
          bbox: z
            .array(z.number())
            .length(4)
            .describe("Bounding box [minLon, minLat, maxLon, maxLat]"),
          date: z.string().describe("Date YYYY-MM-DD"),
        }),
        execute: async ({ bbox, date }) => {
          try {
            const width = 512;
            const height = 512;
            const buffer = await generateNDVIImage(
              bbox as [number, number, number, number],
              date,
              width,
              height
            );
            const base64 = Buffer.from(buffer).toString("base64");
            return {
              success: true,
              imageDataUrl: `data:image/png;base64,${base64}`,
              message: "NDVI image generated. Describe it to the user or suggest they view it.",
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : "NDVI image generation failed.";
            return { error: msg };
          }
        },
      }),
      generateTrueColor: tool({
        description:
          "Generate a true color (RGB) satellite photo for a bounding box on a given date. Use when the user asks for a real photo, normal view, or true color image.",
        inputSchema: z.object({
          bbox: z
            .array(z.number())
            .length(4)
            .describe("Bounding box [minLon, minLat, maxLon, maxLat]"),
          date: z.string().describe("Date YYYY-MM-DD"),
        }),
        execute: async ({ bbox, date }) => {
          try {
            const width = 512;
            const height = 512;
            const buffer = await generateTrueColorImage(
              bbox as [number, number, number, number],
              date,
              width,
              height
            );
            const base64 = Buffer.from(buffer).toString("base64");
            return {
              success: true,
              imageDataUrl: `data:image/png;base64,${base64}`,
              message: "True color image generated.",
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : "True color image generation failed.";
            return { error: msg };
          }
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
