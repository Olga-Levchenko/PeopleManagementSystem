import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { ProfileMutationsService } from './profile-mutations.service';
import {
  CreateEmergencyContactDto,
  PatchProfileFieldDto,
  UpdateEmergencyContactDto,
} from './profile.dto';
import { ProfileService } from './profile.service';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { ColleagueBrowseGateService } from '../employees/colleague-browse.gate.service';

@ApiBearerAuth()
@Controller('people')
export class ProfileController {
  constructor(
    private readonly service: ProfileService,
    private readonly mutations: ProfileMutationsService,
    private readonly actor: RequestActorContext,
    private readonly colleagueBrowseGate: ColleagueBrowseGateService,
  ) {}

  @Get(':subjectPersonId/profile')
  async getProfile(
    @Param('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
  ) {
    const actorId = await this.actor.resolveActorId();
    return this.service.getProfile(actorId, subjectPersonId);
  }

  @Patch(':subjectPersonId/profile/fields')
  async patchProfileField(
    @Param('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
      }),
    )
    dto: PatchProfileFieldDto,
  ) {
    const actorId = await this.actor.resolveActorId();
    if (actorId !== subjectPersonId) {
      await this.colleagueBrowseGate.assertManagementBrowseAllowed(actorId);
    }
    return this.service.patchProfileField(
      actorId,
      subjectPersonId,
      dto.fieldKey,
      dto.value,
    );
  }

  @Post(':subjectPersonId/profile/emergency-contacts')
  async createEmergencyContact(
    @Param('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateEmergencyContactDto,
  ) {
    const actorId = await this.actor.resolveActorId();
    if (actorId !== subjectPersonId) {
      await this.colleagueBrowseGate.assertManagementBrowseAllowed(actorId);
    }
    return this.mutations.createEmergencyContact(actorId, subjectPersonId, dto);
  }

  @Patch(':subjectPersonId/profile/emergency-contacts/:contactId')
  async updateEmergencyContact(
    @Param('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
    @Param('contactId', new ParseUUIDPipe()) contactId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: UpdateEmergencyContactDto,
  ) {
    const actorId = await this.actor.resolveActorId();
    if (actorId !== subjectPersonId) {
      await this.colleagueBrowseGate.assertManagementBrowseAllowed(actorId);
    }
    return this.mutations.updateEmergencyContact(
      actorId,
      subjectPersonId,
      contactId,
      dto,
    );
  }

  @Delete(':subjectPersonId/profile/emergency-contacts/:contactId')
  @HttpCode(204)
  async deleteEmergencyContact(
    @Param('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
    @Param('contactId', new ParseUUIDPipe()) contactId: string,
  ) {
    const actorId = await this.actor.resolveActorId();
    if (actorId !== subjectPersonId) {
      await this.colleagueBrowseGate.assertManagementBrowseAllowed(actorId);
    }
    await this.mutations.deleteEmergencyContact(
      actorId,
      subjectPersonId,
      contactId,
    );
  }

  @Post(':subjectPersonId/profile/photo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async uploadPhoto(
    @Param('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const actorId = await this.actor.resolveActorId();
    if (actorId !== subjectPersonId) {
      await this.colleagueBrowseGate.assertManagementBrowseAllowed(actorId);
    }
    return this.mutations.uploadPhoto(actorId, subjectPersonId, file);
  }

  @Post(':subjectPersonId/profile/certificates')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  async uploadCertificate(
    @Param('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const actorId = await this.actor.resolveActorId();
    if (actorId !== subjectPersonId) {
      await this.colleagueBrowseGate.assertManagementBrowseAllowed(actorId);
    }
    return this.mutations.uploadCertificate(actorId, subjectPersonId, file);
  }

  @Delete(':subjectPersonId/profile/certificates/:certificateId')
  @HttpCode(204)
  async deleteCertificate(
    @Param('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
    @Param('certificateId', new ParseUUIDPipe()) certificateId: string,
  ) {
    const actorId = await this.actor.resolveActorId();
    if (actorId !== subjectPersonId) {
      await this.colleagueBrowseGate.assertManagementBrowseAllowed(actorId);
    }
    await this.mutations.deleteCertificate(
      actorId,
      subjectPersonId,
      certificateId,
    );
  }

  @Get(':subjectPersonId/profile/photo')
  async downloadPhoto(
    @Param('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
    @Res() response: Response,
  ) {
    const actorId = await this.actor.resolveActorId();
    const file = await this.mutations.downloadPhoto(actorId, subjectPersonId);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${file.fileName}"`,
    );
    response.send(file.buffer);
  }

  @Get(':subjectPersonId/profile/certificates/:certificateId/download')
  async downloadCertificate(
    @Param('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
    @Param('certificateId', new ParseUUIDPipe()) certificateId: string,
    @Res() response: Response,
  ) {
    const actorId = await this.actor.resolveActorId();
    const file = await this.mutations.downloadCertificate(
      actorId,
      subjectPersonId,
      certificateId,
    );
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    response.send(file.buffer);
  }
}
