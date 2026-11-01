"use client";

import { Search, X } from "lucide-react";

import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export interface LibrarySortOption {
  value: string;
  label: string;
}

interface LibraryControlsProps {
  /** Recherche pilotée par la bibliothèque parente (état unique). */
  query: string;
  onQueryChange: (query: string) => void;
  searchPlaceholder: string;
  /** Libellé accessibilité (aria-label) du champ de recherche. */
  searchLabel: string;
  /** Clé de tri courante (validée par le module parent). */
  sort: string;
  sortOptions: readonly LibrarySortOption[];
  onSortChange: (value: string) => void;
  /** Libellé accessibilité (aria-label) du sélecteur de tri. */
  sortLabel: string;
  /** Compteur déjà formaté (ex : « 2 sur 5 résultat(s) »). */
  countLabel: string;
}

/**
 * Barre « recherche + tri + compteur » partagée par les bibliothèques
 * Documents et Hints & Sujets. Même présentation, mêmes composants UI et
 * mêmes conventions (papier & encre, clair / sombre, responsive mobile) que
 * la barre de « Cours enregistrés ».
 *
 * Composant entièrement contrôlé : aucun état local, l'état vit dans la
 * bibliothèque qui l'emploie — la recherche et le tri restent donc actifs
 * ensemble et ne se réinitialisent jamais l'un l'autre.
 */
export function LibraryControls({
  query,
  onQueryChange,
  searchPlaceholder,
  searchLabel,
  sort,
  sortOptions,
  onSortChange,
  sortLabel,
  countLabel,
}: LibraryControlsProps) {
  const hasQuery = query.trim().length > 0;

  return (
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
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            className="pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
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
            aria-label={sortLabel}
            value={sort}
            onChange={(e) => onSortChange(e.target.value)}
          >
            {sortOptions.map((option) => (
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
          {countLabel}
        </p>
      </CardContent>
    </Card>
  );
}
