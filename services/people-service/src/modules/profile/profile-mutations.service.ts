import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  deriveAudienceFromResolution,
  grantsSectionAccess,
  grantsSectionWriteAccess,
} from './profile-audience.util';
import type { AccessRoleResolutionPort } from './profile.ports';
import { NEITHER_LINE_RESOLUTION } from './profile.ports';
import { UploadStorageService } from './upload-storage.service';
import {
  buildPhotoDownloadPath,
  isGatedStorageReference,
  parseGatedStorageReference,
  toGatedStorageReference,
} from './upload.constants';
import {
  extensionForMime,
  validateCertificateUpload,
  validatePhotoUpload,
} from './upload-mime.util';
import type {
  CreateEmergencyContactDto,
  UpdateEmergencyContactDto,
} from './profile.dto';

export interface EmergencyContactResponse {
  id: string;
  contactName: string;
  relationship: string | null;
  phone: string | null;
}

export interface CertificateUploadResponse {
  id: string;
  fileName: string;
  uploadedAt: Date;
}

export interface PhotoUploadResponse {
  photoUrl: string;
}

export interface StoredFilePayload {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

@Injectable()
export class ProfileMutationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadStorage: UploadStorageService,
    @Inject('AccessRoleResolutionPort')
    private readonly accessRoleResolution: AccessRoleResolutionPort,
  ) {}

  async createEmergencyContact(
    actorPersonId: string,
    subjectPersonId: string,
    dto: CreateEmergencyContactDto,
  ): Promise<EmergencyContactResponse> {
    this.assertSelfMutation(actorPersonId, subjectPersonId);
    await this.assertS3Write(actorPersonId, subjectPersonId);

    const contact = await this.prisma.emergencyContact.create({
      data: {
        personId: subjectPersonId,
        contactName: dto.contactName.trim(),
        relationship: dto.relationship?.trim() || null,
        phone: dto.phone?.trim() || null,
      },
    });
    return this.toEmergencyContact(contact);
  }

  async updateEmergencyContact(
    actorPersonId: string,
    subjectPersonId: string,
    contactId: string,
    dto: UpdateEmergencyContactDto,
  ): Promise<EmergencyContactResponse> {
    this.assertSelfMutation(actorPersonId, subjectPersonId);
    await this.assertS3Write(actorPersonId, subjectPersonId);

    const existing = await this.prisma.emergencyContact.findFirst({
      where: { id: contactId, personId: subjectPersonId },
    });
    if (!existing) {
      throw new NotFoundException('Emergency contact not found.');
    }

    const contact = await this.prisma.emergencyContact.update({
      where: { id: contactId },
      data: {
        contactName:
          dto.contactName !== undefined
            ? dto.contactName.trim()
            : existing.contactName,
        relationship:
          dto.relationship !== undefined
            ? dto.relationship?.trim() || null
            : existing.relationship,
        phone:
          dto.phone !== undefined ? dto.phone?.trim() || null : existing.phone,
      },
    });
    return this.toEmergencyContact(contact);
  }

  async deleteEmergencyContact(
    actorPersonId: string,
    subjectPersonId: string,
    contactId: string,
  ): Promise<void> {
    this.assertSelfMutation(actorPersonId, subjectPersonId);
    await this.assertS3Write(actorPersonId, subjectPersonId);

    const existing = await this.prisma.emergencyContact.findFirst({
      where: { id: contactId, personId: subjectPersonId },
    });
    if (!existing) {
      throw new NotFoundException('Emergency contact not found.');
    }
    await this.prisma.emergencyContact.delete({ where: { id: contactId } });
  }

  async uploadPhoto(
    actorPersonId: string,
    subjectPersonId: string,
    file: Express.Multer.File,
  ): Promise<PhotoUploadResponse> {
    this.assertSelfMutation(actorPersonId, subjectPersonId);
    await this.assertS1Write(actorPersonId, subjectPersonId);

    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required.');
    }
    const mimeType = file.mimetype;
    if (!validatePhotoUpload(mimeType, file.buffer)) {
      throw new BadRequestException('Invalid photo file type or content.');
    }

    const fileId = randomUUID();
    const storageKey = this.uploadStorage.buildStorageKey(
      subjectPersonId,
      'photos',
      fileId,
      extensionForMime(mimeType),
    );
    await this.uploadStorage.writeFile(storageKey, file.buffer);

    const person = await this.prisma.person.findUnique({
      where: { id: subjectPersonId },
      select: { photoUrl: true },
    });
    if (!person) {
      throw new NotFoundException('Person not found');
    }

    const previousKey = person.photoUrl
      ? parseGatedStorageReference(person.photoUrl)
      : null;
    if (previousKey) {
      await this.uploadStorage.deleteFile(previousKey);
    }

    const gatedRef = toGatedStorageReference(storageKey);
    await this.prisma.person.update({
      where: { id: subjectPersonId },
      data: { photoUrl: gatedRef },
    });

    return { photoUrl: buildPhotoDownloadPath(subjectPersonId) };
  }

  async uploadCertificate(
    actorPersonId: string,
    subjectPersonId: string,
    file: Express.Multer.File,
  ): Promise<CertificateUploadResponse> {
    this.assertSelfMutation(actorPersonId, subjectPersonId);
    await this.assertS5Write(actorPersonId, subjectPersonId);

    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required.');
    }
    const mimeType = file.mimetype;
    if (!validateCertificateUpload(mimeType, file.buffer)) {
      throw new BadRequestException('Invalid certificate file type or content.');
    }

    const fileId = randomUUID();
    const storageKey = this.uploadStorage.buildStorageKey(
      subjectPersonId,
      'certificates',
      fileId,
      extensionForMime(mimeType),
    );
    await this.uploadStorage.writeFile(storageKey, file.buffer);

    const certificate = await this.prisma.personCertificate.create({
      data: {
        personId: subjectPersonId,
        fileName: file.originalname || `certificate.${extensionForMime(mimeType)}`,
        storageKey,
      },
    });

    return {
      id: certificate.id,
      fileName: certificate.fileName,
      uploadedAt: certificate.uploadedAt,
    };
  }

  async deleteCertificate(
    actorPersonId: string,
    subjectPersonId: string,
    certificateId: string,
  ): Promise<void> {
    this.assertSelfMutation(actorPersonId, subjectPersonId);
    await this.assertS5Write(actorPersonId, subjectPersonId);

    const certificate = await this.prisma.personCertificate.findFirst({
      where: { id: certificateId, personId: subjectPersonId },
    });
    if (!certificate) {
      throw new NotFoundException('Certificate not found.');
    }

    await this.uploadStorage.deleteFile(certificate.storageKey);
    await this.prisma.personCertificate.delete({
      where: { id: certificateId },
    });
  }

  async downloadPhoto(
    viewerPersonId: string,
    subjectPersonId: string,
  ): Promise<StoredFilePayload> {
    const audience = await this.resolveAudience(viewerPersonId, subjectPersonId);
    if (!grantsSectionAccess(audience.s1)) {
      throw new NotFoundException();
    }

    const person = await this.prisma.person.findUnique({
      where: { id: subjectPersonId },
      select: { photoUrl: true },
    });
    if (!person?.photoUrl || !isGatedStorageReference(person.photoUrl)) {
      throw new NotFoundException();
    }

    const storageKey = parseGatedStorageReference(person.photoUrl);
    if (
      !storageKey ||
      !this.uploadStorage.isValidStorageKey(storageKey, subjectPersonId)
    ) {
      throw new NotFoundException();
    }

    const buffer = await this.uploadStorage.readFile(storageKey);
    if (!buffer) {
      throw new NotFoundException();
    }

    return {
      buffer,
      mimeType: this.mimeFromStorageKey(storageKey),
      fileName: 'photo',
    };
  }

  async downloadCertificate(
    viewerPersonId: string,
    subjectPersonId: string,
    certificateId: string,
  ): Promise<StoredFilePayload> {
    const audience = await this.resolveAudience(viewerPersonId, subjectPersonId);
    if (!grantsSectionAccess(audience.s5)) {
      throw new NotFoundException();
    }

    const certificate = await this.prisma.personCertificate.findFirst({
      where: { id: certificateId, personId: subjectPersonId },
    });
    if (
      !certificate ||
      !this.uploadStorage.isValidStorageKey(
        certificate.storageKey,
        subjectPersonId,
      )
    ) {
      throw new NotFoundException();
    }

    const buffer = await this.uploadStorage.readFile(certificate.storageKey);
    if (!buffer) {
      throw new NotFoundException();
    }

    return {
      buffer,
      mimeType: this.mimeFromStorageKey(certificate.storageKey),
      fileName: certificate.fileName,
    };
  }

  private assertSelfMutation(actorPersonId: string, subjectPersonId: string): void {
    if (actorPersonId !== subjectPersonId) {
      throw new ForbiddenException();
    }
  }

  private async assertS3Write(
    viewerPersonId: string,
    subjectPersonId: string,
  ): Promise<void> {
    const audience = await this.resolveAudience(viewerPersonId, subjectPersonId);
    if (!grantsSectionWriteAccess(audience.s3)) {
      throw new ForbiddenException();
    }
  }

  private async assertS1Write(
    viewerPersonId: string,
    subjectPersonId: string,
  ): Promise<void> {
    const audience = await this.resolveAudience(viewerPersonId, subjectPersonId);
    if (!grantsSectionWriteAccess(audience.s1)) {
      throw new ForbiddenException();
    }
  }

  private async assertS5Write(
    viewerPersonId: string,
    subjectPersonId: string,
  ): Promise<void> {
    const audience = await this.resolveAudience(viewerPersonId, subjectPersonId);
    if (!grantsSectionWriteAccess(audience.s5)) {
      throw new ForbiddenException();
    }
  }

  private async resolveAudience(
    viewerPersonId: string,
    subjectPersonId: string,
  ) {
    const resolution =
      viewerPersonId === subjectPersonId
        ? NEITHER_LINE_RESOLUTION
        : await this.accessRoleResolution.resolve(
            viewerPersonId,
            subjectPersonId,
          );
    return deriveAudienceFromResolution(
      resolution,
      viewerPersonId,
      subjectPersonId,
    );
  }

  private toEmergencyContact(contact: {
    id: string;
    contactName: string;
    relationship: string | null;
    phone: string | null;
  }): EmergencyContactResponse {
    return {
      id: contact.id,
      contactName: contact.contactName,
      relationship: contact.relationship,
      phone: contact.phone,
    };
  }

  private mimeFromStorageKey(storageKey: string): string {
    const extension = storageKey.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'pdf':
        return 'application/pdf';
      default:
        return 'application/octet-stream';
    }
  }
}
