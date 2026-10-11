import { getLocales } from 'expo-localization';
import { en } from './en';
import { fr } from './fr';

export type TranslationKey = keyof typeof fr;
export type Language = 'fr' | 'en';

const dictionaries: Record<Language, Record<TranslationKey, string>> = { fr, en };

function detectLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return code === 'fr' ? 'fr' : 'en';
}

let language: Language = detectLanguage();

export const getLanguage = () => language;
export const setLanguage = (lang: Language) => {
  language = lang;
};

export function t(key: TranslationKey): string {
  return dictionaries[language][key] ?? key;
}
