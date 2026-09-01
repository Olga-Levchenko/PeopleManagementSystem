import type { RelationshipChangedEvent } from '@pms/contracts';

export interface OutboxBroker {
  publish(event: RelationshipChangedEvent, routingKey: string): Promise<void>;
}
