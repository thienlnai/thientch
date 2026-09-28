import React from 'react';
import { Language } from '../types/index.ts';
import { Globe } from 'lucide-react';

interface LanguageSelectorProps {
  currentLang: Language;
  onLanguageChange: (lang: Language) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ currentLang, onLanguageChange }) => {
  return (
    <div className="inline-flex items-center bg-white/90 backdrop-blur-xs border border-slate-200 rounded-full p-1 shadow-xs text-xs font-medium">
      <div className="flex items-center gap-1.5 px-2 text-slate-500">
        <Globe className="w-3.5 h-3.5" />
      </div>
      <button
        type="button"
        onClick={() => onLanguageChange('vi')}
        className={`px-2.5 py-1 rounded-full transition-all duration-150 cursor-pointer ${
          currentLang === 'vi'
            ? 'bg-blue-600 text-white font-semibold shadow-xs'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
      >
        🇻🇳 Tiếng Việt
      </button>
      <button
        type="button"
        onClick={() => onLanguageChange('en')}
        className={`px-2.5 py-1 rounded-full transition-all duration-150 cursor-pointer ${
          currentLang === 'en'
            ? 'bg-blue-600 text-white font-semibold shadow-xs'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
      >
        🇬🇧 English
      </button>
    </div>
  );
};
