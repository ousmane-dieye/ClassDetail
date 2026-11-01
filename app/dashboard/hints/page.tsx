import { createClient } from "@/lib/supabase/server";
import { deleteHintAction } from "@/actions/hints";
import { canDeleteResource } from "@/lib/business/permissions";
import { RealtimeListSync } from "@/components/RealtimeListSync";
import { PageHeader } from "@/components/PageHeader";
import { Lightbulb, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import {
  DEFAULT_HINT_SORT,
  isHintSortKey,
  type HintListItem,
  type HintSortKey,
} from "@/lib/hints/listing";

import { CreateHintForm } from "@/components/hints/CreateHintForm";
import { HintsLibrary } from "@/components/hints/HintsLibrary";

export default async function HintsPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("class_id, role").eq("id", user!.id).single();

  const canDelete = (h: { class_id: string; author_id: string }) =>
    canDeleteResource(
      { id: user!.id, role: profile?.role ?? "STUDENT", classId: profile?.class_id ?? null },
      h.class_id,
      h.author_id
    );

  const classId = profile?.class_id ?? "";

  // 2 requêtes indépendantes → parallélisées (RLS inchangée : classe seule)
  const [{ data: hints, error: hintsError }, { data: subjects, error: subjectsError }] = await Promise.all([
    supabase
      .from("hints")
      .select("id, title, year, type, drive_url, class_id, author_id, subject_id, created_at")
      .eq("class_id", classId)
      .order("year", { ascending: false }),
    supabase.from("subjects").select("id, name").eq("class_id", classId),
  ]);

  // Tri initial : option de l'URL si elle est valide, sinon le plus récent
  // (promotion la plus récente, comme l'ordre serveur historique).
  const initialSort: HintSortKey = isHintSortKey(searchParams.sort)
    ? searchParams.sort
    : DEFAULT_HINT_SORT;

  // Incident de chargement : jamais de bibliothèque « vide » présentée à tort.
  const loadError = hintsError || subjectsError
    ? "Chargement des hints impossible. Réessayez dans un instant."
    : null;

  // Mappeage applicatif subject_id → nom de la matière (pas de jointure
  // PostgREST, convention du projet) : le nom est ensuite cherchable côté client.
  // L'autorisation de suppression est pré-calculée ici avec la matrice
  // inchangée (canDeleteResource) — le client n'infère jamais une permission.
  const subjectNames = new Map((subjects ?? []).map((s) => [s.id, s.name]));
  const items: HintListItem[] = (hints ?? []).map((h) => ({
    id: h.id,
    title: h.title,
    year: h.year,
    type: h.type,
    createdAt: h.created_at,
    driveUrl: h.drive_url,
    subjectName: (h.subject_id && subjectNames.get(h.subject_id)) || null,
    canDelete: canDelete(h),
  }));

  return (
    <div className="space-y-8 animate-fade-in">
      <RealtimeListSync table="hints" filter={`class_id=eq.${profile?.class_id ?? ""}`} events={["INSERT", "DELETE"]} />

      {/* Header */}
      <PageHeader
        icon={Lightbulb}
        title="Hints — Annales & Sujets"
        description="Anciens devoirs, contrôles et sujets d'examens des promotions précédentes."
        badge={`${items.length} sujet(s) disponible(s)`}
      />

      {/* Formulaire de création de Hint (dépliable) */}
      {!loadError && (
        <details className="group">
          <summary className="inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-subtle transition-all duration-150 hover:bg-primary/90 hover:shadow-lift active:scale-[0.98]">
            <Plus size={18} />
            <span>Ajouter un Hint / Sujet d'examen</span>
          </summary>

          <div className="mt-4">
            <Card className="border-warning/25">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
                  <Plus size={18} className="text-warning" />
                  <span>Nouveau Hint / Sujet d'examen</span>
                </div>

                <CreateHintForm classId={profile!.class_id!} subjects={subjects ?? []} />
              </CardContent>
            </Card>
          </div>
        </details>
      )}

      {/* Erreur de chargement : message compréhensible, pas de faux « vide » */}
      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/8 px-4 py-3 text-sm font-semibold text-danger"
        >
          {loadError}
        </div>
      )}

      {/* Bibliothèque : recherche, tri et états (client, sans rechargement de page) */}
      {!loadError && (
        <HintsLibrary
          hints={items}
          onDelete={deleteHintAction}
          initialQuery={typeof searchParams.q === "string" ? searchParams.q : ""}
          initialSort={initialSort}
        />
      )}
    </div>
  );
}
