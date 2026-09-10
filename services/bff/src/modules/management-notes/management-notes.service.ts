import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface UpstreamResponse {
  status: number;
  body: unknown;
}

@Injectable()
export class ManagementNotesService {
  constructor(private readonly config: ConfigService) {}

  listNotes(
    subjectPersonId: string,
    authorization?: string,
  ): Promise<UpstreamResponse> {
    return this.request(
      'GET',
      `/management-notes?subjectPersonId=${encodeURIComponent(subjectPersonId)}`,
      undefined,
      authorization,
    );
  }

  createNote(body: unknown, authorization?: string): Promise<UpstreamResponse> {
    return this.request('POST', '/management-notes', body, authorization);
  }

  updateNote(
    id: string,
    body: unknown,
    authorization?: string,
  ): Promise<UpstreamResponse> {
    return this.request(
      'PATCH',
      `/management-notes/${encodeURIComponent(id)}`,
      body,
      authorization,
    );
  }

  private async request(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body: unknown,
    authorization?: string,
  ): Promise<UpstreamResponse> {
    const headers: Record<string, string> = {};
    // A GET carries no body, so it also carries no content-type -- unlike
    // OrganisationalRelationshipsService (PATCH-only), this proxy forwards GET too.
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    // Prefer an explicit incoming Authorization header (service-to-service bearer-token callers)
    // over the session-derived token -- see ManagementNotesController.resolveAuthorization for why
    // both paths exist.
    if (authorization) {
      headers.authorization = authorization;
    }

    const response = await fetch(
      `${this.config.getOrThrow<string>('WORK_MANAGEMENT_SERVICE_URL')}/api/v1${path}`,
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );

    const contentType = response.headers.get('content-type') ?? '';
    const responseBody: unknown = contentType.includes('application/json')
      ? ((await response.json()) as unknown)
      : await response.text();

    return { status: response.status, body: responseBody };
  }
}
