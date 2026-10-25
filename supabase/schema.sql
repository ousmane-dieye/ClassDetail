-- =========================================================
-- CLASSPULSE — SCHEMA POSTGRESQL / SUPABASE
-- =========================================================
-- Ce fichier est idempotent autant que possible (IF NOT EXISTS)
-- A exécuter dans l'éditeur SQL de Supabase, dans l'ordre.
-- =========================================================

-- ---------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid()
-- NB: la planification est gérée par Vercel Cron (voir vercel.json), pas par pg_cron.

-- ---------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------
do $$ begin
  create type user_role as enum ('STUDENT', 'DELEGATE', 'ADMIN');
exception when duplicate_object then null; end $$;

-- CANCELLED : demande retirée par son auteur ou caduquée par un départ
-- (migration 0019). L'historique est conservé, jamais supprimé.
do $$ begin
  create type registration_status as enum ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_type as enum ('EXERCISE', 'TP', 'ASSIGNMENT', 'RESEARCH', 'PROJECT', 'OTHER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type hint_type as enum ('DEVOIR', 'EXAMEN', 'CONTROLE', 'TP', 'PROJET', 'AUTRE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reminder_kind as enum ('J3', 'J1');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_type as enum (
    'TASK_REMINDER',
    'REGISTRATION_ACCEPTED',
    'REGISTRATION_REJECTED',
    'TASK_CREATED',
    'DOCUMENT_ADDED',
    'HINT_ADDED',
    'RECORDING_ADDED',
    'DELEGATE_APPOINTED',
    'DELEGATE_REMOVED'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------
-- 2. TABLE: classes
-- ---------------------------------------------------------
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  level text not null,
  academic_year text not null,
  created_at timestamptz not null default now(),
  unique (name, academic_year)
);

-- ---------------------------------------------------------
-- 3. TABLE: profiles (miroir de auth.users)
-- ---------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  role user_role not null default 'STUDENT',
  class_id uuid references classes(id) on delete set null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unicité de l'email insensible à la casse (comme Supabase Auth) :
-- `Admin@x.com` et `admin@x.com` sont le même compte.
create unique index if not exists uq_profiles_email_lower
  on profiles (lower(email));

create index if not exists idx_profiles_class_id on profiles(class_id);
create index if not exists idx_profiles_role on profiles(role);
create index if not exists idx_profiles_last_seen on profiles(last_seen_at desc);

-- ---------------------------------------------------------
-- 4. TABLE: class_members (appartenance active à une classe)
-- ---------------------------------------------------------
-- Redondant avec profiles.class_id volontairement : profiles.class_id
-- = classe active de l'utilisateur ; class_members garde un historique
-- et permet des règles d'accès explicites plus robustes pour RLS.
-- `left_at IS NULL` = appartenance active ; `left_at` renseigné = appartenance
-- close (départ volontaire ou transfert) — migration 0019.
create table if not exists class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  constraint class_members_left_after_join check (left_at is null or left_at >= joined_at),
  unique (class_id, user_id)
);

create index if not exists idx_class_members_class on class_members(class_id);
create index if not exists idx_class_members_user on class_members(user_id);
create index if not exists idx_class_members_active on class_members(class_id) where left_at is null;

-- ---------------------------------------------------------
-- 5. TABLE: subjects (matières)
-- ---------------------------------------------------------
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  name text not null,
  code text,
  created_at timestamptz not null default now(),
  unique (class_id, name),
  -- S3 : cible de la FK composite (subject_id, class_id) des ressources.
  unique (id, class_id)
);

create index if not exists idx_subjects_class_id on subjects(class_id);

-- ---------------------------------------------------------
-- 6. TABLE: registration_requests
-- ---------------------------------------------------------
create table if not exists registration_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  -- Classe de l'utilisateur au moment de la demande (migration 0019) :
  --   NULL  = demande d'inscription (« rejoindre ») ;
  --   uuid  = demande de changement en conservant la classe actuelle.
  previous_class_id uuid references classes(id) on delete set null,
  status registration_status not null default 'PENDING',
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint registration_requests_change_distinct check (previous_class_id is distinct from class_id)
);

create index if not exists idx_regreq_class_id on registration_requests(class_id);
create index if not exists idx_regreq_status on registration_requests(status);
create index if not exists idx_regreq_user_status on registration_requests(user_id, status);
-- Un utilisateur ne peut avoir qu'UNE demande PENDING à la fois
create unique index if not exists uq_regreq_pending_per_user
  on registration_requests(user_id)
  where status = 'PENDING';

-- ---------------------------------------------------------
-- 7. TABLE: tasks
-- ---------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  creator_id uuid not null references profiles(id) on delete set null,
  title text not null,
  description text,
  type task_type not null default 'OTHER',
  due_date timestamptz not null,
  attachment_link text,
  is_expired boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- S3 : la matière doit appartenir à la même classe que la ressource.
  constraint tasks_subject_class_fk
    foreign key (subject_id, class_id) references subjects(id, class_id) on delete cascade
);

create index if not exists idx_tasks_class_id on tasks(class_id);
create index if not exists idx_tasks_subject_id on tasks(subject_id);
create index if not exists idx_tasks_creator_id on tasks(creator_id);
create index if not exists idx_tasks_due_date on tasks(due_date);

