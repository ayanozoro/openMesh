"use client";

import { motion } from "framer-motion";
import { Github, Heart, Shield, Code, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { APP_VERSION } from "@openmesh/shared";

const techStack = [
  "Next.js",
  "React",
  "TypeScript",
  "Tailwind CSS",
  "Express",
  "Socket.IO",
  "WebRTC",
  "MongoDB",
  "Zustand",
  "Framer Motion",
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">About OpenMesh</h1>
          <Badge variant="outline">v{APP_VERSION}</Badge>
        </div>
        <p className="text-muted-foreground">
          Privacy-first, peer-to-peer local file sharing platform
        </p>
      </motion.div>

      <Card glow>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Our Mission
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-muted-foreground">
          <p>
            OpenMesh enables secure, direct file sharing across devices on your local network
            without uploading data to any cloud server. No accounts, no tracking, no limits.
          </p>
          <p>
            Built with clean architecture and open-source principles, OpenMesh is designed for
            individuals, teams, and organizations who value privacy and control over their data.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Technology Stack
          </CardTitle>
          <CardDescription>Built with modern, battle-tested technologies</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {techStack.map((tech) => (
              <Badge key={tech} variant="outline">
                {tech}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Development Roadmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { phase: "Phase 1", label: "Monorepo, UI, Signaling", status: "done" },
              { phase: "Phase 2", label: "Device Discovery, Rooms", status: "next" },
              { phase: "Phase 3", label: "WebRTC, Text Transfer", status: "planned" },
              { phase: "Phase 4", label: "File Transfer Engine", status: "planned" },
              { phase: "Phase 5", label: "Chunking, Resume", status: "planned" },
              { phase: "Phase 6", label: "Encryption, SDK", status: "planned" },
              { phase: "Phase 7", label: "Docs, Tests, Release", status: "planned" },
            ].map((item) => (
              <div
                key={item.phase}
                className="flex items-center justify-between rounded-lg border border-glass-border bg-white/5 px-4 py-3"
              >
                <div>
                  <span className="text-xs font-mono text-muted-foreground">{item.phase}</span>
                  <p className="text-sm font-medium">{item.label}</p>
                </div>
                <Badge
                  variant={
                    item.status === "done"
                      ? "success"
                      : item.status === "next"
                        ? "default"
                        : "outline"
                  }
                >
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <a
          href="https://github.com/openmesh/openmesh"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium glass hover:bg-white/10 text-foreground h-10 px-4 py-2"
        >
          <Github className="h-4 w-4" />
          View on GitHub
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <p className="flex items-center gap-1 text-center text-xs text-muted-foreground justify-center pb-8">
        Made with <Heart className="h-3 w-3 text-destructive" /> by the OpenMesh community
      </p>
    </div>
  );
}
