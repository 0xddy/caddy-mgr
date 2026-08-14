import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { runtimeConfig } from '../common/runtime-config';

export class ConfigContentDto {
  @IsString() @MaxLength(runtimeConfig.maxConfigBytes) content: string;
}

export class ApplyConfigDto extends ConfigContentDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) baseHash: string;
}

export class RestoreConfigDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) baseHash: string;
}

export class RecoverOperationDto {
  @IsIn(['retryReload', 'restoreBackup']) action: 'retryReload' | 'restoreBackup';
}