-- ---------------------------------------------------------
-- 8. TABLE: task_completions (état individuel)
-- ---------------------------------------------------------
create table if not exists task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (task_id, student_id)
);

create index if not exists idx_task_completions_task on task_completions(task_id);
create index if not exists idx_task_completions_student on task_completions(student_id);

-- ---------------------------------------------------------
-- 9. TABLE: task_reminders_sent (anti-doublons)
-- ---------------------------------------------------------
create table if not exists task_reminders_sent (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  kind reminder_kind not null,
  sent_at timestamptz not null default now(),
  unique (task_id, student_id, kind)
);

create index if not exists idx_reminders_task on task_reminders_sent(task_id);

-- ---------------------------------------------------------
-- 10. TABLE: documents
-- ---------------------------------------------------------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  title text not null,
  description text,
  drive_url text not null,
  author_id uuid not null references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- S3 : la matière doit appartenir à la même classe que la ressource.
  constraint documents_subject_class_fk
    foreign key (subject_id, class_id) references subjects(id, class_id) on delete cascade
);

create index if not exists idx_documents_class_id on documents(class_id);
create index if not exists idx_documents_subject_id on documents(subject_id);
create index if not exists idx_documents_created_at on documents(created_at desc);

-- ---------------------------------------------------------
-- 11. TABLE: hints (anciens devoirs/examens)
-- ---------------------------------------------------------
create table if not exists hints (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  title text not null,
  year text not null,
  type hint_type not null default 'AUTRE',
  drive_url text not null,
  author_id uuid not null references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- S3 : la matière doit appartenir à la même classe que la ressource.
  constraint hints_subject_class_fk
    foreign key (subject_id, class_id) references subjects(id, class_id) on delete cascade
);

create index if not exists idx_hints_class_id on hints(class_id);
create index if not exists idx_hints_subject_id on hints(subject_id);
create index if not exists idx_hints_year on hints(year);

-- ---------------------------------------------------------
-- 12. TABLE: recordings (cours enregistrés)
-- ---------------------------------------------------------
create table if not exists recordings (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  title text not null,
  date date not null,
  description text,
  drive_url text not null,
  creator_id uuid not null references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- S3 : la matière doit appartenir à la même classe que la ressource.
  constraint recordings_subject_class_fk
    foreign key (subject_id, class_id) references subjects(id, class_id) on delete cascade
);

create index if not exists idx_recordings_class_id on recordings(class_id);
create index if not exists idx_recordings_subject_id on recordings(subject_id);
create index if not exists idx_recordings_date on recordings(date desc);

-- ---------------------------------------------------------
-- 13. TABLE: chat_messages
-- ---------------------------------------------------------
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete set null,
  content text not null check (char_length(content) between 1 and 2000),
  is_announcement boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_class_created on chat_messages(class_id, created_at desc);

-- Realtime : publier les INSERT/DELETE du chat aux membres de la classe.
-- (Doit être activé sinon les événements temps réel ne sont jamais diffusés.)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table chat_messages;
  end if;
end $$;

-- ---------------------------------------------------------
-- 14. TABLE: notifications
-- ---------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  type notification_type not null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient on notifications(recipient_id, created_at desc);
create index if not exists idx_notifications_unread on notifications(recipient_id) where read_at is null;

-- ---------------------------------------------------------
-- 14b. TABLE: assignment_email_notifications (trace des emails automatiques)
-- ---------------------------------------------------------
-- Historique complet des emails envoyés / en échec / en attente, avec
-- anti-doublon : un email SENT de même type pour un même (devoir, utilisateur)
-- ne sera jamais renvoyé (index uniques partiels ci-dessous).
create table if not exists assignment_email_notifications (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references tasks(id) on delete cascade, -- null pour AUTHENTICATION_APPROVED
  user_id uuid not null references profiles(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  notification_type text not null check (notification_type in ('AUTHENTICATION_APPROVED','ASSIGNMENT_3_DAYS','ASSIGNMENT_1_DAY')),
  status text not null default 'PENDING' check (status in ('PENDING','SENT','FAILED')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_notifs_user on assignment_email_notifications(user_id, created_at desc);
create index if not exists idx_email_notifs_status on assignment_email_notifications(status);
create index if not exists idx_email_notifs_assignment on assignment_email_notifications(assignment_id);
-- Anti-doublon en base : au plus UN SENT par (devoir, utilisateur, type).
create unique index if not exists uq_email_notif_sent_per_assignment
  on assignment_email_notifications(assignment_id, user_id, notification_type)
  where assignment_id is not null and status = 'SENT';
create unique index if not exists uq_email_notif_sent_auth
  on assignment_email_notifications(user_id, notification_type)
  where assignment_id is null and status = 'SENT';

-- =========================================================
-- 15. FONCTIONS UTILITAIRES (utilisées par RLS)
-- =========================================================

create or replace function current_profile_role()
returns user_role
language sql stable security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

-- Un utilisateur n'a accès aux données de classe que s'il est ADMIN ou si sa
-- demande d'inscription a été ACCEPTED (les comptes PENDING sont bloqués).
create or replace function is_approved_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select is_admin()
     or exists (
          select 1 from registration_requests r
          where r.user_id = auth.uid() and r.status = 'ACCEPTED'
        );
$$;

create or replace function current_profile_class_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
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

create or replace function is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select role = 'ADMIN' from profiles where id = auth.uid()), false);
$$;

create or replace function is_delegate_of(target_class uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'DELEGATE' and class_id = target_class from profiles where id = auth.uid()),
    false
  );
