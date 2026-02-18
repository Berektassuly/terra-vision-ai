"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { useChat } from "ai/react";
import { Satellite, ArrowUp, Loader2, MapPin } from "lucide-react";
import { OrbitalPattern } from "./OrbitalPattern";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { BBox } from "./MapSelector";

const MapSelector = dynamic(
  () => import("./MapSelector").then((m) => m.MapSelector),
  { ssr: false }
);

/** Friendly labels for tool calls (shown while agent is "thinking"). */
const TOOL_LABELS: Record<string, (args: Record<string, unknown>) => string> = {
  lookupLocation: (args) => `📍 Locating ${String(args?.query ?? "...")}…`,
  searchScenes: () => "🛰️ Searching satellite catalog…",
  getVegetationStats: () => "📊 Computing vegetation stats…",
  generateNDVI: () => "🖼️ Generating NDVI image…",
};

/** Derive current tool status from the last assistant message for UI indicator. */
function getActiveToolStatus(
  messages: Array<{ role: string; toolInvocations?: Array<{ toolName?: string; state?: string; args?: Record<string, unknown> }> }>
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const invs = msg.toolInvocations;
    if (!invs?.length) continue;
    const pending = invs.find(
      (inv) => inv.state === "call" || inv.state === "partial-call" || !inv.state
    );
    if (pending?.toolName && TOOL_LABELS[pending.toolName]) {
      return TOOL_LABELS[pending.toolName](pending.args ?? {});
    }
  }
  return null;
}

export function ChatArea() {
  const [isMapSelectionMode, setIsMapSelectionMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const blobUrlsRef = useRef<string[]>([]);

  const {
    messages,
    append,
    status,
    input,
    setInput,
  } = useChat({
    api: "/api/chat",
    body: {},
  });

  const isLoading = status === "streaming" || status === "submitted";
  const activeToolStatus = getActiveToolStatus(messages);

  function handleMapConfirm(bbox: BBox) {
    setInput(bbox.join(","));
    setIsMapSelectionMode(false);
  }

  function handleMapCancel() {
    setIsMapSelectionMode(false);
  }

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(URL.revokeObjectURL);
      blobUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    append({ role: "user", content: text });
  }

  return (
    <main className="relative flex-1 flex flex-col h-screen bg-background overflow-hidden">
      {isMapSelectionMode ? (
        <MapSelector onConfirm={handleMapConfirm} onCancel={handleMapCancel} />
      ) : (
        <>
          <OrbitalPattern />
          <ScrollArea className="flex-1 px-4 relative z-10">
            <div className="mx-auto max-w-[700px] py-6 space-y-6">
              {messages.length === 0 && (
                <div className="flex items-center justify-center min-h-[40vh]">
                  <div className="text-center max-w-md px-6">
                    <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-muted/20 flex items-center justify-center">
                      <Satellite size={32} className="text-foreground/60" />
                    </div>
                    <h1 className="text-2xl font-semibold text-foreground mb-3">
                      Welcome to TerraVision AI.
                    </h1>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Your professional satellite analytics platform. Ask in plain language, e.g. &quot;What’s the vegetation health in Iowa last week?&quot; or &quot;Show me NDVI for Berlin on 2024-06-01&quot;.
                    </p>
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={
                      msg.role === "user"
                        ? "rounded-2xl rounded-br-md px-4 py-2.5 bg-primary text-primary-foreground max-w-[85%]"
                        : "rounded-2xl rounded-bl-md px-4 py-2.5 bg-muted/50 border border-border max-w-[85%] space-y-2"
                    }
                  >
                    {msg.role === "user" && typeof msg.content === "string" && (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {msg.role === "assistant" && (
                      <>
                        {typeof msg.content === "string" && msg.content ? (
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        ) : null}
                        {Array.isArray(msg.toolInvocations) &&
                          msg.toolInvocations.map((inv) => {
                            const result = "result" in inv ? (inv.result as Record<string, unknown>) : undefined;
                            if (result?.imageDataUrl) {
                              const dataUrl = result.imageDataUrl as string;
                              return (
                                <div
                                  key={inv.toolCallId ?? inv.toolName}
                                  className="mt-2 rounded-lg overflow-hidden border border-border"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={dataUrl}
                                    alt="NDVI"
                                    className="max-w-full h-auto block"
                                  />
                                </div>
                              );
                            }
                            if (result && "error" in result) {
                              return (
                                <p
                                  key={inv.toolCallId ?? inv.toolName}
                                  className="text-xs text-destructive mt-1"
                                >
                                  {String(result.error)}
                                </p>
                              );
                            }
                            return null;
                          })}
                      </>
                    )}
                  </div>
                </div>
              ))}

              {(isLoading || activeToolStatus) && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-muted/50 border border-border flex items-center gap-2">
                    <Loader2
                      size={18}
                      className="animate-spin text-muted-foreground shrink-0"
                    />
                    <span className="text-sm text-muted-foreground">
                      {activeToolStatus ?? "Thinking…"}
                    </span>
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <div className="relative z-10 pb-6 px-4 shrink-0">
            <form
              onSubmit={handleSubmit}
              className="mx-auto max-w-[700px] flex items-center gap-2 bg-background/95 border border-border rounded-full px-5 py-2.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80"
            >
              <button
                type="button"
                onClick={() => setIsMapSelectionMode(true)}
                disabled={isLoading}
                className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                aria-label="Select region on map"
                title="Select region on map"
              >
                <MapPin size={18} />
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about satellite data or crop health..."
                className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading}
                className="shrink-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <ArrowUp size={18} className="text-primary-foreground" />
              </button>
            </form>
          </div>
        </>
      )}
    </main>
  );
}
