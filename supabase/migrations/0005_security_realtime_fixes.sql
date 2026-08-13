-- =========================================================================
-- 0005 — Durcissement sécurité + fiabilité temps réel
-- =========================================================================
-- Ré-exécutable (IF NOT EXISTS / drop policy if exists / create or replace).
--
-- 1.  Les comptes en attente (PENDING) n'ont PLUS aucun accès aux données de
--     classe au niveau RLS (is_approved_member / current_profile_class_id /
--     is_member_of). Le `class_id` du profil n'est de toute façon plus rempli
--     avant l'acceptation (actions/auth.ts), mais la base existante qui avait
--     déjà un class_id est protégée par ces fonctions.
-- 2.  task_completions est ajouté à la publication Realtime (badges de
--     complétion en direct sur /dashboard/tasks).
-- 3.  L'email des profils n'est plus sélectionnable par les clients
--     (anon/authenticated) — lecture via service role uniquement.
-- 4.  notifications_insert restreint aux admins (anti-spam) ; toute
--     notification passe par NotificationService (service role).
-- 5.  WITH CHECK ajouté sur conversations_update / participants_update.
-- 6.  Index manquant notifications(entity_id) (marquage lu de conversation).
-- 7.  Index idx_chat_announcements (alignement avec 0004).
-- 8.  Contrainte direct_messages.content : pièce jointe sans texte autorisée,
--     suppression "soft" avec contenu vidé autorisée.
-- =========================================================================

-- ---------------------------------------------------------
-- 1. Membres approuvés uniquement (RLS)
-- ---------------------------------------------------------
create or replace function is_approved_member()
returns boolean language sql stable security definer set search_path = public as $$
  select is_admin()
     or exists (
          select 1 from registration_requests r
          where r.user_id = auth.uid() and r.status = 'ACCEPTED'
        );
$$;

create or replace function current_profile_class_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.class_id
  from profiles p
  where p.id = auth.uid()
    and (
      is_admin()
      or exists (
        select 1 from registration_requests r
        where r.user_id = p.id and r.status = 'ACCEPTED'
      )
    );
$$;

create or replace function is_member_of(target_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_admin()
     or (
       is_approved_member()
       and exists (
         select 1 from profiles p
         where p.id = auth.uid() and p.class_id = target_class
       )
     );
$$;

-- ---------------------------------------------------------
-- 2. Realtime : publication task_completions
-- ---------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='task_completions') then
    alter publication supabase_realtime add table task_completions;
  end if;
end $$;

-- ---------------------------------------------------------
-- 3. Email des profils : réservé au service role
-- ---------------------------------------------------------
do $$ begin
  revoke select (email) on profiles from anon, authenticated;
exception when others then null; end $$;
do $$ begin
  grant select (email) on profiles to service_role;
exception when others then null; end $$;

-- ---------------------------------------------------------
-- 4. notifications_insert restreint (les notifications sont
--    créées par le backend via service role / createNotification)
-- ---------------------------------------------------------
drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications for insert
  with check (is_admin());

-- ---------------------------------------------------------
-- 5. WITH CHECK messagerie
-- ---------------------------------------------------------
drop policy if exists conversations_update on conversations;
create policy conversations_update on conversations for update
  using (is_participant_of(id))
  with check (is_participant_of(id));

drop policy if exists participants_update on conversation_participants;
create policy participants_update on conversation_participants for update
  using (user_id = auth.uid() or is_participant_of(conversation_id))
  with check (user_id = auth.uid());

-- ---------------------------------------------------------
-- 6. Index notifications(entity_id)
-- ---------------------------------------------------------
create index if not exists idx_notifications_entity on notifications(entity_id);

-- ---------------------------------------------------------
-- 7. Index annonces (alignement 0004)
-- ---------------------------------------------------------
create index if not exists idx_chat_announcements on chat_messages(class_id, is_announcement, created_at desc);

-- ---------------------------------------------------------
-- 8. direct_messages : pièce jointe sans texte autorisée,
--    suppression "soft" avec contenu vidé autorisée
-- ---------------------------------------------------------
alter table direct_messages drop constraint if exists direct_messages_content_check;
alter table direct_messages add constraint direct_messages_content_check
  check (
    char_length(content) between 1 and 4000
    or (attachment_type <> 'none' and char_length(content) = 0)
    or deleted_at is not null
  );