$$;

create or replace function is_member_of(target_class uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select is_admin()
     or (
       is_approved_member()
       and exists (
         select 1 from profiles p
         where p.id = auth.uid() and p.class_id = target_class
       )
     );
$$;

-- =========================================================
-- 16. TRIGGERS
-- =========================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_profiles_updated on profiles;
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

drop trigger if exists trg_tasks_updated on tasks;
create trigger trg_tasks_updated before update on tasks
  for each row execute function set_updated_at();

-- Empêche un STUDENT/DELEGATE de modifier son propre role/class_id
-- (double sécurité en plus de RLS ci-dessous)
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

-- =========================================================
-- 17. ROW LEVEL SECURITY
-- =========================================================

alter table classes enable row level security;
alter table profiles enable row level security;
alter table class_members enable row level security;
alter table subjects enable row level security;
alter table registration_requests enable row level security;
alter table tasks enable row level security;
alter table task_completions enable row level security;
alter table task_reminders_sent enable row level security;
alter table documents enable row level security;
alter table hints enable row level security;
alter table recordings enable row level security;
alter table chat_messages enable row level security;
alter table notifications enable row level security;

alter table assignment_email_notifications enable row level security;

-- ---- assignment_email_notifications ----
-- Lecture réservée aux administrateurs (les écritures sont faites par le
-- service role côté serveur / cron, qui contourne RLS).
drop policy if exists email_notifs_admin_select on assignment_email_notifications;
create policy email_notifs_admin_select on assignment_email_notifications for select
  using (is_admin());

-- ---- classes ----
drop policy if exists classes_select on classes;
create policy classes_select on classes for select
  using (true); -- nécessaire pour le formulaire d'inscription (liste des classes)

drop policy if exists classes_insert on classes;
create policy classes_insert on classes for insert
  with check (is_admin());

drop policy if exists classes_delete on classes;
create policy classes_delete on classes for delete
  using (
    is_admin()
    and not exists (select 1 from profiles p where p.class_id = classes.id)
  );

-- ---- profiles ----
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (
    id = auth.uid()
    or is_admin()
    or (class_id is not null and class_id = current_profile_class_id())
  );

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update
  using (id = auth.uid() or is_admin());

drop policy if exists profiles_update_admin_role on profiles;
-- Seul un ADMIN peut changer le role/class_id d'un tiers (le trigger bloque aussi le self-service)
create policy profiles_update_admin_role on profiles for update
  using (is_admin());

-- ---- class_members ----
drop policy if exists class_members_select on class_members;
-- Chacun relit SES propres appartenances (historique des départs inclus) ;
-- les membres lisent l'appartenance active de leur classe.
create policy class_members_select on class_members for select
  using (
    user_id = auth.uid()
    or is_member_of(class_id)
  );

drop policy if exists class_members_admin_write on class_members;
create policy class_members_admin_write on class_members for all
  using (is_admin()) with check (is_admin());

-- ---- subjects ----
drop policy if exists subjects_select on subjects;
create policy subjects_select on subjects for select
  using (is_member_of(class_id));

drop policy if exists subjects_admin_write on subjects;
create policy subjects_admin_write on subjects for all
  using (is_admin()) with check (is_admin());

-- ---- registration_requests ----
drop policy if exists regreq_select on registration_requests;
create policy regreq_select on registration_requests for select
  using (
    user_id = auth.uid()
    or is_admin()
    or is_delegate_of(class_id)
  );

drop policy if exists regreq_insert on registration_requests;
-- P-020 (migration 0019) : un client n'insère QUE sa propre demande, au statut
-- PENDING, non décidée, et SANS origine — les demandes de changement passent
-- exclusivement par classpulse_request_class_change (service_role).
create policy regreq_insert on registration_requests for insert
  with check (
    user_id = auth.uid()
    and status = 'PENDING'
    and decided_by is null
    and decided_at is null
    and previous_class_id is null
  );

drop policy if exists regreq_update on registration_requests;
create policy regreq_update on registration_requests for update
  using (is_admin() or is_delegate_of(class_id));

-- ---- tasks ----
drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select
  using (is_member_of(class_id));

drop policy if exists tasks_write on tasks;
create policy tasks_write on tasks for all
  using (is_admin() or is_delegate_of(class_id))
  with check (is_admin() or is_delegate_of(class_id));

-- ---- task_completions ----
drop policy if exists task_completions_select on task_completions;
create policy task_completions_select on task_completions for select
  using (
    student_id = auth.uid()
    or exists (
      select 1 from tasks t
      where t.id = task_completions.task_id and is_member_of(t.class_id)
    )
  );

drop policy if exists task_completions_write on task_completions;
create policy task_completions_write on task_completions for all
  using (
    student_id = auth.uid()
    and exists (
      select 1 from tasks t
      where t.id = task_completions.task_id and is_member_of(t.class_id)
    )
  )
  with check (student_id = auth.uid());

-- ---- task_reminders_sent (uniquement backend / service role) ----
drop policy if exists reminders_admin_only on task_reminders_sent;
create policy reminders_admin_only on task_reminders_sent for all
  using (is_admin()) with check (is_admin());

-- ---- documents ----
drop policy if exists documents_select on documents;
create policy documents_select on documents for select
  using (is_member_of(class_id));

drop policy if exists documents_insert on documents;
create policy documents_insert on documents for insert
  with check (is_member_of(class_id) and author_id = auth.uid());

drop policy if exists documents_delete on documents;
create policy documents_delete on documents for delete
  using (
    author_id = auth.uid()
    or is_admin()
    or is_delegate_of(class_id)
  );

-- ---- hints ----
drop policy if exists hints_select on hints;
create policy hints_select on hints for select
  using (is_member_of(class_id));

drop policy if exists hints_insert on hints;
create policy hints_insert on hints for insert
  with check (is_member_of(class_id) and author_id = auth.uid());

drop policy if exists hints_delete on hints;
create policy hints_delete on hints for delete
  using (
    author_id = auth.uid()
    or is_admin()
    or is_delegate_of(class_id)
  );

-- ---- recordings ----
drop policy if exists recordings_select on recordings;
create policy recordings_select on recordings for select
  using (is_member_of(class_id));

drop policy if exists recordings_write on recordings;
create policy recordings_write on recordings for all
  using (is_admin() or is_delegate_of(class_id))
  with check (is_admin() or is_delegate_of(class_id));

-- ---- chat_messages ----
-- S2 : un message ne peut être une annonce (is_announcement = true) que si
-- l'auteur est DELEGATE de la classe ou ADMIN (la Server Action vérifie aussi
-- le rôle côté serveur ; ici la protection est garantie par PostgreSQL).
-- NB : AUCUNE policy UPDATE sur chat_messages — toute modification d'un message
-- existant (dont la transformation en annonce) est refusée par RLS.
drop policy if exists chat_select on chat_messages;
create policy chat_select on chat_messages for select
  using (is_member_of(class_id));

