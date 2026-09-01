# `@pms/contracts`

This private package publishes the shared wire contracts used by the People Management Platform.
The package is consumed locally by Node services through a `file:` dependency.

`RelationshipChangedEvent` is versioned by `schemaVersion` and is published with the language-neutral
[`relationship-changed-event.v1.schema.json`](schemas/relationship-changed-event.v1.schema.json)
and representative fixtures. Changes within v1 must be additive. A breaking wire change requires a
new schema version and package version.

## Future .NET verification

The future Access Control consumer should check out this package's v1 schema and fixtures in its
own CI. It should validate `System.Text.Json` serialization and deserialization against the schema,
including the checked-in grant, revoke, replacement, and no-op fixtures. This keeps the Node and .NET
consumers aligned without requiring a shared runtime library.
