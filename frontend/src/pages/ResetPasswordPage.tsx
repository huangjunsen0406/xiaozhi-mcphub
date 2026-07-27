import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { verifyResetToken, resetPassword } from '../services/authService';
import { validatePasswordStrength } from '../utils/passwordValidation';
import AuthPageShell from '../components/AuthPageShell';

type TokenState = 'checking' | 'valid' | 'invalid';

/** Map backend/frontend password strength codes (or legacy English) to auth.* keys. */
const PASSWORD_ERROR_CODE_BY_LEGACY: Record<string, string> = {
  'Password must be at least 8 characters long': 'passwordMinLength',
  'Password must contain at least one letter': 'passwordRequireLetter',
  'Password must contain at least one number': 'passwordRequireNumber',
  'Password must contain at least one special character': 'passwordRequireSpecial',
  passwordMinLength: 'passwordMinLength',
  passwordRequireLetter: 'passwordRequireLetter',
  passwordRequireNumber: 'passwordRequireNumber',
  passwordRequireSpecial: 'passwordRequireSpecial',
};

const ResetPasswordPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();

  const token = useMemo(
    () => new URLSearchParams(location.search).get('token') || '',
    [location.search],
  );

  const [tokenState, setTokenState] = useState<TokenState>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const translatePasswordError = (codeOrMessage: string): string => {
    const code = PASSWORD_ERROR_CODE_BY_LEGACY[codeOrMessage] || codeOrMessage;
    const key = `auth.${code}`;
    const translated = t(key);
    // i18next returns the key itself when missing — fall back to raw text.
    return translated === key ? codeOrMessage : translated;
  };

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!token) {
        setTokenState('invalid');
        return;
      }
      const result = await verifyResetToken(token);
      if (!cancelled) {
        setTokenState(result.success ? 'valid' : 'invalid');
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (value) {
      setPasswordErrors(validatePasswordStrength(value).errors);
    } else {
      setPasswordErrors([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password || !confirmPassword) {
      setError(t('auth.emptyFields'));
      return;
    }

    const strength = validatePasswordStrength(password);
    if (!strength.isValid) {
      setPasswordErrors(strength.errors);
      setError(t('auth.passwordStrengthError'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.passwordsNotMatch'));
      return;
    }

    setLoading(true);
    try {
      const result = await resetPassword(token, password);
      if (result.success) {
        setDone(true);
      } else {
        const serverCodes = Array.isArray(result.errors) ? result.errors : [];
        if (serverCodes.length > 0) {
          setPasswordErrors(
            serverCodes
              .map((c) => PASSWORD_ERROR_CODE_BY_LEGACY[c] || c)
              .filter((c) =>
                [
                  'passwordMinLength',
                  'passwordRequireLetter',
                  'passwordRequireNumber',
                  'passwordRequireSpecial',
                ].includes(c),
              ),
          );
          setError(translatePasswordError(serverCodes[0]));
        } else if (result.message === 'Password does not meet security requirements') {
          setError(t('auth.passwordStrengthError'));
        } else {
          setError(result.message || t('auth.resetFailed'));
        }
      }
    } catch {
      setError(t('auth.resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (tokenState === 'checking') {
    return (
      <AuthPageShell subtitle={t('auth.resetPasswordTitle')}>
        <p className="hub-sub py-4 text-center">{t('app.loading')}</p>
      </AuthPageShell>
    );
  }

  if (tokenState === 'invalid') {
    return (
      <AuthPageShell subtitle={t('auth.resetPasswordTitle')}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <AlertCircle size={28} style={{ color: 'oklch(0.45 0.18 25)' }} />
          <p style={{ fontSize: 14, fontWeight: 500 }}>{t('auth.resetTokenInvalidTitle')}</p>
          <p className="hub-sub">{t('auth.resetTokenInvalidBody')}</p>
          <Link
            to="/forgot-password"
            className="hub-btn primary justify-center"
            style={{ marginTop: 8 }}
          >
            {t('auth.requestNewLink')}
          </Link>
        </div>
      </AuthPageShell>
    );
  }

  if (done) {
    return (
      <AuthPageShell subtitle={t('auth.resetPasswordTitle')}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 size={28} style={{ color: 'var(--hub-ok)' }} />
          <p style={{ fontSize: 14, fontWeight: 500 }}>{t('auth.resetSuccessTitle')}</p>
          <p className="hub-sub">{t('auth.resetSuccessBody')}</p>
          <Link to="/login" className="hub-btn primary justify-center" style={{ marginTop: 8 }}>
            {t('auth.backToLogin')}
          </Link>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell subtitle={t('auth.resetPasswordTitle')}>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="new-password" className="hub-sect block" style={{ marginBottom: 6 }}>
            {t('auth.newPassword')}
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="hub-input"
            placeholder={t('auth.newPassword')}
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
          />
          <p className="hub-sub" style={{ marginTop: 6, fontSize: 12 }}>
            {t('auth.passwordStrengthHint')}
          </p>
          {password && passwordErrors.length > 0 && (
            <ul className="mt-2 space-y-1 list-none p-0">
              {passwordErrors.map((code) => (
                <li
                  key={code}
                  className="text-[12.5px]"
                  style={{ color: 'oklch(0.45 0.18 25)' }}
                >
                  • {translatePasswordError(code)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label htmlFor="confirm-password" className="hub-sect block" style={{ marginBottom: 6 }}>
            {t('auth.confirmPassword')}
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="hub-input"
            placeholder={t('auth.confirmPassword')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        {error && (
          <div
            className="flex items-center gap-2"
            style={{
              padding: '8px 10px',
              borderRadius: 7,
              border: '1px solid oklch(0.85 0.1 25)',
              background: 'oklch(0.97 0.03 25)',
              color: 'oklch(0.4 0.18 25)',
              fontSize: 12.5,
            }}
          >
            <AlertCircle size={13} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="hub-btn primary w-full justify-center"
          style={{ height: 34 }}
        >
          {loading ? t('auth.resetting') : t('auth.resetPassword')}
        </button>
      </form>
    </AuthPageShell>
  );
};

export default ResetPasswordPage;
