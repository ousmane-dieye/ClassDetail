import { describe, it, expect } from "vitest";
import { isAllowedAssistantHref, sanitizeAssistantActions } from "@/lib/ai/tools";

describe("isAllowedAssistantHref (liste blanche)", () => {
  it("accepte les liens internes autorisés", () => {
    for (const href of [
      "/dashboard",
      "/dashboard/tasks",
      "/dashboard/documents",
      "/dashboard/hints",
      "/dashboard/recordings",
      "/dashboard/chat",
      "/dashboard/notifications",
      "/dashboard/stats",
      "/dashboard/admin",
    ]) {
      expect(isAllowedAssistantHref(href), href).toBe(true);
    }
  });

  it("rejette les URLs externes et les liens internes non autorisés", () => {
    expect(isAllowedAssistantHref("https://evil.example.com")).toBe(false);
    expect(isAllowedAssistantHref("javascript:alert(1)")).toBe(false);
    expect(isAllowedAssistantHref("/dashboard/hack")).toBe(false);
    expect(isAllowedAssistantHref("/dashboard/messages")).toBe(false);
    expect(isAllowedAssistantHref("/dashboard/messages?conv=123e4567-e89b-12d3-a456-426614174000")).toBe(false);
  });
});

describe("sanitizeAssistantActions", () => {
  it("ne conserve que les actions valides de la liste blanche", () => {
    const actions = sanitizeAssistantActions([
      { label: "Voir mes devoirs", href: "/dashboard/tasks" },
      { label: "Site externe", href: "https://evil.example.com" },
      { label: "Injection", href: "javascript:alert(1)" },
      { label: "Messages", href: "/dashboard/messages" },
    ]);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.href).toBe("/dashboard/tasks");
  });

  it("ignore les entrées malformées", () => {
    expect(sanitizeAssistantActions("pas un tableau")).toEqual([]);
    expect(sanitizeAssistantActions([null, 42, { label: 1, href: "/dashboard" }])).toEqual([]);
  });

  it("limite à 3 actions et 40 caractères de libellé", () => {
    const raw = Array.from({ length: 6 }, (_, i) => ({
      label: `Action ${i}`,
      href: "/dashboard/tasks",
    }));
    const actions = sanitizeAssistantActions(raw);
    expect(actions).toHaveLength(3);

    const long = sanitizeAssistantActions([{ label: "a".repeat(80), href: "/dashboard/tasks" }]);
    expect(long).toEqual([]);
  });
});
