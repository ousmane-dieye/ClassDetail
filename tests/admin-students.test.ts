import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Tests — Dashboard ADMIN : Gestion des étudiants
// (removeStudentFromClassAction / deleteStudentAccountAction).
//
// Vérifie :
// - Authentification et vérification stricte du rôle ADMIN côté serveur ;
// - Protection contre l'auto-suppression d'un compte administrateur ;
// - Protection absolue des comptes administrateurs cibles ;
// - Rejet si l'étudiant n'appartient à aucune classe lors d'un retrait ;
// - Rétrogradation automatique d'un DELEGATE en STUDENT lors du retrait ;
// - Découplage des clés étrangères et suppression cohérente Auth + Profiles.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  callerUser: { id: "admin-1" } as { id: string } | null,
  callerRole: "ADMIN" as "ADMIN" | "STUDENT" | "DELEGATE" | null,
  targetProfile: null as any,
  deleteUserCalledWith: null as string | null,
  deleteUserError: null as any,
  profileUpdates: [] as Array<{ id: string; data: any }>,
  classMembersUpdates: [] as Array<{ userId: string; data: any }>,
  registrationRequestUpdates: [] as Array<{ query: any; data: any }>,
  notificationsCreated: [] as any[],
  revalidatedPaths: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: state.callerUser }, error: null }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: state.callerRole ? { role: state.callerRole } : null,
              error: state.callerRole ? null : { message: "Not found" },
            }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              single: () =>
                Promise.resolve({
                  data: state.targetProfile?.id === id ? state.targetProfile : null,
                  error: state.targetProfile?.id === id ? null : { message: "Not found" },
                }),
            }),
          }),
          update: (data: any) => ({
            eq: (_col: string, id: string) => {
              state.profileUpdates.push({ id, data });
              return Promise.resolve({ error: null });
            },
          }),
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      if (table === "class_members") {
        return {
          update: (data: any) => ({
            eq: (_c1: string, userId: string) => ({
              eq: () => ({
                is: () => {
                  state.classMembersUpdates.push({ userId, data });
                  return Promise.resolve({ error: null });
                },
              }),
            }),
          }),
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      if (table === "registration_requests") {
        return {
          update: (data: any) => ({
            eq: (_c1: string, val1: string) => ({
              eq: (_c2: string, val2: string) => {
                state.registrationRequestUpdates.push({ query: { val1, val2 }, data });
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }
      // Autres tables de nettoyage (chat_messages, tasks, etc.)
      return {
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    },
    auth: {
      admin: {
        deleteUser: (userId: string) => {
          state.deleteUserCalledWith = userId;
          return Promise.resolve({ error: state.deleteUserError });
        },
      },
    },
  }),
}));

vi.mock("@/lib/notifications/service", () => ({
  createNotification: (input: any) => {
    state.notificationsCreated.push(input);
    return Promise.resolve({ id: "notif-1" });
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    state.revalidatedPaths.push(path);
  },
}));

import {
  removeStudentFromClassAction,
  deleteStudentAccountAction,
} from "@/actions/admin-students";

describe("ADMIN → Gestion des étudiants : removeStudentFromClassAction", () => {
  beforeEach(() => {
    state.callerUser = { id: "admin-1" };
    state.callerRole = "ADMIN";
    state.targetProfile = {
      id: "student-1",
      role: "STUDENT",
      class_id: "class-1",
      first_name: "Ousmane",
      last_name: "Diallo",
    };
    state.deleteUserCalledWith = null;
    state.deleteUserError = null;
    state.profileUpdates = [];
    state.classMembersUpdates = [];
    state.registrationRequestUpdates = [];
    state.notificationsCreated = [];
    state.revalidatedPaths = [];
  });

  it("rejette si l'appelant n'est pas authentifié", async () => {
    state.callerUser = null;
    const res = await removeStudentFromClassAction("student-1");
    expect(res).toHaveProperty("error");
    expect((res as any).error).toContain("connecté");
  });

  it("rejette si l'appelant n'a pas le rôle ADMIN (ex: STUDENT)", async () => {
    state.callerRole = "STUDENT";
    const res = await removeStudentFromClassAction("student-1");
    expect(res).toHaveProperty("error");
    expect((res as any).error).toContain("privilèges administrateur");
  });

  it("rejette si l'étudiant ciblé est introuvable", async () => {
    const res = await removeStudentFromClassAction("unknown-user");
    expect(res).toHaveProperty("error");
    expect((res as any).error).toContain("introuvable");
  });

  it("rejette si la cible est un compte ADMIN", async () => {
    state.targetProfile = {
      id: "other-admin",
      role: "ADMIN",
      class_id: "class-1",
      first_name: "Root",
      last_name: "Admin",
    };
    const res = await removeStudentFromClassAction("other-admin");
    expect(res).toHaveProperty("error");
    expect((res as any).error).toContain("administrateur");
  });

  it("rejette si l'étudiant n'a déjà aucune classe rattachée", async () => {
    state.targetProfile.class_id = null;
    const res = await removeStudentFromClassAction("student-1");
    expect(res).toHaveProperty("error");
    expect((res as any).error).toContain("aucune classe");
  });

  it("retire avec succès un étudiant de sa classe : clôture class_members, annule les demandes PENDING et met class_id à null", async () => {
    const res = await removeStudentFromClassAction("student-1");
    expect(res).toEqual({ success: true });
    expect(state.profileUpdates).toContainEqual({
      id: "student-1",
      data: { class_id: null, role: "STUDENT" },
    });
    expect(state.classMembersUpdates.length).toBeGreaterThan(0);
    expect(state.revalidatedPaths).toContain("/dashboard/admin");
  });

  it("rétrograde automatiquement un DELEGATE en STUDENT et émet une notification DELEGATE_REMOVED", async () => {
    state.targetProfile.role = "DELEGATE";
    const res = await removeStudentFromClassAction("student-1");
    expect(res).toEqual({ success: true });
    expect(state.profileUpdates).toContainEqual({
      id: "student-1",
      data: { class_id: null, role: "STUDENT" },
    });
    expect(state.notificationsCreated.some((n) => n.type === "DELEGATE_REMOVED")).toBe(true);
  });
});

describe("ADMIN → Gestion des étudiants : deleteStudentAccountAction", () => {
  beforeEach(() => {
    state.callerUser = { id: "admin-1" };
    state.callerRole = "ADMIN";
    state.targetProfile = {
      id: "student-1",
      role: "STUDENT",
      first_name: "Ousmane",
      last_name: "Diallo",
      email: "etudiant@ecole.fr",
    };
    state.deleteUserCalledWith = null;
    state.deleteUserError = null;
    state.revalidatedPaths = [];
  });

  it("rejette si l'appelant n'est pas connecté", async () => {
    state.callerUser = null;
    const res = await deleteStudentAccountAction("student-1");
    expect(res).toHaveProperty("error");
  });

  it("rejette si l'appelant n'est pas ADMIN", async () => {
    state.callerRole = "DELEGATE";
    const res = await deleteStudentAccountAction("student-1");
    expect(res).toHaveProperty("error");
    expect((res as any).error).toContain("privilèges administrateur");
  });

  it("bloque strictement l'auto-suppression d'un administrateur", async () => {
    const res = await deleteStudentAccountAction("admin-1");
    expect(res).toHaveProperty("error");
    expect((res as any).error).toContain("propre compte");
  });

  it("bloque strictement la suppression d'un compte ADMIN", async () => {
    state.targetProfile = {
      id: "admin-2",
      role: "ADMIN",
      first_name: "Admin",
      last_name: "Deux",
      email: "admin2@ecole.fr",
    };
    const res = await deleteStudentAccountAction("admin-2");
    expect(res).toHaveProperty("error");
    expect((res as any).error).toContain("impossible de supprimer un compte administrateur");
  });

  it("supprime avec succès un compte étudiant dans Supabase Auth", async () => {
    const res = await deleteStudentAccountAction("student-1");
    expect(res).toEqual({ success: true });
    expect(state.deleteUserCalledWith).toBe("student-1");
    expect(state.revalidatedPaths).toContain("/dashboard/admin");
  });
});
