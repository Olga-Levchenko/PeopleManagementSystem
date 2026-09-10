-- Seed: people_service
-- Inserts 25 pseudonymised person records (24 active Keycloak accounts + story1-11 test user),
-- 9 departments, manager chains, and Keycloak identity links.
-- Idempotent: safe to re-run. Applied after Prisma migrations by infra/bootstrap-local.ps1
-- (or .sh), or manually:
--   docker compose --project-directory infra exec -T postgres psql -U postgres -d people_service -v ON_ERROR_STOP=1 -f /seed/01-people-service.sql
-- Person IDs: cccccccc-0000-0000-0000-00000000XXXX
-- Department IDs: dddddddd-0000-0000-0000-00000000XXXX
-- Identity link IDs: eeeeeeee-0000-0000-0000-00000000XXXX
-- opaqueSubject values MUST match services/authentication-service/keycloak/realm-export.json
-- users[].id (pinned). Site Administrator (cccccccc-...001) maps to
-- c79186a1-2d9d-445b-a6e2-c64f6ccf11b6 / tt.site-admin@altexsoft.com.

-- 1. Departments (managerId filled in step 4 after people exist)
INSERT INTO departments (id, name, "relationshipVersion") VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'IT',                     0),
  ('dddddddd-0000-0000-0000-000000000002', 'Technologies',           0),
  ('dddddddd-0000-0000-0000-000000000003', '.NET',                   0),
  ('dddddddd-0000-0000-0000-000000000004', 'JS',                     0),
  ('dddddddd-0000-0000-0000-000000000005', 'Python',                 0),
  ('dddddddd-0000-0000-0000-000000000006', 'Delivery Management',    0),
  ('dddddddd-0000-0000-0000-000000000007', 'Engineering management', 0),
  ('dddddddd-0000-0000-0000-000000000008', 'PMO',                    0),
  ('dddddddd-0000-0000-0000-000000000009', 'Client engagement',      0)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 2. People — insert without managerId/peoplePartnerId first (self-referential FKs resolved in step 3)
