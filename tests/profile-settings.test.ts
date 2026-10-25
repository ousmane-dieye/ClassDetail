import { describe, expect, it } from "vitest";
import { updateProfileSchema, changePasswordSchema } from "@/lib/validation/schemas";
import { SETTINGS_TABS } from "@/components/settings/SettingsTabs";

describe("Paramètres → Mon profil (validation)", () => {
  it("valide un prénom et nom valides", () => {
    const result = updateProfileSchema.safeParse({
      firstName: "Ousmane",
      lastName: "Diallo",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe("Ousmane");
      expect(result.data.lastName).toBe("Diallo");
    }
  });

  it("nettoie les espaces superflus (trim)", () => {
    const result = updateProfileSchema.safeParse({
      firstName: "  Fatou  ",
      lastName: "  Sow  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe("Fatou");
      expect(result.data.lastName).toBe("Sow");
    }
  });

  it("rejette un prénom trop court (< 2 caractères)", () => {
    const result = updateProfileSchema.safeParse({
      firstName: "A",
      lastName: "Diallo",
    });
    expect(result.success).toBe(false);
  });

  it("rejette un nom trop court (< 2 caractères)", () => {
    const result = updateProfileSchema.safeParse({
      firstName: "Ousmane",
      lastName: "D",
    });
    expect(result.success).toBe(false);
  });

  it("ignore tout champ supplémentaire injecté (rôle, email, classe)", () => {
    const result = updateProfileSchema.safeParse({
      firstName: "Ousmane",
      lastName: "Diallo",
      role: "ADMIN",
      email: "hacked@example.com",
      classId: "some-uuid",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).role).toBeUndefined();
      expect((result.data as any).email).toBeUndefined();
      expect((result.data as any).classId).toBeUndefined();
    }
  });
});

describe("Paramètres → Compte & Sécurité (validation mot de passe)", () => {
  it("valide un mot de passe robuste et identique", () => {
    const result = changePasswordSchema.safeParse({
      password: "SuperPassword123!",
      confirmPassword: "SuperPassword123!",
    });
    expect(result.success).toBe(true);
  });

  it("rejette un mot de passe trop court (< 6 caractères)", () => {
    const result = changePasswordSchema.safeParse({
      password: "12345",
      confirmPassword: "12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejette si les deux mots de passe ne correspondent pas", () => {
    const result = changePasswordSchema.safeParse({
      password: "SuperPassword123!",
      confirmPassword: "DifferentPassword123!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("confirmPassword");
    }
  });
});

describe("Navigation Paramètres → Onglets", () => {
  it("expose les 4 sections canoniques dans l'ordre", () => {
    expect(SETTINGS_TABS.map((t) => t.href)).toEqual([
      "/dashboard/settings/profile",
      "/dashboard/settings/account",
      "/dashboard/settings/notifications",
      "/dashboard/settings/class",
    ]);
  });

  it("contient des libellés clairs et explicites", () => {
    expect(SETTINGS_TABS.map((t) => t.label)).toEqual([
      "Mon profil",
      "Compte & Sécurité",
      "Notifications",
      "Ma classe",
    ]);
  });
});
