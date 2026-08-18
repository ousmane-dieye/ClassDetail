-- =========================================================================
-- MIGRATION 0011 — S3 : Empêcher les relations cross-class
-- =========================================================================
-- Correctif de sécurité (audit S3).
--
-- PROBLÈME
--   Les tables tasks/documents/hints/recordings ont des FK séparées vers
--   classes(id) et subjects(id), mais rien ne garantit que la matière
--   appartienne à la même classe que la ressource. Un DELEGATE peut donc
--   créer une ressource de sa classe avec subject_id d'une autre classe
--   (preuve live avant migration : HTTP 201 via l'API REST sur les 4 tables).
--
-- CORRECTION
--   FK composite `(subject_id, class_id) REFERENCES subjects(id, class_id)`
--   sur les 4 tables : PostgreSQL garantit resource.class_id = subject.class_id.
--   Exige une contrainte UNIQUE sur subjects(id, class_id) (cible de la FK).
--
-- DONNÉES EXISTANTES
--   Vérification faite sur la base avant cette migration : 0 ressource
--   cross-class (tasks 6, documents 2, hints 1, recordings 0 — toutes
--   cohérentes). La FK peut donc être ajoutée directement. Un contrôle de
--   pré-vol échoue néanmoins bruyamment si des données incohérentes sont
--   détectées (aucune suppression automatique).
--
-- IDEMPOTENCE
--   Ajout de contraintes conditionnel (pg_constraint) : ré-exécutable sans
--   effet de bord. Contrôle final qui échoue si une contrainte manque.
-- =========================================================================

-- 0. Pré-vol : ne doit trouver AUCUNE ressource cross-class.
do $$
declare
  v_bad int;
begin
  with bad as (
    select 'tasks' as src, t.id from tasks t join subjects s on s.id = t.subject_id where s.class_id <> t.class_id
    union all
    select 'documents', d.id from documents d join subjects s on s.id = d.subject_id where s.class_id <> d.class_id
    union all
    select 'hints', h.id from hints h join subjects s on s.id = h.subject_id where s.class_id <> h.class_id
    union all
    select 'recordings', r.id from recordings r join subjects s on s.id = r.subject_id where s.class_id <> r.class_id
  )
  select count(*) into v_bad from bad;

  if v_bad > 0 then
    raise exception
      'S3 : % ressource(s) cross-class détectée(s) — corriger les données avant d''appliquer cette FK (aucune suppression automatique).',
      v_bad;
  end if;
end $$;

-- 1. Cible de la FK composite : UNIQUE (id, class_id) sur subjects.
--    (id est déjà PK ; ce UNIQUE explicite est exigé par PostgreSQL pour
--    référencer la paire de colonnes depuis une FK.)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subjects_id_class_id_key'
      and conrelid = 'subjects'::regclass
  ) then
    alter table subjects
      add constraint subjects_id_class_id_key unique (id, class_id);
  end if;
end $$;

-- 2. FK composites (subject_id, class_id) → subjects(id, class_id).
--    `on delete cascade` : identique au comportement existant de la FK
--    subject_id (supprimer une matière supprime ses ressources).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_subject_class_fk' and conrelid = 'tasks'::regclass
  ) then
    alter table tasks
      add constraint tasks_subject_class_fk
      foreign key (subject_id, class_id) references subjects(id, class_id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'documents_subject_class_fk' and conrelid = 'documents'::regclass
  ) then
    alter table documents
      add constraint documents_subject_class_fk
      foreign key (subject_id, class_id) references subjects(id, class_id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'hints_subject_class_fk' and conrelid = 'hints'::regclass
  ) then
    alter table hints
      add constraint hints_subject_class_fk
      foreign key (subject_id, class_id) references subjects(id, class_id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'recordings_subject_class_fk' and conrelid = 'recordings'::regclass
  ) then
    alter table recordings
      add constraint recordings_subject_class_fk
      foreign key (subject_id, class_id) references subjects(id, class_id) on delete cascade;
  end if;
end $$;

-- 3. Contrôle d'application : échoue si une contrainte manque.
do $$
declare
  v_missing text;
begin
  select string_agg(x.conname, ', ') into v_missing
  from unnest(array[
    'subjects_id_class_id_key',
    'tasks_subject_class_fk',
    'documents_subject_class_fk',
    'hints_subject_class_fk',
    'recordings_subject_class_fk'
  ]) as x(conname)
  where not exists (
    select 1 from pg_constraint where conname = x.conname
  );

  if v_missing is not null then
    raise exception 'S3 NON appliqué : contraintes manquantes : %', v_missing;
  end if;
end $$;

-- 4. Rappels (non exécutés ici) :
--    - Les FK simples (subject_id → subjects(id)) et (class_id → classes(id))
--      sont conservées ; la FK composite s'y ajoute sans les remplacer.
--    - Re-test manuel après application (voir scripts/verify-s3.mjs) :
--        INSERT sujet même classe  -> 201
--        INSERT sujet autre classe -> 4xx (23503)
--        UPDATE class_id vers autre classe -> 4xx
--        UPDATE subject_id vers matière autre -> 4xx
-- =========================================================================
