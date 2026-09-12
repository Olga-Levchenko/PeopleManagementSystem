import { Injectable } from '@nestjs/common';
import type { CampaignActivatedEvent } from '@pms/contracts';
import {
  CampaignActivationProcessor,
  type CampaignActivationResult,
} from './campaign-activation.processor';

export interface CampaignActivationPublisher {
  publish(event: CampaignActivatedEvent): Promise<CampaignActivationResult>;
}

@Injectable()
export class InProcessCampaignActivationPublisher implements CampaignActivationPublisher {
  constructor(private readonly processor: CampaignActivationProcessor) {}

  async publish(
    event: CampaignActivatedEvent,
  ): Promise<CampaignActivationResult> {
    return this.processor.process(event);
  }
}
