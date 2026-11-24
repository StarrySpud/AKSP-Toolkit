import { ADDITIONAL_GROUP, CORE_GROUP, GAME_VERSIONS } from "../data/versions.js";
import { getAvatarUrl } from "../utils/index.js";
import { normalizeAffinityBonds, readAffinityBond } from "./affinityBonds.js";
import { COVENANT_LINE_WIDTHS } from "./covenantGraph.js";
import {
  getCovenantWeightMax, getCovenantWeightMin, normalizeCovenantWeight, normalizeHeldLineupChangeCoefficient,
  normalizePairCoefficient, normalizeStackableCovenantCoefficient, normalizeStackingCoefficient, normalizeTerminalCoefficient, RANKING_TIERS,
} from "./covenantWeights.js";
import { normalizeTierBasePoints } from "./lineupScoring.js";
import { normalizeCovenantFunctionOverrides } from "./covenantFunctions.js";
import {
  DEFAULT_LINEUP_SIZE, getPromotionCopies, initialEndgamePlan, readEndgamePlan, readPieceCounts,
  readTargetPiece, validCovenantLayerCount, validLineupSize,
} from "./operatorInventory.js";

export const CONFIG_FORMAT = "AKSP-Toolkit";
export const CONFIG_VERSION = 1;
const versionIds = GAME_VERSIONS.map(({ id }) => id);
const groups = [CORE_GROUP, ADDITIONAL_GROUP];

function invalid(path) {
  throw new Error(`配置字段无效：${path}`);
}

function object(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(path);
  return value;
}

function list(value, path, convert) {
  if (!Array.isArray(value)) invalid(path);
  return value.map((item, index) => convert(item, `${path}[${index}]`, index));
}

function text(value, path) {
  if (typeof value !== "string") invalid(path);
  return value;
}

function bool(value, path) {
  if (typeof value !== "boolean") invalid(path);
  return value;
}

function choice(value, options, path) {
  if (!options.includes(value)) invalid(path);
  return value;
}

function number(value, min, max, path) {
  if (!Number.isFinite(value) || value < min || value > max) invalid(path);
  return value;
}

function byVersion(value, path, convert) {
  const data = object(value, path);
  return Object.fromEntries(GAME_VERSIONS.filter(({ id }) => Object.hasOwn(data, id))
    .map((version) => [version.id, convert(data[version.id], `${path}.${version.id}`, version)]));
}

function operator(value, path, index) {
  const data = object(value, path);
  const name = text(data.name, `${path}.name`);
  if (!name) invalid(`${path}.name`);
  return {
    id: index,
    name,
    avatar: getAvatarUrl(encodeURIComponent(name)),
    ...(data.tier !== undefined ? { tier: text(data.tier, `${path}.tier`) } : {}),
    ...(data.isSelfOperator !== undefined ? { isSelfOperator: bool(data.isSelfOperator, `${path}.isSelfOperator`) } : {}),
    ...(data.equipments !== undefined ? { equipments: list(data.equipments, `${path}.equipments`, text) } : {}),
  };
}

function team(value, path) {
  const data = object(value, path);
  return {
    name: text(data.name, `${path}.name`),
    team: list(data.team, `${path}.team`, operator),
    createTime: text(data.createTime ?? "", `${path}.createTime`),
    ...(data.version !== undefined ? { version: choice(data.version, versionIds, `${path}.version`) } : {}),
  };
}

function collection(value, path) {
  const data = object(value, path);
  return {
    name: text(data.name, `${path}.name`),
    teams: list(data.teams, `${path}.teams`, team),
    expanded: bool(data.expanded ?? true, `${path}.expanded`),
    ...(data.version !== undefined ? { version: choice(data.version, versionIds, `${path}.version`) } : {}),
  };
}

