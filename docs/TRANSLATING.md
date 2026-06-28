# Translating DLMan

DLMan ships with a full internationalization (i18n) system. Translations live in
plain JSON files, so you don't need to be a programmer to contribute one — and
the app bundles every font it needs, so your language renders correctly offline.

Thank you for helping make DLMan usable in your language! ❤️

---

## How it works

- The desktop UI uses [i18next](https://www.i18next.com/) via `react-i18next`.
- Every catalog is a JSON file at
  `apps/desktop/src/i18n/locales/<code>/translation.json`.
- **English (`en`) is the source language.** Every other language mirrors its
  key structure; any missing key automatically falls back to English at runtime,
  so a partial translation is still useful and never breaks the UI.
- Each language declares its text direction (LTR/RTL) and a default font in
  `apps/desktop/src/i18n/config.ts`.

---

## Add a new language

You need [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) installed.

1. **Pick your BCP-47 code** — e.g. `de` (German), `zh-CN` (Simplified Chinese),
   `ar` (Arabic), `es` (Spanish).

2. **Register the locale** in `apps/desktop/src/i18n/config.ts`:

   ```ts
   { code: "zh-CN", name: "Chinese (Simplified)", nativeName: "简体中文", dir: "ltr", font: "cjk" },
   ```

   - `dir` is `"rtl"` for Arabic/Persian/Hebrew, otherwise `"ltr"`.
   - `font` is a key from `apps/desktop/src/i18n/fonts.ts` (`inter`,
     `vazirmatn`, `cjk`, or `system`). Pick the one that renders your script
     best, or add a new Fontsource font (see *Adding a font* below).

3. **Create the catalog.** Copy the English file as a starting point:

   ```bash
   cp -r apps/desktop/src/i18n/locales/en apps/desktop/src/i18n/locales/zh-CN
   ```

   Then translate the **values** (never the keys) in
   `apps/desktop/src/i18n/locales/zh-CN/translation.json`.

4. **Register the catalog** in `apps/desktop/src/i18n/index.ts`:

   ```ts
   import zhCN from "./locales/zh-CN/translation.json";
   // ...
   export const resources = {
     en: { translation: en },
     fa: { translation: fa },
     "zh-CN": { translation: zhCN },
   } as const;
   ```

5. **Keep your catalog in sync** with the keys used in the code:

   ```bash
   cd apps/desktop
   pnpm i18n:extract
   ```

   This adds any new keys (empty, ready to translate) and removes obsolete ones
   across **all** catalogs. Also add your locale to the `locales` array in
   `apps/desktop/i18next-parser.config.js`.

6. **Try it:** run the app (`pnpm tauri dev`), open **Settings ▸ Appearance**,
   and pick your language. Then open a Pull Request. 🎉

---

## Translation tips

- Translate **values only**. Keys like `"settings.language"` must stay identical
  across every language.
- Keep placeholders intact: `"{{count}}"`, `"{{name}}"` are filled in at runtime.
- Leave a value as `""` (empty) if you're unsure — English shows instead.
- Match the tone: short, clear, and consistent with how native apps speak.

## Adding a font

If your language needs a script the bundled fonts don't cover well:

1. Install a [Fontsource](https://fontsource.org/) package in `apps/desktop`,
   e.g. `pnpm add @fontsource-variable/noto-sans-arabic`.
2. `import` it and add an entry to `FONTS` in `apps/desktop/src/i18n/fonts.ts`.
3. Point your locale's `font` at the new key in `config.ts`.

Fonts are bundled at build time, so the app stays fully offline.
