import {
  IsString,
  IsOptional,
  IsArray,
  ArrayMinSize,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  memberIds!: string[];

  @IsOptional()
  @IsString()
  avatar?: string;
}

export class InviteDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  userIds!: string[];
}

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  avatar?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  announcement?: string;
}
