import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Queue } from "@/types";

interface QueueState {
  // State
  queues: Map<string, Queue>;
  selectedQueueId: string | null;

  // Actions
  addQueue: (queue: Queue) => void;
  updateQueue: (id: string, updates: Partial<Queue>) => void;
  removeQueue: (id: string) => void;
  setSelectedQueue: (id: string | null) => void;
  setQueues: (queues: Queue[]) => void;
}

// Default queue ID (nil UUID)
export const DEFAULT_QUEUE_ID = "00000000-0000-0000-0000-000000000000";

export const useQueueStore = create<QueueState>()(
  persist(
    (set) => ({
      // Initial state with default queue
      queues: new Map([
        [
          DEFAULT_QUEUE_ID,
          {
            id: DEFAULT_QUEUE_ID,
            name: "Default",
            color: "#3b82f6",
            icon: null,
            max_concurrent: 4,
            speed_limit: null,
            schedule: null,
            post_action: "none",
            created_at: new Date().toISOString(),
          },
        ],
      ]),
      selectedQueueId: null,

      // Actions
      addQueue: (queue) =>
        set((state) => {
          const queues = new Map(state.queues);
          queues.set(queue.id, queue);
          return { queues };
        }),

      updateQueue: (id, updates) =>
        set((state) => {
          const queues = new Map(state.queues);
          const queue = queues.get(id);
          if (queue) {
            queues.set(id, { ...queue, ...updates });
          }
          return { queues };
        }),

      removeQueue: (id) =>
        set((state) => {
          // Don't allow removing default queue
          if (id === DEFAULT_QUEUE_ID) return state;

          const queues = new Map(state.queues);
          queues.delete(id);
          return {
            queues,
            selectedQueueId:
              state.selectedQueueId === id ? null : state.selectedQueueId,
          };
        }),

      setSelectedQueue: (id) => set({ selectedQueueId: id }),

      setQueues: (queueList) =>
        set(() => {
          const queues = new Map<string, Queue>();
          for (const queue of queueList) {
            queues.set(queue.id, queue);
          }
          return { queues };
        }),
    }),
    {
      name: "dlman-queues",
      partialize: (state) => ({
        queues: Array.from(state.queues.entries()),
        selectedQueueId: state.selectedQueueId,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as {
          queues: [string, Queue][];
          selectedQueueId: string | null;
        };
        return {
          ...current,
          queues: new Map(persistedState.queues || []),
          selectedQueueId: persistedState.selectedQueueId,
        };
      },
    }
  )
);

// Selectors
export const selectQueuesArray = (state: QueueState) =>
  Array.from(state.queues.values());

export const selectQueueById = (id: string) => (state: QueueState) =>
  state.queues.get(id);
