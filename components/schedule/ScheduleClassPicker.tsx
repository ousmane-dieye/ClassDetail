"use client";

/**
 * Sélecteur de classe (administration) — navigue vers /dashboard/schedule?class=<id>.
 * Le serveur re-valide que l'utilisateur est bien ADMIN avant de servir les
 * données de la classe demandée (jamais de confiance au client).
 */

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";

export function ScheduleClassPicker({
  classes,
  activeClassId,
}: {
  classes: Array<{ id: string; name: string; level: string }>;
  activeClassId: string;
}) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="schedule-class-picker" className="text-xs font-bold text-muted-foreground">
        Classe
      </label>
      <Select
        id="schedule-class-picker"
        aria-label="Choisir une classe"
        value={activeClassId}
        onChange={(e) => {
          const id = e.target.value;
          router.push(id ? `/dashboard/schedule?class=${id}` : "/dashboard/schedule");
        }}
        className="h-9 min-w-[180px] text-xs"
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} — {c.level}
          </option>
        ))}
      </Select>
    </div>
  );
}
