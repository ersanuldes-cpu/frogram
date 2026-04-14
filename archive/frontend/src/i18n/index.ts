import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en';
import fr from './locales/fr';
import es from './locales/es';
import it from './locales/it';
import tr from './locales/tr';

const SUPPORTED_LANGUAGES = ['en', 'fr', 'es', 'it', 'tr'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

const LANGUAGE_STORAGE_KEY = '@frogram_language';

const i18n = new I18n({
  en,
  fr,
  es,
  it,
  tr,
});

i18n.enableFallback = true;
i18n.defaultLocale = 'en';

// Detect device language and map to supported language
export function getDeviceLanguage(): SupportedLanguage {
  try {
    const locales = Localization.getLocales();
    if (locales && locales.length > 0) {
      const deviceLang = locales[0].languageCode;
      if (deviceLang && SUPPORTED_LANGUAGES.includes(deviceLang as SupportedLanguage)) {
        return deviceLang as SupportedLanguage;
      }
    }
  } catch (e) {
    console.log('Error detecting device language:', e);
  }
  return 'en';
}

// Initialize language from storage or device
export async function initializeLanguage(): Promise<SupportedLanguage> {
  try {
    const storedLang = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (storedLang && SUPPORTED_LANGUAGES.includes(storedLang as SupportedLanguage)) {
      i18n.locale = storedLang;
      return storedLang as SupportedLanguage;
    }
  } catch (e) {
    console.log('Error reading stored language:', e);
  }
  const deviceLang = getDeviceLanguage();
  i18n.locale = deviceLang;
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, deviceLang);
  return deviceLang;
}

// Change language and persist
export async function changeLanguage(lang: SupportedLanguage): Promise<void> {
  i18n.locale = lang;
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}

export const LANGUAGES: { code: SupportedLanguage; name: string; flag: string }[] = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
];

export { SUPPORTED_LANGUAGES };
export default i18n;
