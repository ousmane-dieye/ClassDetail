import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  inserted: [] as Array<Record<string, unknown>>,
  members: [] as Array<{ id: string }>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: state.members, error: null }) }),
        };
      }
      return {
        insert: (payload: Record<string, unknown>) => {
          state.inserted.push(payload);
          return { select: () => ({ single: () => Promise.resolve({ data: { id: `n-${state.inserted.length}` }, error: null }) }) };
        },
      };
    },
  })),
}));

import {
  createNotification,
  notifyClassMembers,
  notificationCategoryOf,
} from "@/lib/notifications/service";

beforeEach(() => {
  state.inserted = [];
  state.members = [{ id: "m1" }, { id: "m2" }, { id: "m3" }];
});

describe("notificationCategoryOf", () => {
  it("catégorise chaque type de notification", () => {
    expect(notificationCategoryOf("TASK_CREATED")).toBe("tasks");
    expect(notificationCategoryOf("ASSIGNMENT_CREATED")).toBe("tasks");
    expect(notificationCategoryOf("ASSIGNMENT_UPDATED")).toBe("tasks");
    expect(notificationCategoryOf("TASK_REMINDER")).toBe("tasks");
    expect(notificationCategoryOf("TASK_COMPLETED")).toBe("tasks");
    expect(notificationCategoryOf("COURSE_SAVED")).toBe("courses");
    expect(notificationCategoryOf("COURSE_UPDATED")).toBe("courses");
    expect(notificationCategoryOf("RECORDING_ADDED")).toBe("courses");
    expect(notificationCategoryOf("DOCUMENT_ADDED")).toBe("documents");
    expect(notificationCategoryOf("HINT_ADDED")).toBe("hints");
    expect(notificationCategoryOf("ANNOUNCEMENT_CREATED")).toBe("announcements");
    expect(notificationCategoryOf("REGISTRATION_ACCEPTED")).toBe("system");
  });

  it("retourne 'system' pour un type inconnu", () => {
    expect(notificationCategoryOf("UNKNOWN" as never)).toBe("system");
  });
});

describe("createNotification", () => {
  it("ignore les entrées invalides", async () => {
    const res = await createNotification({ userId: "", type: "TASK_CREATED", title: "", message: "" });
    expect(res).toBeNull();
  });

  it("insère une notification complète avec catégorie dérivée", async () => {
    const res = await createNotification({
      userId: "u1",
      type: "DOCUMENT_ADDED",
      title: "📄 Nouveau document",
      message: "Un document a été ajouté : cours réseaux",
      entityType: "document",
      entityId: "doc-1",
      link: "/dashboard/documents",
    });
    expect(res?.id).toBeTruthy();
    expect(state.inserted).toHaveLength(1);
    const row = state.inserted[0]!;
    expect(row).toMatchObject({
      recipient_id: "u1",
      type: "DOCUMENT_ADDED",
      entity_type: "document",
      entity_id: "doc-1",
      link: "/dashboard/documents",
      category: "documents",
    });
  });
});

describe("notifyClassMembers", () => {
  it("notifie chaque membre sauf le créateur", async () => {
    const count = await notifyClassMembers({
      classId: "c1",
      excludeUserId: "m2",
      type: "HINT_ADDED",
      title: "💡 Nouveau hint",
      message: "Un hint a été ajouté",
    });
    expect(count).toBe(2);
    expect(state.inserted).toHaveLength(2);
    const recipients = state.inserted.map((r) => r.recipient_id);
    expect(recipients).not.toContain("m2");
    expect(recipients).toEqual(expect.arrayContaining(["m1", "m3"]));
  });
});

describe("Annonce de classe (ANNOUNCEMENT_CREATED)", () => {
  it("notifie toute la classe sauf le modérateur auteur, catégorie 'announcements'", async () => {
    const count = await notifyClassMembers({
      classId: "c1",
      excludeUserId: "m1",
      type: "ANNOUNCEMENT_CREATED",
      title: "🔔 Annonce",
      message: "Moussa a publié une annonce : examen déplacé à vendredi",
      entityType: "chat",
      entityId: "chat-42",
      link: "/dashboard/chat",
    });
    expect(count).toBe(2);
    const rows = state.inserted.filter((r) => r.type === "ANNOUNCEMENT_CREATED");
    expect(rows).toHaveLength(2);
    const recipients = rows.map((r) => r.recipient_id);
    expect(recipients).not.toContain("m1");
    expect(recipients).toEqual(expect.arrayContaining(["m2", "m3"]));
    for (const row of rows) {
      expect(row.category).toBe("announcements");
      expect(row.link).toBe("/dashboard/chat");
      expect(row.entity_id).toBe("chat-42");
    }
  });
});
