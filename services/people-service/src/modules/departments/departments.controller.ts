import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListDepartmentsQueryDto } from './dto/list-departments.dto';
import { DepartmentsService } from './departments.service';
import { SwaggerListDepartments } from './departments.swagger';

@ApiBearerAuth()
@ApiTags('departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  @SwaggerListDepartments()
  list(@Query() query: ListDepartmentsQueryDto) {
    return this.service.search(query.name);
  }
}
