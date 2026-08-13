import { createClient } from "@/lib/supabase/server";
import { createDocumentAction, deleteDocumentAction } from "@/actions/documents";
import { RealtimeListSync } from "@/components/RealtimeListSync";
import { PageHeader } from "@/components/PageHeader";
import { FileText, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState } from "@/components/ui/EmptyState";
import { CS_IMAGES } from "@/lib/constants/images";

export default async function DocumentsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("class_id").eq("id", user!.id).single();

  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("class_id", profile?.class_id ?? "")
    .order("created_at", { ascending: false });

  const { data: subjects } = await supabase.from("subjects").select("id, name").eq("class_id", profile?.class_id ?? "");

  return (
    <div className="space-y-8 animate-fade-in">
      <RealtimeListSync table="documents" filter={`class_id=eq.${profile?.class_id ?? ""}`} events={["INSERT", "DELETE"]} />

      {/* Header */}
      <PageHeader
        icon={FileText}
        title="Bibliothèque de Documents"
        description="Partagez et consultez tous les cours, TD, TP et polycopiés de la classe."
        badge={`${(documents ?? []).length} ressource(s)`}
      />

      {/* Formulaire de dépôt de document (dépliable) */}
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

              <form action={async (fd) => { "use server"; await createDocumentAction(fd); }} className="grid gap-4 md:grid-cols-2">
                <input type="hidden" name="classId" value={profile!.class_id!} />
                <Input name="title" placeholder="Titre du document (ex: Polycopié Chapitre 3 - TCP/IP)" required />
                
                <Select name="subjectId" required defaultValue="">
                  <option value="">Sélectionner une matière</option>
                  {(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>


                <Input name="driveUrl" placeholder="Lien Google Drive du fichier" required className="md:col-span-2" />
                <Textarea name="description" placeholder="Description courte (optionnel)" className="md:col-span-2" />
                
                <Button type="submit" className="md:col-span-2 gap-2 h-11 text-base">
                  <Plus size={18} />
                  <span>Ajouter le document</span>
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </details>

      {/* Grille des documents */}
      <div className="space-y-4">
        {(documents ?? []).length === 0 ? (
          <EmptyState
            imageUrl={CS_IMAGES.emptyDocs}
            title="Aucun document pour le moment"
            description="La bibliothèque est vide. Soyez le premier à partager un support de cours avec votre promotion !"
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(documents ?? []).map((d) => (
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
                    {d.description && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">{d.description}</p>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between pt-3 border-t border-border/60 text-xs">
                  <span className="text-muted-foreground">
                    {new Date(d.created_at).toLocaleDateString("fr-FR")}
                  </span>

                  <div className="flex items-center gap-2">
                    <a
                      href={d.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 font-semibold text-primary-foreground transition-all hover:bg-primary/90 shadow-subtle"
                    >
                      <span>Ouvrir</span>
                      <ExternalLink size={12} />
                    </a>

                    {d.author_id === user!.id && (
                      <form action={async () => { "use server"; await deleteDocumentAction(d.id); }}>
                        <Button size="icon" variant="danger" className="h-8 w-8" title="Supprimer le document">
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
