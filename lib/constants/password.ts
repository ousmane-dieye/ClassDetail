/**
 * Politique de mot de passe — SOURCE UNIQUE.
 *
 * Partagée par la validation serveur (`lib/validation/schemas.ts`) ET les
 * formulaires (attribut `minLength` + texte d'aide). Supabase Auth applique
 * elle-même un minimum de 6 caractères : si les trois divergent, le serveur
 * rejette ce que le navigateur a accepté, et l'utilisateur ne comprend pas
 * quel message croire.
 */
export const PASSWORD_MIN_LENGTH = 6;
