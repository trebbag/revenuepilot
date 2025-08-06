import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json' assert { type: 'json' };
import es from './locales/es.json' assert { type: 'json' };
import fr from './locales/fr.json' assert { type: 'json' };

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
