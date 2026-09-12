import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  validateCampaignActivatedEvent,
  type CampaignActivatedEvent,
} from '@pms/contracts';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignActivatedEventDto } from './dto/campaign-activated-event.dto';

export interface CampaignActivationResult {
  eventId: string;
  createdCount: number;
  skippedAsDuplicateEvent: boolean;
}

@Injectable()
export class CampaignActivationProcessor {
  private readonly logger = new Logger(CampaignActivationProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(
    event: CampaignActivatedEvent,
  ): Promise<CampaignActivationResult> {
    const dto = await this.validateEvent(event);

    const existing =
      await this.prisma.processedCampaignActivationEvent.findUnique({
        where: { eventId: dto.eventId },
      });
    if (existing) {
      this.logger.log(
        `Campaign activation event ${dto.eventId} already processed; skipping`,
      );
      return {
        eventId: dto.eventId,
        createdCount: 0,
        skippedAsDuplicateEvent: true,
      };
    }

    const uniqueRecipients = [...new Set(dto.recipientPersonIds)];
    const dueDate = new Date(dto.dueDate);

    try {
      const createdCount = await this.prisma.$transaction(async (tx) => {
        await tx.processedCampaignActivationEvent.create({
          data: { eventId: dto.eventId },
        });

        if (uniqueRecipients.length === 0) {
          return 0;
        }

        const result = await tx.actionItem.createMany({
          data: uniqueRecipients.map((assigneePersonId) => ({
            title: dto.title,
            description: dto.description ?? null,
            assigneePersonId,
            authorPersonId: dto.authorPersonId,
            dueDate,
            linkUrl: dto.linkUrl,
            campaignId: dto.campaignId,
            status: 'open',
            source: 'campaign',
            completionDate: null,
            cancelReason: null,
          })),
          skipDuplicates: true,
        });

        return result.count;
      });

      this.logger.log(
        `Campaign activation event ${dto.eventId} created ${createdCount} action item(s) for campaign ${dto.campaignId}`,
      );

      return {
        eventId: dto.eventId,
        createdCount,
        skippedAsDuplicateEvent: false,
      };
    } catch (error) {
      if (this.isDuplicateEventIdError(error)) {
        this.logger.log(
          `Campaign activation event ${dto.eventId} already processed concurrently; skipping`,
        );
        return {
          eventId: dto.eventId,
          createdCount: 0,
          skippedAsDuplicateEvent: true,
        };
      }
      throw error;
    }
  }

  private isDuplicateEventIdError(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = error.meta?.target;
    if (Array.isArray(target)) {
      return target.includes('eventId');
    }
    if (typeof target === 'string') {
      return target.includes('eventId');
    }

    return false;
  }

  private async validateEvent(
    event: CampaignActivatedEvent,
  ): Promise<CampaignActivatedEventDto> {
    if (!validateCampaignActivatedEvent(event)) {
      this.logger.warn(
        `Rejected campaign activation event ${event.eventId}: JSON Schema validation failed`,
      );
      throw new BadRequestException('Invalid campaign activation event');
    }

    const dto = plainToInstance(CampaignActivatedEventDto, event);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const reason = this.summarizeValidationErrors(errors);
      this.logger.warn(
        `Rejected campaign activation event ${event.eventId}: ${reason}`,
      );
      throw new BadRequestException('Invalid campaign activation event');
    }

    if (dto.source.aggregateId !== dto.campaignId) {
      this.logger.warn(
        `Rejected campaign activation event ${dto.eventId}: aggregateId mismatch`,
      );
      throw new BadRequestException('Invalid campaign activation event');
    }

    return dto;
  }

  private summarizeValidationErrors(errors: ValidationError[]): string {
    const messages: string[] = [];

    const walk = (validationErrors: ValidationError[], prefix = ''): void => {
      for (const error of validationErrors) {
        if (error.constraints) {
          messages.push(
            ...Object.values(error.constraints).map(
              (message) => `${prefix}${message}`,
            ),
          );
        }
        if (error.children?.length) {
          walk(error.children, `${prefix}${error.property}.`);
        }
      }
    };

    walk(errors);
    return messages.join('; ');
  }
}
