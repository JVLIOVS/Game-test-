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

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let text: string = dictionaries[language][key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, String(v));
  return text;
}
