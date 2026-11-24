import { CORE_GROUP, getEffectiveOperatorCovenants, getOperatorTraits } from "../data/versions.js";

export function getStackableLineupCovenants(version, lineup, activeNames, layers, held = []) {
  const active = new Set(activeNames);
  if (!active.size) return active;

  const maxLayers = Math.max(...activeNames.map((name) => layers[name] ?? 0));
  const remaining = new Map(held.map(({ name, normal, promoted }) => [name, normal + promoted]));
  for (const { name } of lineup) remaining.set(name, (remaining.get(name) ?? 0) - 1);
  const bench = held.filter(({ name }) => remaining.get(name) > 0);
  const stackable = new Set();

  function addMemberships(pieces) {
    for (const piece of pieces) {
      for (const name of getEffectiveOperatorCovenants(piece, version)) {
        if (active.has(name)) stackable.add(name);
      }
    }
  }

  for (const [index, piece] of lineup.entries()) {
    for (const trait of getOperatorTraits(piece.name, version)) {
      if (trait.type !== "持续叠加") continue;
      const text = (piece.promoted ? trait.upgraded || trait.description : trait.description) ?? "";
      // Match the named recipients of layer gains, including traits whose condition mentions another covenant.
      const grants = text.matchAll(/((?:【[^】]+】(?:[/／](?=【))?)+)(?:盟约获得强化|(?:盟约)?(?:临时|固定)?层数(?:[+＋]|为固定)|叠加等同)/g);
      for (const [, names] of grants) {
        for (const [, name] of names.matchAll(/【([^】]+)】/g)) {
          if (active.has(name)) stackable.add(name);
        }
      }
      if (/已激活的核心盟约层数[+＋]/.test(text)) {
        for (const name of active) if (version.covenants[name]?.group === CORE_GROUP) stackable.add(name);
      }
      if (/已?激活且层数最多的盟约层数[+＋]/.test(text)) {
        for (const name of active) if ((layers[name] ?? 0) === maxLayers) stackable.add(name);
      }
      if (/自身(?:已激活|及|以及|所属已激活)|^(?:分别)?层数[+＋]/.test(text)) {
        // A quoted self-targeted effect can belong to a teammate that receives the trait.
        const grantsToTeammate = /干员获得特质/.test(text);
        if (!grantsToTeammate) addMemberships([piece]);
        if (grantsToTeammate || /自身(?:及|以及)|被召唤干员已激活的盟约层数/.test(text)) {
          // The lineup has no positions. Any other deployed piece is a potential recipient.
          addMemberships(lineup.filter((_, otherIndex) => otherIndex !== index));
        }
      }
      if (/使整备区每名干员已激活的盟约层数[+＋]/.test(text)) addMemberships(bench);
    }
  }
  return stackable;
}
