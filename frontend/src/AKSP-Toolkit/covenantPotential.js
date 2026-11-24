import { ADDITIONAL_GROUP, CORE_GROUP, getOperatorCovenants, getOperatorTier, isOperatorBanned } from "../data/versions.js";
import { canActivateFromHolding, getCovenantMemberThresholds, HARMONY_COVENANT } from "../composables/useCovenantStats.js";
import { rankCovenantStackers } from "./covenantStackerPotential.js";

const EXCLUDED_ADDITIONAL_COVENANTS = new Set(["绝技", "独行"]);

// Membership combinations are interchangeable for this analysis. Each bit of a
// reachable state is a distinct lineup size that can meet the tracked counts.
function reachableSizes(operators, requirements, limit, required = []) {
  if (required.length > limit || limit < 0) return 0;
  const groups = new Map();
  const caps = requirements.map(({ count }) => count);
  const available = caps.map(() => 0);
  const strides = caps.map((_, index) => caps.slice(0, index).reduce((size, cap) => size * (cap + 1), 1));
  const size = caps.reduce((product, cap) => product * (cap + 1), 1);
  const sizeMask = (1 << (limit + 1)) - 1;
  const requiredSet = new Set(required);
  let startingState = 0;
  const startingCounts = caps.map(() => 0);
  for (const memberships of operators) {
    let mask = 0;
    for (const [index, { name }] of requirements.entries()) {
      if (!memberships.has(name)) continue;
      mask |= 1 << index;
      available[index]++;
    }
    if (requiredSet.has(memberships)) {
      for (let index = 0; index < caps.length; index++) {
        if ((mask & (1 << index)) && startingCounts[index] < caps[index]) {
          startingCounts[index]++;
          startingState += strides[index];
        }
      }
    } else groups.set(mask, (groups.get(mask) ?? 0) + 1);
  }
  if (caps.some((cap, index) => cap > available[index] || cap > limit)) return 0;

  let states = new Uint32Array(size);
  states[startingState] = 1 << required.length;
  for (const [mask, members] of groups) {
    const next = states.slice();
    const quantity = Math.min(members, limit);
    for (let state = 0; state < size; state++) {
      if (!states[state]) continue;
      for (let taken = 1; taken <= quantity; taken++) {
        let destination = state;
        for (let index = 0; index < caps.length; index++) {
          if (!(mask & (1 << index))) continue;
          const cap = caps[index];
          const before = Math.floor(state / strides[index]) % (cap + 1);
          destination += (Math.min(cap, before + taken) - before) * strides[index];
        }
        next[destination] |= (states[state] << taken) & sizeMask;
      }
    }
    states = next;
  }
  return states[size - 1];
}

// Multi-core requirements mostly draw from distinct groups. Enumerate only
// operators who can fill several requirements, then fill each deficit directly.
function multiCoreSizes(operators, requirements, limit) {
  const singles = requirements.map(() => 0);
  const shared = [];
  for (const memberships of operators) {
    const index = requirements.flatMap(({ name }, i) => memberships.has(name) ? [i] : []);
    if (index.length === 1) singles[index[0]]++;
    if (index.length > 1) shared.push(index);
  }
  const counts = requirements.map(({ count }) => count);
  let minimum = Math.min(limit, operators.length) + 1;
  function search(index, taken) {
    if (taken >= minimum) return;
    if (index === shared.length) {
      if (counts.every((count, i) => count <= singles[i])) {
        minimum = Math.min(minimum, taken + counts.reduce((sum, count) => sum + Math.max(0, count), 0));
      }
      return;
    }
    search(index + 1, taken);
    const covered = shared[index];
    if (!covered.some((i) => counts[i] > 0)) return;
    covered.forEach((i) => counts[i]--);
    search(index + 1, taken + 1);
    covered.forEach((i) => counts[i]++);
  }
  search(0, 0);
  return (1 << (Math.min(limit, operators.length) + 1)) - (1 << minimum);
}

