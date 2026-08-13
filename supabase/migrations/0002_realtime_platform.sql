-- =========================================================
-- MIGRATION 0002 — Plateforme temps réel
--   Messagerie privée haut de gamme + notifications unifiées
--   + activation Realtime sur les données importantes.
-- Idempotent : ré-exécutable sans erreur.
-- =========================================================

-- ---------------------------------------------------------
-- 1. TYPE notification_type : nouveaux types
-- ---------------------------------------------------------
do $$ begin
  alter type notification_type add value if not exists 'MESSAGE_RECEIVED';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type notification_type add value if not exists 'NEW_CONVERSATION';
exception when duplicate_object then null; end $$;
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

-- ---------------------------------------------------------
-- 2. TABLE notifications : colonnes enrichies
-- ---------------------------------------------------------
alter table notifications add column if not exists entity_type text;
alter table notifications add column if not exists entity_id uuid;
alter table notifications add column if not exists link text;
alter table notifications add column if not exists category text not null default 'system';

create index if not exists idx_notifications_recipient_read
  on notifications(recipient_id, read_at, created_at desc);
create index if not exists idx_notifications_category
  on notifications(recipient_id, category, created_at desc);

-- ---------------------------------------------------------
-- 3. TABLE conversations (1:1 et groupes)
-- ---------------------------------------------------------
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text,
  class_id uuid references classes(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  -- clé canonique d'une conversation 1:1 = ids triés : "{a}:{b}"
  dm_key text,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_conversations_dm
  on conversations(dm_key) where dm_key is not null;
create index if not exists idx_conversations_last on conversations(last_message_at desc);

create table if not exists conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  unique (conversation_id, user_id)
);

create index if not exists idx_convs_participants on conversation_participants(user_id, conversation_id);

-- ---------------------------------------------------------
-- 4. TABLE direct_messages
-- ---------------------------------------------------------
create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  content text not null check (char_length(content) between 1 and 4000),
  reply_to_id uuid references direct_messages(id) on delete set null,
  attachment_type text not null default 'none' check (attachment_type in ('none','link','image','file')),
  attachment_url text,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_dms_conversation on direct_messages(conversation_id, created_at);
create index if not exists idx_dms_sender on direct_messages(sender_id);
create index if not exists idx_dms_reply on direct_messages(reply_to_id);

-- ---------------------------------------------------------
-- 5. TABLE message_reads (statut lu)
-- ---------------------------------------------------------
create table if not exists message_reads (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references direct_messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (message_id, user_id)
);

create index if not exists idx_message_reads on message_reads(user_id, message_id);

-- ---------------------------------------------------------
-- 6. TABLE assistant_chats / assistant_messages
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- 7. FONCTIONS RLS (messagerie)
-- ---------------------------------------------------------
create or replace function is_participant_of(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_participants cp
    where cp.conversation_id = conv and cp.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------
alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table direct_messages enable row level security;
alter table message_reads enable row level security;
alter table assistant_chats enable row level security;
alter table assistant_messages enable row level security;

-- ---- conversations ----
drop policy if exists conversations_select on conversations;
create policy conversations_select on conversations for select
  using (is_participant_of(id));

drop policy if exists conversations_insert on conversations;
create policy conversations_insert on conversations for insert
  with check (created_by = auth.uid());

drop policy if exists conversations_update on conversations;
create policy conversations_update on conversations for update
  using (is_participant_of(id));

-- ---- conversation_participants ----
drop policy if exists participants_select on conversation_participants;
create policy participants_select on conversation_participants for select
  using (is_participant_of(conversation_id));

drop policy if exists participants_insert on conversation_participants;
create policy participants_insert on conversation_participants for insert
  with check (
    user_id = auth.uid()
    or (
      is_participant_of(conversation_id)
      and exists (
        select 1 from profiles p
        where p.id = conversation_participants.user_id
          and (p.class_id = current_profile_class_id() or p.role = 'ADMIN')
      )
    )
  );

drop policy if exists participants_update on conversation_participants;
create policy participants_update on conversation_participants for update
  using (user_id = auth.uid() or is_participant_of(conversation_id));

-- ---- direct_messages ----
drop policy if exists dms_select on direct_messages;
create policy dms_select on direct_messages for select
  using (is_participant_of(conversation_id));

drop policy if exists dms_insert on direct_messages;
create policy dms_insert on direct_messages for insert
  with check (sender_id = auth.uid() and is_participant_of(conversation_id));

drop policy if exists dms_update on direct_messages;
create policy dms_update on direct_messages for update
  using (sender_id = auth.uid() and is_participant_of(conversation_id));

-- ---- message_reads ----
drop policy if exists reads_select on message_reads;
create policy reads_select on message_reads for select
  using (
    user_id = auth.uid()
    or is_participant_of((select dm.conversation_id from direct_messages dm where dm.id = message_reads.message_id))
  );

drop policy if exists reads_insert on message_reads;
create policy reads_insert on message_reads for insert
  with check (
    user_id = auth.uid()
    and is_participant_of((select dm.conversation_id from direct_messages dm where dm.id = message_reads.message_id))
  );

-- ---- assistant_chats ----
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

-- ---- assistant_messages ----
drop policy if exists assistant_msgs_select on assistant_messages;
create policy assistant_msgs_select on assistant_messages for select
  using (exists (select 1 from assistant_chats ac where ac.id = assistant_messages.chat_id and ac.user_id = auth.uid()));

drop policy if exists assistant_msgs_insert on assistant_messages;
create policy assistant_msgs_insert on assistant_messages for insert
  with check (exists (select 1 from assistant_chats ac where ac.id = assistant_messages.chat_id and ac.user_id = auth.uid()));

-- ---------------------------------------------------------
-- 9. ACTIVATION REALTIME (idempotente)
-- ---------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='notifications') then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='direct_messages') then
    alter publication supabase_realtime add table direct_messages;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='message_reads') then
    alter publication supabase_realtime add table message_reads;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='conversation_participants') then
    alter publication supabase_realtime add table conversation_participants;
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

-- =========================================================
-- FIN DE LA MIGRATION 0002
-- =========================================================
