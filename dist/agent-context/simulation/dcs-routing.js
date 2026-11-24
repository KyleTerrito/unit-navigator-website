/* Small orthogonal route candidates, ranked by clearance, turns, then length. */
(function (root) {
  const vectors = {left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1]};
  function simplify(points) {
    const result = [];
    for (const p of points) {
      if (result.length && p[0] === result.at(-1)[0] && p[1] === result.at(-1)[1]) continue;
      while (result.length > 1) {
        const a = result.at(-2), b = result.at(-1);
        if ((a[0] === b[0] && b[0] === p[0] && (b[1] - a[1]) * (p[1] - b[1]) >= 0) ||
            (a[1] === b[1] && b[1] === p[1] && (b[0] - a[0]) * (p[0] - b[0]) >= 0)) result.pop();
        else break;
      }
      result.push(p);
    }
    return result;
  }
  function route(a, b, fromSide, toSide, obstacles = []) {
    const va = vectors[fromSide], vb = vectors[toSide], gap = 18;
    const sa = [a[0] + va[0] * gap, a[1] + va[1] * gap], sb = [b[0] + vb[0] * gap, b[1] + vb[1] * gap];
    const candidates = [[a, b], [a, [b[0], a[1]], b], [a, [a[0], b[1]], b]];
    const near = obstacles.slice().sort((r, s) => Math.abs(r.x - (a[0] + b[0]) / 2) + Math.abs(r.y - (a[1] + b[1]) / 2) - Math.abs(s.x - (a[0] + b[0]) / 2) - Math.abs(s.y - (a[1] + b[1]) / 2)).slice(0, 12);
    const xs = new Set([(a[0] + b[0]) / 2, sa[0], sb[0], ...near.flatMap(r => [r.x - 12, r.x + r.w + 12])]);
    const ys = new Set([(a[1] + b[1]) / 2, sa[1], sb[1], ...near.flatMap(r => [r.y - 12, r.y + r.h + 12])]);
    for (const x of xs) {candidates.push([a, [x, a[1]], [x, b[1]], b]); candidates.push([a, sa, [x, sa[1]], [x, sb[1]], sb, b]);}
    for (const y of ys) {candidates.push([a, [a[0], y], [b[0], y], b]); candidates.push([a, sa, [sa[0], y], [sb[0], y], sb, b]);}
    candidates.push([a, sa, [sb[0], sa[1]], sb, b], [a, sa, [sa[0], sb[1]], sb, b]);
    let best = null, bestScore = Infinity;
    for (const candidate of candidates) {
      const p = simplify(candidate); if (p.length < 2) continue;
      const first = [p[1][0] - a[0], p[1][1] - a[1]], last = [p.at(-2)[0] - b[0], p.at(-2)[1] - b[1]];
      if (first[0] * va[0] + first[1] * va[1] <= 0 || last[0] * vb[0] + last[1] * vb[1] <= 0) continue;
      let length = 0, crossings = 0, valid = true;
      for (let i = 1; i < p.length; i++) {
        const [x1, y1] = p[i - 1], [x2, y2] = p[i];
        if (x1 !== x2 && y1 !== y2) {valid = false; break;}
        length += Math.abs(x2 - x1) + Math.abs(y2 - y1);
        for (const r of obstacles) {
          if (x1 === x2 ? x1 > r.x && x1 < r.x + r.w && Math.max(y1, y2) > r.y && Math.min(y1, y2) < r.y + r.h :
              y1 > r.y && y1 < r.y + r.h && Math.max(x1, x2) > r.x && Math.min(x1, x2) < r.x + r.w) crossings++;
        }
      }
      const score = crossings * 1e9 + (p.length - 2) * 1e6 + length;
      if (valid && score < bestScore) {best = p; bestScore = score;}
    }
    return (best || simplify([a, sa, [sa[0], sb[1]], sb, b])).flat();
  }
  function along(points, ratio) {
    const lengths = [];
    for (let i = 2; i < points.length; i += 2) lengths.push(Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]));
    let remaining = Math.max(0, Math.min(1, ratio)) * lengths.reduce((a, b) => a + b, 0);
    for (let i = 0; i < lengths.length; i++) {
      if (remaining <= lengths[i] || i === lengths.length - 1) {
        const t = lengths[i] ? remaining / lengths[i] : 0;
        return [points[i * 2] + t * (points[i * 2 + 2] - points[i * 2]), points[i * 2 + 1] + t * (points[i * 2 + 3] - points[i * 2 + 1])];
      }
      remaining -= lengths[i];
    }
    return points.slice(0, 2);
  }
  function project(points, point) {
    let total = 0, traveled = 0, best = Infinity, distance = 0;
    for (let i = 2; i < points.length; i += 2) total += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
    for (let i = 2; i < points.length; i += 2) {
      const dx = points[i] - points[i - 2], dy = points[i + 1] - points[i - 1], length = Math.hypot(dx, dy);
      const t = length ? Math.max(0, Math.min(1, ((point[0] - points[i - 2]) * dx + (point[1] - points[i - 1]) * dy) / (length * length))) : 0;
      const d = Math.hypot(point[0] - points[i - 2] - t * dx, point[1] - points[i - 1] - t * dy);
      if (d < best) {best = d; distance = traveled + t * length;}
      traveled += length;
    }
    return total ? distance / total : 0;
  }
  function through(a, b, fromSide, toSide, bends, obstacles = []) {
    if (!bends || !bends.length) return route(a, b, fromSide, toSide, obstacles);
    const points = [];
    let start = a, side = fromSide;
    for (const bend of bends) {
      const end = [bend.x, bend.y], segment = route(start, end, side, bend.entry, obstacles);
      for (let i = 0; i < segment.length; i += 2) points.push(segment.slice(i, i + 2));
      start = end; side = bend.exit;
    }
    const segment = route(start, b, side, toSide, obstacles);
    for (let i = 0; i < segment.length; i += 2) points.push(segment.slice(i, i + 2));
    return simplify(points).flat();
  }
  root.DcsRouting = {route, simplify, along, project, through};
  if (typeof module !== 'undefined') module.exports = root.DcsRouting;
})(globalThis);
