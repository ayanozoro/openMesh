"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Shield,
  Zap,
  Globe,
  Lock,
  ArrowUpRight,
  Users,
  FolderOpen,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/app-store";

const features = [
  {
    icon: Shield,
    title: "Zero Cloud Storage",
    description: "Files never leave your local network. No accounts, no uploads.",
  },
  {
    icon: Lock,
    title: "End-to-End Encrypted",
    description: "AES-256-GCM encryption with SHA-256 integrity verification.",
  },
  {
    icon: Zap,
    title: "High Performance",
    description: "Stream-based transfers with configurable chunking for 100GB+ files.",
  },
  {
    icon: Globe,
    title: "Cross-Platform",
    description: "Works on Windows, macOS, Linux, and the web browser.",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function HomePage() {
  const { devices, rooms, serverStatus, settings } = useAppStore();
  const onlineDevices = devices.filter((d) => d.status === "online").length;
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-4"
      >
        <Badge variant={serverStatus === "connected" ? "success" : "destructive"}>
          {serverStatus === "connected" ? "Server Connected" : "Server Disconnected"}
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Share files locally with{" "}
          <span className="gradient-text">OpenMesh</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          A privacy-first, peer-to-peer file sharing platform. Transfer files, folders, and text
          across devices on your local network — no cloud, no accounts.
        </p>
        <div className="flex gap-3 pt-2">
          <Link href="/transfer">
            <Button size="lg">
              Start Transfer
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/devices">
            <Button variant="secondary" size="lg">
              <Users className="h-4 w-4" />
              View Devices
            </Button>
          </Link>
        </div>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Online Devices", value: onlineDevices, icon: Users },
          { label: "Active Rooms", value: rooms.filter((r) => r.isActive).length, icon: FolderOpen },
          { label: "Your Device", value: mounted ? settings.deviceName : "", icon: Shield },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.1 }}
          >
            <Card>
              <CardContent className="flex items-center gap-4 pt-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-semibold truncate max-w-[180px]">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2"
      >
        {features.map((feature) => (
          <motion.div key={feature.title} variants={item}>
            <Card glow>
              <CardHeader>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 mb-2">
                  <feature.icon className="h-5 w-5 text-accent" />
                </div>
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
