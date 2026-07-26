import nodemailer, { Transporter } from 'nodemailer';
import { getSystemConfigDao } from '../dao/index.js';
import { EmailConfig } from '../types/index.js';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * EmailService - sends transactional mail (email verification, password reset)
 * using the SMTP settings stored in SystemConfig.email.
 */
export class EmailService {
  private async getEmailConfig(): Promise<EmailConfig | undefined> {
    try {
      const systemConfig = await getSystemConfigDao().get();
      return systemConfig?.email;
    } catch {
      return undefined;
    }
  }

  async isEnabled(): Promise<boolean> {
    const emailConfig = await this.getEmailConfig();
    return Boolean(
      emailConfig?.enabled &&
        emailConfig.host &&
        emailConfig.port &&
        emailConfig.user &&
        emailConfig.password,
    );
  }

  private async createTransporter(): Promise<Transporter | null> {
    const emailConfig = await this.getEmailConfig();

    if (!emailConfig || !emailConfig.enabled) {
      return null;
    }
    if (!emailConfig.host || !emailConfig.port || !emailConfig.user || !emailConfig.password) {
      return null;
    }

    return nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure || false,
      auth: {
        user: emailConfig.user,
        pass: emailConfig.password,
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      const transporter = await this.createTransporter();
      if (!transporter) {
        console.error('[email] transporter unavailable — SMTP not configured or disabled');
        return false;
      }

      const emailConfig = await this.getEmailConfig();
      const fromName = emailConfig?.fromName || 'xiaozhi-mcphub';
      const fromEmail = emailConfig?.fromEmail || emailConfig?.user;

      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject,
        html,
      });
      return true;
    } catch (error) {
      console.error('[email] failed to send:', error);
      return false;
    }
  }

  /** Verify SMTP connectivity with the stored settings. */
  async verifyConfiguration(): Promise<boolean> {
    try {
      const transporter = await this.createTransporter();
      if (!transporter) return false;
      await transporter.verify();
      return true;
    } catch (error) {
      console.error('[email] configuration verify failed:', error);
      return false;
    }
  }

  private async resolveBaseUrl(baseUrl?: string): Promise<string> {
    if (baseUrl) return baseUrl.replace(/\/+$/, '');
    const emailConfig = await this.getEmailConfig();
    return (emailConfig?.baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
  }

  async sendEmailVerificationEmail(
    to: string,
    username: string,
    verificationToken: string,
    language: string = 'zh',
    baseUrl?: string,
  ): Promise<boolean> {
    const base = await this.resolveBaseUrl(baseUrl);
    const verificationUrl = `${base}/verify-email?token=${verificationToken}`;
    const subject = language === 'zh' ? '验证邮箱地址' : 'Verify Email Address';
    const html = this.renderActionEmail({
      language,
      username,
      actionUrl: verificationUrl,
      heading: language === 'zh' ? '验证邮箱地址' : 'Verify your email address',
      intro:
        language === 'zh'
          ? '感谢注册。点击下面的按钮验证你的邮箱地址：'
          : 'Thanks for signing up. Click the button below to verify your email address:',
      buttonText: language === 'zh' ? '验证邮箱' : 'Verify Email',
      expiryNote:
        language === 'zh'
          ? '此链接将在 24 小时后失效；如果你没有注册账号，请忽略此邮件。'
          : 'This link expires in 24 hours. If you did not sign up, please ignore this email.',
    });
    return this.sendEmail(to, subject, html);
  }

  async sendPasswordResetEmail(
    to: string,
    username: string,
    resetToken: string,
    language: string = 'zh',
    baseUrl?: string,
  ): Promise<boolean> {
    const base = await this.resolveBaseUrl(baseUrl);
    const resetUrl = `${base}/reset-password?token=${resetToken}`;
    const subject = language === 'zh' ? '重置密码' : 'Reset Password';
    const html = this.renderActionEmail({
      language,
      username,
      actionUrl: resetUrl,
      heading: language === 'zh' ? '重置密码' : 'Reset your password',
      intro:
        language === 'zh'
          ? '我们收到了你的密码重置请求。点击下面的按钮重置你的密码：'
          : 'We received a request to reset your password. Click the button below to continue:',
      buttonText: language === 'zh' ? '重置密码' : 'Reset Password',
      expiryNote:
        language === 'zh'
          ? '此链接将在 1 小时后失效；如果你没有请求重置密码，请忽略此邮件。'
          : 'This link expires in 1 hour. If you did not request a reset, please ignore this email.',
    });
    return this.sendEmail(to, subject, html);
  }

  async sendTestEmail(to: string, language: string = 'zh'): Promise<boolean> {
    const subject = language === 'zh' ? '测试邮件' : 'Test Email';
    const body =
      language === 'zh'
        ? '这是一封来自 xiaozhi-mcphub 的测试邮件。收到即表示 SMTP 配置正确。'
        : 'This is a test email from xiaozhi-mcphub. Receiving it means your SMTP settings work.';
    return this.sendEmail(
      to,
      subject,
      `<p style="font-family:sans-serif;font-size:14px;color:#333;">${body}</p>`,
    );
  }

  /** Shared minimal template for action emails (verify / reset). */
  private renderActionEmail(input: {
    language: string;
    username: string;
    actionUrl: string;
    heading: string;
    intro: string;
    buttonText: string;
    expiryNote: string;
  }): string {
    const { username, actionUrl, heading, intro, buttonText, expiryNote, language } = input;
    const footer =
      language === 'zh'
        ? '此邮件由 xiaozhi-mcphub 系统自动发送，请勿直接回复。'
        : 'This email was sent automatically by xiaozhi-mcphub. Please do not reply.';
    const greeting = language === 'zh' ? '你好' : 'Hello';
    const linkFallback =
      language === 'zh'
        ? '或者复制以下链接到浏览器：'
        : 'Or copy this link into your browser:';

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#f9fafb;border-radius:8px;padding:30px;">
    <div style="text-align:center;margin-bottom:24px;">
      <h1 style="color:#2563eb;font-size:24px;margin:0;">xiaozhi-mcphub</h1>
    </div>
    <div style="background:#fff;border-radius:6px;padding:25px;">
      <h2 style="margin-top:0;">${heading}</h2>
      <p>${greeting}，<strong>${escapeHtml(username)}</strong>，</p>
      <p>${intro}</p>
      <div style="text-align:center;">
        <a href="${actionUrl}" style="display:inline-block;padding:12px 30px;background:#2563eb;color:#fff !important;text-decoration:none;border-radius:6px;font-weight:500;margin:16px 0;">${buttonText}</a>
      </div>
      <p>${linkFallback}</p>
      <p style="word-break:break-all;color:#2563eb;">${actionUrl}</p>
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px;margin:15px 0;border-radius:4px;">${expiryNote}</div>
    </div>
    <div style="text-align:center;color:#6b7280;font-size:12px;margin-top:16px;">
      <p>${footer}</p>
    </div>
  </div>
</body>
</html>`;
  }
}

let emailServiceInstance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
}
