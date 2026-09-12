import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ProxyContext,
  UpstreamBinaryResponse,
  UpstreamResponse,
} from '../custom-field-definitions/custom-field-definitions.service';

@Injectable()
export class EmployeesService {
  constructor(private readonly config: ConfigService) {}

  fieldCatalog(context: ProxyContext): Promise<UpstreamResponse> {
    return this.request('/employees/field-catalog', 'GET', undefined, context);
  }

  getProfile(
    subjectPersonId: string,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/people/${encodeURIComponent(subjectPersonId)}/profile`,
      'GET',
      undefined,
      context,
    );
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

  createEmergencyContact(
    subjectPersonId: string,
    body: unknown,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/people/${encodeURIComponent(subjectPersonId)}/profile/emergency-contacts`,
      'POST',
      body,
      context,
      true,
    );
  }

  updateEmergencyContact(
    subjectPersonId: string,
    contactId: string,
    body: unknown,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/people/${encodeURIComponent(subjectPersonId)}/profile/emergency-contacts/${encodeURIComponent(contactId)}`,
      'PATCH',
      body,
      context,
      true,
    );
  }

  deleteEmergencyContact(
    subjectPersonId: string,
    contactId: string,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/people/${encodeURIComponent(subjectPersonId)}/profile/emergency-contacts/${encodeURIComponent(contactId)}`,
      'DELETE',
      undefined,
      context,
      true,
    );
  }

  uploadProfilePhoto(
    subjectPersonId: string,
    file: Express.Multer.File,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.requestMultipart(
      `/people/${encodeURIComponent(subjectPersonId)}/profile/photo`,
      file,
      context,
    );
  }

  uploadProfileCertificate(
    subjectPersonId: string,
    file: Express.Multer.File,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.requestMultipart(
      `/people/${encodeURIComponent(subjectPersonId)}/profile/certificates`,
      file,
      context,
    );
  }

  deleteProfileCertificate(
    subjectPersonId: string,
    certificateId: string,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    return this.request(
      `/people/${encodeURIComponent(subjectPersonId)}/profile/certificates/${encodeURIComponent(certificateId)}`,
      'DELETE',
      undefined,
      context,
      true,
    );
  }

  downloadProfilePhoto(
    subjectPersonId: string,
    context: ProxyContext,
  ): Promise<UpstreamBinaryResponse> {
    return this.requestBinary(
      `/people/${encodeURIComponent(subjectPersonId)}/profile/photo`,
      context,
    );
  }

  downloadProfileCertificate(
    subjectPersonId: string,
    certificateId: string,
    context: ProxyContext,
  ): Promise<UpstreamBinaryResponse> {
    return this.requestBinary(
      `/people/${encodeURIComponent(subjectPersonId)}/profile/certificates/${encodeURIComponent(certificateId)}/download`,
      context,
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

  exportEmployees(
    query: Record<string, string | undefined>,
    context: ProxyContext,
  ): Promise<UpstreamBinaryResponse> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        search.set(key, value);
      }
    }
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return this.requestBinary(`/employees/export${suffix}`, context);
  }

  private async requestMultipart(
    path: string,
    file: Express.Multer.File,
    context: ProxyContext,
  ): Promise<UpstreamResponse> {
    const formData = new FormData();
    const blob = new Blob([Uint8Array.from(file.buffer)], { type: file.mimetype });
    formData.append('file', blob, file.originalname);

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
        {
          method: 'POST',
          headers,
          body: formData,
        },
      );
    } catch {
      throw new ServiceUnavailableException('People service is unavailable.');
    }

    const bodyText = await response.text();
    let body: unknown = bodyText;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json') && bodyText.length > 0) {
      try {
        body = JSON.parse(bodyText) as unknown;
      } catch {
        body = bodyText;
      }
    }

    if (!response.ok) {
      throw new HttpException(
        typeof body === 'object' && body !== null
          ? (body as Record<string, unknown>)
          : {
              statusCode: this.safeErrorStatus(response.status),
              message: this.safeErrorMessage(response.status),
            },
        this.safeErrorStatus(response.status),
      );
    }

    return { status: response.status, body };
  }

  private async requestBinary(
    path: string,
    context: ProxyContext,
    accept = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ): Promise<UpstreamBinaryResponse> {
    const headers: Record<string, string> = {
      accept,
      'x-correlation-id': context.correlationId,
    };
    if (context.authorization) {
      headers.authorization = context.authorization;
    }

    let response: Response;
    try {
      response = await fetch(
        `${this.config.getOrThrow<string>('PEOPLE_SERVICE_URL')}/api/v1${path}`,
        {
          method: 'GET',
          headers,
        },
      );
    } catch {
      throw new ServiceUnavailableException('People service is unavailable.');
    }

    const body = Buffer.from(await response.arrayBuffer());
    const responseHeaders: Record<string, string> = {};
    const contentType = response.headers.get('content-type');
    const contentDisposition = response.headers.get('content-disposition');
    if (contentType) {
      responseHeaders['content-type'] = contentType;
    }
    if (contentDisposition) {
      responseHeaders['content-disposition'] = contentDisposition;
    }

    if (!response.ok) {
      const errorContentType = response.headers.get('content-type') ?? '';
      if (errorContentType.includes('application/json')) {
        try {
          const parsed: unknown = JSON.parse(body.toString('utf8'));
          const errorBody =
            typeof parsed === 'string' ||
            (typeof parsed === 'object' && parsed !== null)
              ? (parsed as string | Record<string, unknown>)
              : {
                  statusCode: this.safeErrorStatus(response.status),
                  message: this.safeErrorMessage(response.status),
                };
          throw new HttpException(
            errorBody,
            this.safeErrorStatus(response.status),
          );
        } catch (error) {
          if (error instanceof HttpException) {
            throw error;
          }
        }
      }

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
      body,
      headers: responseHeaders,
    };
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
