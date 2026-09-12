import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

export const CAMPAIGN_ACTIVATED_EVENT_SCHEMA_VERSION = 1

export interface CampaignActivatedEvent {
  eventId: string
  schemaVersion: typeof CAMPAIGN_ACTIVATED_EVENT_SCHEMA_VERSION
  occurredAtUtc: string
  source: {
    service: 'work-management-service'
    aggregateType: 'campaign'
    aggregateId: string
    aggregateVersion: number
  }
  campaignId: string
  title: string
  description?: string
  linkUrl: string
  dueDate: string
  authorPersonId: string
  recipientPersonIds: string[]
}

let validateCampaignActivatedEventFn:
  | ((data: unknown) => boolean)
  | undefined

/** Validates wire payloads against the published v1 JSON Schema. */
export function validateCampaignActivatedEvent(data: unknown): boolean {
  if (!validateCampaignActivatedEventFn) {
    const schemaPath = join(
      __dirname,
      '../schemas/campaign-activated-event.v1.schema.json',
    )
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object
    const ajv = new Ajv2020({ allErrors: true })
    addFormats(ajv)
    validateCampaignActivatedEventFn = ajv.compile(schema)
  }

  return validateCampaignActivatedEventFn(data)
}
