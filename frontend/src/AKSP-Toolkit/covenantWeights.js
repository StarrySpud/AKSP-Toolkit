import { AFFINITY_BOND_LABEL } from "./affinityBonds.js";
import { CORE_GROUP } from "../data/versions.js";
import { HARMONY_COVENANT } from "../composables/useCovenantStats.js";

const DEFAULT_COVENANT_WEIGHT = 1;
export const MAX_COVENANT_WEIGHT = 2;
export const CORE_COVENANT_BASE_WEIGHT = 2;
const MAX_CORE_COVENANT_MULTIPLIER = 3;
export const WEIGHT_STEP = 0.1;
export const DEFAULT_TERMINAL_COEFFICIENT = 1;
export const DEFAULT_PAIR_COEFFICIENT = 1.2;
export const DEFAULT_HELD_LINEUP_CHANGE_COEFFICIENT = 2;
export const DEFAULT_STACKING_COEFFICIENT = 1.5;
export const DEFAULT_STACKABLE_COVENANT_COEFFICIENT = 1.2;
export const PROMOTION_COEFFICIENT = 1.5;
export const AFFINITY_BOND_WEIGHT = 2;
const LAYERS_PER_WEIGHT_BONUS = 20;
export const COVENANT_TICKS_PER_POINT = 1000 * LAYERS_PER_WEIGHT_BONUS;
export const RANKING_TIERS = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ"];

export function getCovenantWeightMax(group) {
  return group === CORE_GROUP ? MAX_CORE_COVENANT_MULTIPLIER : MAX_COVENANT_WEIGHT;
}

export function getCovenantWeightMin(group) {
  return group === CORE_GROUP ? 1 : 0;
}

export function normalizeCovenantWeight(value, group) {
  if (!Number.isFinite(value)) return DEFAULT_COVENANT_WEIGHT;
  const bounded = Math.max(getCovenantWeightMin(group), Math.min(getCovenantWeightMax(group), value));
  return Math.round(bounded * 10) / 10;
}

function normalizeCoefficient(value, minimum, fallback) {
  if (!Number.isFinite(value) || value < minimum) return fallback;
  const hundredths = Math.round(value * 100);
  return Number.isSafeInteger(hundredths) ? hundredths / 100 : fallback;
}

export const normalizeTerminalCoefficient = (value) => normalizeCoefficient(value, 0, DEFAULT_TERMINAL_COEFFICIENT);
export const normalizePairCoefficient = (value) => normalizeCoefficient(value, 1, DEFAULT_PAIR_COEFFICIENT);
export const normalizeHeldLineupChangeCoefficient = (value) => normalizeCoefficient(value, 1, DEFAULT_HELD_LINEUP_CHANGE_COEFFICIENT);
export const normalizeStackingCoefficient = (value) => normalizeCoefficient(value, 1, DEFAULT_STACKING_COEFFICIENT);
export const normalizeStackableCovenantCoefficient = (value) => normalizeCoefficient(value, 1, DEFAULT_STACKABLE_COVENANT_COEFFICIENT);

export function formatRankingScore(score) {
  return score.toFixed(3).replace(/0{1,2}$/, "");
}

export function getCovenantScoreTicks(name, weights, layers, targets, group, level = 1) {
  if (name === AFFINITY_BOND_LABEL) return AFFINITY_BOND_WEIGHT * COVENANT_TICKS_PER_POINT;
  const configured = normalizeCovenantWeight(weights?.[name], group);
  const weight = group === CORE_GROUP ? CORE_COVENANT_BASE_WEIGHT * (level > 1 ? configured : 1) : configured;
  const layerCount = name === HARMONY_COVENANT ? 0 : (layers[name] ?? 0);
  return Math.round(weight * 10) * 100
    * (LAYERS_PER_WEIGHT_BONUS + layerCount) * (targets.has(name) ? 2 : 1);
}

