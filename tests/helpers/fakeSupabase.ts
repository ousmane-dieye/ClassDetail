/**
 * Fake Supabase minimal pour les tests (env node, aucun réseau).
 *
 * Reproduit UNIQUEMENT les chaînes réellement utilisées par le code testé :
 *   - select().eq() / .in() / .is() / .order() / .limit() → thenable {data, error}
 *   - insert() → thenable {error} et .select().single() (NotificationService)
 *   - erreurs injectables en lecture (state.readErrors) ou en écriture
 *     (state.insertErrors) pour tester les comportements dégradés.
 *
 * ⚠️ Aucune donnée réelle, aucun envoi réseau, aucun email.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface FakeSupabaseState {
  /** Lignes par table (les requêtes SELECT lisent et les INSERT écrivent ici). */
  tables: Record<string, Array<Record<string, any>>>;
  /** table → message d'erreur pour un SELECT. */
  readErrors?: Record<string, string>;
  /** table → message d'erreur pour un INSERT. */
  insertErrors?: Record<string, string>;
  /** table → colonnes formant une contrainte d'unicité (échec si doublon). */
  uniqueKeys?: Record<string, string[]>;
}

export function createFakeState(
  seed: Partial<Record<string, Array<Record<string, any>>>> = {},
  extra: Partial<Pick<FakeSupabaseState, "readErrors" | "insertErrors" | "uniqueKeys">> = {}
): FakeSupabaseState {
  const tables: Record<string, Array<Record<string, any>>> = {};
  for (const [table, rows] of Object.entries(seed)) {
    tables[table] = rows ?? [];
  }
  return { tables, ...extra };
}

export function createFakeSupabaseClient(state: FakeSupabaseState): SupabaseClient {
  function rowsOf(table: string): Array<Record<string, any>> {
    if (!state.tables[table]) state.tables[table] = [];
    return state.tables[table]!;
  }

  function insertInto(table: string, payload: any): { data: any; error: any; rows: any[] } {
    const message = state.insertErrors?.[table];
    if (message) return { data: null, error: { message }, rows: [] };
    const items = Array.isArray(payload) ? payload : [payload];

    // Contrainte d'unicité simulée (ex: task_reminders_sent unique (task_id, student_id, kind)).
    const uniqueKeys = state.uniqueKeys?.[table];
    if (uniqueKeys?.length) {
      for (const item of items) {
        const conflict = rowsOf(table).some((row) =>
          uniqueKeys.every((key) => row[key] === item[key])
        );
        if (conflict) {
          return {
            data: null,
            error: { message: `duplicate key value violates unique constraint on ${table}`, code: "23505" },
            rows: [],
          };
        }
      }
    }

    for (const item of items) rowsOf(table).push(item);
    return { data: null, error: null, rows: items };
  }

  function selectQuery(table: string) {
    const conditions: Array<(row: Record<string, any>) => boolean> = [];
    let max = Number.POSITIVE_INFINITY;

    const query: any = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        conditions.push((row) => row[column] === value);
        return query;
      },
      neq: (column: string, value: unknown) => {
        conditions.push((row) => row[column] !== value);
        return query;
      },
      is: (column: string, value: unknown) => {
        conditions.push((row) => (row[column] ?? null) === value);
        return query;
      },
      in: (column: string, values: unknown[]) => {
        conditions.push((row) => values.includes(row[column]));
        return query;
      },
      order: () => query,
      limit: (n: number) => {
        max = n;
        return query;
      },
      single: async () => {
        const data = rowsOf(table).find((row) => conditions.every((c) => c(row))) ?? null;
        return { data, error: data ? null : { message: "Aucune ligne" } };
      },
      maybeSingle: async () => {
        const data = rowsOf(table).find((row) => conditions.every((c) => c(row))) ?? null;
        return { data, error: null };
      },
      then: (
        onfulfilled: (value: { data: any; error: any }) => any,
        onrejected?: (reason: unknown) => any
      ) => {
        const readError = state.readErrors?.[table];
        if (readError) {
          return Promise.resolve({ data: null, error: { message: readError } }).then(
            onfulfilled,
            onrejected
          );
        }
        const data = rowsOf(table)
          .filter((row) => conditions.every((c) => c(row)))
          .slice(0, max);
        return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
      },
    };

    return query;
  }

  const client = {
    from(table: string) {
      return {
        select: () => selectQuery(table),
        insert: (payload: any) => {
          const result = insertInto(table, payload);
          return {
            select: () => ({
              single: async () => ({
                data: result.error ? null : { id: `${table}-${result.rows.length}` },
                error: result.error,
              }),
            }),
            then: (
              onfulfilled: (value: { data: any; error: any }) => any,
              onrejected?: (reason: unknown) => any
            ) => Promise.resolve({ data: result.data, error: result.error }).then(onfulfilled, onrejected),
          };
        },
        upsert: (payload: any, _options?: unknown) => {
          const result = insertInto(table, payload);
          return {
            then: (
              onfulfilled: (value: { data: any; error: any }) => any,
              onrejected?: (reason: unknown) => any
            ) => Promise.resolve({ data: result.data, error: result.error }).then(onfulfilled, onrejected),
          };
        },
        delete: () => ({
          eq: () => ({
            then: (
              onfulfilled: (value: { data: any; error: any }) => any,
              onrejected?: (reason: unknown) => any
            ) => Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected),
          }),
        }),
      };
    },
  };

  return client as unknown as SupabaseClient;
}
