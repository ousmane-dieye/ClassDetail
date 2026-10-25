-- =========================================================================
-- MIGRATION 0019 — Appartenance à une classe : départ, changement, historique
-- =========================================================================
-- Fonctionnalité « Paramètres → Ma classe » :
--   - quitter sa classe (étudiant ordinaire) ;
--   - demander à changer de classe SANS quitter immédiatement la sienne ;
--   - demander à rejoindre une classe (compte approuvé sans classe) ;
--   - annuler une demande en attente.
--
-- MODÈLE MÉTIER RETENU
--   1. `profiles.class_id` reste LA source de l'appartenance effective et de
--      toutes les autorisations (`is_member_of()`). Un départ = `class_id`
--      passé à NULL → accès RLS de l'ancienne classe coupés immédiatement.
--   2. Le statut d'approbation GLOBAL du compte (existence d'une demande
--      ACCEPTED, `is_approved_member()`) n'est JAMAIS effacé par un départ :
--      un compte approuvé qui quitte reste approuvé et peut redemander une
--      classe sans repasser par /register.
--   3. `class_members` devient réellement l'historique d'appartenance :
--      ligne ouverte à l'acceptation, `left_at` renseigné au départ ou au
--      transfert. Unicité (class_id, user_id) préservée → aucun doublon.
--   4. Une demande porte son origine : `previous_class_id` NULL = demande de
--      « rejoindre » ; non NULL = demande de « changement » depuis cette
--      classe. L'utilisateur garde sa classe actuelle pendant l'attente.
--
-- SÉCURITÉ (correctif P-020 / P-021 — docs/audit-classepulse/05-securite.md)
--   a. `regreq_insert` est resserrée : un client ne peut insérer qu'une
--      demande PENDING, non décidée, sans `previous_class_id` (donc jamais
--      une demande « ACCEPTED » auto-insérée).
--   b. Les transitions (départ / demande / annulation / décision) sont
--      réalisées par des fonctions SECURITY DEFINER exécutables UNIQUEMENT
--      par `service_role` — donc uniquement depuis les Server Actions, qui
--      vérifient la session. L'identité de l'appelant est un paramètre
--      fourni par l'action serveur, jamais par le navigateur.
--   c. Chaque fonction RÉVÉRIFIE les conditions métier au moment de
--      l'écriture, sous verrouillage `FOR UPDATE` (atomicité, pas de
--      double-décision, pas de double appartenance active).
--
-- IDEMPOTENCE
--   Colonnes : ADD COLUMN IF NOT EXISTS. Enum : garde si déjà présent.
--   Policies : drop + create. Fonctions : create or replace + grants.
--   Contrôles finaux via DO $$ ... RAISE EXCEPTION.
--
-- ⚠️ Ne jamais exécuter cette migration sur une base de production sans
--    autorisation explicite et sans l'avoir testée en staging.
-- =========================================================================

-- ---------------------------------------------------------------
-- 1. Enum : statut CANCELLED (demande retirée par son auteur ou
--    caduquée par un départ). Historique conservé, jamais supprimé.
-- ---------------------------------------------------------------
do $$ begin
  alter type registration_status add value if not exists 'CANCELLED';
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------
-- 2. registration_requests : origine de la demande
-- ---------------------------------------------------------------
-- `previous_class_id` = classe dans laquelle l'utilisateur se trouvait au
-- moment de la demande. NULL = demande d'inscription (rejoindre).
alter table registration_requests
  add column if not exists previous_class_id uuid references classes(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'registration_requests_change_distinct'
  ) then
    alter table registration_requests
      add constraint registration_requests_change_distinct
      check (previous_class_id is distinct from class_id);
  end if;
end $$;

create index if not exists idx_regreq_user_status
  on registration_requests(user_id, status);

-- ---------------------------------------------------------------
-- 3. class_members : historique réel des appartenances
-- ---------------------------------------------------------------
-- `left_at IS NULL` = appartenance active. `left_at` renseigné = appartenance
-- close (départ volontaire ou transfert vers une autre classe).
alter table class_members
  add column if not exists left_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'class_members_left_after_join'
  ) then
    alter table class_members
      add constraint class_members_left_after_join
      check (left_at is null or left_at >= joined_at);
  end if;
end $$;

create index if not exists idx_class_members_active
  on class_members(class_id) where left_at is null;

