-- =========================================================================
-- MIGRATION 0014 — S8 : droits du délégué alignés (documents / hints)
-- =========================================================================
-- Correctif de cohérence (audit S8).
--
-- PROBLÈME
--   L'audit a relevé qu'un DELEGATE peut supprimer via l'API REST un
--   document/hint créé par un autre étudiant, alors que l'UI ne montrait le
--   bouton de suppression qu'à l'auteur. Incohérence UI / Server Actions /
--   RLS.
--
-- RÈGLE MÉTIER EXPLICITE (retenue, cohérente avec le projet)
--   - STUDENT  : gère ses PROPRES contenus (auteur uniquement).
--   - DELEGATE : gère les contenus de SA CLASSE (is_delegate_of(class_id)).
--   - ADMIN    : contrôle global (is_admin()).
--   La fonction lib/business/permissions.ts `canDeleteResource` porte déjà
--   cette règle côté applicatif.
--
-- CORRECTION (alignement)
--   1. RLS : les policies documents_delete / hints_delete portent déjà la
--      règle (`author_id = auth.uid() OR is_admin() OR is_delegate_of(class_id)`).
--      On les ré-affirme explicitement ici (drop + create) et on ajoute des
--      contrôles qui échouent bruyamment si la règle s'écarte.
--   2. Server Actions : autorisation explicite via canDeleteResource + erreurs
--      explicites (fichiers actions/documents.ts, actions/hints.ts).
--   3. UI : bouton de suppression conditionné par canDeleteResource
--      (app/dashboard/documents/page.tsx, app/dashboard/hints/page.tsx).
--
-- IDEMPOTENCE
--   drop policy + create policy : ré-exécutable sans effet de bord. Contrôles
--   finaux via pg_get_expr (USING des policies DELETE).
-- =========================================================================

-- 1. Ré-affirmation des policies DELETE (règle : auteur / délégué de classe /
--    admin — aucun autre rôle).
drop policy if exists documents_delete on documents;
create policy documents_delete on documents for delete
  using (
    author_id = auth.uid()
    or is_admin()
    or is_delegate_of(class_id)
  );

drop policy if exists hints_delete on hints;
create policy hints_delete on hints for delete
  using (
    author_id = auth.uid()
    or is_admin()
    or is_delegate_of(class_id)
  );

-- 2. Contrôles d'application : échouent bruyamment si la règle s'écarte.

do $$
declare
  v_expr_documents text;
  v_expr_hints text;
begin
  select pg_get_expr(p.polqual, p.polrelid) into v_expr_documents
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = 'documents'
      and p.polname = 'documents_delete'
      and p.polcmd = 'd';

  select pg_get_expr(p.polqual, p.polrelid) into v_expr_hints
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = 'hints'
      and p.polname = 'hints_delete'
      and p.polcmd = 'd';

  if v_expr_documents is null
     or position('is_admin' in v_expr_documents) = 0
     or position('is_delegate_of' in v_expr_documents) = 0
     or position('author_id = auth.uid()' in v_expr_documents) = 0 then
    raise exception 'S8 NON appliqué : policy documents_delete hors règle (USING : %)', v_expr_documents;
  end if;

  if v_expr_hints is null
     or position('is_admin' in v_expr_hints) = 0
     or position('is_delegate_of' in v_expr_hints) = 0
     or position('author_id = auth.uid()' in v_expr_hints) = 0 then
    raise exception 'S8 NON appliqué : policy hints_delete hors règle (USING : %)', v_expr_hints;
  end if;
end $$;

-- 3. Rappels (non exécutés ici) :
--    - Re-test manuel après application (voir scripts/verify-s8.mjs) :
--        STUDENT  DELETE document/hint d'un AUTRE étudiant -> 0 ligne / 4xx
--        STUDENT  DELETE son propre contenu               -> 204
--        DELEGATE DELETE contenu d'un étudiant de SA classe -> 204
--        DELEGATE DELETE contenu d'une AUTRE classe        -> 0 ligne / 4xx
--        ADMIN    DELETE n'importe quel contenu            -> 204
--        PENDING  DELETE n'importe quel contenu            -> 0 ligne / 4xx
--    - Aucune policy UPDATE/INSERT nouvelle : documents/hints restent en
--      création par l'auteur (is_member_of + author_id = auth.uid()).
-- =========================================================================
