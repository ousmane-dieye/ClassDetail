-- =========================================================
-- 0017 — MODULE ÉVALUATIONS (agenda académique des évaluations)
-- =========================================================
-- Idempotent (if not exists / drop policy if exists) — ré-exécutable.
-- A exécuter dans l'éditeur SQL de Supabase, APRÈS 0016_schedule.sql.
--
-- Garanties métier :
--   * Les chapitres concernés sont TOUJOURS facultatifs : colonne
--     `chapters text[] not null default '{}'` — l'absence est représentée
--     par un tableau vide, jamais par une valeur artificielle, et AUCUNE
--     contrainte n'exige leur présence.
--   * Les ressources de révision (documents / hints) sont facultatives :
--     tables de jointure vides par défaut, sans contrainte de présence.
--   * L'isolation par classe (S3) est garantie en base : la matière doit
--     appartenir à la classe (FK composite), et les jointures ressources
--     portent une FK composite vers documents/hints (id, class_id).
-- =========================================================

-- ---------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- 2. TABLE: evaluations
-- ---------------------------------------------------------
create table if not exists evaluations (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 150),
  type evaluation_type not null default 'AUTRE',
  description text,
  -- Date locale (fuseau de l'application, Africa/Dakar) en "YYYY-MM-DD".
  date date not null,
  -- Horaires facultatifs : une évaluation peut être publiée sans heure.
  start_time time,
  end_time time,
  room text,
  -- Chapitres concernés : FACULTATIFS sans exception. Tableau vide = aucune
  -- information (le professeur n'a pas encore communiqué le programme).
  -- Aucune contrainte n'impose leur présence ni leur contenu.
  chapters text[] not null default '{}',
  status evaluation_status not null default 'DRAFT',
  -- Ancienne date lorsque la date d'une évaluation publiée a changé (report).
  rescheduled_from date,
  cancellation_note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- S3 : la matière doit appartenir à la même classe que l'évaluation.
  constraint evaluations_subject_class_fk
    foreign key (subject_id, class_id) references subjects(id, class_id) on delete cascade,
  -- Une heure de fin exige une heure de début ; si les deux existent, fin > début.
  constraint evaluations_time_order check (
    (end_time is null or start_time is not null)
    and (end_time is null or end_time > start_time)
  ),
  -- Garde-fou de taille (jamais une contrainte de PRESENCE).
  constraint evaluations_chapters_count check (coalesce(array_length(chapters, 1), 0) <= 30)
);

create unique index if not exists uq_evaluations_id_class
  on evaluations(id, class_id);
create index if not exists idx_evaluations_class_id on evaluations(class_id);
create index if not exists idx_evaluations_class_date on evaluations(class_id, date);
create index if not exists idx_evaluations_class_status on evaluations(class_id, status);
create index if not exists idx_evaluations_subject_id on evaluations(subject_id);
create index if not exists idx_evaluations_date on evaluations(date);

drop trigger if exists trg_evaluations_updated on evaluations;
create trigger trg_evaluations_updated before update on evaluations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------
-- 3. TABLES DE JOINTURE: ressources de révision (facultatives)
-- ---------------------------------------------------------
-- Cible de la FK composite (document_id, class_id) : documents n'avait que
-- sa PK — on ajoute l'unicité (id, class_id) comme pour subjects (S3).
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

create index if not exists idx_evaluation_documents_document
  on evaluation_documents(document_id);

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

create index if not exists idx_evaluation_hints_hint
  on evaluation_hints(hint_id);

-- ---------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ---------------------------------------------------------
alter table evaluations enable row level security;
alter table evaluation_documents enable row level security;
alter table evaluation_hints enable row level security;

-- Les brouillons ne sont visibles que des délégués/admins ; les étudiants
-- ne voient que les évaluations publiées (et annulées, pour en être informés).
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

-- ---------------------------------------------------------
-- 5. REALTIME
-- ---------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='evaluations') then
    alter publication supabase_realtime add table evaluations;
  end if;
exception when others then null; end $$;
