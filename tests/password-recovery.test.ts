import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Tests F3 — Mot de passe oublié (Supabase Auth).
//  - requestPasswordResetAction / updatePasswordAction (actions/auth.ts)
//  - GET /auth/confirm (échange du lien de récupération)
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  resetError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  exchangeError: null as { message: string } | null,
  verifyError: null as { message: string } | null,
  resetCalled: null as { email: string; redirectTo?: string } | null,
  updateCalled: null as unknown,
  signOutCalled: false,
  redirectTarget: null as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      resetPasswordForEmail: async (email: string, options?: { redirectTo?: string }) => {
        state.resetCalled = { email, redirectTo: options?.redirectTo };
        return state.resetError ? { data: null, error: state.resetError } : { data: null, error: null };
      },
      getUser: async () => ({ data: { user: state.user }, error: null }),
      updateUser: async (payload: unknown) => {
        state.updateCalled = payload;
        return state.updateError ? { data: null, error: state.updateError } : { data: { user: state.user }, error: null };
      },
      signOut: async () => {
        state.signOutCalled = true;
        return { error: null };
      },
      exchangeCodeForSession: async (code: string) =>
        state.exchangeError ? { data: null, error: state.exchangeError } : { data: { session: { user: state.user } }, error: null },
      verifyOtp: async () =>
        state.verifyError ? { data: null, error: state.verifyError } : { data: { session: { user: state.user } }, error: null },
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    state.redirectTarget = url;
    throw new Error("NEXT_REDIRECT");
  },
  revalidatePath: () => {},
}));

vi.mock("next/server", () => {
  class FakeNextUrl {
    url: URL;
    constructor(input: string) {
      this.url = new URL(input);
    }
    get pathname() {
      return this.url.pathname;
    }
    set pathname(p: string) {
      this.url.pathname = p;
    }
    get searchParams() {
      return this.url.searchParams;
    }
    toString() {
      return this.url.toString();
    }
    clone() {
      return new FakeNextUrl(this.url.toString());
    }
  }
  return {
    NextResponse: {
      redirect: (target: unknown) => ({
        __redirect: String(target),
        status: 307,
      }),
    },
    NextRequest: class {
      url: string;
      nextUrl: FakeNextUrl;
      constructor(input: string) {
        this.url = input;
        this.nextUrl = new FakeNextUrl(input);
      }
    },
  };
});

import { requestPasswordResetAction, updatePasswordAction } from "@/actions/auth";
import { GET as confirmGET } from "@/app/auth/confirm/route";
import { NextRequest } from "next/server";

const RESET_EMAIL = (overrides: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("email", "etudiant@ecole.fr");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
};

const RESET_PASSWORD = (overrides: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("password", "NouveauMotDePasse1!");
  fd.set("confirmPassword", "NouveauMotDePasse1!");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
};

function redirectTargetOf(res: { status: number }): string {
  return String((res as unknown as { __redirect: string }).__redirect);
}

beforeEach(() => {
  state.user = null;
  state.resetError = null;
  state.updateError = null;
  state.exchangeError = null;
  state.verifyError = null;
  state.resetCalled = null;
  state.updateCalled = null;
  state.signOutCalled = false;
  state.redirectTarget = null;
});

describe("requestPasswordResetAction — étape 1 (email)", () => {
  it("email valide : appel Supabase avec redirectTo vers /auth/confirm?next=/reset-password", async () => {
    const result = await requestPasswordResetAction(RESET_EMAIL());
    expect(result).toEqual({ success: true });
    expect(state.resetCalled?.email).toBe("etudiant@ecole.fr");
    expect(state.resetCalled?.redirectTo).toBe(
      `${process.env.APP_URL ?? "http://localhost:3000"}/auth/confirm?next=/reset-password`
    );
  });

  it("email inexistant : réponse NEUTRE identique (aucune énumération)", async () => {
    state.resetError = { message: "No user found" };
    const result = await requestPasswordResetAction(RESET_EMAIL());
    expect(result).toEqual({ success: true });
    expect(JSON.stringify(result)).not.toContain("user");
    expect(JSON.stringify(result)).not.toContain("found");
  });

  it("email invalide (format) : erreur de validation, aucun appel Supabase", async () => {
    const result = await requestPasswordResetAction(RESET_EMAIL({ email: "pas-un-email" }));
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("Email") }));
    expect(state.resetCalled).toBeNull();
  });

  it("email vide : erreur de validation", async () => {
    const result = await requestPasswordResetAction(RESET_EMAIL({ email: "" }));
    expect(result).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(state.resetCalled).toBeNull();
  });
});

