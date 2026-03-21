import { create } from 'zustand';

interface LayoutState {
  // 🟢 CORE NAVIGATION STATE
  activeView: string;
  setActiveView: (view: string) => void;

  // 🟢 DIRECTOR LAYOUT STATE
  isDirectorMaximized: boolean; // Controls Sidebar Visibility in Director Mode
  toggleDirectorMaximized: () => void;

  // 🟢 FASE 3: ELASTIC DIRECTOR
  directorWidth: number;
  setDirectorWidth: (width: number) => void;

  // 🟢 TRIBUNAL RESIZABLE
  tribunalWidth: number;
  setTribunalWidth: (width: number) => void;

  // 🟢 GUARDIAN RESIZABLE
  guardianWidth: number;
  setGuardianWidth: (width: number) => void;

  // 🟢 LEGACY / STRATEGIST MODE (Zone C Width)
  isArsenalWide: boolean;
  toggleArsenalWidth: () => void;

  // 🟢 SENTINEL FILTER (GLOBAL)
  showOnlyHealthy: boolean;
  toggleShowOnlyHealthy: () => void;

  // 🟢 ARQUITECTO: Pendientes compartidos entre Zone B y Zone C
  arquitectoSessionId: string | null;
  setArquitectoSessionId: (id: string | null) => void;
  arquitectoHasInitialized: boolean;
  setArquitectoHasInitialized: (v: boolean) => void;
  arquitectoPendingItems: any[];
  setArquitectoPendingItems: (items: any[]) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  // Navigation
  activeView: 'editor',
  setActiveView: (view) => set({ activeView: view }),

  // Director Layout
  isDirectorMaximized: false,
  toggleDirectorMaximized: () => set((state) => ({ isDirectorMaximized: !state.isDirectorMaximized })),

  directorWidth: 400, // Default Start
  setDirectorWidth: (width) => set((state) => {
    // Auto-maximize logic if width > 80% of screen (User Requirement)
    const isMax = width > (window.innerWidth * 0.8);
    return {
      directorWidth: width,
      isDirectorMaximized: isMax,
      // Also sync isArsenalWide for compatibility (if wide enough)
      isArsenalWide: width > 600
    };
  }),

  // Tribunal Layout
  tribunalWidth: 500,
  setTribunalWidth: (width) => set({ tribunalWidth: width }),

  // Guardian Layout
  guardianWidth: 600, // Approx 45% of standard laptop
  setGuardianWidth: (width) => set({ guardianWidth: width }),

  // Arsenal Width
  isArsenalWide: false,
  toggleArsenalWidth: () => set((state) => {
    // Toggle Macro: 400px <-> 800px
    const targetWidth = state.isArsenalWide ? 400 : 800;
    return {
      isArsenalWide: !state.isArsenalWide,
      directorWidth: targetWidth
    };
  }),

  // Sentinel Filter
  showOnlyHealthy: false,
  toggleShowOnlyHealthy: () => set((state) => ({ showOnlyHealthy: !state.showOnlyHealthy })),

  // Arquitecto
  arquitectoSessionId: null,
  setArquitectoSessionId: (id) => set({ arquitectoSessionId: id }),
  arquitectoHasInitialized: false,
  setArquitectoHasInitialized: (v) => set({ arquitectoHasInitialized: v }),
  arquitectoPendingItems: [],
  setArquitectoPendingItems: (items) => set({ arquitectoPendingItems: items }),
}));
