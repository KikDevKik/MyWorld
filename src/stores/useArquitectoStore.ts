import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { PendingItem } from '../types/roadmap';

interface ArquitectoState {
  arquitectoSessionId: string | null;
  setArquitectoSessionId: (id: string | null) => void;
  arquitectoHasInitialized: boolean;
  setArquitectoHasInitialized: (v: boolean) => void;
  arquitectoPendingItems: PendingItem[];
  setArquitectoPendingItems: (items: PendingItem[]) => void;
  arquitectoSummary: string;
  setArquitectoSummary: (summary: string) => void;
  // Sprint 5.4: Configuración
  implacableMode: boolean;
  setImplacableMode: (v: boolean) => void;
  ragFilters: { personajes: boolean; lore: boolean; recursos: boolean };
  setRagFilters: (filters: { personajes: boolean; lore: boolean; recursos: boolean }) => void;
  // Sprint 5.6: Bloqueo de Rehidratación Fantasma
  isPurging: boolean;
  setIsPurging: (v: boolean) => void;
  // Sprint 6.4: Limpiar todos los datos de sesión
  clearArquitectoData: () => void;
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

      // Sprint 5.4
      implacableMode: false,
      setImplacableMode: (v) => set({ implacableMode: v }),
      ragFilters: { personajes: true, lore: true, recursos: true },
      setRagFilters: (filters) => set({ ragFilters: filters }),

      // Sprint 5.6
      isPurging: false,
      setIsPurging: (v) => set({ isPurging: v }),

      // Sprint 6.4
      clearArquitectoData: () => set({
          arquitectoPendingItems: [],
          arquitectoSummary: '',
          arquitectoSessionId: null,
          arquitectoHasInitialized: false,
      }),
    }),
    {
      name: 'myworld_arquitecto_cache',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ ...state, isPurging: false }), // No persistir isPurging
    }
  )
);
