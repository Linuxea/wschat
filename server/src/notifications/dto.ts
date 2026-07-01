import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ListQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  beforeSeq?: number; // 未使用，保留以兼容游标约定；实际用 before(createdAt)

  @IsOptional()
  @IsString()
  before?: string; // ISO createdAt 游标

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class MarkAllReadDto {
  @IsOptional()
  @IsString()
  type?: string; // NotificationType 或分类别名: 'moments' | 'contacts'
}

export class MarkOneReadDto {
  @IsOptional()
  @IsString()
  type?: string;
}
