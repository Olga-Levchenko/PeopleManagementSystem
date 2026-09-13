import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiQuery,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  RiskHistoryResponseEntity,
  RiskRecordEntity,
} from './entities/risk-record.entity';

export const SwaggerAppendRiskRecord = () =>
  applyDecorators(
    ApiCreatedResponse({ type: RiskRecordEntity }),
    ApiBadRequestResponse({ description: 'Invalid body or future recordedAt' }),
    ApiForbiddenResponse({
      description:
        'Self-subject, permission denied, or no qualifying access line',
    }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' }),
  );

export const SwaggerGetRiskHistory = () =>
  applyDecorators(
    ApiQuery({ name: 'subjectPersonId', format: 'uuid', required: true }),
    ApiOkResponse({ type: RiskHistoryResponseEntity }),
    ApiForbiddenResponse({
      description:
        'Self-subject, permission denied, or no qualifying access line',
    }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' }),
  );
