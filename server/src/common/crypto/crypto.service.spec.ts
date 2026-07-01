import { createCipheriv, randomBytes } from 'crypto';
import { CryptoService } from './crypto.service';

const KEY = Buffer.alloc(32, 7); // deterministic 32-byte key

describe('CryptoService (pure logic)', () => {
  describe('constructor key validation', () => {
    it('accepts a 32-byte key', () => {
      expect(() => new CryptoService(Buffer.alloc(32))).not.toThrow();
    });

    it.each([
      ['31 bytes', Buffer.alloc(31)],
      ['33 bytes', Buffer.alloc(33)],
      ['0 bytes', Buffer.alloc(0)],
      ['16 bytes', Buffer.alloc(16)],
    ])('throws on %s', (_label, key) => {
      expect(() => new CryptoService(key)).toThrow('AES-256 requires a 32-byte key');
    });
  });

  describe('encrypt/decrypt roundtrip', () => {
    let svc: CryptoService;
    beforeEach(() => {
      svc = new CryptoService(KEY);
    });

    it.each([
      ['ascii', 'hello world'],
      ['empty', ''],
      ['unicode/cjk', '你好，世界！🌍'],
      ['long', 'x'.repeat(10_000)],
      ['with newlines/tabs', 'line1\nline2\ttabbed'],
    ])('roundtrips %s', (_label, plaintext) => {
      expect(svc.decrypt(svc.encrypt(plaintext))).toBe(plaintext);
    });

    it('produces base64 ciphertext/iv/authTag with correct byte lengths', () => {
      const enc = svc.encrypt('abc');
      expect(enc.ciphertext).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
      expect(enc.iv).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
      expect(enc.authTag).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
      expect(Buffer.from(enc.iv, 'base64').length).toBe(12);
      expect(Buffer.from(enc.authTag, 'base64').length).toBe(16);
    });

    it('uses a random IV: two encryptions of same plaintext differ', () => {
      const a = svc.encrypt('same');
      const b = svc.encrypt('same');
      expect(a.iv).not.toBe(b.iv);
      expect(a.ciphertext).not.toBe(b.ciphertext);
      expect(svc.decrypt(a)).toBe('same');
      expect(svc.decrypt(b)).toBe('same');
    });
  });

  describe('decrypt tampering / failure', () => {
    let svc: CryptoService;
    let enc: { ciphertext: string; iv: string; authTag: string };
    beforeEach(() => {
      svc = new CryptoService(KEY);
      enc = svc.encrypt('secret');
    });

    it('throws when ciphertext is tampered (GCM auth failure)', () => {
      const tampered = { ...enc, ciphertext: enc.ciphertext.slice(0, -2) + 'AA' };
      expect(() => svc.decrypt(tampered)).toThrow();
    });

    it('throws when authTag is tampered', () => {
      const tampered = { ...enc, authTag: enc.authTag.slice(0, -2) + 'AA' };
      expect(() => svc.decrypt(tampered)).toThrow();
    });

    it('throws when iv is tampered', () => {
      const tampered = { ...enc, iv: enc.iv.slice(0, -2) + 'AA' };
      expect(() => svc.decrypt(tampered)).toThrow();
    });

    it('throws when decrypted with a different 32-byte key', () => {
      const other = new CryptoService(Buffer.alloc(32, 1));
      expect(() => other.decrypt(enc)).toThrow();
    });

    it('throws on malformed base64', () => {
      expect(() => svc.decrypt({ ciphertext: '!!!notbase64!!!', iv: enc.iv, authTag: enc.authTag })).toThrow();
    });
  });

  describe('cross-instance interop', () => {
    it('two services sharing the same key can decrypt each other', () => {
      const a = new CryptoService(KEY);
      const b = new CryptoService(KEY);
      expect(b.decrypt(a.encrypt('shared key interop'))).toBe('shared key interop');
    });
  });

  describe('implementation sanity (raw node crypto)', () => {
    it('manual encrypt with the same key/iv is decryptable by the service', () => {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', KEY, iv);
      const enc = Buffer.concat([cipher.update('abc', 'utf8'), cipher.final()]);
      const manual = {
        ciphertext: enc.toString('base64'),
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
      };
      expect(new CryptoService(KEY).decrypt(manual)).toBe('abc');
    });
  });
});
