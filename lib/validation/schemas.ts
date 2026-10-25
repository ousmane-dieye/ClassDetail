import { z } from "zod";
import { SUBJECT_COLOR_KEYS } from "@/lib/constants/subjectColors";
import { NOTIFICATION_PREFERENCE_CATEGORIES } from "@/lib/constants/notificationPreferences";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants/password";

export { PASSWORD_MIN_LENGTH };

/**
 * Champ « mot de passe » partagé (inscription + réinitialisation).
 *
 * Le message énonce la règle ET la valeur réellement saisie : l'utilisateur
 * sait immédiatement ce qui manque, au lieu d'un « 12 caractères minimum »
 * sans rapport avec ce qu'il a tapé.
 */
export const passwordField = z.string().superRefine((value, ctx) => {
  if (value.length < PASSWORD_MIN_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.too_small,
      type: "string",
      minimum: PASSWORD_MIN_LENGTH,
      inclusive: true,
      message: `Mot de passe trop court : ${PASSWORD_MIN_LENGTH} caractères minimum (vous en avez saisi ${value.length}).`,
    });
  }
});

const PASSWORDS_DO_NOT_MATCH =
  "Les deux mots de passe ne correspondent pas : saisissez exactement le même mot de passe dans les deux champs.";

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(2, "Prénom trop court").max(80),
    lastName: z.string().trim().min(2, "Nom trop court").max(80),
    email: z.string().trim().email("Adresse email invalide (ex. : etudiant@ecole.fr)").transform((v) => v.toLowerCase()),
    password: passwordField,
    confirmPassword: z.string(),
    classId: z.string().uuid("Veuillez sélectionner une classe"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: PASSWORDS_DO_NOT_MATCH,
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().trim().email("Adresse email invalide (ex. : etudiant@ecole.fr)").transform((v) => v.toLowerCase()),
  password: z.string().min(1, "Mot de passe manquant : saisissez votre mot de passe."),
});

export const resubmitSchema = z.object({
  firstName: z.string().trim().min(2, "Prénom trop court").max(80),
  lastName: z.string().trim().min(2, "Nom trop court").max(80),
  classId: z.string().uuid("Veuillez sélectionner une classe"),
});

// F3 — Mot de passe oublié.
export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Email invalide").transform((v) => v.toLowerCase()),
});

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: PASSWORDS_DO_NOT_MATCH,
    path: ["confirmPassword"],
  });

export const classSchema = z.object({
  name: z.string().trim().min(2).max(50),
  level: z.string().trim().min(2).max(100),
  academicYear: z
    .string()
    .regex(/^\d{4}-\d{4}$/, "Format attendu: 2026-2027"),
});

/**
 * Paramètres → Ma classe : demande de rejoindre (sans classe) ou de changer
 * (avec classe actuelle conservée jusqu'à l'acceptation).
 */
export const classTransferSchema = z.object({
  classId: z.string().uuid("Veuillez sélectionner une classe"),
});

/**
 * Paramètres → Mon profil : mise à jour des informations personnelles.
 * Seuls prénom et nom sont modifiables (email = Supabase Auth, rôle = ADMIN).
 */
export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(2, "Prénom trop court (2 caractères minimum)").max(80, "Prénom trop long"),
  lastName: z.string().trim().min(2, "Nom trop court (2 caractères minimum)").max(80, "Nom trop long"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Paramètres → Mon compte : changement de mot de passe depuis le dashboard
 * (session active). Utilise le même champ de mot de passe que l'inscription.
 */
export const changePasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: PASSWORDS_DO_NOT_MATCH,
    path: ["confirmPassword"],
  });

export const subjectSchema = z.object({
  classId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().max(20).optional(),
});

const driveUrlSchema = z
  .string()
  .trim()
  .url("URL invalide")
  .refine(
    (url) => /drive\.google\.com|docs\.google\.com/.test(url),
    "L'URL doit pointer vers Google Drive"
  );

export const taskSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(3000).optional(),
  type: z.enum(["EXERCISE", "TP", "ASSIGNMENT", "RESEARCH", "PROJECT", "OTHER"]),
  dueDate: z.coerce.date(),
  attachmentLink: driveUrlSchema.optional().or(z.literal("")),
});

export const documentSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  title: z.string().trim().min(2).max(150),
  description: z.string().trim().max(1000).optional(),
  driveUrl: driveUrlSchema,
});

