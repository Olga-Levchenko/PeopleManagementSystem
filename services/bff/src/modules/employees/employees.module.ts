import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeesController } from './employees.controller';
import { PeopleController } from './people.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [AuthModule],
  controllers: [EmployeesController, PeopleController],
  providers: [EmployeesService],
})
export class EmployeesModule {}
