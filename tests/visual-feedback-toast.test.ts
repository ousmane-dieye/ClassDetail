import { describe, it, expect, beforeEach, vi } from "vitest";
import { toast, type ToastItem } from "@/lib/toast";

describe("Visual Feedback & Toast System", () => {
  beforeEach(() => {
    toast.clear();
    vi.useRealTimers();
  });

  it("gère l'émission et la souscription des notifications avec types appropriés", () => {
    const received: ToastItem[][] = [];
    const unsubscribe = toast.subscribe((items) => {
      received.push(items);
    });

    const id1 = toast.success("Cours ajouté à votre bibliothèque.");
    expect(toast.getToasts()).toHaveLength(1);
    expect(toast.getToasts()[0]?.type).toBe("success");
    expect(toast.getToasts()[0]?.message).toBe("Cours ajouté à votre bibliothèque.");

    const id2 = toast.error("Une erreur est survenue.");
    expect(toast.getToasts()).toHaveLength(2);
    expect(toast.getToasts()[1]?.type).toBe("error");

    const id3 = toast.info("Information importante.");
    expect(toast.getToasts()).toHaveLength(3);
    expect(toast.getToasts()[2]?.type).toBe("info");

    const id4 = toast.loading("Opération en cours...");
    expect(toast.getToasts()).toHaveLength(4);
    expect(toast.getToasts()[3]?.type).toBe("loading");

    toast.dismiss(id1);
    expect(toast.getToasts().find((t) => t.id === id1)).toBeUndefined();
    expect(toast.getToasts()).toHaveLength(3);

    unsubscribe();
  });

  it("évite l'accumulation de doublons identiques lors de clics répétés rapides", () => {
    const msg = "Cours ajouté à votre bibliothèque.";
    const idFirst = toast.success(msg);
    const idSecond = toast.success(msg);
    const idThird = toast.success(msg);

    // L'anti-rebond renvoie le même id et ne duplique pas l'élément dans la liste
    expect(idFirst).toBe(idSecond);
    expect(idSecond).toBe(idThird);
    expect(toast.getToasts()).toHaveLength(1);
  });

  it("limite le nombre maximal de notifications affichées pour ne pas masquer l'écran", () => {
    // Émet 7 notifications distinctes
    for (let i = 1; i <= 7; i++) {
      toast.info(`Message numéro ${i}`);
    }

    // Le gestionnaire conserve un maximum de 5 toasts simultanés (FIFO)
    expect(toast.getToasts()).toHaveLength(5);
    expect(toast.getToasts()[0]?.message).toBe("Message numéro 3");
    expect(toast.getToasts()[4]?.message).toBe("Message numéro 7");
  });

  it("permet de vider tous les toasts d'un coup", () => {
    toast.success("Succès");
    toast.error("Erreur");
    expect(toast.getToasts()).toHaveLength(2);

    toast.clear();
    expect(toast.getToasts()).toHaveLength(0);
  });
});