drop policy if exists chat_insert on chat_messages;
create policy chat_insert on chat_messages for insert
  with check (
    is_member_of(class_id)
    and author_id = auth.uid()
    and (
      is_announcement is not true
      or is_admin()
      or is_delegate_of(class_id)
    )
  );

drop policy if exists chat_delete on chat_messages;
create policy chat_delete on chat_messages for delete
  using (is_admin() or is_delegate_of(class_id) or author_id = auth.uid());

-- ---- notifications ----
drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications for select
  using (recipient_id = auth.uid() or is_admin());

drop policy if exists notifications_update on notifications;
-- S6 : un utilisateur ne marque que read_at (lu/non-lu). Les colonnes de
-- contenu (title, message, link, type, entity_id...) sont immuables :
--  - privilèges colonne : REVOKE UPDATE (bloc S6 ci-dessous) ;
--  - trigger trg_notifications_readonly : refuse toute modification ;
--  - WITH CHECK : jamais de changement de destinataire.
create policy notifications_update on notifications for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

drop policy if exists notifications_insert on notifications;
-- Toutes les notifications passent par NotificationService (service role, côté
-- serveur). On interdit l'insertion côté client (anti-spam / anti-usurpation).
create policy notifications_insert on notifications for insert
  with check (is_admin());

-- =========================================================
-- 18. PLATEFORME TEMPS RÉEL (notifications unifiées + assistant)
--     Équivalent de supabase/migrations/0002_realtime_platform.sql
-- =========================================================

-- ---- 18.1 Types de notifications supplémentaires ----
do $$ begin
  alter type notification_type add value if not exists 'ASSIGNMENT_CREATED';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type notification_type add value if not exists 'ASSIGNMENT_UPDATED';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type notification_type add value if not exists 'COURSE_SAVED';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type notification_type add value if not exists 'ANNOUNCEMENT_CREATED';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type notification_type add value if not exists 'COURSE_UPDATED';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type notification_type add value if not exists 'TASK_COMPLETED';
exception when duplicate_object then null; end $$;

-- ---- 18.2 notifications enrichies ----
alter table notifications add column if not exists entity_type text;
alter table notifications add column if not exists entity_id uuid;
alter table notifications add column if not exists link text;
alter table notifications add column if not exists category text not null default 'system';

create index if not exists idx_notifications_recipient_read
  on notifications(recipient_id, read_at, created_at desc);
create index if not exists idx_notifications_category
  on notifications(recipient_id, category, created_at desc);

-- ---- 18.2b S6 — notifications en lecture seule (sauf read_at) ----
-- Un utilisateur ne peut que marquer une notification lue/non-lue (read_at).
-- Toute autre colonne est immuable : REVOKE UPDATE au niveau table (l'ACL par
-- défaut de Supabase accorde ALL aux rôles — un REVOKE colonne seul est
-- impuissant) + REVOKE colonnes + trigger (défense en profondeur, tous rôles
-- confondus).
revoke update on notifications from anon, authenticated, public;
revoke update (id, recipient_id, type, title, message, created_at,
               entity_type, entity_id, link, category)
  on notifications from anon, authenticated;
grant update (read_at) on notifications to authenticated;

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

-- ---- 18.3 assistant_chats / assistant_messages ----
create table if not exists assistant_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null default 'Nouveau chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assistant_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references assistant_chats(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_assistant_msgs_chat on assistant_messages(chat_id, created_at);

-- ---- 18.4 RLS nouvelles tables ----
alter table assistant_chats enable row level security;
alter table assistant_messages enable row level security;

