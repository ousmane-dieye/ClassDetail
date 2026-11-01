"use client";

import { useMemo, useState } from "react";
import { Calendar, ExternalLink, Lightbulb, Search, X } from "lucide-react";

import { ConfirmDeleteButton, type DeleteActionResponse } from "@/components/ConfirmDeleteButton";
import { LibraryControls } from "@/components/LibraryControls";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CS_IMAGES } from "@/lib/constants/images";
import {
  DEFAULT_HINT_SORT,
  HINT_SORT_OPTIONS,
  filterHints,
  formatHintCount,
  isHintSortKey,
  resolveHintLibraryState,
  sortHints,
  type HintListItem,
  type HintSortKey,
} from "@/lib/hints/listing";

interface HintsLibraryProps {
  /** Bibliothèque déjà chargée côté serveur (périmètre RLS appliqué). */
  hints: HintListItem[];
  /** Server Action de suppression (délégués / admins et auteurs uniquement). */
  onDelete?: (id: string) => Promise<DeleteActionResponse>;
  initialQuery?: string;
  initialSort?: HintSortKey;
}

/**
 * Bibliothèque « Hints & Sujets » : barre de recherche + sélecteur de tri
 * au-dessus de la grille (mêmes conventions que « Cours enregistrés »). Le
 * filtrage est local (aucune requête réseau par frappe) et le tri est un état
 * indépendant : changer la recherche ne réinitialise jamais le tri choisi.
 */
export function HintsLibrary({
  hints,
  onDelete,
  initialQuery = "",
  initialSort = DEFAULT_HINT_SORT,
}: HintsLibraryProps) {
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState<HintSortKey>(
    isHintSortKey(initialSort) ? initialSort : DEFAULT_HINT_SORT
  );

  const total = hints.length;
  const hasQuery = query.trim().length > 0;

  const visible = useMemo(
    () => sortHints(filterHints(hints, query), sort),
    [hints, query, sort]
  );

  const state = resolveHintLibraryState(total, visible.length);

  return (
    <div className="space-y-4">
      {/* ── Recherche + tri + compteur (compact, sans débordement mobile) ── */}
      {state !== "empty" && (
        <LibraryControls
          query={query}
          onQueryChange={setQuery}
          searchPlaceholder="Rechercher un sujet, une matière…"
          searchLabel="Rechercher un sujet"
          sort={sort}
          sortOptions={HINT_SORT_OPTIONS}
          onSortChange={(value) =>
            setSort(isHintSortKey(value) ? value : DEFAULT_HINT_SORT)
          }
          sortLabel="Trier les sujets"
          countLabel={formatHintCount(visible.length, total, hasQuery)}
        />
      )}

      {/* ── États ── */}
      {state === "empty" ? (
        <EmptyState
          imageUrl={CS_IMAGES.emptyDocs}
          title="Aucun Hint disponible"
          description="Aucune annale d'examen ou devoir corrigé n'a encore été publié pour votre classe."
        />
      ) : state === "no-results" ? (
        <EmptyState
          icon={Search}
          title="Aucun résultat"
          description={`Aucun sujet ne correspond à « ${query.trim()} ». Vérifiez l'orthographe ou essayez un autre terme.`}
          action={
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setQuery("")}>
              <X size={14} />
              <span>Effacer la recherche</span>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((h) => (
            <Card key={h.id} className="flex flex-col justify-between p-5 transition-all hover:border-warning/40 hover:shadow-lift">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-warning/15 text-warning">
                    <Lightbulb size={24} />
                  </div>
                  <Badge variant="warning">{h.type}</Badge>
                </div>

                <div>
                  <h3 className="font-bold text-foreground line-clamp-2">{h.title}</h3>
                  {h.subjectName && (
                    <p className="mt-1 text-xs font-semibold text-primary">{h.subjectName}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar size={12} />
                    <span>Promotion {h.year}</span>
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-start justify-between pt-3 border-t border-border/60">
                <span className="text-xs font-semibold text-warning">Annales CS</span>

                <div className="flex items-center gap-2">
                  <a
                    href={h.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 shadow-subtle"
                  >
                    <span>Consulter</span>
                    <ExternalLink size={12} />
                  </a>

                  {h.canDelete && onDelete && (
                    <ConfirmDeleteButton
                      action={onDelete}
                      resourceId={h.id}
                      resourceName={h.title}
                      resourceLabel="ce hint"
                      successMessage="Hint supprimé avec succès."
                      buttonTitle="Supprimer le Hint"
                      className="h-8 w-8"
                      iconSize={14}
                    />
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
