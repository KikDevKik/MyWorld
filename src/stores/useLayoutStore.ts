import { create } from 'zustand';

interface LayoutState {
  // 🟢 CORE NAVIGATION STATE
  activeView: string;
  setActiveView: (view: string) => void;

  // 🟢 DIRECTOR LAYOUT STATE
  isDirectorMaximized: boolean; // Controls Sidebar Visibility in Director Mode
  toggleDirectorMaximized: () => void;

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

  // Arsenal Width
  isArsenalWide: false,
  toggleArsenalWidth: () => set((state) => ({ isArsenalWide: !state.isArsenalWide })),
}));
