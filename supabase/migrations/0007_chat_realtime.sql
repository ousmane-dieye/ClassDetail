-- 0007_chat_realtime.sql
-- Le chat de classe repose sur un abonnement postgres_changes. La publication
-- `supabase_realtime` doit contenir `chat_messages`, sinon aucun événement
-- INSERT/DELETE n'est diffusé au navigateur et le chat exige un F5 manuel
-- pour voir les nouveaux messages (y compris les siens).
--
-- `supabase/schema.sql` active déjà cette publication pour les bases neuves ;
-- cette migration garantit le même comportement sur les bases existantes.
-- Idempotente : ré-exécutable sans erreur.

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