INSERT INTO people (id, "fullName", position, "workEmail", "startDate", "birthdayDay", "birthdayMonth", "departmentId", "relationshipVersion") VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'Site Administrator', 'Developer',           'tt.site-admin@altexsoft.com',              '2026-08-17', NULL, NULL, 'dddddddd-0000-0000-0000-000000000001', 0),
  ('cccccccc-0000-0000-0000-000000000002', 'Anton Savchenko',    'Head of IT',          'artem.shamraiev@altexsoft.com',            '2026-08-17', NULL, NULL, 'dddddddd-0000-0000-0000-000000000001', 0),
  ('cccccccc-0000-0000-0000-000000000003', 'Orest Hnatiuk',      'Solution Architect',  'alex.geraschenko@altexsoft.com',           '2026-08-17', NULL, NULL, 'dddddddd-0000-0000-0000-000000000002', 0),
  ('cccccccc-0000-0000-0000-000000000004', 'Taliia Muss',        'Head of IT',          'nataliia.musiienko@altexsoft.com',         '2026-08-19', NULL, NULL, 'dddddddd-0000-0000-0000-000000000002', 0),
  ('cccccccc-0000-0000-0000-000000000005', 'Viktor Bondar',      'Engineering Director','viktor.bondar@altexsoft.com',              '2023-08-13', NULL, NULL, 'dddddddd-0000-0000-0000-000000000006', 0),
  ('cccccccc-0000-0000-0000-000000000006', 'Olena Romaniuk',     'Unit Manager',        'olena.romaniuk@altexsoft.com',             '2026-08-20', NULL, NULL, 'dddddddd-0000-0000-0000-000000000007', 0),
  ('cccccccc-0000-0000-0000-000000000007', 'Andrii Fedorchuk',   'Unit Manager',        'andrii.fedorchuk@altexsoft.com',           '2026-08-20',    2,    7, 'dddddddd-0000-0000-0000-000000000007', 0),
  ('cccccccc-0000-0000-0000-000000000008', 'Oksana Hordiienko',  'CEO',                 'oksana.hordiienko@altexsoft.com',          '2026-08-20', NULL, NULL, 'dddddddd-0000-0000-0000-000000000006', 0),
  ('cccccccc-0000-0000-0000-000000000009', 'Olena Lysak',        'Delivery Management', 'olena.lysak@altexsoft.com',               '2025-06-10', NULL, NULL, 'dddddddd-0000-0000-0000-000000000006', 0),
  ('cccccccc-0000-0000-0000-00000000000a', 'Diana Savchuk',      'Delivery Management', 'diana.savchuk@altexsoft.com',             '2026-08-20', NULL, NULL, 'dddddddd-0000-0000-0000-000000000006', 0),
  ('cccccccc-0000-0000-0000-00000000000b', 'Andrii Kravets',     'Developer',           'andrii.kravets@altexsoft.com',            '2025-02-06', NULL, NULL, 'dddddddd-0000-0000-0000-000000000003', 0),
  ('cccccccc-0000-0000-0000-00000000000c', 'Andrii Lysenko',     'Developer',           'andrii.lysenko@altexsoft.com',            '2025-12-16', NULL, NULL, 'dddddddd-0000-0000-0000-000000000003', 0),
  ('cccccccc-0000-0000-0000-00000000000d', 'Chidi Igwe',         'Developer',           'chidi.igwe@altexsoft.com',                '2026-08-20', NULL, NULL, 'dddddddd-0000-0000-0000-000000000003', 0),
  ('cccccccc-0000-0000-0000-00000000000e', 'Oleh Boiko',         'Developer',           'oleh.boiko@altexsoft.com',                '2026-03-09', NULL, NULL, 'dddddddd-0000-0000-0000-000000000004', 0),
  ('cccccccc-0000-0000-0000-00000000000f', 'Oleksandr Dorosh',   'Developer',           'oleksandr.dorosh@altexsoft.com',          '2026-05-12', NULL, NULL, 'dddddddd-0000-0000-0000-000000000004', 0),
  ('cccccccc-0000-0000-0000-000000000010', 'Oleksii Semenov',    'Developer',           'oleksii.semenov@altexsoft.com',           '2024-05-14', NULL, NULL, 'dddddddd-0000-0000-0000-000000000004', 0),
  ('cccccccc-0000-0000-0000-000000000011', 'Vagif Mammadaliyev', 'Developer',           'vagif.mammadaliyev@altexsoft.com',        '2026-08-20', NULL, NULL, 'dddddddd-0000-0000-0000-000000000005', 0),
  ('cccccccc-0000-0000-0000-000000000012', 'Vasyl Kravchenko',   'Developer',           'vasyl.kravchenko@altexsoft.com',          '2026-08-20', NULL, NULL, 'dddddddd-0000-0000-0000-000000000005', 0),
  ('cccccccc-0000-0000-0000-000000000013', 'Vladyslav Umanets',  'Developer',           'vladyslav.umanets@altexsoft.com',         '2026-08-20', NULL, NULL, 'dddddddd-0000-0000-0000-000000000005', 0),
  ('cccccccc-0000-0000-0000-000000000014', 'Danylo Hordiienko',  'Developer',           'danylo.hordiienko@altexsoft.com',         '2026-08-02', NULL, NULL, 'dddddddd-0000-0000-0000-000000000005', 0),
  ('cccccccc-0000-0000-0000-000000000015', 'Dmytro Danylenko',   'Project Manager',     'dmytro.danylenko@altexsoft.com',          '2026-08-20', NULL, NULL, 'dddddddd-0000-0000-0000-000000000008', 0),
  ('cccccccc-0000-0000-0000-000000000016', 'Artem Bondarenko',   'Sales Manager',       'artem.bondarenko@altexsoft.com',          '2026-08-20', NULL, NULL, 'dddddddd-0000-0000-0000-000000000009', 0),
  ('cccccccc-0000-0000-0000-000000000017', 'Adam Keem',          'Developer',           'adam.keem@altexsoft.com',                 '2026-08-26', NULL, NULL, 'dddddddd-0000-0000-0000-000000000003', 0),
  ('cccccccc-0000-0000-0000-000000000018', 'Test User',          'Developer',           'tesr.user@altex.com',                    '2026-08-26', NULL, NULL, 'dddddddd-0000-0000-0000-000000000004', 0),
  ('cccccccc-0000-0000-0000-000000000019', 'Story1-11 TestUser', 'Developer',           'story1-11.test-user@peoplemanagement.local', '2026-08-01', NULL, NULL, NULL, 0)
