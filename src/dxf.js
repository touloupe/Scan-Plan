// Export DXF (format R12 ASCII, lisible par AutoCAD, LibreCAD, DraftSight...). Unités : mètres.
import { wall, dist, outwardNormal, centroid, wallCount, roomStats, fmtNum, fmtM, bounds } from './geometry.js';
import { openingShape, readableAngle } from './render.js';

const ascii = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');

export function projectDXF(project) {
  const e = [];
  const P = (x, y) => [x / 100, -y / 100]; // cm → m, axe Y vers le haut
  const line = (layer, a, b) => e.push('0', 'LINE', '8', layer, '10', a[0].toFixed(4), '20', a[1].toFixed(4), '30', '0', '11', b[0].toFixed(4), '21', b[1].toFixed(4), '31', '0');
  const text = (layer, p, h, s, rot = 0, center = true) => {
    e.push('0', 'TEXT', '8', layer, '10', p[0].toFixed(4), '20', p[1].toFixed(4), '30', '0', '40', h.toFixed(3), '1', ascii(s), '50', rot.toFixed(2));
    if (center) e.push('72', '1', '73', '2', '11', p[0].toFixed(4), '21', p[1].toFixed(4), '31', '0');
  };

  let cursor = 0;
  for (const room of project.rooms) {
    if (room.points.length < 2) continue;
    const b = bounds(room.points);
    const dx = cursor - b.minX, dy = -b.minY;
    cursor += b.w + 150;
    const pts = room.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
    const r = { ...room, points: pts };
    const nw = wallCount(r);
    for (let i = 0; i < nw; i++) {
      const [a, c] = wall(pts, i);
      // Le mur est découpé autour des ouvertures.
      const L = dist(a, c);
      const cuts = (r.openings || []).filter(o => o.wall === i).map(o => [o.offset, o.offset + o.width]).sort((u, v) => u[0] - v[0]);
      let pos = 0;
      for (const [s0, s1] of [...cuts, [L, L]]) {
        if (s0 > pos + 0.1) {
          line('MURS', P(a.x + (c.x - a.x) * pos / L, a.y + (c.y - a.y) * pos / L), P(a.x + (c.x - a.x) * s0 / L, a.y + (c.y - a.y) * s0 / L));
        }
        pos = Math.max(pos, s1);
      }
      const closed = r.closed && pts.length >= 3;
      const nn = closed ? outwardNormal(pts, i) : { x: -(c.y - a.y) / L, y: (c.x - a.x) / L };
      const m = P((a.x + c.x) / 2 + nn.x * 25, (a.y + c.y) / 2 + nn.y * 25);
      text('COTES', m, 0.1, fmtM(L), -readableAngle(a, c));
    }
    for (const o of r.openings || []) {
      const s = openingShape(r, o);
      const layer = o.type === 'door' ? 'PORTES' : 'FENETRES';
      if (o.type === 'door') {
        const tip = { x: s.p1.x + s.inward.x * o.width, y: s.p1.y + s.inward.y * o.width };
        line(layer, P(s.p1.x, s.p1.y), P(tip.x, tip.y));
        const a0 = Math.atan2(s.p2.y - s.p1.y, s.p2.x - s.p1.x), a1 = Math.atan2(tip.y - s.p1.y, tip.x - s.p1.x);
        let d = a1 - a0; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
        let prev = s.p2;
        for (let k = 1; k <= 12; k++) {
          const ang = a0 + d * k / 12;
          const q = { x: s.p1.x + Math.cos(ang) * o.width, y: s.p1.y + Math.sin(ang) * o.width };
          line(layer, P(prev.x, prev.y), P(q.x, q.y)); prev = q;
        }
      } else {
        for (const k of [-6, 0, 6]) line(layer, P(s.p1.x + s.n.x * k, s.p1.y + s.n.y * k), P(s.p2.x + s.n.x * k, s.p2.y + s.n.y * k));
      }
    }
    if (r.closed && pts.length >= 3) {
      const c = centroid(pts);
      text('TEXTE', P(c.x, c.y - 12), 0.15, room.name);
      text('TEXTE', P(c.x, c.y + 12), 0.1, fmtNum(roomStats(room).floor) + ' m2');
    }
  }

  const layers = ['MURS', 'PORTES', 'FENETRES', 'COTES', 'TEXTE'];
  const colors = { MURS: 7, PORTES: 1, FENETRES: 4, COTES: 5, TEXTE: 7 };
  const head = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(layers.length),
    ...layers.flatMap(l => ['0', 'LAYER', '2', l, '70', '0', '62', String(colors[l]), '6', 'CONTINUOUS']),
    '0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  const tail = ['0', 'ENDSEC', '0', 'EOF'];
  return new Blob([[...head, ...e, ...tail].join('\r\n') + '\r\n'], { type: 'application/dxf' });
}
