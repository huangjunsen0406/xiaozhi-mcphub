import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import {
  findUserByUsername,
  findUserByEmail,
  verifyPassword,
  createUser,
  updateUserPassword,
  verifyUserEmail,
} from '../models/User.js';
import { getDataService } from '../services/services.js';
import { DataService } from '../services/dataService.js';
import { JWT_SECRET } from '../config/jwt.js';
import { validatePasswordStrength, isDefaultPassword } from '../utils/passwordValidation.js';
import { getPackageVersion } from '../utils/version.js';
import { getSystemConfigDao } from '../dao/index.js';
import { getEmailService } from '../services/emailService.js';
import {
  getEmailVerificationTokenRepository,
  getPasswordResetTokenRepository,
} from '../db/repositories/index.js';

const dataService: DataService = getDataService();

const TOKEN_EXPIRY = '24h';
const RESET_RATE_LIMIT = 3;
const RESET_RATE_WINDOW_MS = 15 * 60 * 1000;

const resolveLanguage = (req: Request): string =>
  req.headers['accept-language']?.toString().toLowerCase().startsWith('en') ? 'en' : 'zh';

const resolveBaseUrl = async (req: Request): Promise<string> => {
  try {
    const systemConfig = await getSystemConfigDao().get();
    if (systemConfig?.email?.baseUrl) {
      return systemConfig.email.baseUrl.replace(/\/+$/, '');
    }
  } catch {
    // fall through to request-derived URL
  }
  return `${req.protocol}://${req.get('host')}`;
};

// Login user
export const login = async (req: Request, res: Response): Promise<void> => {
  // Get translation function from request
  const t = (req as any).t;

  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: t('api.errors.validation_failed'),
      errors: errors.array(),
    });
    return;
  }

  const { username, password } = req.body;

  try {
    // Find user by username
    const user = await findUserByUsername(username);

    if (!user) {
      res.status(401).json({
        success: false,
        message: t('api.errors.invalid_credentials'),
      });
      return;
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password);

    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: t('api.errors.invalid_credentials'),
      });
      return;
    }

    // When email service is enabled, require verified email for non-admin users
    const emailService = getEmailService();
    if ((await emailService.isEnabled()) && user.email && !user.emailVerified && !user.isAdmin) {
      res.status(403).json({
        success: false,
        message: t('api.errors.emailNotVerified') || 'Email not verified',
        code: 'EMAIL_NOT_VERIFIED',
      });
      return;
    }

    // Generate JWT token
    const payload = {
      user: {
        username: user.username,
        isAdmin: user.isAdmin || false,
      },
    };

    // Check if user is admin with default password
    const version = getPackageVersion();
    const isUsingDefaultPassword =
      user.username === 'admin' && user.isAdmin && isDefaultPassword(password) && version !== 'dev';

    jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY }, (err, token) => {
      if (err) throw err;
      res.json({
        success: true,
        message: t('api.success.login_successful'),
        token,
        user: {
          username: user.username,
          isAdmin: user.isAdmin,
          permissions: dataService.getPermissions(user),
        },
        isUsingDefaultPassword,
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: t('api.errors.server_error'),
    });
  }
};