ON CONFLICT (id) DO UPDATE SET
  "fullName" = EXCLUDED."fullName",
  position = EXCLUDED.position,
  "workEmail" = EXCLUDED."workEmail",
  "startDate" = EXCLUDED."startDate",
  "birthdayDay" = EXCLUDED."birthdayDay",
  "birthdayMonth" = EXCLUDED."birthdayMonth",
  "departmentId" = EXCLUDED."departmentId";

-- 3. Reporting chain (self-referential FKs — all people rows must exist first)
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000002' WHERE id = 'cccccccc-0000-0000-0000-000000000001'; -- Site Admin → Anton
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000008' WHERE id = 'cccccccc-0000-0000-0000-000000000002'; -- Anton → Oksana
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000004' WHERE id = 'cccccccc-0000-0000-0000-000000000003'; -- Orest → Taliia
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000008' WHERE id = 'cccccccc-0000-0000-0000-000000000004'; -- Taliia → Oksana
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000008' WHERE id = 'cccccccc-0000-0000-0000-000000000005'; -- Viktor → Oksana
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000005' WHERE id = 'cccccccc-0000-0000-0000-000000000006'; -- Olena R → Viktor
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000005' WHERE id = 'cccccccc-0000-0000-0000-000000000007'; -- Andrii F → Viktor
-- Oksana (cc08): no manager
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000005' WHERE id = 'cccccccc-0000-0000-0000-000000000009'; -- Olena L → Viktor
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000005' WHERE id = 'cccccccc-0000-0000-0000-00000000000a'; -- Diana → Viktor
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000006' WHERE id = 'cccccccc-0000-0000-0000-00000000000b'; -- Andrii K → Olena R
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000006' WHERE id = 'cccccccc-0000-0000-0000-00000000000c'; -- Andrii L → Olena R
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000006' WHERE id = 'cccccccc-0000-0000-0000-00000000000d'; -- Chidi → Olena R
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE id = 'cccccccc-0000-0000-0000-00000000000e'; -- Oleh → Andrii F
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE id = 'cccccccc-0000-0000-0000-00000000000f'; -- Oleksandr → Andrii F
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE id = 'cccccccc-0000-0000-0000-000000000010'; -- Oleksii → Andrii F
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE id = 'cccccccc-0000-0000-0000-000000000011'; -- Vagif → Andrii F
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE id = 'cccccccc-0000-0000-0000-000000000012'; -- Vasyl → Andrii F
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE id = 'cccccccc-0000-0000-0000-000000000013'; -- Vladyslav → Andrii F
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE id = 'cccccccc-0000-0000-0000-000000000014'; -- Danylo → Andrii F
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000005' WHERE id = 'cccccccc-0000-0000-0000-000000000015'; -- Dmytro → Viktor
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000008' WHERE id = 'cccccccc-0000-0000-0000-000000000016'; -- Artem B → Oksana
UPDATE people SET "managerId" = 'cccccccc-0000-0000-0000-000000000006' WHERE id = 'cccccccc-0000-0000-0000-000000000017'; -- Adam K → Olena R

-- 4. Department managers (people must exist first)
UPDATE departments SET "managerId" = 'cccccccc-0000-0000-0000-000000000002' WHERE id = 'dddddddd-0000-0000-0000-000000000001'; -- IT → Anton
UPDATE departments SET "managerId" = 'cccccccc-0000-0000-0000-000000000004' WHERE id = 'dddddddd-0000-0000-0000-000000000002'; -- Technologies → Taliia
UPDATE departments SET "managerId" = 'cccccccc-0000-0000-0000-000000000006' WHERE id = 'dddddddd-0000-0000-0000-000000000003'; -- .NET → Olena R
UPDATE departments SET "managerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE id = 'dddddddd-0000-0000-0000-000000000004'; -- JS → Andrii F
UPDATE departments SET "managerId" = 'cccccccc-0000-0000-0000-000000000007' WHERE id = 'dddddddd-0000-0000-0000-000000000005'; -- Python → Andrii F
UPDATE departments SET "managerId" = 'cccccccc-0000-0000-0000-000000000005' WHERE id = 'dddddddd-0000-0000-0000-000000000006'; -- Delivery Management → Viktor
UPDATE departments SET "managerId" = 'cccccccc-0000-0000-0000-000000000005' WHERE id = 'dddddddd-0000-0000-0000-000000000007'; -- Engineering management → Viktor
UPDATE departments SET "managerId" = 'cccccccc-0000-0000-0000-000000000005' WHERE id = 'dddddddd-0000-0000-0000-000000000008'; -- PMO → Viktor
UPDATE departments SET "managerId" = 'cccccccc-0000-0000-0000-000000000008' WHERE id = 'dddddddd-0000-0000-0000-000000000009'; -- Client engagement → Oksana

