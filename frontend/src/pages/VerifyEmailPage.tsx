import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { verifyEmail } from '../services/authService';
import AuthPageShell from '../components/AuthPageShell';

type VerifyState = 'verifying' | 'success' | 'failed';

const VerifyEmailPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  // A verification token is single-use; guard against double-invocation
  // (React StrictMode mounts effects twice in dev).
  const startedRef = useRef(false);

  const token = useMemo(
    () => new URLSearchParams(location.search).get('token') || '',
    [location.search],
  );

  const [state, setState] = useState<VerifyState>('verifying');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      if (!token) {
        setState('failed');
        return;
      }
      const result = await verifyEmail(token);
      setState(result.success ? 'success' : 'failed');
      setMessage(result.message || '');
    };
    run();
  }, [token]);

  return (
    <AuthPageShell subtitle={t('auth.verifyEmailTitle')}>
      {state === 'verifying' && (
        <p className="hub-sub py-4 text-center">{t('auth.verifyingEmail')}</p>
      )}

      {state === 'success' && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 size={28} style={{ color: 'var(--hub-ok)' }} />
          <p style={{ fontSize: 14, fontWeight: 500 }}>{t('auth.verifySuccessTitle')}</p>
          <p className="hub-sub">{t('auth.verifySuccessBody')}</p>
          <Link to="/login" className="hub-btn primary justify-center" style={{ marginTop: 8 }}>
            {t('auth.backToLogin')}
          </Link>
        </div>
      )}

      {state === 'failed' && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <AlertCircle size={28} style={{ color: 'oklch(0.45 0.18 25)' }} />
          <p style={{ fontSize: 14, fontWeight: 500 }}>{t('auth.verifyFailedTitle')}</p>
          <p className="hub-sub">{message || t('auth.verifyFailedBody')}</p>
          <Link to="/login" className="hub-btn justify-center" style={{ marginTop: 8 }}>
            {t('auth.backToLogin')}
          </Link>
        </div>
      )}
    </AuthPageShell>
  );
};

export default VerifyEmailPage;
