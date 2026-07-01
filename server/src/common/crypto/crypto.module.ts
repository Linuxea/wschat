import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

@Global()
@Module({
  providers: [
    {
      provide: CryptoService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const hex = config.get<string>('DATA_ENCRYPTION_KEY');
        if (!hex || hex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hex)) {
          throw new Error(
            'DATA_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex chars. Generate with: openssl rand -hex 32',
          );
        }
        return new CryptoService(Buffer.from(hex, 'hex'));
      },
    },
  ],
  exports: [CryptoService],
})
export class CryptoModule {}
