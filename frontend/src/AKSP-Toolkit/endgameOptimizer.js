export const ENDGAME_LINEUP_SIZES = [7, 8, 9];

// Operators with the same membership and piece score are interchangeable. Multiple
// copies of one operator occupy separate slots but contribute their memberships once.
export function findBestLineups({ candidates, covenants, initialCounts, extraCounts, harmonyIndex }, size, count) {
  const grouped = new Map();
  const groups = [];
  let capacity = 0;
  for (const { name, members, heldOverlap, normal, promoted, normalPoints, promotedPoints } of candidates) {
    const pieces = [true, false].flatMap((upgraded) => Array.from({ length: Math.min(size, upgraded ? promoted : normal) },
      () => ({ name, promoted: upgraded, points: upgraded ? promotedPoints : normalPoints })));
    capacity += pieces.length;
    if (pieces.length > 1) {
      groups.push({ pieces, members, heldOverlap, unique: false });
    } else if (pieces.length) {
      const key = `${members.join(",")}:${heldOverlap.join(",")}:${pieces[0].points}`;
      if (!grouped.has(key)) {
        const group = { pieces: [], members, heldOverlap, unique: true };
        grouped.set(key, group);
        groups.push(group);
      }
      grouped.get(key).pieces.push(pieces[0]);
    }
  }
  if (capacity < size) return [];
  const groupValue = (group) => group.members.reduce((sum, index) => {
    const { thresholds, baseWeight } = covenants[index];
    return sum + baseWeight / Math.max(1, thresholds[0] - initialCounts[index] - Math.min(size, extraCounts[index]));
  }, group.pieces[0].points);
  groups.sort((a, b) => groupValue(b) - groupValue(a) || b.pieces.length - a.pieces.length);

  const counts = [...initialCounts];
  const overlapCounts = new Int32Array(covenants.length);
  let deployedSize = 0;
  const harmonyThreshold = covenants[harmonyIndex]?.thresholds[0] ?? Infinity;
  const allCounts = groups.reduce((available, { members, pieces, unique }) => {
    for (const index of members) available[index] += unique ? pieces.length : 1;
    return available;
  }, new Int32Array(covenants.length));
  const suffixCounts = [allCounts];
  const suffixSizes = [capacity];
  for (const { pieces, members, unique } of groups) {
    const next = suffixCounts.at(-1).slice();
    for (const index of members) next[index] -= unique ? pieces.length : 1;
    suffixCounts.push(next);
    suffixSizes.push(suffixSizes.at(-1) - pieces.length);
  }

  const best = [];
  const cutoff = () => best.length === count ? best.at(-1).score : -Infinity;
  const chosen = new Uint8Array(groups.length);
  const slopes = new Float64Array(covenants.length);
  const top = new Float64Array(size);

  function countForLevel(raw, covenant, harmony) {
    return raw + Number(covenant.core && raw > 0 && harmony);
  }

  function countWithExtras(index, maxDeployed) {
    const naturalOnField = counts[index] - initialCounts[index] + overlapCounts[index];
    return counts[index] + Math.min(extraCounts[index], maxDeployed - naturalOnField);
  }

  function rewardForLevels(covenant, levels) {
    return levels > 0 ? covenant.baseWeight + (levels - 1) * covenant.advancedWeight : 0;
  }

  function currentScore() {
    const harmony = harmonyIndex >= 0 && countWithExtras(harmonyIndex, deployedSize) >= harmonyThreshold;
    return covenants.reduce((sum, covenant, index) => {
      const members = countForLevel(countWithExtras(index, deployedSize), covenant, harmony);
      return sum + rewardForLevels(covenant, covenant.thresholds.filter((level) => members >= level).length);
    }, 0);
  }

  function offer(pieces, score) {
    if (score <= cutoff()) return;
    const key = JSON.stringify(pieces.map(({ name, promoted }) => JSON.stringify([name, promoted])).sort());
    if (best.some((entry) => entry.key === key)) return;
    best.push({ key, pieces, score });
    best.sort((a, b) => b.score - a.score);
    if (best.length > count) best.pop();
  }

  function offerChosen(score) {
    if (score <= cutoff()) return;
    offer(groups.flatMap((group, index) => group.pieces.slice(0, chosen[index])), score);
    // A different name from any partially used group supplies a second combination
    // at this same score when the caller asks for two lineups.
    if (count < 2 || score <= cutoff()) return;
    const alternate = groups.findIndex((group, index) => group.unique && chosen[index] > 0 && chosen[index] < group.pieces.length);
    if (alternate < 0) return;
    offer(groups.flatMap((group, index) => index === alternate
      ? group.pieces.slice(1, chosen[index] + 1) : group.pieces.slice(0, chosen[index])), score);
  }

  function change(group, quantity) {
    deployedSize += quantity;
    for (const index of group.members) counts[index] += quantity;
    for (const index of group.heldOverlap) overlapCounts[index] += quantity;
  }

  function upperBound(start, remaining, pieceScore) {
    const available = suffixCounts[start];
    // Give all remaining slots credit as distinct recipients to bound possible grants from above.
    const maxDeployed = deployedSize + remaining;
    const harmony = harmonyIndex >= 0
      && countWithExtras(harmonyIndex, maxDeployed) + Math.min(remaining, available[harmonyIndex]) >= harmonyThreshold;
    let free = pieceScore;
    for (let index = 0; index < covenants.length; index++) {
      const covenant = covenants[index];
      const raw = countWithExtras(index, maxDeployed);
      const maxAdded = Math.min(remaining, available[index]);
      const present = countForLevel(raw, covenant, harmony);
      let unlocked = 0;
      let slope = 0;
      for (let level = 0; level < covenant.thresholds.length; level++) {
        const threshold = covenant.thresholds[level];
        if (threshold <= present) {
          unlocked++;
          continue;
        }
        const required = Math.max(1, threshold - raw - Number(harmony && covenant.core));
        if (required > maxAdded) break;
        const reward = rewardForLevels(covenant, level + 1) - rewardForLevels(covenant, unlocked);
        slope = Math.max(slope, reward / required);
      }
      free += rewardForLevels(covenant, unlocked);
      slopes[index] = slope;
    }
    top.fill(0);
    for (let index = start; index < groups.length; index++) {
      const { members, pieces, unique } = groups[index];
      let covenantPoints = 0;
      for (const member of members) covenantPoints += slopes[member];
      if (unique) insertTop(covenantPoints + pieces[0].points, pieces.length, remaining);
      else {
        insertTop(covenantPoints + pieces[0].points, 1, remaining);
        for (let i = 1; i < pieces.length; i++) insertTop(pieces[i].points, 1, remaining);
      }
    }
    let bound = free;
    for (let position = 0; position < remaining; position++) bound += top[position];
    // Each attainable threshold is paid for by the members it still needs. The best
    // per-member rate and the top remaining operators relax that budget upwards.
    return Math.floor(bound + Number.EPSILON * Math.abs(bound) * 32);
  }

  function insertTop(points, quantity, remaining) {
    if (points <= top[remaining - 1]) return;
    let position = 0;
    while (top[position] >= points) position++;
    const copies = Math.min(remaining - position, quantity);
    top.copyWithin(position + copies, position, remaining - copies);
    top.fill(points, position, position + copies);
  }

  function search(start, remaining, pieceScore) {
    if (!remaining) {
      offerChosen(pieceScore + currentScore());
      return;
    }
    if (suffixSizes[start] < remaining || upperBound(start, remaining, pieceScore) <= cutoff()) return;
    for (let index = start; index < groups.length && suffixSizes[index] >= remaining; index++) {
      const group = groups[index];
      const maxQuantity = Math.min(remaining, group.pieces.length);
      let points = 0;
      for (let i = 0; i < maxQuantity; i++) points += group.pieces[i].points;
      for (let quantity = maxQuantity; quantity >= 1; quantity--) {
        chosen[index] = quantity;
        const members = group.unique ? quantity : 1;
        change(group, members);
        search(index + 1, remaining - quantity, pieceScore + points);
        change(group, -members);
        points -= group.pieces[quantity - 1].points;
      }
      chosen[index] = 0;
    }
  }

  search(0, size, 0);
  return best.map(({ pieces, score }) => ({
    names: pieces.map(({ name }) => name), pieces: pieces.map(({ name, promoted }) => ({ name, promoted })), score,
  }));
}
