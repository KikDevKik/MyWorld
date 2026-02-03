import { create } from 'zustand';

export type Language = 'es' | 'en' | 'jp' | 'ko' | 'zh';

interface LanguageState {
  currentLanguage: Language;
  setLanguage: (lang: Language) => void;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  currentLanguage: (localStorage.getItem('myworld_language_preference') as Language) || 'es',
  setLanguage: (lang) => {
    localStorage.setItem('myworld_language_preference', lang);
    set({ currentLanguage: lang });
  },
}));
