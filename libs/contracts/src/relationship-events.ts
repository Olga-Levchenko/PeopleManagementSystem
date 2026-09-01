export const RELATIONSHIP_EVENT_SCHEMA_VERSION = 1

export type RelationshipType =
  | 'reports_to'
  | 'pp_assignment'
  | 'department_membership'
  | 'department_manager'

export type AccessEffect = 'grant' | 'revoke' | 'both' | 'none'

export interface RelationshipChangedEvent {
  eventId: string
  schemaVersion: typeof RELATIONSHIP_EVENT_SCHEMA_VERSION
  occurredAtUtc: string
  source: {
    service: 'people-service'
    aggregateType: 'person' | 'department'
    aggregateId: string
    aggregateVersion: number
  }
  relationship: {
    type: RelationshipType
    subjectId: string
    beforeId: string | null
    afterId: string | null
  }
  accessEffect: AccessEffect
}
