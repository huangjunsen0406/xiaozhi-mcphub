import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, MailCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AuthPageShell from '../components/AuthPageShell';

const RegisterPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register } = useAuth();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || !password || !confirmPassword) {
      setError(t('auth.emptyFields'));
      return;
    }
    if (password.length < 6) {
      setError(t('auth.passwordTooShort'));
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

  if (pendingVerification) {
    return (
      <AuthPageShell subtitle={t('auth.registerTitle')}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <MailCheck size={28} style={{ color: 'var(--hub-ok)' }} />
          <p style={{ fontSize: 14, fontWeight: 500 }}>{t('auth.verificationEmailSentTitle')}</p>
          <p className="hub-sub">{t('auth.verificationEmailSentBody', { email })}</p>
          <Link to="/login" className="hub-btn primary justify-center" style={{ marginTop: 8 }}>
            {t('auth.backToLogin')}
          </Link>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell subtitle={t('auth.registerTitle')}>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="username" className="hub-sect block" style={{ marginBottom: 6 }}>
            {t('auth.username')}
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            required
            className="hub-input"
            placeholder={t('auth.username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="email" className="hub-sect block" style={{ marginBottom: 6 }}>
            {t('auth.email')}
            <span style={{ color: 'var(--hub-ink-3)', marginLeft: 4 }}>
              ({t('auth.emailOptionalHint')})
            </span>
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="hub-input"
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="password" className="hub-sect block" style={{ marginBottom: 6 }}>
            {t('auth.password')}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            className="hub-input"
            placeholder={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
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
          {loading ? t('auth.registering') : t('auth.register')}
        </button>
      </form>

      <p className="mt-4 text-center" style={{ fontSize: 12.5, color: 'var(--hub-ink-3)' }}>
        {t('auth.haveAccount')}{' '}
        <Link to="/login" style={{ color: 'var(--hub-ink)', fontWeight: 500 }}>
          {t('auth.login')}
        </Link>
      </p>
    </AuthPageShell>
  );
};

export default RegisterPage;
