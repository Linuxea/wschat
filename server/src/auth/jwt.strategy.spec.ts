import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { mockPrisma, mockConfig } from '../../test/helpers/prisma.mock';

describe('JwtStrategy.validate', () => {
  let strategy: JwtStrategy;
  let prisma: any;

  beforeEach(() => {
    prisma = mockPrisma();
    const config = mockConfig({ JWT_SECRET: 'test-secret' });
    strategy = new JwtStrategy(config, prisma);
  });

  it('throws "Invalid token type" when payload.t !== "a"', async () => {
    await expect(
      strategy.validate({ sub: 'u1', username: 'a', ver: 0, t: 'r' } as any),
    ).rejects.toThrow('Invalid token type');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws "User not found" when user missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      strategy.validate({ sub: 'u1', username: 'a', ver: 0, t: 'a' } as any),
    ).rejects.toThrow('User not found');
  });

  it('throws "Token revoked" when tokenVersion differs', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'a', tokenVersion: 5 });
    await expect(
      strategy.validate({ sub: 'u1', username: 'a', ver: 0, t: 'a' } as any),
    ).rejects.toThrow('Token revoked');
  });

  it('returns { id, username } on success (the value Nest attaches to req.user)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'alice', tokenVersion: 3 });
    await expect(
      strategy.validate({ sub: 'u1', username: 'alice', ver: 3, t: 'a' } as any),
    ).resolves.toEqual({ id: 'u1', username: 'alice' });
  });

  it('queries the user by payload.sub with id/username/tokenVersion select', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'a', tokenVersion: 0 });
    await strategy.validate({ sub: 'u9', username: 'a', ver: 0, t: 'a' } as any);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u9' },
      select: { id: true, username: true, tokenVersion: true },
    });
  });
});
