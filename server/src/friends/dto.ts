import { IsString, IsOptional, MaxLength, MinLength, IsArray } from 'class-validator';

export class SendRequestDto {
  @IsString()
  toId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}

export class UpdateRemarkDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  remark?: string | null;
}

export class CreateTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  name!: string;
}

export class SetFriendTagsDto {
  @IsArray()
  @IsString({ each: true })
  tagIds!: string[];
}

export class SetBlockedDto {
  @IsOptional()
  momentsBlocked?: boolean;
}
