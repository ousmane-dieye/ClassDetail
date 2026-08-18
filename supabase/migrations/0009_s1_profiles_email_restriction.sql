-- =========================================================================
-- MIGRATION 0009 — S1 : Restaurer la confidentialité de l'email des profils
-- =========================================================================
-- Correctif de sécurité CRITIQUE (audit S1).
--
-- PROBLÈME
--   Le `REVOKE SELECT (email) ON profiles FROM anon, authenticated` prévu
--   (migration 0005 / schema.sql §18.6) n'est PAS effectif sur la base
--   déployée : un utilisateur authentifié (STUDENT) peut lire l'email de
--   tous les membres de sa classe via :
--     GET /rest/v1/profiles?select=first_name,email
--   (preuve live avant migration : les emails de la classe sont renvoyés).
--
--   CAUSE RACINE : Supabase accorde `SELECT` sur les tables au Niveau TABLE
--   (grants par défaut pour anon/authenticated). Un `revoke` de COLONNE est
--   impuissant contre un grant table-level : le privilège dérivé de la table
--   continue de s'appliquer (et information_schema.column_privileges continue
--   de le montrer). Le seul moyen de retirer l'email est de révoquer le
--   SELECT au niveau TABLE puis de ré-accorder les colonnes non sensibles.
--
-- CORRECTION
--   1. `revoke select on profiles from anon, authenticated, public` (niveau
--      TABLE — le niveau qui compte).
--   2. Ré-accorder à anon/authenticated UNIQUEMENT les colonnes non
--      sensibles utilisées par le client : id, first_name, last_name, role,
--      class_id (+ horodatages). La colonne email n'est plus sélectionnable
--      par les clients → toute requête la mentionnant échoue (42501).
--   3. Le service role (Server Actions, cron, admin) garde l'accès complet.
--   Un contrôle final échoue bruyamment si la restriction n'est pas réelle
--   (aucun "exception when others then null" : un échec ici doit être vu).
--
-- IDEMPOTENCE
--   REVOKE / GRANT sont ré-exécutables sans effet de bord ; le contrôle DO
--   est stable (ni colonne email, ni grant table-level pour les clients).
-- =========================================================================

-- 1. Révoquer le SELECT au niveau TABLE pour les rôles clients (anon +
--    authenticated) et PUBLIC. C'est ce niveau-là qui protège : un grant
--    table-level rendrait l'email de nouveau visible, même après un revoke
--    de colonne.
revoke select on profiles from anon, authenticated;
revoke select on profiles from public;

-- 2. Ré-accorder aux clients uniquement les colonnes non sensibles dont
--    l'application a besoin (inventaire des selects client : id,
--    first_name, last_name, role, class_id). L'email reste exclu.
grant select (id, first_name, last_name, role, class_id, last_seen_at, created_at, updated_at)
  on profiles to anon, authenticated;

-- 3. Le service role (Server Actions, cron, admin) garde l'accès à l'email
--    et au reste de la table (backend uniquement, jamais exposé au frontend).
grant select on profiles to service_role;
grant select (email) on profiles to service_role;

-- 4. Vérification d'application : échoue si l'un des deux niveaux laisse
--    encore l'email lisible par un client (colonne OU grant table-level).
do $$
declare
  v_col_leaks int;
  v_tbl_leaks int;
begin
  -- (a) colonne email sélectionnable par anon/authenticated/PUBLIC ?
  select count(*) into v_col_leaks
    from information_schema.column_privileges cp
    where cp.table_schema = 'public'
      and cp.table_name = 'profiles'
      and cp.column_name = 'email'
      and cp.privilege_type = 'SELECT'
      and (cp.grantee in ('anon', 'authenticated') or cp.grantee = 'PUBLIC');

  -- (b) grant SELECT au niveau TABLE (donc toutes colonnes, email compris) ?
  select count(*) into v_tbl_leaks
    from information_schema.role_table_grants rtg
    where rtg.table_schema = 'public'
      and rtg.table_name = 'profiles'
      and rtg.privilege_type = 'SELECT'
      and (rtg.grantee in ('anon', 'authenticated') or rtg.grantee = 'PUBLIC');

  if v_col_leaks > 0 or v_tbl_leaks > 0 then
    raise exception
      'S1 NON appliqué : SELECT sur profiles encore accordé aux clients (colonne email : %, grant table-level : %).',
      v_col_leaks, v_tbl_leaks;
  end if;
end $$;

-- 5. Rappels (non exécutés ici) :
--    - Le code applicatif ne sélectionne plus jamais `email` via le client
--      authenticated (inventaire des selects : id, first_name, last_name,
--      role, class_id uniquement).
--    - Toute lecture d'email légitime passe par le service role côté serveur.
--    - Re-test manuel après application :
--        GET /rest/v1/profiles?select=first_name,email
--      en tant que STUDENT doit désormais renvoyer 42501 (permission denied
--      for column email) au lieu des emails de la classe.
-- =========================================================================
