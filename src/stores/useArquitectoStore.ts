import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ArquitectoState {
  arquitectoSessionId: string | null;
  setArquitectoSessionId: (id: string | null) => void;
  arquitectoHasInitialized: boolean;
  setArquitectoHasInitialized: (v: boolean) => void;
  arquitectoPendingItems: any[];
  setArquitectoPendingItems: (items: any[]) => void;
  arquitectoSummary: string;
  setArquitectoSummary: (summary: string) => void;
}

export const useArquitectoStore = create<ArquitectoState>()(
  persist(
    (set) => ({
      arquitectoSessionId: null,
      setArquitectoSessionId: (id) => set({ arquitectoSessionId: id }),

      arquitectoHasInitialized: false,
      setArquitectoHasInitialized: (v) => set({ arquitectoHasInitialized: v }),

      arquitectoPendingItems: [],
      setArquitectoPendingItems: (items) => set({
          arquitectoPendingItems: items
      }),

      arquitectoSummary: '',
      setArquitectoSummary: (summary) => set({ arquitectoSummary: summary }),
    }),
    {
      name: 'myworld_arquitecto_cache',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
