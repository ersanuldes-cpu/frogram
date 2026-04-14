import { create } from 'zustand';
import i18n, { initializeLanguage, changeLanguage, type SupportedLanguage } from '../i18n';

interface LanguageState {
  language: SupportedLanguage;
  isLoading: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  language: 'en',
  isLoading: true,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    const lang = await initializeLanguage();
    set({ language: lang, isLoading: false, initialized: true });
  },

  setLanguage: async (lang: SupportedLanguage) => {
    await changeLanguage(lang);
    set({ language: lang });
  },
}));

// Reactive translation hook — re-creates t() every time language changes
export function useTranslation() {
  const language = useLanguageStore((state) => state.language);
  const t = (key: string) => i18n.t(key);
  return { t, language };
}
