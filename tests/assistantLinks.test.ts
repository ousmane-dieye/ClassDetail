import { describe, it, expect } from "vitest";
import {
  isResourceFileUrl,
  extractUrls,
  collectUrlsFromMessages,
  sanitizeAssistantLinks,
} from "@/lib/ai/links";

const REAL_URL = "https://drive.google.com/file/d/ABC123/view";
const FAKE_URL = "https://drive.google.com/file/d/FABRICATED/view";

describe("isResourceFileUrl", () => {
  it("reconnaît les fichiers Google Drive / Docs en https", () => {
    expect(isResourceFileUrl(REAL_URL)).toBe(true);
    expect(isResourceFileUrl("https://docs.google.com/document/d/xyz/edit")).toBe(true);
    expect(isResourceFileUrl("https://www.drive.google.com/file/d/1/view")).toBe(true);
  });

  it("rejette le http, les autres hôtes et les valeurs invalides", () => {
    expect(isResourceFileUrl("http://drive.google.com/file/d/1/view")).toBe(false);
    expect(isResourceFileUrl("https://evil.example.com/drive.google.com")).toBe(false);
    expect(isResourceFileUrl("javascript:alert(1)")).toBe(false);
    expect(isResourceFileUrl("")).toBe(false);
  });
});

describe("extractUrls", () => {
  it("extrait les URLs et retire la ponctuation finale", () => {
    expect(extractUrls("Lien : https://drive.google.com/file/d/1/view.")).toEqual([
      "https://drive.google.com/file/d/1/view",
    ]);
    expect(extractUrls("Voir [ici](https://docs.google.com/document/d/abc/edit).")).toEqual([
      "https://docs.google.com/document/d/abc/edit",
    ]);
  });

  it("déduplique", () => {
    const text = `${REAL_URL} puis encore ${REAL_URL}`;
    expect(extractUrls(text)).toEqual([REAL_URL]);
  });
});

describe("collectUrlsFromMessages", () => {
  it("agrège les URLs de plusieurs messages", () => {
    const urls = collectUrlsFromMessages([
      { content: `un lien ${REAL_URL}` },
      { content: null },
      { content: `encore ${FAKE_URL} et ${REAL_URL}` },
    ]);
    expect(urls).toEqual([REAL_URL, FAKE_URL]);
  });

  it("tolère les messages sans contenu", () => {
    expect(collectUrlsFromMessages([{ content: "" }, {} as { content?: string }])).toEqual([]);
  });
});

describe("sanitizeAssistantLinks", () => {
  it("conserve un lien de fichier réellement présent dans les résultats d'outils", () => {
    const content = `**Titre** — [Ouvrir le document](${REAL_URL})`;
    expect(sanitizeAssistantLinks(content, [REAL_URL])).toBe(content);
  });

  it("retire le lien (en gardant le libellé) d'un fichier jamais renvoyé par les outils", () => {
    const content = `**Titre** — [Ouvrir le document](${FAKE_URL})`;
    const out = sanitizeAssistantLinks(content, [REAL_URL]);
    expect(out).not.toContain(FAKE_URL);
    expect(out).toContain("**Titre** — Ouvrir le document");
  });

  it("conserve les liens internes de la liste blanche des modules", () => {
    const content = `[Voir dans Documents](/dashboard/documents)`;
    expect(sanitizeAssistantLinks(content, [])).toBe(content);
    expect(sanitizeAssistantLinks(content, [])).toContain("/dashboard/documents");
  });

  it("retire les liens internes hors liste blanche (y compris routes de détail)", () => {
    const cases = [
      "[Voir](/dashboard/documents/123e4567-e89b-12d3-a456-426614174000)",
      "[Voir](/dashboard/hack)",
      "[Voir](/dashboard/documents?x=1)",
      "[Voir](/dashboard#section)",
    ];
    for (const content of cases) {
      const out = sanitizeAssistantLinks(content, []);
      expect(out, content).toBe("Voir");
    }
  });

  it("retire les URLs de fichiers nues non autorisées en gardant la ponctuation", () => {
    const out = sanitizeAssistantLinks(`Ouvre ça : ${FAKE_URL}. Merci !`, []);
    expect(out).not.toContain(FAKE_URL);
    expect(out).toContain(". Merci !");
  });

  it("conserve les URL de fichiers nues autorisées", () => {
    const content = `Ouvre ça : ${REAL_URL}. Merci !`;
    expect(sanitizeAssistantLinks(content, [REAL_URL])).toBe(content);
  });

  it("ne touche pas aux liens externes qui ne sont pas des ressources", () => {
    const content = `Documentation : [Next.js](https://nextjs.org/docs)`;
    expect(sanitizeAssistantLinks(content, [])).toBe(content);
  });

  it("réponse mixte : seul le lien réel subsiste", () => {
    const content = [
      "1. **Introduction aux pointeurs** — [Ouvrir le document](https://drive.google.com/file/d/REAL/view) — [Voir dans Documents](/dashboard/documents)",
      "2. **TD inventé** — [Ouvrir le document](https://drive.google.com/file/d/FAUX/view) — [Voir dans Documents](/dashboard/documents/123)",
    ].join("\n");
    const out = sanitizeAssistantLinks(content, ["https://drive.google.com/file/d/REAL/view"]);

    expect(out).toContain("[Ouvrir le document](https://drive.google.com/file/d/REAL/view)");
    expect(out).toContain("[Voir dans Documents](/dashboard/documents)");
    expect(out).not.toContain("FAUX");
    expect(out).not.toContain("/dashboard/documents/123");
    // Le libellé du lien retiré reste lisible.
    expect(out).toContain("2. **TD inventé** — Ouvrir le document — Voir dans Documents");
  });
});