-- 5. Keycloak identity links (opaqueSubject = realm-export.json users[].id; keep in sync)
-- Revoke leftover ACTIVE links for these people so a dirty local DB (live-e2e leftovers)
-- cannot block the canonical seed rows on (personId, issuer) or (issuer, subject).
UPDATE person_external_identity_links
SET
  status = 'REVOKED',
  "revokedAtUtc" = COALESCE("revokedAtUtc", NOW()),
  "updatedAtUtc" = NOW()
WHERE status = 'ACTIVE'
  AND "personId" IN (
    'cccccccc-0000-0000-0000-000000000001',
    'cccccccc-0000-0000-0000-000000000002',
    'cccccccc-0000-0000-0000-000000000003',
    'cccccccc-0000-0000-0000-000000000004',
    'cccccccc-0000-0000-0000-000000000005',
    'cccccccc-0000-0000-0000-000000000006',
    'cccccccc-0000-0000-0000-000000000007',
    'cccccccc-0000-0000-0000-000000000008',
    'cccccccc-0000-0000-0000-000000000009',
    'cccccccc-0000-0000-0000-00000000000a',
    'cccccccc-0000-0000-0000-00000000000b',
    'cccccccc-0000-0000-0000-00000000000c',
    'cccccccc-0000-0000-0000-00000000000d',
    'cccccccc-0000-0000-0000-00000000000e',
    'cccccccc-0000-0000-0000-00000000000f',
    'cccccccc-0000-0000-0000-000000000010',
    'cccccccc-0000-0000-0000-000000000011',
    'cccccccc-0000-0000-0000-000000000012',
    'cccccccc-0000-0000-0000-000000000013',
    'cccccccc-0000-0000-0000-000000000014',
    'cccccccc-0000-0000-0000-000000000015',
    'cccccccc-0000-0000-0000-000000000016',
    'cccccccc-0000-0000-0000-000000000017',
    'cccccccc-0000-0000-0000-000000000018',
    'cccccccc-0000-0000-0000-000000000019'
  )
  AND id NOT IN (
    'eeeeeeee-0000-0000-0000-000000000001',
    'eeeeeeee-0000-0000-0000-000000000002',
    'eeeeeeee-0000-0000-0000-000000000003',
    'eeeeeeee-0000-0000-0000-000000000004',
    'eeeeeeee-0000-0000-0000-000000000005',
    'eeeeeeee-0000-0000-0000-000000000006',
    'eeeeeeee-0000-0000-0000-000000000007',
    'eeeeeeee-0000-0000-0000-000000000008',
    'eeeeeeee-0000-0000-0000-000000000009',
    'eeeeeeee-0000-0000-0000-00000000000a',
    'eeeeeeee-0000-0000-0000-00000000000b',
    'eeeeeeee-0000-0000-0000-00000000000c',
    'eeeeeeee-0000-0000-0000-00000000000d',
    'eeeeeeee-0000-0000-0000-00000000000e',
    'eeeeeeee-0000-0000-0000-00000000000f',
    'eeeeeeee-0000-0000-0000-000000000010',
    'eeeeeeee-0000-0000-0000-000000000011',
    'eeeeeeee-0000-0000-0000-000000000012',
    'eeeeeeee-0000-0000-0000-000000000013',
    'eeeeeeee-0000-0000-0000-000000000014',
    'eeeeeeee-0000-0000-0000-000000000015',
    'eeeeeeee-0000-0000-0000-000000000016',
    'eeeeeeee-0000-0000-0000-000000000017',
    'eeeeeeee-0000-0000-0000-000000000018',
    'eeeeeeee-0000-0000-0000-000000000019'
  );

-- Free (issuer, subject) uniqueness for the pinned Keycloak user ids.
UPDATE person_external_identity_links
SET
  status = 'REVOKED',
  "revokedAtUtc" = COALESCE("revokedAtUtc", NOW()),
  "updatedAtUtc" = NOW()
