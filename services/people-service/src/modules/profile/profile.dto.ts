import { Allow, IsString } from 'class-validator';

export class PatchProfileFieldDto {
  @IsString()
  fieldKey!: string;

  @Allow()
  value!: unknown;
}
