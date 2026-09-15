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

@Injectable()
export class DepartmentsService {
  constructor(private readonly config: ConfigService) {}

  search(name: string | undefined, context: ProxyContext) {
    const qs = name ? `?name=${encodeURIComponent(name)}` : '';
    return this.request(`/departments${qs}`, context);
  }

  private async request(
    path: string,
    context: ProxyContext,
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-correlation-id': context.correlationId,
    };
    if (context.authorization) {
      headers.authorization = context.authorization;
    }

    let response: Response;
    try {
      response = await fetch(
        `${this.config.getOrThrow<string>('PEOPLE_SERVICE_URL')}/api/v1${path}`,
        { headers },
      );
    } catch {
      throw new ServiceUnavailableException('People service is unavailable.');
    }

    if (!response.ok) {
      const safeStatus = this.safeErrorStatus(response.status);
      throw new HttpException({ statusCode: safeStatus }, safeStatus);
    }

    return {
      status: response.status,
      body: (await response.json()) as unknown,
    };
  }

  private safeErrorStatus(status: number): number {
    if ([400, 401, 403, 404].includes(status)) {
      return status;
    }
    return status >= 500 ? 503 : 400;
  }
}
