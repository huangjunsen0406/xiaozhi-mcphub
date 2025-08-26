import bcrypt from 'bcryptjs';
import { User } from '../db/entities/User.js';
import { UserRepository, getUserRepository } from '../db/repositories/UserRepository.js';

/**
 * UserService - Business logic layer for user management
 * Handles user operations with proper validation and business rules
 */
export class UserService {
  private userRepository: UserRepository;

  constructor(userRepository?: UserRepository) {
    this.userRepository = userRepository || getUserRepository();
  }

  /**
   * Get all users (without passwords)
   */
  async getAllUsers(): Promise<Omit<User, 'password'>[]> {
    const users = await this.userRepository.findAll();
    return users.map(({ password: _password, ...user }) => user);
  }

  /**
   * Get user by username (without password)
   */
  async getUserByUsername(username: string): Promise<Omit<User, 'password'> | null> {
    const user = await this.userRepository.findByUsername(username);
    if (!user) return null;
    
    const { password: _password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Get user by username (with password for auth)
   */
  async getUserByUsernameWithPassword(username: string): Promise<User | null> {
    return await this.userRepository.findByUsername(username);
  }

  /**
   * Create a new user
   */
  async createUser(username: string, plainPassword: string, isAdmin: boolean = false): Promise<Omit<User, 'password'> | null> {
    try {
      // Check if username already exists
      const exists = await this.userRepository.usernameExists(username);
      if (exists) {
        return null;
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(plainPassword, salt);

      // Create user
      const user = await this.userRepository.create({
        username,
        password: hashedPassword,
        isAdmin
      });

      const { password: _password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      console.error('Failed to create user:', error);
      throw error;
    }
  }

  /**
   * Update user information
   */
  async updateUser(
    username: string,
    data: { isAdmin?: boolean; newPassword?: string }
  ): Promise<Omit<User, 'password'> | null> {
    try {
      const user = await this.userRepository.findByUsername(username);
      if (!user) {
        return null;
      }

      const updateData: Partial<User> = {};

      // Update admin status if provided
      if (data.isAdmin !== undefined) {
        // Check if this is the last admin
        if (user.isAdmin && !data.isAdmin) {
          const adminCount = await this.userRepository.countAdmins();
          if (adminCount === 1) {
            throw new Error('Cannot remove admin status from the last admin user');
          }
        }
        updateData.isAdmin = data.isAdmin;
      }

      // Update password if provided
      if (data.newPassword) {
        const salt = await bcrypt.genSalt(10);
        updateData.password = await bcrypt.hash(data.newPassword, salt);
      }

      // Update user
      const updatedUser = await this.userRepository.updateByUsername(username, updateData);
      if (!updatedUser) {
        return null;
      }

      const { password: _password, ...userWithoutPassword } = updatedUser;
      return userWithoutPassword;
    } catch (error) {
      console.error('Failed to update user:', error);
      throw error;
    }
  }

  /**
   * Delete a user
   */
  async deleteUser(username: string): Promise<boolean> {
    try {
      const user = await this.userRepository.findByUsername(username);
      if (!user) {
        return false;
      }

      // Check if this is the last admin
      if (user.isAdmin) {
        const adminCount = await this.userRepository.countAdmins();
        if (adminCount === 1) {
          throw new Error('Cannot delete the last admin user');
        }
      }

      return await this.userRepository.deleteByUsername(username);
    } catch (error) {
      console.error('Failed to delete user:', error);
      throw error;
    }
  }

  /**
   * Verify user password
   */
  async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Update user password
   */
  async updateUserPassword(username: string, newPassword: string): Promise<boolean> {
    try {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      const updated = await this.userRepository.updateByUsername(username, {
        password: hashedPassword,
        updatedAt: new Date()
      });

      return updated !== null;
    } catch (error) {
      console.error('Failed to update password:', error);
      return false;
    }
  }

  /**
   * Check if user is admin
   */
  async isUserAdmin(username: string): Promise<boolean> {
    const user = await this.userRepository.findByUsername(username);
    return user?.isAdmin || false;
  }

  /**
   * Get user count
   */
  async getUserCount(): Promise<number> {
    return await this.userRepository.count();
  }

  /**
   * Get admin count
   */
  async getAdminCount(): Promise<number> {
    return await this.userRepository.countAdmins();
  }

  /**
   * Initialize default admin user if no users exist
   */
  async initializeDefaultAdmin(): Promise<void> {
    const userCount = await this.userRepository.count();
    if (userCount === 0) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);
      
      const admin = await this.userRepository.initializeDefaultAdmin('admin', hashedPassword);
      if (admin) {
        console.log('Default admin user created (username: admin, password: admin123)');
      }
    }
  }
}

// Singleton instance
let userServiceInstance: UserService | null = null;

export function getUserService(): UserService {
  if (!userServiceInstance) {
    userServiceInstance = new UserService();
  }
  return userServiceInstance;
}

// Export convenience functions for backward compatibility
// Use lazy initialization to avoid creating service before database is ready

export const getAllUsers = () => getUserService().getAllUsers();
export const getUserByUsername = (username: string) => getUserService().getUserByUsername(username);
export const createNewUser = (username: string, password: string, isAdmin?: boolean) => 
  getUserService().createUser(username, password, isAdmin);
export const updateUser = (username: string, data: { isAdmin?: boolean; newPassword?: string }) => 
  getUserService().updateUser(username, data);
export const deleteUser = (username: string) => getUserService().deleteUser(username);
export const isUserAdmin = (username: string) => getUserService().isUserAdmin(username);
export const getUserCount = () => getUserService().getUserCount();
export const getAdminCount = () => getUserService().getAdminCount();
