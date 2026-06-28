import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LOCALE } from "./config";
import { applyLocale, bootLanguage, bootFont } from "./apply";
import en from "./locales/en/translation.json";
import fa from "./locales/fa/translation.json";

/**
 * Bundled translation catalogs. To add a language, drop a
 * `locales/<code>/translation.json` next to these and register it here, then
 * add the locale to `config.ts`. See `docs/TRANSLATING.md`.
 */
export const resources = {
  en: { translation: en },
  fa: { translation: fa },
} as const;

const bootLng = bootLanguage();

i18n.use(initReactI18next).init({
  resources,
  lng: bootLng,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
});

// Paint the right direction + font before React renders.
applyLocale(bootLng, bootFont());

export { applyLocale };
export default i18n;