drop policy if exists assistant_chats_select on assistant_chats;
create policy assistant_chats_select on assistant_chats for select
  using (user_id = auth.uid());
drop policy if exists assistant_chats_insert on assistant_chats;
create policy assistant_chats_insert on assistant_chats for insert
  with check (user_id = auth.uid());
drop policy if exists assistant_chats_update on assistant_chats;
create policy assistant_chats_update on assistant_chats for update
  using (user_id = auth.uid());
drop policy if exists assistant_chats_delete on assistant_chats;
create policy assistant_chats_delete on assistant_chats for delete
  using (user_id = auth.uid());

drop policy if exists assistant_msgs_select on assistant_messages;
create policy assistant_msgs_select on assistant_messages for select
  using (exists (select 1 from assistant_chats ac where ac.id = assistant_messages.chat_id and ac.user_id = auth.uid()));
drop policy if exists assistant_msgs_insert on assistant_messages;
create policy assistant_msgs_insert on assistant_messages for insert
  with check (exists (select 1 from assistant_chats ac where ac.id = assistant_messages.chat_id and ac.user_id = auth.uid()));

-- ---- 18.5 Realtime ----
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='notifications') then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='tasks') then
    alter publication supabase_realtime add table tasks;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='documents') then
    alter publication supabase_realtime add table documents;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='hints') then
    alter publication supabase_realtime add table hints;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='recordings') then
    alter publication supabase_realtime add table recordings;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='task_completions') then
    alter publication supabase_realtime add table task_completions;
  end if;
end $$;

-- ---- 18.6 Sécurité & index complémentaires ----
-- L'email des profils n'est pas sélectionnable par les clients. Le revoke
-- doit cibler le NIVEAU TABLE : le grant par défaut de Supabase est
-- table-level, un revoke de colonne seul est impuissant (cf. S1).
do $$ begin
  revoke select on profiles from anon, authenticated, public;
  grant select (id, first_name, last_name, role, class_id, last_seen_at, created_at, updated_at)
    on profiles to anon, authenticated;
exception when others then null; end $$;
do $$ begin
  grant select on profiles to service_role;
exception when others then null; end $$;

create index if not exists idx_notifications_entity on notifications(entity_id);
create index if not exists idx_chat_announcements on chat_messages(class_id, is_announcement, created_at desc);

-- ---- 18.7 S9 — rate limiting IA distribué (Supabase partagé) ----
-- Compteurs partagés entre toutes les instances (table ai_rate_limits +
-- fonction atomique check_ai_rate_limit). Voir migration 0015.
create table if not exists ai_rate_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  request_count int not null default 0,
  primary key (bucket_key, window_start)
);

alter table ai_rate_limits enable row level security;
drop policy if exists ai_rate_limits_all on ai_rate_limits;

create or replace function check_ai_rate_limit(
  p_bucket_key text,
  p_limit int,
  p_window_seconds int
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count int;
  v_elapsed int;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', 60);
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into ai_rate_limits (bucket_key, window_start, request_count)
  values (p_bucket_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set request_count = ai_rate_limits.request_count + 1
  returning request_count into v_count;

  if random() < 0.01 then
    delete from ai_rate_limits
    where window_start < v_now - interval '1 day';
  end if;

  if v_count <= p_limit then
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  v_elapsed := greatest(0, (extract(epoch from v_now) - extract(epoch from v_window_start)))::int;
  return jsonb_build_object(
    'allowed', false,
    'retry_after_seconds', greatest(1, p_window_seconds - v_elapsed)
  );
end;
$$;

revoke execute on function check_ai_rate_limit(text, int, int) from public;
grant execute on function check_ai_rate_limit(text, int, int) to authenticated, service_role;

-- =========================================================
-- 19. MODULE EMPLOI DU TEMPS (équivalent migration 0016)
-- =========================================================

-- ---- 19.1 Couleur des matières (palette contrôlée) ----
alter table subjects add column if not exists color_key text not null default 'blue';
do $$ begin
  alter table subjects drop constraint if exists subjects_color_key_check;
  alter table subjects add constraint subjects_color_key_check check (
    color_key in ('blue','indigo','violet','emerald','teal','amber','rose','red','cyan','orange','purple','yellow','fuchsia','sky','lime','pink','green','slate','stone','gray')
  );
exception when others then null; end $$;

-- ---- 19.2 schedule_sessions (séances récurrentes) ----
create table if not exists schedule_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  room text,
  teacher text,
  valid_from date not null default current_date,
  valid_until date,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_sessions_time_order check (end_time > start_time),
  constraint schedule_sessions_validity check (valid_until is null or valid_until >= valid_from),
  constraint schedule_sessions_subject_class_fk
    foreign key (subject_id, class_id) references subjects(id, class_id) on delete cascade
);

create unique index if not exists uq_schedule_sessions_id_class
  on schedule_sessions(id, class_id);
create index if not exists idx_schedule_sessions_class on schedule_sessions(class_id);
create index if not exists idx_schedule_sessions_class_dow on schedule_sessions(class_id, day_of_week);
create index if not exists idx_schedule_sessions_class_status on schedule_sessions(class_id, status);

drop trigger if exists trg_schedule_sessions_updated on schedule_sessions;
create trigger trg_schedule_sessions_updated before update on schedule_sessions
  for each row execute function set_updated_at();

-- Anti-chevauchement (garantie en base, courses concurrentes).
do $$ begin
  create extension if not exists btree_gist;
exception when others then null; end $$;
alter table schedule_sessions drop constraint if exists schedule_sessions_no_overlap;
alter table schedule_sessions add constraint schedule_sessions_no_overlap
  exclude using gist (
    class_id with =,
    day_of_week with =,
    int4range(
      (extract(hour from start_time) * 60 + extract(minute from start_time))::int4,
      (extract(hour from end_time) * 60 + extract(minute from end_time))::int4,
      '[)'
    ) with &&,
    daterange(valid_from, valid_until, '[]') with &&
  );

-- ---- 19.3 schedule_session_exceptions (exceptions datées) ----
create table if not exists schedule_session_exceptions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references schedule_sessions(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  date date not null,
  is_cancelled boolean not null default false,
  new_start_time time,
  new_end_time time,
  new_room text,
  new_subject_id uuid references subjects(id) on delete set null,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, date),
  constraint schedule_exceptions_subject_class_fk
    foreign key (new_subject_id, class_id) references subjects(id, class_id) on delete cascade,
  constraint schedule_exceptions_time_order check (
    (new_start_time is null and new_end_time is null)
    or (new_start_time is not null and new_end_time is not null and new_end_time > new_start_time)
  ),
  constraint schedule_exceptions_not_empty check (
    is_cancelled
    or new_start_time is not null
    or new_room is not null
    or new_subject_id is not null
  )
);

