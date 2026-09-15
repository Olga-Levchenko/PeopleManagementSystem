import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ManagementNotesController } from './management-notes.controller';
import { ManagementNotesService } from './management-notes.service';

@Module({
  imports: [AuthModule],
  controllers: [ManagementNotesController],
  providers: [ManagementNotesService],
})
export class ManagementNotesModule {}
