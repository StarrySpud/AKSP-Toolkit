import {
  countAvailableCovenants, getActivatedCovenantNames, getCovenantMemberThresholds, getHeldCovenantMembers, HARMONY_COVENANT,
} from "../composables/useCovenantStats.js";
import { ADDITIONAL_GROUP, CORE_GROUP, getOperatorCovenants } from "../data/versions.js";
import { getAvatarUrl } from "../utils/index.js";
import { normalizeAffinityBonds } from "./affinityBonds.js";
import { findBestLineups } from "./endgameOptimizer.js";
import { buildLineupScoring } from "./lineupScoring.js";

export const DEFAULT_LINEUP_SIZE = 8;
export const MAX_LINEUP_SIZE = 20;
export const DEFAULT_ENDGAME_PLAN_NAME = "终局阵容方案";
const DEFAULT_PROMOTION_COPIES = 3;

export function validLineupSize(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_LINEUP_SIZE;
}

export function validCovenantLayerCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function getPromotionCopies(name, version) {
  return version?.operators?.[name]?.promotionCopies ?? DEFAULT_PROMOTION_COPIES;
}

export function readPieceCounts(counts, promotionCopies = DEFAULT_PROMOTION_COPIES) {
  if (!counts || typeof counts !== "object") return null;
  const { normal, promoted = counts.shiny } = counts;
  if (![normal, promoted].every((count) => Number.isSafeInteger(count) && count >= 0)
    || normal + promoted === 0) return null;
  const normalizedPromoted = promoted + Math.floor(normal / promotionCopies);
  return Number.isSafeInteger(normalizedPromoted)
    ? { normal: normal % promotionCopies, promoted: normalizedPromoted } : null;
}

export function readTargetPiece(value) {
  if (typeof value?.name !== "string" || !value.name || typeof value.promoted !== "boolean") return null;
  return { name: value.name, promoted: value.promoted };
}

export function initialEndgamePlan(pieces, limit) {
  return { id: "initial", name: DEFAULT_ENDGAME_PLAN_NAME, limit, pieces: pieces.map((piece) => ({ ...piece })) };
}

export function readEndgamePlan(value, migrateLegacyName = false) {
  if (typeof value?.id !== "string" || !value.id || typeof value.name !== "string" || !value.name.trim()
    || !validLineupSize(value.limit) || !Array.isArray(value.pieces) || value.pieces.length > value.limit) return null;
  const pieces = value.pieces.map(readTargetPiece);
  if (pieces.some((piece) => !piece)) return null;
  const name = value.name.trim();
  return { id: value.id,
    name: migrateLegacyName && value.id === "initial" && name === "方案 1" ? DEFAULT_ENDGAME_PLAN_NAME : name,
    limit: value.limit, pieces };
}

export function normalizeInventory(value, version) {
  const pieces = Object.fromEntries(Object.entries(value?.pieces ?? {})
    .map(([name, counts]) => [name, readPieceCounts(counts, getPromotionCopies(name, version))])
    .filter(([name, counts]) => name && counts));
  const targetLineup = (Array.isArray(value?.targetLineup) ? value.targetLineup : [])
    .map(readTargetPiece).filter(Boolean).slice(0, MAX_LINEUP_SIZE);
  const targetLineupSize = Math.max(targetLineup.length,
    validLineupSize(value?.targetLineupSize) ? value.targetLineupSize : DEFAULT_LINEUP_SIZE);
  const existingPlans = Array.isArray(value?.endgamePlans)
    ? value.endgamePlans.map((plan) => readEndgamePlan(plan, Object.hasOwn(value, "activeEndgamePlanId"))).filter(Boolean)
    : [initialEndgamePlan(targetLineup, targetLineupSize)];
  const endgamePlans = [...new Map(existingPlans.map((plan) => [plan.id, plan])).values()];
  return {
    pieces,
    lineupSize: validLineupSize(value?.lineupSize) ? value.lineupSize : DEFAULT_LINEUP_SIZE,
    considerHeld: value?.considerHeld !== false,
    directedSearch: value?.directedSearch === true,
    stackingEnabled: value?.stackingEnabled === true,
    collapsed: value?.collapsed === true,
    lineupView: value?.lineupView === "target" ? "target" : "recommended",
    targetLineup,
    targetLineupSize,
    endgamePlans,
    affinityBonds: normalizeAffinityBonds(value?.affinityBonds),
    covenantIcons: value?.covenantIcons === true,
    covenantPanel: ["extra", "extra-additional"].includes(value?.covenantPanel) ? value.covenantPanel : "potential",
    covenantPanelCollapsed: value?.covenantPanelCollapsed === true,
    targetCovenantNames: Array.isArray(value?.targetCovenantNames)
      ? [...new Set(value.targetCovenantNames.filter((name) => typeof name === "string" && name
        && (!version || Object.hasOwn(version.covenants, name))))]
      : [],
    extraCoreCounts: Object.fromEntries(Object.entries(value?.extraCoreCounts ?? {}).filter(([name, count]) =>
      (!version || version.covenants[name]?.group === CORE_GROUP) && validCovenantLayerCount(count) && count > 0)),
    extraAdditionalCounts: Object.fromEntries(Object.entries(value?.extraAdditionalCounts ?? {}).filter(([name, count]) =>
      (!version || version.covenants[name]?.group === ADDITIONAL_GROUP) && validCovenantLayerCount(count) && count > 0)),
    covenantLayers: Object.fromEntries(Object.entries(value?.covenantLayers ?? {}).filter(([name, count]) =>
      name !== HARMONY_COVENANT && (!version || Object.hasOwn(version.covenants, name)) && validCovenantLayerCount(count) && count > 0)),
  };
}

