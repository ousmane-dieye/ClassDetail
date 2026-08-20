// F2 — Pagination du chat par curseur (created_at + id).
//
// Ordre total stable : `created_at DESC, id DESC`.
// Un message est « strictement antérieur » à un curseur (c, i) si :
//   created_at < c   OR   (created_at = c AND id < i)
// Ce prédicat keyset partitionne l'ensemble des messages sans doublon ni
// perte, y compris quand plusieurs messages partagent le même created_at.

export const CHAT_INITIAL_PAGE_SIZE = 50;
export const CHAT_PAGE_SIZE = 30;

export interface ChatCursor {
  createdAt: string;
  id: string;
}

export function buildOlderMessagesFilter(oldest: ChatCursor): string {
  return `created_at.lt.${oldest.createdAt},and(created_at.eq.${oldest.createdAt},id.lt.${oldest.id})`;
}

export function mergeOlderMessages<T extends { id: string }>(
  current: T[],
  older: T[],
  pageSize: number
): { merged: T[]; hasMore: boolean } {
  const ids = new Set(current.map((p) => p.id));
  const fresh = older.filter((m) => !ids.has(m.id));
  return { merged: [...fresh, ...current], hasMore: older.length === pageSize };
}
