import { deepStrictEqual, strictEqual } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  RELATIONSHIP_EVENT_SCHEMA_VERSION,
  type RelationshipChangedEvent,
} from '../src/index'

const FIXTURE_NAMES = [
  'grant',
  'revoke',
  'replacement',
  'no-op',
] as const

const schemaPath = join(__dirname, '../schemas/relationship-changed-event.v1.schema.json')

const typedGrantFixture = {
  eventId: '11111111-1111-4111-8111-111111111111',
  schemaVersion: 1,
  occurredAtUtc: '2026-08-31T12:00:00.000Z',
  source: {
    service: 'people-service',
    aggregateType: 'person',
    aggregateId: '22222222-2222-4222-8222-222222222222',
    aggregateVersion: 1,
  },
  relationship: {
    type: 'reports_to',
    subjectId: '22222222-2222-4222-8222-222222222222',
    beforeId: null,
    afterId: '33333333-3333-4333-8333-333333333333',
  },
  accessEffect: 'grant',
} satisfies RelationshipChangedEvent

const createValidator = async () => {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
  const ajv = new Ajv2020({ allErrors: true })
  addFormats(ajv)
  return ajv.compile(schema)
}

const readFixture = async (name: (typeof FIXTURE_NAMES)[number]) =>
  JSON.parse(
    await readFile(
      join(__dirname, `../fixtures/relationship-changed-event.${name}.v1.json`),
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
  const fixture = await readFixture('grant')

  deepStrictEqual(typedGrantFixture, fixture)
  strictEqual(typedGrantFixture.schemaVersion, RELATIONSHIP_EVENT_SCHEMA_VERSION)
})

test('the schema rejects unknown versions and relationship values', async () => {
  const validate = await createValidator()
  const fixture = await readFixture('grant') as Record<string, unknown>

  strictEqual(validate({ ...fixture, schemaVersion: 2 }), false)
  strictEqual(
    validate({
      ...fixture,
      relationship: {
        ...(fixture.relationship as object),
        type: 'unknown_relationship',
      },
    }),
    false,
  )
})

test('the schema rejects unknown event properties', async () => {
  const validate = await createValidator()
  const fixture = await readFixture('grant') as Record<string, unknown>

  strictEqual(validate({ ...fixture, unexpected: true }), false)
})
