import { createClient } from "@/lib/supabase/server";
import { createHintAction, deleteHintAction } from "@/actions/hints";
import { RealtimeListSync } from "@/components/RealtimeListSync";
import { PageHeader } from "@/components/PageHeader";
import { Lightbulb, ExternalLink, Plus, Trash2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { CS_IMAGES } from "@/lib/constants/images";

export default async function HintsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("class_id").eq("id", user!.id).single();

  const { data: hints } = await supabase
    .from("hints")
    .select("*")
    .eq("class_id", profile?.class_id ?? "")
    .order("year", { ascending: false });

  const { data: subjects } = await supabase.from("subjects").select("id, name").eq("class_id", profile?.class_id ?? "");

  return (
    <div className="space-y-8 animate-fade-in">
      <RealtimeListSync table="hints" filter={`class_id=eq.${profile?.class_id ?? ""}`} events={["INSERT", "DELETE"]} />

      {/* Header */}
      <PageHeader
        icon={Lightbulb}
        title="Hints — Annales & Sujets"
        description="Anciens devoirs, contrôles et sujets d'examens des promotions précédentes."
        badge={`${(hints ?? []).length} sujet(s) disponible(s)`}
      />

      {/* Formulaire de création de Hint (dépliable) */}
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

              <form action={async (fd) => { "use server"; await createHintAction(fd); }} className="grid gap-4 md:grid-cols-2">
                <input type="hidden" name="classId" value={profile!.class_id!} />
                <Input name="title" placeholder="Titre du sujet (ex: Examen Final Systèmes d'Exploitation)" required />
                
                <Select name="subjectId" required defaultValue="">
                  <option value="">Sélectionner une matière</option>
                  {(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>

                <Input name="year" placeholder="Année académique (ex: 2024-2025)" required />
                
                <Select name="type" required defaultValue="">
                  <option value="">Sélectionner le type (ex: Examen, Devoir...)</option>
                  {["DEVOIR", "EXAMEN", "CONTROLE", "TP", "PROJET", "AUTRE"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>


                <Input name="driveUrl" placeholder="Lien Google Drive du sujet / corrigé" required className="md:col-span-2" />
                
                <Button type="submit" variant="default" className="md:col-span-2 gap-2 h-11 text-base">
                  <Plus size={18} />
                  <span>Publier le Hint</span>
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </details>

      {/* Grille des Hints */}
      <div className="space-y-4">
        {(hints ?? []).length === 0 ? (
          <EmptyState
            imageUrl={CS_IMAGES.emptyDocs}
            title="Aucun Hint disponible"
            description="Aucune annale d'examen ou devoir corrigé n'a encore été publié pour votre classe."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(hints ?? []).map((h) => (
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
                    <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar size={12} />
                      <span>Promotion {h.year}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between pt-3 border-t border-border/60">
                  <span className="text-xs font-semibold text-warning">Annales CS</span>

                  <div className="flex items-center gap-2">
                    <a
                      href={h.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 shadow-subtle"
                    >
                      <span>Consulter</span>
                      <ExternalLink size={12} />
                    </a>

                    {h.author_id === user!.id && (
                      <form action={async () => { "use server"; await deleteHintAction(h.id); }}>
                        <Button size="icon" variant="danger" className="h-8 w-8" title="Supprimer le Hint">
                          <Trash2 size={14} />
                        </Button>
                      </form>
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
