import { ForbiddenException } from '@nestjs/common';
import { ColleagueBrowseGateService } from '../colleague-browse.gate.service';
import { RequestActorContext } from '../../organisational-relationships/request-actor.context';
import { SavedViewsController } from '../saved-views.controller';
import { SavedViewsService } from '../saved-views.service';

describe('SavedViewsController colleague browse gate', () => {
  const viewerId = '11111111-1111-4111-8111-111111111111';
  const viewId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const savedViewsService = {
    listSavedViews: jest.fn(),
    createSavedView: jest.fn(),
    updateSavedView: jest.fn(),
    deleteSavedView: jest.fn(),
    shareSavedView: jest.fn(),
    revokeShare: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<
      SavedViewsService,
      | 'listSavedViews'
      | 'createSavedView'
      | 'updateSavedView'
      | 'deleteSavedView'
      | 'shareSavedView'
      | 'revokeShare'
    >
  >;

  const actor = {
    actorId: viewerId,
  } as RequestActorContext;

  const colleagueBrowseGate = {
    assertManagementBrowseAllowed: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<ColleagueBrowseGateService, 'assertManagementBrowseAllowed'>
  >;

  const controller = new SavedViewsController(
    savedViewsService as unknown as SavedViewsService,
    actor,
    colleagueBrowseGate as unknown as ColleagueBrowseGateService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    colleagueBrowseGate.assertManagementBrowseAllowed.mockResolvedValue(
      undefined,
    );
  });

  it('listSavedViews returns 403 for colleague catalog audience', async () => {
    colleagueBrowseGate.assertManagementBrowseAllowed.mockRejectedValue(
      new ForbiddenException({
        statusCode: 403,
        error: 'COLLEAGUE_BROWSE_RESTRICTED',
        message: 'blocked',
      }),
    );

    await expect(controller.listSavedViews()).rejects.toMatchObject({
      response: {
        statusCode: 403,
        error: 'COLLEAGUE_BROWSE_RESTRICTED',
      },
    });

    expect(savedViewsService.listSavedViews).not.toHaveBeenCalled();
  });

  it('createSavedView returns 403 for colleague catalog audience', async () => {
    colleagueBrowseGate.assertManagementBrowseAllowed.mockRejectedValue(
      new ForbiddenException({
        statusCode: 403,
        error: 'COLLEAGUE_BROWSE_RESTRICTED',
        message: 'blocked',
      }),
    );

    await expect(
      controller.createSavedView({
        name: 'My view',
        pageSize: 50,
        configuration: { visibleColumnKeys: ['fullName'], filters: {} },
      }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 403,
        error: 'COLLEAGUE_BROWSE_RESTRICTED',
      },
    });

    expect(savedViewsService.createSavedView).not.toHaveBeenCalled();
  });

  it('deleteSavedView returns 403 for colleague catalog audience', async () => {
    colleagueBrowseGate.assertManagementBrowseAllowed.mockRejectedValue(
      new ForbiddenException({
        statusCode: 403,
        error: 'COLLEAGUE_BROWSE_RESTRICTED',
        message: 'blocked',
      }),
    );

    await expect(controller.deleteSavedView(viewId)).rejects.toMatchObject({
      response: {
        statusCode: 403,
        error: 'COLLEAGUE_BROWSE_RESTRICTED',
      },
    });

    expect(savedViewsService.deleteSavedView).not.toHaveBeenCalled();
  });
});
