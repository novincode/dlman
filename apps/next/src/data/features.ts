/**
 * Features data — used on home page and docs.
 */

import {
  IconBolt,
  IconRefresh,
  IconCalendarEvent,
  IconFolders,
  IconLock,
  IconPalette,
  IconTerminal2,
  IconPuzzle,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

export interface Feature {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

export const features: Feature[] = [
  {
    icon: IconBolt,
    title: "Multi-Segment Downloads",
    description:
      "Split files into up to 32 parallel segments. Downloads finish faster by utilizing your full bandwidth.",
  },
  {
    icon: IconRefresh,
    title: "Crash-Safe Resume",
    description:
      "SQLite-backed persistence means no corrupted files. Resume from exact byte positions after crashes or restarts.",
  },
  {
    icon: IconCalendarEvent,
    title: "Scheduling & Automation",
    description:
      "Schedule queues with start/stop times and active days. Run custom commands after downloads complete.",
  },
  {
    icon: IconFolders,
    title: "Queue Management",
    description:
      "Organize downloads with priority queues, categories, per-queue speed limits, and batch import.",
  },
  {
    icon: IconLock,
    title: "Site Credentials",
    description:
      "Save login credentials per domain. Auto-apply HTTP Basic Auth and cookie-based session authentication.",
  },
  {
    icon: IconPalette,
    title: "Modern Interface",
    description:
      "Clean UI with dark and light themes, real-time segment visualization, and desktop notifications.",
  },
  {
    icon: IconTerminal2,
    title: "CLI Tool",
    description:
      "Full command-line interface for automation and scripting. Same core engine as the desktop app.",
  },
  {
    icon: IconPuzzle,
    title: "Browser Extensions",
    description:
      "Capture downloads directly from Chrome, Firefox, or Edge. Right-click context menu and batch download support.",
  },
];
