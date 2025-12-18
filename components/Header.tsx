
import React, { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { THEMES } from '../constants';

interface HeaderProps {
    currentTheme: string;
    setTheme: (theme: string) => void;
    selectedSchool: string | null;
    onChangeSchool: () => void;
}

const ThemeIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
    </svg>
);

const WhatsAppIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.894 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.886-.001 2.267.651 4.383 1.905 6.25l-.275 1.002 1.03 1.018zM8.718 7.243c.133-.336.434-.543.818-.576.43-.034.636.101.804.312.189.231.631 1.52.663 1.623.032.102.05.213-.016.344-.065.131-.229.213-.401.325-.202.129-.41.26-.552.404-.16.161-.318.35-.165.608.175.292.747 1.229 1.624 2.016.994.881 1.866 1.158 2.149 1.24.31.09.462.046.63-.122.19-.184.82-1.022.952-1.229.132-.206.264-.238.44-.152.195.094 1.306.685 1.518.79.212.105.356.161.404.248.048.088.028.471-.124.922-.152.452-.947.881-1.306.922-.32.034-1.127.02-1.748-.227-.753-.3-1.859-1.158-3.041-2.451-1.37-1.52-2.316-3.213-2.316-3.213s-.165-.286-.318-.553c-.152-.267-.32-.287-.462-.287-.132 0-.304.01-.462.01z"/>
    </svg>
);


const Header: React.FC<HeaderProps> = ({ currentTheme, setTheme, selectedSchool, onChangeSchool }) => {
  const { t, language, toggleLanguage } = useLanguage();
  const { academicYear, logout, hasPermission, currentUser } = useAuth();
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  return (
    <header className="bg-header-bg text-header-text shadow-lg" style={{ backgroundColor: 'var(--color-header-bg)', color: 'var(--color-header-text)' }}>
      <div className="container mx-auto px-6 py-4 flex flex-col items-center gap-4">
        <div className="text-center w-full">
          <h1 className="text-3xl md:text-4xl font-bold">{t('appTitle')}</h1>
          
          {currentUser && (
            <div className="mt-2 flex flex-wrap justify-center items-baseline gap-2">
              <h2 className="text-xl font-semibold text-yellow-300">
                {t('welcomeUser')} {currentUser.name}
              </h2>
              <span className="text-sm md:text-base font-medium text-yellow-200 drop-shadow-sm opacity-95">
                {t('welcomeUserSuffix')}
              </span>
            </div>
          )}

          <p className="mt-2 text-sm md:text-base font-medium text-yellow-200 drop-shadow-sm opacity-95">{t('headerSlogan')}</p>
          
          <div className="flex flex-wrap justify-center items-center gap-3 mt-3 mb-2">
             <span className="text-xs md:text-sm font-medium text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]">{t('preparedBy')}</span>
             <a 
                href="https://wa.me/967780804012" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-green-400 hover:text-green-300 transition-colors"
                aria-label={t('contactWhatsApp')}
            >
                <WhatsAppIcon />
            </a>
          </div>

          <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-200 mt-2">
            {selectedSchool && <p style={{ opacity: 0.9 }}>{t('currentSchool')}: <span className="font-bold text-white">{selectedSchool}</span></p>}
            {academicYear && <p style={{ opacity: 0.9 }}>{t('academicYear')}: <span className="font-bold text-white">{academicYear}</span></p>}
          </div>
        </div>

        <div className="flex flex-wrap justify-center items-center gap-2 relative mt-2">
            {hasPermission('change_school') && (
                 <button
                    onClick={onChangeSchool}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm transform hover:scale-105"
                >
                    {t('changeSchool')}
                </button>
            )}
            <button
                onClick={toggleLanguage}
                className="bg-primary-light hover:bg-opacity-80 text-white font-bold py-2 px-5 rounded-lg transition-all duration-300 transform hover:scale-105"
                 style={{ backgroundColor: 'var(--color-primary-light)' }}
            >
                {t('toggleLanguage')}
            </button>
            <div className="relative">
                <button
                    onClick={() => setShowThemeMenu(!showThemeMenu)}
                    className="p-2 rounded-full bg-primary-light hover:bg-opacity-80 text-white transition-all duration-300 transform hover:scale-110"
                    title={t('changeTheme')}
                    style={{ backgroundColor: 'var(--color-primary-light)' }}
                >
                    <ThemeIcon />
                </button>
                {showThemeMenu && (
                    <div className={`absolute ${language === 'ar' ? 'left-0' : 'right-0'} mt-2 w-48 bg-white rounded-md shadow-lg z-20`}>
                        <ul className="py-1">
                            {Object.entries(THEMES).map(([key, theme]) => (
                                <li key={key}>
                                    <a
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setTheme(key);
                                            setShowThemeMenu(false);
                                        }}
                                        className={`block px-4 py-2 text-sm ${currentTheme === key ? 'font-bold text-primary' : 'text-gray-700'} hover:bg-gray-100`}
                                    >
                                        {theme.name}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
             <button
                onClick={logout}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
            >
                {t('logout')}
            </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
