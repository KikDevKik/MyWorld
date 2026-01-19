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

  // 🟢 LEGACY / STRATEGIST MODE (Zone C Width)
  isArsenalWide: boolean;
  toggleArsenalWidth: () => void;
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
}));
