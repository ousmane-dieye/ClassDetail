import { createClient } from "@/lib/supabase/server";
import { createRecordingAction, deleteRecordingAction } from "@/actions/recordings";
import { RealtimeListSync } from "@/components/RealtimeListSync";
import { PageHeader } from "@/components/PageHeader";
import { RecordingsLibrary } from "@/components/recordings/RecordingsLibrary";
import { Video, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import {
  DEFAULT_RECORDING_SORT,
  isRecordingSortKey,
  type RecordingListItem,
  type RecordingSortKey,
} from "@/lib/recordings/listing";

export default async function RecordingsPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("class_id, role").eq("id", user!.id).single();

  const classId = profile?.class_id ?? "";

  // 2 requêtes indépendantes → parallélisées (RLS inchangée : classe seule)
  const [{ data: recordings, error: recordingsError }, { data: subjects }] = await Promise.all([
    supabase
      .from("recordings")
      .select("id, title, description, date, drive_url, class_id, subject_id, creator_id, created_at")
      .eq("class_id", classId)
      .order("date", { ascending: false }),
    supabase.from("subjects").select("id, name").eq("class_id", classId),
  ]);
  const canManage = profile?.role === "ADMIN" || profile?.role === "DELEGATE";

  // Tri initial : option de l'URL si elle est valide, sinon le plus récent.
  const initialSort: RecordingSortKey = isRecordingSortKey(searchParams.sort)
    ? searchParams.sort
    : DEFAULT_RECORDING_SORT;

  // Incident de chargement : jamais de bibliothèque « vide » présentée à tort.
  const loadError = recordingsError
    ? "Chargement des cours enregistrés impossible. Réessayez dans un instant."
    : null;

  // Mappeage applicatif subject_id → nom de la matière (pas de jointure
  // PostgREST, convention du projet) : le nom est ensuite cherchable côté client.
  const subjectNames = new Map((subjects ?? []).map((s) => [s.id, s.name]));
  const items: RecordingListItem[] = (recordings ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    date: r.date,
    createdAt: r.created_at,
    driveUrl: r.drive_url,
    subjectName: (r.subject_id && subjectNames.get(r.subject_id)) || null,
  }));

  return (
    <div className="space-y-8 animate-fade-in">
      <RealtimeListSync table="recordings" filter={`class_id=eq.${profile?.class_id ?? ""}`} events={["INSERT", "DELETE"]} />

      {/* Header */}
      <PageHeader
        icon={Video}
        title="Cours Enregistrés"
        description="Visionnez les récapitulatifs et séances de cours enregistrées de votre promotion."
        badge={`${items.length} enregistrement(s)`}
      />

      {/* Formulaire réservé délégués / admins (dépliable) */}
      {canManage && !loadError && (
        <details className="group">
          <summary className="inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-subtle transition-all duration-150 hover:bg-primary/90 hover:shadow-lift active:scale-[0.98]">
            <Plus size={18} />
            <span>Publier un enregistrement de cours</span>
          </summary>

          <div className="mt-4">
            <Card className="border-info/25">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
                  <Plus size={18} className="text-info" />
                  <span>Nouvel enregistrement de cours</span>
                </div>

                <form action={async (fd) => { "use server"; await createRecordingAction(fd); }} className="grid gap-4 md:grid-cols-2">
                  <input type="hidden" name="classId" value={profile!.class_id!} />
                  <Input name="title" placeholder="Titre de la séance (ex: Cours Algorithmique Avancée)" required />

                  <Select name="subjectId" required defaultValue="">
                    <option value="">Sélectionner une matière</option>
                    {(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>


                  <Input name="date" type="date" required />
                  <Input name="driveUrl" placeholder="Lien Google Drive de la vidéo" required />
                  <Textarea name="description" placeholder="Chapitres et points abordés..." className="md:col-span-2" />

                  <Button type="submit" className="md:col-span-2 gap-2 h-11 text-base">
                    <Plus size={18} />
                    <span>Publier le cours enregistré</span>
                  </Button>
                </form>
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

      {/* Galerie : recherche, tri et états (client, sans rechargement de page) */}
      {!loadError && (
        <RecordingsLibrary
          recordings={items}
          canManage={canManage}
          onDelete={deleteRecordingAction}
          initialQuery={typeof searchParams.q === "string" ? searchParams.q : ""}
          initialSort={initialSort}
        />
      )}
    </div>
  );
}
