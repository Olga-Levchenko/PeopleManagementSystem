import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Post,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ResolveIdentityDto } from './dto/resolve-identity.dto';
import { IdentityResolutionService } from './identity-resolution.service';
import { InternalServiceAuthGuard } from './internal-service-auth.guard';

@Catch()
export class IdentityResolutionProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status = this.statusOf(exception);
    const title = this.titleOf(status);

    response.status(status).type('application/problem+json').json({
      type: 'about:blank',
      title,
      status,
      detail: title,
      instance: request.originalUrl,
      correlationId: request.correlationId,
    });
  }

  private statusOf(exception: unknown): number {
    if (!(exception instanceof HttpException)) {
      return HttpStatus.SERVICE_UNAVAILABLE;
    }

    const status = exception.getStatus();
    return [
      HttpStatus.BAD_REQUEST,
      HttpStatus.UNAUTHORIZED,
      HttpStatus.FORBIDDEN,
      HttpStatus.NOT_FOUND,
      HttpStatus.CONFLICT,
      HttpStatus.SERVICE_UNAVAILABLE,
    ].includes(status)
      ? status
      : HttpStatus.SERVICE_UNAVAILABLE;
  }

  private titleOf(status: number): string {
    const titles: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Identity resolution request is invalid',
      [HttpStatus.UNAUTHORIZED]: 'Internal service authentication is required',
      [HttpStatus.FORBIDDEN]: 'Internal service is not authorized',
      [HttpStatus.NOT_FOUND]: 'Identity mapping was not found',
      [HttpStatus.CONFLICT]: 'Identity mapping is ambiguous',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'Identity resolution is unavailable',
    };
    return titles[status] ?? titles[HttpStatus.SERVICE_UNAVAILABLE];
  }
}

@ApiBearerAuth()
@UseFilters(IdentityResolutionProblemDetailsFilter)
@UseGuards(InternalServiceAuthGuard)
@Controller('internal/identity-mappings')
export class IdentityResolutionController {
  constructor(private readonly service: IdentityResolutionService) {}

  @Post('resolve')
  @ApiOperation({ summary: 'Resolve an OIDC identity to a PersonId' })
  @ApiResponse({ status: 200, schema: { example: { personId: 'uuid' } } })
  @ApiResponse({
    status: 400,
    description: 'Malformed or disallowed issuer, or blank subject',
  })
  @ApiResponse({ status: 401, description: 'Internal authentication missing' })
  @ApiResponse({ status: 403, description: 'Internal service unauthorized' })
  @ApiResponse({ status: 404, description: 'Mapping missing or revoked' })
  @ApiResponse({ status: 409, description: 'Multiple active mappings found' })
  @ApiResponse({ status: 503, description: 'Dependency unavailable' })
  async resolve(
    @Body() body: ResolveIdentityDto,
    @Res() response: Response,
  ): Promise<Response> {
    const result = await this.service.resolve(body.issuer, body.subject);
    switch (result.outcome) {
      case 'resolved':
        return response
          .status(HttpStatus.OK)
          .json({ personId: result.personId });
      case 'missing':
        throw new HttpException(
          'Identity mapping was not found',
          HttpStatus.NOT_FOUND,
        );
      case 'ambiguous':
        throw new HttpException(
          'Identity mapping is ambiguous',
          HttpStatus.CONFLICT,
        );
      default:
        throw new HttpException(
          'Identity resolution is unavailable',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
    }
  }
}
