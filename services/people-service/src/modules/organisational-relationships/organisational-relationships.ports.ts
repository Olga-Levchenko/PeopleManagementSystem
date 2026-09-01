import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import type { RelationshipChangedEvent } from '../../../../../libs/contracts/relationship-events'

export const RELATIONSHIP_PERMISSION = 'change organisational relationships'

export interface RelationshipPermissionPort {
  canChange(actorId: string, subjectId: string, relationshipType: string): Promise<boolean>
}

export interface ProjectionUpdatePort {
  update(event: RelationshipChangedEvent): Promise<void>
}

@Injectable()
export class UnavailableRelationshipPermissionAdapter implements RelationshipPermissionPort {
  async canChange(): Promise<boolean> {
    throw new UnauthorizedException('Relationship authorization is unavailable')
  }
}

@Injectable()
export class UnavailableProjectionUpdateAdapter implements ProjectionUpdatePort {
  async update(): Promise<void> {
    throw new ServiceUnavailableException('Access Control projection update is unavailable')
  }
}
