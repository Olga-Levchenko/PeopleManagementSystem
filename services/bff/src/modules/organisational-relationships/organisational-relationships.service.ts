import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface UpstreamResponse {
  status: number;
  body: unknown;
}

@Injectable()
export class OrganisationalRelationshipsService {
  constructor(private readonly config: ConfigService) {}

  changeManager(
    personId: string,
    body: unknown,
    authorization?: string,
  ): Promise<UpstreamResponse> {
    return this.patch(
      `/organisational-relationships/people/${personId}/manager`,
      body,
      authorization,
    );
  }

  changePeoplePartner(
    personId: string,
    body: unknown,
    authorization?: string,
  ): Promise<UpstreamResponse> {
    return this.patch(
      `/organisational-relationships/people/${personId}/people-partner`,
      body,
      authorization,
    );
  }

  changeDepartment(
    personId: string,
    body: unknown,
    authorization?: string,
  ): Promise<UpstreamResponse> {
    return this.patch(
      `/organisational-relationships/people/${personId}/department`,
      body,
      authorization,
    );
  }

  changeDepartmentManager(
    departmentId: string,
    body: unknown,
    authorization?: string,
  ): Promise<UpstreamResponse> {
    return this.patch(
      `/organisational-relationships/departments/${departmentId}/manager`,
      body,
      authorization,
    );
  }

  private async patch(
    path: string,
    body: unknown,
    authorization?: string,
  ): Promise<UpstreamResponse> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    // Prefer an explicit incoming Authorization header (service-to-service bearer-token callers)
    // over the session-derived token. The controller passes req.headers.authorization when present,
    // and the session token otherwise -- see AuthController/JwtAuthGuard for why both paths exist.
    if (authorization) {
      headers.authorization = authorization;
    }

    const response = await fetch(
      `${this.config.getOrThrow<string>('PEOPLE_SERVICE_URL')}/api/v1${path}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      },
    );

    const contentType = response.headers.get('content-type') ?? '';
    const responseBody: unknown = contentType.includes('application/json')
      ? ((await response.json()) as unknown)
      : await response.text();

    return { status: response.status, body: responseBody };
  }
}
