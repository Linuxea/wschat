import { IsString, MinLength, MaxLength, Matches, IsIn } from 'class-validator';

const USERNAME_MSG =
  'username must be 3-20 chars, alphanumeric / underscore / dot';

export class RegisterDto {
  @Matches(/^[a-zA-Z0-9_.]{3,20}$/, { message: USERNAME_MSG })
  username!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  nickname!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  securityQuestion!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  securityAnswer!: string;
}

export class LoginDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(1)
  securityAnswer!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  newPassword!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}