function readPool(data) {
  object(data, "game.pool");
  const strings = ["searchQuery", "selectedTier", "selectedMainCov", "selectedSubCov", "selectedTraitType", "selectedTraitTrigger"];
  const switches = ["filterCollapsed", "poolCollapsed", "terminalOnly", "banCollapsed"];
  return {
    ...Object.fromEntries(strings.map((name) => [name, text(data[name], `game.pool.${name}`)])),
    ...Object.fromEntries(switches.map((name) => [name, bool(data[name], `game.pool.${name}`)])),
    bannedCovenants: list(data.bannedCovenants, "game.pool.bannedCovenants", text),
    selectedSelfOperators: list(data.selectedSelfOperators, "game.pool.selectedSelfOperators", operator),
    filterView: choice(data.filterView, ["icon", "text"], "game.pool.filterView"),
  };
}

function readAnalysis(data) {
  if (data === null) return null;
  object(data, "analysis");
  const view = object(data.view, "analysis.view");
  return {
    activePanel: choice(data.activePanel, ["settings", "ranking", null], "analysis.activePanel"),
    weightsEnabled: bool(data.weightsEnabled, "analysis.weightsEnabled"),
    rankingTiers: [...new Set(list(
      data.rankingTiers ?? (data.rankingTier ? [data.rankingTier] : []),
      "analysis.rankingTiers",
      (tier, path) => choice(tier, RANKING_TIERS, path),
    ))],
    spectrumGroup: choice(data.spectrumGroup, groups, "analysis.spectrumGroup"),
    clusterBy: choice(data.clusterBy, groups, "analysis.clusterBy"),
    clusterTerminal: bool(data.clusterTerminal, "analysis.clusterTerminal"),
    mode: choice(data.mode, ["avatar", "name"], "analysis.mode"),
    selectedName: text(data.selectedName, "analysis.selectedName"),
    highlightedCovenant: text(data.highlightedCovenant ?? "", "analysis.highlightedCovenant"),
    legendHidden: bool(data.legendHidden ?? false, "analysis.legendHidden"),
    view: {
      yaw: number(view.yaw, -Infinity, Infinity, "analysis.view.yaw"),
      pitch: number(view.pitch, -Math.PI / 2, Math.PI / 2, "analysis.view.pitch"),
      zoom: number(view.zoom, 0.5, 3.5, "analysis.view.zoom"),
    },
    ordersByVersion: byVersion(data.ordersByVersion, "analysis.ordersByVersion", (groupOrders, path, version) => {
      object(groupOrders, path);
      return Object.fromEntries(groups.filter((group) => Object.hasOwn(groupOrders, group)).map((group) => [
        group,
        [...new Set(list(groupOrders[group], `${path}.${group}`, text))]
          .filter((name) => version.covenants[name]?.group === group),
      ]));
    }),
    lineLevelsByVersion: byVersion(data.lineLevelsByVersion, "analysis.lineLevelsByVersion", (levels, path, version) =>
      Object.fromEntries(Object.entries(object(levels, path))
        .filter(([name]) => Object.hasOwn(version.covenants, name))
        .map(([name, level]) => {
          if (!Number.isInteger(level)) invalid(`${path}.${name}`);
          return [name, number(level, 1, COVENANT_LINE_WIDTHS.length, `${path}.${name}`)];
        }))),
  };
}

