import { COVENANT_LINE_WIDTHS, DEFAULT_LINE_LEVEL, TERMINAL_COLOR } from "./covenantGraph.js";
import { AFFINITY_BOND_LABEL } from "./affinityBonds.js";

function project([x, y, z], view, width, height) {
  const horizontal = x * Math.cos(view.yaw) - z * Math.sin(view.yaw);
  const depth = x * Math.sin(view.yaw) + z * Math.cos(view.yaw);
  const vertical = y * Math.cos(view.pitch) - depth * Math.sin(view.pitch);
  const rotatedDepth = y * Math.sin(view.pitch) + depth * Math.cos(view.pitch);
  const perspective = 525 / (525 - rotatedDepth);
  const scale = (Math.min(width, height) / 450) * view.zoom * perspective;
  return { x: width / 2 + horizontal * scale, y: height / 2 + vertical * scale, scale, depth: rotatedDepth };
}

function drawClusterOutline(ctx, cluster, points) {
  const members = cluster.nodes.map((node) => points.get(node));
  const left = Math.min(...members.map(({ x, radius }) => x - radius));
  const right = Math.max(...members.map(({ x, radius }) => x + radius));
  const top = Math.min(...members.map(({ y, radius }) => y - radius));
  const bottom = Math.max(...members.map(({ y, radius }) => y + radius));
  ctx.beginPath();
  ctx.ellipse((left + right) / 2, (top + bottom) / 2, (right - left) * 0.65 + 6, (bottom - top) * 0.65 + 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = cluster.color;
  ctx.globalAlpha = 0.1;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = cluster.color;
  ctx.globalAlpha = 0.85;
  ctx.stroke();
}

function drawClusterLabels(ctx, clusters, points, view, width, height, highlightedCovenant) {
  const labels = clusters.map((cluster) => {
    const center = project(cluster.center, view, width, height);
    const nodes = cluster.nodes.map((node) => points.get(node));
    return {
      ...center,
      cluster,
      top: Math.min(...nodes.map((point) => point.y - point.radius)),
      bottom: Math.max(...nodes.map((point) => point.y + point.radius)),
    };
  }).sort((a, b) => a.top - b.top);

  const boxes = [];
  ctx.font = "600 12px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const { x, y, top, bottom, cluster } of labels) {
    if (x < 0 || x > width || bottom < 0 || top > height) continue;
    const labelWidth = ctx.measureText(cluster.name).width + 16;
    const labelHeight = 22;
    const left = Math.min(width - labelWidth - 6, Math.max(6, x - labelWidth / 2));
    const clampTop = (value) => Math.min(height - labelHeight - 34, Math.max(8, value));
    const offsets = [top - 28, bottom + 13, top - 53, bottom + 38, top - 78];
    const candidates = offsets.map((offset) => ({ left, top: clampTop(offset) }));
    const box = candidates.find((candidate) => !boxes.some((previous) =>
      candidate.left < previous.left + previous.width + 4 &&
      candidate.left + labelWidth + 4 > previous.left &&
      candidate.top < previous.top + labelHeight + 4 &&
      candidate.top + labelHeight + 4 > previous.top
    )) || candidates[0];
    boxes.push({ ...box, width: labelWidth });

    const labelX = box.left + labelWidth / 2;
    const labelY = box.top + labelHeight / 2;
    const dimmed = highlightedCovenant && cluster.name !== highlightedCovenant;
    ctx.lineWidth = cluster.name === highlightedCovenant ? 2 : 1;
    ctx.strokeStyle = cluster.color;
    ctx.globalAlpha = dimmed ? 0.2 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(labelX, labelY);
    ctx.stroke();
    ctx.globalAlpha = dimmed ? 0.65 : 0.94;
    ctx.fillStyle = "#101720";
    ctx.fillRect(box.left, box.top, labelWidth, labelHeight);
    ctx.globalAlpha = dimmed ? 0.5 : 1;
    ctx.strokeRect(box.left, box.top, labelWidth, labelHeight);
    ctx.fillStyle = "#f1f5fa";
    ctx.fillText(cluster.name, labelX, labelY);
  }
  ctx.globalAlpha = 1;
  ctx.textBaseline = "alphabetic";
}

