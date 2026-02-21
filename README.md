# TerraVision AI

**Conversational Earth Observation for Smart Agronomy**

> TerraVision AI is an enterprise-grade, AI-native satellite analytics platform that democratizes access to complex Sentinel-2 Earth Observation data through a conversational interface. Agronomists, farm managers, and analysts can ask domain-specific questions in natural language and receive interpretable insights, NDVI maps, and statistics tailored to crop health monitoring and field diagnostics.

Developed by the **One Day Team** for the **AEROO SPACE AI COMPETITION**, TerraVision AI combines Next.js, OpenAI GPT-4o, and the Sentinel Hub APIs into a cohesive "Smart Agronomist" agent capable of autonomously geocoding regions, validating satellite coverage, computing vegetation indices, and generating visual analysis products.

**Badges**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![OpenAI GPT-4o](https://img.shields.io/badge/OpenAI-GPT--4o-412991?logo=openai)](https://platform.openai.com/)
[![Vercel AI SDK](https://img.shields.io/badge/Vercel%20AI%20SDK-Agentic%20Chat-black?logo=vercel)](https://sdk.vercel.ai/)
[![Sentinel Hub](https://img.shields.io/badge/Sentinel%20Hub-EO%20APIs-00A651)](https://www.sentinel-hub.com/)
[![License](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)

---

## 1. System Architecture & Tech Stack

TerraVision AI is organized into clear layers: presentation, AI orchestration, and Earth Observation data access.

### 1.1 Layered Overview

| Layer | Technologies |
|-------|---------------|
| **Frontend** | Next.js 16 (App Router), React 18, Tailwind CSS, shadcn/ui, Leaflet (MapSelector) |
| **AI / LLM** | Vercel AI SDK v6 (`ai`, `@ai-sdk/react`), OpenAI GPT-4o (`@ai-sdk/openai`), agentic workflow with tool calling |
| **Earth Observation** | Sentinel Hub (EU-Central-1): Catalog API, Process API, Statistical API; OpenStreetMap Nominatim (geocoding) |

- **Presentation (Frontend)**  
  Next.js 16 with the App Router powers the application; React components provide the chat and map experience. Tailwind CSS and shadcn/ui handle styling and accessible UI primitives. Leaflet is used inside `MapSelector` for interactive bounding-box selection of Areas of Interest (AOIs).

- **AI / LLM Orchestration**  
  The Smart Agronomist runs in `src/app/api/chat/route.ts` using the Vercel AI SDK `streamText` API and OpenAI's GPT-4o. The agent uses structured tools: `lookupLocation`, `searchScenes`, `getVegetationStats`, and `generateNDVI`, invoked autonomously in multi-step turns (`maxSteps: 5`).

- **Earth Observation Data**  
  `src/lib/services/sentinel.ts` implements the Sentinel Hub integration (OAuth2 client credentials, Catalog search, Process evalscripts for NDVI imagery, Statistical API for NDVI stats). Geocoding is provided by `@/lib/tools/geocoding` (Nominatim). Bounding boxes are converted to GeoJSON polygons via `@/lib/chat-parser` for the Statistical API.

---

## 2. Core Features & Capabilities

Features are implemented as **function-calling tools** exposed to the LLM in `src/app/api/chat/route.ts` and consumed by the chat UI in `src/components/ChatArea.tsx`.

### 2.1 Autonomous Agent Tools

- **Geocoding (`lookupLocation`)**  
  Resolves place names (e.g. "Iowa", "Berlin", "Nebraska") to a bounding box using OpenStreetMap Nominatim. Used first when the user mentions a location without coordinates.

- **Catalog validation (`searchScenes`)**  
  Queries the Sentinel Hub Catalog API for Sentinel-2 L2A imagery in a given bounding box and date range (cloud cover &lt; 10%). Returns scene id, timestamp, and cloud cover so the agent can confirm data availability before running stats or image generation.

- **Statistical analysis (`getVegetationStats`)**  
  Calls the Sentinel Hub Statistical API to compute NDVI statistics (mean, min, max, standard deviation, sample counts) over a GeoJSON polygon for a single date. Results are normalized via `extractNDVIStatsForLLM` in `sentinel.ts` and interpreted by the LLM for the user (e.g. drought stress, healthy vegetation).

- **Visual generation (`generateNDVI`)**  
  Uses the Sentinel Hub Process API and an NDVI evalscript to produce a PNG health map (red = low vegetation, green = high) for a bounding box and date. The route returns a base64 data URL; `ChatArea` renders it inline in the conversation.

### 2.2 Interactive Map Selection

The **MapSelector** component (Leaflet-based, loaded dynamically with `ssr: false`) allows users to draw or confirm a bounding box on a map. On confirm, the selected bbox is injected into the chat input (e.g. as a comma-separated list). The user can then ask the agent to analyze that region, combining natural language with precise AOI selection.

---

## 3. Installation & Deployment

### 3.1 Clone and Install

```bash
git clone https://github.com/<your-org>/terra-vision-ai.git
cd terra-vision-ai
npm install
```

Replace `<your-org>` with your GitHub organization or username.

### 3.2 Environment Variables

Copy the example env file and set the required secrets:

```bash
cp .env.example .env.local
```

Edit `.env.local` and configure:

| Variable | Description | Where to obtain |
|----------|-------------|-----------------|
| `OPENAI_API_KEY` | Required for the Smart Agronomist chat agent. | [OpenAI API keys](https://platform.openai.com/api-keys) |
| `SENTINEL_CLIENT_ID` | Sentinel Hub OAuth client ID (EU-Central-1). | [Sentinel Hub dashboard](https://apps.sentinel-hub.com/dashboard/#/account/settings) |
| `SENTINEL_CLIENT_SECRET` | Sentinel Hub OAuth client secret. | Same as above; create an OAuth client and copy credentials. |

The Sentinel service (`lib/services/sentinel.ts`) uses these for Catalog, Process, and Statistical API calls. Missing credentials will result in a clear runtime error.

### 3.3 Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the TerraVision AI chat interface and map selector.

---

## 4. Usage Examples

Example prompts that trigger the agent's tools and produce interpretable outputs:

1. **"Analyze the vegetation health in Iowa for the last week."**  
   The agent will geocode Iowa, search for recent low-cloud Sentinel-2 scenes, run NDVI statistics, and summarize results in plain language (e.g. mean NDVI, stress indicators).

2. **"Show me the NDVI map for Berlin on 2024-06-01."**  
   The agent will resolve Berlin, validate imagery, and generate an NDVI PNG for that date; the image appears inline in the chat.

3. **"What's the mean NDVI for this area?"** (after selecting a region via the map)  
   With the bbox already in the input or context, the agent can call `getVegetationStats` (and optionally `searchScenes`) for the selected AOI and date, then report the statistics and a short interpretation.

---

## 5. Project Structure

Relevant directories and files:

```text
src/
  app/
    api/
      chat/
        route.ts         # Smart Agronomist: streamText + tools (lookupLocation, searchScenes, getVegetationStats, generateNDVI)
  components/
    ChatArea.tsx        # useChat UI, tool-status labels, NDVI image and error rendering, MapSelector toggle
    MapSelector.tsx     # Leaflet map and bbox selection; onConfirm passes bbox into chat input
  lib/
    services/
      sentinel.ts       # Sentinel Hub: auth, Catalog, Process (NDVI image), Statistical (NDVI stats), extractNDVIStatsForLLM
    tools/
      geocoding.ts      # lookupLocation (Nominatim)
    chat-parser.ts      # bboxToPolygon for Statistical API
```

---

## 6. Roadmap

- **Current**  
  Core conversational AI and Sentinel Hub integrations (Catalog, Process, Statistical APIs) are implemented. The Smart Agronomist agent and MapSelector-driven AOI selection are functional for NDVI-centric analysis and visualization.

- **Planned**  
  Modules such as **Crop Analysis** (`/crop`), **History** (`/history`), and **Settings** are slated for future development phases to extend TerraVision AI into a full decision-support and audit platform for precision agriculture.

---

## 7. Team

**One Day Team**  
**Captain:** Berektassuly Mukhammedali  

Developed for the **AEROO SPACE AI COMPETITION**.