function readInventory(value, path, version) {
  const data = object(value, path);
  if (!validLineupSize(data.lineupSize)) invalid(`${path}.lineupSize`);
  const targetLineupSize = data.targetLineupSize ?? DEFAULT_LINEUP_SIZE;
  if (!validLineupSize(targetLineupSize)) invalid(`${path}.targetLineupSize`);
  const targetLineup = list(data.targetLineup ?? [], `${path}.targetLineup`, (item, itemPath) => {
    const piece = readTargetPiece(item);
    if (!piece) invalid(itemPath);
    return piece;
  });
  if (targetLineup.length > targetLineupSize) invalid(`${path}.targetLineup`);
  const endgamePlans = data.endgamePlans === undefined
    ? [initialEndgamePlan(targetLineup, targetLineupSize)]
    : list(data.endgamePlans, `${path}.endgamePlans`, (item, itemPath) => {
      const plan = readEndgamePlan(item, Object.hasOwn(data, "activeEndgamePlanId"));
      if (!plan) invalid(itemPath);
      return plan;
    });
  const planIds = new Set(endgamePlans.map(({ id }) => id));
  if (planIds.size !== endgamePlans.length) invalid(`${path}.endgamePlans`);
  function readCounts(field, isCovenant) {
    const fieldPath = `${path}.${field}`;
    return Object.fromEntries(Object.entries(object(data[field] === undefined ? {} : data[field], fieldPath))
      .filter(([name]) => isCovenant(name))
      .map(([name, count]) => {
        if (!validCovenantLayerCount(count)) invalid(`${fieldPath}.${name}`);
        return [name, count];
      }).filter(([, count]) => count > 0));
  }
  return {
    lineupSize: data.lineupSize,
    considerHeld: bool(data.considerHeld ?? true, `${path}.considerHeld`),
    directedSearch: bool(data.directedSearch ?? false, `${path}.directedSearch`),
    stackingEnabled: bool(data.stackingEnabled ?? false, `${path}.stackingEnabled`),
    collapsed: bool(data.collapsed, `${path}.collapsed`),
    lineupView: choice(data.lineupView ?? "recommended", ["recommended", "target"], `${path}.lineupView`),
    targetLineup,
    targetLineupSize,
    endgamePlans,
    affinityBonds: normalizeAffinityBonds(list(data.affinityBonds ?? [], `${path}.affinityBonds`, (item, itemPath) => {
      const pair = readAffinityBond(item);
      if (!pair) invalid(itemPath);
      return pair;
    })),
    covenantIcons: bool(data.covenantIcons ?? false, `${path}.covenantIcons`),
    covenantPanel: choice(data.covenantPanel ?? "potential", ["potential", "extra", "extra-additional"], `${path}.covenantPanel`),
    covenantPanelCollapsed: bool(data.covenantPanelCollapsed ?? false, `${path}.covenantPanelCollapsed`),
    targetCovenantNames: [...new Set(list(data.targetCovenantNames ?? [], `${path}.targetCovenantNames`, text)
      .filter((name) => Object.hasOwn(version.covenants, name)))],
    covenantLayers: readCounts("covenantLayers", (name) => Object.hasOwn(version.covenants, name)),
    extraCoreCounts: readCounts("extraCoreCounts", (name) => version.covenants[name]?.group === CORE_GROUP),
    extraAdditionalCounts: readCounts("extraAdditionalCounts", (name) => version.covenants[name]?.group === ADDITIONAL_GROUP),
    pieces: Object.fromEntries(Object.entries(object(data.pieces, `${path}.pieces`)).map(([name, counts]) => {
      const piece = readPieceCounts(counts, getPromotionCopies(name, version));
      if (!name || !piece) invalid(`${path}.pieces.${name}`);
      return [name, piece];
    })),
  };
}