export function analyzeCovenantPotential(version, operators, bannedNames, limit) {
  const bans = new Set(bannedNames);
  const unique = new Map();
  const ignored = new Set();
  for (const { name, tier } of operators) {
    if (!tier && !getOperatorTier(name, version)) {
      ignored.add(name);
      continue;
    }
    const memberships = getOperatorCovenants(name, version);
    if (!unique.has(name) && !isOperatorBanned(memberships, bans, version)) unique.set(name, new Set(memberships));
  }
  const available = [...unique.values()];
  const covenants = version.covenants;
  const thresholds = new Map(Object.keys(covenants).map((name) => [name, getCovenantMemberThresholds(name, covenants)]));
  const countFor = (name, pool) => pool.reduce((total, memberships) => total + Number(memberships.has(name)), 0);
  const fullSize = 1 << limit;
  const harmonyCount = thresholds.get(HARMONY_COVENANT)?.[0];
  const additionalNames = Object.keys(covenants).filter((name) =>
    covenants[name].group === ADDITIONAL_GROUP && !EXCLUDED_ADDITIONAL_COVENANTS.has(name) && !bans.has(name));
  const poolCounts = new Map(additionalNames.map((name) => [name, countFor(name, available)]));
  const holdingCovenants = new Set(additionalNames.filter((name) => canActivateFromHolding(name, version)));
  const describe = (sizes) => ({
    canActivate: Boolean(sizes), full: Boolean(sizes & fullSize),
    minSlots: sizes ? 31 - Math.clz32(sizes & -sizes) : null,
  });

  function feasibleSizes(coreRequirements, additional = [], requiredNames = [], omitted = []) {
    const excluded = new Set(omitted.map((name) => unique.get(name)));
    const pool = excluded.size ? available.filter((memberships) => !excluded.has(memberships)) : available;
    const required = requiredNames.map((name) => unique.get(name));
    // A member known to be recruitable can satisfy a holding covenant whether
    // that member is deployed or kept in reserve.
    if (additional.some((name) => holdingCovenants.has(name) && poolCounts.get(name) < thresholds.get(name)[0])) return 0;
    const requirements = additional.filter((name) => !holdingCovenants.has(name)).map((name) => ({
      name, count: thresholds.get(name)[0],
    }));
    const solve = !additional.length && !required.length && coreRequirements.length > 2 ? multiCoreSizes : reachableSizes;
    const direct = solve(pool, [...coreRequirements, ...requirements], limit, required);
    if (!harmonyCount || coreRequirements.every(({ count }) => count < 2)) return direct;
    // Harmony shares the same squad slots and only reduces the core's requirement by one.
    const withHarmony = requirements.some(({ name }) => name === HARMONY_COVENANT)
      ? requirements : [...requirements, { name: HARMONY_COVENANT, count: harmonyCount }];
    const reduced = coreRequirements.map(({ name, count }) => ({ name, count: Math.max(1, count - 1) }));
    return direct | solve(pool, [...reduced, ...withHarmony], limit, required);
  }

  const cores = Object.keys(covenants).filter((name) => covenants[name].group === CORE_GROUP && !bans.has(name)).map((name) => {
    const corePool = available.filter((memberships) => memberships.has(name));
    const sidesFor = (level) => additionalNames.map((side) => {
      const [threshold] = thresholds.get(side);
      const unknown = !threshold;
      const sizes = level?.canActivate && !unknown ? feasibleSizes([{ name, count: level.threshold }], [side]) : 0;
      return {
        name: side, coreCount: countFor(side, corePool), poolCount: poolCounts.get(side),
        threshold, unknown, fromHolding: holdingCovenants.has(side),
        ...describe(sizes),
      };
    });
    const levels = thresholds.get(name).map((threshold) => ({ threshold, ...describe(feasibleSizes([{ name, count: threshold }])) }));
    const base = levels[0];
    const sides = sidesFor(base);
    const advanced = levels.slice(1).map((level, index) => ({
      ...level, level: index + 2, sides: sidesFor(level),
    }));
    const compatible = sides.filter(({ canActivate }) => canActivate);
    const pairs = compatible.flatMap((left, index) => compatible.slice(index + 1).map((right) => {
      const sizes = feasibleSizes([{ name, count: base.threshold }], [left.name, right.name]);
      return { names: [left.name, right.name], ...describe(sizes) };
    }));
    return { name, count: corePool.length, levels, sides, pairs, advanced };
  });

  function multiCore() {
    const options = cores.filter(({ levels }) => levels[0]?.canActivate)
      .map(({ name, levels }) => ({ name, count: levels[0].threshold }));
    let frontier = [{ requirements: [], next: 0 }];
    let best = [];
    while (frontier.length) {
      const next = frontier.flatMap(({ requirements, next }) => options.slice(next).flatMap((option, index) => {
        const combination = [...requirements, option];
        const sizes = feasibleSizes(combination);
        return sizes ? [{ requirements: combination, sizes, next: next + index + 1 }] : [];
      }));
      if (next.length) best = next;
      frontier = next;
    }
    return best.map(({ requirements, sizes }) => {
      const names = requirements.map(({ name }) => name);
      const indispensable = [...unique].filter(([name, memberships]) =>
        (names.some((core) => memberships.has(core)) || memberships.has(HARMONY_COVENANT))
        && !feasibleSizes(requirements, [], [], [name])).map(([name]) => name);
      return { names, indispensable, ...describe(sizes) };
    }).sort((a, b) => Number(b.full) - Number(a.full) || a.minSlots - b.minSlots);
  }

  function stackersFor(core, level, side) {
    const count = thresholds.get(core)?.[level - 1];
    if (!count || !poolCounts.has(side) || !thresholds.get(side)[0]) return [];
    const requirements = [{ name: core, count }];
    const canField = (names, reserve) => Boolean(feasibleSizes(requirements, [side], names, reserve));
    return rankCovenantStackers(version, unique, [core, side], limit, canField);
  }

  return { poolSize: available.length, ignoredCount: ignored.size, limit, cores, multiCore, stackersFor };
}
