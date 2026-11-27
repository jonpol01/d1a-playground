// D1A's routing decision as its route preset makes it (d1a.agents.presets.fail_up): small only if p(small) reaches the
// rule's `small`, medium if p(small) + p(medium) reaches its `medium`, else large. The page shows this final tier, the
// one D1A routes on, never the most likely tier on its own. The thresholds come from the model server's card
// (`route_rule`, read at the routing use case's temperature); a server too old to publish it gets them computed from
// its card's temperatures the way d1a does (presets.route_rule).

export type Tier = "small" | "medium" | "large";
export type Rule = { small: number; medium: number };

const FAIL_UP_SMALL = 0.7, FAIL_UP_MEDIUM = 0.5;   // d1a.agents.presets.FAIL_UP_*: used only when the card has no route_rule

/** presets.carried: a threshold set at the checkpoint's temperature, carried to answers read at T_checkpoint / ratio. */
export function carried(threshold: number, ratio: number): number {
  return ratio === 1 ? threshold : 1 / (1 + Math.exp(-Math.log(threshold / (1 - threshold)) * ratio));
}

const unit = (x: unknown): x is number => typeof x === "number" && x > 0 && x < 1;

/** The rule from a /v1/models card (`models[0]`): its route_rule, else d1a's defaults carried by its routing temperature. */
export function ruleFrom(card: unknown): Rule {
  const c = (card ?? {}) as { route_rule?: { small?: unknown; medium?: unknown }; temperature?: unknown; use_case_temperatures?: Record<string, unknown> };
  if (unit(c.route_rule?.small) && unit(c.route_rule?.medium)) return { small: c.route_rule.small, medium: c.route_rule.medium };
  const own = c.temperature, routing = c.use_case_temperatures?.routing;
  const ratio = typeof own === "number" && typeof routing === "number" && own > 0 && routing > 0 ? own / routing : 1;
  return { small: carried(FAIL_UP_SMALL, ratio), medium: FAIL_UP_MEDIUM };
}

/** D1A's final tier for these probabilities (presets.fail_up). */
export function decide(probs: Record<string, number>, rule: Rule): Tier {
  const small = probs.small ?? 0, medium = probs.medium ?? 0;
  if (small >= rule.small) return "small";
  if (small + medium >= rule.medium) return "medium";
  return "large";
}
