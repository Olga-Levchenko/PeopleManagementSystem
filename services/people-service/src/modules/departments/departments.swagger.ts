import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { DepartmentEntity } from './entities/department.entity';

export const SwaggerListDepartments = () =>
  applyDecorators(ApiOkResponse({ type: DepartmentEntity, isArray: true }));
