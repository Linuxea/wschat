import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string; // base64 (12 bytes)
  authTag: string; // base64 (16 bytes)
}

/**
 * Server-side static encryption (pseudo-E2EE).
 * AES-256-GCM with a master key from env. Protects against DB/backup leakage.
 * NOTE: server can decrypt, so this is NOT true end-to-end encryption.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(key: Buffer) {
    if (key.length !== 32) {
      throw new Error('AES-256 requires a 32-byte key');
    }
    this.key = key;
  }

  encrypt(plaintext: string): EncryptedPayload {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: enc.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(payload: EncryptedPayload): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  }
}
