import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  readErrors: {} as Record<string, string>,
  rows: [] as Array<Record<string, any>>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      const query: any = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          conditions.push((row: any) => row[column] === value);
          return query;
        },
        in: (column: string, values: unknown[]) => {
          conditions.push((row: any) => values.includes(row[column]));
          return query;
        },
        then: (resolve: any, reject?: any) => {
          const readError = h.readErrors[table];
          if (readError) {
            return Promise.resolve({ data: null, error: { message: readError } }).then(resolve, reject);
          }
          return Promise.resolve({
            data: h.rows.filter((row) => conditions.every((c) => c(row))),
            error: null,
          }).then(resolve, reject);
        },
      };
      const conditions: Array<(row: any) => boolean> = [];
      return query;
    },
  })),
}));

import {
  DEFAULT_CHANNELS,
  CATEGORY_META,
  NOTIFICATION_PREFERENCE_CATEGORIES,
  isPreferenceCategory,
  isEmailCapableType,
  preferenceCategoryOf,
  resolveChannels,
} from "@/lib/constants/notificationPreferences";
import { loadChannels } from "@/lib/notifications/preferences";
import { notificationPreferencesSchema } from "@/lib/validation/schemas";

beforeEach(() => {
  h.readErrors = {};
  h.rows = [];
});

