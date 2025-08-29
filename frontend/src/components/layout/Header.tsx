import React from 'react';
import { useTranslation } from 'react-i18next';
import ThemeSwitch from '@/components/ui/ThemeSwitch';
import LanguageSwitch from '@/components/ui/LanguageSwitch';
import GitHubIcon from '@/components/icons/GitHubIcon';

interface HeaderProps {
  onToggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const { t } = useTranslation();

  return (
    <header className="z-10 bg-white shadow-sm dark:bg-gray-800">
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center">
          {/* 侧边栏切换按钮 */}
          <button
            onClick={onToggleSidebar}
            className="p-2 text-gray-500 rounded-md dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none"
            aria-label={t('app.toggleSidebar')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* 应用标题 */}
          <h1 className="ml-4 text-xl font-bold text-gray-900 dark:text-white">{t('app.title')}</h1>
        </div>

        {/* Theme Switch and Language Switcher and Version */}
        <div className="flex items-center space-x-1">
          <a
            href="https://github.com/huangjunsen0406/xiaozhi-mcphub"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-gray-500 rounded-md dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="GitHub Repository"
          >
            <GitHubIcon className="w-5 h-5" />
          </a>
          <ThemeSwitch />
          <LanguageSwitch />
        </div>
      </div>
    </header>
  );
};

export default Header;