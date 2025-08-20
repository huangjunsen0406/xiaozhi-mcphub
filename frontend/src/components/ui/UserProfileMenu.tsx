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
        className={`flex ${collapsed ? 'justify-center' : 'items-center'} w-full p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors rounded-md ${isOpen ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
      >
        <div className="relative flex-shrink-0">
          <div className="flex justify-center items-center w-5 h-5 bg-gray-50 rounded-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700">
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
        <div className="absolute top-0 left-0 z-50 py-1 w-full min-w-max bg-white border border-gray-200 transform -translate-y-full dark:bg-gray-800">
          <button
            onClick={handleSettingsClick}
            className="flex items-center px-4 py-2 w-full text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Settings className="mr-2 w-4 h-4" />
            {t('nav.settings')}
          </button>
          <button
            onClick={handleAboutClick}
            className="flex relative items-center px-4 py-2 w-full text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Info className="mr-2 w-4 h-4" />
            {t('about.title')}

          </button>
          <button
            onClick={handleLogoutClick}
            className="flex items-center px-4 py-2 w-full text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <LogOut className="mr-2 w-4 h-4" />
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
