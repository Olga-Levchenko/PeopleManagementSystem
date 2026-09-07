-- Seed: access_control_service
-- Mirrors the 25 people and 9 departments from 01-people-service.sql into the ACS shadow tables,
-- adds functional role assignments, and grants Full Profile Access to the CEO.
-- Run after 01-people-service.sql:
--   docker exec infra-postgres-1 psql -U postgres -d access_control_service -f /seed/02-access-control-service.sql
-- Existing fixture rows (22222222-... people, 11111111-... departments) are left intact.
-- Functional role IDs (seeded by EF migrations):
--   unit-manager     = 55555555-0000-0000-0000-000000000001
--   delivery-manager = 55555555-0000-0000-0000-000000000002
--   project-manager  = 55555555-0000-0000-0000-000000000003
--   people-partner   = 55555555-0000-0000-0000-000000000004
--   hr-admin         = 55555555-0000-0000-0000-000000000005

-- 1. Departments (ACS shadow; no department managers here — only ParentDepartmentId)
INSERT INTO departments ("Id", "Label", "ParentDepartmentId") VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'IT',                     NULL),
  ('dddddddd-0000-0000-0000-000000000002', 'Technologies',           NULL),
  ('dddddddd-0000-0000-0000-000000000003', '.NET',                   NULL),
  ('dddddddd-0000-0000-0000-000000000004', 'JS',                     NULL),
  ('dddddddd-0000-0000-0000-000000000005', 'Python',                 NULL),
  ('dddddddd-0000-0000-0000-000000000006', 'Delivery Management',    NULL),
  ('dddddddd-0000-0000-0000-000000000007', 'Engineering management', NULL),
  ('dddddddd-0000-0000-0000-000000000008', 'PMO',                    NULL),
  ('dddddddd-0000-0000-0000-000000000009', 'Client engagement',      NULL);

-- 2. People — insert without ManagerId/ManagesDepartmentId first (resolved in steps 3-4)
INSERT INTO people ("Id", "Label", "DepartmentId", "ManagerId", "ManagesDepartmentId", "PeoplePartnerId") VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'Site Administrator', 'dddddddd-0000-0000-0000-000000000001', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000002', 'Anton Savchenko',    'dddddddd-0000-0000-0000-000000000001', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000003', 'Orest Hnatiuk',      'dddddddd-0000-0000-0000-000000000002', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000004', 'Taliia Muss',        'dddddddd-0000-0000-0000-000000000002', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000005', 'Viktor Bondar',      'dddddddd-0000-0000-0000-000000000006', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000006', 'Olena Romaniuk',     'dddddddd-0000-0000-0000-000000000007', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000007', 'Andrii Fedorchuk',   'dddddddd-0000-0000-0000-000000000007', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000008', 'Oksana Hordiienko',  'dddddddd-0000-0000-0000-000000000006', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000009', 'Olena Lysak',        'dddddddd-0000-0000-0000-000000000006', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-00000000000a', 'Diana Savchuk',      'dddddddd-0000-0000-0000-000000000006', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-00000000000b', 'Andrii Kravets',     'dddddddd-0000-0000-0000-000000000003', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-00000000000c', 'Andrii Lysenko',     'dddddddd-0000-0000-0000-000000000003', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-00000000000d', 'Chidi Igwe',         'dddddddd-0000-0000-0000-000000000003', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-00000000000e', 'Oleh Boiko',         'dddddddd-0000-0000-0000-000000000004', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-00000000000f', 'Oleksandr Dorosh',   'dddddddd-0000-0000-0000-000000000004', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000010', 'Oleksii Semenov',    'dddddddd-0000-0000-0000-000000000004', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000011', 'Vagif Mammadaliyev', 'dddddddd-0000-0000-0000-000000000005', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000012', 'Vasyl Kravchenko',   'dddddddd-0000-0000-0000-000000000005', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000013', 'Vladyslav Umanets',  'dddddddd-0000-0000-0000-000000000005', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000014', 'Danylo Hordiienko',  'dddddddd-0000-0000-0000-000000000005', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000015', 'Dmytro Danylenko',   'dddddddd-0000-0000-0000-000000000008', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000016', 'Artem Bondarenko',   'dddddddd-0000-0000-0000-000000000009', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000017', 'Adam Keem',          'dddddddd-0000-0000-0000-000000000003', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000018', 'Test User',          'dddddddd-0000-0000-0000-000000000004', NULL, NULL, NULL),
  ('cccccccc-0000-0000-0000-000000000019', 'Story1-11 TestUser', NULL,                                   NULL, NULL, NULL);

