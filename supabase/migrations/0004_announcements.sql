-- 0004_announcements.sql
-- Annonces de classe : les DELEGATE/ADMIN peuvent publier une annonce dans le
-- chat de classe (is_announcement = true) qui déclenche une notification
-- ANNOUNCEMENT_CREATED pour tous les membres de la classe.
--
-- Exécutable sans erreur sur une base déjà à jour (if not exists / guard).
-- Reflète la colonne ajoutée dans supabase/schema.sql.

alter table chat_messages
  add column if not exists is_announcement boolean not null default false;

-- Index de lecture des annonces récentes par classe.
create index if not exists idx_chat_announcements
  on chat_messages(class_id, created_at desc)
  where is_announcement = true;
