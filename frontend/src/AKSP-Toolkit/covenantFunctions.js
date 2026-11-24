import { CORE_GROUP } from "../data/versions.js";
import { getCovenantMemberThresholds } from "../composables/useCovenantStats.js";

export const COVENANT_FUNCTIONS = [
  { id: "attack", label: "攻击" },
  { id: "economy", label: "经营" },
  { id: "survival", label: "生存" },
];

// Curated from the effects in each version. The first entry is the primary category.
const common = {
  炎: ["attack"],
  萨尔贡: ["attack"],
  维多利亚: ["attack", "economy"], // Equipment-based damage and recurring equipment rewards.
  谢拉格: ["attack"],
  拉特兰: ["attack"],
  阿戈尔: ["survival", "attack"],
  叙拉古: ["attack"],
  卡西米尔: ["attack"],
  精准: ["attack"],
  迅捷: ["attack"],
  灵巧: ["attack"],
  坚守: ["survival", "attack"],
  助力: ["survival", "attack"], // Defense and faster redeployment.
  远见: ["economy"],
  奇迹: ["economy"],
  投资人: ["economy"], // Repeats acquisition traits; the reward depends on the recruited operators.
  突袭: ["attack", "survival"],
  不屈: ["survival", "attack"],
  调和: ["economy"], // Lowers the number of core members needed to build a lineup.
  协防干员: ["survival", "attack"],
  独行: ["attack", "survival"],
  绝技: ["attack"],
  聚合: ["survival"],
  奥术: ["attack"],
};

const baseByVersion = {
  guicheng: {
    谢拉格: ["attack", "economy"], // Damage increase and an equipment reward.
    乌萨斯: ["attack", "survival"],
    伊比利亚: ["attack"],
    莱塔尼亚: ["attack"],
  },
};

const advancedByVersion = {
  mengyue: {
    炎: { 2: ["attack"], 3: ["attack", "survival"] },
    萨尔贡: { 2: ["attack"] },
    维多利亚: { 2: ["attack"] },
    谢拉格: { 2: ["survival"] }, // Repeated enemy Chill.
    拉特兰: { 2: ["attack"] },
    阿戈尔: { 2: ["survival"] }, // Revival.
    叙拉古: { 2: ["attack", "survival"] },
    卡西米尔: { 2: ["attack", "survival"] },
  },
  guicheng: {
    炎: { 2: ["attack"] },
    萨尔贡: { 2: ["attack", "survival"] },
    维多利亚: { 2: ["attack"] },
    谢拉格: { 2: ["attack", "survival"] },
    阿戈尔: { 2: ["survival"] },
    叙拉古: { 2: ["attack"] },
    卡西米尔: { 2: ["attack", "survival"] },
    乌萨斯: { 2: ["survival", "attack"] }, // Damage deferral and retaliatory spell damage.
    伊比利亚: { 2: ["attack", "survival"] },
    莱塔尼亚: { 2: ["attack"] },
  },
};

export function getCovenantFunctions(versionId, name, level = 1, overrides = {}) {
  const custom = Object.hasOwn(overrides, name) ? overrides[name][level] : undefined;
  if (custom) return custom;
  if (level > 1) return advancedByVersion[versionId]?.[name]?.[level] ?? [];
  return baseByVersion[versionId]?.[name] ?? (Object.hasOwn(common, name) ? common[name] : []);
}

export function additionalCovenantSortRank(tags) {
  if (tags.length > 1) return 2;
  return { attack: 0, survival: 1, economy: 3 }[tags[0]] ?? 4;
}

export function summarizeCovenantFunctions(versionId, entries, overrides = {}) {
  const categories = entries.map((entry) => {
    const { name, level } = typeof entry === "string" ? { name: entry } : entry;
    return getCovenantFunctions(versionId, name, level, overrides);
  });
  return COVENANT_FUNCTIONS.map((category) => ({
    ...category,
    count: categories.filter((tags) => tags.includes(category.id)).length,
  }));
}

export function covenantFunctionEntries(version) {
  return Object.entries(version.covenants).flatMap(([name, { group }]) => {
    const thresholds = getCovenantMemberThresholds(name, version.covenants);
    return group === CORE_GROUP && thresholds.length
      ? thresholds.map((threshold, index) => ({ name, group, threshold, level: index + 1 }))
      : [{ name, group, threshold: thresholds[0], level: 1 }];
  });
}

export function normalizeCovenantFunctionOverrides(value, version) {
  const entries = covenantFunctionEntries(version);
  const allowed = new Set(COVENANT_FUNCTIONS.map(({ id }) => id));
  const overrides = {};
  for (const { name, level } of entries) {
    const tags = value?.[name]?.[level];
    if (!Array.isArray(tags) || tags.length === 0 || tags.some((tag) => !allowed.has(tag))) continue;
    (overrides[name] ??= {})[level] = [...new Set(tags)];
  }
  return overrides;
}
