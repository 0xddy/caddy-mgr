import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type { AuthMethod, ElevationMethod } from '../common/contracts';

export class HostKeyDto {
  @IsString() @Length(1, 253) @Matches(/^[^\s\u0000]+$/) host: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(65535) port = 22;
}

export class ProbeServerDto extends HostKeyDto {
  @IsString() @Length(1, 100) username: string;
  @IsIn(['password', 'privateKey']) authMethod: AuthMethod;
  @ValidateIf((value: ProbeServerDto) => value.authMethod === 'password') @IsString() @Length(1, 1000) password?: string;
  @ValidateIf((value: ProbeServerDto) => value.authMethod === 'privateKey') @IsString() @Length(1, 100_000) privateKey?: string;
  @IsOptional() @IsString() @MaxLength(1000) passphrase?: string;
  @IsIn(['root', 'sudoNopass', 'sudoPassword']) elevationMethod: ElevationMethod;
  @ValidateIf((value: ProbeServerDto) => value.elevationMethod === 'sudoPassword') @IsString() @Length(1, 1000) sudoPassword?: string;
  @IsString() @Matches(/^SHA256:[A-Za-z0-9+/]+$/) hostFingerprint: string;
}

export class CreateServerDto extends ProbeServerDto {
  @IsString() @Length(1, 100) name: string;
  @IsString() @Matches(/^SHA256:[A-Za-z0-9+/]+$/) override hostFingerprint = '';
  @IsString() @Length(1, 255) serviceName: string;
  @IsString() @Length(1, 4096) caddyBinary: string;
  @IsOptional() @IsString() @Length(1, 1024) caddyVersion?: string;
  @IsString() @Length(1, 4096) configPath: string;
  @IsString() @IsIn(['caddyfile']) adapter = 'caddyfile';
  @IsOptional() @IsString() @MaxLength(100) serviceUser?: string;
  @IsOptional() @IsString() @MaxLength(4096) workingDirectory?: string;
  @IsOptional() discovery?: unknown;
}

export class UpdateServerDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsString() @Length(1, 253) @Matches(/^[^\s\u0000]+$/) host?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsString() @Length(1, 100) username?: string;
  @IsOptional() @IsIn(['password', 'privateKey']) authMethod?: AuthMethod;
  @IsOptional() @IsString() @Length(1, 1000) password?: string;
  @IsOptional() @IsString() @Length(1, 100_000) privateKey?: string;
  @IsOptional() @IsString() @MaxLength(1000) passphrase?: string;
  @IsOptional() @IsIn(['root', 'sudoNopass', 'sudoPassword']) elevationMethod?: ElevationMethod;
  @IsOptional() @IsString() @Length(1, 1000) sudoPassword?: string;
  @IsOptional() @IsString() @Matches(/^SHA256:[A-Za-z0-9+/]+$/) hostFingerprint?: string;
  @IsOptional() @IsString() @Length(1, 255) serviceName?: string;
  @IsOptional() @IsString() @Length(1, 4096) caddyBinary?: string;
  @IsOptional() @IsString() @Length(1, 4096) configPath?: string;
  @IsOptional() @IsString() @IsIn(['caddyfile']) adapter?: string;
  @IsOptional() @IsString() @MaxLength(100) serviceUser?: string;
  @IsOptional() @IsString() @MaxLength(4096) workingDirectory?: string;
}
