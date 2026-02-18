"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Satellite, Sprout, History, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const navItems = [
  { title: "Satellite Imagery", icon: Satellite, href: "/" },
  { title: "Crop Analysis", icon: Sprout, href: "/crop" },
  { title: "History", icon: History, href: "/history" },
  { title: "Settings", icon: Settings, href: "/settings" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(isMobile);

  return (
    <aside
      className={cn(
        "flex flex-col h-screen border-r border-border bg-secondary transition-all duration-200 shrink-0",
        collapsed ? "w-[72px]" : "w-[240px]"
      )}
    >
      {/* Toggle */}
      <div className="flex justify-end p-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-1 px-3 mt-4">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.title}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "text-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-primary" />
              )}
              <item.icon size={20} />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Brand */}
      <div className={cn("p-4 text-xs font-semibold tracking-widest text-muted-foreground", collapsed && "text-center")}>
        {collapsed ? "T" : "TerraVision"}
      </div>
    </aside>
  );
}
