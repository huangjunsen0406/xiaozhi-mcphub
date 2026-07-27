import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { IUser } from '../types/index.js';
import { getUserDao } from '../dao/index.js';

const isDuplicateUserError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as {
    code?: string;
    message?: string;
    driverError?: { code?: string; detail?: string; message?: string };
  };

  if (err.code === '23505' || err.driverError?.code === '23505') {
    return true;
  }

  const message = `${err.message || ''} ${err.driverError?.message || ''} ${
    err.driverError?.detail || ''
  }`
    .toLowerCase()
    .trim();

  return message.includes('already exists') || message.includes('duplicate');
};

// Get all users
export const getUsers = async (): Promise<IUser[]> => {
  try {
    const userDao = getUserDao();
    return await userDao.findAll();
  } catch (error) {
    console.error('Error reading users:', error);
    return [];
  }
};

// Create a new user
export const createUser = async (userData: IUser): Promise<IUser | null> => {
  try {
    const userDao = getUserDao();
    return await userDao.createWithHashedPassword(
      userData.username,
      userData.password,
      userData.isAdmin,
      userData.email ?? undefined,
      userData.ssoUserId ?? undefined,
    );
  } catch (error) {
    if (!isDuplicateUserError(error)) {
      console.error('Error creating user:', error);
    }
    return null;
  }
};

// Find user by username
export const findUserByUsername = async (username: string): Promise<IUser | undefined> => {
  try {
    const userDao = getUserDao();
    const user = await userDao.findByUsername(username);
    return user || undefined;
  } catch (error) {
    console.error('Error finding user:', error);
    return undefined;
  }
};

// Find user by email
export const findUserByEmail = async (email: string): Promise<IUser | undefined> => {
  try {
    const userDao = getUserDao();
    const user = await userDao.findByEmail(email);
    return user || undefined;
  } catch (error) {
    console.error('Error finding user by email:', error);
    return undefined;
  }
};

// Find user by SSO user ID (Better Auth user.id, stable across email changes)
export const findUserBySsoUserId = async (ssoUserId: string): Promise<IUser | undefined> => {
  try {
    const userDao = getUserDao();
    const user = await userDao.findBySsoUserId(ssoUserId);
    return user || undefined;
  } catch (error) {
    console.error('Error finding user by ssoUserId:', error);
    return undefined;
  }
};

// Verify user password
export const verifyPassword = async (
  plainPassword: string,
  hashedPassword: string,
): Promise<boolean> => {
  return await bcrypt.compare(plainPassword, hashedPassword);
};

// Update user password
export const updateUserPassword = async (
  username: string,
  newPassword: string,
): Promise<boolean> => {
  try {
    const userDao = getUserDao();
    return await userDao.updatePassword(username, newPassword);
  } catch (error) {
    console.error('Error updating password:', error);
    return false;
  }
};

// Mark a user's email as verified
export const verifyUserEmail = async (username: string): Promise<boolean> => {
  try {
    const userDao = getUserDao();
    const result = await userDao.update(username, { emailVerified: true });
    return result !== null;
  } catch (error) {
    console.error('Error verifying user email:', error);
    return false;
  }
};

// Partial update helper for user fields (email, flags, etc.)
export const updateUserFields = async (
  username: string,
  fields: Partial<IUser>,
): Promise<IUser | null> => {
  try {
    const userDao = getUserDao();
    return await userDao.update(username, fields);
  } catch (error) {
    console.error('Error updating user fields:', error);
    return null;
  }
};

/**
 * Generate a cryptographically random password.
 * The result is a 24-character base64url string (≈ 144 bits of entropy).
 */
const generateRandomPassword = (): string => {
  return crypto.randomBytes(18).toString('base64url');
};

// Initialize with default admin user if no users exist
export const initializeDefaultUser = async (): Promise<void> => {
  const userDao = getUserDao();
  const users = await userDao.findAll();

  if (users.length > 0) {
    // Existing installs (including v1.0.3 Postgres `users` rows) keep their
    // hashed passwords as-is. Never overwrite admin when the table is non-empty.
    const hasAdmin = users.some((user) => user.username === 'admin');
    console.log(
      `User store already has ${users.length} account(s)` +
        (hasAdmin
          ? '; reusing existing admin credentials (not regenerating password)'
          : ' (no admin username — not auto-creating one because the store is non-empty)'),
    );
    return;
  }

  const createDefaultAdmin = async (password: string): Promise<void> => {
    await userDao.createWithHashedPassword('admin', password, true);
    console.log('Default admin user created');
  };

  const adminPasswordFromEnv = process.env.ADMIN_PASSWORD;
  if (adminPasswordFromEnv) {
    await createDefaultAdmin(adminPasswordFromEnv);
    return;
  }

  if (process.env.NODE_ENV === 'development') {
    await createDefaultAdmin('admin123');
    console.log('Using development admin password: admin123');
    return;
  }

  const generatedPassword = generateRandomPassword();
  await createDefaultAdmin(generatedPassword);
  console.log('========================================');
  console.log('  Generated admin password: ' + generatedPassword);
  console.log('  Please change this password after first login.');
  console.log(
    '  Note: this only runs on an empty user store. If you upgraded from v1.0.3',
  );
  console.log(
    '  and expected your old password, reconnect DB_URL to the original Postgres',
  );
  console.log('  volume — the legacy admin hash lives in the users table.');
  console.log('========================================');
};
