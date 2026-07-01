import {
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { mockPrisma, mockJwt, mockConfig } from '../../test/helpers/prisma.mock';

function publicUser(over: Partial<any> = {}) {
  return {
    id: 'u1',
    username: 'alice',
    nickname: 'Alice',
    avatar: null,
    bio: null,
    passwordHash: 'hash',
    securityQuestion: 'q?',
    securityAnswerHash: 'ahash',
    tokenVersion: 0,
    ...over,
  };
}

describe('AuthService', () => {
  let svc: AuthService;
  let prisma: any;
  let jwt: any;
  let config: any;

  beforeEach(() => {
    prisma = mockPrisma();
    jwt = mockJwt();
    config = mockConfig({
      JWT_ACCESS_EXPIRES: '15m',
      JWT_REFRESH_EXPIRES: '7d',
    });
    svc = new AuthService(prisma, jwt, config);
  });

  // -------- register --------
  describe('register', () => {
    const dto = {
      username: 'alice',
      password: 'secret123',
      nickname: 'Alice',
      securityQuestion: 'pet?',
      securityAnswer: '  Yes ',
    };

    it('throws ConflictException when username already taken', async () => {
      prisma.user.findUnique.mockResolvedValue(publicUser());
      await expect(svc.register(dto)).rejects.toBeInstanceOf(ConflictException);
      await expect(svc.register(dto)).rejects.toThrow('username already taken');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('hashes the password with bcrypt and stores passwordHash (not plaintext)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...publicUser(), ...data, tokenVersion: 0 }),
      );
      const r = await svc.register(dto);
      const createdArg = prisma.user.create.mock.calls[0][0].data;
      expect(createdArg.passwordHash).not.toBe(dto.password);
      expect(await bcrypt.compare(dto.password, createdArg.passwordHash)).toBe(true);
      expect(r.user).not.toHaveProperty('passwordHash');
    });

    it('normalizes securityAnswer with trim().toLowerCase() before hashing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...publicUser(), ...data }),
      );
      await svc.register({ ...dto, securityAnswer: '  Yes ' });
      const storedHash = prisma.user.create.mock.calls[0][0].data.securityAnswerHash;
      // the normalized form "yes" must compare true; "  Yes " itself was NOT stored
      expect(await bcrypt.compare('yes', storedHash)).toBe(true);
      // a different casing/whitespace variant also compares true (proves normalization)
      expect(await bcrypt.compare('  YES ', storedHash)).toBe(false); // raw compare fails
    });

    it('returns { accessToken, refreshToken, user } with toPublic shape (no sensitive fields)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...publicUser(), ...data }),
      );
      const r = await svc.register(dto);
      expect(r).toHaveProperty('accessToken');
      expect(r).toHaveProperty('refreshToken');
      expect(Object.keys(r.user).sort()).toEqual(
        ['avatar', 'bio', 'id', 'nickname', 'username'].sort(),
      );
    });

    it('issues access (t:"a") and refresh (t:"r") tokens carrying sub/username/ver', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...publicUser(), ...data, tokenVersion: 3 }),
      );
      await svc.register(dto);
      const calls = jwt.signAsync.mock.calls;
      // first call: access
      expect(calls[0][0]).toMatchObject({ sub: 'u1', username: 'alice', ver: 3, t: 'a' });
      expect(calls[0][1]).toMatchObject({ expiresIn: '15m' });
      // second call: refresh
      expect(calls[1][0]).toMatchObject({ sub: 'u1', username: 'alice', ver: 3, t: 'r' });
      expect(calls[1][1]).toMatchObject({ expiresIn: '7d' });
    });
  });

  // -------- login --------
  describe('login', () => {
    const dto = { username: 'alice', password: 'secret123' };

    it('throws UnauthorizedException("invalid credentials") when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(svc.login(dto)).rejects.toThrow('invalid credentials');
    });

    it('throws the SAME message for wrong password (no user-existence leak)', async () => {
      const hash = await bcrypt.hash('secret123', 10);
      prisma.user.findUnique.mockResolvedValue(publicUser({ passwordHash: hash }));
      const err = await svc.login({ ...dto, password: 'wrong' }).catch((e) => e);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err.message).toBe('invalid credentials');
    });

    it('issues tokens on correct password', async () => {
      const hash = await bcrypt.hash('secret123', 10);
      prisma.user.findUnique.mockResolvedValue(publicUser({ passwordHash: hash, tokenVersion: 2 }));
      const r = await svc.login(dto);
      expect(r.accessToken).toBe('signed-token');
      expect(jwt.signAsync).toHaveBeenCalledTimes(2);
      expect(jwt.signAsync.mock.calls[0][0]).toMatchObject({ t: 'a', ver: 2 });
    });
  });

  // -------- getSecurityQuestion --------
  describe('getSecurityQuestion', () => {
    it('throws NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(svc.getSecurityQuestion('ghost')).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.getSecurityQuestion('ghost')).rejects.toThrow('user not found');
    });

    it('returns { securityQuestion }', async () => {
      prisma.user.findUnique.mockResolvedValue({ securityQuestion: 'pet?' });
      await expect(svc.getSecurityQuestion('alice')).resolves.toEqual({ securityQuestion: 'pet?' });
    });
  });

  // -------- resetPassword --------
  describe('resetPassword', () => {
    const dto = { username: 'alice', securityAnswer: 'yes', newPassword: 'newpass123' };

    it('throws NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(svc.resetPassword(dto)).rejects.toThrow('user not found');
    });

    it('throws BadRequestException when security answer is incorrect', async () => {
      const answerHash = await bcrypt.hash('yes', 10);
      prisma.user.findUnique.mockResolvedValue(publicUser({ securityAnswerHash: answerHash }));
      await expect(
        svc.resetPassword({ ...dto, securityAnswer: 'no' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.resetPassword({ ...dto, securityAnswer: 'no' })).rejects.toThrow(
        'security answer is incorrect',
      );
    });

    it('normalizes the provided answer with trim().toLowerCase() before compare', async () => {
      const answerHash = await bcrypt.hash('yes', 10);
      prisma.user.findUnique.mockResolvedValue(publicUser({ securityAnswerHash: answerHash }));
      await svc.resetPassword({ ...dto, securityAnswer: '  YES ' }); // raw would NOT match
      // succeeds only because service normalizes -> "yes" matches the stored "yes" hash
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('updates passwordHash AND increments tokenVersion (revokes all tokens)', async () => {
      const answerHash = await bcrypt.hash('yes', 10);
      prisma.user.findUnique.mockResolvedValue(publicUser({ securityAnswerHash: answerHash }));
      await svc.resetPassword(dto);
      const arg = prisma.user.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'u1' });
      expect(arg.data).toHaveProperty('passwordHash');
      expect(arg.data.passwordHash).not.toBe(dto.newPassword);
      expect(await bcrypt.compare(dto.newPassword, arg.data.passwordHash)).toBe(true);
      expect(arg.data.tokenVersion).toEqual({ increment: 1 });
    });

    it('returns { ok: true }', async () => {
      const answerHash = await bcrypt.hash('yes', 10);
      prisma.user.findUnique.mockResolvedValue(publicUser({ securityAnswerHash: answerHash }));
      await expect(svc.resetPassword(dto)).resolves.toEqual({ ok: true });
    });
  });

  // -------- refresh --------
  describe('refresh', () => {
    it('throws "invalid refresh token" when jwt.verifyAsync rejects', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('bad sig'));
      await expect(svc.refresh('garbage')).rejects.toThrow('invalid refresh token');
    });

    it('throws "not a refresh token" when payload.t !== "r"', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', username: 'a', ver: 0, t: 'a' });
      await expect(svc.refresh('tok')).rejects.toThrow('not a refresh token');
    });

    it('throws "user not found" when user missing', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', username: 'a', ver: 0, t: 'r' });
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(svc.refresh('tok')).rejects.toThrow('user not found');
    });

    it('throws "token revoked" when tokenVersion differs', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', username: 'a', ver: 0, t: 'r' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'a', tokenVersion: 5, nickname: 'n', avatar: null, bio: null });
      await expect(svc.refresh('tok')).rejects.toThrow('token revoked');
    });

    it('re-issues tokens with the CURRENT tokenVersion on success', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1', username: 'a', ver: 5, t: 'r' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'a', tokenVersion: 5, nickname: 'n', avatar: null, bio: null });
      const r = await svc.refresh('tok');
      expect(r.accessToken).toBe('signed-token');
      expect(jwt.signAsync.mock.calls[0][0]).toMatchObject({ sub: 'u1', ver: 5, t: 'a' });
      expect(jwt.signAsync.mock.calls[1][0]).toMatchObject({ sub: 'u1', ver: 5, t: 'r' });
    });
  });
});