-- 3. Reporting chain
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000002' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000001'; -- Site Admin → Anton
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000008' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000002'; -- Anton → Oksana
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000004' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000003'; -- Orest → Taliia
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000008' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000004'; -- Taliia → Oksana
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000008' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000005'; -- Viktor → Oksana
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000005' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000006'; -- Olena R → Viktor
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000005' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000007'; -- Andrii F → Viktor
-- Oksana (cc08): no manager
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000005' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000009'; -- Olena L → Viktor
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000005' WHERE "Id" = 'cccccccc-0000-0000-0000-00000000000a'; -- Diana → Viktor
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000006' WHERE "Id" = 'cccccccc-0000-0000-0000-00000000000b'; -- Andrii K → Olena R
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000006' WHERE "Id" = 'cccccccc-0000-0000-0000-00000000000c'; -- Andrii L → Olena R
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000006' WHERE "Id" = 'cccccccc-0000-0000-0000-00000000000d'; -- Chidi → Olena R
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE "Id" = 'cccccccc-0000-0000-0000-00000000000e'; -- Oleh → Andrii F
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE "Id" = 'cccccccc-0000-0000-0000-00000000000f'; -- Oleksandr → Andrii F
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000010'; -- Oleksii → Andrii F
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000011'; -- Vagif → Andrii F
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000012'; -- Vasyl → Andrii F
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000013'; -- Vladyslav → Andrii F
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000014'; -- Danylo → Andrii F
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000005' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000015'; -- Dmytro → Viktor
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000008' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000016'; -- Artem B → Oksana
UPDATE people SET "ManagerId" = 'cccccccc-0000-0000-0000-000000000006' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000017'; -- Adam K → Olena R

-- 4. Department management (ManagesDepartmentId — UNIQUE constraint: one manager per dept)
UPDATE people SET "ManagesDepartmentId" = 'dddddddd-0000-0000-0000-000000000001' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000002'; -- Anton manages IT
UPDATE people SET "ManagesDepartmentId" = 'dddddddd-0000-0000-0000-000000000002' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000004'; -- Taliia manages Technologies
UPDATE people SET "ManagesDepartmentId" = 'dddddddd-0000-0000-0000-000000000003' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000006'; -- Olena R manages .NET
UPDATE people SET "ManagesDepartmentId" = 'dddddddd-0000-0000-0000-000000000004' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000007'; -- Andrii F manages JS
UPDATE people SET "ManagesDepartmentId" = 'dddddddd-0000-0000-0000-000000000006' WHERE "Id" = 'cccccccc-0000-0000-0000-000000000005'; -- Viktor manages Delivery Management

-- 5. Functional role assignments
INSERT INTO person_functional_role_assignments ("Id", "PersonId", "FunctionalRoleId", "IsActive", "AssignedAtUtc") VALUES
  ('ffffffff-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000005','55555555-0000-0000-0000-000000000002',TRUE,'2026-08-13 00:00:00+00'), -- Viktor → delivery-manager
  ('ffffffff-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000006','55555555-0000-0000-0000-000000000001',TRUE,'2026-08-20 00:00:00+00'), -- Olena R → unit-manager
  ('ffffffff-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-000000000007','55555555-0000-0000-0000-000000000001',TRUE,'2026-08-20 00:00:00+00'), -- Andrii F → unit-manager
  ('ffffffff-0000-0000-0000-000000000004','cccccccc-0000-0000-0000-000000000009','55555555-0000-0000-0000-000000000002',TRUE,'2025-06-10 00:00:00+00'), -- Olena L → delivery-manager
  ('ffffffff-0000-0000-0000-000000000005','cccccccc-0000-0000-0000-00000000000a','55555555-0000-0000-0000-000000000002',TRUE,'2026-08-20 00:00:00+00'), -- Diana → delivery-manager
  ('ffffffff-0000-0000-0000-000000000006','cccccccc-0000-0000-0000-000000000015','55555555-0000-0000-0000-000000000003',TRUE,'2026-08-20 00:00:00+00'), -- Dmytro → project-manager
  ('ffffffff-0000-0000-0000-000000000007','cccccccc-0000-0000-0000-000000000001','55555555-0000-0000-0000-000000000005',TRUE,'2026-08-17 00:00:00+00'); -- Site Admin → hr-admin

-- 6. Full Profile Access grant for CEO (Oksana Hordiienko)
--    Granted by the bootstrap Platform Lead (22222222-0000-0000-0000-000000000003)
INSERT INTO full_profile_access_grants ("Id", "HolderId", "GrantedByActorId", "GrantedAtUtc") VALUES
  ('ffffffff-0000-0000-0000-000000000010','cccccccc-0000-0000-0000-000000000008','22222222-0000-0000-0000-000000000003','2026-08-20 00:00:00+00');

-- 7. Journal entry for the FPA grant above
INSERT INTO full_profile_access_journal_entries ("Id", "ActorId", "SubjectId", "Action", "OccurredAtUtc") VALUES
  ('ffffffff-0000-0000-0000-000000000011','22222222-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-000000000008','Grant','2026-08-20 00:00:00+00');
