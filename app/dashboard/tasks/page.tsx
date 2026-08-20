import { createClient } from "@/lib/supabase/server";
import { TaskCard } from "@/components/TaskCard";
import { createTaskAction, deleteTaskAction, updateTaskAction } from "@/actions/tasks";
import { RealtimeListSync } from "@/components/RealtimeListSync";
import { PageHeader } from "@/components/PageHeader";
import { CheckSquare, Plus, Trash2, Edit3, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState } from "@/components/ui/EmptyState";
import { CS_IMAGES } from "@/lib/constants/images";

const TASK_TYPES = ["EXERCISE", "TP", "ASSIGNMENT", "RESEARCH", "PROJECT", "OTHER"];

function toDateTimeLocal(date: string): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function TasksPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("class_id, role").eq("id", user!.id).single();

  const classId = profile?.class_id ?? "";
  const canManage = profile?.role === "ADMIN" || profile?.role === "DELEGATE";

  // 3 requêtes indépendantes après profile → parallélisées
  const [{ data: tasks }, { data: subjects }, { data: myCompletions }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, type, due_date, class_id, subject_id, description, attachment_link, is_expired, created_at")
      .eq("class_id", classId)
      .order("due_date", { ascending: true }),
    supabase
      .from("subjects")
      .select("id, name")
      .eq("class_id", classId),
    supabase
      .from("task_completions")
      .select("task_id")
      .eq("student_id", user!.id),
  ]);
  const completedIds = new Set((myCompletions ?? []).map((c) => c.task_id));

  const taskIds = (tasks ?? []).map((t) => t.id);

  let classStudents: any[] = [];
  let allCompletions: any[] = [];

  if (canManage) {
    const [{ data: studentsData }, { data: completionsData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("class_id", classId)
        .in("role", ["STUDENT", "DELEGATE"]),
      taskIds.length > 0
        ? supabase
            .from("task_completions")
            .select("task_id, student_id")
            .in("task_id", taskIds)
        : Promise.resolve({ data: [] }),
    ]);
    classStudents = (studentsData ?? []) as any[];
    allCompletions = (completionsData ?? []) as any[];
  }

  const completionsByTask = new Map<string, Set<string>>();
  for (const c of allCompletions) {
    if (!completionsByTask.has(c.task_id)) completionsByTask.set(c.task_id, new Set());
    completionsByTask.get(c.task_id)!.add(c.student_id);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <RealtimeListSync table="tasks" filter={`class_id=eq.${classId}`} events={["INSERT", "UPDATE", "DELETE"]} />
      <RealtimeListSync table="task_completions" filter={`student_id=eq.${user!.id}`} events={["INSERT", "DELETE"]} />

      {/* Header */}
      <PageHeader
        icon={CheckSquare}
        title="Tâches & Devoirs"
        description="Visualisez et gérez toutes vos échéances académiques."
        badge={`${(tasks ?? []).length} tâche(s) au total`}
      />

      {/* Formulaire de création réservé délégués & admins (dépliable) */}
      {canManage && (
        <details className="group">
          <summary className="inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-subtle transition-all duration-150 hover:bg-primary/90 hover:shadow-lift active:scale-[0.98]">
            <Plus size={18} />
            <span>Créer une nouvelle tâche</span>
          </summary>

          <div className="mt-4">
            <Card className="border-primary/20">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
                  <Plus size={18} className="text-primary" />
                  <span>Nouvelle tâche de classe</span>
                </div>

                <form action={async (fd) => { "use server"; await createTaskAction(fd); }} className="grid gap-4 md:grid-cols-2">
                  <input type="hidden" name="classId" value={profile!.class_id!} />
                  <Input name="title" placeholder="Titre de la tâche (ex: TP 02 TCP/IP)" required />
                  
                  <Select name="subjectId" required defaultValue="">
                    <option value="">Sélectionner une matière</option>
                    {(subjects ?? []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>

                  <Select name="type" required defaultValue="">
                    <option value="">Sélectionner le type (ex: Exercice, TP...)</option>
                    {TASK_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t === "EXERCISE" ? "Exercice" : t === "TP" ? "TP" : t === "ASSIGNMENT" ? "Devoir" : t === "RESEARCH" ? "Recherche" : t === "PROJECT" ? "Projet" : "Autre"}
                      </option>
                    ))}
                  </Select>


                  <Input name="dueDate" type="datetime-local" required />
                  <Input name="attachmentLink" placeholder="Lien de la ressource (optionnel : Google Drive, OneDrive, GitHub...)" className="md:col-span-2" />
                  <Textarea name="description" placeholder="Consignes et détails de la tâche..." className="md:col-span-2" />

                  <Button type="submit" className="md:col-span-2 gap-2 h-11 text-base">
                    <Plus size={18} />
                    <span>Publier la tâche</span>
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </details>
      )}

      {/* Liste des tâches */}
      <div className="space-y-4">
        {(tasks ?? []).length === 0 ? (
          <EmptyState
            imageUrl={CS_IMAGES.emptyTasks}
            title="Aucune tâche à venir"
            description="Votre calendrier est complètement vide pour le moment. Profitez-en pour réviser !"
          />
        ) : (
          (tasks ?? []).map((t) => {
            const completedCount = completionsByTask.get(t.id)?.size ?? 0;
            return (
              <div key={t.id} className="space-y-2">
                <TaskCard task={t} completed={completedIds.has(t.id)} />

                {canManage && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-muted/30 p-3 sm:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <details className="group">
                        <summary className="cursor-pointer select-none rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted inline-flex items-center gap-1.5">
                          <Edit3 size={13} />
                          <span>Modifier</span>
                        </summary>
                        <div className="mt-3 rounded-2xl border border-border bg-card p-4 shadow-lift">
                          <form action={async (fd) => { "use server"; await updateTaskAction(fd); }} className="grid gap-3 md:grid-cols-2">
                            <input type="hidden" name="taskId" value={t.id} />
                            <input type="hidden" name="classId" value={t.class_id} />
                            <Input name="title" defaultValue={t.title} required />
                            <Select name="subjectId" required defaultValue={t.subject_id}>
                              {(subjects ?? []).map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </Select>
                            <Select name="type" required defaultValue={t.type}>
                              {TASK_TYPES.map((type) => (
                                <option key={type} value={type}>{type}</option>
                              ))}
                            </Select>
                            <Input name="dueDate" type="datetime-local" defaultValue={toDateTimeLocal(t.due_date)} required />
                            <Input name="attachmentLink" defaultValue={t.attachment_link ?? ""} placeholder="Lien de la ressource (Google Drive, OneDrive, GitHub...)" className="md:col-span-2" />

                            <Textarea name="description" defaultValue={t.description ?? ""} placeholder="Description" className="md:col-span-2" />
                            <Button type="submit" className="md:col-span-2">Enregistrer les modifications</Button>
                          </form>
                        </div>
                      </details>

                      <form action={async () => { "use server"; await deleteTaskAction(t.id); }}>
                        <Button size="sm" variant="danger" className="gap-1">
                          <Trash2 size={13} />
                          <span>Supprimer</span>
                        </Button>
                      </form>
                    </div>

                    <details className="group">
                      <summary className="cursor-pointer select-none rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 inline-flex items-center gap-1.5">
                        <Users size={13} />
                        <span>Suivi ({completedCount}/{classStudents.length} terminés)</span>
                      </summary>
                      <div className="mt-3 max-h-64 overflow-y-auto rounded-2xl border border-border bg-card p-3 shadow-subtle min-w-[260px]">
                        {classStudents.length === 0 && (
                          <p className="text-xs text-muted-foreground">Aucun élève inscrit.</p>
                        )}
                        {classStudents.map((s: any) => {
                          const done = completionsByTask.get(t.id)?.has(s.id) ?? false;
                          return (
                            <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0 text-xs">
                              <span className="font-medium text-foreground">{s.first_name} {s.last_name}</span>
                              {done ? (
                                <Badge variant="success">Terminé ✓</Badge>
                              ) : (
                                <Badge variant="danger">En attente</Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
