-- =========================================================================
-- MIGRATION 0013 — S6 : notifications en lecture seule (sauf read_at)
-- =========================================================================
-- Correctif de sécurité (audit S6).
--
-- PROBLÈME
--   La policy notifications_update autorise l'UPDATE de sa propre
--   notification sans restreindre les colonnes : un utilisateur peut donc,
--   via l'API REST (PATCH /rest/v1/notifications), modifier title, message,
--   type, link, entity_id, etc. — et notamment injecter un lien externe que
--   le frontend ouvre ensuite (router.push(n.link)).
--
-- SOLUTION (3 couches)
--   1. Privilèges : REVOKE UPDATE au NIVEAU TABLE (anon/authenticated/public)
--      — indispensable car l'ACL par défaut de Supabase accorde ALL aux rôles
--      et un REVOKE colonne seul est impuissant — puis REVOKE UPDATE des
--      colonnes protégées → refus immédiat au niveau PostgREST/REST.
--      Seul read_at reste modifiable par authenticated (lue / non-lue),
--      via un privilège de colonne explicite.
--   2. Trigger BEFORE UPDATE : toute modification d'une colonne protégée
--      lève une exception, tous rôles confondus (y compris service_role) →
--      défense en profondeur indépendante des privilèges.
--   3. WITH CHECK sur la policy UPDATE : un utilisateur ne peut jamais
--      transférer une notification à un autre recipient_id.
--
-- NOTA
--   - NotificationService (service role) n'effectue QUE des INSERT sur
--     notifications : la protection ne casse aucune écriture existante.
--   - ADMIN/DELEGATE (rôle authenticated) n'obtiennent AUCUN droit
--     supplémentaire : la protection s'applique à tous les rôles.
--
-- IDEMPOTENCE
--   drop + create (policy/trigger) ; REVOKE/GRANT ré-exécutables ; contrôles
--   finaux qui échouent bruyamment si une protection manque.
-- =========================================================================

-- 1. Privilèges : retrait de l'UPDATE au NIVEAU TABLE pour anon/authenticated
--    (+ public), puis retrait de l'UPDATE sur les colonnes protégées.
--    NB : un REVOKE au niveau colonne ne restreint PAS un privilège de niveau
--    table (ex. l'ACL par défaut de Supabase accorde ALL sur les tables à
--    authenticated). Le REVOKE table-level est donc indispensable : il fait
--    tomber has_column_privilege(..., 'UPDATE') à false pour toutes les
--    colonnes protégées, malgré l'ACL par défaut.
revoke update on notifications from anon, authenticated, public;

revoke update (id, recipient_id, type, title, message, created_at,
               entity_type, entity_id, link, category)
  on notifications from anon, authenticated;

-- read_at reste le seul champ modifiable par un utilisateur authentifié
-- (privilège de colonne explicite, qui prime désormais).
grant update (read_at) on notifications to authenticated;

-- 2. Trigger : blocage de toute modification des champs protégés.
create or replace function notifications_immutable_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.recipient_id is distinct from old.recipient_id
       or new.type is distinct from old.type
       or new.title is distinct from old.title
       or new.message is distinct from old.message
       or new.entity_type is distinct from old.entity_type
       or new.entity_id is distinct from old.entity_id
       or new.link is distinct from old.link
       or new.category is distinct from old.category
       or new.created_at is distinct from old.created_at
    then
      raise exception 'S6 : champs de la notification immuables — seul read_at peut être modifié';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_notifications_readonly on notifications;
create trigger trg_notifications_readonly before update on notifications
  for each row execute function notifications_immutable_fields();

-- 3. Policy UPDATE : WITH CHECK pour ne jamais changer le destinataire.
drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- 4. Contrôles d'application (échouent bruyamment).

do $$
begin
  if has_column_privilege('authenticated', 'notifications', 'id', 'UPDATE')
     or has_column_privilege('authenticated', 'notifications', 'recipient_id', 'UPDATE')
     or has_column_privilege('authenticated', 'notifications', 'type', 'UPDATE')
     or has_column_privilege('authenticated', 'notifications', 'title', 'UPDATE')
     or has_column_privilege('authenticated', 'notifications', 'message', 'UPDATE')
     or has_column_privilege('authenticated', 'notifications', 'entity_type', 'UPDATE')
     or has_column_privilege('authenticated', 'notifications', 'entity_id', 'UPDATE')
     or has_column_privilege('authenticated', 'notifications', 'link', 'UPDATE')
     or has_column_privilege('authenticated', 'notifications', 'category', 'UPDATE')
     or has_column_privilege('authenticated', 'notifications', 'created_at', 'UPDATE') then
    raise exception 'S6 NON appliqué : un champ protégé reste modifiable par authenticated.';
  end if;

  if not has_column_privilege('authenticated', 'notifications', 'read_at', 'UPDATE') then
    raise exception 'S6 NON appliqué : read_at doit rester modifiable par authenticated.';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_notifications_readonly'
      and tgrelid = 'notifications'::regclass
      and not tgisinternal
  ) then
    raise exception 'S6 NON appliqué : trigger trg_notifications_readonly manquant sur notifications.';
  end if;
end $$;

do $$
begin
  -- NB : pg_policy.polcmd — 'r'=SELECT, 'a'=INSERT, 'w'=UPDATE, 'd'=DELETE,
  -- '*'=ALL. Une policy UPDATE porte donc polcmd = 'w'.
  if not exists (
    select 1 from pg_policy
    where polrelid = 'notifications'::regclass
      and polname = 'notifications_update'
      and polcmd = 'w'
  ) then
    raise exception 'S6 NON appliqué : policy UPDATE notifications_update manquante.';
  end if;
end $$;

-- 5. Rappels (non exécutés ici) :
--    - Script de vérification live : scripts/verify-s6.mjs
--    - Re-test manuel après application :
--        PATCH /rest/v1/notifications?id=<own> {read_at:'...'} -> 2xx (lu/non-lu)
--        PATCH /rest/v1/notifications?id=<own> {title:'...'}  -> 4xx (42501)
--        PATCH /rest/v1/notifications?id=<own> {link:'...'}   -> 4xx (42501)
--        PATCH /rest/v1/notifications?id=<own> {message:'...'}-> 4xx (42501)
--        PATCH /rest/v1/notifications?id=<own> {type:'...'}   -> 4xx (42501)
--        PATCH /rest/v1/notifications?id=<own> {entity_id:'..'}-> 4xx (42501)
-- =========================================================================
