import { IsNotEmpty, IsString } from 'class-validator';

export class ResolveIdentityDto {
  @IsString()
  @IsNotEmpty()
  issuer!: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;
}
