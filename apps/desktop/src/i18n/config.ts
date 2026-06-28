/**
 * Locale registry — the single source of truth for which languages the app
 * supports. Adding a language is a two-step change:
 *   1. Add an entry here (code, names, text direction, default font key).
 *   2. Add `locales/<code>/translation.json` and register it in `index.ts`.
 *
 * See `docs/TRANSLATING.md` for the contributor workflow.
 */

export type TextDirection = "ltr" | "rtl";

export interface LocaleMeta {
  /** BCP-47 code, e.g. "en", "fa", "zh-CN". */
  code: string;
  /** English name, for documentation and search. */
  name: string;
  /** Endonym — the language's own name, shown in the language picker. */
  nativeName: string;
  /** Layout direction. */
  dir: TextDirection;
  /** Default font key (see `fonts.ts`). Used unless the user overrides it. */
  font: string;
}

export const LOCALES: LocaleMeta[] = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr", font: "inter" },
  { code: "fa", name: "Persian", nativeName: "فارسی", dir: "rtl", font: "vazirmatn" },
];

export const DEFAULT_LOCALE = "en";

const LOCALE_MAP: Record<string, LocaleMeta> = Object.fromEntries(
  LOCALES.map((l) => [l.code, l]),
);

/** Resolve a locale by code, falling back to the default. Accepts region
 *  variants by trimming to the base language (e.g. "fa-IR" → "fa"). */
export function getLocale(code: string | null | undefined): LocaleMeta {
  if (!code) return LOCALE_MAP[DEFAULT_LOCALE];
  return LOCALE_MAP[code] ?? LOCALE_MAP[code.split("-")[0]] ?? LOCALE_MAP[DEFAULT_LOCALE];
}
