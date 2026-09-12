import { ForbiddenException } from '@nestjs/common';
import { ColleagueBrowseGateService } from '../../employees/colleague-browse.gate.service';
import { RequestActorContext } from '../../organisational-relationships/request-actor.context';
import { ProfileController } from '../profile.controller';
import { ProfileMutationsService } from '../profile-mutations.service';
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

  const mutations = {
    createEmergencyContact: jest.fn(),
    uploadPhoto: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<ProfileMutationsService, 'createEmergencyContact' | 'uploadPhoto'>
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
    mutations as unknown as ProfileMutationsService,
    actor,
    colleagueBrowseGate as unknown as ColleagueBrowseGateService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET profile remains available for colleague catalog audience', async () => {
    profileService.getProfile.mockResolvedValue({ isSelf: false, s16: [] });
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

  it('PATCH profile field bypasses colleague browse gate when viewer is subject', async () => {
    profileService.patchProfileField.mockResolvedValue({
      fieldKey: 'personalPhone',
      value: '+380111111111',
    });

    await controller.patchProfileField(viewerId, {
      fieldKey: 'personalPhone',
      value: '+380111111111',
    });

    expect(
      colleagueBrowseGate.assertManagementBrowseAllowed,
    ).not.toHaveBeenCalled();
    expect(profileService.patchProfileField).toHaveBeenCalledWith(
      viewerId,
      viewerId,
      'personalPhone',
      '+380111111111',
    );
  });

  it('POST emergency contact bypasses colleague browse gate when viewer is subject', async () => {
    mutations.createEmergencyContact.mockResolvedValue({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      contactName: 'Contact',
      relationship: null,
      phone: null,
    });

    await controller.createEmergencyContact(viewerId, {
      contactName: 'Contact',
    });

    expect(
      colleagueBrowseGate.assertManagementBrowseAllowed,
    ).not.toHaveBeenCalled();
    expect(mutations.createEmergencyContact).toHaveBeenCalledWith(
      viewerId,
      viewerId,
      { contactName: 'Contact' },
    );
  });

  it('POST emergency contact enforces colleague browse gate for non-self viewer', async () => {
    colleagueBrowseGate.assertManagementBrowseAllowed.mockRejectedValue(
      new ForbiddenException({
        statusCode: 403,
        error: 'COLLEAGUE_BROWSE_RESTRICTED',
        message: 'blocked',
      }),
    );

    await expect(
      controller.createEmergencyContact(subjectPersonId, {
        contactName: 'Blocked',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(mutations.createEmergencyContact).not.toHaveBeenCalled();
  });
});
