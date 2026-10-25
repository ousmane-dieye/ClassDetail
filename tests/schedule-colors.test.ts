import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SUBJECT_COLOR_KEYS,
  getSubjectColor,
  isSubjectColorKey,
  defaultColorForIndex,
} from "@/lib/constants/subjectColors";

// ---------------------------------------------------------------------------
// Tests couleurs de matières — palette contrôlée, persistée en base.
//  Le CHECK SQL (migration 0016 + schema.sql) doit rester synchronisé avec
//  la palette TypeScript : un écart = couleur refusée en base ou inversement.
// ---------------------------------------------------------------------------

function sqlColorKeys(file: string): string[] {
  const sql = readFileSync(path.join(process.cwd(), "supabase", file), "utf8");
  const match = sql.match(/color_key in \(([^)]+)\)/i);
  if (!match?.[1]) throw new Error(`CHECK color_key introuvable dans ${file}`);
  const literals = match[1].match(/'([a-z]+)'/g);
  if (!literals) throw new Error(`Palette vide dans ${file}`);
  return literals.map((s) => s.slice(1, -1));
}

describe("Palette SUBJECT_COLOR_KEYS", () => {
  it("expose exactement 20 couleurs distinctes", () => {
    expect(SUBJECT_COLOR_KEYS).toHaveLength(20);
    expect(new Set(SUBJECT_COLOR_KEYS).size).toBe(20);
  });

  it("reste synchronisée avec le CHECK SQL de la migration 0016", () => {
    expect(sqlColorKeys("migrations/0016_schedule.sql")).toEqual([...SUBJECT_COLOR_KEYS]);
  });

  it("reste synchronisée avec le CHECK SQL de schema.sql (bases neuves)", () => {
    expect(sqlColorKeys("schema.sql")).toEqual([...SUBJECT_COLOR_KEYS]);
  });
});

describe("getSubjectColor", () => {
  it("retourne un style complet et cohérent pour chaque clé de la palette", () => {
    for (const key of SUBJECT_COLOR_KEYS) {
      const style = getSubjectColor(key);
      expect(style.key).toBe(key);
      expect(style.label.length).toBeGreaterThan(0);
      // Fond teinté + variante sombre : le bloc reste lisible en mode clair/sombre.
      expect(style.block).toContain("bg-");
      expect(style.block).toContain("dark:");
      expect(style.dot.length).toBeGreaterThan(0);
      expect(style.accent.length).toBeGreaterThan(0);
      expect(style.subtleDot.length).toBeGreaterThan(0);
    }
  });

  it("n'utilise jamais deux fois la même classe de bloc", () => {
    const blocks = SUBJECT_COLOR_KEYS.map((k) => getSubjectColor(k).block);
    expect(new Set(blocks).size).toBe(blocks.length);
  });

  it("replie proprement sur « blue » pour une valeur inconnue ou absente", () => {
    expect(getSubjectColor("inconnue").key).toBe("blue");
    expect(getSubjectColor(null).key).toBe("blue");
    expect(getSubjectColor(undefined).key).toBe("blue");
    expect(getSubjectColor("").key).toBe("blue");
    // Casses et variations : jamais de crash, toujours un repli.
    expect(getSubjectColor("Blue").key).toBe("blue");
    expect(getSubjectColor(" blue").key).toBe("blue");
  });
});

describe("isSubjectColorKey", () => {
  it("accepte uniquement les clés exactes de la palette", () => {
    for (const key of SUBJECT_COLOR_KEYS) {
      expect(isSubjectColorKey(key)).toBe(true);
    }
    expect(isSubjectColorKey("Blue")).toBe(false);
    expect(isSubjectColorKey("magenta")).toBe(false);
    expect(isSubjectColorKey("")).toBe(false);
  });
});

describe("defaultColorForIndex — attribution stable", () => {
  it("attribue la couleur par index de façon déterministe", () => {
    expect(defaultColorForIndex(0)).toBe("blue");
    expect(defaultColorForIndex(1)).toBe("indigo");
    expect(defaultColorForIndex(9)).toBe("orange");
    expect(defaultColorForIndex(10)).toBe("purple"); // 11ᵉ entrée de la palette
    expect(defaultColorForIndex(19)).toBe("gray");
  });

  it("boucle modulo 20 (comme le backfill SQL row_number % 20)", () => {
    expect(defaultColorForIndex(20)).toBe(defaultColorForIndex(0));
    expect(defaultColorForIndex(23)).toBe(defaultColorForIndex(3));
    expect(defaultColorForIndex(100)).toBe(defaultColorForIndex(0));
  });

  it("gère les index négatifs sans sortir de la palette", () => {
    expect(defaultColorForIndex(-1)).toBe("gray"); // 20ᵉ couleur
    expect(defaultColorForIndex(-20)).toBe("blue");
    for (const i of [-21, -1, 0, 20, 25]) {
      expect(SUBJECT_COLOR_KEYS).toContain(defaultColorForIndex(i));
    }
  });

  it("répartit 20 matières sur les 20 couleurs sans doublon", () => {
    const assigned = Array.from({ length: 20 }, (_, i) => defaultColorForIndex(i));
    expect(new Set(assigned).size).toBe(20);
  });

  it("reste stable entre deux appels (couleur jamais recalculée)", () => {
    for (let i = 0; i < 25; i++) {
      expect(defaultColorForIndex(i)).toBe(defaultColorForIndex(i));
    }
  });
});
