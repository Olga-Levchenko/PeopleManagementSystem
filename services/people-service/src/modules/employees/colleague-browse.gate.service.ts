import { Injectable } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { assertColleagueCatalogAudience } from './employees-colleague.util';

@Injectable()
export class ColleagueBrowseGateService {
  constructor(private readonly employeesService: EmployeesService) {}

  async assertManagementBrowseAllowed(viewerPersonId: string): Promise<void> {
    const catalog = await this.employeesService.getFieldCatalog(viewerPersonId);
    assertColleagueCatalogAudience(catalog.listAudienceLevel);
  }
}