alter table schedule_session_exceptions drop constraint if exists schedule_exceptions_session_class_fk;
alter table schedule_session_exceptions add constraint schedule_exceptions_session_class_fk
  foreign key (session_id, class_id) references schedule_sessions(id, class_id) on delete cascade;

create index if not exists idx_schedule_exceptions_class_date
  on schedule_session_exceptions(class_id, date);
create index if not exists idx_schedule_exceptions_session
  on schedule_session_exceptions(session_id);

drop trigger if exists trg_schedule_exceptions_updated on schedule_session_exceptions;
create trigger trg_schedule_exceptions_updated before update on schedule_session_exceptions
  for each row execute function set_updated_at();

-- ---- 19.4 Types de notifications ----
do $$ begin
  alter type notification_type add value if not exists 'SCHEDULE_PUBLISHED';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type notification_type add value if not exists 'SCHEDULE_UPDATED';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type notification_type add value if not exists 'SESSION_CANCELLED';
exception when duplicate_object then null; end $$;

-- ---- 19.5 RLS ----
alter table schedule_sessions enable row level security;
alter table schedule_session_exceptions enable row level security;

drop policy if exists schedule_sessions_select on schedule_sessions;
create policy schedule_sessions_select on schedule_sessions for select
  using (
    is_member_of(class_id)
    and (status = 'PUBLISHED' or is_admin() or is_delegate_of(class_id))
  );
drop policy if exists schedule_sessions_write on schedule_sessions;
create policy schedule_sessions_write on schedule_sessions for all
  using (is_admin() or is_delegate_of(class_id))
  with check (is_admin() or is_delegate_of(class_id));

drop policy if exists schedule_exceptions_select on schedule_session_exceptions;
create policy schedule_exceptions_select on schedule_session_exceptions for select
  using (is_member_of(class_id));
drop policy if exists schedule_exceptions_write on schedule_session_exceptions;
create policy schedule_exceptions_write on schedule_session_exceptions for all
  using (is_admin() or is_delegate_of(class_id))
  with check (is_admin() or is_delegate_of(class_id));

-- ---- 19.6 Couleur des matières : délégué = couleur seule ----
drop policy if exists subjects_update_delegate on subjects;
create policy subjects_update_delegate on subjects for update
  using (is_delegate_of(class_id))
  with check (is_delegate_of(class_id));

create or replace function subjects_guard_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if is_admin() then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.class_id is distinct from old.class_id
     or new.name is distinct from old.name
     or new.code is distinct from old.code
     or new.created_at is distinct from old.created_at then
    raise exception 'Seule la couleur de la matière peut être modifiée (délégué)';
  end if;
  return new;
end; $$;

drop trigger if exists trg_subjects_guard_update on subjects;
create trigger trg_subjects_guard_update before update on subjects
  for each row execute function subjects_guard_update();

-- ---- 19.7 Realtime ----
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='schedule_sessions') then
    alter publication supabase_realtime add table schedule_sessions;
  end if;
exception when others then null; end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='schedule_session_exceptions') then
    alter publication supabase_realtime add table schedule_session_exceptions;
  end if;
exception when others then null; end $$;

-- =========================================================
-- 20. MODULE ÉVALUATIONS (agenda académique) — équivalent migration 0017
-- =========================================================

