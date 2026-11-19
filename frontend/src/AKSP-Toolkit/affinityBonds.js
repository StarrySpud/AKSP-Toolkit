export const AFFINITY_BOND_LABEL = "相性羁绊";
export const AFFINITY_BOND_COLOR = "#f4e0ff";

export function readAffinityBond(value) {
  if (!Array.isArray(value) || value.length !== 2 || value.some((name) => typeof name !== "string")) return null;
  const pair = value.map((name) => name.trim()).sort();
  return pair[0] && pair[0] !== pair[1] ? pair : null;
}

export const affinityBondKey = (pair) => JSON.stringify(pair);

export function normalizeAffinityBonds(value) {
  if (!Array.isArray(value)) return [];
  const pairs = value.map(readAffinityBond).filter(Boolean);
  return [...new Map(pairs.map((pair) => [affinityBondKey(pair), pair])).values()];
}
