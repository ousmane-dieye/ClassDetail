-- =========================================================
-- MIGRATION 0006 — Suppression de la messagerie privée
--   Retire les tables de messagerie privée (conversations,
--   conversation_participants, direct_messages, message_reads),
--   leur fonction RLS et leur publication realtime.
--   Le chat de classe (chat_messages) est conservé.
-- =========================================================

-- 1. Tables (l'ordre respecte les dépendances : enfant → parent)
drop table if exists message_reads;
drop table if exists direct_messages;
drop table if exists conversation_participants;
drop table if exists conversations;

-- 2. Fonction RLS dédiée à la messagerie
drop function if exists is_participant_of(uuid);

-- 3. Publication realtime (nettoyage explicite, au cas où)
do $$ begin
  if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='conversations') then
    alter publication supabase_realtime drop table conversations;
  end if;
  if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='conversation_participants') then
    alter publication supabase_realtime drop table conversation_participants;
  end if;
  if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='direct_messages') then
    alter publication supabase_realtime drop table direct_messages;
  end if;
  if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='message_reads') then
    alter publication supabase_realtime drop table message_reads;
  end if;
end $$;

-- =========================================================
-- FIN DE LA MIGRATION 0006
-- =========================================================