-- ---- 20.1 Enums ----
do $$ begin
  create type evaluation_type as enum ('CC', 'DEVOIR_SURVEILLE', 'EXAMEN', 'RATTRAPAGE', 'TP', 'AUTRE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type evaluation_status as enum ('DRAFT', 'PUBLISHED', 'CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  alter type notification_type add value if not exists 'EVALUATION_PUBLISHED';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type notification_type add value if not exists 'EVALUATION_UPDATED';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type notification_type add value if not exists 'EVALUATION_CANCELLED';
exception when duplicate_object then null; end $$;

-- ---- 20.2 evaluations ----
-- Les chapitres concernés sont TOUJOURS facultatifs : `chapters text[] not
-- null default '{}'` — absence = tableau vide, aucune contrainte de présence.
-- Les horaires et la salle sont facultatifs (informations parfois inconnues).
create table if not exists evaluations (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 150),
  type evaluation_type not null default 'AUTRE',
  description text,
  date date not null,
  start_time time,
  end_time time,
  room text,
  chapters text[] not null default '{}',
  status evaluation_status not null default 'DRAFT',
  rescheduled_from date,
  cancellation_note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluations_subject_class_fk
    foreign key (subject_id, class_id) references subjects(id, class_id) on delete cascade,
  constraint evaluations_time_order check (
    (end_time is null or start_time is not null)
    and (end_time is null or end_time > start_time)
  ),
  constraint evaluations_chapters_count check (coalesce(array_length(chapters, 1), 0) <= 30)
);

create unique index if not exists uq_evaluations_id_class on evaluations(id, class_id);
create index if not exists idx_evaluations_class_id on evaluations(class_id);
create index if not exists idx_evaluations_class_date on evaluations(class_id, date);
create index if not exists idx_evaluations_class_status on evaluations(class_id, status);
create index if not exists idx_evaluations_subject_id on evaluations(subject_id);
create index if not exists idx_evaluations_date on evaluations(date);

drop trigger if exists trg_evaluations_updated on evaluations;
create trigger trg_evaluations_updated before update on evaluations
  for each row execute function set_updated_at();

-- ---- 20.3 Ressources de révision (facultatives) ----
do $$ begin
  alter table documents add constraint documents_id_class_unique unique (id, class_id);
exception when duplicate_table then null; end $$;
do $$ begin
  alter table hints add constraint hints_id_class_unique unique (id, class_id);
exception when duplicate_table then null; end $$;

create table if not exists evaluation_documents (
  evaluation_id uuid not null references evaluations(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (evaluation_id, document_id),
  constraint evaluation_documents_eval_class_fk
    foreign key (evaluation_id, class_id) references evaluations(id, class_id) on delete cascade,
  constraint evaluation_documents_doc_class_fk
    foreign key (document_id, class_id) references documents(id, class_id) on delete cascade
);
create index if not exists idx_evaluation_documents_document on evaluation_documents(document_id);

create table if not exists evaluation_hints (
  evaluation_id uuid not null references evaluations(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  hint_id uuid not null references hints(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (evaluation_id, hint_id),
  constraint evaluation_hints_eval_class_fk
    foreign key (evaluation_id, class_id) references evaluations(id, class_id) on delete cascade,
  constraint evaluation_hints_hint_class_fk
    foreign key (hint_id, class_id) references hints(id, class_id) on delete cascade
);
create index if not exists idx_evaluation_hints_hint on evaluation_hints(hint_id);

-- ---- 20.4 RLS ----
alter table evaluations enable row level security;
alter table evaluation_documents enable row level security;
alter table evaluation_hints enable row level security;

drop policy if exists evaluations_select on evaluations;
create policy evaluations_select on evaluations for select
  using (
    is_member_of(class_id)
    and (status <> 'DRAFT' or is_admin() or is_delegate_of(class_id))
  );
drop policy if exists evaluations_write on evaluations;
create policy evaluations_write on evaluations for all
  using (is_admin() or is_delegate_of(class_id))
  with check (is_admin() or is_delegate_of(class_id));

drop policy if exists evaluation_documents_select on evaluation_documents;
create policy evaluation_documents_select on evaluation_documents for select
  using (is_member_of(class_id));
drop policy if exists evaluation_documents_write on evaluation_documents;
create policy evaluation_documents_write on evaluation_documents for all
  using (is_admin() or is_delegate_of(class_id))
  with check (is_admin() or is_delegate_of(class_id));

drop policy if exists evaluation_hints_select on evaluation_hints;
create policy evaluation_hints_select on evaluation_hints for select
  using (is_member_of(class_id));
drop policy if exists evaluation_hints_write on evaluation_hints;
create policy evaluation_hints_write on evaluation_hints for all
  using (is_admin() or is_delegate_of(class_id))
  with check (is_admin() or is_delegate_of(class_id));

-- ---- 20.5 Realtime ----
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='evaluations') then
    alter publication supabase_realtime add table evaluations;
  end if;
exception when others then null; end $$;

-- ---------------------------------------------------------
-- 21. PRÉFÉRENCES DE NOTIFICATIONS (migration 0018_notification_preferences.sql)
-- ---------------------------------------------------------
-- Une ligne par (utilisateur, catégorie). Valeur par défaut = AUCUNE ligne :
-- les comptes créés avant la migration conservent le comportement de ClassPulse.
create table if not exists notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  category text not null check (
    category in ('ASSIGNMENTS','ASSIGNMENT_REMINDERS','EVALUATIONS','SCHEDULE','ANNOUNCEMENTS','RESOURCES','CHAT')
  ),
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_notification_preferences_user_category unique (user_id, category)
);

create index if not exists idx_notification_prefs_user
  on notification_preferences(user_id);

drop trigger if exists trg_notification_preferences_updated on notification_preferences;
create trigger trg_notification_preferences_updated before update on notification_preferences
  for each row execute function set_updated_at();

-- RLS : propriétaire uniquement — aucune policy admin : les préférences sont
-- personnelles et ne doivent jamais être lues ni modifiées par autrui.
alter table notification_preferences enable row level security;

drop policy if exists notification_prefs_select on notification_preferences;
create policy notification_prefs_select on notification_preferences for select
  using (user_id = auth.uid());

drop policy if exists notification_prefs_insert on notification_preferences;
create policy notification_prefs_insert on notification_preferences for insert
  with check (user_id = auth.uid());

drop policy if exists notification_prefs_update on notification_preferences;
create policy notification_prefs_update on notification_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notification_prefs_delete on notification_preferences;
create policy notification_prefs_delete on notification_preferences for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------
-- 22. EMAILS PÉDAGOGIQUES — colonnes d'entité + anti-doublon (0018)
-- ---------------------------------------------------------
-- `assignment_email_notifications` trace tous les emails envoyés (historique
-- + anti-doublon). Les emails d'événements (évaluations, emploi du temps,
-- annonces, ressources, devoirs) s'identifient par une entité polymorphe.
alter table assignment_email_notifications add column if not exists entity_type text;
alter table assignment_email_notifications add column if not exists entity_id uuid;

