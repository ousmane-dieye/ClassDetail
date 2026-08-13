-- =========================================================
-- MIGRATION 0003 — Présence utilisateur + realtime conversations
--   - profiles.last_seen_at : dernière activité persistée (throttled)
--   - publication realtime de conversations (mise à jour en direct de
--     la liste des conversations quand last_message_at change)
-- Idempotent : ré-exécutable sans erreur.
-- =========================================================

-- ---------------------------------------------------------
-- 1. profiles : dernière activité
-- ---------------------------------------------------------
alter table profiles add column if not exists last_seen_at timestamptz;

create index if not exists idx_profiles_last_seen on profiles(last_seen_at desc);

-- ---------------------------------------------------------
-- 2. Realtime : conversations
--    (la liste des conversations se met à jour en direct quand
--    un nouveau message modifie last_message_at / le nom)
-- ---------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='conversations') then
    alter publication supabase_realtime add table conversations;
  end if;
end $$;

-- =========================================================
-- FIN DE LA MIGRATION 0003
-- =========================================================
