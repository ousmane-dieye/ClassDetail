-- =========================================================
-- MIGRATION 0001 — Système d'emails automatiques (email admin)
-- =========================================================
-- À exécuter UNE SEULE fois dans le SQL Editor de Supabase sur une base
-- existante. Idempotent : ré-exécutable sans erreur.
--
-- Ajoute la table de traçage `assignment_email_notifications` (anti-doublon,
-- statuts PENDING/SENT/FAILED) et sa policy RLS de lecture admin.
-- =========================================================

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

alter table assignment_email_notifications enable row level security;

drop policy if exists email_notifs_admin_select on assignment_email_notifications;
create policy email_notifs_admin_select on assignment_email_notifications for select
  using (is_admin());
