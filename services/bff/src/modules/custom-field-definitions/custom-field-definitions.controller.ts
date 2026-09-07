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
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  CustomFieldDefinitionsService,
  ProxyContext,
} from './custom-field-definitions.service';

@ApiBearerAuth()
@Controller('custom-field-definitions')
export class CustomFieldDefinitionsController {
  constructor(private readonly service: CustomFieldDefinitionsService) {}

  @Get()
  list(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(response, this.service.list(this.context(request)));
  }

  @Post()
  create(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.create(body, this.context(request)),
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.update(id, body, this.context(request)),
    );
  }

  @Delete(':id')
  deactivate(
    @Param('id') id: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.deactivate(id, this.context(request)),
    );
  }

  private context(request: Request): ProxyContext {
    return {
      authorization: request.headers.authorization,
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
