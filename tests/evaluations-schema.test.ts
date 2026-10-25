import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EVALUATION_TYPES } from "@/lib/validation/schemas";

// ---------------------------------------------------------------------------
// Tests schéma — module Évaluations (migration 0017 + schema.sql).
//  Vérifie que le SQL tient les promesses produit :
//   * chapitres facultatifs (défaut vide, AUCUNE contrainte de présence) ;
//   * ressources facultatives (jointures vides par défaut) ;
//   * statut par défaut DRAFT (rien n'est publié silencieusement) ;
//   * RLS active avec exclusion des brouillons pour les étudiants ;
//   * isolement S3 (FK composite vers subjects / documents / hints).
//  Aucune exécution SQL : lecture des fichiers uniquement.
// ---------------------------------------------------------------------------

function sqlOf(file: "migrations/0017_evaluations.sql" | "schema.sql"): string {
  return readFileSync(path.join(process.cwd(), "supabase", file), "utf8");
}

const migration = sqlOf("migrations/0017_evaluations.sql");
const schema = sqlOf("schema.sql");

describe("enums — synchronisés avec le code", () => {
  it("l'enum evaluation_type correspond à EVALUATION_TYPES (Zod)", () => {
    const match = migration.match(/create type evaluation_type as enum \(([^)]+)\)/);
    expect(match).toBeTruthy();
    const values = match![1]!.match(/'([A-Z_]+)'/g)!.map((v) => v.replace(/'/g, ""));
    expect(values).toEqual([...EVALUATION_TYPES]);
  });

  it("l'enum evaluation_status n'a QUE DRAFT / PUBLISHED / CANCELLED", () => {
    const match = migration.match(/create type evaluation_status as enum \(([^)]+)\)/);
    expect(match).toBeTruthy();
    const values = match![1]!.match(/'([A-Z_]+)'/g)!.map((v) => v.replace(/'/g, ""));
    expect(values).toEqual(["DRAFT", "PUBLISHED", "CANCELLED"]);
  });
});

describe("chapitres — facultatifs en base (garantie)", () => {
  it.each([
    ["migration 0017", migration],
    ["schema.sql", schema],
  ])("%s : colonne avec défaut vide, NOT NULL, sans contrainte de présence", (_label, sql) => {
    expect(sql).toMatch(/chapters\s+text\[\]\s+not\s+null\s+default\s+'\{\}'/i);
    // Uniquement un garde-fou de TAILLE, jamais d'exigence de présence.
    expect(sql).toMatch(/array_length\(chapters,\s*1\).*<=\s*30/i);
    expect(sql).not.toMatch(/check\s*\(\s*array_length\(chapters/i);
  });
});

describe("horaires — jamais imposés", () => {
  it("start_time et end_time sont des colonnes NULL (publication sans heure possible)", () => {
    expect(migration).toMatch(/start_time\s+time,?[\r\n]/);
    expect(migration).toMatch(/end_time\s+time,?[\r\n]/);
  });

  it("si une heure de fin existe, elle doit être postérieure au début", () => {
    expect(migration).toMatch(/end_time is null or start_time is not null/);
    expect(migration).toMatch(/end_time is null or end_time > start_time/);
  });
});

describe("statut — rien n'est publié silencieusement", () => {
  it.each([
    ["migration 0017", migration],
    ["schema.sql", schema],
  ])("%s : statut par défaut DRAFT", (_label, sql) => {
    expect(sql).toMatch(/status\s+evaluation_status\s+not\s+null\s+default\s+'DRAFT'/i);
  });
});

describe("RLS — brouillons jamais exposés aux étudiants", () => {
  it("la RLS est active sur les trois tables", () => {
    expect(migration).toMatch(/alter table evaluations enable row level security/);
    expect(migration).toMatch(/alter table evaluation_documents enable row level security/);
    expect(migration).toMatch(/alter table evaluation_hints enable row level security/);
  });

  it("la politique de lecture exclut les brouillons hors délégué/admin", () => {
    expect(migration).toMatch(/status <> 'DRAFT' or is_admin\(\) or is_delegate_of\(class_id\)/);
  });

  it("l'écriture exige délégué de la classe ou admin", () => {
    expect(migration).toMatch(
      /policy evaluations_write on evaluations for all\s+using \(is_admin\(\) or is_delegate_of\(class_id\)\)\s+with check \(is_admin\(\) or is_delegate_of\(class_id\)\)/
    );
  });
});

describe("isolation S3 — FK composite", () => {
  it("la matière appartient à la classe de l'évaluation (FK composite)", () => {
    expect(migration).toMatch(
      /foreign key \(subject_id, class_id\) references subjects\(id, class_id\)/
    );
  });

  it("les jointures ressources portent une FK composite vers documents/hints", () => {
    expect(migration).toMatch(
      /foreign key \(document_id, class_id\) references documents\(id, class_id\)/
    );
    expect(migration).toMatch(
      /foreign key \(hint_id, class_id\) references hints\(id, class_id\)/
    );
    expect(migration).toMatch(/unique \(id, class_id\)/);
  });
});

describe("idempotence", () => {
  it("chaque objet critique est créé de façon ré-exécutable", () => {
    expect(migration).toMatch(/create table if not exists evaluations/);
    expect(migration).toMatch(/create table if not exists evaluation_documents/);
    expect(migration).toMatch(/create table if not exists evaluation_hints/);
    expect(migration).toMatch(/drop policy if exists evaluations_select/);
    expect(migration).toMatch(/create index if not exists idx_evaluations_class_date/);
  });
});