// Register new user
export const register = async (req: Request, res: Response): Promise<void> => {
  // Get translation function from request
  const t = (req as any).t;

  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: t('api.errors.validation_failed'),
      errors: errors.array(),
    });
    return;
  }

  const { username, password, email } = req.body;
  const normalizedEmail =
    typeof email === 'string' && email.trim().length > 0 ? email.trim().toLowerCase() : undefined;

  try {
    const emailService = getEmailService();
    const emailEnabled = await emailService.isEnabled();

    // When SMTP is enabled, require an email address
    if (emailEnabled && !normalizedEmail) {
      res.status(400).json({
        success: false,
        message: t('api.errors.emailRequired') || 'Email is required',
      });
      return;
    }

    if (normalizedEmail) {
      const existingByEmail = await findUserByEmail(normalizedEmail);
      if (existingByEmail) {
        res.status(400).json({
          success: false,
          message: t('api.errors.emailAlreadyUsed') || 'Email already in use',
        });
        return;
      }
    }

    // Create new user. When email verification is required, leave emailVerified=false.
    const newUser = await createUser({
      username,
      password,
      isAdmin: false,
      email: normalizedEmail,
      emailVerified: emailEnabled && normalizedEmail ? false : true,
    });

    if (!newUser) {
      res.status(400).json({
        success: false,
        message: t('api.errors.userExists') || 'User already exists',
      });
      return;
    }

    // Send verification email when SMTP is configured
    if (emailEnabled && normalizedEmail) {
      const language = resolveLanguage(req);
      const baseUrl = await resolveBaseUrl(req);
      const tokenRepo = getEmailVerificationTokenRepository();
      const { token } = await tokenRepo.createToken(newUser.username);
      const sent = await emailService.sendEmailVerificationEmail(
        normalizedEmail,
        newUser.username,
        token,
        language,
        baseUrl,
      );

      if (!sent) {
        console.warn('[auth] failed to send verification email for', newUser.username);
      }

      res.json({
        success: true,
        message:
          t('api.success.registrationPendingVerification') ||
          'Registration successful. Please verify your email before logging in.',
        emailVerificationRequired: true,
      });
      return;
    }

    // Email service off → log the user in immediately
    const payload = {
      user: {
        username: newUser.username,
        isAdmin: newUser.isAdmin || false,
      },
    };

    jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY }, (err, token) => {
      if (err) throw err;
      res.json({
        success: true,
        token,
        user: {
          username: newUser.username,
          isAdmin: newUser.isAdmin,
          permissions: dataService.getPermissions(newUser),
        },
      });
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get current user
export const getCurrentUser = (req: Request, res: Response): void => {
  try {
    // User is already attached to request by auth middleware
    const user = (req as any).user;

    res.json({
      success: true,
      user: {
        username: user.username,
        isAdmin: user.isAdmin,
        permissions: dataService.getPermissions(user),
      },
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Change password
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }

  const { currentPassword, newPassword } = req.body;
  const username = (req as any).user.username;

  try {
    // Validate new password strength
    const validationResult = validatePasswordStrength(newPassword);
    if (!validationResult.isValid) {
      res.status(400).json({
        success: false,
        message: 'Password does not meet security requirements',
        errors: validationResult.errors,
      });
      return;
    }

    // Find user by username
    const user = await findUserByUsername(username);

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Verify current password
    const isPasswordValid = await verifyPassword(currentPassword, user.password);

    if (!isPasswordValid) {
      res.status(401).json({ success: false, message: 'Current password is incorrect' });
      return;
    }

    // Update the password
    const updated = await updateUserPassword(username, newPassword);

    if (!updated) {
      res.status(500).json({ success: false, message: 'Failed to update password' });
      return;
    }

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Verify email via one-time token
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  const t = (req as any).t;

  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      res.status(400).json({
        success: false,
        message: t('api.errors.tokenRequired') || 'Token is required',
      });
      return;
    }

    const tokenRepo = getEmailVerificationTokenRepository();
    const result = await tokenRepo.verifyToken(token);

    if (!result.valid || !result.username) {
      res.status(400).json({
        success: false,
        message: t('api.errors.invalidOrExpiredToken') || 'Invalid or expired token',
      });
      return;
    }

    const ok = await verifyUserEmail(result.username);
    if (!ok) {
      res.status(500).json({
        success: false,
        message: t('api.errors.server_error') || 'Failed to verify email',
      });
      return;
    }

    res.json({
      success: true,
      message: t('api.success.emailVerified') || 'Email verified successfully',
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({
      success: false,
      message: t('api.errors.server_error') || 'Server error',
    });
  }
};

// Request password reset email
export const requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
  const t = (req as any).t;

  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email) {
      res.status(400).json({
        success: false,
        message: t('api.errors.emailRequired') || 'Email is required',
      });
      return;
    }

    const emailService = getEmailService();
    if (!(await emailService.isEnabled())) {
      res.status(400).json({
        success: false,
        message: t('api.errors.emailServiceDisabled') || 'Email service is not enabled',
      });
      return;
    }

    // Always return a generic success to avoid email enumeration
    const genericSuccess = {
      success: true,
      message:
        t('api.success.passwordResetEmailSent') ||
        'If the email exists, a reset link has been sent.',
    };

    const user = await findUserByEmail(email);
    if (!user) {
      res.json(genericSuccess);
      return;
    }

    // Per-user rate limit
    const tokenRepo = getPasswordResetTokenRepository();
    const since = new Date(Date.now() - RESET_RATE_WINDOW_MS);
    const recent = await tokenRepo.findRecentByUsername(user.username, since);
    if (recent.length >= RESET_RATE_LIMIT) {
      res.status(429).json({
        success: false,
        message: t('api.errors.tooManyRequests') || 'Too many reset requests. Please try again later.',
      });
      return;
    }

    const { token } = await tokenRepo.createToken(user.username);
    const language = resolveLanguage(req);
    const baseUrl = await resolveBaseUrl(req);
    const sent = await emailService.sendPasswordResetEmail(
      email,
      user.username,
      token,
      language,
      baseUrl,
    );

    if (!sent) {
      res.status(500).json({
        success: false,
        message: t('api.errors.emailSendFailed') || 'Failed to send reset email',
      });
      return;
    }

    res.json(genericSuccess);
  } catch (error) {
    console.error('Request password reset error:', error);
    res.status(500).json({
      success: false,
      message: t('api.errors.server_error') || 'Server error',
    });
  }
};

// Preflight check for a reset token (used by the reset-password page)
export const verifyResetToken = async (req: Request, res: Response): Promise<void> => {
  const t = (req as any).t;

  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      res.status(400).json({
        success: false,
        message: t('api.errors.tokenRequired') || 'Token is required',
      });
      return;
    }

    const tokenRepo = getPasswordResetTokenRepository();
    const result = await tokenRepo.verifyToken(token);
    res.json({
      success: result.valid,
      message: result.valid
        ? t('api.success.tokenValid') || 'Token is valid'
        : t('api.errors.invalidToken') || 'Invalid or expired token',
    });
  } catch (error) {
    console.error('Verify reset token error:', error);
    res.status(500).json({
      success: false,
      message: t('api.errors.server_error') || 'Server error',
    });
  }
};

// Consume a reset token and set a new password
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const t = (req as any).t;

  try {
    const { token, newPassword } = req.body;
    if (!token || typeof token !== 'string' || !newPassword || typeof newPassword !== 'string') {
      res.status(400).json({
        success: false,
        message: t('api.errors.tokenAndPasswordRequired') || 'Token and new password are required',
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: t('users.passwordTooShort') || 'Password must be at least 6 characters',
      });
      return;
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.isValid) {
      res.status(400).json({
        success: false,
        message: 'Password does not meet security requirements',
        errors: strength.errors,
      });
      return;
    }

    const tokenRepo = getPasswordResetTokenRepository();
    const result = await tokenRepo.consumeToken(token);
    if (!result.valid || !result.username) {
      res.status(400).json({
        success: false,
        message: t('api.errors.invalidOrExpiredToken') || 'Invalid or expired token',
      });
      return;
    }

    const updated = await updateUserPassword(result.username, newPassword);
    if (!updated) {
      res.status(500).json({
        success: false,
        message: t('api.errors.server_error') || 'Failed to update password',
      });
      return;
    }

    res.json({
      success: true,
      message: t('api.success.passwordResetSuccess') || 'Password reset successfully',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: t('api.errors.server_error') || 'Server error',
    });
  }
};
