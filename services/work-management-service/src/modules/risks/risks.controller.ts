import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequestActorContext } from '../identity/request-actor.context';
import { CreateRiskRecordDto } from './dto/create-risk-record.dto';
import { RiskDashboardQueryDto } from './dto/risk-dashboard-query.dto';
import { RisksService } from './risks.service';
import {
  SwaggerAppendRiskRecord,
  SwaggerGetRiskHistory,
} from './risks.swagger';

@ApiBearerAuth()
@ApiTags('risks')
@Controller('risks')
export class RisksController {
  constructor(
    private readonly service: RisksService,
    private readonly actor: RequestActorContext,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @SwaggerAppendRiskRecord()
  async appendRiskRecord(@Body() dto: CreateRiskRecordDto) {
    const viewerPersonId = await this.actor.resolveActorId();
    return this.service.appendRiskRecord(
      viewerPersonId,
      dto,
      this.actor.accessToken,
    );
  }

  @Get()
  @SwaggerGetRiskHistory()
  async getRiskHistory(
    @Query('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
  ) {
    const viewerPersonId = await this.actor.resolveActorId();
    return this.service.getRiskHistory(
      viewerPersonId,
      subjectPersonId,
      this.actor.accessToken,
    );
  }

  @Get('dashboard')
  async getDashboard(@Query() query: RiskDashboardQueryDto) {
    const viewerPersonId = await this.actor.resolveActorId();
    return this.service.getDashboard(
      viewerPersonId,
      query,
      this.actor.accessToken,
    );
  }
}
