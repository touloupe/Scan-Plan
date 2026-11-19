// Rendu SVG d'une pièce, en coordonnées centimètres.
import { wall, dist, outwardNormal, centroid, pointAlong, wallCount, roomStats, fmtM, fmtNum, bounds } from './geometry.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const WALL = 12; // épaisseur dessinée des murs (cm)

export function readableAngle(a, b) {
  let ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  if (ang > 90) ang -= 180;
  if (ang <= -90) ang += 180;
  return ang;
}

// Géométrie d'une ouverture (porte/fenêtre) prête à dessiner.
export function openingShape(room, o) {
  const [a, b] = wall(room.points, o.wall);
  let p1 = pointAlong(a, b, o.offset);
  let p2 = pointAlong(a, b, o.offset + o.width);
  if (o.hingeEnd) [p1, p2] = [p2, p1]; // charnière de l'autre côté
  const n = outwardNormal(room.points, o.wall);
  const inward = { x: -n.x, y: -n.y };
  return { a, b, p1, p2, n, inward };
}

export function renderRoom(room, opts = {}) {
  const { font = 14, interactive = false, sel = null, colors = {} } = opts;
  const c = { wall: '#1f2a37', fill: '#eef4fb', dim: '#2563eb', text: '#1f2a37', open: '#ffffff', ...colors };
  const pts = room.points;
  const out = [];
  if (!pts.length) return '';
  const closed = room.closed && pts.length >= 3;
  const pstr = pts.map(p => `${p.x},${p.y}`).join(' ');

  if (closed) out.push(`<polygon points="${pstr}" fill="${c.fill}" stroke="none"/>`);
  out.push(`<${closed ? 'polygon' : 'polyline'} points="${pstr}" fill="none" stroke="${c.wall}" stroke-width="${WALL}" stroke-linejoin="miter" stroke-linecap="square"/>`);

  // Ouvertures
  for (const o of room.openings || []) {
    const s = openingShape(room, o);
    const isSel = sel && sel.kind === 'opening' && sel.id === o.id;
    out.push(`<line x1="${s.p1.x}" y1="${s.p1.y}" x2="${s.p2.x}" y2="${s.p2.y}" stroke="${c.open}" stroke-width="${WALL + 1}"/>`);
    const stroke = isSel ? '#f59e0b' : c.wall;
    if (o.type === 'door') {
      const tip = { x: s.p1.x + s.inward.x * o.width, y: s.p1.y + s.inward.y * o.width };
      // Arc du battant : de p2 vers tip, centré sur p1.
      const cross = (s.p2.x - s.p1.x) * (tip.y - s.p1.y) - (s.p2.y - s.p1.y) * (tip.x - s.p1.x);
      out.push(`<line x1="${s.p1.x}" y1="${s.p1.y}" x2="${tip.x}" y2="${tip.y}" stroke="${stroke}" stroke-width="2.5"/>`);
      out.push(`<path d="M ${s.p2.x} ${s.p2.y} A ${o.width} ${o.width} 0 0 ${cross > 0 ? 1 : 0} ${tip.x} ${tip.y}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="4 3"/>`);
    } else {
      for (const k of [-WALL / 2, 0, WALL / 2]) {
        const q1 = { x: s.p1.x + s.n.x * k, y: s.p1.y + s.n.y * k }, q2 = { x: s.p2.x + s.n.x * k, y: s.p2.y + s.n.y * k };
        out.push(`<line x1="${q1.x}" y1="${q1.y}" x2="${q2.x}" y2="${q2.y}" stroke="${stroke}" stroke-width="${k === 0 ? 1.5 : 2.5}"/>`);
      }
    }
    if (interactive) {
      out.push(`<line data-opening="${o.id}" x1="${s.p1.x}" y1="${s.p1.y}" x2="${s.p2.x}" y2="${s.p2.y}" stroke="transparent" stroke-width="${Math.max(30, font * 2.5)}"/>`);
    }
  }

  // Cotes des murs
  const nw = wallCount(room);
  for (let i = 0; i < nw; i++) {
    const [a, b] = wall(pts, i);
    const L = dist(a, b);
    if (L < 1) continue;
    const n = closed ? outwardNormal(pts, i) : { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
    const off = WALL / 2 + font * 1.1;
    const m = { x: (a.x + b.x) / 2 + n.x * off, y: (a.y + b.y) / 2 + n.y * off };
    const isSel = sel && sel.kind === 'wall' && sel.index === i;
    out.push(`<text x="${m.x}" y="${m.y}" font-size="${font}" fill="${isSel ? '#f59e0b' : c.dim}" font-weight="600" text-anchor="middle" dominant-baseline="central" transform="rotate(${readableAngle(a, b)} ${m.x} ${m.y})">${fmtM(L)}</text>`);
    if (interactive) {
      out.push(`<line data-wall="${i}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${isSel ? 'rgba(245,158,11,.45)' : 'transparent'}" stroke-width="${Math.max(WALL + 6, font * 2)}"/>`);
    }
  }

  // Étiquette centrale
  if (closed) {
    const ctr = centroid(pts);
    const st = roomStats(room);
    out.push(`<text x="${ctr.x}" y="${ctr.y - font * 0.7}" font-size="${font * 1.15}" fill="${c.text}" font-weight="700" text-anchor="middle">${esc(room.name)}</text>`);
    out.push(`<text x="${ctr.x}" y="${ctr.y + font * 0.9}" font-size="${font}" fill="${c.text}" text-anchor="middle">${fmtNum(st.floor)} m²</text>`);
  }

  // Coins
  if (interactive) {
    pts.forEach((p, i) => {
      const isSel = sel && sel.kind === 'vertex' && sel.index === i;
      const r = Math.max(6, font * 0.55);
      out.push(`<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${isSel ? '#f59e0b' : (i === 0 && !closed ? '#16a34a' : '#ffffff')}" stroke="${c.wall}" stroke-width="${r / 3}"/>`);
      out.push(`<circle data-vertex="${i}" cx="${p.x}" cy="${p.y}" r="${r * 3}" fill="transparent"/>`);
    });
  }
  return out.join('');
}

// SVG autonome (pour l'export image).
export function roomSVG(room, { pad = 80, font } = {}) {
  const b = bounds(room.points);
  const size = Math.max(b.w, b.h, 100);
  const f = font || Math.max(10, size / 32);
  const x = b.minX - pad - f * 2, y = b.minY - pad - f * 2, w = b.w + 2 * (pad + f * 2), h = b.h + 2 * (pad + f * 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}" font-family="-apple-system, Helvetica, Arial, sans-serif"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>${renderRoom(room, { font: f })}</svg>`;
}
