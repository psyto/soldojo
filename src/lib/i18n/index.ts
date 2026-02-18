import { en, type TranslationKeys } from './en';
import { ptBR } from './pt-br';
import { es } from './es';

export type Locale = 'en' | 'pt-br' | 'es';

export const translations: Record<Locale, TranslationKeys> = {
  en,
  'pt-br': ptBR,
  es,
};

export const defaultLocale: Locale = 'pt-br';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  'pt-br': 'Português',
  es: 'Español',
};

export const localeFlags: Record<Locale, string> = {
  en: 'US',
  'pt-br': 'BR',
  es: 'ES',
};

export function getTranslations(locale: Locale = defaultLocale): TranslationKeys {
  return translations[locale] || translations[defaultLocale];
}

export function t(keyPath: string, locale: Locale = defaultLocale): string {
  const keys = keyPath.split('.');
  let value: unknown = translations[locale];

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      value = translations[defaultLocale];
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = (value as Record<string, unknown>)[k];
        } else {
          return keyPath;
        }
      }
      break;
    }
  }

  return typeof value === 'string' ? value : keyPath;
}

export function formatT(
  keyPath: string,
  params: Record<string, string | number>,
  locale: Locale = defaultLocale
): string {
  let text = t(keyPath, locale);
  Object.entries(params).forEach(([key, value]) => {
    text = text.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  });
  return text;
}

export { en, ptBR, es };
export type { TranslationKeys };
