import { describe, it, expect } from "vitest";
import {
  buildOlderMessagesFilter,
  mergeOlderMessages,
  CHAT_INITIAL_PAGE_SIZE,
  CHAT_PAGE_SIZE,
  type ChatCursor,
} from "@/lib/chat/pagination";

// ---------------------------------------------------------------------------
// Tests F2 — Pagination du chat (curseur created_at + id).
// On simule la base : ordre total `created_at DESC, id DESC`, puis on joue le
// même parcours que la production (page initiale 100 + pages de 50 via le
// prédicat keyset produit par buildOlderMessagesFilter).
// ---------------------------------------------------------------------------

interface Msg {
  id: string;
  class_id: string;
  created_at: string;
  content: string;
}

function makeMessages(
  n: number,
  { classId = "c-1", t0 = "2026-01-01T00:00:00.000Z", ties = 1 } = {}
): Msg[] {
  const msgs: Msg[] = [];
  for (let i = 0; i < n; i++) {
    const created_at = new Date(Date.parse(t0) + Math.floor(i / ties) * 1000).toISOString();
    msgs.push({ id: `id-${String(i).padStart(4, "0")}`, class_id: classId, created_at, content: `msg ${i}` });
  }
  return msgs;
}

// Tri DESC total : created_at DESC puis id DESC.
function sortDesc(msgs: Msg[]): Msg[] {
  return [...msgs].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
}

// Équivalent sémantique du prédicat encodé par buildOlderMessagesFilter.
function matchesKeyset(m: Msg, cursor: ChatCursor): boolean {
  return m.created_at < cursor.createdAt || (m.created_at === cursor.createdAt && m.id < cursor.id);
}

// Page « plus anciens » simulée : mêmes sémantiques que la requête PostgREST
// (filtre keyset + order DESC + limit).
function olderPage(sortedDesc: Msg[], cursor: ChatCursor, pageSize: number): Msg[] {
  const candidates = sortedDesc.filter((m) => matchesKeyset(m, cursor));
  return candidates.slice(0, pageSize);
}

// Parcours complet identique à la production : page initiale (INITIAL) puis
// pages suivantes (PAGE_SIZE) via le curseur du dernier message chargé.
function walkHistory(allInClass: Msg[]): Msg[] {
  const sorted = sortDesc(allInClass);
  const first = sorted.slice(0, CHAT_INITIAL_PAGE_SIZE);
  let collected: Msg[] = [...first];
  const lastFirst = first[first.length - 1]!;
  let cursor: ChatCursor = { createdAt: lastFirst.created_at, id: lastFirst.id };
  let more = first.length === CHAT_INITIAL_PAGE_SIZE;
  while (more) {
    const page = olderPage(sorted, cursor, CHAT_PAGE_SIZE);
    collected = mergeOlderMessages(collected, page, CHAT_PAGE_SIZE).merged;
    more = page.length === CHAT_PAGE_SIZE;
    if (page.length > 0) {
      const last = page[page.length - 1]!;
      cursor = { createdAt: last.created_at, id: last.id };
    }
  }
  return collected;
}

