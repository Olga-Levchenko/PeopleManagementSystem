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
    return this.patch(`/organisational-relationships/people/${personId}/manager`, body, authorization);
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
    return this.patch(`/organisational-relationships/people/${personId}/department`, body, authorization);
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
    if (authorization) {
      headers.authorization = authorization;
    }

    const response = await fetch(`${this.config.getOrThrow<string>('PEOPLE_SERVICE_URL')}/api/v1${path}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });

    const contentType = response.headers.get('content-type') ?? '';
    const responseBody = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    return { status: response.status, body: responseBody };
  }
}
