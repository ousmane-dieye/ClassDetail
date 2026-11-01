import { createClient } from "@/lib/supabase/server";
import { deleteDocumentAction } from "@/actions/documents";
import { canDeleteResource } from "@/lib/business/permissions";
import { RealtimeListSync } from "@/components/RealtimeListSync";
import { PageHeader } from "@/components/PageHeader";
import { FileText, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import {
  DEFAULT_DOCUMENT_SORT,
  isDocumentSortKey,
  type DocumentListItem,
  type DocumentSortKey,
} from "@/lib/documents/listing";

import { CreateDocumentForm } from "@/components/documents/CreateDocumentForm";
import { DocumentsLibrary } from "@/components/documents/DocumentsLibrary";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("class_id, role").eq("id", user!.id).single();

  const canDelete = (d: { class_id: string; author_id: string }) =>
    canDeleteResource(
      { id: user!.id, role: profile?.role ?? "STUDENT", classId: profile?.class_id ?? null },
      d.class_id,
      d.author_id
    );

  const classId = profile?.class_id ?? "";

  // 2 requêtes indépendantes → parallélisées (RLS inchangée : classe seule)
  const [{ data: documents, error: documentsError }, { data: subjects, error: subjectsError }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, description, drive_url, class_id, author_id, subject_id, created_at")
      .eq("class_id", classId)
      .order("created_at", { ascending: false }),
    supabase.from("subjects").select("id, name").eq("class_id", classId),
  ]);

  // Tri initial : option de l'URL si elle est valide, sinon le plus récent.
  const initialSort: DocumentSortKey = isDocumentSortKey(searchParams.sort)
    ? searchParams.sort
    : DEFAULT_DOCUMENT_SORT;

  // Incident de chargement : jamais de bibliothèque « vide » présentée à tort.
  const loadError = documentsError || subjectsError
    ? "Chargement des documents impossible. Réessayez dans un instant."
    : null;

  // Mappeage applicatif subject_id → nom de la matière (pas de jointure
  // PostgREST, convention du projet) : le nom est ensuite cherchable côté client.
  // L'autorisation de suppression est pré-calculée ici avec la matrice
  // inchangée (canDeleteResource) — le client n'infère jamais une permission.
  const subjectNames = new Map((subjects ?? []).map((s) => [s.id, s.name]));
  const items: DocumentListItem[] = (documents ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    createdAt: d.created_at,
    driveUrl: d.drive_url,
    subjectName: (d.subject_id && subjectNames.get(d.subject_id)) || null,
    canDelete: canDelete(d),
  }));

  return (
    <div className="space-y-8 animate-fade-in">
      <RealtimeListSync table="documents" filter={`class_id=eq.${profile?.class_id ?? ""}`} events={["INSERT", "DELETE"]} />

      {/* Header */}
      <PageHeader
        icon={FileText}
        title="Bibliothèque de Documents"
        description="Partagez et consultez tous les cours, TD, TP et polycopiés de la classe."
        badge={`${items.length} ressource(s)`}
      />

      {/* Formulaire de dépôt de document (dépliable) */}
      {!loadError && (
        <details className="group">
          <summary className="inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-subtle transition-all duration-150 hover:bg-primary/90 hover:shadow-lift active:scale-[0.98]">
            <Plus size={18} />
            <span>Déposer un document</span>
          </summary>

          <div className="mt-4">
            <Card className="border-primary/20">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
                  <Plus size={18} className="text-primary" />
                  <span>Nouveau document</span>
                </div>

                <CreateDocumentForm classId={profile!.class_id!} subjects={subjects ?? []} />
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
        <DocumentsLibrary
          documents={items}
          onDelete={deleteDocumentAction}
          initialQuery={typeof searchParams.q === "string" ? searchParams.q : ""}
          initialSort={initialSort}
        />
      )}
    </div>
  );
}
