import { create } from "zustand";
import { persist } from "zustand/middleware";

interface BatchImportPrefsState {
  hideHtmlPages: boolean;
  startImmediately: boolean;

  setHideHtmlPages: (value: boolean) => void;
  setStartImmediately: (value: boolean) => void;
}

export const useBatchImportPrefsStore = create<BatchImportPrefsState>()(
  persist(
    (set) => ({
      hideHtmlPages: false,
      startImmediately: false,

      setHideHtmlPages: (hideHtmlPages) => set({ hideHtmlPages }),
      setStartImmediately: (startImmediately) => set({ startImmediately }),
    }),
    {
      name: "dlman-batch-import",
      partialize: (state) => ({
        hideHtmlPages: state.hideHtmlPages,
        startImmediately: state.startImmediately,
      }),
    }
  )
);
