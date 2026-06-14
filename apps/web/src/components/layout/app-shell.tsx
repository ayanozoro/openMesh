"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { useSocketConnection } from "@/hooks/use-socket";
import { useOpenMesh } from "@/hooks/use-openmesh";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useSocketConnection();
  useOpenMesh();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const routes: Record<string, string> = {
        "1": "/",
        "2": "/devices",
        "3": "/transfer",
        "4": "/history",
        "5": "/settings",
        "6": "/about",
      };

      if (routes[e.key]) {
        e.preventDefault();
        router.push(routes[e.key]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">{children}</main>
    </div>
  );
}
