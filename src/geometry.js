// Géométrie des pièces. Toutes les longueurs sont en centimètres.

export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export function area(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2; // cm²
}

export function signedArea(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function perimeter(points, closed = true) {
  let p = 0;
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) p += dist(points[i], points[(i + 1) % points.length]);
  return p;
}

export function wall(points, i) {
  return [points[i], points[(i + 1) % points.length]];
}

export function wallCount(room) {
  const n = room.points.length;
  return room.closed ? n : Math.max(0, n - 1);
}

export function bounds(points) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function centroid(points) {
  const a = signedArea(points);
  if (Math.abs(a) < 1e-6) {
    const b = bounds(points);
    return { x: b.minX + b.w / 2, y: b.minY + b.h / 2 };
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f; cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

// Normale extérieure d'un mur (unitaire), selon le sens du polygone.
export function outwardNormal(points, i) {
  const [a, b] = wall(points, i);
  const L = dist(a, b) || 1;
  const dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
  const s = signedArea(points) >= 0 ? 1 : -1;
  // En coordonnées écran (y vers le bas), une aire positive = sens horaire.
  return { x: dy * s, y: -dx * s };
}

// Fixe la longueur du mur i : tous les coins situés « au-delà » de son extrémité (dans l'axe du mur)
// sont décalés d'autant. Une pièce rectangulaire reste ainsi rectangulaire.
export function setWallLength(room, i, len) {
  const pts = room.points;
  const [a, b] = wall(pts, i);
  const L = dist(a, b);
  if (L < 1e-6 || len <= 0) return;
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  const dx = ux * (len - L), dy = uy * (len - L);
  const pb = b.x * ux + b.y * uy;
  for (let j = 0; j < pts.length; j++) {
    if (pts[j].x * ux + pts[j].y * uy >= pb - 0.5) pts[j] = { x: round1(pts[j].x + dx), y: round1(pts[j].y + dy) };
  }
}

// Construit un polygone à partir d'une suite de murs : longueur puis virage (degrés, + = à droite).
export function fromWalk(steps) {
  const pts = [{ x: 0, y: 0 }];
  let heading = 0; // 0 = vers la droite
  for (let k = 0; k < steps.length; k++) {
    const { len, turn } = steps[k];
    const last = pts[pts.length - 1];
    const rad = heading * Math.PI / 180;
    pts.push({ x: last.x + Math.cos(rad) * len, y: last.y + Math.sin(rad) * len });
    heading += turn || 0;
  }
  // Si le dernier point revient sur le premier, on ferme sans le dupliquer.
  if (pts.length > 3 && dist(pts[0], pts[pts.length - 1]) < 2) pts.pop();
  return pts.map(p => ({ x: round1(p.x), y: round1(p.y) }));
}

export const round1 = v => Math.round(v * 10) / 10;

export function snapGrid(p, step) {
  if (!step) return p;
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
}

// Aligne p à l'horizontale ou la verticale de ref si l'angle est proche (tolérance en degrés).
export function snapOrtho(p, ref, tol = 7) {
  if (!ref) return p;
  const dx = p.x - ref.x, dy = p.y - ref.y;
  const ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
  if (ang < tol || ang > 180 - tol) return { x: p.x, y: ref.y };
  if (Math.abs(ang - 90) < tol) return { x: ref.x, y: p.y };
  return p;
}

// Projection d'un point sur un segment : distance le long du mur (cm) bornée.
export function projectOnWall(p, a, b) {
  const L = dist(a, b) || 1;
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (L * L);
  return Math.max(0, Math.min(1, t)) * L;
}

export function pointAlong(a, b, d) {
  const L = dist(a, b) || 1;
  return { x: a.x + (b.x - a.x) * d / L, y: a.y + (b.y - a.y) * d / L };
}

export function roomStats(room) {
  const closed = room.closed && room.points.length >= 3;
  const floor = closed ? area(room.points) / 1e4 : 0; // m²
  const per = perimeter(room.points, closed) / 100; // m
  const h = (room.height || 250) / 100;
  const openings = (room.openings || []).reduce((s, o) => s + (o.width / 100) * ((o.height || (o.type === 'door' ? 204 : 115)) / 100), 0);
  return {
    floor,
    perimeter: per,
    walls: Math.max(0, per * h - openings),
    volume: floor * h,
  };
}

// Supprime les ouvertures dont le mur n'existe plus et borne leur position.
export function sanitizeOpenings(room) {
  const n = wallCount(room);
  room.openings = (room.openings || []).filter(o => o.wall < n).map(o => {
    const [a, b] = wall(room.points, o.wall);
    const L = dist(a, b);
    const width = Math.min(o.width, L);
    return { ...o, width, offset: Math.max(0, Math.min(L - width, o.offset)) };
  });
}

export const fmtM = (cm, d = 2) => (cm / 100).toFixed(d).replace('.', ',') + ' m';
export const fmtNum = (v, d = 2) => v.toFixed(d).replace('.', ',');