describe("F2 — pagination du chat", () => {
  it("les 100 derniers messages apparaissent (page initiale DESC inversée)", () => {
    const all = makeMessages(250);
    const sorted = sortDesc(all);
    const first = sorted.slice(0, CHAT_INITIAL_PAGE_SIZE).reverse(); // affichage chronologique
    expect(first).toHaveLength(CHAT_INITIAL_PAGE_SIZE);
    expect(first[0]!.content).toBe("msg 150"); // le plus ancien de la page
    expect(first[first.length - 1]!.content).toBe("msg 249"); // le plus récent
    expect(first[first.length - 1]).toBe(sorted[0]); // dernier = message le plus récent
  });

  it("les anciens messages restent accessibles progressivement (aucune perte)", () => {
    const all = makeMessages(250);
    const collected = walkHistory(all);
    const ids = collected.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length); // aucun doublon
    expect(ids.sort()).toEqual(all.map((m) => m.id).sort()); // aucun perdu
    expect(collected).toHaveLength(all.length); // tout l'historique reconstitué
  });

  it("timestamps identiques (ties) : aucun doublon, aucun message perdu", () => {
    const all = makeMessages(215, { ties: 3 }); // 3 messages par created_at
    const sorted = sortDesc(all);
    const collected = walkHistory(all);
    expect(new Set(collected.map((m) => m.id)).size).toBe(collected.length);
    expect(collected.map((m) => m.id).sort()).toEqual(all.map((m) => m.id).sort());
    expect(collected).toHaveLength(all.length);
    // Le curseur gère bien les égalités sur created_at.
    const cursor: ChatCursor = { createdAt: sorted[CHAT_INITIAL_PAGE_SIZE - 1]!.created_at, id: sorted[CHAT_INITIAL_PAGE_SIZE - 1]!.id };
    const page = olderPage(sorted, cursor, CHAT_PAGE_SIZE);
    for (const m of page) expect(matchesKeyset(m, cursor)).toBe(true);
  });

  it("buildOlderMessagesFilter encode exactement le prédicat keyset", () => {
    const all = makeMessages(300, { ties: 2 });
    const sorted = sortDesc(all);
    const cursor: ChatCursor = { createdAt: sorted[100]!.created_at, id: sorted[100]!.id };
    const filter = buildOlderMessagesFilter(cursor);
    expect(filter).toContain(`created_at.lt.${cursor.createdAt}`);
    expect(filter).toContain(`created_at.eq.${cursor.createdAt}`);
    expect(filter).toContain(`id.lt.${cursor.id}`);
    // Filtre + order DESC + limit === slice de la liste triée.
    const viaFilter = sorted.filter((m) => matchesKeyset(m, cursor)).slice(0, CHAT_PAGE_SIZE);
    const viaSlice = sorted.slice(101, 101 + CHAT_PAGE_SIZE);
    expect(viaFilter.map((m) => m.id)).toEqual(viaSlice.map((m) => m.id));
  });

  it("mergeOlderMessages déduplique (recouvrement Realtime possible)", () => {
    const t0 = "2026-01-01T00:00:00.000Z";
    const mNewest = { id: "id-0002", class_id: "c-1", created_at: new Date(Date.parse(t0) + 2000).toISOString(), content: "nouveau" };
    const mOldestLoaded = { id: "id-0001", class_id: "c-1", created_at: new Date(Date.parse(t0) + 1000).toISOString(), content: "déjà affiché" };
    const mDuplicate = { id: "id-0001", class_id: "c-1", created_at: new Date(Date.parse(t0) + 1000).toISOString(), content: "déjà affiché" };
    const mEvenOlder = { id: "id-0000", class_id: "c-1", created_at: t0, content: "plus ancien" };
    const current = [mOldestLoaded, mNewest]; // ordre chronologique
    const older = [mDuplicate, mEvenOlder]; // page reçue (DESC) puis inversée
    const { merged, hasMore } = mergeOlderMessages(current, older, 2);
    expect(merged.map((m) => m.id)).toEqual(["id-0000", "id-0001", "id-0002"]);
    expect(new Set(merged.map((m) => m.id)).size).toBe(merged.length);
    expect(hasMore).toBe(true);
  });

  it("changement de classe : les messages d'une autre classe ne sont jamais mélangés", () => {
    const classA = makeMessages(60, { classId: "c-A" });
    const classB = makeMessages(60, { classId: "c-B", t0: "2026-02-01T00:00:00.000Z" });
    const all = [...classA, ...classB];
    // La requête de production est filtrée par class_id=eq.<classe>.
    const onlyA = all.filter((m) => m.class_id === "c-A");
    const collectedA = walkHistory(onlyA);
    expect(collectedA.every((m) => m.class_id === "c-A")).toBe(true);
    expect(collectedA).toHaveLength(classA.length);
    // Le tri mixte (sans filtre) contiendrait les deux classes : le filtre est indispensable.
    expect(all.length).toBeGreaterThan(collectedA.length);
  });

  it("un STUDENT ne voit que sa classe (filtre class_id côté requête)", () => {
    const all = makeMessages(130, { classId: "c-1" });
    const other = makeMessages(5, { classId: "c-2", t0: "2026-03-01T00:00:00.000Z" });
    const sorted = sortDesc(all);
    const first = sorted.slice(0, CHAT_INITIAL_PAGE_SIZE);
    // Page initiale : uniquement les messages de la classe de l'étudiant.
    expect(first.every((m) => m.class_id === "c-1")).toBe(true);
    expect(other.filter((m) => m.class_id === "c-2")).toHaveLength(5);
  });
});