export const hintSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  title: z.string().trim().min(2).max(150),
  year: z.string().trim().regex(/^\d{4}(-\d{4})?$/, "Année invalide"),
  type: z.enum(["DEVOIR", "EXAMEN", "CONTROLE", "TP", "PROJET", "AUTRE"]),
  driveUrl: driveUrlSchema,
});

export const recordingSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  title: z.string().trim().min(2).max(150),
  date: z.coerce.date(),
  description: z.string().trim().max(1000).optional(),
  driveUrl: driveUrlSchema,
});

export const chatMessageSchema = z.object({
  classId: z.string().uuid(),
  content: z.string().trim().min(1).max(2000),
});

// ── Module Emploi du temps ──────────────────────────────────────────

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Format de date ISO "YYYY-MM-DD" (exporté : réutilisé par l'assistant IA). */
export const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

/** Dérivé de la palette unique (`lib/constants/subjectColors.ts`) — jamais dupliqué. */
export const SUBJECT_COLOR_KEYS_ZOD = SUBJECT_COLOR_KEYS;

export const scheduleSessionSchema = z
  .object({
    classId: z.string().uuid("Classe invalide"),
    subjectId: z.string().uuid("Veuillez sélectionner une matière"),
    /** Jour ISO : 1 = lundi … 7 = dimanche. */
    dayOfWeek: z.coerce.number().int().min(1, "Jour invalide").max(7, "Jour invalide"),
    /** "HH:MM" heure locale Africa/Dakar. */
    startTime: z.string().regex(timeRegex, "Heure de début invalide (format HH:MM)"),
    endTime: z.string().regex(timeRegex, "Heure de fin invalide (format HH:MM)"),
    room: z.string().trim().max(40, "Salle trop longue").optional().or(z.literal("")),
    teacher: z.string().trim().max(80, "Nom d'enseignant trop long").optional().or(z.literal("")),
    validFrom: z.string().regex(isoDateRegex, "Date de début de validité invalide"),
    validUntil: z
      .string()
      .regex(isoDateRegex, "Date de fin de validité invalide")
      .optional()
      .or(z.literal("")),
    /** true = publier immédiatement (visible des étudiants), false = brouillon. */
    publish: z.coerce.boolean(),
  })
  .refine((d) => d.startTime < d.endTime, {
    message: "L'heure de fin doit être strictement postérieure à l'heure de début",
    path: ["endTime"],
  })
  .refine((d) => !d.validUntil || d.validUntil >= d.validFrom, {
    message: "La date de fin de validité doit être postérieure ou égale à la date de début",
    path: ["validUntil"],
  });

export type ScheduleSessionInput = z.infer<typeof scheduleSessionSchema>;

export const scheduleExceptionSchema = z
  .object({
    sessionId: z.string().uuid("Séance invalide"),
    date: z.string().regex(isoDateRegex, "Date invalide"),
    mode: z.enum(["cancel", "move", "room"], {
      errorMap: () => ({ message: "Mode d'exception invalide" }),
    }),
    startTime: z.string().regex(timeRegex, "Heure de début invalide (format HH:MM)").optional().or(z.literal("")),
    endTime: z.string().regex(timeRegex, "Heure de fin invalide (format HH:MM)").optional().or(z.literal("")),
    room: z.string().trim().max(40, "Salle trop longue").optional().or(z.literal("")),
    note: z.string().trim().max(200, "Note trop longue").optional().or(z.literal("")),
  })
  .refine((d) => d.mode !== "move" || (d.startTime !== "" && d.endTime !== ""), {
    message: "Les heures sont requises pour déplacer une séance",
    path: ["startTime"],
  })
  .refine((d) => d.mode !== "move" || (d.startTime! < d.endTime!), {
    message: "L'heure de fin doit être strictement postérieure à l'heure de début",
    path: ["endTime"],
  })
  .refine((d) => d.mode !== "room" || (d.room ?? "") !== "", {
    message: "La nouvelle salle est requise",
    path: ["room"],
  });

export type ScheduleExceptionInput = z.infer<typeof scheduleExceptionSchema>;

export const subjectColorSchema = z.object({
  subjectId: z.string().uuid("Matière invalide"),
  colorKey: z.enum(SUBJECT_COLOR_KEYS_ZOD, {
    errorMap: () => ({ message: "Couleur invalide" }),
  }),
});

// ── Module Évaluations ────────────────────────────────────────────

/** Types d'évaluation retenus (contexte de l'établissement, liste courte). */
export const EVALUATION_TYPES = ["CC", "DEVOIR_SURVEILLE", "EXAMEN", "RATTRAPAGE", "TP", "AUTRE"] as const;

/** Un chapitre : texte libre court, jamais obligatoire au niveau de l'évaluation. */
const chapterSchema = z
  .string()
  .trim()
  .min(1, "Chapitre invalide")
  .max(120, "Chapitre trop long (120 caractères max)");

export const evaluationSchema = z
  .object({
    classId: z.string().uuid("Classe invalide"),
    subjectId: z.string().uuid("Veuillez sélectionner une matière"),
    title: z.string().trim().min(3, "Intitulé trop court (3 caractères minimum)").max(150, "Intitulé trop long"),
    type: z.enum(EVALUATION_TYPES, {
      errorMap: () => ({ message: "Type d'évaluation invalide" }),
    }),
    /** Date ISO "YYYY-MM-DD" (fuseau de l'application). */
    date: z.string().regex(isoDateRegex, "Date invalide"),
    /** Heures facultatives : "" = information inconnue. */
    startTime: z.string().regex(timeRegex, "Heure de début invalide (format HH:MM)").optional().or(z.literal("")),
    endTime: z.string().regex(timeRegex, "Heure de fin invalide (format HH:MM)").optional().or(z.literal("")),
    room: z.string().trim().max(40, "Salle trop longue").optional().or(z.literal("")),
    description: z.string().trim().max(3000, "Description trop longue").optional().or(z.literal("")),
    // Chapitres TOUJOURS facultatifs : valeur par défaut tableau vide, aucun
    // raffinement n'exige leur présence. Les chaînes vides sont filtrées
    // AVANT validation (« » ou «   » ne sont jamais une erreur).
    chapters: z.preprocess(
      (value) =>
        Array.isArray(value)
          ? value.filter((c) => typeof c === "string" && c.trim().length > 0)
          : value,
      z
        .array(chapterSchema)
        .max(30, "Trop de chapitres (30 maximum)")
        .optional()
        .default([])
    ),
    /** true = publier immédiatement (visible des étudiants). */
    publish: z.coerce.boolean(),
  })
  .refine((d) => !(d.startTime && d.endTime) || d.startTime < d.endTime, {
    message: "L'heure de fin doit être strictement postérieure à l'heure de début",
    path: ["endTime"],
  })
  .refine((d) => !d.endTime || !!d.startTime, {
    message: "L'heure de début est requise si une heure de fin est indiquée",
    path: ["startTime"],
  })
  .refine((d) => d.chapters.length <= 30, {
    message: "Trop de chapitres (30 maximum)",
    path: ["chapters"],
  });

export type EvaluationInput = z.infer<typeof evaluationSchema>;

/** Association de ressources de révision (facultative) à une évaluation. */
export const evaluationResourcesSchema = z.object({
  evaluationId: z.string().uuid("Évaluation invalide"),
  documentIds: z.array(z.string().uuid("Document invalide")).max(30, "Trop de documents").optional().default([]),
  hintIds: z.array(z.string().uuid("Hint invalide")).max(30, "Trop de hints").optional().default([]),
});

export type EvaluationResourcesInput = z.infer<typeof evaluationResourcesSchema>;

export const assistantUserMessageSchema = z.object({
  chatId: z.string().uuid().nullable().optional(),
  content: z.string().trim().min(1).max(2000),
});

// ── Paramètres → Notifications ───────────────────────────────────

/**
 * Une entrée = UNE catégorie, deux canaux indépendants.
 * Les catégories sont validées contre la liste technique centralisée
 * (`lib/constants/notificationPreferences.ts`) : un identifiant inconnu,
 * un booléen absent ou un doublon sont rejetés côté serveur.
 */
export const notificationPreferenceEntrySchema = z.object({
  category: z.enum(NOTIFICATION_PREFERENCE_CATEGORIES, {
    errorMap: () => ({ message: "Catégorie de notification inconnue" }),
  }),
  inAppEnabled: z.boolean({
    errorMap: () => ({ message: "Valeur invalide pour le canal « Dans ClassPulse »" }),
  }),
  emailEnabled: z.boolean({
    errorMap: () => ({ message: "Valeur invalide pour le canal « Par e-mail »" }),
  }),
});

export const notificationPreferencesSchema = z
  .object({
    preferences: z
      .array(notificationPreferenceEntrySchema)
      .min(1, "Aucune préférence fournie")
      .max(NOTIFICATION_PREFERENCE_CATEGORIES.length, "Trop de préférences"),
  })
  .refine((data) => new Set(data.preferences.map((p) => p.category)).size === data.preferences.length, {
    message: "Une catégorie apparaît plusieurs fois",
    path: ["preferences"],
  });

export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
