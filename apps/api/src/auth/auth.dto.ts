import { IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './password-policy';

export class LoginDto {
  @IsString() @Length(1, 100) username: string;
  @IsString() @Length(1, MAX_PASSWORD_LENGTH) password: string;
  @IsString() @Length(1, 64) captchaId: string;
  @IsString() @Length(1, 16) captchaCode: string;
}

export class UpdateAccountDto {
  @IsString() @Length(1, MAX_PASSWORD_LENGTH) currentPassword: string;
  @IsOptional() @IsString() @Length(1, 100) username?: string;
  @IsOptional() @IsString() @MinLength(MIN_PASSWORD_LENGTH) @MaxLength(MAX_PASSWORD_LENGTH) newPassword?: string;
}
