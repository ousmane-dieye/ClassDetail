"use client";

import { useRealtimeRefresh } from "@/lib/realtime/hooks";

/**
 * Synchronisation temps réel d'une liste (page serveur).
 * Rend `null` : ne fait que s'abonner aux changements postgres et rafraîchir
 * la route courante sans F5, puis s'arrêter.
 */
export function RealtimeListSync({ table, filter, events }: { table: string; filter?: string; events?: Array<"INSERT" | "UPDATE" | "DELETE"> }) {
  useRealtimeRefresh({ table, filter, events });
  return null;
}
