import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { OidcService } from '../auth/oidc.service';
import type { BffSession } from '../auth/session.types';
import {
  AssignFunctionalRoleDto,
  CreateFunctionalRoleDto,
  DeactivateFunctionalRoleDto,
  GrantPermissionDto,
  PersonParamsDto,
  PersonRoleParamsDto,
  RevokePermissionQueryDto,
  RoleKeyParamsDto,
  RolePermissionParamsDto,
  UpdateFunctionalRoleDto,
} from './dto/functional-role.dto';
import {
  FunctionalRolesService,
  ProxyContext,
} from './functional-roles.service';

@ApiBearerAuth()
@Controller()
export class FunctionalRolesController {
  constructor(
    private readonly service: FunctionalRolesService,
    private readonly oidc: OidcService,
  ) {}

  @Get('permissions/catalogue')
  async getCatalogue(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.getCatalogue(await this.context(request)),
    );
  }

  @Get('functional-roles')
  async getRoles(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.getRoles(await this.context(request)),
    );
  }

  @Get('functional-roles/:roleKey')
  async getRole(
    @Param() params: RoleKeyParamsDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.getRole(params.roleKey, await this.context(request)),
    );
  }

  @Get('functional-roles/:roleKey/permissions')
  async getRolePermissions(
    @Param() params: RoleKeyParamsDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.getRolePermissions(
        params.roleKey,
        await this.context(request),
      ),
    );
  }

  @Post('functional-roles')
  async createRole(
    @Body() body: CreateFunctionalRoleDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.createRole(
        body,
        await this.context(request, idempotencyKey),
      ),
    );
  }

  @Patch('functional-roles/:roleKey')
  async updateRole(
    @Param() params: RoleKeyParamsDto,
    @Body() body: UpdateFunctionalRoleDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.updateRole(
        params.roleKey,
        body,
        await this.context(request),
      ),
    );
  }

  @Post('functional-roles/:roleKey/deactivate')
  async deactivateRole(
    @Param() params: RoleKeyParamsDto,
    @Body() body: DeactivateFunctionalRoleDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.deactivateRole(
        params.roleKey,
        body,
        await this.context(request),
      ),
    );
  }

  @Put('functional-roles/:roleKey/permissions/:permissionKey')
  async grantPermission(
    @Param() params: RolePermissionParamsDto,
    @Body() body: GrantPermissionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.grantPermission(
        params.roleKey,
        params.permissionKey,
        body,
        await this.context(request, idempotencyKey),
      ),
    );
  }

  @Delete('functional-roles/:roleKey/permissions/:permissionKey')
  async revokePermission(
    @Param() params: RolePermissionParamsDto,
    @Query() query: RevokePermissionQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.revokePermission(
        params.roleKey,
        params.permissionKey,
        query.scope,
        await this.context(request),
      ),
    );
  }

  @Post('people/:personId/functional-roles')
  async assignRole(
    @Param() params: PersonParamsDto,
    @Body() body: AssignFunctionalRoleDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.assignRole(
        params.personId,
        body,
        await this.context(request, idempotencyKey),
      ),
    );
  }

  @Delete('people/:personId/functional-roles/:roleKey')
  async revokeRole(
    @Param() params: PersonRoleParamsDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.revokeRole(
        params.personId,
        params.roleKey,
        await this.context(request),
      ),
    );
  }

  @Get('people/:personId/functional-roles')
  async getAssignments(
    @Param() params: PersonParamsDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.getAssignments(params.personId, await this.context(request)),
    );
  }

  private async context(
    request: Request,
    idempotencyKey?: string,
  ): Promise<ProxyContext> {
    const session = request.session as BffSession | undefined;
    return {
      authorization: await this.oidc.resolveAuthorization(
        session,
        request.headers.authorization,
        'access-control-service',
      ),
      correlationId: request.correlationId,
      idempotencyKey,
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
