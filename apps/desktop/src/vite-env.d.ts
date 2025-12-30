/// <reference types="vite/client" />

// Tauri global types
declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export {};
