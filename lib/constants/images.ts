/**
 * Catalogue centralisé des images ClassPulse.
 *
 * LICENCE : Toutes les photos proviennent de la licence Unsplash
 * (https://unsplash.com/license) : usage gratuit, commercial autorisé,
 * aucune attribution requise. Chaque URL a été vérifiée (HTTP 200).
 *
 * Pour remplacer une image : changez uniquement le "photo-xxxx" dans l'URL.
 * Les tailles sont servies par le CDN Unsplash (paramètres ?w= & ?q=)
 * avec auto=format pour WebP/AVIF et fit=crop pour un cadrage net.
 */

export const CS_IMAGES = {
  // ── Pages d'authentification ──
  // Étudiant travaillant sur du code, éclairage chaleureux
  loginBanner:
    "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=1400&q=75",
  // Groupe d'étudiants collaborant autour d'un laptop
  registerBanner:
    "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1400&q=75",

  // ── Héros (landing & dashboard) ──
  // Espace de travail de développeur (laptop + code)
  dashboardHero:
    "https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=1400&q=75",
  // Enseignant accompagnant des étudiants devant un ordinateur
  heroLanding:
    "https://images.unsplash.com/photo-1580894894513-541e068a3e2b?auto=format&fit=crop&w=1600&q=75",
  // Étudiants réunis autour d'un poste — collaboration
  teamwork:
    "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=75",
  // Main qui écrit du code sur fond sombre
  coding:
    "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=75",

  // ── Couvertures par sujet ──
  subjects: {
    programming:
      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&q=70",
    networks:
      "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=70",
    databases:
      "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=70",
    security:
      "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=70",
    systems:
      "https://images.unsplash.com/photo-1629654297299-c8506221ca97?auto=format&fit=crop&w=800&q=70",
    telecom:
      "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=800&q=70",
    ai: "https://images.unsplash.com/photo-1550439062-609e1531270e?auto=format&fit=crop&w=800&q=70",
    default:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=70",
  },

  // ── Contextes thématiques ──
  contexts: {
    lecture: "https://images.unsplash.com/photo-1501504905252-473c47e087f8?auto=format&fit=crop&w=1200&q=75",
    notes: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=75",
    books: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1200&q=75",
    ai: "https://images.unsplash.com/photo-1587440871875-191322ee64b0?auto=format&fit=crop&w=1200&q=75",
  },

  // Avatar d'illustration de l'assistant IA
  aiAvatar:
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=240&q=70",

  // ── Empty states (photos discrètes) ──
  emptyTasks:
    "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&w=640&q=60",
  emptyDocs:
    "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=640&q=60",
  emptyMessages:
    "https://images.unsplash.com/photo-1577563908411-5077b6dc7624?auto=format&fit=crop&w=640&q=60",
  emptyCourses:
    "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=640&q=60",
  emptyNotifications:
    "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=640&q=60",
};

/**
 * Configuration éditoriale du site (accroches, marque).
 * Centralisée pour pouvoir ajuster l'identité sans toucher aux pages.
 */
export const SITE = {
  name: "ClassPulse",
  tagline: "Apprendre. Construire. Partager.",
  description:
    "La plateforme académique des classes d'informatique : devoirs, documents, Hints, cours enregistrés, emploi du temps, évaluations, chat de classe et assistant IA.",
  quotes: {
    hero: "Le savoir devient puissant lorsqu'il est partagé.",
    auth: "Construisez votre avenir avec le savoir.",
    dashboard: "Apprenez aujourd'hui. Construisez demain.",
  },
} as const;
