import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Tests S5 — Accès à /dashboard/stats réservé à ADMIN et DELEGATE.
//  La page est un composant serveur : on l'invoque directement avec un client
//  Supabase mocké, pour chaque rôle. La protection est côté serveur (garde
//  via canViewClassStats + redirect), jamais un simple masquage du lien.
// ---------------------------------------------------------------------------

type Role = "ADMIN" | "DELEGATE" | "STUDENT" | "PENDING";

const state = vi.hoisted(() => ({
  user: { id: "u-1" },
  profile: null as { role: Role; class_id: string | null } | null,
  counts: {} as Record<string, number>,
  classes: [] as { id: string; name: string }[],
  fromCalls: 0,
  redirectTarget: null as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => {
    const makeChain = (result: () => unknown) => {
      const chain: any = {
        then: (resolve: (v: unknown) => void) => Promise.resolve(result()).then(resolve),
        eq: () => chain,
        match: () => chain,
        order: () => chain,
        limit: () => chain,
        single: async () => ({ data: state.profile, error: null }),
      };
      return chain;
    };

    return {
      auth: {
        getUser: async () => ({ data: { user: state.user }, error: null }),
      },
      from: (table: string) => {
        state.fromCalls += 1;
        return {
          select: (cols: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.count === "exact" && opts?.head) {
              return makeChain(() => ({ count: state.counts[table] ?? 0, error: null }));
            }
            if (cols.includes("tasks")) {
              return makeChain(() => ({ data: [], error: null }));
            }
            if (cols.includes("name")) {
              return makeChain(() => ({ data: state.classes, error: null }));
            }
            if (cols.includes("class_id")) {
              return makeChain(() => ({ data: state.profile, error: null }));
            }
            return makeChain(() => ({ data: [], error: null }));
          },
        };
      },
    };
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    state.redirectTarget = url;
    throw new Error("NEXT_REDIRECT");
  },
}));

import StatsPage from "@/app/dashboard/stats/page";

const renderStats = async (): Promise<"ok" | `redirect:${string}`> => {
  state.redirectTarget = null;
  state.fromCalls = 0;
  try {
    await StatsPage();
    return "ok";
  } catch (e) {
    if ((e as Error).message === "NEXT_REDIRECT") return `redirect:${state.redirectTarget}`;
    throw e;
  }
};

const setup = (profile: { role: Role; class_id: string | null } | null) => {
  state.profile = profile;
  state.counts = { profiles: 2, tasks: 3, documents: 1, hints: 1, recordings: 1 };
  state.classes = [{ id: "c1", name: "Classe A" }];
};

beforeEach(() => {
  setup({ role: "DELEGATE", class_id: "c1" });
});

describe("S5 — accès à /dashboard/stats (garde serveur)", () => {
  it("ADMIN : accès autorisé", async () => {
    setup({ role: "ADMIN", class_id: null });
    expect(await renderStats()).toBe("ok");
  });

  it("DELEGATE avec classe : accès autorisé", async () => {
    setup({ role: "DELEGATE", class_id: "c1" });
    expect(await renderStats()).toBe("ok");
  });

  it("STUDENT : accès refusé -> redirect /dashboard", async () => {
    setup({ role: "STUDENT", class_id: "c1" });
    expect(await renderStats()).toBe("redirect:/dashboard");
  });

  it("STUDENT : aucune donnée de statistiques n'est requêtée (garde avant les queries)", async () => {
    setup({ role: "STUDENT", class_id: "c1" });
    await renderStats();
    expect(state.fromCalls).toBe(1);
  });

  it("PENDING : accès refusé -> redirect /dashboard", async () => {
    setup({ role: "PENDING", class_id: "c1" });
    expect(await renderStats()).toBe("redirect:/dashboard");
  });

  it("profil absent : accès refusé -> redirect /dashboard", async () => {
    setup(null);
    expect(await renderStats()).toBe("redirect:/dashboard");
  });

  it("DELEGATE sans classe affectée : accès refusé -> redirect /dashboard", async () => {
    setup({ role: "DELEGATE", class_id: null });
    expect(await renderStats()).toBe("redirect:/dashboard");
  });
});
