-- Seed: people_service
-- Inserts 25 pseudonymised person records (24 active Keycloak accounts + story1-11 test user),
-- 9 departments, manager chains, and Keycloak identity links.
-- Run after migrations: docker exec infra-postgres-1 psql -U postgres -d people_service -f /seed/01-people-service.sql
-- Person IDs: cccccccc-0000-0000-0000-00000000XXXX
-- Department IDs: dddddddd-0000-0000-0000-00000000XXXX
-- Identity link IDs: eeeeeeee-0000-0000-0000-00000000XXXX

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
  ('dddddddd-0000-0000-0000-000000000009', 'Client engagement',      0);

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
  ('cccccccc-0000-0000-0000-000000000019', 'Story1-11 TestUser', 'Developer',           'story1-11.test-user@peoplemanagement.local', '2026-08-01', NULL, NULL, NULL, 0);

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

-- 5. Keycloak identity links (opaqueSubject = Keycloak user UUID)
INSERT INTO person_external_identity_links
  (id, "personId", "canonicalIssuer", "opaqueSubject", status, "linkedAtUtc", "updatedAtUtc")
VALUES
  ('eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','http://localhost:8080/realms/people-management','d1091f0c-1c75-4096-b490-4be11c721e52','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000002','http://localhost:8080/realms/people-management','01e383bc-a31e-46e3-b3dc-70a1c780781f','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-000000000003','http://localhost:8080/realms/people-management','a0edd8be-0f02-4bb5-a6d4-37e0bd8f5da6','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000004','cccccccc-0000-0000-0000-000000000004','http://localhost:8080/realms/people-management','046f89ba-26b0-4ca1-ab9c-06a9e848cc47','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000005','cccccccc-0000-0000-0000-000000000005','http://localhost:8080/realms/people-management','73ea5a5f-d520-4ca8-90c2-324d8a94984a','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000006','cccccccc-0000-0000-0000-000000000006','http://localhost:8080/realms/people-management','2704a046-e8fe-4bdf-8ed2-dda10cfe1733','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000007','cccccccc-0000-0000-0000-000000000007','http://localhost:8080/realms/people-management','718d4640-9909-442b-bd91-14c224bf1875','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000008','cccccccc-0000-0000-0000-000000000008','http://localhost:8080/realms/people-management','c1e4c5db-3544-4c63-a321-be35010cd77c','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000009','cccccccc-0000-0000-0000-000000000009','http://localhost:8080/realms/people-management','a5dfc742-957f-4d6d-af1c-acf6fe9530d5','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-00000000000a','cccccccc-0000-0000-0000-00000000000a','http://localhost:8080/realms/people-management','b05195c1-6b24-4962-b9cb-b06b458b7f53','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-00000000000b','cccccccc-0000-0000-0000-00000000000b','http://localhost:8080/realms/people-management','cfb53e63-dc69-4e60-b3d1-6ab36a80ef50','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-00000000000c','cccccccc-0000-0000-0000-00000000000c','http://localhost:8080/realms/people-management','5d4ce226-59ed-44a9-ab3b-bbc309d99933','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-00000000000d','cccccccc-0000-0000-0000-00000000000d','http://localhost:8080/realms/people-management','798f6372-ea02-4b2f-9424-53860983aacb','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-00000000000e','cccccccc-0000-0000-0000-00000000000e','http://localhost:8080/realms/people-management','e9ebd64f-ccac-4219-b038-dc0a8b146830','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-00000000000f','cccccccc-0000-0000-0000-00000000000f','http://localhost:8080/realms/people-management','65ced5a3-c5da-4f16-bfe8-dcdea7e05d80','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000010','cccccccc-0000-0000-0000-000000000010','http://localhost:8080/realms/people-management','c3b23136-9587-400d-9adc-770b0d8422bc','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000011','cccccccc-0000-0000-0000-000000000011','http://localhost:8080/realms/people-management','73d1dc5c-c720-4da4-88a1-a5c2f4b0d4cb','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000012','cccccccc-0000-0000-0000-000000000012','http://localhost:8080/realms/people-management','42722e23-4188-443d-b916-1a7445b740eb','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000013','cccccccc-0000-0000-0000-000000000013','http://localhost:8080/realms/people-management','0d060973-5cc2-4465-9f98-682e9a6e96ae','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000014','cccccccc-0000-0000-0000-000000000014','http://localhost:8080/realms/people-management','ef2264cc-cb84-487d-8d1f-e367a2a13abd','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000015','cccccccc-0000-0000-0000-000000000015','http://localhost:8080/realms/people-management','32656f3a-5ad2-4942-89b8-6c60d3b64c4c','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000016','cccccccc-0000-0000-0000-000000000016','http://localhost:8080/realms/people-management','9a60cad4-370c-4961-8e00-4c69ccf236fc','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000017','cccccccc-0000-0000-0000-000000000017','http://localhost:8080/realms/people-management','96672128-71cb-4cf9-8817-3d3097c379f5','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000018','cccccccc-0000-0000-0000-000000000018','http://localhost:8080/realms/people-management','4ae6bd61-ce4a-4ea2-b3fb-41a324652761','ACTIVE',NOW(),NOW()),
  ('eeeeeeee-0000-0000-0000-000000000019','cccccccc-0000-0000-0000-000000000019','http://localhost:8080/realms/people-management','a97aaf41-caf4-4380-9827-ba84b7bc9949','ACTIVE',NOW(),NOW());
