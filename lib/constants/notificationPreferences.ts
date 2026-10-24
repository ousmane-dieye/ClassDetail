/**
 * PRÉFÉRENCES DE NOTIFICATIONS — définitions PARTAGÉES (client et serveur) :
 * identifiants, valeurs par défaut, libellés et mapping type → catégorie.
 *
 * Module pur, sans aucune dépendance serveur : importable depuis l'interface
 * (Paramètres → Notifications), Zod et les Server Actions.
 *
 * RÈGLES
 *   - Les identifiants persistés sont stables et techniques : les libellés
 *     français ne sont JAMAIS utilisés comme clé.
 *   - Une préférence ABSENTE en base = valeur par défaut (les comptes créés
 *     avant la migration ne perdent rien).
 *   - Une préférence enregistrée est toujours respectée ; seule l'action
 *     « Rétablir les paramètres par défaut » revient aux valeurs par défaut.
 *   - Les emails d'authentification / de sécurité ne dépendent d'aucune
 *     catégorie (voir lib/email/notifications.ts).
 */

import type { NotificationType } from "@/types/database.types";

/** Identifiants techniques persistés dans `notification_preferences.category`. */
export const NOTIFICATION_PREFERENCE_CATEGORIES = [
  "ASSIGNMENTS",
  "ASSIGNMENT_REMINDERS",
  "EVALUATIONS",
  "SCHEDULE",
  "ANNOUNCEMENTS",
  "RESOURCES",
  "CHAT",
] as const;

export type PreferenceCategory = (typeof NOTIFICATION_PREFERENCE_CATEGORIES)[number];

/** Un identifiant inconnu ne doit jamais atteindre la base. */
export function isPreferenceCategory(value: unknown): value is PreferenceCategory {
  return (
    typeof value === "string" &&
    (NOTIFICATION_PREFERENCE_CATEGORIES as readonly string[]).includes(value)
  );
}

export interface Channels {
  inApp: boolean;
  email: boolean;
}

/**
 * VALEURS PAR DÉFAUT — comportement de ClassPulse avant la fonctionnalité :
 *   - canaux internes : TOUJOURS actifs (aucune notification actuelle perdue) ;
 *   - e-mail des rappels de devoirs (J-3 / J-1) : actif (emails déjà envoyés) ;
 *   - e-mail des évaluations : actif (nouveau canal, voir §D du rapport) ;
 *   - e-mail des autres catégories : inactifs (aucun email existant — opt-in).
 */
export const DEFAULT_CHANNELS: Record<PreferenceCategory, Channels> = {
  ASSIGNMENTS: { inApp: true, email: false },
  ASSIGNMENT_REMINDERS: { inApp: true, email: true },
  EVALUATIONS: { inApp: true, email: true },
  SCHEDULE: { inApp: true, email: false },
  ANNOUNCEMENTS: { inApp: true, email: false },
  RESOURCES: { inApp: true, email: false },
  CHAT: { inApp: true, email: false },
};

export interface CategoryMeta {
  /** Libellé français affiché (jamais utilisé comme identifiant persisté). */
  label: string;
  description: string;
  /** Aide sous l'interrupteur « Dans ClassPulse ». */
  inAppHint: string;
  /** Aide sous l'interrupteur « Par e-mail ». */
  emailHint: string;
  /** Information complémentaire affichée dans la carte (optionnel). */
  note?: string;
}

/** Libellés et descriptions affichés dans « Paramètres → Notifications ». */
export const CATEGORY_META: Record<PreferenceCategory, CategoryMeta> = {
  ASSIGNMENTS: {
    label: "Devoirs",
    description: "Nouveaux devoirs publiés et modifications d'un devoir existant.",
    inAppHint: "Notification dans la cloche et le centre de notifications.",
    emailHint: "Email pour un devoir publié ou modifié par un délégué.",
  },
  ASSIGNMENT_REMINDERS: {
    label: "Rappels de devoirs",
    description: "Rappel 3 jours avant, puis la veille de la date limite, pour vos devoirs non rendus.",
    inAppHint: "Notification le jour du rappel (J-3 puis J-1).",
    emailHint: "Email « Rappel : devoir à rendre dans 3 jours » puis « Dernier rappel ».",
  },
  EVALUATIONS: {
    label: "Évaluations",
    description: "Évaluation publiée, modifiée, reportée ou annulée.",
    inAppHint: "Notification pour chaque événement concernant la classe.",
    emailHint: "Email pour chaque évaluation publiée, modifiée ou annulée.",
  },
  SCHEDULE: {
    label: "Emploi du temps",
    description: "Publication d'une séance, modification, annulation ou déplacement de cours.",
    inAppHint: "Notification de publication, de modification et d'annulation.",
    emailHint: "Email pour les séances publiées, modifiées ou annulées.",
  },
  ANNOUNCEMENTS: {
    label: "Annonces et communications",
    description: "Annonces épinglées publiées par un délégué ou un administrateur.",
    inAppHint: "Notification dès la publication de l'annonce.",
    emailHint: "Email reprenant le texte de l'annonce.",
  },
  RESOURCES: {
    label: "Ressources pédagogiques",
    description: "Nouveaux documents, hints (anciens sujets) et cours enregistrés.",
    inAppHint: "Notification à chaque ajout de ressource.",
    emailHint: "Email à chaque ajout de ressource dans votre classe.",
  },
  CHAT: {
    label: "Chat et messages",
    description: "Messages et communications du chat de classe.",
    inAppHint: "Notification liée aux messages du chat.",
    emailHint: "Email lié aux messages du chat.",
    note: "Les messages individuels du chat ne déclenchent pas encore de notification : ce réglage leur sera appliqué automatiquement dès que le canal sera disponible.",
  },
};

