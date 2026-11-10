const mockGetRepository = jest.fn();

jest.mock('../connection.js', () => ({
  getAppDataSource: () => ({ getRepository: mockGetRepository }),
}));

import { ActivityRepository } from './ActivityRepository.js';
import { BearerKeyRepository } from './BearerKeyRepository.js';
import { BuiltinPromptRepository } from './BuiltinPromptRepository.js';
import { BuiltinResourceRepository } from './BuiltinResourceRepository.js';
import { EmailVerificationTokenRepository } from './EmailVerificationTokenRepository.js';
import { GroupRepository } from './GroupRepository.js';
import { OAuthClientRepository } from './OAuthClientRepository.js';
import { OAuthTokenRepository } from './OAuthTokenRepository.js';
import { PasswordResetTokenRepository } from './PasswordResetTokenRepository.js';
import { ServerRepository } from './ServerRepository.js';
import { UserConfigRepository } from './UserConfigRepository.js';
import { UserRepository } from './UserRepository.js';
import { XiaozhiConfigRepository } from './XiaozhiConfigRepository.js';
import { XiaozhiEndpointRepository } from './XiaozhiEndpointRepository.js';
import { BaseRepository } from './BaseRepository.js';

type OperationFactory = () => () => Promise<unknown>;

const totalQueries = (repository: Record<string, jest.Mock>): number =>
  Object.values(repository).reduce((sum, fn) => sum + fn.mock.calls.length, 0);

const createRepositoryMocks = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((value: unknown) => value),
  save: jest.fn(async (value: unknown) => value),
  merge: jest.fn((target: unknown, source: unknown) => ({
    ...(target as object),
    ...(source as object),
  })),
  delete: jest.fn().mockResolvedValue({ affected: 0 }),
  update: jest.fn().mockResolvedValue({ affected: 0 }),
  count: jest.fn().mockResolvedValue(0),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
});

describe('repositories after DataSource replacement', () => {
  let currentRepository: ReturnType<typeof createRepositoryMocks>;

  beforeEach(() => {
    jest.clearAllMocks();
    currentRepository = createRepositoryMocks();
    mockGetRepository.mockReturnValue(currentRepository);
  });

  it.each<[string, OperationFactory]>([
    [
      'Activity',
      () => {
        const repo = new ActivityRepository();
        return () => repo.findById('id');
      },
    ],
    [
      'BearerKey',
      () => {
        const repo = new BearerKeyRepository();
        return () => repo.findAll();
      },
    ],
    [
      'BuiltinPrompt',
      () => {
        const repo = new BuiltinPromptRepository();
        return () => repo.findAll();
      },
    ],
    [
      'BuiltinResource',
      () => {
        const repo = new BuiltinResourceRepository();
        return () => repo.findAll();
      },
    ],
    [
      'EmailVerificationToken',
      () => {
        const repo = new EmailVerificationTokenRepository();
        return () => repo.findRecentByUsername('user', new Date(0));
      },
    ],
    [
      'Group',
      () => {
        const repo = new GroupRepository();
        return () => repo.findAll();
      },
    ],
    [
      'OAuthClient',
      () => {
        const repo = new OAuthClientRepository();
        return () => repo.findAll();
      },
    ],
    [
      'OAuthToken',
      () => {
        const repo = new OAuthTokenRepository();
        return () => repo.findAll();
      },
    ],
    [
      'PasswordResetToken',
      () => {
        const repo = new PasswordResetTokenRepository();
        return () => repo.findRecentByUsername('user', new Date(0));
      },
    ],
    [
      'Server',
      () => {
        const repo = new ServerRepository();
        return () => repo.findAll();
      },
    ],
    [
      'UserConfig',
      () => {
        const repo = new UserConfigRepository();
        return () => repo.get('user');
      },
    ],
    [
      'User',
      () => {
        const repo = new UserRepository();
        return () => repo.findAll();
      },
    ],
    [
      'XiaozhiConfig',
      () => {
        const repo = new XiaozhiConfigRepository();
        return () => repo.getConfig();
      },
    ],
    [
      'XiaozhiEndpoint',
      () => {
        const repo = new XiaozhiEndpointRepository();
        return () => repo.findEnabled();
      },
    ],
    [
      'Base',
      () => {
        const repo = new BaseRepository('entity');
        return () => repo.findAll();
      },
    ],
  ])('%s uses the replacement connection', async (_name, createOperation) => {
    // The repository instance is created while the "old" DataSource is current.
    const operation = createOperation();
    await operation();

    const queriesOnOldConnection = totalQueries(currentRepository);
    expect(queriesOnOldConnection).toBe(1);

    // Recovery swaps in a fresh DataSource; the already-constructed repository
    // must query through it instead of the destroyed pool.
    const replacementRepository = createRepositoryMocks();
    mockGetRepository.mockReturnValue(replacementRepository);

    await operation();

    // The stale repository must not receive any further query: everything the
    // already-constructed instance does after the swap goes through the new one.
    expect(totalQueries(currentRepository)).toBe(queriesOnOldConnection);
    expect(totalQueries(replacementRepository)).toBe(1);
  });
});
