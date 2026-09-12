import { Allow, IsOptional, IsString, IsUUID } from 'class-validator';

export class PatchProfileFieldDto {
  @IsString()
  fieldKey!: string;

  @Allow()
  value!: unknown;
}

export class CreateEmergencyContactDto {
  @IsString()
  contactName!: string;

  @IsOptional()
  @IsString()
  relationship?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;
}

export class UpdateEmergencyContactDto {
  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  relationship?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;
}

export class EmergencyContactIdParamDto {
  @IsUUID()
  contactId!: string;
}

export class CertificateIdParamDto {
  @IsUUID()
  certificateId!: string;
}