export function drawCovenantGraph(ctx, {
  width, height, graph, view, mode, selected, imageFor, lineLevels, highlightedCovenant = "",
}) {
  ctx.clearRect(0, 0, width, height);
  const neighbors = graph.neighbors.get(selected);
  const highlightColor = graph.colorByCovenant.get(highlightedCovenant);
  const points = new Map(graph.nodes.map((node) => {
    const position = project(node.position, view, width, height);
    const radius = Math.max(3.5, Math.min(17, position.scale * (mode === "avatar" ? 9 : 4)));
    return [node, { node, ...position, radius: node === selected ? radius + 3 : radius }];
  }));
  const highlightedCluster = graph.clusters.find((cluster) => cluster.name === highlightedCovenant);
  if (highlightedCluster) drawClusterOutline(ctx, highlightedCluster, points);
  const strokes = new Map();

  for (const edge of graph.edges) {
    const connected = selected === edge.source || selected === edge.target;
    if (!highlightedCovenant && selected && !connected) continue;
    const { x, y } = points.get(edge.source);
    const end = points.get(edge.target);
    const length = Math.hypot(end.x - x, end.y - y) || 1;
    const emphasis = highlightedCovenant ? edge.covenant === highlightedCovenant : connected;
    const offset = edge.offset * (emphasis ? 3.5 : 1.2);
    const dx = ((end.y - y) / length) * offset;
    const dy = ((x - end.x) / length) * offset;
    if (!strokes.has(edge.covenant)) {
      strokes.set(edge.covenant, { color: edge.color, path: new Path2D() });
    }
    const { path } = strokes.get(edge.covenant);
    path.moveTo(x + dx, y + dy);
    path.lineTo(end.x + dx, end.y + dy);
  }

  const highlightedStroke = strokes.get(highlightedCovenant);
  if (highlightedStroke) {
    strokes.delete(highlightedCovenant);
    strokes.set(highlightedCovenant, highlightedStroke);
  }
  for (const [covenant, { color, path }] of strokes) {
    const level = lineLevels[covenant] ?? DEFAULT_LINE_LEVEL;
    const isAffinity = covenant === AFFINITY_BOND_LABEL;
    const emphasis = highlightedCovenant ? covenant === highlightedCovenant : Boolean(selected);
    ctx.globalAlpha = highlightedCovenant ? (emphasis ? 0.85 : 0.045) : selected ? 0.75 : isAffinity ? 0.55 : 0.18;
    ctx.lineWidth = COVENANT_LINE_WIDTHS[level - 1] * (emphasis ? 2 : 1);
    ctx.strokeStyle = color;
    if (isAffinity) ctx.setLineDash([4, 3]);
    ctx.stroke(path);
    if (isAffinity) ctx.setLineDash([]);
  }

  const sorted = [...points.values()].sort((a, b) => a.depth - b.depth);
  for (const point of sorted) {
    const { node, x, y } = point;
    const focused = node === selected;
    const member = highlightedCovenant === AFFINITY_BOND_LABEL
      ? graph.affinityMembers.has(node)
      : Boolean(highlightedCovenant) && node.covenants.includes(highlightedCovenant);
    const related = focused || (highlightedCovenant ? member : !selected || neighbors.has(node));
    ctx.globalAlpha = related ? 1 : 0.2;
    ctx.beginPath();
    ctx.arc(x, y, point.radius, 0, Math.PI * 2);
    ctx.fillStyle = node.color;
    ctx.fill();

    const image = mode === "avatar" ? imageFor(node.avatar) : null;
    if (image) {
      ctx.save();
      ctx.clip();
      ctx.drawImage(image, x - point.radius, y - point.radius, point.radius * 2, point.radius * 2);
      ctx.restore();
    }
    ctx.strokeStyle = focused ? "#fff" : member ? highlightColor : node.color;
    ctx.lineWidth = focused ? 2.5 : member ? 2 : 1;
    ctx.stroke();

    if (node.isTerminal) {
      const badgeX = x + point.radius * 0.75;
      const badgeY = y - point.radius * 0.75;
      ctx.beginPath();
      ctx.moveTo(badgeX, badgeY - 4);
      ctx.lineTo(badgeX + 4, badgeY);
      ctx.lineTo(badgeX, badgeY + 4);
      ctx.lineTo(badgeX - 4, badgeY);
      ctx.closePath();
      ctx.fillStyle = TERMINAL_COLOR;
      ctx.fill();
      ctx.strokeStyle = "#101620";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if ((mode === "name" && related) || focused || (mode === "avatar" && !image && related)) {
      ctx.font = `${focused ? 600 : 400} ${focused ? 14 : 11}px system-ui`;
      ctx.textAlign = "center";
      ctx.strokeStyle = "#101620";
      ctx.lineWidth = 3;
      ctx.strokeText(node.name, x, y + point.radius + 12);
      ctx.fillStyle = "#f1f5fa";
      ctx.fillText(node.name, x, y + point.radius + 12);
    }
  }
  ctx.globalAlpha = 1;
  drawClusterLabels(ctx, graph.clusters, points, view, width, height, highlightedCovenant);
  return sorted;
}
