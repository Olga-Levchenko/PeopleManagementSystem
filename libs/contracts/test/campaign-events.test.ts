import { deepStrictEqual, strictEqual } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  CAMPAIGN_ACTIVATED_EVENT_SCHEMA_VERSION,
  validateCampaignActivatedEvent,
  type CampaignActivatedEvent,
} from '../src/index'

const FIXTURE_NAMES = ['happy-path', 'empty-recipients'] as const

const schemaPath = join(
  __dirname,
  '../schemas/campaign-activated-event.v1.schema.json',
)

const typedHappyPathFixture = {
  eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  schemaVersion: 1,
  occurredAtUtc: '2026-09-12T10:00:00.000Z',
  source: {
    service: 'work-management-service',
    aggregateType: 'campaign',
    aggregateId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    aggregateVersion: 1,
  },
  campaignId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  title: 'Quarterly security training',
  description: 'Complete the external form before the due date.',
  linkUrl: 'https://forms.example.test/security-q3',
  dueDate: '2026-10-01T00:00:00.000Z',
  authorPersonId: 'cccccccc-0000-0000-0000-000000000006',
  recipientPersonIds: [
    'cccccccc-0000-0000-0000-00000000000b',
    'cccccccc-0000-0000-0000-00000000000c',
  ],
} satisfies CampaignActivatedEvent

const createValidator = async () => {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
  const ajv = new Ajv2020({ allErrors: true })
  addFormats(ajv)
  return ajv.compile(schema)
}

const readFixture = async (name: (typeof FIXTURE_NAMES)[number]) =>
  JSON.parse(
    await readFile(
      join(__dirname, `../fixtures/campaign-activated-event.${name}.v1.json`),
      'utf8',
    ),
  ) as unknown

test('all v1 fixtures satisfy the published JSON Schema', async () => {
  const validate = await createValidator()

  for (const fixtureName of FIXTURE_NAMES) {
    const fixture = await readFixture(fixtureName)
    strictEqual(validate(fixture), true, `${fixtureName} fixture is invalid`)
  }
})

test('v1 fixtures round-trip through JSON without changing their wire shape', async () => {
  for (const fixtureName of FIXTURE_NAMES) {
    const fixture = await readFixture(fixtureName)
    deepStrictEqual(JSON.parse(JSON.stringify(fixture)), fixture)
  }
})

test('the exported TypeScript contract describes a representative fixture', async () => {
  const fixture = await readFixture('happy-path')

  deepStrictEqual(typedHappyPathFixture, fixture)
  strictEqual(
    typedHappyPathFixture.schemaVersion,
    CAMPAIGN_ACTIVATED_EVENT_SCHEMA_VERSION,
  )
})

test('the schema rejects unknown versions and missing required fields', async () => {
  const validate = await createValidator()
  const fixture = await readFixture('happy-path') as Record<string, unknown>

  strictEqual(validate({ ...fixture, schemaVersion: 2 }), false)
  strictEqual(validate({ ...fixture, campaignId: undefined }), false)
})

test('the schema rejects unknown event properties', async () => {
  const validate = await createValidator()
  const fixture = await readFixture('happy-path') as Record<string, unknown>

  strictEqual(validate({ ...fixture, unexpected: true }), false)
})

test('the schema rejects whitespace-only titles', async () => {
  const validate = await createValidator()
  const fixture = await readFixture('happy-path') as Record<string, unknown>

  strictEqual(validate({ ...fixture, title: '   ' }), false)
})

test('the exported runtime validator accepts happy-path fixtures', async () => {
  for (const fixtureName of FIXTURE_NAMES) {
    const fixture = await readFixture(fixtureName)
    strictEqual(
      validateCampaignActivatedEvent(fixture),
      true,
      `${fixtureName} fixture is invalid`,
    )
  }
})
