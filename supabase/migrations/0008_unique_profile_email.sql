-- =========================================================
-- MIGRATION 0008 — Unicité de l'email insensible à la casse
-- =========================================================
-- À exécuter UNE SEULE fois dans le SQL Editor de Supabase.
--
-- Problème : la contrainte `profiles.email UNIQUE` est sensible à la casse,
-- donc `Admin@x.com` et `admin@x.com` coexistaient. Supabase Auth, lui,
-- normalise les emails en minuscules.
--
-- 1) On supprime les doublons (on garde le profil le plus ancien par email).
-- 2) On ajoute un index unique sur lower(email).
-- =========================================================

-- ---- 1. Dédoublonnage ----
-- Supprime les profils en double : pour chaque email (normalisé en minuscules),
-- on garde le profil le plus ancien (created_at puis id en départage).
delete from profiles p
using profiles p2
where lower(p2.email) = lower(p.email)
  and (
    p2.created_at < p.created_at
    or (p2.created_at = p.created_at and p2.id < p.id)
  );

-- ---- 2. Index unique insensible à la casse ----
create unique index if not exists uq_profiles_email_lower
  on profiles (lower(email));
