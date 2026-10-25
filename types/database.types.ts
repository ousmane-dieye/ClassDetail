// Types TypeScript reflétant supabase/schema.sql
// Génération réelle recommandée en prod : `supabase gen types typescript`

export type UserRole = "STUDENT" | "DELEGATE" | "ADMIN";
export type RegistrationStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
export type TaskType = "EXERCISE" | "TP" | "ASSIGNMENT" | "RESEARCH" | "PROJECT" | "OTHER";
export type HintType = "DEVOIR" | "EXAMEN" | "CONTROLE" | "TP" | "PROJET" | "AUTRE";
export type ReminderKind = "J3" | "J1";
export type NotificationType =
  | "TASK_REMINDER"
  | "REGISTRATION_ACCEPTED"
  | "REGISTRATION_REJECTED"
  | "TASK_CREATED"
  | "DOCUMENT_ADDED"
  | "HINT_ADDED"
  | "RECORDING_ADDED"
  | "DELEGATE_APPOINTED"
  | "DELEGATE_REMOVED"
  | "ASSIGNMENT_CREATED"
  | "ASSIGNMENT_UPDATED"
  | "COURSE_SAVED"
  | "ANNOUNCEMENT_CREATED"
  | "COURSE_UPDATED"
  | "TASK_COMPLETED"
  | "SCHEDULE_PUBLISHED"
  | "SCHEDULE_UPDATED"
  | "SESSION_CANCELLED"
  | "EVALUATION_PUBLISHED"
  | "EVALUATION_UPDATED"
  | "EVALUATION_CANCELLED";

export type NotificationCategory =
  | "tasks"
  | "assignments"
  | "courses"
  | "documents"
  | "hints"
  | "system"
  | "announcements"
  | "schedule"
  | "evaluations";

/** Type d'une évaluation (module Évaluations). */
export type EvaluationType = "CC" | "DEVOIR_SURVEILLE" | "EXAMEN" | "RATTRAPAGE" | "TP" | "AUTRE";
/** Cycle de vie : brouillon → publiée → (éventuellement) annulée. */
export type EvaluationStatus = "DRAFT" | "PUBLISHED" | "CANCELLED";

/**
 * Catégories de préférences de notifications (table `notification_preferences`).
 * Identifiants techniques stables — les libellés français affichés dans
 * l'interface vivent dans `lib/notifications/preferences.ts` (CATEGORY_META).
 */
export type NotificationPreferenceCategory =
  | "ASSIGNMENTS"
  | "ASSIGNMENT_REMINDERS"
  | "EVALUATIONS"
  | "SCHEDULE"
  | "ANNOUNCEMENTS"
  | "RESOURCES"
  | "CHAT";

/**
 * Types d'email enregistrés dans `assignment_email_notifications` :
 *   - 3 types historiques (authentification + rappels J-3/J-1) ;
 *   - les types d'événements pédagogiques envoyés par catégorie.
 */
export type EmailNotificationType = NotificationType | "AUTHENTICATION_APPROVED" | "ASSIGNMENT_3_DAYS" | "ASSIGNMENT_1_DAY";
export type EmailNotificationStatus = "PENDING" | "SENT" | "FAILED";

