"use client";

import { useMemo, useState } from "react";
import { ExternalLink, FileText, Search, X } from "lucide-react";

import { ConfirmDeleteButton, type DeleteActionResponse } from "@/components/ConfirmDeleteButton";
import { LibraryControls } from "@/components/LibraryControls";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CS_IMAGES } from "@/lib/constants/images";
import {
  DEFAULT_DOCUMENT_SORT,
  DOCUMENT_SORT_OPTIONS,
  filterDocuments,
  formatDocumentCount,
  isDocumentSortKey,
  resolveDocumentLibraryState,
  sortDocuments,
  type DocumentListItem,
  type DocumentSortKey,
} from "@/lib/documents/listing";

interface DocumentsLibraryProps {
  /** Bibliothèque déjà chargée côté serveur (périmètre RLS appliqué). */
  documents: DocumentListItem[];
  /** Server Action de suppression (délégués / admins et auteurs uniquement). */
  onDelete?: (id: string) => Promise<DeleteActionResponse>;
  initialQuery?: string;
  initialSort?: DocumentSortKey;
}

/**
 * Bibliothèque « Documents » : barre de recherche + sélecteur de tri au-dessus
 * de la grille (mêmes conventions que « Cours enregistrés »). Le filtrage est
 * local (aucune requête réseau par frappe) et le tri est un état indépendant :
 * changer la recherche ne réinitialise jamais le tri choisi.
 */
export function DocumentsLibrary({
  documents,
  onDelete,
  initialQuery = "",
  initialSort = DEFAULT_DOCUMENT_SORT,
}: DocumentsLibraryProps) {
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState<DocumentSortKey>(
    isDocumentSortKey(initialSort) ? initialSort : DEFAULT_DOCUMENT_SORT
  );

  const total = documents.length;
  const hasQuery = query.trim().length > 0;

  const visible = useMemo(
    () => sortDocuments(filterDocuments(documents, query), sort),
    [documents, query, sort]
  );

  const state = resolveDocumentLibraryState(total, visible.length);

  return (
    <div className="space-y-4">
      {/* ── Recherche + tri + compteur (compact, sans débordement mobile) ── */}
      {state !== "empty" && (
        <LibraryControls
          query={query}
          onQueryChange={setQuery}
          searchPlaceholder="Rechercher un document, une matière…"
          searchLabel="Rechercher un document"
          sort={sort}
          sortOptions={DOCUMENT_SORT_OPTIONS}
          onSortChange={(value) =>
            setSort(isDocumentSortKey(value) ? value : DEFAULT_DOCUMENT_SORT)
          }
          sortLabel="Trier les documents"
          countLabel={formatDocumentCount(visible.length, total, hasQuery)}
        />
      )}

      {/* ── États ── */}
      {state === "empty" ? (
        <EmptyState
          imageUrl={CS_IMAGES.emptyDocs}
          title="Aucun document pour le moment"
          description="La bibliothèque est vide. Soyez le premier à partager un support de cours avec votre promotion !"
        />
      ) : state === "no-results" ? (
        <EmptyState
          icon={Search}
          title="Aucun résultat"
          description={`Aucun document ne correspond à « ${query.trim()} ». Vérifiez l'orthographe ou essayez un autre terme.`}
          action={
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setQuery("")}>
              <X size={14} />
              <span>Effacer la recherche</span>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((d) => (
            <Card key={d.id} className="flex flex-col justify-between p-5 transition-all hover:border-primary/25 hover:shadow-lift">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <FileText size={24} />
                  </div>
                  <Badge variant="outline" className="text-[11px]">Drive</Badge>
                </div>

                <div>
                  <h3 className="font-bold text-foreground line-clamp-2">{d.title}</h3>
                  {d.subjectName && (
                    <p className="mt-1 text-xs font-semibold text-primary">{d.subjectName}</p>
                  )}
                  {d.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">{d.description}</p>
                  )}
                </div>
              </div>

              <div className="mt-6 flex items-start justify-between pt-3 border-t border-border/60 text-xs">
                <span className="text-muted-foreground">
                  {formatPublicationDate(d.createdAt)}
                </span>

                <div className="flex items-center gap-2">
                  <a
                    href={d.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 font-semibold text-primary-foreground transition-all hover:bg-primary/90 shadow-subtle"
                  >
                    <span>Ouvrir</span>
                    <ExternalLink size={12} />
                  </a>

                  {d.canDelete && onDelete && (
                    <ConfirmDeleteButton
                      action={onDelete}
                      resourceId={d.id}
                      resourceName={d.title}
                      resourceLabel="ce document"
                      successMessage="Document supprimé avec succès."
                      buttonTitle="Supprimer le document"
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
 * Date de dépôt formatée sans dépendre du fuseau ni de la locale
 * d'exécution (évite tout désaccord d'hydratation serveur / client) :
 * la partie date de l'horodatage ISO est interprétée telle quelle,
 * selon la même convention que `formatSessionDate` (Cours enregistrés).
 */
function formatPublicationDate(isoTimestamp: string): string {
  const [year, month, day] = isoTimestamp.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return isoTimestamp;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(day)}/${pad(month)}/${year}`;
}
