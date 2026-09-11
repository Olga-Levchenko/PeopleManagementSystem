import { ForbiddenException } from '@nestjs/common';
import { ColleagueBrowseGateService } from '../../employees/colleague-browse.gate.service';
import { RequestActorContext } from '../../organisational-relationships/request-actor.context';
import { ProfileController } from '../profile.controller';
import { ProfileService } from '../profile.service';
describe('ProfileController colleague browse gate', () => {
  const subjectPersonId = '22222222-2222-4222-8222-222222222222';
  const viewerId = '11111111-1111-4111-8111-111111111111';

  const profileService = {
    getProfile: jest.fn(),
    patchProfileField: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<ProfileService, 'getProfile' | 'patchProfileField'>
  >;

  const actor = {
    resolveActorId: jest.fn().mockResolvedValue(viewerId),
  } as unknown as RequestActorContext;

  const colleagueBrowseGate = {
    assertManagementBrowseAllowed: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<ColleagueBrowseGateService, 'assertManagementBrowseAllowed'>
  >;

  const controller = new ProfileController(
    profileService as unknown as ProfileService,
    actor,
    colleagueBrowseGate as unknown as ColleagueBrowseGateService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET profile remains available for colleague catalog audience', async () => {
    profileService.getProfile.mockResolvedValue({ s16: [] });
    colleagueBrowseGate.assertManagementBrowseAllowed.mockResolvedValue(
      undefined,
    );

    await controller.getProfile(subjectPersonId);

    expect(profileService.getProfile).toHaveBeenCalledWith(
      viewerId,
      subjectPersonId,
    );
    expect(
      colleagueBrowseGate.assertManagementBrowseAllowed,
    ).not.toHaveBeenCalled();
  });

  it('PATCH profile field returns 403 for colleague catalog audience', async () => {
    colleagueBrowseGate.assertManagementBrowseAllowed.mockRejectedValue(
      new ForbiddenException({
        statusCode: 403,
        error: 'COLLEAGUE_BROWSE_RESTRICTED',
        message: 'blocked',
      }),
    );

    await expect(
      controller.patchProfileField(subjectPersonId, {
        fieldKey: 'countryCity',
        value: 'Kyiv',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(profileService.patchProfileField).not.toHaveBeenCalled();
  });
});
