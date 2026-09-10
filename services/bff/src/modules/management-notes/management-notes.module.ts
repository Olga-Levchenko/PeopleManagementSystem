import { Module } from '@nestjs/common';
import { ManagementNotesController } from './management-notes.controller';
import { ManagementNotesService } from './management-notes.service';

@Module({
  controllers: [ManagementNotesController],
  providers: [ManagementNotesService],
})
export class ManagementNotesModule {}