export function changeHeldPieces(pieces, name, action, version) {
  const { normal = 0, promoted = 0 } = Object.hasOwn(pieces, name) ? pieces[name] : {};
  let next;
  if (action === "buy") {
    const copies = normal + 1;
    const promotionCopies = getPromotionCopies(name, version);
    next = { normal: copies % promotionCopies, promoted: promoted + Math.floor(copies / promotionCopies) };
  } else if (action === "sell-normal" && normal > 0) {
    next = { normal: normal - 1, promoted };
  } else if (action === "sell-promoted" && promoted > 0) {
    next = { normal, promoted: promoted - 1 };
  } else {
    return pieces;
  }
  if (!Number.isSafeInteger(next.promoted)) return pieces;
  const updated = { ...pieces, [name]: next };
  if (next.normal + next.promoted === 0) delete updated[name];
  return updated;
}

export function getHeldOperators(pieces) {
  return Object.entries(pieces).map(([name, counts]) => ({
    name, avatar: getAvatarUrl(encodeURIComponent(name)), ...counts,
  }));
}

export function getHeldActivatableCovenants(version, held, covenantLayers, extraCovenantCounts = {}, targetCovenants = new Set()) {
  const present = new Set(held.flatMap(({ name }) => getOperatorCovenants(name, version)));
  const active = new Set(getActivatedCovenantNames(held, version, extraCovenantCounts));
  return Object.keys(version.covenants)
    .filter((name) => present.has(name) || active.has(name) || targetCovenants.has(name) || (covenantLayers[name] ?? 0) > 0
      || (extraCovenantCounts[name] ?? 0) > 0)
    .map((name) => ({ name, active: active.has(name), layers: covenantLayers[name] ?? 0 }))
    .sort((a, b) => Number(b.active) - Number(a.active));
}

export function getCovenantProgressBonuses(version, candidates, held, extraCovenantCounts) {
  const names = held.map(({ name }) => name);
  const heldNames = new Set(names);
  const before = countAvailableCovenants(names, version, extraCovenantCounts);
  const thresholds = new Map(Object.keys(version.covenants).map((name) => [
    name, getCovenantMemberThresholds(name, version.covenants),
  ]));
  return new Map(candidates.filter(({ name }) => !heldNames.has(name)).map(({ name }) => {
    const progress = [];
    const milestones = [];
    const nextCoreLevels = {};
    const after = countAvailableCovenants([...names, name], version, extraCovenantCounts);
    for (const [covenant, count] of Object.entries(after)) {
      const previous = before[covenant] ?? 0;
      if (count <= previous) continue;
      const target = thresholds.get(covenant) ?? [];
      const nextLevel = target.findIndex((threshold) => threshold > previous) + 1;
      if (version.covenants[covenant]?.group === CORE_GROUP && nextLevel > 1) nextCoreLevels[covenant] = nextLevel;
      const reached = target.filter((threshold) => previous < threshold && count >= threshold);
      if (reached.length) milestones.push(...reached.map(() => covenant));
      else if (count < target.at(-1)) progress.push(covenant);
    }
    return [name, { progress, milestones, ...(Object.keys(nextCoreLevels).length ? { nextCoreLevels } : {}) }];
  }));
}

function lineupComposition(lineup) {
  return JSON.stringify(lineup.pieces.map(({ name, promoted }) => [name, promoted]).sort());
}

export function getHeldPurchaseEffects(version, candidates, pieces, held, currentLineup, recommend, extraCovenantCounts) {
  const bonuses = getCovenantProgressBonuses(version, candidates, held, extraCovenantCounts);
  const currentComposition = lineupComposition(currentLineup);

  return new Map(candidates.map(({ name }) => {
    const nextPieces = changeHeldPieces(pieces, name, "buy", version);
    const nextLineup = recommend(getHeldOperators(nextPieces));
    return [name, {
      ...bonuses.get(name),
      changesLineup: lineupComposition(nextLineup) !== currentComposition,
    }];
  }));
}

export function recommendHeldLineup(version, held, limit, options) {
  const scoring = buildLineupScoring(version, held, {
    ...options, heldMembers: getHeldCovenantMembers(held, version),
  });
  const size = Math.min(limit, scoring.candidates.reduce((count, { normal, promoted }) => count + normal + promoted, 0));
  return findBestLineups(scoring, size, 1)[0];
}
