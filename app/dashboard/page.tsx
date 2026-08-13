import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Redirige vers le dashboard adapté au rôle de l'utilisateur.
export default async function DashboardIndex() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role === "ADMIN") redirect("/dashboard/admin");
  if (profile?.role === "DELEGATE") redirect("/dashboard/delegate");
  redirect("/dashboard/student");
}
