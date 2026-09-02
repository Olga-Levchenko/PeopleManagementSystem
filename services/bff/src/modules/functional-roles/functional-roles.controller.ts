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
  constructor(private readonly service: FunctionalRolesService) {}

  @Get('permissions/catalogue')
  getCatalogue(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.getCatalogue(this.context(request)),
    );
  }

  @Get('functional-roles')
  getRoles(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(response, this.service.getRoles(this.context(request)));
  }

  @Get('functional-roles/:roleKey')
  getRole(
    @Param() params: RoleKeyParamsDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.getRole(params.roleKey, this.context(request)),
    );
  }

  @Get('functional-roles/:roleKey/permissions')
  getRolePermissions(
    @Param() params: RoleKeyParamsDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.getRolePermissions(params.roleKey, this.context(request)),
    );
  }

  @Post('functional-roles')
  createRole(
    @Body() body: CreateFunctionalRoleDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.createRole(body, this.context(request, idempotencyKey)),
    );
  }

  @Patch('functional-roles/:roleKey')
  updateRole(
    @Param() params: RoleKeyParamsDto,
    @Body() body: UpdateFunctionalRoleDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.updateRole(params.roleKey, body, this.context(request)),
    );
  }

  @Post('functional-roles/:roleKey/deactivate')
  deactivateRole(
    @Param() params: RoleKeyParamsDto,
    @Body() body: DeactivateFunctionalRoleDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.deactivateRole(params.roleKey, body, this.context(request)),
    );
  }

  @Put('functional-roles/:roleKey/permissions/:permissionKey')
  grantPermission(
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
        this.context(request, idempotencyKey),
      ),
    );
  }

  @Delete('functional-roles/:roleKey/permissions/:permissionKey')
  revokePermission(
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
        this.context(request),
      ),
    );
  }

  @Post('people/:personId/functional-roles')
  assignRole(
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
        this.context(request, idempotencyKey),
      ),
    );
  }

  @Delete('people/:personId/functional-roles/:roleKey')
  revokeRole(
    @Param() params: PersonRoleParamsDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.revokeRole(
        params.personId,
        params.roleKey,
        this.context(request),
      ),
    );
  }

  @Get('people/:personId/functional-roles')
  getAssignments(
    @Param() params: PersonParamsDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.getAssignments(params.personId, this.context(request)),
    );
  }

  private context(request: Request, idempotencyKey?: string): ProxyContext {
    return {
      authorization: request.headers.authorization,
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
