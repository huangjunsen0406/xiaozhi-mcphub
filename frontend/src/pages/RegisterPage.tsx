import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Eye, EyeOff, MailCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getPublicConfig } from '../services/configService';
import { validatePasswordStrength } from '../utils/passwordValidation';
import ThemeSwitch from '@/components/ui/ThemeSwitch';
import LanguageSwitch from '@/components/ui/LanguageSwitch';

const RegisterPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register } = useAuth();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  // When SMTP is fully configured, registration requires a verified email.
  const [emailRequired, setEmailRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPublicConfig().then((cfg) => {
      if (!cancelled) setEmailRequired(cfg.emailEnabled === true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || !password || !confirmPassword) {
      setError(t('auth.emptyFields'));
      return;
    }
    if (emailRequired && !email.trim()) {
      setError(t('auth.emailRequired'));
      return;
    }
    const strength = validatePasswordStrength(password);
    if (!strength.isValid) {
      setError(t(`auth.${strength.errors[0]}`));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordsNotMatch'));
      return;
    }

    setLoading(true);
    try {
      const result = await register(username, password, email.trim() || undefined);
      if (result.success) {
        if (result.emailVerificationRequired) {
          setPendingVerification(true);
        } else {
          navigate('/');
        }
      } else {
        setError(result.message || t('auth.registerFailed'));
      }
    } catch {
      setError(t('auth.registerFailed'));
    } finally {
      setLoading(false);
    }
  };

  const inputClassName =
    'relative block w-full px-4 py-3 text-gray-900 placeholder-gray-400 transition-all bg-white border border-gray-300 rounded-lg appearance-none dark:border-gray-600 dark:bg-slate-700 dark:text-white dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="flex w-full min-h-screen">
      {/* Left side - Illustration (matches pro / LoginPage) */}
      <div className="relative flex-col items-center justify-center hidden p-12 overflow-hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-700 dark:via-indigo-900 dark:to-purple-900">
        <div className="absolute inset-0 opacity-30 dark:opacity-20">
          <div className="absolute bg-blue-400 rounded-full top-20 left-20 w-72 h-72 mix-blend-multiply dark:mix-blend-screen filter blur-3xl animate-pulse"></div>
          <div className="absolute delay-1000 bg-purple-400 rounded-full bottom-20 right-20 w-72 h-72 mix-blend-multiply dark:mix-blend-screen filter blur-3xl animate-pulse"></div>
        </div>

        <div className="relative z-10 space-y-8 text-center">
          <div className="flex justify-center mb-8">
            <div className="relative w-80 h-80">
              <div className="absolute inset-0 flex items-center justify-center">
                <svg viewBox="0 0 400 400" className="w-full h-full drop-shadow-2xl">
                  <g transform="translate(200, 250)">
                    <polygon points="0,-60 100,0 0,60 -100,0" fill="#4F46E5" opacity="0.3" />
                    <g transform="translate(-50, -80)">
                      <polygon points="0,-40 25,-25 25,15 0,30 -25,15 -25,-25" fill="#6366F1" />
                      <polygon points="0,-40 25,-25 25,15 0,30" fill="#4F46E5" />
                      <polygon points="0,30 -25,15 -25,-25 0,-40" fill="#3730A3" />
                    </g>
                    <g transform="translate(30, -60)">
                      <polygon points="0,-30 20,-17 20,13 0,26 -20,13 -20,-17" fill="#8B5CF6" />
                      <polygon points="0,-30 20,-17 20,13 0,26" fill="#7C3AED" />
                      <polygon points="0,26 -20,13 -20,-17 0,-30" fill="#6D28D9" />
                    </g>
                    <g transform="translate(0, -40)">
                      <polygon points="0,-50 30,-32 30,18 0,36 -30,18 -30,-32" fill="#06B6D4" />
                      <polygon points="0,-50 30,-32 30,18 0,36" fill="#0891B2" />
                      <polygon points="0,36 -30,18 -30,-32 0,-50" fill="#0E7490" />
                    </g>
                    <circle cx="-60" cy="-100" r="15" fill="#60A5FA" opacity="0.6" />
                    <circle cx="70" cy="-110" r="12" fill="#34D399" opacity="0.6" />
                  </g>
                </svg>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-gray-500 dark:text-white">{t('auth.slogan')}</h1>
            <p className="text-gray-500 dark:text-gray-400">{t('auth.sloganDesc')}</p>
          </div>
        </div>
      </div>

      {/* Right side - Register form */}
      <div className="relative flex items-center justify-center w-full p-8 bg-white lg:w-1/2 dark:bg-slate-800">
        <div className="absolute flex items-center gap-2 top-6 right-6">
          <ThemeSwitch />
          <LanguageSwitch />
        </div>

        <div className="w-full max-w-md space-y-8">
          {pendingVerification ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-50 dark:bg-green-900/30">
                <MailCheck className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('auth.verificationEmailSentTitle')}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('auth.verificationEmailSentBody', { email })}
              </p>
              <Link
                to="/login"
                className="mt-2 flex justify-center w-full px-4 py-3 text-sm font-medium text-white transition-all bg-blue-600 border border-transparent rounded-lg shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {t('auth.backToLogin')}
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-2 text-center">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                  {t('auth.createAccount')}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('auth.registerPrompt')}</p>
              </div>

              <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="username"
                      className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t('auth.username')}
                    </label>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required
                      className={inputClassName}
                      placeholder={t('auth.usernamePlaceholder')}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="email"
                      className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t('auth.email')}
                      {!emailRequired && (
                        <span className="ml-1 text-gray-400">({t('auth.emailOptionalHint')})</span>
                      )}
                      {emailRequired && <span className="ml-1 text-red-500">*</span>}
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required={emailRequired}
                      className={inputClassName}
                      placeholder={t('auth.emailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    {emailRequired && (
                      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                        {t('auth.emailRequiredHint')}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="password"
                      className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t('auth.password')}
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        className={`${inputClassName} pr-12`}
                        placeholder={t('auth.passwordPlaceholder')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute text-gray-400 -translate-y-1/2 right-3 top-1/2 hover:text-gray-600 dark:hover:text-gray-300"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="confirmPassword"
                      className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t('auth.confirmPassword')}
                    </label>
                    <div className="relative">
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        className={`${inputClassName} pr-12`}
                        placeholder={t('auth.confirmPasswordPlaceholder')}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute text-gray-400 -translate-y-1/2 right-3 top-1/2 hover:text-gray-600 dark:hover:text-gray-300"
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-5 h-5" />
                        ) : (
                          <Eye className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 text-sm text-red-600 border border-red-200 rounded-lg dark:border-red-800 bg-red-50 dark:bg-red-900/20 dark:text-red-400">
                    <AlertCircle size={14} className="flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex justify-center w-full px-4 py-3 text-sm font-medium text-white transition-all bg-blue-600 border border-transparent rounded-lg shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? t('auth.registering') : t('auth.register')}
                  </button>
                </div>

                <div className="text-sm text-center text-gray-600 dark:text-gray-400">
                  {t('auth.haveAccount')}{' '}
                  <Link
                    to="/login"
                    className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
                  >
                    {t('auth.login')}
                  </Link>
                </div>
              </form>
            </>
          )}

          <div className="pt-4 text-xs text-center text-gray-500 dark:text-gray-500">
            Copyright © {new Date().getFullYear()} xiaozhi-mcphub
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
