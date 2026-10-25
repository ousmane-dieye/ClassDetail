/**
 * Garde-fou de sujet (mode « cadrage ») pour l'assistant ClassPulse.
 *
 * Décide localement, sans appel à l'API (donc gratuit et déterministe),
 * si une question est dans le périmètre de la plateforme ou clairement hors-sujet.
 * - Retourne null si la question est dans le périmètre.
 * - Retourne un message de refus sinon.
 *
 * Le prompt système (lib/ai/openai.ts) reste la couche sémantique ;
 * ce garde-fou bloque les catégories évidentes sans consommer de tokens Gemini.
 */

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const CATEGORIES: { patterns: RegExp[] }[] = [
  {
    patterns: [
      /ignore.*(instruction|prompt|regle|role|directive)/,
      /oublie.*(instruction|prompt|regle)/,
      /ne tien.*pas compte.*(instruction|prompt|regle)/,
      /tu es maintenant/,
      /system prompt/,
      /sortir de ton role/,
    ],
  },
  {
    patterns: [
      /bitcoin/,
      /crypto/,
      /investir/,
      /bourse/,
      /trading/,
      /devise/,
      /arnaque/,
      /gagner de l ?argent/,
      /gagner.*argent/,
      /rendre riche/,
    ],
  },
  {
    patterns: [/election/, /president/, /gouvernement/, /ministre/, /guerre/],
  },
  {
    patterns: [/coran/, /bible/, /islam/, /prophete/, /priere/, /religion/],
  },
  {
    patterns: [
      /symptome/,
      /diagnostic/,
      /maladie/,
      /medicament/,
      /depression/,
      /anxiete/,
      /suicide/,
      /perdre du poids/,
      /regime pour/,
    ],
  },
  {
    patterns: [/avocat/, /proces/, /divorce/, /testament/],
  },
  {
    patterns: [/copine/, /petit ami/, /amoureux/, /seduire/, /infidele/],
  },
  {
    patterns: [/porno/, /sexe/, /nudite/],
  },
  {
    patterns: [/fabriquer une arme/, /arme a feu/, /drogue/, /cocaine/, /chanvre/],
  },
  {
    patterns: [/horoscope/, /voyance/, /loto/, /paris sportifs/, /jeu de hasard/],
  },
  {
    patterns: [/combien font/, /calculer /, / factorielle/, /derivee de/],
  },
];

export const ASSISTANT_REFUSAL =
  "Je ne peux pas répondre à cette question : mon rôle est limité à ClassPulse et à la vie de votre classe " +
  "(tâches, devoirs, cours, documents, hints, emploi du temps, évaluations, notifications, organisation). " +
  "Posez une question sur votre classe, ou utilisez les boutons ci-dessous.";

/** Retourne null si dans le périmètre, sinon un message de refus. */
export function checkTopicGuard(content: string): string | null {
  const haystack = normalize(content);
  if (CATEGORIES.some((cat) => cat.patterns.some((re) => re.test(haystack)))) {
    return ASSISTANT_REFUSAL;
  }
  return null;
}