-- ---------------------------------------------------------------
-- 4. Reprise de l'existant : une appartenance active pour chaque
--    compte rattaché à une classe ET approuvé.
-- ---------------------------------------------------------------
insert into class_members (class_id, user_id, joined_at)
select p.class_id,
       p.id,
       coalesce(
         (select min(r.decided_at)
            from registration_requests r
           where r.user_id = p.id
             and r.status = 'ACCEPTED'
             and r.class_id = p.class_id),
         now()
       )
  from profiles p
 where p.class_id is not null
   and exists (
     select 1 from registration_requests r
      where r.user_id = p.id and r.status = 'ACCEPTED' and r.class_id = p.class_id
   )
on conflict (class_id, user_id) do nothing;

-- ---------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------

-- 5.1 P-020 : un client ne peut insérer QUE sa propre demande, au statut
--     PENDING, non décidée, et SANS origine (les demandes de changement
--     passent exclusivement par classpulse_request_class_change).
drop policy if exists regreq_insert on registration_requests;
create policy regreq_insert on registration_requests for insert
  with check (
    user_id = auth.uid()
    and status = 'PENDING'
    and decided_by is null
    and decided_at is null
    and previous_class_id is null
  );

-- 5.2 Historique : chacun relit SES propres appartenances (y compris close),
--     les membres lisent l'appartenance active de leur classe.
drop policy if exists class_members_select on class_members;
create policy class_members_select on class_members for select
  using (
    user_id = auth.uid()
    or is_member_of(class_id)
  );

-- Les écritures sur class_members restent réservées aux fonctions
-- SECURITY DEFINER (service_role) et aux ADMIN : aucune policy self-write.

-- ---------------------------------------------------------------
-- 6. Fonctions de transition (SECURITY DEFINER — service_role seul)
-- ---------------------------------------------------------------

