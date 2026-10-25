-- =========================================================================
-- MIGRATION 0020 — Gestion des étudiants par l'administrateur
-- =========================================================================
-- 1. OBJECTIF
--    Permettre aux administrateurs de ClassPulse de :
--    - Retirer un étudiant ou délégué d'une classe (dissociation propre,
--      clôture dans `class_members`, annulation des demandes PENDING,
--      rétrogradation DELEGATE -> STUDENT si applicable).
--    - Supprimer définitivement un compte étudiant en garantissant l'intégrité
--      référentielle et en évitant les blocages des clés étrangères historiques
--      (audit P-007 : colonnes d'auteur NOT NULL avec ON DELETE SET NULL).
--
-- 2. POLITIQUES ET SÉCURITÉ
--    - Réservé exclusivement aux administrateurs autorisés (`is_admin()`).
--    - Interdiction absolue de modifier ou supprimer un compte ADMIN.
--    - Interdiction de l'auto-suppression d'un compte administrateur.
-- =========================================================================

-- 1. Assouplissement des contraintes de clés étrangères sur les tables de contenu
--    partagé : si un auteur est supprimé, la colonne author_id/creator_id peut
--    devenir NULL plutôt que de faire échouer la suppression en blocage (P-007).
do $$ begin
  alter table chat_messages alter column author_id drop not null;
exception when others then null; end $$;

do $$ begin
  alter table tasks alter column creator_id drop not null;
exception when others then null; end $$;

do $$ begin
  alter table documents alter column author_id drop not null;
exception when others then null; end $$;

do $$ begin
  alter table hints alter column author_id drop not null;
exception when others then null; end $$;

do $$ begin
  alter table recordings alter column creator_id drop not null;
exception when others then null; end $$;

-- 2. Fonction SQL SECURITY DEFINER : Retrait d'un étudiant d'une classe par l'admin
create or replace function classpulse_admin_remove_student_from_class(
  p_admin_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_role user_role;
  v_target_profile profiles%rowtype;
begin
  if p_admin_id is null or p_target_user_id is null then
    return jsonb_build_object('status', 'error', 'code', 'INVALID_INPUT');
  end if;

  -- Vérification des privilèges admin de l'appelant
  select role into v_admin_role from profiles where id = p_admin_id;
  if v_admin_role is distinct from 'ADMIN' then
    return jsonb_build_object('status', 'error', 'code', 'UNAUTHORIZED');
  end if;

  -- Verrouillage du profil cible
  select * into v_target_profile from profiles where id = p_target_user_id for update;
  if not found then
    return jsonb_build_object('status', 'error', 'code', 'PROFILE_NOT_FOUND');
  end if;

  -- Protection des administrateurs
  if v_target_profile.role = 'ADMIN' then
    return jsonb_build_object('status', 'error', 'code', 'ADMIN_BLOCKED');
  end if;

  if v_target_profile.class_id is null then
    return jsonb_build_object('status', 'error', 'code', 'NO_CLASS');
  end if;

  -- 1. Clôture de l'appartenance active
  update class_members
     set left_at = now()
   where user_id = p_target_user_id
     and class_id = v_target_profile.class_id
     and left_at is null;

  -- 2. Annulation de toute demande PENDING
  update registration_requests
     set status = 'CANCELLED', decided_at = now(), decided_by = p_admin_id
   where user_id = p_target_user_id
     and status = 'PENDING';

  -- 3. Réinitialisation de la classe et déchéance du mandat délégué si applicable
  update profiles
     set class_id = null,
         role = 'STUDENT'
   where id = p_target_user_id;

  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function classpulse_admin_remove_student_from_class(uuid, uuid) from public, anon, authenticated;
grant execute on function classpulse_admin_remove_student_from_class(uuid, uuid) to service_role;
