-- =========================================================================
-- MIGRATION 0012 — S4 : Aucun ADMIN automatique (inscription publique)
-- =========================================================================
-- Correctif de sécurité (audit S4).
--
-- PROBLÈME (applicatif)
--   `registerAction` créait automatiquement un ADMIN quand aucun ADMIN
--   n'existait (adminCount === 0) : TOCTOU (2 inscriptions simultanées → 2
--   ADMIN), promotion sans validation, bootstrap permanent. La correction
--   applicative (actions/auth.ts) supprime cette logique : TOUT nouvel
--   utilisateur devient STUDENT + PENDING.
--
-- CÔTÉ BASE DE DONNÉES (garanties à re-affirmer / vérifier)
--   1. INSERT d'une ligne profiles par un client (donc role = 'ADMIN') :
--      AUCUNE policy INSERT ne doit exister sur profiles → refus RLS.
--   2. UPDATE de son propre rôle par un non-ADMIN : le trigger
--      `prevent_self_privilege_escalation` lève une exception.
--   3. UPDATE du rôle d'un AUTRE utilisateur par un non-ADMIN : aucune
--      policy UPDATE ne matche la ligne → refus RLS (0 ligne affectée).
--   Le service role / SQL de l'administrateur système contourne RLS et peut
--   donc toujours créer un ADMIN explicitement (scripts/create-admin.mjs) —
--   aucun trigger d'INSERT/UPDATE sur le rôle n'est ajouté ici afin de ne
--   PAS casser cette création explicite.
--
-- IDEMPOTENCE
--   drop + create (policies/trigger) ; contrôles finaux qui échouent
--   bruyamment si une protection manque.
-- =========================================================================

-- 1. Trigger : interdit à un non-ADMIN de modifier son propre role/class_id.
create or replace function prevent_self_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.id and not is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Modification du rôle interdite';
    end if;
    if new.class_id is distinct from old.class_id then
      raise exception 'Modification de la classe interdite';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_prevent_escalation on profiles;
create trigger trg_prevent_escalation before update on profiles
  for each row execute function prevent_self_privilege_escalation();

-- 2. Policies RLS de profiles (re-affirmation) :
--    - profiles_update_self : un utilisateur peut mettre à jour sa propre
--      ligne (le trigger ci-dessus bloque role/class_id).
--    - profiles_update_admin_role : seul un ADMIN peut agir sur les autres.
--    - AUCUNE policy INSERT : l'inscription passe par le service role.
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update
  using (id = auth.uid() or is_admin());

drop policy if exists profiles_update_admin_role on profiles;
create policy profiles_update_admin_role on profiles for update
  using (is_admin());

-- 3. Contrôles d'application (échouent bruyamment) :

do $$
declare
  v_ok boolean;
begin
  select exists(
    select 1 from pg_trigger
    where tgname = 'trg_prevent_escalation'
      and tgrelid = 'profiles'::regclass
      and not tgisinternal
  ) into v_ok;

  if not v_ok then
    raise exception 'S4 NON appliqué : trigger trg_prevent_escalation manquant sur profiles.';
  end if;
end $$;

do $$
declare
  v_policies text;
begin
  select string_agg(p.polname, ', ' order by p.polname) into v_policies
  from pg_policy p
  where p.polrelid = 'profiles'::regclass
    and p.polname in ('profiles_update_self', 'profiles_update_admin_role');

  if v_policies is null or (
    position('profiles_update_self' in v_policies) = 0
    or position('profiles_update_admin_role' in v_policies) = 0
  ) then
    raise exception 'S4 NON appliqué : policies de protection manquantes sur profiles : %', v_policies;
  end if;
end $$;

do $$
declare
  v_insert_policy text;
begin
  -- Aucune policy INSERT sur profiles : le profil n'est créé que via le
  -- service role (inscription serveur) ou la base de données (admin).
  select p.polname into v_insert_policy
  from pg_policy p
  where p.polrelid = 'profiles'::regclass
    and p.polcmd in ('a', '*');

  if v_insert_policy is not null then
    raise exception
      'S4 NON appliqué : une policy INSERT existe sur profiles (%). Un client pourrait insérer role=ADMIN. À supprimer.',
      v_insert_policy;
  end if;
end $$;

-- 4. Rappels (non exécutés ici) :
--    - La création d'un ADMIN est EXPLICITE : scripts/create-admin.mjs ou
--      UPDATE via le service role / SQL Editor. L'inscription publique ne
--      crée jamais d'ADMIN (rôle STUDENT + demande PENDING, sans exception).
--    - Re-test manuel après application (voir scripts/verify-s4.mjs) :
--        POST   /rest/v1/profiles {role:'ADMIN'}    -> 4xx (42501)
--        PATCH  /rest/v1/profiles?id=<self>  {role:'ADMIN'} -> 4xx (P0001)
--        PATCH  /rest/v1/profiles?id=<autre> {role:'ADMIN'} -> 0 ligne
-- =========================================================================
