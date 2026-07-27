import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getToken } from '../services/authService';
import { getPublicConfig } from '../services/configService';
import { createBetterAuthClient, startOidcLogin } from '../services/betterAuthClient';
import { getBasePath } from '../utils/runtime';
import ThemeSwitch from '@/components/ui/ThemeSwitch';
import LanguageSwitch from '@/components/ui/LanguageSwitch';
import GitHubIcon from '@/components/icons/GitHubIcon';
import DefaultPasswordWarningModal from '@/components/ui/DefaultPasswordWarningModal';

type SocialProvider = 'google' | 'github' | 'oidc';

// LocalStorage key for remembered username
const REMEMBERED_USERNAME_KEY = 'mcphub_remembered_username';

const sanitizeReturnUrl = (value: string | null): string | null => {
  if (!value) return null;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const url = new URL(value, origin);
    if (url.origin !== origin) return null;
    const relativePath = `${url.pathname}${url.search}${url.hash}`;
    return relativePath || '/';
  } catch {
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    return null;
  }
};

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [betterAuthBasePath, setBetterAuthBasePath] = useState<string | undefined>(undefined);
  const [socialProviders, setSocialProviders] = useState({
    google: false,
    github: false,
    oidc: false,
  });
  const [oidcProviderId, setOidcProviderId] = useState<string>('oidc');
  const [showDefaultPasswordWarning, setShowDefaultPasswordWarning] = useState(false);
  const { login, auth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const returnUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return sanitizeReturnUrl(params.get('returnUrl'));
  }, [location.search]);

  const isServerUnavailableError = useCallback((message?: string) => {
    if (!message) return false;
    const normalized = message.toLowerCase();
    return (
      normalized.includes('failed to fetch') ||
      normalized.includes('networkerror') ||
      normalized.includes('network error') ||
      normalized.includes('connection refused') ||
      normalized.includes('unable to connect') ||
      normalized.includes('fetch error') ||
      normalized.includes('econnrefused') ||
      normalized.includes('http 500') ||
      normalized.includes('internal server error') ||
      normalized.includes('proxy error')
    );
  }, []);

  const buildRedirectTarget = useCallback(() => {
    if (!returnUrl) return '/';
    if (!returnUrl.startsWith('/oauth/authorize')) return returnUrl;
    const token = getToken();
    if (!token) return returnUrl;
    try {
      const origin = window.location.origin;
      const url = new URL(returnUrl, origin);
      url.searchParams.set('token', token);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      const separator = returnUrl.includes('?') ? '&' : '?';
      return `${returnUrl}${separator}token=${encodeURIComponent(token)}`;
    }
  }, [returnUrl]);

  const redirectAfterLogin = useCallback(() => {
    if (returnUrl) {
      window.location.assign(buildRedirectTarget());
    } else {
      navigate('/');
    }
  }, [buildRedirectTarget, navigate, returnUrl]);

  // Load remembered username on mount
  useEffect(() => {
    const rememberedUsername = localStorage.getItem(REMEMBERED_USERNAME_KEY);
    if (rememberedUsername) {
      setUsername(rememberedUsername);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    if (!auth.loading && auth.isAuthenticated) redirectAfterLogin();
  }, [auth.isAuthenticated, auth.loading, redirectAfterLogin]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const errorCode = params.get('error');
    if (errorCode) {
      const i18nKey = `auth.error.${errorCode}`;
      const translated = t(i18nKey);
      setSocialError(translated !== i18nKey ? translated : t('auth.socialLoginFailed'));
    }
  }, [location.search, t]);

  useEffect(() => {
    const loadAuthProviders = async () => {
      const publicConfig = await getPublicConfig();
      const betterAuth = publicConfig.betterAuth;
      if (!betterAuth?.enabled) {
        setSocialProviders({ google: false, github: false, oidc: false });
        return;
      }
      setBetterAuthBasePath(betterAuth.basePath);
      setOidcProviderId(betterAuth.providers?.oidc?.providerId || 'oidc');
      setSocialProviders({
        google: betterAuth.providers?.google?.enabled === true,
        github: betterAuth.providers?.github?.enabled === true,
        oidc: betterAuth.providers?.oidc?.enabled === true,
      });
    };
    loadAuthProviders();
  }, []);

  const persistRememberedUsername = () => {
    if (rememberMe) {
      localStorage.setItem(REMEMBERED_USERNAME_KEY, username);
    } else {
      localStorage.removeItem(REMEMBERED_USERNAME_KEY);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSocialError(null);
    setLoading(true);
    try {
      if (!username || !password) {
        setError(t('auth.emptyFields'));
        setLoading(false);
        return;
      }
      const result = await login(username, password);
      if (result.success) {
        persistRememberedUsername();
        if (result.isUsingDefaultPassword) setShowDefaultPasswordWarning(true);
        else redirectAfterLogin();
      } else if (result.code === 'EMAIL_NOT_VERIFIED') {
        setError(t('auth.emailNotVerified'));
      } else {
        const message = result.message;
        setError(
          isServerUnavailableError(message) ? t('auth.serverUnavailable') : t('auth.loginFailed'),
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : undefined;
      setError(
        isServerUnavailableError(message) ? t('auth.serverUnavailable') : t('auth.loginError'),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: SocialProvider) => {
    setSocialError(null);
    setSocialLoading(provider);
    try {
      if (provider === 'oidc') {
        await startOidcLogin({
          providerId: oidcProviderId,
          callbackURL: returnUrl || '/',
          errorCallbackURL: `${getBasePath()}/login`,
          basePathOverride: betterAuthBasePath,
        });
        return;
      }

      const client = createBetterAuthClient(betterAuthBasePath);
      await client.signIn.social({
        provider,
        callbackURL: returnUrl || '/',
        errorCallbackURL: `${getBasePath()}/login`,
      });
    } catch (err) {
      console.error('Social login error:', err);
      setSocialError(t('auth.socialLoginFailed'));
      setSocialLoading(null);
    }
  };

  const handleCloseWarning = () => {
    setShowDefaultPasswordWarning(false);
    redirectAfterLogin();
  };

  const hasSocialProviders =
    socialProviders.google || socialProviders.github || socialProviders.oidc;

  return (
    <div className="flex w-full min-h-screen">
      {/* Left side - Illustration (from pro) */}
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
            <h1 className="text-3xl font-bold text-gray-500 dark:text-white">
              {t('auth.slogan')}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">{t('auth.sloganDesc')}</p>
          </div>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="relative flex items-center justify-center w-full p-8 bg-white lg:w-1/2 dark:bg-slate-800">
        <div className="absolute flex items-center gap-2 top-6 right-6">
          <ThemeSwitch />
          <LanguageSwitch />
        </div>

        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2 text-center">
            <h2 className="flex items-center justify-center gap-2 text-3xl font-bold text-gray-900 dark:text-white">
              {t('auth.welcomeBack')}
              <span className="inline-block animate-wave">👋</span>
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('auth.loginPrompt')}</p>
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
                  className="relative block w-full px-4 py-3 text-gray-900 placeholder-gray-400 transition-all bg-white border border-gray-300 rounded-lg appearance-none dark:border-gray-600 dark:bg-slate-700 dark:text-white dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={t('auth.usernamePlaceholder')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
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
                    autoComplete="current-password"
                    required
                    className="relative block w-full px-4 py-3 pr-12 text-gray-900 placeholder-gray-400 transition-all bg-white border border-gray-300 rounded-lg appearance-none dark:border-gray-600 dark:bg-slate-700 dark:text-white dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="remember-me" className="ml-2 text-gray-700 dark:text-gray-300">
                  {t('auth.rememberMe')}
                </label>
              </div>
              <Link
                to="/forgot-password"
                className="text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                {t('auth.forgotPassword')}
              </Link>
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
                {loading ? t('auth.loggingIn') : t('auth.login')}
              </button>
            </div>

            <div className="text-sm text-center text-gray-600 dark:text-gray-400">
              {t('auth.noAccount')}{' '}
              <Link
                to="/register"
                className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                {t('auth.register')}
              </Link>
            </div>
          </form>

          {hasSocialProviders && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-600" />
                <span className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  {t('auth.orContinue')}
                </span>
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-600" />
              </div>

              {socialError && (
                <div className="flex items-center gap-2 p-3 text-sm text-red-600 border border-red-200 rounded-lg dark:border-red-800 bg-red-50 dark:bg-red-900/20 dark:text-red-400">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span>{socialError}</span>
                </div>
              )}

              <div className="space-y-2">
                {socialProviders.google && (
                  <button
                    type="button"
                    onClick={() => handleSocialLogin('google')}
                    disabled={socialLoading !== null}
                    className="flex items-center justify-center w-full gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all bg-white border border-gray-300 rounded-lg dark:bg-slate-700 dark:text-white dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-slate-600 disabled:opacity-50"
                  >
                    {socialLoading === 'google' ? t('auth.loggingIn') : t('auth.loginWithGoogle')}
                  </button>
                )}
                {socialProviders.github && (
                  <button
                    type="button"
                    onClick={() => handleSocialLogin('github')}
                    disabled={socialLoading !== null}
                    className="flex items-center justify-center w-full gap-2 px-4 py-2.5 text-sm font-medium text-white transition-all bg-gray-900 border border-transparent rounded-lg dark:bg-gray-950 hover:bg-gray-800 disabled:opacity-50"
                  >
                    <GitHubIcon className="w-4 h-4" />
                    {socialLoading === 'github' ? t('auth.loggingIn') : t('auth.loginWithGithub')}
                  </button>
                )}
                {socialProviders.oidc && (
                  <button
                    type="button"
                    onClick={() => handleSocialLogin('oidc')}
                    disabled={socialLoading !== null}
                    className="flex items-center justify-center w-full gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all bg-white border border-gray-300 rounded-lg dark:bg-slate-700 dark:text-white dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-slate-600 disabled:opacity-50"
                  >
                    {socialLoading === 'oidc' ? t('auth.loggingIn') : t('auth.loginWithOIDC')}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="pt-4 text-xs text-center text-gray-500 dark:text-gray-500">
            Copyright © {new Date().getFullYear()} xiaozhi-mcphub
          </div>
        </div>
      </div>

      <style>{`
        @keyframes wave {
          0% { transform: rotate(0deg); }
          10% { transform: rotate(14deg); }
          20% { transform: rotate(-8deg); }
          30% { transform: rotate(14deg); }
          40% { transform: rotate(-4deg); }
          50% { transform: rotate(10deg); }
          60% { transform: rotate(0deg); }
          100% { transform: rotate(0deg); }
        }
        .animate-wave {
          animation: wave 2.5s infinite;
          transform-origin: 70% 70%;
          display: inline-block;
        }
      `}</style>

      <DefaultPasswordWarningModal
        isOpen={showDefaultPasswordWarning}
        onClose={handleCloseWarning}
      />
    </div>
  );
};

export default LoginPage;