export type NotificationPreferenceRow = {
  id: string;
  user_id: string;
  category: NotificationPreferenceCategory;
  in_app_enabled: boolean;
  email_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type ClassRow = {
  id: string;
  name: string;
  level: string;
  academic_year: string;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  class_id: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SubjectRow = {
  id: string;
  class_id: string;
  name: string;
  code: string | null;
  color_key: string;
  created_at: string;
};

/** Clés de la palette contrôlée de couleurs de matières (lib/constants/subjectColors.ts). */
export type SubjectColorKey =
  | "blue"
  | "indigo"
  | "violet"
  | "emerald"
  | "teal"
  | "amber"
  | "rose"
  | "red"
  | "cyan"
  | "orange"
  | "purple"
  | "yellow"
  | "fuchsia"
  | "sky"
  | "lime"
  | "pink"
  | "green"
  | "slate"
  | "stone"
  | "gray";

export type ScheduleSessionStatus = "DRAFT" | "PUBLISHED";

export type ScheduleSessionRow = {
  id: string;
  class_id: string;
  subject_id: string;
  /** Jour ISO : 1 = lundi … 7 = dimanche. */
  day_of_week: number;
  /** Heure locale Africa/Dakar, format "HH:MM:SS". */
  start_time: string;
  end_time: string;
  room: string | null;
  teacher: string | null;
  /** Date ISO "YYYY-MM-DD" (validité de la règle récurrente). */
  valid_from: string;
  valid_until: string | null;
  status: ScheduleSessionStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleExceptionRow = {
  id: string;
  session_id: string;
  class_id: string;
  /** Date ISO "YYYY-MM-DD" de l'occurrence concernée. */
  date: string;
  is_cancelled: boolean;
  new_start_time: string | null;
  new_end_time: string | null;
  new_room: string | null;
  new_subject_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EvaluationRow = {
  id: string;
  class_id: string;
  subject_id: string;
  title: string;
  type: EvaluationType;
  description: string | null;
  /** Date ISO "YYYY-MM-DD" (fuseau de l'application). */
  date: string;
  /** Heure locale "HH:MM:SS" — null si inconnue. */
  start_time: string | null;
  end_time: string | null;
  room: string | null;
  /** Chapitres concernés — toujours facultatifs (tableau vide = inconnu). */
  chapters: string[];
  status: EvaluationStatus;
  /** Ancienne date si l'évaluation publiée a été reportée. */
  rescheduled_from: string | null;
  cancellation_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EvaluationDocumentRow = {
  evaluation_id: string;
  class_id: string;
  document_id: string;
  created_at: string;
};

export type EvaluationHintRow = {
  evaluation_id: string;
  class_id: string;
  hint_id: string;
  created_at: string;
};

export type RegistrationRequestRow = {
  id: string;
  user_id: string;
  class_id: string;
  /** Classe de l'utilisateur au moment de la demande (NULL = « rejoindre »). */
  previous_class_id: string | null;
  status: RegistrationStatus;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

export type ClassMemberRow = {
  id: string;
  class_id: string;
  user_id: string;
  joined_at: string;
  /** NULL = appartenance active ; renseigné = départ ou transfert (0019). */
  left_at: string | null;
};

export type TaskRow = {
  id: string;
  class_id: string;
  subject_id: string;
  creator_id: string;
  title: string;
  description: string | null;
  type: TaskType;
  due_date: string;
  attachment_link: string | null;
  is_expired: boolean;
  created_at: string;
  updated_at: string;
};

export type TaskCompletionRow = {
  id: string;
  task_id: string;
  student_id: string;
  completed_at: string;
};

export type TaskReminderSentRow = {
  id: string;
  task_id: string;
  student_id: string;
  kind: ReminderKind;
  sent_at: string;
};

export type DocumentRow = {
  id: string;
  class_id: string;
  subject_id: string;
  title: string;
  description: string | null;
  drive_url: string;
  author_id: string;
  created_at: string;
};

export type HintRow = {
  id: string;
  class_id: string;
  subject_id: string;
  title: string;
  year: string;
  type: HintType;
  drive_url: string;
  author_id: string;
  created_at: string;
};

export type RecordingRow = {
  id: string;
  class_id: string;
  subject_id: string;
  title: string;
  date: string;
  description: string | null;
  drive_url: string;
  creator_id: string;
  created_at: string;
};

export type ChatMessageRow = {
  id: string;
  class_id: string;
  author_id: string;
  content: string;
  is_announcement: boolean;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  recipient_id: string;
  type: NotificationType;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
  entity_type: string | null;
  entity_id: string | null;
  link: string | null;
  category: NotificationCategory;
};

export type AssistantChatRow = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type AssistantMessageRow = {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  actions: unknown;
  created_at: string;
};

export type AssistantAction = { label: string; href: string };

export type AiRateLimitResult = {
  allowed: boolean;
  /** Secondes restantes avant la prochaine fenêtre (si refusé). */
  retry_after_seconds: number;
};

/**
 * Résultat des fonctions de transition d'appartenance (migration 0019).
 * `code` est un identifiant technique stable : les messages français
 * destinés à l'utilisateur vivent dans les Server Actions.
 */
export type MembershipTransitionResult = {
  status: "ok" | "error";
  code?: string;
  /** "JOIN" = demande de rejoindre, "CHANGE" = demande de changement. */
  request_kind?: "JOIN" | "CHANGE";
};

export type EmailNotificationRow = {
  id: string;
  assignment_id: string | null;
  user_id: string;
  email: string;
  notification_type: EmailNotificationType;
  status: EmailNotificationStatus;
  sent_at: string | null;
  error_message: string | null;
  /** Entité polymorphe (evaluation, schedule_session, chat…) — anti-doublon. */
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};

// Schéma générique utilisé par le client Supabase typé
export interface Database {
  public: {
    Tables: {
      classes: {
        Row: ClassRow;
        Insert: Partial<ClassRow>;
        Update: Partial<ClassRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      subjects: {
        Row: SubjectRow;
        Insert: Partial<SubjectRow>;
        Update: Partial<SubjectRow>;
        Relationships: [];
      };
      registration_requests: {
        Row: RegistrationRequestRow;
        Insert: Partial<RegistrationRequestRow>;
        Update: Partial<RegistrationRequestRow>;
        Relationships: [
          {
            foreignKeyName: "registration_requests_user_id_fkey",
            columns: ["user_id"],
            referencedRelation: "profiles",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "registration_requests_class_id_fkey",
            columns: ["class_id"],
            referencedRelation: "classes",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "registration_requests_previous_class_id_fkey",
            columns: ["previous_class_id"],
            referencedRelation: "classes",
            referencedColumns: ["id"],
          },
        ];
      };
      class_members: {
        Row: ClassMemberRow;
        Insert: Partial<ClassMemberRow>;
        Update: Partial<ClassMemberRow>;
        Relationships: [];
      };
      tasks: {
        Row: TaskRow;
        Insert: Partial<TaskRow>;
        Update: Partial<TaskRow>;
        Relationships: [];
      };
      task_completions: {
        Row: TaskCompletionRow;
        Insert: Partial<TaskCompletionRow>;
        Update: Partial<TaskCompletionRow>;
        Relationships: [
          {
            foreignKeyName: "task_completions_task_id_fkey",
            columns: ["task_id"],
            referencedRelation: "tasks",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "task_completions_student_id_fkey",
            columns: ["student_id"],
            referencedRelation: "profiles",
            referencedColumns: ["id"],
          },
        ];
      };
      task_reminders_sent: {
        Row: TaskReminderSentRow;
        Insert: Partial<TaskReminderSentRow>;
        Update: Partial<TaskReminderSentRow>;
        Relationships: [
          {
            foreignKeyName: "task_reminders_sent_task_id_fkey",
            columns: ["task_id"],
            referencedRelation: "tasks",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "task_reminders_sent_student_id_fkey",
            columns: ["student_id"],
            referencedRelation: "profiles",
            referencedColumns: ["id"],
          },
        ];
      };
      documents: {
        Row: DocumentRow;
        Insert: Partial<DocumentRow>;
        Update: Partial<DocumentRow>;
        Relationships: [];
      };
      hints: {
        Row: HintRow;
        Insert: Partial<HintRow>;
        Update: Partial<HintRow>;
        Relationships: [];
      };
      recordings: {
        Row: RecordingRow;
        Insert: Partial<RecordingRow>;
        Update: Partial<RecordingRow>;
        Relationships: [];
      };
      chat_messages: {
        Row: ChatMessageRow;
        Insert: Partial<ChatMessageRow>;
        Update: Partial<ChatMessageRow>;
        Relationships: [
          {
            foreignKeyName: "chat_messages_author_id_fkey",
            columns: ["author_id"],
            referencedRelation: "profiles",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "chat_messages_class_id_fkey",
            columns: ["class_id"],
            referencedRelation: "classes",
            referencedColumns: ["id"],
          },
        ];
      };
      notifications: {
        Row: NotificationRow;
        Insert: Partial<NotificationRow>;
        Update: Partial<NotificationRow>;
        Relationships: [];
      };
      notification_preferences: {
        Row: NotificationPreferenceRow;
        Insert: Partial<NotificationPreferenceRow>;
        Update: Partial<NotificationPreferenceRow>;
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      assistant_chats: {
        Row: AssistantChatRow;
        Insert: Partial<AssistantChatRow>;
        Update: Partial<AssistantChatRow>;
        Relationships: [];
      };
      assistant_messages: {
        Row: AssistantMessageRow;
        Insert: Partial<AssistantMessageRow>;
        Update: Partial<AssistantMessageRow>;
        Relationships: [];
      };
      assignment_email_notifications: {
        Row: EmailNotificationRow;
        Insert: Partial<EmailNotificationRow>;
        Update: Partial<EmailNotificationRow>;
        Relationships: [
          {
            foreignKeyName: "assignment_email_notifications_assignment_id_fkey",
            columns: ["assignment_id"],
            referencedRelation: "tasks",
            referencedColumns: ["id"],
          },
          {
            foreignKeyName: "assignment_email_notifications_user_id_fkey",
            columns: ["user_id"],
            referencedRelation: "profiles",
            referencedColumns: ["id"],
          },
        ];
      };
      schedule_sessions: {
        Row: ScheduleSessionRow;
        Insert: Partial<ScheduleSessionRow>;
        Update: Partial<ScheduleSessionRow>;
        Relationships: [];
      };
      schedule_session_exceptions: {
        Row: ScheduleExceptionRow;
        Insert: Partial<ScheduleExceptionRow>;
        Update: Partial<ScheduleExceptionRow>;
        Relationships: [];
      };
      evaluations: {
        Row: EvaluationRow;
        Insert: Partial<EvaluationRow>;
        Update: Partial<EvaluationRow>;
        Relationships: [];
      };
      evaluation_documents: {
        Row: EvaluationDocumentRow;
        Insert: Partial<EvaluationDocumentRow>;
        Update: Partial<EvaluationDocumentRow>;
        Relationships: [];
      };
      evaluation_hints: {
        Row: EvaluationHintRow;
        Insert: Partial<EvaluationHintRow>;
        Update: Partial<EvaluationHintRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      check_ai_rate_limit: {
        Args: {
          p_bucket_key: string;
          p_limit: number;
          p_window_seconds: number;
        };
        Returns: AiRateLimitResult;
      };
      /** Quitter sa classe (migration 0019) — réservé au service role. */
      classpulse_leave_class: {
        Args: { p_user_id: string };
        Returns: MembershipTransitionResult;
      };
      /** Demande de rejoindre / changer de classe — réservé au service role. */
      classpulse_request_class_change: {
        Args: { p_user_id: string; p_target_class_id: string };
        Returns: MembershipTransitionResult;
      };
      /** Annulation d'une demande par son auteur — réservé au service role. */
      classpulse_cancel_request: {
        Args: { p_user_id: string; p_request_id: string };
        Returns: MembershipTransitionResult;
      };
      /** Décision (acceptation / refus) atomique — réservé au service role. */
      classpulse_decide_request: {
        Args: { p_request_id: string; p_decider_id: string; p_decision: RegistrationStatus };
        Returns: MembershipTransitionResult;
      };
    };
  };
}
