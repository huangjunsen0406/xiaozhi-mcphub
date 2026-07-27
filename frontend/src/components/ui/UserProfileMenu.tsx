import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { User, Settings, LogOut, Info } from 'lucide-react';
import AboutDialog from './AboutDialog';
import SponsorDialog from './SponsorDialog';
import WeChatDialog from './WeChatDialog';
import WeChatIcon from '@/components/icons/WeChatIcon';
import DiscordIcon from '@/components/icons/DiscordIcon';
import SponsorIcon from '@/components/icons/SponsorIcon';
import { ChangelogUpdateInfo } from '@/types';
import {
  fetchChangelogUpdateInfo,
  shouldShowUpdateBadge,
} from '@/services/changelogService';

interface UserProfileMenuProps {
  collapsed: boolean;
  version: string;
}

const UserProfileMenu: React.FC<UserProfileMenuProps> = ({ collapsed, version }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { auth, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showNewVersionInfo, setShowNewVersionInfo] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [sponsorDialogOpen, setSponsorDialogOpen] = useState(false);
  const [wechatDialogOpen, setWechatDialogOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<ChangelogUpdateInfo | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Check for new version on login and component mount.
  useEffect(() => {
    const checkForNewVersion = async () => {
      try {
        const info = await fetchChangelogUpdateInfo({
          currentVersion: version,
          locale: i18n.language,
        });
        setUpdateInfo(info);
        setShowNewVersionInfo(shouldShowUpdateBadge(info));
      } catch (error) {
        console.error('Error checking for new version:', error);
      }
    };

    checkForNewVersion();
  }, [version, i18n.language]);

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

  const handleSponsorClick = () => {
    setSponsorDialogOpen(true);
    setIsOpen(false);
  };

  const handleWeChatClick = () => {
    setWechatDialogOpen(true);
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
          {showNewVersionInfo && (
            <span className="block absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          )}
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
        <div className="absolute top-0 left-0 z-50 w-full min-w-max bg-white border border-gray-200 transform -translate-y-full dark:border-gray-700 dark:bg-gray-800">
          <button
            onClick={handleSponsorClick}
            className="flex items-center px-4 py-2 w-full text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <SponsorIcon className="mr-2 w-4 h-4" />
            {t('sponsor.label')}
          </button>

          <button
            onClick={handleSettingsClick}
            className="flex items-center px-4 py-2 w-full text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <Settings className="mr-2 w-4 h-4" />
            {t('nav.settings')}
          </button>
          <button
            onClick={handleAboutClick}
            className="flex relative items-center px-4 py-2 w-full text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <Info className="mr-2 w-4 h-4" />
            {t('about.title')}
            {showNewVersionInfo && (
              <span className="block absolute top-2 right-4 w-2 h-2 bg-red-500 rounded-full"></span>
            )}
          </button>

          <div className="border-t border-gray-200 dark:border-gray-600"></div>

          <button
            onClick={handleLogoutClick}
            className="flex items-center px-4 py-2 w-full text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
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
        initialUpdateInfo={updateInfo}
        onUpdateInfoChange={(info) => {
          setUpdateInfo(info);
          setShowNewVersionInfo(shouldShowUpdateBadge(info));
        }}
        onDismissUpdate={() => {
          setShowNewVersionInfo(false);
        }}
      />

      {/* Sponsor dialog */}
      <SponsorDialog open={sponsorDialogOpen} onOpenChange={setSponsorDialogOpen} />
    </div>
  );
};

export default UserProfileMenu;
