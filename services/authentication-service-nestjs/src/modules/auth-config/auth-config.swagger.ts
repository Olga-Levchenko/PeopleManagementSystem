import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { AuthConfigEntity } from './entities/auth-config.entity';

export const SwaggerGetAuthConfig = () =>
  applyDecorators(
    ApiOkResponse({
      description:
        "The realm's issuer/JWKS discovery info, for downstream services validating this platform's JWTs.",
      type: AuthConfigEntity,
    }),
  );
