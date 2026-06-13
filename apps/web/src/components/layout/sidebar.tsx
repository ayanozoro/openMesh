"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Home,
  Monitor,
  FolderOpen,
  ArrowLeftRight,
  History,
  Settings,
  Info,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

const navItems = [
  { href: "/", label: "Home", icon: Home, shortcut: "1" },
  { href: "/devices", label: "Devices", icon: Monitor, shortcut: "2" },
  { href: "/rooms", label: "Rooms", icon: FolderOpen, shortcut: "3" },
  { href: "/transfer", label: "Transfer", icon: ArrowLeftRight, shortcut: "4" },
  { href: "/history", label: "History", icon: History, shortcut: "5" },
  { href: "/settings", label: "Settings", icon: Settings, shortcut: "6" },
  { href: "/about", label: "About", icon: Info, shortcut: "7" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { serverStatus, settings } = useAppStore();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-glass-border bg-sidebar backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 border-b border-glass-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20">
          <ArrowLeftRight className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold gradient-text">OpenMesh</h1>
          <p className="text-xs text-muted-foreground">Local File Sharing</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-4" aria-label="Main navigation">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-primary/10 border border-primary/20"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
              <Icon className="relative h-4 w-4" />
              <span className="relative flex-1">{item.label}</span>
              <kbd className="relative hidden rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
                {item.shortcut}
              </kbd>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-glass-border p-4">
        <div className="glass-card rounded-lg p-3">
          <div className="flex items-center gap-2">
            {serverStatus === "connected" ? (
              <Wifi className="h-4 w-4 text-success" />
            ) : (
              <WifiOff className="h-4 w-4 text-destructive" />
            )}
            <span className="text-xs font-medium capitalize">{serverStatus}</span>
          </div>
          <p className="mt-1 truncate text-[10px] text-muted-foreground">{settings.deviceName}</p>
        </div>
      </div>
    </aside>
  );
}
