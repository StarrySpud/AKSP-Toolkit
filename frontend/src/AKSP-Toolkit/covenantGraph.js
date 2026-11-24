import { ADDITIONAL_GROUP, CORE_GROUP, getOperatorCovenants, getOperatorTier, hasStackingTrait, isOperatorBanned } from "../data/versions.js";
import { AFFINITY_BOND_COLOR, AFFINITY_BOND_LABEL, normalizeAffinityBonds } from "./affinityBonds.js";

export const TERMINAL_LABEL = "终端干员";
export const TERMINAL_COLOR = "#ffe2ab";
export const UNGROUPED_COLOR = "#bac5d5";
export const COVENANT_LINE_WIDTHS = [0.3, 0.5, 0.75, 1.3, 2.15];
export const DEFAULT_LINE_LEVEL = 3;
const covenantsWithoutEdges = new Set(["独行", "绝技", "调和"]);
const goldenAngle = Math.PI * (3 - Math.sqrt(5));

export function supportsCovenantEdges(name) {
  return !covenantsWithoutEdges.has(name);
}

function spherePoint(index, count) {
  const y = (2 * (index + 0.5)) / count - 1;
  const radius = Math.sqrt(1 - y * y);
  const angle = index * goldenAngle;
  return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
}

function placeClusters(groups, terminalGroup) {
  const clusters = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const mainCount = clusters.length;
  if (terminalGroup.nodes.length) clusters.push(terminalGroup);
  const hasTerminalCluster = terminalGroup.nodes.length > 0;

  clusters.forEach((cluster, index) => {
    const isTerminal = cluster === terminalGroup;
    if (isTerminal) {
      cluster.center = mainCount ? [178, -28, 34] : [0, 0, 0];
    } else {
      const center = mainCount > 1
        ? spherePoint(index, mainCount).map((value) => value * (mainCount > 12 ? 144 : 128))
        : [0, 0, 0];
      if (hasTerminalCluster) center[0] -= 33;
      cluster.center = center;
    }

    const maxRadius = clusters.length === 1 ? 125 : isTerminal ? 38 : 54;
    cluster.nodes.forEach((node, nodeIndex) => {
      const count = cluster.nodes.length;
      const radius = count === 1 ? 0
        : Math.min(maxRadius, 12 + 9 * Math.cbrt(count)) * Math.cbrt((nodeIndex + 0.5) / count);
      node.position = spherePoint(nodeIndex, count)
        .map((value, axis) => cluster.center[axis] + value * radius);
    });
  });

  return clusters;
}