export function parseToolkitConfiguration(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("无法读取 JSON 配置文件。");
  }
  if (data?.format !== CONFIG_FORMAT || data?.schemaVersion !== CONFIG_VERSION) {
    throw new Error("请选择 AKSP-Toolkit 导出的受支持配置文件。");
  }
  const game = object(data.game, "game");
  const panel = object(game.teamPanel, "game.teamPanel");
  if (data.page === "analysis" && data.analysis === null) invalid("analysis");
  if (!Number.isInteger(game.teamLimit)) invalid("game.teamLimit");
  return {
    format: CONFIG_FORMAT,
    schemaVersion: CONFIG_VERSION,
    versionId: choice(data.versionId, versionIds, "versionId"),
    page: choice(data.page === "game" && game.tab === "weights" ? "strategy" : data.page,
      ["game", "analysis", "strategy"], "page"),
    strategyTab: choice(data.strategyTab ?? (game.tab === "weights" ? "weights" : "target"),
      ["target", "affinity", "weights", "classification"], "strategyTab"),
    terminals: byVersion(data.terminals, "terminals", (names, path) => [...new Set(list(names, path, text))]),
    weights: byVersion(data.weights, "weights", (weights, path, version) =>
      Object.fromEntries(Object.entries(object(weights, path))
        .filter(([name]) => Object.hasOwn(version.covenants, name))
        .map(([name, weight]) => {
          const group = version.covenants[name].group;
          return [name, normalizeCovenantWeight(number(weight, getCovenantWeightMin(group), getCovenantWeightMax(group), `${path}.${name}`), group)];
        }))),
    coefficients: byVersion(data.coefficients, "coefficients", (value, path) => normalizeTerminalCoefficient(
      number(value, 0, Number.MAX_SAFE_INTEGER / 100, path),
    )),
    ...(data.pairCoefficients === undefined ? {} : {
      pairCoefficients: byVersion(data.pairCoefficients, "pairCoefficients", (value, path) =>
        normalizePairCoefficient(number(value, 1, Number.MAX_SAFE_INTEGER / 100, path))),
    }),
    ...(data.heldLineupChangeCoefficients === undefined ? {} : {
      heldLineupChangeCoefficients: byVersion(data.heldLineupChangeCoefficients, "heldLineupChangeCoefficients", (value, path) =>
        normalizeHeldLineupChangeCoefficient(number(value, 1, Number.MAX_SAFE_INTEGER / 100, path))),
    }),
    ...(data.stackingCoefficients === undefined ? {} : {
      stackingCoefficients: byVersion(data.stackingCoefficients, "stackingCoefficients", (value, path) =>
        normalizeStackingCoefficient(number(value, 1, Number.MAX_SAFE_INTEGER / 100, path))),
    }),
    ...(data.stackableCovenantCoefficients === undefined ? {} : {
      stackableCovenantCoefficients: byVersion(data.stackableCovenantCoefficients, "stackableCovenantCoefficients", (value, path) =>
        normalizeStackableCovenantCoefficient(number(value, 1, Number.MAX_SAFE_INTEGER / 100, path))),
    }),
    ...(data.tierBasePoints === undefined ? {} : {
      tierBasePoints: byVersion(data.tierBasePoints, "tierBasePoints", (value, path) => {
        const points = list(value, path, (item, itemPath) => number(item, 0, Number.MAX_SAFE_INTEGER / 100, itemPath));
        if (points.length !== RANKING_TIERS.length) invalid(path);
        return normalizeTierBasePoints(points);
      }),
    }),
    ...(data.covenantFunctions === undefined ? {} : {
      covenantFunctions: byVersion(data.covenantFunctions, "covenantFunctions", (value, path, version) =>
        normalizeCovenantFunctionOverrides(object(value, path), version)),
    }),
    ...(data.inventory === undefined ? {} : { inventory: byVersion(data.inventory, "inventory", readInventory) }),
    game: {
      tab: choice(game.tab, ["pool", "equip", "team", "weights"], "game.tab"),
      teamLimit: number(game.teamLimit, 1, 20, "game.teamLimit"),
      team: list(game.team, "game.team", operator),
      savedTeams: list(game.savedTeams, "game.savedTeams", team),
      collections: list(game.collections, "game.collections", collection),
      stagedEquipments: list(game.stagedEquipments, "game.stagedEquipments", text),
      selectedEquipment: text(game.selectedEquipment, "game.selectedEquipment"),
      savedTeamsExpanded: bool(game.savedTeamsExpanded, "game.savedTeamsExpanded"),
      teamPanel: {
        collapsed: bool(panel.collapsed, "game.teamPanel.collapsed"),
        effectsExpanded: bool(panel.effectsExpanded, "game.teamPanel.effectsExpanded"),
      },
      pool: readPool(game.pool),
    },
    analysis: readAnalysis(data.analysis),
  };
}