describe("Valeurs par défaut et couverture des catégories", () => {
  it("définit exactement les 7 catégories attendues", () => {
    expect([...NOTIFICATION_PREFERENCE_CATEGORIES]).toEqual([
      "ASSIGNMENTS",
      "ASSIGNMENT_REMINDERS",
      "EVALUATIONS",
      "SCHEDULE",
      "ANNOUNCEMENTS",
      "RESOURCES",
      "CHAT",
    ]);
    expect(Object.keys(DEFAULT_CHANNELS).sort()).toEqual(
      [...NOTIFICATION_PREFERENCE_CATEGORIES].sort()
    );
  });

  it("préserve le comportement actuel : interne toujours actif par défaut", () => {
    for (const category of NOTIFICATION_PREFERENCE_CATEGORIES) {
      expect(DEFAULT_CHANNELS[category].inApp).toBe(true);
    }
  });

  it("active par défaut uniquement les canaux e-mail déjà existants / prévus", () => {
    const emailOn = NOTIFICATION_PREFERENCE_CATEGORIES.filter(
      (category) => DEFAULT_CHANNELS[category].email
    );
    expect(emailOn.sort()).toEqual(["ASSIGNMENT_REMINDERS", "EVALUATIONS"]);
  });

  it("fournit un libellé et une description pour chaque catégorie", () => {
    for (const category of NOTIFICATION_PREFERENCE_CATEGORIES) {
      const meta = CATEGORY_META[category];
      expect(meta?.label.length ?? 0).toBeGreaterThan(0);
      expect(meta?.description.length ?? 0).toBeGreaterThan(0);
      expect(meta?.inAppHint.length ?? 0).toBeGreaterThan(0);
      expect(meta?.emailHint.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("n'utilise jamais le libellé français comme identifiant persisté", () => {
    expect(NOTIFICATION_PREFERENCE_CATEGORIES).not.toContain("Devoirs");
    expect(isPreferenceCategory("Devoirs")).toBe(false);
  });
});

describe("Mapping type d'événement → catégorie de préférence", () => {
  it("rattache chaque événement pédagogique à sa catégorie", () => {
    expect(preferenceCategoryOf("ASSIGNMENT_CREATED")).toBe("ASSIGNMENTS");
    expect(preferenceCategoryOf("ASSIGNMENT_UPDATED")).toBe("ASSIGNMENTS");
    expect(preferenceCategoryOf("TASK_REMINDER")).toBe("ASSIGNMENT_REMINDERS");
    expect(preferenceCategoryOf("EVALUATION_PUBLISHED")).toBe("EVALUATIONS");
    expect(preferenceCategoryOf("EVALUATION_CANCELLED")).toBe("EVALUATIONS");
    expect(preferenceCategoryOf("SCHEDULE_PUBLISHED")).toBe("SCHEDULE");
    expect(preferenceCategoryOf("SESSION_CANCELLED")).toBe("SCHEDULE");
    expect(preferenceCategoryOf("ANNOUNCEMENT_CREATED")).toBe("ANNOUNCEMENTS");
    expect(preferenceCategoryOf("DOCUMENT_ADDED")).toBe("RESOURCES");
    expect(preferenceCategoryOf("RECORDING_ADDED")).toBe("RESOURCES");
  });

  it("garde les événements système hors du contrôle des préférences", () => {
    expect(preferenceCategoryOf("REGISTRATION_ACCEPTED")).toBeNull();
    expect(preferenceCategoryOf("REGISTRATION_REJECTED")).toBeNull();
    expect(preferenceCategoryOf("DELEGATE_APPOINTED")).toBeNull();
    expect(preferenceCategoryOf("DELEGATE_REMOVED")).toBeNull();
  });

  it("retourne null pour un type inconnu (aucune désactivation fantôme)", () => {
    expect(preferenceCategoryOf("TYPE_INCONNUE" as any)).toBeNull();
  });

  it("ne marque comme « e-mail possible » que les types réellement pris en charge", () => {
    expect(isEmailCapableType("EVALUATION_PUBLISHED")).toBe(true);
    expect(isEmailCapableType("ASSIGNMENT_CREATED")).toBe(true);
    expect(isEmailCapableType("ANNOUNCEMENT_CREATED")).toBe(true);
    // Événements internes uniquement
    expect(isEmailCapableType("TASK_COMPLETED")).toBe(false);
    expect(isEmailCapableType("TASK_REMINDER")).toBe(false); // géré par le cron
    expect(isEmailCapableType("REGISTRATION_ACCEPTED")).toBe(false);
  });
});

describe("Calcul des canaux effectifs", () => {
  it("applique les valeurs par défaut sans préférence enregistrée", () => {
    expect(resolveChannels("RESOURCES", null)).toEqual({ inApp: true, email: false });
    expect(resolveChannels("ASSIGNMENT_REMINDERS", null)).toEqual({ inApp: true, email: true });
  });

  it("respecte une préférence enregistrée, même désactivée", () => {
    expect(
      resolveChannels("ASSIGNMENT_REMINDERS", { in_app_enabled: false, email_enabled: false })
    ).toEqual({ inApp: false, email: false });
    expect(
      resolveChannels("RESOURCES", { in_app_enabled: false, email_enabled: true })
    ).toEqual({ inApp: false, email: true });
  });

  it("ne remplace jamais une préférence explicite par un défaut partiel", () => {
    // e-mail activé explicitement, interne non renseigné → défaut pour l'interne
    expect(resolveChannels("SCHEDULE", { email_enabled: true, in_app_enabled: null })).toEqual({
      inApp: true,
      email: true,
    });
  });
});

describe("Lecture groupée des préférences (loadChannels)", () => {
  it("retourne les préférences enregistrées et les défauts pour les autres", async () => {
    h.rows = [
      { user_id: "u1", category: "EVALUATIONS", in_app_enabled: false, email_enabled: true },
    ];

    const map = await loadChannels(["u1", "u2"], "EVALUATIONS");

    expect(map.get("u1")).toEqual({ inApp: false, email: true });
    expect(map.get("u2")).toEqual({ inApp: true, email: true }); // défaut
  });

  it("n'exécute aucune requête pour une liste vide", async () => {
    const map = await loadChannels([], "CHAT");
    expect(map.size).toBe(0);
  });

  it("en cas d'erreur de lecture applique les valeurs par défaut (ni tout ouvert ni tout fermé)", async () => {
    h.readErrors["notification_preferences"] = "base indisponible";

    const map = await loadChannels(["u1"], "ASSIGNMENT_REMINDERS");

    expect(map.get("u1")).toEqual({ inApp: true, email: true }); // défaut documenté
    // Et surtout PAS {inApp:false, email:false} (coupure silencieuse)
    expect(map.get("u1")).not.toEqual({ inApp: false, email: false });
  });
});

describe("Validation des préférences reçues du navigateur", () => {
  const valid = {
    preferences: NOTIFICATION_PREFERENCE_CATEGORIES.map((category) => ({
      category,
      inAppEnabled: true,
      emailEnabled: false,
    })),
  };

  it("accepte un enregistrement complet et valide", () => {
    expect(notificationPreferencesSchema.safeParse(valid).success).toBe(true);
  });

  it("rejette une catégorie inconnue", () => {
    const result = notificationPreferencesSchema.safeParse({
      preferences: [{ category: "SECRETS", inAppEnabled: true, emailEnabled: true }],
    });
    expect(result.success).toBe(false);
  });

  it("rejette une valeur non booléenne", () => {
    const result = notificationPreferencesSchema.safeParse({
      preferences: [{ category: "CHAT", inAppEnabled: "oui", emailEnabled: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejette une catégorie en doublon", () => {
    const result = notificationPreferencesSchema.safeParse({
      preferences: [
        { category: "CHAT", inAppEnabled: true, emailEnabled: false },
        { category: "CHAT", inAppEnabled: false, emailEnabled: true },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejette une liste vide", () => {
    expect(notificationPreferencesSchema.safeParse({ preferences: [] }).success).toBe(false);
  });

  it("rejette un payload qui n'est pas un objet de préférences", () => {
    expect(notificationPreferencesSchema.safeParse(null).success).toBe(false);
    expect(notificationPreferencesSchema.safeParse({ preferences: "tout" }).success).toBe(false);
  });
});

describe("isPreferenceCategory", () => {
  it("valide uniquement les identifiants techniques connus", () => {
    expect(isPreferenceCategory("ASSIGNMENTS")).toBe(true);
    expect(isPreferenceCategory("assignments")).toBe(false);
    expect(isPreferenceCategory(42)).toBe(false);
    expect(isPreferenceCategory(undefined)).toBe(false);
  });
});
