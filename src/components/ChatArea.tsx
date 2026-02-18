import { Satellite, ArrowUp } from "lucide-react";
import { OrbitalPattern } from "./OrbitalPattern";

export function ChatArea() {
  return (
    <main className="relative flex-1 flex flex-col h-screen bg-background overflow-hidden">
      <OrbitalPattern />

      {/* Empty state */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-muted/20 flex items-center justify-center">
            <Satellite size={32} className="text-foreground/60" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground mb-3">
            Welcome to TerraVision AI.
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your professional satellite analytics platform. Ask anything about satellite data or crop health.
          </p>
        </div>
      </div>

      {/* Floating input */}
      <div className="relative z-10 pb-6 px-4">
        <div className="mx-auto max-w-[700px] flex items-center gap-2 bg-background border border-border rounded-full px-5 py-2.5 shadow-lg">
          <input
            type="text"
            placeholder="Ask TerraVision about satellite data or crop health..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button className="shrink-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors">
            <ArrowUp size={18} className="text-primary-foreground" />
          </button>
        </div>
      </div>
    </main>
  );
}
