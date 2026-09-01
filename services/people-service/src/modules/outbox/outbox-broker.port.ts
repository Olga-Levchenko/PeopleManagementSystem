import type { RelationshipChangedEvent } from '../../../../../libs/contracts/relationship-events'

export interface OutboxBroker {
  publish(
    event: RelationshipChangedEvent,
    routingKey: string,
  ): Promise<void>
}