WHERE status = 'ACTIVE'
  AND "canonicalIssuer" = 'http://localhost:8080/realms/people-management'
  AND "opaqueSubject" IN (
    'c79186a1-2d9d-445b-a6e2-c64f6ccf11b6',
    'e831fb31-8d50-47ad-b1db-d423afcb87a0',
    '70f71811-90c7-4e6e-9ef2-75963c5208ed',
    '2ae78d5d-c1a0-435c-988b-56e27b12262f',
    'aec8a151-1bd1-4079-9cae-946c15d09575',
    'c772d28a-1442-41a9-ac6f-af4cc14af5ae',
    'd6d145d0-e30c-4ca6-96d7-09e00ea32658',
    '1e8a55cd-d817-4f1c-905c-8572c86717dd',
    '560c1824-e1b0-40bc-b90e-7a66cd32daf6',
    '18e1941c-501a-4f28-88e3-5b3010f75cfb',
    'f869f006-2f63-48c7-8fcd-73c2551050ed',
    '26cb2751-cd8f-4e42-a6b8-cd9190e79479',
    'f481afc4-904c-48a6-a1c9-5196c3e0e8fd',
    'af1d38af-a30e-4093-b61d-a39351666f5b',
    'e794977e-0f0a-4bb1-b890-8e154c683ec6',
    '81c0ff51-42e4-4ee0-b468-514e15c04262',
    'df6f8458-7b0c-4daa-8e63-f64b57668977',
    'ab0c99aa-95b5-47c2-932a-90595bb1b02f',
    'd43dbd1b-0b84-4fee-911b-1c10a485d3ca',
    '9bc2e784-b506-45aa-93ac-d141c65d68a8',
    '87c67eec-004d-4c77-8c36-0d7907c23572',
    '18d89383-ec41-4a46-8f67-fd6f1d0b1f47',
    '010697ef-daf3-47fb-bd8c-27b15cebefde',
    'e56f31c0-d505-4cd5-a714-131925029075',
    '7e5b85fe-1f88-4400-9cb9-bfca4530eb85'
  )
  AND id NOT IN (
    'eeeeeeee-0000-0000-0000-000000000001',
    'eeeeeeee-0000-0000-0000-000000000002',
    'eeeeeeee-0000-0000-0000-000000000003',
    'eeeeeeee-0000-0000-0000-000000000004',
    'eeeeeeee-0000-0000-0000-000000000005',
    'eeeeeeee-0000-0000-0000-000000000006',
    'eeeeeeee-0000-0000-0000-000000000007',
    'eeeeeeee-0000-0000-0000-000000000008',
    'eeeeeeee-0000-0000-0000-000000000009',
    'eeeeeeee-0000-0000-0000-00000000000a',
    'eeeeeeee-0000-0000-0000-00000000000b',
    'eeeeeeee-0000-0000-0000-00000000000c',
    'eeeeeeee-0000-0000-0000-00000000000d',
    'eeeeeeee-0000-0000-0000-00000000000e',
    'eeeeeeee-0000-0000-0000-00000000000f',
    'eeeeeeee-0000-0000-0000-000000000010',
    'eeeeeeee-0000-0000-0000-000000000011',
    'eeeeeeee-0000-0000-0000-000000000012',
    'eeeeeeee-0000-0000-0000-000000000013',
    'eeeeeeee-0000-0000-0000-000000000014',
    'eeeeeeee-0000-0000-0000-000000000015',
    'eeeeeeee-0000-0000-0000-000000000016',
    'eeeeeeee-0000-0000-0000-000000000017',
    'eeeeeeee-0000-0000-0000-000000000018',
    'eeeeeeee-0000-0000-0000-000000000019'
  );

INSERT INTO person_external_identity_links
  (id, "personId", "canonicalIssuer", "opaqueSubject", status, "linkedAtUtc", "updatedAtUtc")
