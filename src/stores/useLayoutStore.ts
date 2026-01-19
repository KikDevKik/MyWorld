import { create } from 'zustand';

interface LayoutState {
  isArsenalWide: boolean;
  toggleArsenalWidth: () => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  isArsenalWide: false,
  toggleArsenalWidth: () => set((state) => ({ isArsenalWide: !state.isArsenalWide })),
}));
