import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsObject,
  MaxLength,
} from 'class-validator';
import { MomentVisibility } from '@prisma/client';

export class CreateMomentDto {
  @IsString()
  @MaxLength(5000)
  content!: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  media?: any[];

  @IsEnum(MomentVisibility)
  visibility!: MomentVisibility;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specifiedIds?: string[];
}

export class CommentDto {
  @IsString()
  @MaxLength(500)
  content!: string;

  @IsOptional()
  @IsString()
  replyToUserId?: string;
}