VALUES
  ('eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','http://localhost:8080/realms/people-management','c79186a1-2d9d-445b-a6e2-c64f6ccf11b6','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000002','http://localhost:8080/realms/people-management','e831fb31-8d50-47ad-b1db-d423afcb87a0','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-000000000003','http://localhost:8080/realms/people-management','70f71811-90c7-4e6e-9ef2-75963c5208ed','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000004','cccccccc-0000-0000-0000-000000000004','http://localhost:8080/realms/people-management','2ae78d5d-c1a0-435c-988b-56e27b12262f','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000005','cccccccc-0000-0000-0000-000000000005','http://localhost:8080/realms/people-management','aec8a151-1bd1-4079-9cae-946c15d09575','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000006','cccccccc-0000-0000-0000-000000000006','http://localhost:8080/realms/people-management','c772d28a-1442-41a9-ac6f-af4cc14af5ae','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000007','cccccccc-0000-0000-0000-000000000007','http://localhost:8080/realms/people-management','d6d145d0-e30c-4ca6-96d7-09e00ea32658','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000008','cccccccc-0000-0000-0000-000000000008','http://localhost:8080/realms/people-management','1e8a55cd-d817-4f1c-905c-8572c86717dd','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000009','cccccccc-0000-0000-0000-000000000009','http://localhost:8080/realms/people-management','560c1824-e1b0-40bc-b90e-7a66cd32daf6','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-00000000000a','cccccccc-0000-0000-0000-00000000000a','http://localhost:8080/realms/people-management','18e1941c-501a-4f28-88e3-5b3010f75cfb','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-00000000000b','cccccccc-0000-0000-0000-00000000000b','http://localhost:8080/realms/people-management','f869f006-2f63-48c7-8fcd-73c2551050ed','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-00000000000c','cccccccc-0000-0000-0000-00000000000c','http://localhost:8080/realms/people-management','26cb2751-cd8f-4e42-a6b8-cd9190e79479','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-00000000000d','cccccccc-0000-0000-0000-00000000000d','http://localhost:8080/realms/people-management','f481afc4-904c-48a6-a1c9-5196c3e0e8fd','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-00000000000e','cccccccc-0000-0000-0000-00000000000e','http://localhost:8080/realms/people-management','af1d38af-a30e-4093-b61d-a39351666f5b','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-00000000000f','cccccccc-0000-0000-0000-00000000000f','http://localhost:8080/realms/people-management','e794977e-0f0a-4bb1-b890-8e154c683ec6','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000010','cccccccc-0000-0000-0000-000000000010','http://localhost:8080/realms/people-management','81c0ff51-42e4-4ee0-b468-514e15c04262','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000011','cccccccc-0000-0000-0000-000000000011','http://localhost:8080/realms/people-management','df6f8458-7b0c-4daa-8e63-f64b57668977','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000012','cccccccc-0000-0000-0000-000000000012','http://localhost:8080/realms/people-management','ab0c99aa-95b5-47c2-932a-90595bb1b02f','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000013','cccccccc-0000-0000-0000-000000000013','http://localhost:8080/realms/people-management','d43dbd1b-0b84-4fee-911b-1c10a485d3ca','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000014','cccccccc-0000-0000-0000-000000000014','http://localhost:8080/realms/people-management','9bc2e784-b506-45aa-93ac-d141c65d68a8','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000015','cccccccc-0000-0000-0000-000000000015','http://localhost:8080/realms/people-management','87c67eec-004d-4c77-8c36-0d7907c23572','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000016','cccccccc-0000-0000-0000-000000000016','http://localhost:8080/realms/people-management','18d89383-ec41-4a46-8f67-fd6f1d0b1f47','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000017','cccccccc-0000-0000-0000-000000000017','http://localhost:8080/realms/people-management','010697ef-daf3-47fb-bd8c-27b15cebefde','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000018','cccccccc-0000-0000-0000-000000000018','http://localhost:8080/realms/people-management','e56f31c0-d505-4cd5-a714-131925029075','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000019','cccccccc-0000-0000-0000-000000000019','http://localhost:8080/realms/people-management','7e5b85fe-1f88-4400-9cb9-bfca4530eb85','ACTIVE',NOW(),NOW())
ON CONFLICT (id) DO UPDATE SET
  "personId" = EXCLUDED."personId",
  "canonicalIssuer" = EXCLUDED."canonicalIssuer",
  "opaqueSubject" = EXCLUDED."opaqueSubject",
  status = 'ACTIVE',
  "revokedAtUtc" = NULL,
  "revocationReason" = NULL,
  "updatedAtUtc" = NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM person_external_identity_links
    WHERE "personId" = 'cccccccc-0000-0000-0000-000000000001'
      AND "opaqueSubject" = 'c79186a1-2d9d-445b-a6e2-c64f6ccf11b6'
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Site Administrator identity link does not match the pinned Keycloak user id';
  END IF;
END $$;
