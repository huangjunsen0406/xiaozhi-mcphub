import { Request, Response } from 'express';
import { getEmailService } from '../services/emailService.js';

/**
 * Send a test email to confirm the stored SMTP settings work. Admin only.
 */
export const sendTestEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user?.isAdmin) {
      res.status(403).json({ success: false, message: 'Admin privileges required' });
      return;
    }

    const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
    if (!email) {
      res.status(400).json({ success: false, message: 'Email is required' });
      return;
    }

    const emailService = getEmailService();
    if (!(await emailService.isEnabled())) {
      res.status(400).json({
        success: false,
        message: 'Email service is not enabled or SMTP settings are incomplete',
      });
      return;
    }

    const language = req.headers['accept-language']?.toString().toLowerCase().startsWith('en')
      ? 'en'
      : 'zh';
    const sent = await emailService.sendTestEmail(email, language);

    if (!sent) {
      res.status(500).json({
        success: false,
        message: 'Failed to send test email. Check SMTP settings and backend logs.',
      });
      return;
    }

    res.json({ success: true, message: 'Test email sent' });
  } catch (error) {
    console.error('Send test email error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
