/**
 * i18next-parser configuration — powers `pnpm i18n:extract`.
 *
 * It scans the source for `t('…')` / `<Trans>` usages and syncs every locale
 * catalog so translators always have the complete, current key set. English is
 * the source language (authored by hand); other locales receive an empty string
 * for any key they are missing, ready to be translated.
 *
 * Workflow:
 *   1. Use keys in code: `t('downloads.empty.title')`.
 *   2. Run `pnpm i18n:extract` to add the key to every catalog.
 *   3. Fill in the English value, then translate the others.
 *
 * See docs/TRANSLATING.md for the full contributor guide.
 */
export default {
  // Keep in sync with src/i18n/config.ts (LOCALES).
  locales: ["en", "fa"],
  input: ["src/**/*.{ts,tsx}"],
  output: "src/i18n/locales/$LOCALE/$NAMESPACE.json",
  defaultNamespace: "translation",
  // Nested keys ("a.b.c"); we use a single namespace, so disable ns parsing.
  keySeparator: ".",
  namespaceSeparator: false,
  sort: true,
  keepRemoved: false,
  createOldCatalogs: false,
  indentation: 2,
  // New keys land empty so missing translations are obvious (and lintable).
  defaultValue: "",
};
