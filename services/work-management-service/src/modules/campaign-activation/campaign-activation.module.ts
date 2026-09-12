import { Module } from '@nestjs/common';
import { CampaignActivationProcessor } from './campaign-activation.processor';
import { InProcessCampaignActivationPublisher } from './campaign-activation.publisher';

@Module({
  providers: [
    CampaignActivationProcessor,
    InProcessCampaignActivationPublisher,
    {
      provide: 'CampaignActivationPublisher',
      useExisting: InProcessCampaignActivationPublisher,
    },
  ],
  exports: [CampaignActivationProcessor, 'CampaignActivationPublisher'],
})
export class CampaignActivationModule {}