export function rankOperators(graph, weights, terminalCoefficient = DEFAULT_TERMINAL_COEFFICIENT, {
  purchaseEffects = new Map(),
  heldLineupChangeCoefficient = DEFAULT_HELD_LINEUP_CHANGE_COEFFICIENT,
  pairNames = new Set(),
  pairCoefficient = DEFAULT_PAIR_COEFFICIENT,
  promotionNames = new Set(),
  stackingCoefficient = DEFAULT_STACKING_COEFFICIENT,
  stackingEnabled = false,
  stackableCovenants = new Set(),
  stackableCovenantCoefficient = DEFAULT_STACKABLE_COVENANT_COEFFICIENT,
  covenantLayers = {},
  extraCoreCounts = {},
  levelTwoCovenants = new Set(),
  targetCovenants = new Set(),
  directedCovenants = new Set(),
} = {}) {
  const edgeTicksByNode = new Map();
  const terminalHundredths = Math.round(normalizeTerminalCoefficient(terminalCoefficient) * 100);
  const pairHundredths = Math.round(normalizePairCoefficient(pairCoefficient) * 100);
  const lineupChangeMultiplier = normalizeHeldLineupChangeCoefficient(heldLineupChangeCoefficient);
  const stackingHundredths = Math.round(normalizeStackingCoefficient(stackingCoefficient) * 100);
  const covenantMultiplier = stackingEnabled ? normalizeStackableCovenantCoefficient(stackableCovenantCoefficient) : 1;
  const ticksPerPoint = COVENANT_TICKS_PER_POINT;
  const unweightedEdgeTicks = weights ? 0 : ticksPerPoint;
  const coreNames = new Set(graph.legend?.filter(({ group }) => group === CORE_GROUP).map(({ name }) => name));
  const levelTicks = (name, level) => {
    const ticks = getCovenantScoreTicks(name, weights, covenantLayers, targetCovenants,
      weights && coreNames.has(name) ? CORE_GROUP : undefined, level);
    return Math.round(ticks * (stackableCovenants.has(name) ? covenantMultiplier : 1))
      * (directedCovenants.has(name) ? 2 : 1);
  };
  const covenantTicks = (name) => levelTicks(name, 1) + (levelTwoCovenants.has(name) ? levelTicks(name, 2) : 0);
  if (weights || Object.keys(covenantLayers).length || levelTwoCovenants.size || targetCovenants.size
    || directedCovenants.size || (covenantMultiplier !== 1 && stackableCovenants.size) || graph.affinityMembers?.size) {
    for (const { source, target, covenant } of graph.edges) {
      const ticks = covenant === AFFINITY_BOND_LABEL
        ? covenantTicks(covenant) : covenantTicks(covenant) - unweightedEdgeTicks;
      edgeTicksByNode.set(source, (edgeTicksByNode.get(source) ?? 0) + ticks);
      edgeTicksByNode.set(target, (edgeTicksByNode.get(target) ?? 0) + ticks);
    }
  }

  return graph.nodes.map((node) => {
    let degree = graph.neighbors.get(node).size;
    let extraTicks = 0;
    for (const name of node.covenants ?? []) {
      const extra = extraCoreCounts[name] ?? 0;
      if (!extra) continue;
      degree += extra;
      extraTicks += extra * (covenantTicks(name) - unweightedEdgeTicks);
    }
    const terminalMultiplier = weights && node.isTerminal ? terminalHundredths : 100;
    const { progress = [], milestones = [], nextCoreLevels = {}, changesLineup = false } = purchaseEffects.get(node.name) ?? {};
    const reachedLevels = { ...nextCoreLevels };
    const bonusTicks = changesLineup ? 0
      : progress.reduce((total, name) => total + levelTicks(name, nextCoreLevels[name] ?? 1), 0)
        + milestones.reduce((total, name) => {
          const level = reachedLevels[name] ?? 1;
          reachedLevels[name] = level + 1;
          return total + 2 * levelTicks(name, level);
        }, 0);
    // Unweighted ranking keeps one base point per neighbor and adds per-covenant adjustments separately.
    const covenantDegree = degree - (graph.affinityOnlyNeighbors?.get(node) ?? 0);
    const baseTicks = covenantDegree * unweightedEdgeTicks + (edgeTicksByNode.get(node) ?? 0) + extraTicks;
    const adjustedTicks = changesLineup ? baseTicks * lineupChangeMultiplier : baseTicks + bonusTicks;
    const stackingMultiplier = stackingEnabled && node.hasStackingTrait ? stackingHundredths : 100;
    const baseScore = (adjustedTicks * terminalMultiplier * stackingMultiplier) / (ticksPerPoint * 10_000);
    const triggersPromotion = promotionNames.has(node.name);
    const formsPair = !triggersPromotion && pairNames.has(node.name);
    const score = triggersPromotion ? baseScore * PROMOTION_COEFFICIENT
      : formsPair ? (baseScore * pairHundredths) / 100 : baseScore;
    return { node, degree, score, progress, milestones, changesLineup, formsPair, triggersPromotion };
  }).sort((a, b) => b.score - a.score || b.degree - a.degree || a.node.name.localeCompare(b.node.name, "zh-CN"));
}
