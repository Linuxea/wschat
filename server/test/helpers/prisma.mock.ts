/**
 * Hand-written PrismaService mock factory.
 *
 * - Each `prisma.<model>.<op>` access returns a STABLE, cached jest.Mock
 *   (same fn for the same model+op across the test) so call assertions work.
 * - `$transaction(fn)` calls `fn(prismaMock)` and returns its result.
 * - `$transaction([arr])` returns `Promise.all(arr)`.
 * - `$queryRaw` / `$executeRaw` are plain jest.fn()s to configure per test.
 */
export function mockPrisma(): any {
  const store = new Map<string, jest.Mock>();
  const modelProxy = (model: string) =>
    new Proxy({} as Record<string, jest.Mock>, {
      get(_t, op: string) {
        if (typeof op !== 'string' || op === 'then' || op === 'catch' || op === 'finally') {
          return undefined;
        }
        const key = `${model}.${op}`;
        let fn = store.get(key);
        if (!fn) {
          fn = jest.fn();
          store.set(key, fn);
        }
        return fn;
      },
    });

  const models = [
    'user',
    'friendship',
    'friendRequest',
    'conversation',
    'conversationMember',
    'message',
    'moment',
    'momentLike',
    'momentComment',
    'notification',
    'callRecord',
    'tag',
    'friendTag',
  ];

  const prisma: any = {};
  for (const m of models) prisma[m] = modelProxy(m);

  prisma.$transaction = jest.fn(async (arg: unknown[] | ((tx: any) => unknown)) => {
    if (typeof arg === 'function') return await arg(prisma);
    return Promise.all(arg as unknown[]);
  });
  prisma.$queryRaw = jest.fn();
  prisma.$executeRaw = jest.fn();

  return prisma;
}

/** Minimal mock for RealtimeService — all methods are jest.fn()s. */
export function mockRealtime(): any {
  return {
    setServer: jest.fn(),
    emitToUser: jest.fn(),
    userRoom: jest.fn((id: string) => `user:${id}`),
    addSocket: jest.fn().mockResolvedValue(1),
    removeSocket: jest.fn().mockResolvedValue(1),
    isOnline: jest.fn().mockResolvedValue(false),
  };
}

/** Minimal mock for EventEmitter2. */
export function mockEvents(): any {
  return { emit: jest.fn() };
}

/** Minimal mock for JwtService. */
export function mockJwt(): any {
  return {
    signAsync: jest.fn().mockResolvedValue('signed-token'),
    verifyAsync: jest.fn(),
  };
}

/** Minimal mock for ConfigService — `get(key, default?)` returns default or mapped value. */
export function mockConfig(overrides: Record<string, unknown> = {}): any {
  return {
    get: jest.fn((key: string, def?: unknown) =>
      key in overrides ? overrides[key] : def,
    ),
    getOrThrow: jest.fn((key: string) => {
      if (key in overrides) return overrides[key];
      throw new Error(`Config "${key}" not defined`);
    }),
  };
}

/** Minimal mock for CryptoService. */
export function mockCrypto(): any {
  const enc = { ciphertext: 'c', iv: 'i', authTag: 'a' };
  return {
    encrypt: jest.fn().mockReturnValue(enc),
    decrypt: jest.fn().mockReturnValue('decrypted'),
  };
}
