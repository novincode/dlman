import { getLocale, DEFAULT_LOCALE } from "./config";
import { fontStack } from "./fonts";

const LANG_KEY = "dlman:lang";
const FONT_KEY = "dlman:font";

/**
 * Read the persisted language synchronously so the very first paint already
 * uses the right language/direction/font. SQLite is the source of truth, but
 * it loads asynchronously; this localStorage mirror avoids a flash of English.
 */
export function bootLanguage(): string {
  try {
    return localStorage.getItem(LANG_KEY) || DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Read the persisted font override (null = follow the language default). */
export function bootFont(): string | null {
  try {
    return localStorage.getItem(FONT_KEY);
  } catch {
    return null;
  }
}

/**
 * Apply a locale (+ optional font override) to the document: sets `<html lang>`,
 * `<html dir>`, and the `--font-sans` CSS variable that drives the whole UI.
 * Also mirrors the choice to localStorage for a flash-free next launch.
 *
 * @param code         BCP-47 language code.
 * @param fontOverride Explicit font key, or null/undefined to follow the
 *                     language's default font.
 */
export function applyLocale(code: string, fontOverride?: string | null): void {
  const locale = getLocale(code);
  const root = document.documentElement;
  root.lang = locale.code;
  root.dir = locale.dir;
  root.style.setProperty("--font-sans", fontStack(fontOverride || locale.font));

  try {
    localStorage.setItem(LANG_KEY, locale.code);
    if (fontOverride) localStorage.setItem(FONT_KEY, fontOverride);
    else localStorage.removeItem(FONT_KEY);
  } catch {
    /* localStorage unavailable — ignore, SQLite remains source of truth */
  }
}
