import {
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  ChangePasswordCredentials,
} from '../types';
import { apiPost, apiGet } from '../utils/fetchInterceptor';
import { getToken, setToken, removeToken } from '../utils/interceptors';
import { authClient } from './betterAuthClient';

// Export token management functions
export { getToken, setToken, removeToken };

// Login user
export const login = async (credentials: LoginCredentials): Promise<AuthResponse> => {
  try {
    const response = await apiPost<AuthResponse>('/auth/login', credentials);

    // The auth API returns data directly, not wrapped in a data field
    if (response.success && response.token) {
      setToken(response.token);
      return response;
    }

    return {
      success: false,
      message: response.message || 'Login failed',
      code: response.code,
    };
  } catch (error) {
    console.error('Login error', { error });
    return {
      success: false,
      message: error instanceof Error ? error.message : 'An error occurred during login',
    };
  }
};

// Register user
export const register = async (credentials: RegisterCredentials): Promise<AuthResponse> => {
  try {
    const response = await apiPost<AuthResponse>('/auth/register', credentials);

    // Direct login path: backend returns a token when email verification is off
    if (response.success && response.token) {
      setToken(response.token);
      return response;
    }

    // Pending verification path: success without token
    if (response.success) {
      return response;
    }

    return {
      success: false,
      message: response.message || 'Registration failed',
      code: response.code,
    };
  } catch (error) {
    console.error('Register error', { error });
    return {
      success: false,
      message: 'An error occurred during registration',
    };
  }
};

// Verify email with one-time token
export const verifyEmail = async (token: string): Promise<AuthResponse> => {
  try {
    return await apiPost<AuthResponse>('/auth/verify-email', { token });
  } catch (error) {
    console.error('Verify email error', { error });
    return {
      success: false,
      message: 'An error occurred while verifying email',
    };
  }
};

// Request password reset email
export const requestPasswordReset = async (email: string): Promise<AuthResponse> => {
  try {
    return await apiPost<AuthResponse>('/auth/forgot-password', { email });
  } catch (error) {
    console.error('Forgot password error', { error });
    return {
      success: false,
      message: 'An error occurred while requesting password reset',
    };
  }
};

// Preflight check for a reset token
export const verifyResetToken = async (token: string): Promise<AuthResponse> => {
  try {
    return await apiPost<AuthResponse>('/auth/verify-reset-token', { token });
  } catch (error) {
    console.error('Verify reset token error', { error });
    return {
      success: false,
      message: 'An error occurred while verifying reset token',
    };
  }
};

// Consume a reset token and set a new password
export const resetPassword = async (
  token: string,
  newPassword: string,
): Promise<AuthResponse> => {
  try {
    return await apiPost<AuthResponse>('/auth/reset-password', { token, newPassword });
  } catch (error) {
    console.error('Reset password error', { error });
    return {
      success: false,
      message: 'An error occurred while resetting password',
    };
  }
};

// Get current user
export const getCurrentUser = async (): Promise<AuthResponse> => {
  const token = getToken();

  if (!token) {
    return {
      success: false,
      message: 'No authentication token',
    };
  }

  try {
    const response = await apiGet<AuthResponse>('/auth/user');
    return response;
  } catch (error) {
    console.error('Get current user error', { error });
    return {
      success: false,
      message: 'An error occurred while fetching user data',
    };
  }
};

// Get current user via Better Auth session
export const getBetterAuthUser = async (): Promise<AuthResponse> => {
  try {
    const response = await apiGet<AuthResponse>('/better-auth/user');
    return response;
  } catch (error) {
    console.error('Get Better Auth user error', { error });
    return {
      success: false,
      message: 'An error occurred while fetching user data',
    };
  }
};

// Change password
export const changePassword = async (
  credentials: ChangePasswordCredentials,
): Promise<AuthResponse> => {
  const token = getToken();

  if (!token) {
    return {
      success: false,
      message: 'No authentication token',
    };
  }

  try {
    const response = await apiPost<AuthResponse>('/auth/change-password', credentials);
    return response;
  } catch (error) {
    console.error('Change password error', { error });
    return {
      success: false,
      message: 'An error occurred while changing password',
    };
  }
};

// Logout user
export const logout = (): void => {
  removeToken();
  authClient.signOut().catch((error) => {
    console.debug('Better Auth sign out failed', { error });
  });
};
