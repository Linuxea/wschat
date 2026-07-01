import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { nanoid } from 'nanoid';
import dayjs from 'dayjs';

export interface UploadedFile {
  url: string;
  key: string;
  bucket: string;
  size: number;
  mimeType: string;
  originalName: string;
}

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);
  private client!: Client;
  private bucket!: string;
  private publicUrl!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'http://localhost:9000');
    const url = new URL(endpoint);
    this.client = new Client({
      endPoint: url.hostname,
      port: url.port ? parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 80,
      useSSL: url.protocol === 'https:',
      accessKey: this.config.get<string>('MINIO_ROOT_USER', 'minioadmin'),
      secretKey: this.config.get<string>('MINIO_ROOT_PASSWORD', 'minioadmin'),
    });
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'wschat-media');
    this.publicUrl = this.config.get<string>('MINIO_PUBLIC_URL', endpoint);
    await this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket, this.config.get<string>('MINIO_REGION', 'us-east-1'));
        this.logger.log(`Created bucket ${this.bucket}`);
      }
      // allow anonymous read so media URLs are publicly loadable
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${this.bucket}/*`],
          },
        ],
      };
      await this.client.setBucketPolicy(this.bucket, JSON.stringify(policy));
    } catch (e) {
      this.logger.warn(`ensureBucket: ${(e as Error).message}`);
    }
  }

  async upload(file: { buffer: Buffer; originalname: string; mimetype: string; size: number }): Promise<UploadedFile> {
    const date = dayjs().format('YYYY/MM/DD');
    const ext = this.extOf(file.originalname);
    const key = `${date}/${nanoid(16)}${ext}`;
    await this.client.putObject(this.bucket, key, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });
    return {
      url: `${this.publicUrl}/${this.bucket}/${key}`,
      key,
      bucket: this.bucket,
      size: file.size,
      mimeType: file.mimetype,
      originalName: file.originalname,
    };
  }

  private extOf(name: string): string {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i).toLowerCase() : '';
  }
}
