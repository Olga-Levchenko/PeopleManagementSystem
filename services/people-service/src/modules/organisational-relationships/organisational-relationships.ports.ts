import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RelationshipChangedEvent } from '@pms/contracts';

export const RELATIONSHIP_PERMISSION = 'change organisational relationships';

export interface RelationshipPermissionPort {
  canChange(
    actorId: string,
    subjectId: string,
    relationshipType: string,
  ): Promise<boolean>;
}

export interface ProjectionUpdatePort {
  update(event: RelationshipChangedEvent): Promise<void>;
}

@Injectable()
export class UnavailableRelationshipPermissionAdapter implements RelationshipPermissionPort {
  canChange(): Promise<boolean> {
    return Promise.reject(
      new UnauthorizedException('Relationship authorization is unavailable'),
    );
  }
}

@Injectable()
export class UnavailableProjectionUpdateAdapter implements ProjectionUpdatePort {
  update(): Promise<void> {
    return Promise.reject(
      new ServiceUnavailableException(
        'Access Control projection update is unavailable',
      ),
    );
  }
}
