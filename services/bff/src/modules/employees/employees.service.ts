import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ProxyContext,
  UpstreamResponse,
} from '../custom-field-definitions/custom-field-definitions.service';

@Injectable()
export class EmployeesService {
  constructor(private readonly config: ConfigService) {}

  fieldCatalog(context: ProxyContext): Promise<UpstreamResponse> {
    return this.request('/employees/field-catalog', 'GET', undefined, context);
  }

  patchField(
    subjectPersonId: string,
    body: unknown,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/people/${encodeURIComponent(subjectPersonId)}/profile/fields`,
      'PATCH',
      body,
      context,
      true,
    );
  }

  listSavedViews(context: ProxyContext): Promise<UpstreamResponse> {
    return this.request('/employees/saved-views', 'GET', undefined, context);
  }

  createSavedView(
    body: unknown,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request('/employees/saved-views', 'POST', body, context, true);
  }

  updateSavedView(
    viewId: string,
    body: unknown,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/employees/saved-views/${encodeURIComponent(viewId)}`,
      'PATCH',
      body,
      context,
      true,
    );
  }

  deleteSavedView(
    viewId: string,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/employees/saved-views/${encodeURIComponent(viewId)}`,
      'DELETE',
      undefined,
      context,
      true,
    );
  }

  shareSavedView(
    viewId: string,
    body: unknown,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/employees/saved-views/${encodeURIComponent(viewId)}/shares`,
      'POST',
      body,
      context,
      true,
    );
  }

  revokeSavedViewShare(
    viewId: string,
    recipientPersonId: string,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/employees/saved-views/${encodeURIComponent(viewId)}/shares/${encodeURIComponent(recipientPersonId)}`,
      'DELETE',
      undefined,
      context,
      true,
    );
  }

  list(
    query: Record<string, string | undefined>,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        search.set(key, value);
      }
    }
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return this.request(`/employees${suffix}`, 'GET', undefined, context);
  }

  private async request(
    path: string,
    method: string,
    body: unknown,
    context: ProxyContext,
    passthroughErrors = false,
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

    const responseBody = await this.readBody(response);

    if (!response.ok && !passthroughErrors) {
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
      body: responseBody,
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
