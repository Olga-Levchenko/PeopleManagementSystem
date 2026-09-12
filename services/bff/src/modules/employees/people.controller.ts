import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { OidcService } from '../auth/oidc.service';
import type { BffSession } from '../auth/session.types';
import { EmployeesService } from './employees.service';

@ApiBearerAuth()
@Controller('people')
export class PeopleController {
  constructor(
    private readonly service: EmployeesService,
    private readonly oidc: OidcService,
  ) {}

  @Get(':subjectPersonId/profile')
  async getProfile(
    @Param('subjectPersonId') subjectPersonId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.getProfile(subjectPersonId, await this.context(request)),
    );
  }

  @Patch(':subjectPersonId/profile/fields')
  async patchProfileField(
    @Param('subjectPersonId') subjectPersonId: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.patchField(
        subjectPersonId,
        body,
        await this.context(request),
      ),
    );
  }

  @Post(':subjectPersonId/profile/emergency-contacts')
  async createEmergencyContact(
    @Param('subjectPersonId') subjectPersonId: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.createEmergencyContact(
        subjectPersonId,
        body,
        await this.context(request),
      ),
    );
  }

  @Patch(':subjectPersonId/profile/emergency-contacts/:contactId')
  async updateEmergencyContact(
    @Param('subjectPersonId') subjectPersonId: string,
    @Param('contactId') contactId: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.updateEmergencyContact(
        subjectPersonId,
        contactId,
        body,
        await this.context(request),
      ),
    );
  }

  @Delete(':subjectPersonId/profile/emergency-contacts/:contactId')
  async deleteEmergencyContact(
    @Param('subjectPersonId') subjectPersonId: string,
    @Param('contactId') contactId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.deleteEmergencyContact(
        subjectPersonId,
        contactId,
        await this.context(request),
      ),
    );
  }

  @Post(':subjectPersonId/profile/photo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadProfilePhoto(
    @Param('subjectPersonId') subjectPersonId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.uploadProfilePhoto(
        subjectPersonId,
        file,
        await this.context(request),
      ),
    );
  }

  @Post(':subjectPersonId/profile/certificates')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadProfileCertificate(
    @Param('subjectPersonId') subjectPersonId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.uploadProfileCertificate(
        subjectPersonId,
        file,
        await this.context(request),
      ),
    );
  }

  @Delete(':subjectPersonId/profile/certificates/:certificateId')
  async deleteProfileCertificate(
    @Param('subjectPersonId') subjectPersonId: string,
    @Param('certificateId') certificateId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.deleteProfileCertificate(
        subjectPersonId,
        certificateId,
        await this.context(request),
      ),
    );
  }

  @Get(':subjectPersonId/profile/photo')
  async downloadProfilePhoto(
    @Param('subjectPersonId') subjectPersonId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const result = await this.service.downloadProfilePhoto(
      subjectPersonId,
      await this.context(request),
    );
    response.status(result.status);
    for (const [key, value] of Object.entries(result.headers)) {
      response.setHeader(key, value);
    }
    response.send(result.body);
  }

  @Get(':subjectPersonId/profile/certificates/:certificateId/download')
  async downloadProfileCertificate(
    @Param('subjectPersonId') subjectPersonId: string,
    @Param('certificateId') certificateId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const result = await this.service.downloadProfileCertificate(
      subjectPersonId,
      certificateId,
      await this.context(request),
    );
    response.status(result.status);
    for (const [key, value] of Object.entries(result.headers)) {
      response.setHeader(key, value);
    }
    response.send(result.body);
  }

  private async context(request: Request) {
    const session = request.session as BffSession | undefined;
    return {
      authorization: await this.oidc.resolveAuthorization(
        session,
        request.headers.authorization,
        'people-service',
      ),
      correlationId: request.correlationId,
    };
  }

  private async forward(
    response: Response,
    upstream: Promise<{ status: number; body: unknown }>,
  ): Promise<unknown> {
    const result = await upstream;
    response.status(result.status);
    return result.body;
  }
}
