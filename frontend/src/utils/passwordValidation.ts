/**
 * Frontend password strength validation utility.
 * Must stay in sync with src/utils/passwordValidation.ts (stable error codes).
 */

export type PasswordStrengthErrorCode =
  | 'passwordMinLength'
  | 'passwordRequireLetter'
  | 'passwordRequireNumber'
  | 'passwordRequireSpecial';

export interface PasswordValidationResult {
  isValid: boolean;
  /** Stable codes mapped via t(`auth.${code}`) */
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