alter table assignment_email_notifications
  drop constraint if exists assignment_email_notifications_notification_type_check;
alter table assignment_email_notifications
  add constraint assignment_email_notifications_notification_type_check
  check (notification_type in (
    'AUTHENTICATION_APPROVED','ASSIGNMENT_3_DAYS','ASSIGNMENT_1_DAY',
    'ASSIGNMENT_CREATED','ASSIGNMENT_UPDATED',
    'EVALUATION_PUBLISHED','EVALUATION_UPDATED','EVALUATION_CANCELLED',
    'SCHEDULE_PUBLISHED','SCHEDULE_UPDATED','SESSION_CANCELLED',
    'ANNOUNCEMENT_CREATED',
    'DOCUMENT_ADDED','HINT_ADDED','RECORDING_ADDED'
  ));

create unique index if not exists uq_email_notif_sent_entity
  on assignment_email_notifications(user_id, notification_type, entity_type, entity_id)
  where entity_id is not null and status = 'SENT';

create index if not exists idx_email_notifs_entity
  on assignment_email_notifications(entity_id);

-- L'index « sans devoir » historique ne doit plus couvrir les emails à entité
-- (sinon un seul email d'évaluation par utilisateur pour toute la plateforme).
drop index if exists uq_email_notif_sent_auth;
create unique index if not exists uq_email_notif_sent_auth
  on assignment_email_notifications(user_id, notification_type)
  where assignment_id is null and entity_id is null and status = 'SENT';

-- =========================================================
-- 21. APPARTENANCE À UNE CLASSE (départ, changement, historique)
--     Équivalent migration 0019_class_membership.sql
-- =========================================================
-- Voir l'en-tête de 0019 pour le modèle métier et les garanties de sécurité.
-- Les 4 fonctions sont SECURITY DEFINER et exécutables UNIQUEMENT par
-- service_role : elles ne sont appelées que par les Server Actions, qui
-- vérifient la session de l'utilisateur.

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

  update class_members
     set left_at = now()
   where user_id = p_user_id
     and class_id = v_profile.class_id
     and left_at is null;

  if not found then
    insert into class_members (class_id, user_id, left_at)
    values (v_profile.class_id, p_user_id, now())
    on conflict (class_id, user_id)
    do update set left_at = coalesce(class_members.left_at, excluded.left_at);
  end if;

  update registration_requests
     set status = 'CANCELLED', decided_by = p_user_id, decided_at = now()
   where user_id = p_user_id and status = 'PENDING';

  update profiles set class_id = null where id = p_user_id;

  return jsonb_build_object('status', 'ok');
end;
$$;

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
  when unique_violation then
    return jsonb_build_object('status', 'error', 'code', 'PENDING_EXISTS');
end;
$$;

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
  if v_request.status <> 'PENDING' then
    return jsonb_build_object('status', 'error', 'code', 'NOT_PENDING');
  end if;

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
    update class_members
       set left_at = now()
     where user_id = v_request.user_id
       and left_at is null
       and class_id is distinct from v_request.class_id;

    insert into class_members (class_id, user_id)
    values (v_request.class_id, v_request.user_id)
    on conflict (class_id, user_id)
    do update
      set left_at = null,
          joined_at = case
                        when class_members.left_at is not null then now()
                        else class_members.joined_at
                      end;

    update profiles set class_id = v_request.class_id where id = v_request.user_id;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'request_kind', case when v_request.previous_class_id is null then 'JOIN' else 'CHANGE' end
  );
end;
$$;

revoke execute on function classpulse_leave_class(uuid) from public, anon, authenticated;
revoke execute on function classpulse_request_class_change(uuid, uuid) from public, anon, authenticated;
revoke execute on function classpulse_cancel_request(uuid, uuid) from public, anon, authenticated;
revoke execute on function classpulse_decide_request(uuid, uuid, public.registration_status) from public, anon, authenticated;

grant execute on function classpulse_leave_class(uuid) to service_role;
grant execute on function classpulse_request_class_change(uuid, uuid) to service_role;
grant execute on function classpulse_cancel_request(uuid, uuid) to service_role;
grant execute on function classpulse_decide_request(uuid, uuid, public.registration_status) to service_role;

-- =========================================================
-- FIN DU SCHEMA
-- =========================================================
