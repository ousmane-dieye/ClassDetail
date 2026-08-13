/**
 * Personnalisation OPTIONNELLE par OpenAI.
 *
 * RÈGLE ABSOLUE : l'envoi des emails ne dépend JAMAIS de ce module.
 * - Si OPENAI_API_KEY est absent -> retourne null immédiatement.
 * - Toute erreur / timeout -> retourne null (l'email part avec le template standard).
 * - Les informations académiques (devoir, matière, deadline, lien, statut)
 *   proviennent TOUJOURS de la base de données — jamais d'OpenAI.
 */

const OPENAI_API_URL =
  process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/chat/completions";

export interface PersonalizationInput {
  firstName: string;
  /** Type de notification : sert uniquement à orienter le ton. */
  kind: "AUTH_APPROVED" | "ASSIGNMENT_3_DAYS" | "ASSIGNMENT_1_DAY";
}

/**
 * Génère une courte phrase d'introduction personnalisée (max ~2 phrases).
 * Retourne null si OpenAI est indisponible, non configuré, ou en erreur.
 */
export async function personalizeIntro(input: PersonalizationInput): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const tone =
    input.kind === "AUTH_APPROVED"
      ? "chaleureux et de bienvenue, pour annoncer qu'un compte a été accepté"
      : input.kind === "ASSIGNMENT_3_DAYS"
        ? "courtois mais ferme, pour rappeler une échéance dans 3 jours"
        : "urgent mais respectueux, pour un dernier rappel d'échéance demain";

  const prompt =
    `Rédige en français une phrase d'introduction courte (1 à 2 phrases, maximum 40 mots) ` +
    `pour un email académique, ton ${tone}, destinée à ${input.firstName}. ` +
    `Interdis-toi toute date, heure, note, chiffre ou information factuelle : seule l'intention compte. ` +
    `Réponds uniquement avec la phrase, sans guillemets ni introduction.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 80,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    return content.replace(/\s+/g, " ");
  } catch {
    // OpenAI indisponible/erreur -> on n'empêche JAMAIS l'envoi de l'email.
    return null;
  }
}
