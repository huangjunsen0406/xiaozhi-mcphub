import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { User, Settings, LogOut, Info } from 'lucide-react';
import AboutDialog from './AboutDialog';

interface UserProfileMenuProps {
  collapsed: boolean;
  version: string;
}

const UserProfileMenu: React.FC<UserProfileMenuProps> = ({ collapsed, version }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { auth, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showNewVersionInfo] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSettingsClick = () => {
    navigate('/settings');
    setIsOpen(false);
  };

  const handleLogoutClick = () => {
    logout();
    navigate('/login');
  };

  const handleAboutClick = () => {
    setShowAboutDialog(true);
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex ${collapsed ? 'justify-center' : 'items-center'} w-full p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors rounded-md ${isOpen ? 'bg-gray-100 dark:bg-gray-700' : ''
          }`}
      >
        <div className="relative flex-shrink-0">
          <div className="flex items-center justify-center w-5 h-5 border border-gray-300 rounded-full dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
            <User className="w-4 h-4 text-gray-700 dark:text-gray-300" />
          </div>
        </div>
        {!collapsed && (
          <div className="flex flex-col items-start ml-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {auth.user?.username || t('auth.user')}
            </span>
          </div>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-0 left-0 z-50 w-full transform -translate-y-full bg-white border border-gray-200 min-w-max dark:bg-gray-800">

          <button
            onClick={handleSettingsClick}
            className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Settings className="w-4 h-4 mr-2" />
            {t('nav.settings')}
          </button>
          <button
            onClick={handleAboutClick}
            className="relative flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Info className="w-4 h-4 mr-2" />
            {t('about.title')}
            {showNewVersionInfo && (
              <span className="absolute block w-2 h-2 bg-red-500 rounded-full top-2 right-4"></span>
            )}
          </button>

          <div className="border-t border-gray-200 dark:border-gray-600"></div>

          <button
            onClick={handleLogoutClick}
            className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <LogOut className="w-4 h-4 mr-2" />
            {t('app.logout')}
          </button>
        </div>
      )}

      {/* About dialog */}
      <AboutDialog
        isOpen={showAboutDialog}
        onClose={() => setShowAboutDialog(false)}
        version={version}
      />
    </div>
  );
};

export default UserProfileMenu;
