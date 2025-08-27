import { User } from '../entities/index.js';
import BaseRepository from './BaseRepository.js';

/**
 * Repository for User entity - handles all database operations
 * Extends BaseRepository for common CRUD operations
 */
export class UserRepository extends BaseRepository<User> {
  constructor() {
    super(User);
  }

  /**
   * Find all users, ordered by creation date
   */
  async findAll(): Promise<User[]> {
    return await this.repository.find({
      order: { createdAt: 'DESC' }
    });
  }

  /**
   * Find a user by username
   */
  async findByUsername(username: string): Promise<User | null> {
    return await this.repository.findOne({ where: { username } });
  }

  /**
   * Create a new user
   */
  async create(userData: Partial<User>): Promise<User> {
    const user = this.repository.create(userData);
    return await this.repository.save(user);
  }

  /**
   * Update a user by ID
   */
  async update(id: string, userData: Partial<User>): Promise<User | null> {
    const result = await this.repository.update(id, userData);
    if (result.affected === 0) {
      return null;
    }
    return await this.findById(id);
  }

  /**
   * Update user by username
   */
  async updateByUsername(username: string, userData: Partial<User>): Promise<User | null> {
    const result = await this.repository.update({ username }, userData);
    if (result.affected === 0) {
      return null;
    }
    return await this.findByUsername(username);
  }


  /**
   * Delete a user by username
   */
  async deleteByUsername(username: string): Promise<boolean> {
    const result = await this.repository.delete({ username });
    return result.affected === 1;
  }


  /**
   * Count admin users
   */
  async countAdmins(): Promise<number> {
    return await this.repository.count({ where: { isAdmin: true } });
  }

  /**
   * Check if a username already exists
   */
  async usernameExists(username: string): Promise<boolean> {
    const count = await this.repository.count({ where: { username } });
    return count > 0;
  }

  /**
   * Get all admin users
   */
  async findAllAdmins(): Promise<User[]> {
    return await this.repository.find({
      where: { isAdmin: true },
      order: { createdAt: 'ASC' }
    });
  }

  /**
   * Initialize database with default admin user if no users exist
   */
  async initializeDefaultAdmin(username: string, hashedPassword: string): Promise<User | null> {
    const userCount = await this.count();
    if (userCount === 0) {
      return await this.create({
        username,
        password: hashedPassword,
        isAdmin: true
      });
    }
    return null;
  }
}

// Singleton instance
let userRepositoryInstance: UserRepository | null = null;

export function getUserRepository(): UserRepository {
  if (!userRepositoryInstance) {
    userRepositoryInstance = new UserRepository();
  }
  return userRepositoryInstance;
}

export default UserRepository;