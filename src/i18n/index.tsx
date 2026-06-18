import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Locale, Translations } from './translations';
import { translationsMap, zhCN } from './translations';
import { getSetting, setSetting } from '../api/settings';

const DEFAULT_LOCALE: Locale = 'en';
const SETTING_KEY = 'language';

interface I18nContextValue {
  locale: Locale;
  t: Translations;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  t: zhCN,
  setLocale: () => {},
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  // Load saved locale on mount
  useEffect(() => {
    getSetting(SETTING_KEY).then((saved) => {
      if (saved && (saved === 'zh-CN' || saved === 'en')) {
        setLocaleState(saved as Locale);
      }
      setReady(true);
    }).catch(() => {
      setReady(true);
    });
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    setSetting(SETTING_KEY, newLocale).catch(console.error);
  }, []);

  const t = translationsMap[locale] ?? translationsMap[DEFAULT_LOCALE];

  // While loading saved locale, render with default
  if (!ready) return null;

  return (
    <I18nContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
