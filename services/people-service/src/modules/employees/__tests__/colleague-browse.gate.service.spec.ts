import { ForbiddenException } from '@nestjs/common';
import { ColleagueBrowseGateService } from '../colleague-browse.gate.service';
import type { EmployeesService } from '../employees.service';

describe('ColleagueBrowseGateService', () => {
  const viewerId = '11111111-1111-4111-8111-111111111111';

  const employeesService = {
    getFieldCatalog: jest.fn(),
  } as unknown as jest.Mocked<Pick<EmployeesService, 'getFieldCatalog'>>;

  const gate = new ColleagueBrowseGateService(
    employeesService as unknown as EmployeesService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows management catalog audience', async () => {
    employeesService.getFieldCatalog.mockResolvedValue({
      fields: [],
      listAudienceLevel: 'management',
    });

    await expect(
      gate.assertManagementBrowseAllowed(viewerId),
    ).resolves.toBeUndefined();
  });

  it('rejects colleague catalog audience with COLLEAGUE_BROWSE_RESTRICTED', async () => {
    employeesService.getFieldCatalog.mockResolvedValue({
      fields: [],
      listAudienceLevel: 'colleague',
    });

    await expect(
      gate.assertManagementBrowseAllowed(viewerId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      gate.assertManagementBrowseAllowed(viewerId),
    ).rejects.toMatchObject({
      response: {
        statusCode: 403,
        error: 'COLLEAGUE_BROWSE_RESTRICTED',
      },
    });
  });
});
