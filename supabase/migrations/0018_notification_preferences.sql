-- =========================================================
-- 0018 — PRÉFÉRENCES DE NOTIFICATIONS (canaux : interne + e-mail)
-- =========================================================
-- Idempotent (if not exists / drop policy if exists / drop constraint if
-- exists) — ré-exécutable. A exécuter dans l'éditeur SQL de Supabase,
-- APRÈS 0017_evaluations.sql.
--
-- Garanties :
--   * Une ligne par (utilisateur, catégorie) — la contrainte unique interdit
--     les doublons même en cas de course.
--   * Les préférences sont strictement personnelles : RLS = propriétaire
--     UNIQUEMENT (auth.uid()), y compris pour les administrateurs.
--   * Aucune ligne n'est créée pour les comptes existants : une préférence
--     absante signifie « valeurs par défaut de ClassPulse » (calculées côté
--     serveur, voir lib/notifications/preferences.ts). Rien n'est réinitialisé.
--   * Les tables métier ne sont pas modifiées.
--
-- Second volet : `assignment_email_notifications` gagne les colonnes
-- d'entité polymorphe (entity_type / entity_id) pour tracer et dédupliquer
-- les NOUVEAUX emails pédagogiques (évaluations, emploi du temps, annonces,
-- ressources, devoirs). L'index d'anti-doublon historique « sans devoir »
-- est restreint aux seuls emails d'authentification (sinon un seul email
-- d'évaluation aurait pu être envoyé par utilisateur et par toute la durée
-- de vie de la plateforme).
-- =========================================================

-- ---------------------------------------------------------
-- 1. TABLE: notification_preferences
-- ---------------------------------------------------------
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

-- Fonction utilitaire déjà présente dans schema.sql (et utilisée par 0016/0017) :
-- recréée uniquement si elle manque pour rendre la migration autonome.
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create function set_updated_at()
    returns trigger language plpgsql as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;
end $$;

drop trigger if exists trg_notification_preferences_updated on notification_preferences;
create trigger trg_notification_preferences_updated before update on notification_preferences
  for each row execute function set_updated_at();

-- ---------------------------------------------------------
-- 2. RLS: propriétaire uniquement (jamais un autre utilisateur, jamais un admin)
-- ---------------------------------------------------------
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
-- 3. assignment_email_notifications: emails pédagogiques
-- ---------------------------------------------------------
alter table assignment_email_notifications add column if not exists entity_type text;
alter table assignment_email_notifications add column if not exists entity_id uuid;

-- Élargissement du type d'email accepté (auth/rappels historiques + événements).
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

-- Anti-doublon par entité : au plus UN SENT par (utilisateur, type, entité).
create unique index if not exists uq_email_notif_sent_entity
  on assignment_email_notifications(user_id, notification_type, entity_type, entity_id)
  where entity_id is not null and status = 'SENT';

create index if not exists idx_email_notifs_entity
  on assignment_email_notifications(entity_id);

-- L'index d'authentification ne doit PLUS couvrir les emails à entité :
-- sans ce retrait, un seul email « évaluation publiée » aurait pu être
-- envoyé par utilisateur (au lieu d'un par évaluation).
drop index if exists uq_email_notif_sent_auth;
create unique index if not exists uq_email_notif_sent_auth
  on assignment_email_notifications(user_id, notification_type)
  where assignment_id is null and entity_id is null and status = 'SENT';
