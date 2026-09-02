import { Module } from '@nestjs/common';

// Structural scaffold only (O4-89) — no controller/service yet. Flag-gating
// behavior, defaults enforcement, and the PM-vs-DM read/write split are
// Story 1.7's own spec (bmad-build), pending the projectRoles field decided
// in ADR-003's 2026-09-02 addendum.
@Module({})
export class ManagementNotesModule {}
