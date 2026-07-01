import { Type } from 'class-transformer';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsNumber,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MomentVisibility } from '@prisma/client';

export class MediaItemDto {
  @IsString()
  type!: string;

  @IsString()
  url!: string;

  @IsOptional()
  @IsNumber()
  width?: number;

  @IsOptional()
  @IsNumber()
  height?: number;
}

export class CreateMomentDto {
  @IsString()
  @MaxLength(5000)
  content!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  media?: MediaItemDto[];

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
