export default function PendingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Demande en attente</h1>
      <p className="max-w-md text-muted-foreground">
        Votre inscription a bien été enregistrée. Un administrateur ou un délégué de votre
        classe doit encore valider votre demande. Vous recevrez un email de confirmation.
      </p>
    </main>
  );
}
