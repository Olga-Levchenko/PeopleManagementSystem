import { ApiProperty } from '@nestjs/swagger';

export class AuthConfigEntity {
  @ApiProperty({
    description:
      "This realm's OIDC issuer URL — downstream services validate a JWT's `iss` claim against this.",
    example: 'http://localhost:8080/realms/people-management',
  })
  issuer!: string;

  @ApiProperty({
    description:
      "This realm's JWKS endpoint — downstream services fetch signing keys from here to verify a JWT's signature.",
    example:
      'http://localhost:8080/realms/people-management/protocol/openid-connect/certs',
  })
  jwksUri!: string;

  @ApiProperty({
    description: 'The configured Keycloak realm name.',
    example: 'people-management',
  })
  realm!: string;
}
