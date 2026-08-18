-- =========================================================================
-- MIGRATION 0010 — S2 : Empêcher l'usurpation des annonces (chat_messages)
-- =========================================================================
-- Correctif de sécurité (audit S2).
--
-- PROBLÈME
--   La policy RLS `chat_insert` (schema.sql §chat_messages) vérifie seulement
--   `is_member_of(class_id) AND author_id = auth.uid()`. Un STUDENT peut donc
--   insérer directement via l'API REST un message avec `is_announcement = true`
--   (preuve live avant migration : HTTP 201 en tant que STUDENT), alors que
--   seuls DELEGATE/ADMIN doivent pouvoir publier une annonce officielle.
--   La Server Action `sendAnnouncementAction` vérifie bien le rôle côté
--   serveur, mais la protection doit exister au niveau PostgreSQL.
--
-- CORRECTION
--   Renforcer `chat_insert` avec une clause WITH CHECK : un message n'est
--   accepté comme annonce (is_announcement = true) que si l'auteur est
--   DELEGATE de la classe ou ADMIN. Toute autre insertion (message normal)
--   reste inchangée pour les membres de la classe.
--
-- IDEMPOTENCE
--   drop policy + create policy : ré-exécutable sans effet de bord. Un
--   contrôle final vérifie (via pg_policy) que le WITH CHECK de la policy
--   référence bien is_admin/is_delegate_of, et échoue bruyamment sinon.
-- =========================================================================

-- 1. Policy INSERT renforcée : une annonce exige DELEGATE de la classe ou ADMIN.
drop policy if exists chat_insert on chat_messages;
create policy chat_insert on chat_messages for insert
  with check (
    is_member_of(class_id)
    and author_id = auth.uid()
    and (
      is_announcement is not true
      or is_admin()
      or is_delegate_of(class_id)
    )
  );

-- 2. Contrôle d'application : échoue si le WITH CHECK ne restreint pas
--    is_announcement (dans ce cas la correction n'est PAS terminée).
do $$
declare
  v_expr text;
begin
  select pg_get_expr(p.polwithcheck, p.polrelid) into v_expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = 'chat_messages'
      and p.polname = 'chat_insert';

  if v_expr is null
     or position('is_admin' in v_expr) = 0
     or position('is_delegate_of' in v_expr) = 0 then
    raise exception
      'S2 NON appliqué : la policy chat_insert ne restreint pas is_announcement (WITH CHECK : %)',
      v_expr;
  end if;
end $$;

-- 3. Rappels (non exécutés ici) :
--    - UPDATE sur chat_messages : AUCUNE policy n'existe (et aucune n'est
--      ajoutée ici) → toute modification d'un message existant est refusée par
--      RLS, y compris passer un message en annonce. Ne jamais ajouter de policy
--      UPDATE sur chat_messages sans restriction équivalente sur is_announcement
--      (les policies sont combinées en OR).
--    - Re-test manuel après application (voir scripts/verify-s2.mjs) :
--        STUDENT  POST is_announcement=true  -> attendu 4xx (permission denied)
--        DELEGATE POST is_announcement=true  -> attendu 201
--        ADMIN    POST is_announcement=true  -> attendu 201
-- =========================================================================
