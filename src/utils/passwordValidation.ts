/**
 * Password strength validation utility.
 * Returns stable error codes (not localized strings) so callers can translate
 * with i18n. Keep in sync with frontend/src/utils/passwordValidation.ts.
 *
 * Requirements:
 * - At least 8 characters
 * - Contains at least one letter
 * - Contains at least one number
 * - Contains at least one special character
 */

export type PasswordStrengthErrorCode =
  | 'passwordMinLength'
  | 'passwordRequireLetter'
  | 'passwordRequireNumber'
  | 'passwordRequireSpecial';

export interface PasswordValidationResult {
  isValid: boolean;
  /** Stable codes mapped to auth.* i18n keys on both client and server */
  errors: PasswordStrengthErrorCode[];
}

export const validatePasswordStrength = (password: string): PasswordValidationResult => {
  const errors: PasswordStrengthErrorCode[] = [];

  if (password.length < 8) {
    errors.push('passwordMinLength');
  }

  if (!/[a-zA-Z]/.test(password)) {
    errors.push('passwordRequireLetter');
  }

  if (!/\d/.test(password)) {
    errors.push('passwordRequireNumber');
  }

  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('passwordRequireSpecial');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Check if a password is the default password (admin123)
 */
export const isDefaultPassword = (plainPassword: string): boolean => {
  return plainPassword === 'admin123';
};
