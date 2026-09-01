import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { OrganisationalRelationshipsController } from '../organisational-relationships.controller'
import { OrganisationalRelationshipsService } from '../organisational-relationships.service'
import { RequestActorContext } from '../request-actor.context'

describe('OrganisationalRelationshipsController', () => {
  const service = {
    changeManager: jest.fn(),
    changePeoplePartner: jest.fn(),
    changeDepartment: jest.fn(),
    changeDepartmentManager: jest.fn(),
  } as unknown as OrganisationalRelationshipsService
  const actor = { actorId: 'actor-id' } as RequestActorContext
  const controller = new OrganisationalRelationshipsController(service, actor)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('delegates manager changes with the authenticated actor', () => {
    controller.changeManager('person-id', { relatedPersonId: 'manager-id' })

    expect(service.changeManager).toHaveBeenCalledWith('actor-id', 'person-id', 'manager-id')
  })

  it('delegates People Partner changes with the authenticated actor', () => {
    controller.changePeoplePartner('person-id', { relatedPersonId: 'partner-id' })

    expect(service.changePeoplePartner).toHaveBeenCalledWith(
      'actor-id',
      'person-id',
      'partner-id',
    )
  })

  it('delegates department membership changes with the authenticated actor', () => {
    controller.changeDepartment('person-id', { departmentId: 'department-id' })

    expect(service.changeDepartment).toHaveBeenCalledWith(
      'actor-id',
      'person-id',
      'department-id',
    )
  })

  it('delegates department membership clearing with null', () => {
    controller.changeDepartment('person-id', { departmentId: null })

    expect(service.changeDepartment).toHaveBeenCalledWith('actor-id', 'person-id', null)
  })

  it('delegates department manager changes with the authenticated actor', () => {
    controller.changeDepartmentManager('department-id', { relatedPersonId: 'manager-id' })

    expect(service.changeDepartmentManager).toHaveBeenCalledWith(
      'actor-id',
      'department-id',
      'manager-id',
    )
  })

  describe('route parameter validation', () => {
    let app: INestApplication

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        controllers: [OrganisationalRelationshipsController],
        providers: [
          { provide: OrganisationalRelationshipsService, useValue: service },
          { provide: RequestActorContext, useValue: actor },
        ],
      }).compile()

      app = module.createNestApplication()
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      )
      await app.init()
    })

    afterAll(async () => {
      await app.close()
    })

    it.each([
      '/organisational-relationships/people/not-a-uuid/manager',
      '/organisational-relationships/people/not-a-uuid/people-partner',
      '/organisational-relationships/people/not-a-uuid/department',
      '/organisational-relationships/departments/not-a-uuid/manager',
    ])('returns 400 for an invalid route identifier: %s', async path => {
      await request(app.getHttpServer()).patch(path).send({}).expect(400)

      expect(service.changeManager).not.toHaveBeenCalledWith('not-a-uuid', expect.anything())
      expect(service.changePeoplePartner).not.toHaveBeenCalledWith('not-a-uuid', expect.anything())
      expect(service.changeDepartment).not.toHaveBeenCalledWith('not-a-uuid', expect.anything())
      expect(service.changeDepartmentManager).not.toHaveBeenCalledWith(
        'not-a-uuid',
        expect.anything(),
      )
    })

    it.each([{}, { departmentId: '' }])(
      'returns 400 when departmentId is omitted or empty: %j',
      async body => {
        await request(app.getHttpServer())
          .patch('/organisational-relationships/people/22222222-2222-4222-8222-222222222222/department')
          .send(body)
          .expect(400)

        expect(service.changeDepartment).not.toHaveBeenCalled()
      },
    )

    it.each([{ departmentId: null }, { departmentId: '33333333-3333-4333-8333-333333333333' }])(
      'accepts an explicit null or UUID departmentId: %j',
      async body => {
        await request(app.getHttpServer())
          .patch('/organisational-relationships/people/22222222-2222-4222-8222-222222222222/department')
          .send(body)
          .expect(200)

        expect(service.changeDepartment).toHaveBeenCalledWith(
          'actor-id',
          '22222222-2222-4222-8222-222222222222',
          body.departmentId,
        )
      },
    )
  })
})
