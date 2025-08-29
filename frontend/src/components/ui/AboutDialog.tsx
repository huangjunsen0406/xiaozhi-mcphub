import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  version: string;
}

const AboutDialog: React.FC<AboutDialogProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 bg-opacity-30">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg dark:bg-gray-800">
        <div className="relative p-6">
          {/* Close button (X) in the top-right corner */}
          <button
            onClick={onClose}
            className="absolute text-gray-400 top-4 right-4 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>

          <h3 className="mb-4 text-lg font-medium text-gray-900 dark:text-gray-100">
            {t('about.title')}
          </h3>

          <div className="space-y-4">

            <div className="text-gray-700 dark:text-gray-300">
              <p>{t('about.description')}</p>
            </div>

            <div className="mt-4">
              <a
                href="https://github.com/huangjunsen0406/xiaozhi-mcphub"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t('about.viewOnGitHub')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutDialog;