describe("updatePasswordAction — étape 3 (nouveau mot de passe)", () => {
  it("nouveau mot de passe valide : mise à jour + déconnexion + redirection login", async () => {
    state.user = { id: "u-1" };
    let threw = false;
    try {
      await updatePasswordAction(RESET_PASSWORD());
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(state.updateCalled).toEqual({ password: "NouveauMotDePasse1!" });
    expect(state.signOutCalled).toBe(true);
    expect(state.redirectTarget).toBe("/login");
  });

  it("ancien mot de passe (same_password) : erreur remontée, pas de redirection", async () => {
    state.user = { id: "u-1" };
    state.updateError = { message: "New password should be different from the old password" };
    const result = await updatePasswordAction(RESET_PASSWORD());
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("identique") }));
    expect(state.signOutCalled).toBe(false);
    expect(state.redirectTarget).toBeNull();
  });

  it("session absente : refus (lien consommé ou expiré)", async () => {
    const result = await updatePasswordAction(RESET_PASSWORD());
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("Session") }));
    expect(state.updateCalled).toBeNull();
    expect(state.signOutCalled).toBe(false);
  });

  it("mots de passe différents : erreur de validation", async () => {
    state.user = { id: "u-1" };
    const result = await updatePasswordAction(RESET_PASSWORD({ confirmPassword: "Different1!" }));
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("correspondent") }));
    expect(state.updateCalled).toBeNull();
    expect(state.signOutCalled).toBe(false);
  });

  it("mot de passe trop court : erreur de validation explicite (règle + longueur saisie)", async () => {
    state.user = { id: "u-1" };
    const result = await updatePasswordAction(RESET_PASSWORD({ password: "court", confirmPassword: "court" }));
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("6 caractères minimum") }));
    expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining("saisi 5") }));
    expect(state.updateCalled).toBeNull();
  });
});

describe("GET /auth/confirm — échange du lien de récupération", () => {
  it("lien valide (PKCE, paramètre code) : redirection vers /reset-password sans token dans l'URL", async () => {
    const res = await confirmGET(
      new NextRequest("http://localhost:3000/auth/confirm?code=abc123&type=recovery&next=/reset-password")
    );
    expect(res.status).toBe(307);
    const target = redirectTargetOf(res);
    expect(target).toContain("/reset-password");
    expect(target).not.toContain("code=");
    expect(target).not.toContain("token_hash");
    expect(target).not.toContain("type=");
  });

  it("lien valide (token_hash) : verifyOtp + redirection /reset-password", async () => {
    state.user = { id: "u-1" };
    const res = await confirmGET(
      new NextRequest("http://localhost:3000/auth/confirm?token_hash=hash123&type=recovery&next=/reset-password")
    );
    const target = redirectTargetOf(res);
    expect(target).toContain("/reset-password");
    expect(target).not.toContain("token_hash");
    expect(target).not.toContain("type=");
  });

  it("lien expiré : redirection vers /recovery-error (page neutre)", async () => {
    state.user = { id: "u-1" };
    state.exchangeError = { message: "Token has expired" };
    state.verifyError = { message: "Token has expired" };
    const res = await confirmGET(
      new NextRequest("http://localhost:3000/auth/confirm?code=expired&type=recovery&next=/reset-password")
    );
    const target = redirectTargetOf(res);
    expect(target).toContain("/recovery-error");
  });

  it("lien sans paramètre : redirection /recovery-error", async () => {
    const res = await confirmGET(new NextRequest("http://localhost:3000/auth/confirm"));
    const target = redirectTargetOf(res);
    expect(target).toContain("/recovery-error");
  });
});
