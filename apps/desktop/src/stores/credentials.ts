import { create } from "zustand";
import type { SiteCredential, CredentialRequest } from "@/types";

interface CredentialsState {
  // All saved credentials
  credentials: SiteCredential[];
  // Whether credentials have been loaded from backend
  loaded: boolean;
  // Pending credential request (from 401/403 response)
  pendingRequest: CredentialRequest | null;

  // Actions
  loadFromBackend: () => Promise<void>;
  addCredential: (credential: SiteCredential) => Promise<SiteCredential>;
  updateCredential: (credential: SiteCredential) => Promise<SiteCredential>;
  deleteCredential: (id: string) => Promise<void>;
  // Handle credential request from download engine
  setPendingRequest: (request: CredentialRequest | null) => void;
}

export const useCredentialsStore = create<CredentialsState>()(
  (set) => ({
    credentials: [],
    loaded: false,
    pendingRequest: null,

    loadFromBackend: async () => {
      const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
      if (!isTauri) {
        set({ loaded: true });
        return;
      }

      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const credentials = await invoke<SiteCredential[]>("get_credentials");
        console.log("[Credentials] Loaded from SQLite:", credentials.length, "credentials");
        set({ credentials, loaded: true });
      } catch (err) {
        console.error("[Credentials] Failed to load credentials from backend:", err);
        set({ loaded: true });
      }
    },

    addCredential: async (credential) => {
      const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
      if (!isTauri) {
        throw new Error("Not in Tauri context");
      }

      const { invoke } = await import("@tauri-apps/api/core");
      const saved = await invoke<SiteCredential>("add_credential", { credential });
      set((state) => ({
        credentials: [...state.credentials, saved],
      }));
      return saved;
    },

    updateCredential: async (credential) => {
      const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
      if (!isTauri) {
        throw new Error("Not in Tauri context");
      }

      const { invoke } = await import("@tauri-apps/api/core");
      const saved = await invoke<SiteCredential>("update_credential", { credential });
      set((state) => ({
        credentials: state.credentials.map((c) =>
          c.id === saved.id ? saved : c
        ),
      }));
      return saved;
    },

    deleteCredential: async (id) => {
      const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
      if (!isTauri) {
        throw new Error("Not in Tauri context");
      }

      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_credential", { id });
      set((state) => ({
        credentials: state.credentials.filter((c) => c.id !== id),
      }));
    },

    setPendingRequest: (request) => {
      set({ pendingRequest: request });
    },
  })
);

/**
 * Load credentials from backend SQLite on app startup.
 */
export async function loadCredentialsFromBackend(): Promise<void> {
  console.log("[Credentials] loadCredentialsFromBackend called");
  await useCredentialsStore.getState().loadFromBackend();
}
