/**
 * Font registry. Fonts are bundled via Fontsource (self-hosted, fully offline —
 * no network calls, no Google CDN), so the app renders correctly on first run
 * and with no internet. Heavy CJK fonts are mapped to system stacks instead of
 * being bundled, to keep the app small.
 *
 * Each locale declares a default font key (see `config.ts`). The user can
 * override the app font in Settings; when no override is set, the font follows
 * the active language.
 */

// Side-effect imports — Vite bundles these @font-face declarations + woff2 files.
import "@fontsource-variable/inter";
import "@fontsource-variable/vazirmatn";

export interface FontMeta {
  /** Stable key stored in settings. */
  key: string;
  /** Human label shown in the Settings font picker. */
  label: string;
  /** CSS `font-family` value (always ends with a generic fallback). */
  stack: string;
}

export const FONTS: FontMeta[] = [
  {
    key: "inter",
    label: "Inter",
    stack: '"Inter Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  {
    key: "vazirmatn",
    label: "Vazirmatn",
    stack: '"Vazirmatn Variable", "Inter Variable", system-ui, sans-serif',
  },
  {
    // System CJK stack — avoids bundling multi-MB Chinese/Japanese/Korean fonts.
    key: "cjk",
    label: "Noto Sans CJK (system)",
    stack: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Source Han Sans", sans-serif',
  },
  {
    key: "system",
    label: "System default",
    stack: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  },
];

const FONT_MAP: Record<string, FontMeta> = Object.fromEntries(
  FONTS.map((f) => [f.key, f]),
);

export const DEFAULT_FONT_KEY = "inter";

/** Resolve a font key to its CSS `font-family` stack, with a safe fallback. */
export function fontStack(key: string | null | undefined): string {
  return (key && FONT_MAP[key]?.stack) || FONT_MAP[DEFAULT_FONT_KEY].stack;
}
