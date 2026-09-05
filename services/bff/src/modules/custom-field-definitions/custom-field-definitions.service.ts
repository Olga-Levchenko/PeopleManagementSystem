import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ProxyContext {
  authorization?: string;
  correlationId: string;
}

export interface UpstreamResponse {
  status: number;
  body: unknown;
}

@Injectable()
export class CustomFieldDefinitionsService {
  constructor(private readonly config: ConfigService) {}

  list(context: ProxyContext): Promise<UpstreamResponse> {
    return this.request('/custom-field-definitions', 'GET', undefined, context);
  }

  create(body: unknown, context: ProxyContext): Promise<UpstreamResponse> {
    return this.request('/custom-field-definitions', 'POST', body, context);
  }

  update(
    id: string,
    body: unknown,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/custom-field-definitions/${encodeURIComponent(id)}`,
      'PATCH',
      body,
      context,
    );
  }

  deactivate(id: string, context: ProxyContext): Promise<UpstreamResponse> {
    return this.request(
      `/custom-field-definitions/${encodeURIComponent(id)}`,
      'DELETE',
      undefined,
      context,
    );
  }

  private async request(
    path: string,
    method: string,
    body: unknown,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-correlation-id': context.correlationId,
    };
    if (context.authorization) {
      headers.authorization = context.authorization;
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(
        `${this.config.getOrThrow<string>('PEOPLE_SERVICE_URL')}/api/v1${path}`,
        {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );
    } catch {
      throw new ServiceUnavailableException('People service is unavailable.');
    }

    if (!response.ok) {
      throw new HttpException(
        {
          statusCode: this.safeErrorStatus(response.status),
          message: this.safeErrorMessage(response.status),
        },
        this.safeErrorStatus(response.status),
      );
    }

    return {
      status: response.status,
      body: await this.readBody(response),
    };
  }

  private async readBody(response: Response): Promise<unknown> {
    if (response.status === 204) {
      return undefined;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return await response.text();
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new ServiceUnavailableException(
        'People service returned an invalid response.',
      );
    }
  }

  private safeErrorStatus(status: number): number {
    if ([400, 401, 403, 404, 409, 503].includes(status)) {
      return status;
    }
    return status >= 500 ? 503 : 400;
  }

  private safeErrorMessage(status: number): string {
    const safeStatus = this.safeErrorStatus(status);
    return safeStatus === 503
      ? 'People service is unavailable.'
      : 'People service request was rejected.';
  }
}
