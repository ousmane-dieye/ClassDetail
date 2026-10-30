"use client";

import { useMemo, useState } from "react";
import { Calendar, PlayCircle, Search, X } from "lucide-react";

import { ConfirmDeleteButton, type DeleteActionResponse } from "@/components/ConfirmDeleteButton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CS_IMAGES } from "@/lib/constants/images";
import {
  DEFAULT_RECORDING_SORT,
  RECORDING_SORT_OPTIONS,
  filterRecordings,
  formatRecordingCount,
  isRecordingSortKey,
  resolveRecordingLibraryState,
  sortRecordings,
  type RecordingListItem,
  type RecordingSortKey,
} from "@/lib/recordings/listing";

interface RecordingsLibraryProps {
  /** Bibliothèque déjà chargée côté serveur (périmètre RLS appliqué). */
  recordings: RecordingListItem[];
  canManage: boolean;
  /** Server Action de suppression (délégués / admins uniquement). */
  onDelete?: (id: string) => Promise<DeleteActionResponse>;
  initialQuery?: string;
  initialSort?: RecordingSortKey;
}

/**
 * Bibliothèque « Cours enregistrés » : barre de recherche + sélecteur de tri
 * au-dessus de la grille. Le filtrage est local (aucune requête réseau par
 * frappe) et le tri est un état indépendant : changer la recherche ne
 * réinitialise jamais le tri choisi.
 */
export function RecordingsLibrary({
  recordings,
  canManage,
  onDelete,
  initialQuery = "",
  initialSort = DEFAULT_RECORDING_SORT,
}: RecordingsLibraryProps) {
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState<RecordingSortKey>(
    isRecordingSortKey(initialSort) ? initialSort : DEFAULT_RECORDING_SORT
  );

  const total = recordings.length;
  const hasQuery = query.trim().length > 0;

  const visible = useMemo(
    () => sortRecordings(filterRecordings(recordings, query), sort),
    [recordings, query, sort]
  );

  const state = resolveRecordingLibraryState(total, visible.length);

  return (
    <div className="space-y-4">
      {/* ── Recherche + tri + compteur (compact, sans débordement mobile) ── */}
      {state !== "empty" && (
        <Card hoverEffect={false} className="border-border/80">
          <CardContent className="flex flex-col gap-2.5 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-3.5">
            <div className="relative min-w-0 flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un cours, une matière…"
                aria-label="Rechercher un cours enregistré"
                className="pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
              />
              {hasQuery && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Effacer la recherche"
                  title="Effacer la recherche"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="w-full shrink-0 sm:w-56">
              <Select
                aria-label="Trier les cours enregistrés"
                value={sort}
                onChange={(e) =>
                  setSort(isRecordingSortKey(e.target.value) ? e.target.value : DEFAULT_RECORDING_SORT)
                }
              >
                {RECORDING_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <p
              role="status"
              className="shrink-0 text-xs font-medium text-muted-foreground sm:pl-1"
            >
              {formatRecordingCount(visible.length, total, hasQuery)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── États ── */}
      {state === "empty" ? (
        <EmptyState
          imageUrl={CS_IMAGES.emptyDocs}
          title="Aucun cours enregistré"
          description="Les séances de cours enregistrées n'ont pas encore été mises en ligne."
        />
      ) : state === "no-results" ? (
        <EmptyState
          icon={Search}
          title="Aucun résultat"
          description={`Aucun cours enregistré ne correspond à « ${query.trim()} ». Vérifiez l'orthographe ou essayez un autre terme.`}
          action={
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setQuery("")}>
              <X size={14} />
              <span>Effacer la recherche</span>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((r) => (
            <Card
              key={r.id}
              className="flex flex-col justify-between overflow-hidden transition-all hover:border-primary/25 hover:shadow-lift"
            >
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-info/15 text-info">
                    <PlayCircle size={26} />
                  </div>
                  <Badge variant="outline" className="text-xs">
                    <Calendar size={12} className="mr-1 inline" />
                    {formatSessionDate(r.date)}
                  </Badge>
                </div>

                <div>
                  {r.subjectName && (
                    <p className="mb-0.5 truncate text-xs font-semibold text-primary">{r.subjectName}</p>
                  )}
                  <h3 className="font-bold text-foreground line-clamp-2">{r.title}</h3>
                  {r.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {r.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 pt-3 border-t border-border/60 bg-muted/20">
                <span className="text-xs font-medium text-muted-foreground">Vidéo HD</span>

                <div className="flex items-center gap-2">
                  <a
                    href={r.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 shadow-subtle"
                  >
                    <PlayCircle size={14} />
                    <span>Visionner</span>
                  </a>

                  {canManage && onDelete && (
                    <ConfirmDeleteButton
                      action={onDelete}
                      resourceId={r.id}
                      resourceName={r.title}
                      resourceLabel="cet enregistrement"
                      successMessage="Cours retiré de votre bibliothèque."
                      buttonTitle="Supprimer la vidéo"
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

/**
 * Date de séance formatée sans dépendre du fuseau ni de la locale de
 * l'exécution : la saisie « YYYY-MM-DD » est interprétée comme une date de
 * calendrier (évite le décalage d'un jour et tout désaccord d'hydratation).
 */
function formatSessionDate(dateYmd: string): string {
  const [year, month, day] = dateYmd.split("-").map(Number);
  if (!year || !month || !day) return dateYmd;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(day)}/${pad(month)}/${year}`;
}
