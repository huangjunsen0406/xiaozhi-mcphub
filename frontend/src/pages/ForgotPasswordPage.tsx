import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, MailCheck } from 'lucide-react';
import { requestPasswordReset } from '../services/authService';
import AuthPageShell from '../components/AuthPageShell';

const ForgotPasswordPage: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError(t('auth.emailRequired'));
      return;
    }

    setLoading(true);
    try {
      const result = await requestPasswordReset(email.trim());
      if (result.success) {
        setSent(true);
      } else {
        setError(result.message || t('auth.resetRequestFailed'));
      }
    } catch {
      setError(t('auth.resetRequestFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthPageShell subtitle={t('auth.forgotPasswordTitle')}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <MailCheck size={28} style={{ color: 'var(--hub-ok)' }} />
          <p style={{ fontSize: 14, fontWeight: 500 }}>{t('auth.resetEmailSentTitle')}</p>
          <p className="hub-sub">{t('auth.resetEmailSentBody')}</p>
          <Link to="/login" className="hub-btn primary justify-center" style={{ marginTop: 8 }}>
            {t('auth.backToLogin')}
          </Link>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell subtitle={t('auth.forgotPasswordTitle')}>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <p className="hub-sub" style={{ marginTop: 0 }}>
          {t('auth.forgotPasswordHint')}
        </p>
        <div>
          <label htmlFor="email" className="hub-sect block" style={{ marginBottom: 6 }}>
            {t('auth.email')}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="hub-input"
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          {loading ? t('auth.sending') : t('auth.sendResetEmail')}
        </button>
      </form>

      <p className="mt-4 text-center" style={{ fontSize: 12.5, color: 'var(--hub-ink-3)' }}>
        <Link to="/login" style={{ color: 'var(--hub-ink)', fontWeight: 500 }}>
          {t('auth.backToLogin')}
        </Link>
      </p>
    </AuthPageShell>
  );
};

export default ForgotPasswordPage;