-- 6.1 Départ : l'utilisateur quitte sa classe.
--     Refuse : ADMIN (compte global), DELEGATE (la classe perdrait son
--     délégué — la révocation doit précéder le départ), sans classe.
create or replace function classpulse_leave_class(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile profiles%rowtype;
begin
  if p_user_id is null then
    return jsonb_build_object('status', 'error', 'code', 'INVALID_INPUT');
  end if;

  -- Verrouillage : toute transition concurrente (nomination de délégué,
  -- acceptation d'une demande) est sérialisée sur cette ligne.
  select * into v_profile from profiles where id = p_user_id for update;
  if not found then
    return jsonb_build_object('status', 'error', 'code', 'PROFILE_NOT_FOUND');
  end if;
  if v_profile.role = 'ADMIN' then
    return jsonb_build_object('status', 'error', 'code', 'ADMIN_BLOCKED');
  end if;
  if v_profile.role = 'DELEGATE' then
    return jsonb_build_object('status', 'error', 'code', 'DELEGATE_BLOCKED');
  end if;
  if v_profile.class_id is null then
    return jsonb_build_object('status', 'error', 'code', 'NO_CLASS');
  end if;

  -- 1. Historique : clôture de l'appartenance active.
  update class_members
     set left_at = now()
   where user_id = p_user_id
     and class_id = v_profile.class_id
     and left_at is null;

  if not found then
    -- Compatibilité : membre hérité d'une base où class_members n'était pas
    -- alimentée → création de la ligne d'appartenance puis clôture.
    insert into class_members (class_id, user_id, left_at)
    values (v_profile.class_id, p_user_id, now())
    on conflict (class_id, user_id)
    do update set left_at = coalesce(class_members.left_at, excluded.left_at);
  end if;

  -- 2. Toute demande en attente devient caduque (elle visait l'ancienne
  --    situation). Historique conservé : statut CANCELLED, jamais supprimé.
  update registration_requests
     set status = 'CANCELLED', decided_by = p_user_id, decided_at = now()
   where user_id = p_user_id and status = 'PENDING';

  -- 3. Détachement effectif → perte immédiate des accès RLS de la classe.
  update profiles set class_id = null where id = p_user_id;

  return jsonb_build_object('status', 'ok');
end;
$$;

-- 6.2 Demande de rejoindre (sans classe) OU de changement (avec classe).
--     La classe actuelle est CONSERVÉE jusqu'à l'acceptation.
create or replace function classpulse_request_class_change(
  p_user_id uuid,
  p_target_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile profiles%rowtype;
begin
  if p_user_id is null or p_target_class_id is null then
    return jsonb_build_object('status', 'error', 'code', 'INVALID_INPUT');
  end if;

  select * into v_profile from profiles where id = p_user_id for update;
  if not found then
    return jsonb_build_object('status', 'error', 'code', 'PROFILE_NOT_FOUND');
  end if;
  -- Ni ADMIN (compte global) ni DELEGATE (responsabilité de classe) ne
  -- demandent un transfert.
  if v_profile.role <> 'STUDENT' then
    return jsonb_build_object('status', 'error', 'code', 'ROLE_BLOCKED');
  end if;

  if not exists (select 1 from classes where id = p_target_class_id) then
    return jsonb_build_object('status', 'error', 'code', 'CLASS_NOT_FOUND');
  end if;

  if v_profile.class_id = p_target_class_id then
    return jsonb_build_object('status', 'error', 'code', 'SAME_CLASS');
  end if;

  if exists (
    select 1 from registration_requests where user_id = p_user_id and status = 'PENDING'
  ) then
    return jsonb_build_object('status', 'error', 'code', 'PENDING_EXISTS');
  end if;

  insert into registration_requests (user_id, class_id, previous_class_id, status)
  values (p_user_id, p_target_class_id, v_profile.class_id, 'PENDING');

  return jsonb_build_object(
    'status', 'ok',
    'request_kind', case when v_profile.class_id is null then 'JOIN' else 'CHANGE' end
  );
exception
  -- uq_regreq_pending_per_user : deux soumissions simultanées.
  when unique_violation then
    return jsonb_build_object('status', 'error', 'code', 'PENDING_EXISTS');
end;
$$;

-- 6.3 Annulation d'une demande par son propre auteur.
create or replace function classpulse_cancel_request(
  p_user_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request registration_requests%rowtype;
begin
  if p_user_id is null or p_request_id is null then
    return jsonb_build_object('status', 'error', 'code', 'INVALID_INPUT');
  end if;

  select * into v_request from registration_requests where id = p_request_id for update;
  -- Réponse identique si la demande est inexistante ou appartenant à un
  -- tiers : aucune fuite d'information.
  if not found or v_request.user_id <> p_user_id then
    return jsonb_build_object('status', 'error', 'code', 'NOT_FOUND');
  end if;
  if v_request.status <> 'PENDING' then
    return jsonb_build_object('status', 'error', 'code', 'NOT_PENDING');
  end if;

  update registration_requests
     set status = 'CANCELLED', decided_by = p_user_id, decided_at = now()
   where id = p_request_id;

  return jsonb_build_object('status', 'ok');
end;
$$;

-- 6.4 Décision (ACCEPTED / REJECTED) — réutilisée par toute la workflow
--     d'approbation existante (ADMIN + DELEGATE de la classe demandée).
--     L'autorisation est réévaluée À L'ÉCRITURE ; l'acceptation est
--     atomique : demande validée + appartenance close/ouverte + profil.
create or replace function classpulse_decide_request(
  p_request_id uuid,
  p_decider_id uuid,
  p_decision registration_status
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request registration_requests%rowtype;
  v_decider profiles%rowtype;
begin
  if p_request_id is null or p_decider_id is null then
    return jsonb_build_object('status', 'error', 'code', 'INVALID_INPUT');
  end if;
  if p_decision not in ('ACCEPTED', 'REJECTED') then
    return jsonb_build_object('status', 'error', 'code', 'INVALID_DECISION');
  end if;

  select * into v_request from registration_requests where id = p_request_id for update;
  if not found then
    return jsonb_build_object('status', 'error', 'code', 'NOT_FOUND');
  end if;
  -- Garde-fou anti double-décision : la ligne est verrouillée et le statut
  -- est relu sous le verrou (aucune course possible).
  if v_request.status <> 'PENDING' then
    return jsonb_build_object('status', 'error', 'code', 'NOT_PENDING');
  end if;

  -- Autorisation : ADMIN global OU DELEGATE de la classe demandée.
  select * into v_decider from profiles where id = p_decider_id;
  if not found or not (
    v_decider.role = 'ADMIN'
    or (v_decider.role = 'DELEGATE' and v_decider.class_id = v_request.class_id)
  ) then
    return jsonb_build_object('status', 'error', 'code', 'FORBIDDEN');
  end if;

  update registration_requests
     set status = p_decision, decided_by = p_decider_id, decided_at = now()
   where id = p_request_id;

  if p_decision = 'ACCEPTED' then
    -- Clôture de l'éventuelle appartenance ACTIVE à une autre classe
    -- (transfert) : une seule appartenance active à la fois.
    update class_members
       set left_at = now()
     where user_id = v_request.user_id
       and left_at is null
       and class_id is distinct from v_request.class_id;

    -- Appartenance active vers la classe cible ; une ré-acceptation dans une
    -- classe antérieure rouvre la ligne (historique non dupliqué).
    insert into class_members (class_id, user_id)
    values (v_request.class_id, v_request.user_id)
    on conflict (class_id, user_id)
    do update
      set left_at = null,
          joined_at = case
                        when class_members.left_at is not null then now()
                        else class_members.joined_at
                      end;

    -- Transition atomique de l'appartenance effective.
    update profiles set class_id = v_request.class_id where id = v_request.user_id;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'request_kind', case when v_request.previous_class_id is null then 'JOIN' else 'CHANGE' end
  );
end;
$$;

-- ---------------------------------------------------------------
-- 7. Exécution réservée au service role (Server Actions uniquement :
--    aucune route directe depuis le navigateur).
-- ---------------------------------------------------------------
revoke execute on function classpulse_leave_class(uuid) from public, anon, authenticated;
revoke execute on function classpulse_request_class_change(uuid, uuid) from public, anon, authenticated;
revoke execute on function classpulse_cancel_request(uuid, uuid) from public, anon, authenticated;
revoke execute on function classpulse_decide_request(uuid, uuid, public.registration_status) from public, anon, authenticated;

grant execute on function classpulse_leave_class(uuid) to service_role;
grant execute on function classpulse_request_class_change(uuid, uuid) to service_role;
grant execute on function classpulse_cancel_request(uuid, uuid) to service_role;
grant execute on function classpulse_decide_request(uuid, uuid, public.registration_status) to service_role;

-- ---------------------------------------------------------------
-- 8. Contrôles d'application — échouent bruyamment si la règle s'écarte.
-- ---------------------------------------------------------------
do $$
declare
  v_expr_insert text;
  v_expr_members text;
begin
  if not exists (
    select 1 from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public'
       and t.typname = 'registration_status'
       and e.enumlabel = 'CANCELLED'
  ) then
    raise exception '0019 NON appliqué : le statut CANCELLED manque dans registration_status';
  end if;

  -- Une policy INSERT porte son expression dans polwithcheck (polqual est
  -- NULL) : on lit les deux pour rester correct quel que soit le type.
  select coalesce(pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid))
    into v_expr_insert
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where c.relname = 'registration_requests' and p.polname = 'regreq_insert';

  if v_expr_insert is null
     or position('auth.uid()' in v_expr_insert) = 0
     or position('PENDING' in v_expr_insert) = 0
     or position('previous_class_id' in v_expr_insert) = 0 then
    raise exception '0019 NON appliqué : policy regreq_insert hors règle (expression : %)', v_expr_insert;
  end if;

  select pg_get_expr(p.polqual, p.polrelid) into v_expr_members
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where c.relname = 'class_members' and p.polname = 'class_members_select';

  if v_expr_members is null or position('auth.uid()' in v_expr_members) = 0 then
    raise exception '0019 NON appliqué : policy class_members_select hors règle (USING : %)', v_expr_members;
  end if;

  -- Aucune transition appelable directement depuis le navigateur.
  if has_function_privilege('authenticated', 'classpulse_leave_class(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'classpulse_request_class_change(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'classpulse_cancel_request(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'classpulse_decide_request(uuid, uuid, public.registration_status)', 'EXECUTE')
     or has_function_privilege('anon', 'classpulse_leave_class(uuid)', 'EXECUTE') then
    raise exception '0019 NON appliqué : les fonctions de transition sont encore exécutables par anon/authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------
-- 9. Rappels (non exécutés ici) :
--    - Aucun accès direct : les 4 fonctions ne sont pas exécutables par
--      `authenticated` (revérifié par `select has_function_privilege(...)`).
--    - Re-test manuel en staging :
--        STUDENT en classe A quitte  -> profiles.class_id NULL, class_members
--                                        left_at renseigné, accès données A nuls
--        STUDENT demande B (membre A) -> demande PENDING, previous_class_id = A,
--                                        accès A inchangés, accès B nuls
--        DELEGATE de B accepte        -> class_id = B, ligne A close, ligne B ouverte
--        DELEGATE de C accepte B      -> FORBIDDEN (aucune ligne modifiée)
--        Étudiant qui s'auto-accepte -> FORBIDDEN (aucune ligne modifiée)
-- =========================================================================