export function buildCovenantGraph(version, operators, banned, {
  clusterBy = CORE_GROUP,
  terminalNames = [],
  clusterTerminal = false,
  covenantOrder = {},
  affinityBonds = [],
} = {}) {
  const banSet = new Set(banned);
  const terminals = new Set(terminalNames);
  const groups = new Map();
  const terminalGroup = { name: TERMINAL_LABEL, color: TERMINAL_COLOR, nodes: [] };
  const members = new Map();
  const names = Object.keys(version.covenants);
  const legend = [
    { group: CORE_GROUP, firstHue: 0, saturation: 83, lightness: 64 },
    { group: ADDITIONAL_GROUP, firstHue: 12, saturation: 69, lightness: 75 },
  ].flatMap(({ group, firstHue, saturation, lightness }) => {
    const defaultOrder = names.filter((name) => version.covenants[name].group === group);
    const customOrder = (covenantOrder[group] || []).filter((name) => defaultOrder.includes(name));
    const orderedNames = [...new Set([...customOrder, ...defaultOrder])];
    return orderedNames.map((name, index) => ({
      name,
      group,
      color: `hsl(${((firstHue + (360 * index) / orderedNames.length) % 360).toFixed(1)} ${saturation}% ${lightness}%)`,
      banned: banSet.has(name),
    }));
  });
  const colorByCovenant = new Map(legend.map(({ name, color }) => [name, color]));
  const nodes = [];
  const seen = new Set();

  for (const operator of operators) {
    const { name, avatar } = operator;
    if (seen.has(name)) continue;
    seen.add(name);
    const memberships = getOperatorCovenants(name, version);
    if (isOperatorBanned(memberships, banSet, version)) continue;
    const covenants = [...new Set(memberships)].filter((covenant) => version.covenants[covenant]);

    const coreCovenant = covenants.find((covenant) => version.covenants[covenant].group === CORE_GROUP);
    const groupingCovenant = clusterBy === ADDITIONAL_GROUP
      ? covenants.find((covenant) => version.covenants[covenant].group === ADDITIONAL_GROUP)
      : coreCovenant;
    const clusterName = groupingCovenant || (clusterBy === ADDITIONAL_GROUP ? "无附加盟约" : "无核心盟约");
    const isTerminal = terminals.has(name);
    const color = colorByCovenant.get(groupingCovenant) || UNGROUPED_COLOR;
    const node = {
      name, avatar, tier: operator.tier || getOperatorTier(name, version), covenants, isTerminal,
      hasStackingTrait: hasStackingTrait(name, version),
      clusterName: clusterTerminal && isTerminal ? TERMINAL_LABEL : clusterName,
      color: clusterTerminal && isTerminal ? TERMINAL_COLOR : color,
    };
    nodes.push(node);

    if (clusterTerminal && isTerminal) {
      terminalGroup.nodes.push(node);
    } else {
      if (!groups.has(clusterName)) groups.set(clusterName, { name: clusterName, color, nodes: [] });
      groups.get(clusterName).nodes.push(node);
    }
    for (const covenant of covenants) {
      if (!supportsCovenantEdges(covenant)) continue;
      if (!members.has(covenant)) members.set(covenant, []);
      members.get(covenant).push(node);
    }
  }

  const clusters = placeClusters(groups, terminalGroup);

  const edges = [];
  const neighbors = new Map(nodes.map((node) => [node, new Set()]));
  const parallelEdges = new Map();
  const indexByNode = new Map(nodes.map((node, index) => [node, index]));
  function addEdge(first, second, covenant) {
    const [source, target] = indexByNode.get(first) < indexByNode.get(second) ? [first, second] : [second, first];
    const key = `${indexByNode.get(source)}:${indexByNode.get(target)}`;
    if (!parallelEdges.has(key)) parallelEdges.set(key, []);
    const edge = { source, target, covenant, color: colorByCovenant.get(covenant) };
    parallelEdges.get(key).push(edge);
    edges.push(edge);
    neighbors.get(source).add(target);
    neighbors.get(target).add(source);
  }
  for (const [covenant, group] of members) {
    for (let first = 0; first < group.length; first++) {
      for (let second = first + 1; second < group.length; second++) {
        addEdge(group[first], group[second], covenant);
      }
    }
  }
  const affinityMembers = new Set();
  const affinityOnlyNeighbors = new Map();
  const nodesByName = new Map(nodes.map((node) => [node.name, node]));
  for (const [first, second] of normalizeAffinityBonds(affinityBonds)) {
    const source = nodesByName.get(first);
    const target = nodesByName.get(second);
    if (!source || !target) continue;
    if (!neighbors.get(source).has(target)) {
      affinityOnlyNeighbors.set(source, (affinityOnlyNeighbors.get(source) ?? 0) + 1);
      affinityOnlyNeighbors.set(target, (affinityOnlyNeighbors.get(target) ?? 0) + 1);
    }
    affinityMembers.add(source);
    affinityMembers.add(target);
    colorByCovenant.set(AFFINITY_BOND_LABEL, AFFINITY_BOND_COLOR);
    addEdge(source, target, AFFINITY_BOND_LABEL);
  }
  for (const pair of parallelEdges.values()) {
    pair.forEach((edge, index) => {
      edge.offset = index - (pair.length - 1) / 2;
    });
  }

  return { nodes, edges, neighbors, clusters, legend, colorByCovenant, affinityMembers, affinityOnlyNeighbors };
}
