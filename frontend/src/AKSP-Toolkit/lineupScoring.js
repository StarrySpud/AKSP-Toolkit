import { CORE_GROUP, getEffectiveOperatorCovenants, getOperatorTier, hasStackingTrait } from "../data/versions.js";
import { getCovenantMemberThresholds, HARMONY_COVENANT } from "../composables/useCovenantStats.js";
import { COVENANT_TICKS_PER_POINT, getCovenantScoreTicks, normalizeStackingCoefficient, RANKING_TIERS } from "./covenantWeights.js";

export const TIER_BASE_POINTS = [0.5, 0.8, 1.1, 1.4, 1.7, 2];

export function normalizeTierBasePoints(points) {
  return TIER_BASE_POINTS.map((fallback, index) => {
    const value = points?.[index];
    const hundredths = Math.round(value * 100);
    return Number.isFinite(value) && value >= 0 && Number.isSafeInteger(hundredths) ? hundredths / 100 : fallback;
  });
}

export function getLineupPieceTicks(name, version, promoted, {
  tierBasePoints = TIER_BASE_POINTS, stackingEnabled = false, stackingCoefficient,
} = {}) {
  const index = RANKING_TIERS.indexOf(getOperatorTier(name, version));
  const coefficient = stackingEnabled && hasStackingTrait(name, version) ? normalizeStackingCoefficient(stackingCoefficient) : 1;
  return Math.round((tierBasePoints[index] ?? TIER_BASE_POINTS[index] ?? 0) * coefficient * COVENANT_TICKS_PER_POINT)
    * (promoted ? 2 : 1);
}

export function buildLineupScoring(version, operators, options) {
  const { weights, layers, targets, extras = {}, heldMembers, defaultPromoted = false } = options;
  const covenants = Object.keys(version.covenants).flatMap((name) => {
    const thresholds = getCovenantMemberThresholds(name, version.covenants);
    return thresholds.length ? [{
      name, thresholds, core: version.covenants[name].group === CORE_GROUP,
      baseWeight: getCovenantScoreTicks(name, weights, layers, targets, version.covenants[name].group),
      advancedWeight: getCovenantScoreTicks(name, weights, layers, targets, version.covenants[name].group, 2),
    }] : [];
  });
  const indexes = new Map(covenants.map(({ name }, index) => [name, index]));
  const seen = new Set();
  const candidates = [];
  for (const operator of operators) {
    const name = typeof operator === "string" ? operator : operator.name;
    if (seen.has(name)) continue;
    seen.add(name);
    const effective = [...new Set(getEffectiveOperatorCovenants(operator, version))];
    const members = effective
      .filter((covenant) => indexes.has(covenant) && !heldMembers?.get(covenant)?.has(name))
      .map((covenant) => indexes.get(covenant)).sort((a, b) => a - b);
    const heldOverlap = covenants.flatMap(({ name: covenant }, index) =>
      extras[covenant] > 0 && heldMembers?.get(covenant)?.has(name) ? [index] : []);
    const normalPoints = getLineupPieceTicks(name, version, false, options);
    candidates.push({ name, members, heldOverlap,
      normal: operator.normal ?? Number(!defaultPromoted), promoted: operator.promoted ?? Number(defaultPromoted),
      normalPoints, promotedPoints: normalPoints * 2 });
  }
  return {
    candidates, covenants,
    initialCounts: covenants.map(({ name }) => heldMembers?.get(name)?.size ?? 0),
    extraCounts: covenants.map(({ name }) => extras[name] ?? 0),
    harmonyIndex: indexes.get(HARMONY_COVENANT) ?? -1,
  };
}

export function sumActivatedCovenantScore({ activeNames, advancedLevels }, version, { weights, layers, targets }) {
  return activeNames.reduce((sum, name) => {
    const group = version.covenants[name]?.group;
    return sum + getCovenantScoreTicks(name, weights, layers, targets, group)
      + getCovenantScoreTicks(name, weights, layers, targets, group, 2) * (advancedLevels[name] ?? 0);
  }, 0);
}

export function getLineupScoreTicks(covenants, pieces, version, options) {
  return sumActivatedCovenantScore(covenants, version, options) + pieces.reduce((sum, { name, promoted }) =>
    sum + getLineupPieceTicks(name, version, promoted, options), 0);
}
