import { IsString, MinLength, MaxLength, IsOptional, IsUrl } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bio?: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}

export class SearchUsersDto {
  @IsString()
  @MinLength(1)
  q!: string;
}
