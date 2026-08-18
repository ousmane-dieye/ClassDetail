-- =========================================================================
-- MIGRATION 0015 — S9 : rate limiting IA distribué (Supabase partagé)
-- =========================================================================
-- Correctif d'audit (S9).
--
-- PROBLÈME
--   lib/security/rateLimit.ts utilisait un Map EN MÉMOIRE : une seule
--   instance possède ses compteurs. En déploiement serverless / scalé
--   (plusieurs instances Vercel), chaque instance a ses propres compteurs :
--   le rate limit est contournable en changeant d'instance.
--
-- SOLUTION
--   Compteurs dans une table Postgres partagée (ai_rate_limits) + fonction
--   SQL ATOMIQUE (check_ai_rate_limit) : toutes les instances partagent le
--   même état. Fenêtre fixe. Zéro service supplémentaire : Supabase est déjà
--   utilisé (aucun coût additionnel, pas de service payant ajouté).
--
--   Fonctionnement de la fonction :
--     - window_start = début de fenêtre (epoch / window_seconds) -> fenêtre
--       FIXE : toutes les instances calculent le même début.
--     - insert ... on conflict (bucket_key, window_start) do update
--       set request_count = request_count + 1 returning request_count
--       -> incrément ATOMIQUE (le verrou de ligne sérialise les instances
--          concurrentes).
--     - allowed = request_count <= p_limit ; sinon retry_after_seconds =
--       secondes restantes dans la fenêtre courante.
--     - Nettoyage probabiliste (1 %) des fenêtres de plus d'un jour
--       (borne la taille de la table).
--
--   Accès :
--     - RLS activée SANS policy sur ai_rate_limits : un client ne peut
--       JAMAIS lire ni réinitialiser ses compteurs directement.
--     - La fonction est SECURITY DEFINER (owner) : elle seule touche la table.
--     - EXECUTE retiré de PUBLIC, accordé à authenticated (l'endpoint exige
--       une session) et service_role (réservé aux scripts).
--
--   Échec d'infrastructure (fonction/table absente, réseau) : le client
--   REFUSE la requête (fail-closed, cf. lib/security/rateLimit.ts) pour
--   protéger le coût de l'API IA.
--
-- IDEMPOTENCE : create table if not exists / create or replace function /
-- drop policy if exists / revoke-grant répétables / smoke-test auto-nettoyé.
-- =========================================================================

-- 1. Table des compteurs (fenêtre fixe par bucket).
create table if not exists ai_rate_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  request_count int not null default 0,
  primary key (bucket_key, window_start)
);

-- 2. RLS sans policy : inaccessible aux clients (seule la fonction y accède).
alter table ai_rate_limits enable row level security;
drop policy if exists ai_rate_limits_all on ai_rate_limits;

-- 3. Fonction atomique : incrémente et renvoie allowed + retry_after_seconds.
create or replace function check_ai_rate_limit(
  p_bucket_key text,
  p_limit int,
  p_window_seconds int
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count int;
  v_elapsed int;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', 60);
  end if;

  -- Début de la fenêtre FIXE (même calcul pour toutes les instances).
  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  -- Incrément atomique : le verrou de ligne sérialise les instances.
  insert into ai_rate_limits (bucket_key, window_start, request_count)
  values (p_bucket_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set request_count = ai_rate_limits.request_count + 1
  returning request_count into v_count;

  -- Nettoyage probabiliste des anciennes fenêtres (borne la table).
  if random() < 0.01 then
    delete from ai_rate_limits
    where window_start < v_now - interval '1 day';
  end if;

  if v_count <= p_limit then
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  v_elapsed := greatest(0, (extract(epoch from v_now) - extract(epoch from v_window_start)))::int;
  return jsonb_build_object(
    'allowed', false,
    'retry_after_seconds', greatest(1, p_window_seconds - v_elapsed)
  );
end;
$$;

-- 4. Privilèges : réservé aux sessions authentifiées (+ service_role pour
--    les scripts de maintenance/vérification).
revoke execute on function check_ai_rate_limit(text, int, int) from public;
grant execute on function check_ai_rate_limit(text, int, int) to authenticated, service_role;

-- =========================================================================
-- Contrôles d'application : échouent bruyamment si non conforme.
-- =========================================================================

do $$
begin
  -- Table présente.
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'ai_rate_limits'
  ) then
    raise exception 'S9 NON appliqué : table ai_rate_limits absente';
  end if;

  -- RLS activée.
  if not exists (
    select 1 from pg_class c where c.oid = 'ai_rate_limits'::regclass and c.relrowsecurity
  ) then
    raise exception 'S9 NON appliqué : RLS désactivée sur ai_rate_limits';
  end if;

  -- Aucune policy : la table reste hors de portée des clients REST.
  if exists (
    select 1 from pg_policy where polrelid = 'ai_rate_limits'::regclass
  ) then
    raise exception 'S9 NON appliqué : une policy existe sur ai_rate_limits (doit rester inaccessible aux clients)';
  end if;

  -- Fonction présente (signature exacte). to_regprocedure normalise les
  -- types (int -> integer) et ignore les noms de paramètres : robuste quelle
  -- que soit la présentation interne de pg_proc.
  if to_regprocedure('public.check_ai_rate_limit(text, integer, integer)') is null then
    raise exception 'S9 NON appliqué : fonction check_ai_rate_limit absente de public';
  end if;

  -- EXECUTE accordé à authenticated, retiré de PUBLIC.
  if not has_function_privilege('authenticated', 'check_ai_rate_limit(text, integer, integer)', 'EXECUTE') then
    raise exception 'S9 NON appliqué : EXECUTE manquant pour authenticated';
  end if;
  if has_function_privilege('public', 'check_ai_rate_limit(text, integer, integer)', 'EXECUTE') then
    raise exception 'S9 NON appliqué : EXECUTE encore ouvert à PUBLIC';
  end if;
end $$;

-- 5. Smoke-test fonctionnel (auto-nettoyé) :
--    limite exacte autorisée, dépassement refusé, autre clé indépendante.
do $$
declare
  v1 jsonb;
  v2 jsonb;
  v3 jsonb;
  v_autre jsonb;
begin
  delete from ai_rate_limits where bucket_key like 's9-smoke-%';

  select check_ai_rate_limit('s9-smoke-1', 2, 60) into v1;
  select check_ai_rate_limit('s9-smoke-1', 2, 60) into v2;
  select check_ai_rate_limit('s9-smoke-1', 2, 60) into v3;

  if not (v1->>'allowed')::boolean then
    raise exception 'S9 : 1er appel devrait être autorisé';
  end if;
  if not (v2->>'allowed')::boolean then
    raise exception 'S9 : 2e appel (limite exacte = 2) devrait être autorisé';
  end if;
  if (v3->>'allowed')::boolean then
    raise exception 'S9 : 3e appel (dépassement) devrait être refusé';
  end if;
  if (v3->>'retry_after_seconds')::int <= 0 then
    raise exception 'S9 : retry_after_seconds attendu > 0 en cas de refus';
  end if;

  select check_ai_rate_limit('s9-smoke-2', 1, 3600) into v_autre;
  if not (v_autre->>'allowed')::boolean then
    raise exception 'S9 : une autre clé doit avoir son propre compteur';
  end if;

  delete from ai_rate_limits where bucket_key like 's9-smoke-%';
end $$;
-- =========================================================================
