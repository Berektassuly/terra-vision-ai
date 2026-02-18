"use client";

import { useState, useRef, useEffect } from "react";
import { Satellite, ArrowUp, Loader2 } from "lucide-react";
import { OrbitalPattern } from "./OrbitalPattern";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parseUserIntent, bboxToPolygon } from "@/lib/chat-parser";

type MessageRole = "user" | "assistant";

type MessageContent =
  | { type: "text"; text: string }
  | { type: "stats"; data: Record<string, unknown> }
  | { type: "ndvi-image"; blobUrl: string };

interface Message {
  id: string;
  role: MessageRole;
  content: MessageContent[];
}

function buildSearchParams(intent: NonNullable<ReturnType<typeof parseUserIntent>>): string {
  const params = new URLSearchParams();
  if (intent.action === "search") {
    params.set("action", "search");
    params.set("bbox", intent.bbox.join(","));
    params.set("from", intent.from);
    params.set("to", intent.to);
  } else if (intent.action === "ndvi-image") {
    params.set("action", "ndvi-image");
    params.set("bbox", intent.bbox.join(","));
    params.set("date", intent.date);
    params.set("width", "512");
    params.set("height", "512");
  } else {
    params.set("action", "stats");
    params.set("geometry", JSON.stringify(bboxToPolygon(intent.bbox)));
    params.set("date", intent.date);
  }
  return params.toString();
}

export function ChatArea() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(URL.revokeObjectURL);
      blobUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: [{ type: "text", text }],
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const intent = parseUserIntent(text);
    const assistantContent: MessageContent[] = [];

    if (intent) {
      const query = buildSearchParams(intent);
      const url = `/api/satellite?${query}`;

      try {
        if (intent.action === "ndvi-image") {
          const res = await fetch(url);
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            assistantContent.push({ type: "text", text: `Error: ${(err as { error?: string }).error ?? res.statusText}` });
          } else {
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            blobUrlsRef.current.push(blobUrl);
            assistantContent.push({ type: "ndvi-image", blobUrl });
            assistantContent.push({ type: "text", text: `NDVI image for bbox ${intent.bbox.join(", ")} on ${intent.date}.` });
          }
        } else {
          const res = await fetch(url);
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            assistantContent.push({ type: "text", text: `Error: ${(data as { error?: string }).error ?? res.statusText}` });
          } else if (intent.action === "stats" && (data.ndviStats ?? data.raw)) {
            assistantContent.push({ type: "stats", data: data.ndviStats ? { ndviStats: data.ndviStats, forLLM: data.forLLM } : data });
            if (data.forLLM) assistantContent.push({ type: "text", text: data.forLLM });
          } else if (intent.action === "search" && (data.id ?? data.message)) {
            assistantContent.push({ type: "stats", data });
            assistantContent.push({
              type: "text",
              text: data.id
                ? `Found scene: ${data.id} at ${data.timestamp ?? "N/A"}${data.cloudCover != null ? ` (cloud cover: ${data.cloudCover}%)` : ""}.`
                : (data.message as string),
            });
          } else {
            assistantContent.push({ type: "stats", data });
          }
        }
      } catch (err) {
        assistantContent.push({
          type: "text",
          text: err instanceof Error ? err.message : "Request failed.",
        });
      }
    } else {
      assistantContent.push({
        type: "text",
        text: "I didn’t recognize a satellite request. Try: “Show NDVI for 13.4,52.5,13.5,52.6 from 2024-06-01” or “Search 13.4,52.5,13.5,52.6 from 2024-01-01 to 2024-01-15”.",
      });
    }

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: assistantContent.length ? assistantContent : [{ type: "text", text: "No result." }],
      },
    ]);
    setIsLoading(false);
  }

  return (
    <main className="relative flex-1 flex flex-col h-screen bg-background overflow-hidden">
      <OrbitalPattern />

      <ScrollArea className="flex-1 px-4">
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
                  Your professional satellite analytics platform. Try: &quot;Show NDVI for 13.4,52.5,13.5,52.6 from 2024-06-01&quot; or &quot;Search 13.4,52.5,13.5,52.6 from 2024-01-01 to 2024-01-15&quot;.
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
                {msg.content.map((c, i) => {
                  if (c.type === "text") {
                    return <p key={i} className="text-sm whitespace-pre-wrap">{c.text}</p>;
                  }
                  if (c.type === "stats") {
                    return (
                      <Card key={i} className="bg-card text-card-foreground border-border mt-2">
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm">Result</CardTitle>
                        </CardHeader>
                        <CardContent className="py-0 pb-3 text-xs font-mono overflow-x-auto">
                          <pre>{JSON.stringify(c.data, null, 2)}</pre>
                        </CardContent>
                      </Card>
                    );
                  }
                  if (c.type === "ndvi-image") {
                    return (
                      <div key={i} className="mt-2 rounded-lg overflow-hidden border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.blobUrl} alt="NDVI" className="max-w-full h-auto block" />
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-muted/50 border border-border flex items-center gap-2">
                <Loader2 size={18} className="animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Calling satellite API…</span>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="relative z-10 pb-6 px-4 shrink-0">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-[700px] flex items-center gap-2 bg-background border border-border rounded-full px-5 py-2.5 shadow-lg"
        >
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
    </main>
  );
}
