-- =========================================================
-- CLASSPULSE — SEED (données de DÉVELOPPEMENT uniquement)
-- =========================================================
-- ⚠️ Ne JAMAIS exécuter ce fichier en production.
-- Ce fichier ne crée PAS d'utilisateurs auth.users : créez-les
-- via Supabase Auth (inscription normale ou dashboard Supabase),
-- puis liez-les manuellement à ces classes/matières si besoin.

insert into classes (id, name, level, academic_year)
values
  ('11111111-1111-1111-1111-111111111111', 'GL2-A', '2e année Génie Logiciel', '2026-2027'),
  ('22222222-2222-2222-2222-222222222222', 'GI3-B', '3e année Génie Informatique', '2026-2027')
on conflict (name, academic_year) do nothing;

insert into subjects (class_id, name, code)
values
  ('11111111-1111-1111-1111-111111111111', 'Bases de données', 'BD201'),
  ('11111111-1111-1111-1111-111111111111', 'Algorithmique avancée', 'ALG202'),
  ('11111111-1111-1111-1111-111111111111', 'Réseaux', 'RES203'),
  ('22222222-2222-2222-2222-222222222222', 'Génie Logiciel', 'GL301'),
  ('22222222-2222-2222-2222-222222222222', 'Sécurité informatique', 'SEC302')
on conflict (class_id, name) do nothing;

-- Une fois que vous avez créé un utilisateur via l'inscription normale,
-- vous pouvez le promouvoir ADMIN pour vos tests avec :
--
-- update profiles set role = 'ADMIN' where email = 'votre.email@exemple.com';