/**
 * Catégorie de préférence de CHAQUE type de notification.
 * `null` = événement système (inscription, rôle) : TOUJOURS notifié en
 * interne, jamais contrôlé par les préférences ordinaires.
 */
const TYPE_PREFERENCE_CATEGORY: Record<NotificationType, PreferenceCategory | null> = {
  ASSIGNMENT_CREATED: "ASSIGNMENTS",
  ASSIGNMENT_UPDATED: "ASSIGNMENTS",
  TASK_CREATED: "ASSIGNMENTS",
  TASK_COMPLETED: "ASSIGNMENTS",
  TASK_REMINDER: "ASSIGNMENT_REMINDERS",
  EVALUATION_PUBLISHED: "EVALUATIONS",
  EVALUATION_UPDATED: "EVALUATIONS",
  EVALUATION_CANCELLED: "EVALUATIONS",
  SCHEDULE_PUBLISHED: "SCHEDULE",
  SCHEDULE_UPDATED: "SCHEDULE",
  SESSION_CANCELLED: "SCHEDULE",
  ANNOUNCEMENT_CREATED: "ANNOUNCEMENTS",
  DOCUMENT_ADDED: "RESOURCES",
  HINT_ADDED: "RESOURCES",
  RECORDING_ADDED: "RESOURCES",
  COURSE_SAVED: "RESOURCES",
  COURSE_UPDATED: "RESOURCES",
  REGISTRATION_ACCEPTED: null,
  REGISTRATION_REJECTED: null,
  DELEGATE_APPOINTED: null,
  DELEGATE_REMOVED: null,
};

/** Catégorie de préférence applicable à un type (null = événement système). */
export function preferenceCategoryOf(type: NotificationType): PreferenceCategory | null {
  return TYPE_PREFERENCE_CATEGORY[type] ?? null;
}

/**
 * Types d'événements pour lesquels un CANAL E-MAIL existe réellement.
 * Les types absents (ex. « tâche terminée » par un camarade) restent en
 * interne uniquement : aucun réglage ne peut les transformer en email.
 */
const EMAIL_CAPABLE_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "ASSIGNMENT_CREATED",
  "ASSIGNMENT_UPDATED",
  "EVALUATION_PUBLISHED",
  "EVALUATION_UPDATED",
  "EVALUATION_CANCELLED",
  "SCHEDULE_PUBLISHED",
  "SCHEDULE_UPDATED",
  "SESSION_CANCELLED",
  "ANNOUNCEMENT_CREATED",
  "DOCUMENT_ADDED",
  "HINT_ADDED",
  "RECORDING_ADDED",
]);

/** True si un email peut réellement être envoyé pour ce type d'événement. */
export function isEmailCapableType(type: NotificationType): boolean {
  return EMAIL_CAPABLE_TYPES.has(type);
}

interface PreferenceRowLike {
  in_app_enabled?: boolean | null;
  email_enabled?: boolean | null;
}

/** Calcule les canaux effectifs : défaut de la catégorie si aucune ligne. */
export function resolveChannels(
  category: PreferenceCategory,
  row?: PreferenceRowLike | null
): Channels {
  const fallback = DEFAULT_CHANNELS[category];
  if (!row) return { inApp: fallback.inApp, email: fallback.email };
  return {
    // null/undefined = colonne illisible → défaut (jamais de coupure sauvage).
    inApp: row.in_app_enabled ?? fallback.inApp,
    email: row.email_enabled ?? fallback.email,
  };
}
