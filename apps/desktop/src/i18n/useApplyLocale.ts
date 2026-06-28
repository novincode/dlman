import { useEffect } from "react";
import i18n, { applyLocale } from "@/i18n";
import { useSettingsStore } from "@/stores/settings";

/**
 * Keeps i18next and the document (lang / dir / --font-sans) in sync with the
 * persisted settings. SQLite is the source of truth: the boot mirror in
 * localStorage paints the first frame, then this hook reconciles once settings
 * load and on every later language/font change.
 */
export function useApplyLocale(): void {
  const language = useSettingsStore((s) => s.settings.language);
  const font = useSettingsStore((s) => s.settings.font);
  const loaded = useSettingsStore((s) => s.loaded);

  useEffect(() => {
    if (!loaded) return;
    const lng = language || "en";
    if (i18n.language !== lng) {
      void i18n.changeLanguage(lng);
    }
    applyLocale(lng, font ?? null);
  }, [loaded, language, font]);
}
