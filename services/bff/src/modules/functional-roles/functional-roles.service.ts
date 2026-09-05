import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ProxyContext {
  authorization?: string;
  correlationId: string;
  idempotencyKey?: string;
}

export interface UpstreamResponse {
  status: number;
  body: unknown;
}

@Injectable()
export class FunctionalRolesService {
  constructor(private readonly config: ConfigService) {}

  getCatalogue(context: ProxyContext): Promise<UpstreamResponse> {
    return this.request('/permissions/catalogue', 'GET', undefined, context);
  }

  getRoles(context: ProxyContext): Promise<UpstreamResponse> {
    return this.request('/functional-roles', 'GET', undefined, context);
  }

  getRole(roleKey: string, context: ProxyContext): Promise<UpstreamResponse> {
    return this.request(
      `/functional-roles/${encodeURIComponent(roleKey)}`,
      'GET',
      undefined,
      context,
    );
  }

  getRolePermissions(
    roleKey: string,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/functional-roles/${encodeURIComponent(roleKey)}/permissions`,
      'GET',
      undefined,
      context,
    );
  }

  createRole(body: unknown, context: ProxyContext): Promise<UpstreamResponse> {
    return this.request('/functional-roles', 'POST', body, context);
  }

  updateRole(
    roleKey: string,
    body: unknown,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/functional-roles/${encodeURIComponent(roleKey)}`,
      'PATCH',
      body,
      context,
    );
  }

  deactivateRole(
    roleKey: string,
    body: unknown,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/functional-roles/${encodeURIComponent(roleKey)}/deactivate`,
      'POST',
      body,
      context,
    );
  }

  grantPermission(
    roleKey: string,
    permissionKey: string,
    body: unknown,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/functional-roles/${encodeURIComponent(roleKey)}/permissions/${encodeURIComponent(permissionKey)}`,
      'PUT',
      body,
      context,
    );
  }

  revokePermission(
    roleKey: string,
    permissionKey: string,
    scope: string | undefined,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    const query =
      scope === undefined ? '' : `?scope=${encodeURIComponent(scope)}`;
    return this.request(
      `/functional-roles/${encodeURIComponent(roleKey)}/permissions/${encodeURIComponent(permissionKey)}${query}`,
      'DELETE',
      undefined,
      context,
    );
  }

  assignRole(
    personId: string,
    body: unknown,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/people/${personId}/functional-roles`,
      'POST',
      body,
      context,
    );
  }

  revokeRole(
    personId: string,
    roleKey: string,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/people/${personId}/functional-roles/${encodeURIComponent(roleKey)}`,
      'DELETE',
      undefined,
      context,
    );
  }

  getAssignments(
    personId: string,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/people/${personId}/functional-roles`,
      'GET',
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
    if (context.idempotencyKey) {
      headers['idempotency-key'] = context.idempotencyKey;
    }

    let response: Response;
    try {
      response = await fetch(
        `${this.config.getOrThrow<string>('ACCESS_CONTROL_SERVICE_BASE_URL')}/api/v1${path}`,
        {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Access Control service is unavailable.',
      );
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
        'Access Control service returned an invalid response.',
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
      ? 'Access Control service is unavailable.'
      : 'Access Control request was rejected.';
  }
}
