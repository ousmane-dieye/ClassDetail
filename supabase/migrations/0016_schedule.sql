-- =========================================================================
-- MIGRATION 0016 — MODULE EMPLOI DU TEMPS
-- =========================================================================
-- Ajoute :
--   1. subjects.color_key       — couleur stable par matière (palette
--                                 contrôlée, backfill déterministe).
--   2. schedule_sessions        — séances récurrentes (récurrent + validité),
--                                 brouillon/publication, anti-chevauchement
--                                 garanti par contrainte d'exclusion GiST.
--   3. schedule_session_exceptions — exceptions datées (annulation ponctuelle,
--                                 déplacement horaire, changement de salle).
--   4. Types de notifications   — SCHEDULE_PUBLISHED / SCHEDULE_UPDATED /
--                                 SESSION_CANCELLED (catégorie « schedule »).
--   5. RLS + Realtime           — isolation par classe, drafts masqués aux
--                                 étudiants, publication temps réel.
--
-- NON DESTRUCTIVE : ajouts uniquement, aucune donnée existante modifiée
-- autrement qu'un backfill de couleur (valeur par défaut réversible).
-- Idempotent : ré-exécutable sans erreur.
--
-- ⚠️ N'exécuter en production qu'après revue/validation explicite.
-- =========================================================================

-- ---------------------------------------------------------
-- 1. Couleur des matières
-- ---------------------------------------------------------
-- Palette contrôlée — doit rester synchronisée avec
-- lib/constants/subjectColors.ts (SUBJECT_COLOR_KEYS).
alter table subjects add column if not exists color_key text not null default 'blue';

do $$ begin
  alter table subjects drop constraint if exists subjects_color_key_check;
  alter table subjects add constraint subjects_color_key_check check (
    color_key in ('blue','indigo','violet','emerald','teal','amber','rose','red','cyan','orange','purple','yellow','fuchsia','sky','lime','pink','green','slate','stone','gray')
  );
exception when others then null; end $$;

-- Backfill déterministe : chaque matière existante reçoit une couleur
-- stable, répartie dans l'ordre de création au sein de sa classe (aucune
-- collision dans une même classe tant que la classe compte ≤ 20 matières).
-- `where color_key = 'blue'` : ne touche qu'aux lignes encore à la valeur
-- par défaut → ré-exécution inoffensive après personnalisation manuelle.
with ordered as (
  select id,
         row_number() over (partition by class_id order by created_at, id) - 1 as rn
  from subjects
  where color_key = 'blue'
)
update subjects s
set color_key = (
  select (array['blue','indigo','violet','emerald','teal','amber','rose','red','cyan','orange','purple','yellow','fuchsia','sky','lime','pink','green','slate','stone','gray'])[(o.rn % 20) + 1]
  from ordered o
  where o.id = s.id
)
where s.color_key = 'blue'
  and exists (select 1 from ordered o2 where o2.id = s.id);

-- ---------------------------------------------------------
-- 2. TABLE : schedule_sessions (séances récurrentes)
-- ---------------------------------------------------------
create table if not exists schedule_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  -- Jour ISO : 1 = lundi … 7 = dimanche (extract(isodow from date)).
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  room text,
  teacher text,
  valid_from date not null default current_date,
  valid_until date,
  -- Brouillon invisible des étudiants ; publié = version officielle.
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint schedule_sessions_time_order check (end_time > start_time),
  constraint schedule_sessions_validity check (valid_until is null or valid_until >= valid_from),
  -- S3 : la matière doit appartenir à la même classe que la séance.
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

-- ---------------------------------------------------------
-- 2b. Anti-chevauchement garanti en base (course concurrente)
-- ---------------------------------------------------------
-- Deux séances d'une même classe sont incompatibles si elles portent sur le
-- même jour de semaine, des plages horaires qui se chevauchent, ET des
-- périodes de validité qui se croisent. Contrainte d'exclusion GiST :
--   - le second INSERT/UPDATE concurrent échoue (23P01) même si deux
--     Server Actions s'exécutent simultanément ;
--   - la Server Action pré-détecte le conflit pour renvoyer un message clair.
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

-- ---------------------------------------------------------
-- 3. TABLE : schedule_session_exceptions (exceptions datées)
-- ---------------------------------------------------------
-- Une exception ne modifie JAMAIS la règle récurrente : elle vaut pour une
-- date précise (annulation ponctuelle, déplacement, changement de salle,
-- remplacement de matière).
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
  -- S3 : la matière de remplacement doit appartenir à la même classe.
  -- (cascade : si la matière disparaît, la session mère disparaît déjà —
  -- l'exception n'a plus de sens.)
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

-- Empêche une exception de pointer vers une session d'une autre classe.
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

-- ---------------------------------------------------------
-- 4. Types de notifications
-- ---------------------------------------------------------
do $$ begin
  alter type notification_type add value if not exists 'SCHEDULE_PUBLISHED';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type notification_type add value if not exists 'SCHEDULE_UPDATED';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type notification_type add value if not exists 'SESSION_CANCELLED';
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ---------------------------------------------------------
alter table schedule_sessions enable row level security;
alter table schedule_session_exceptions enable row level security;

-- ---- schedule_sessions ----
-- Lecture : membres de la classe ; les brouillons ne sont visibles que
-- par les délégués de la classe et les admins.
drop policy if exists schedule_sessions_select on schedule_sessions;
create policy schedule_sessions_select on schedule_sessions for select
  using (
    is_member_of(class_id)
    and (
      status = 'PUBLISHED'
      or is_admin()
      or is_delegate_of(class_id)
    )
  );

-- Écriture : ADMIN quelconque, ou DELEGATE de la classe ciblée uniquement
-- (is_delegate_of vérifie profiles.class_id = class_id de la ligne).
drop policy if exists schedule_sessions_write on schedule_sessions;
create policy schedule_sessions_write on schedule_sessions for all
  using (is_admin() or is_delegate_of(class_id))
  with check (is_admin() or is_delegate_of(class_id));

-- ---- schedule_session_exceptions ----
drop policy if exists schedule_exceptions_select on schedule_session_exceptions;
create policy schedule_exceptions_select on schedule_session_exceptions for select
  using (is_member_of(class_id));

drop policy if exists schedule_exceptions_write on schedule_session_exceptions;
create policy schedule_exceptions_write on schedule_session_exceptions for all
  using (is_admin() or is_delegate_of(class_id))
  with check (is_admin() or is_delegate_of(class_id));

-- ---------------------------------------------------------
-- 6. Couleur des matières : délégué = couleur seule
-- ---------------------------------------------------------
-- Les délégués peuvent adapter la couleur des matières de LEUR classe
-- (palette contrôlée validée par Zod côté serveur). Ils ne peuvent en
-- aucun cas renommer une matière ni la rattacher à une autre classe :
-- le trigger ci-dessous limite les non-admins à la seule colonne color_key.
drop policy if exists subjects_update_delegate on subjects;
create policy subjects_update_delegate on subjects for update
  using (is_delegate_of(class_id))
  with check (is_delegate_of(class_id));

create or replace function subjects_guard_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- service_role (cron/backend, pas de auth.uid()) : pas de restriction.
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

-- ---------------------------------------------------------
-- 7. Realtime
-- ---------------------------------------------------------
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

-- =========================================================================
-- FIN MIGRATION 0016
-- =========================================================================
