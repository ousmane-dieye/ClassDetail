import { z } from "zod";

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(2, "Prénom trop court").max(80),
    lastName: z.string().trim().min(2, "Nom trop court").max(80),
    email: z.string().trim().email("Email invalide").transform((v) => v.toLowerCase()),
    password: z.string().min(8, "8 caractères minimum"),
    confirmPassword: z.string(),
    classId: z.string().uuid("Veuillez sélectionner une classe"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().trim().email("Email invalide").transform((v) => v.toLowerCase()),
  password: z.string().min(1, "Mot de passe requis"),
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
    password: z.string().min(8, "8 caractères minimum"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

export const classSchema = z.object({
  name: z.string().trim().min(2).max(50),
  level: z.string().trim().min(2).max(100),
  academicYear: z
    .string()
    .regex(/^\d{4}-\d{4}$/, "Format attendu: 2026-2027"),
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

export const assistantUserMessageSchema = z.object({
  chatId: z.string().uuid().nullable().optional(),
  content: z.string().trim().min(1).max(2000),
});
