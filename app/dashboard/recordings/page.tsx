import { createClient } from "@/lib/supabase/server";
import { createRecordingAction, deleteRecordingAction } from "@/actions/recordings";
import { RealtimeListSync } from "@/components/RealtimeListSync";
import { PageHeader } from "@/components/PageHeader";
import { Video, ExternalLink, Plus, Calendar, PlayCircle } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState } from "@/components/ui/EmptyState";
import { CS_IMAGES } from "@/lib/constants/images";

export default async function RecordingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("class_id, role").eq("id", user!.id).single();

  const classId = profile?.class_id ?? "";

  // 2 requêtes indépendantes → parallélisées
  const [{ data: recordings }, { data: subjects }] = await Promise.all([
    supabase
      .from("recordings")
      .select("id, title, description, date, drive_url, class_id, creator_id, created_at")
      .eq("class_id", classId)
      .order("date", { ascending: false }),
    supabase.from("subjects").select("id, name").eq("class_id", classId),
  ]);
  const canManage = profile?.role === "ADMIN" || profile?.role === "DELEGATE";

  return (
    <div className="space-y-8 animate-fade-in">
      <RealtimeListSync table="recordings" filter={`class_id=eq.${profile?.class_id ?? ""}`} events={["INSERT", "DELETE"]} />

      {/* Header */}
      <PageHeader
        icon={Video}
        title="Cours Enregistrés"
        description="Visionnez les récapitulatifs et séances de cours enregistrées de votre promotion."
        badge={`${(recordings ?? []).length} enregistrement(s)`}
      />

      {/* Formulaire réservé délégués / admins (dépliable) */}
      {canManage && (
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

      {/* Galerie des enregistrements */}
      <div className="space-y-4">
        {(recordings ?? []).length === 0 ? (
          <EmptyState
            imageUrl={CS_IMAGES.emptyDocs}
            title="Aucun cours enregistré"
            description="Les séances de cours enregistrées n'ont pas encore été mises en ligne."
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(recordings ?? []).map((r) => (
              <Card key={r.id} className="flex flex-col justify-between overflow-hidden transition-all hover:border-primary/25 hover:shadow-lift">
                <div className="space-y-3 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-info/15 text-info">
                      <PlayCircle size={26} />
                    </div>
                    <Badge variant="outline" className="text-xs">
                      <Calendar size={12} className="mr-1 inline" />
                      {new Date(r.date).toLocaleDateString("fr-FR")}
                    </Badge>
                  </div>

                  <div>
                    <h3 className="font-bold text-foreground line-clamp-2">{r.title}</h3>
                    {r.description && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">{r.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 pt-3 border-t border-border/60 bg-muted/20">
                  <span className="text-xs font-medium text-muted-foreground">Vidéo HD</span>

                  <div className="flex items-center gap-2">
                    <a
                      href={r.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 shadow-subtle"
                    >
                      <PlayCircle size={14} />
                      <span>Visionner</span>
                    </a>

                    {canManage && (
                      <ConfirmDeleteButton
                        action={deleteRecordingAction}
                        resourceId={r.id}
                        resourceName={r.title}
                        resourceLabel="cet enregistrement"
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
    </div>
  );
}
