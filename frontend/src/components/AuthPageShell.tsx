import React from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
import ThemeSwitch from '@/components/ui/ThemeSwitch';
import LanguageSwitch from '@/components/ui/LanguageSwitch';
import GitHubIcon from '@/components/icons/GitHubIcon';

interface AuthPageShellProps {
  subtitle?: string;
  children: React.ReactNode;
}

/**
 * Shared shell for the public auth pages (register / forgot / reset / verify).
 * Mirrors the LoginPage visual structure: top-right controls, hair-line grid
 * background, brand block, centered hub-card.
 */
const AuthPageShell: React.FC<AuthPageShellProps> = ({ subtitle, children }) => {
  const { t } = useTranslation();

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
      style={{ background: 'var(--hub-bg)', color: 'var(--hub-ink)' }}
    >
      {/* Top-right controls */}
      <div className="absolute top-3 right-4 z-20 flex items-center gap-1">
        <a
          href="https://github.com/huangjunsen0406/xiaozhi-mcphub"
          target="_blank"
          rel="noopener noreferrer"
          className="hub-icon-btn"
          aria-label="GitHub Repository"
        >
          <GitHubIcon className="h-4 w-4" />
        </a>
        <a
          href="https://docs.mcphub.app"
          target="_blank"
          rel="noopener noreferrer"
          className="hub-icon-btn"
          aria-label="Documentation"
        >
          <BookOpen className="h-4 w-4" />
        </a>
        <ThemeSwitch />
        <LanguageSwitch />
      </div>

      {/* Subtle grid pattern */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <svg className="h-full w-full" style={{ opacity: 0.5 }} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="auth-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path
                d="M 32 0 L 0 0 0 32"
                fill="none"
                stroke="var(--hub-line-2)"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#auth-grid)" />
        </svg>
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-6">
        <div className="w-full space-y-8">
          {/* Brand */}
          <div className="flex flex-col items-center gap-3">
            <div
              className="relative grid place-items-center"
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: 'var(--hub-ink)',
                color: 'white',
              }}
            >
              <span className="hub-mono font-semibold" style={{ fontSize: 18 }}>
                M
              </span>
              <span
                className="absolute"
                style={{
                  right: -2,
                  bottom: -2,
                  width: 8,
                  height: 8,
                  borderRadius: 50,
                  background: 'var(--hub-ok)',
                  boxShadow: '0 0 0 3px var(--hub-bg)',
                }}
              />
            </div>
            <div className="text-center">
              <h1
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: 'var(--hub-ink)',
                }}
              >
                {t('app.title')}
              </h1>
              {subtitle && (
                <p className="hub-sub" style={{ marginTop: 4 }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Card */}
          <div
            className="hub-card"
            style={{
              padding: '22px 22px 20px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPageShell;
