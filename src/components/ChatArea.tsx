"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { ArrowUp, MapPin, X } from "lucide-react";
import { OrbitalPattern } from "./OrbitalPattern";
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

/** Get display text from a UI message (v6 parts-based). */
function getMessageText(msg: { parts: Array<{ type: string; text?: string }> }): string {
  return (msg.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Derive current tool status from the last assistant message for UI indicator (v6 parts-based). */
function getActiveToolStatus(
  messages: Array<{ role: string; parts?: unknown[] }>
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const parts = (msg.parts ?? []) as Array<Record<string, unknown>>;
    const pending = parts.find(
      (p) =>
        (String(p.type ?? "").startsWith("tool-") || "toolName" in p) &&
        p.state !== "output-available" &&
        p.state !== "output-error" &&
        p.state !== "output-denied"
    );
    const toolName = pending
      ? ("toolName" in pending ? String(pending.toolName ?? "") : String((pending.type as string) ?? "").replace(/^tool-/, ""))
      : "";
    if (toolName && TOOL_LABELS[toolName]) {
      const args =
        pending && "input" in pending && pending.input && typeof pending.input === "object"
          ? (pending.input as Record<string, unknown>)
          : {};
      return TOOL_LABELS[toolName](args);
    }
  }
  return null;
}

export function ChatArea() {
  const [isMapSelectionMode, setIsMapSelectionMode] = useState(false);
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const blobUrlsRef = useRef<string[]>([]);

  const {
    messages,
    sendMessage,
    status,
  } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat", body: {} }),
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

  /** Auto-resize textarea to fit content, capped by max height (scrollbar appears after). */
  function adjustTextareaHeight() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    sendMessage({ text });
  }

  return (
    <main className="relative flex-1 flex flex-col h-screen bg-background overflow-hidden">
      {/* Full-screen lightbox for NDVI map */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="NDVI map full screen view"
          onClick={() => setSelectedImage(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedImage(null)}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="relative max-h-[90vh] max-w-[90vw] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedImage}
              alt="NDVI map full size"
              className="max-h-[90vh] max-w-full w-auto h-auto object-contain rounded-lg"
            />
          </div>
        </div>
      )}

      {isMapSelectionMode ? (
        <MapSelector onConfirm={handleMapConfirm} onCancel={handleMapCancel} />
      ) : (
        <>
          <OrbitalPattern />
          <ScrollArea className="flex-1 px-4 relative z-10">
            <div className="max-w-[768px] mx-auto w-full py-6 space-y-6">
              {messages.length === 0 && (
                <div className="flex items-center justify-center min-h-[40vh]">
                  <div className="text-center max-w-md px-6">
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
                <div key={msg.id} className="w-full">
                  {msg.role === "user" && (() => {
                    const text = getMessageText(msg);
                    return text ? (
                      <div className="flex justify-end w-full">
                        <div className="bg-primary text-primary-foreground rounded-2xl px-4 py-2.5 max-w-[85%]">
                          <p className="text-sm whitespace-pre-wrap">
                            {text}
                          </p>
                        </div>
                      </div>
                    ) : null;
                  })()}
                  {msg.role === "assistant" && (() => {
                    const text = getMessageText(msg);
                    return (
                      <div className="flex justify-start w-full">
                        <div className="w-full max-w-full space-y-4">
                          {text ? (
                            <p className="text-sm sm:text-base whitespace-pre-wrap text-foreground leading-relaxed">
                              {text}
                            </p>
                          ) : null}
                          {(msg.parts ?? []).map((part, idx) => {
                            const isTool = part.type?.startsWith("tool-") || "toolName" in part;
                            if (!isTool) return null;
                            const inv = part as {
                              toolCallId?: string;
                              toolName?: string;
                              state?: string;
                              output?: Record<string, unknown>;
                              errorText?: string;
                            };
                            const toolId = inv.toolCallId ?? inv.toolName ?? String(idx);
                            if (inv.state === "output-available" && inv.output) {
                              if ((inv.output as { imageDataUrl?: string }).imageDataUrl) {
                                const dataUrl = (inv.output as { imageDataUrl: string }).imageDataUrl;
                                return (
                                  <div
                                    key={toolId}
                                    className="overflow-hidden rounded-xl border border-border/50 max-w-[512px] w-fit cursor-pointer"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setSelectedImage(dataUrl)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setSelectedImage(dataUrl);
                                      }
                                    }}
                                    aria-label="View NDVI map full screen"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={dataUrl}
                                      alt="NDVI map"
                                      className="max-w-full h-auto block"
                                    />
                                  </div>
                                );
                              }
                            }
                            // Tool errors are not rendered; the LLM explains them in its text response.
                            return null;
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ))}

              {(isLoading || activeToolStatus) && (
                <div className="flex justify-start w-full">
                  <p className="text-sm text-muted-foreground">
                    {activeToolStatus ?? "Thinking…"}
                  </p>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <div className="relative z-10 pb-6 px-4 shrink-0">
            <form
              onSubmit={handleSubmit}
              className="max-w-[768px] mx-auto w-full flex items-end gap-2 bg-background/95 border border-border rounded-2xl px-4 pt-3 pb-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80"
            >
              <button
                type="button"
                onClick={() => setIsMapSelectionMode(true)}
                disabled={isLoading}
                className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 mb-0.5"
                aria-label="Select region on map"
                title="Select region on map"
              >
                <MapPin size={18} />
              </button>
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about satellite data or crop health..."
                className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none overflow-y-auto max-h-[30vh] min-h-[1.5rem] py-1.5"
                disabled={isLoading}
                style={{ height: "auto" }}
              />
              <button
                type="submit"
                disabled={isLoading}
                className="shrink-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50 mb-0.5"
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
