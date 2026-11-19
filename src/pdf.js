// Générateur PDF vectoriel minimal (sans dépendance) : une page de synthèse, puis une page par pièce.
import { wall, dist, outwardNormal, centroid, wallCount, roomStats, fmtM, fmtNum, bounds } from './geometry.js';
import { openingShape, readableAngle, WALL } from './render.js';

const W = 842, H = 595; // A4 paysage, en points

// Texte encodé en WinAnsi (latin-1), caractères hors plage remplacés.
function pdfStr(s) {
  let out = '';
  for (const ch of String(s)) {
    let code = ch.charCodeAt(0);
    if (ch === '’') code = 0x27;
    if (ch === '€') code = 0x80;
    if (code > 255) code = 0x3f;
    const c = String.fromCharCode(code);
    out += (c === '(' || c === ')' || c === '\\') ? '\\' + c : c;
  }
  return '(' + out + ')';
}
const n = v => (Math.round(v * 100) / 100).toString();
const textWidth = (s, size) => String(s).length * size * 0.52;

class Page {
  constructor() { this.ops = []; }
  color(r, g, b, stroke = true) { this.ops.push(`${n(r)} ${n(g)} ${n(b)} ${stroke ? 'RG' : 'rg'}`); }
  width(w) { this.ops.push(`${n(w)} w`); }
  line(x1, y1, x2, y2) { this.ops.push(`${n(x1)} ${n(H - y1)} m ${n(x2)} ${n(H - y2)} l S`); }
  poly(pts, close, mode = 'S') {
    if (!pts.length) return;
    this.ops.push(`${n(pts[0].x)} ${n(H - pts[0].y)} m ` + pts.slice(1).map(p => `${n(p.x)} ${n(H - p.y)} l`).join(' ') + (close ? ' h' : '') + ` ${mode}`);
  }
  rect(x, y, w, h, mode = 'S') { this.ops.push(`${n(x)} ${n(H - y - h)} ${n(w)} ${n(h)} re ${mode}`); }
  text(s, x, y, size = 10, { bold = false, align = 'left', angle = 0 } = {}) {
    const tw = textWidth(s, size);
    const dx = align === 'center' ? -tw / 2 : align === 'right' ? -tw : 0;
    const r = -angle * Math.PI / 180; // repère PDF : y vers le haut
    const c = Math.cos(r), si = Math.sin(r);
    const ox = x + dx * c, oy = H - y + dx * si;
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${n(c)} ${n(si)} ${n(-si)} ${n(c)} ${n(ox)} ${n(oy)} Tm ${pdfStr(s)} Tj ET`);
  }
}

function drawRoom(pg, room, box) {
  const pts = room.points;
  const b = bounds(pts);
  const margin = 40;
  const k = Math.min((box.w - 2 * margin) / Math.max(b.w, 1), (box.h - 2 * margin) / Math.max(b.h, 1));
  const ox = box.x + (box.w - b.w * k) / 2, oy = box.y + (box.h - b.h * k) / 2;
  const T = p => ({ x: ox + (p.x - b.minX) * k, y: oy + (p.y - b.minY) * k });
  const closed = room.closed && pts.length >= 3;
  const tp = pts.map(T);

  if (closed) { pg.color(0.93, 0.96, 0.98, false); pg.poly(tp, true, 'f'); }
  pg.color(0.12, 0.16, 0.22); pg.width(Math.max(1.5, WALL * k)); pg.ops.push('0 j 2 J');
  pg.poly(tp, closed, 'S');

  for (const o of room.openings || []) {
    const s = openingShape(room, o);
    pg.color(1, 1, 1); pg.width(WALL * k + 1.5); pg.ops.push('0 J');
    const p1 = T(s.p1), p2 = T(s.p2);
    pg.line(p1.x, p1.y, p2.x, p2.y);
    pg.color(0.12, 0.16, 0.22); pg.width(0.8);
    if (o.type === 'door') {
      const tip = T({ x: s.p1.x + s.inward.x * o.width, y: s.p1.y + s.inward.y * o.width });
      pg.line(p1.x, p1.y, tip.x, tip.y);
      const a0 = Math.atan2(p2.y - p1.y, p2.x - p1.x), a1 = Math.atan2(tip.y - p1.y, tip.x - p1.x);
      let d = a1 - a0; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      const r = o.width * k, arc = [];
      for (let i = 0; i <= 12; i++) { const a = a0 + d * i / 12; arc.push({ x: p1.x + Math.cos(a) * r, y: p1.y + Math.sin(a) * r }); }
      pg.width(0.5); pg.poly(arc, false);
    } else {
      for (const kk of [-WALL / 2, 0, WALL / 2]) {
        const q1 = T({ x: s.p1.x + s.n.x * kk, y: s.p1.y + s.n.y * kk }), q2 = T({ x: s.p2.x + s.n.x * kk, y: s.p2.y + s.n.y * kk });
        pg.line(q1.x, q1.y, q2.x, q2.y);
      }
    }
  }

  // Cotes
  pg.color(0.15, 0.39, 0.92, false);
  const nw = wallCount(room);
  for (let i = 0; i < nw; i++) {
    const [a, bb] = wall(pts, i);
    const L = dist(a, bb);
    if (L < 1) continue;
    const nn = closed ? outwardNormal(pts, i) : { x: -(bb.y - a.y) / L, y: (bb.x - a.x) / L };
    const ta = T(a), tb = T(bb);
    const off = WALL * k / 2 + 9;
    const mx = (ta.x + tb.x) / 2 + nn.x * off, my = (ta.y + tb.y) / 2 + nn.y * off + 3;
    pg.text(fmtM(L), mx, my, 8, { align: 'center', angle: readableAngle(ta, tb), bold: true });
  }
  if (closed) {
    const c = T(centroid(pts));
    pg.color(0.12, 0.16, 0.22, false);
    pg.text(room.name, c.x, c.y - 3, 11, { align: 'center', bold: true });
    pg.text(fmtNum(roomStats(room).floor) + ' m²', c.x, c.y + 11, 9, { align: 'center' });
  }
  // Échelle
  const scaleCm = niceScale(120 / k);
  pg.color(0.12, 0.16, 0.22); pg.width(1);
  const sx = box.x + 10, sy = box.y + box.h - 10;
  pg.line(sx, sy, sx + scaleCm * k, sy); pg.line(sx, sy - 3, sx, sy + 3); pg.line(sx + scaleCm * k, sy - 3, sx + scaleCm * k, sy + 3);
  pg.color(0.12, 0.16, 0.22, false);
  pg.text(fmtM(scaleCm, scaleCm >= 100 ? 0 : 1), sx + scaleCm * k / 2, sy - 6, 7, { align: 'center' });
}

function niceScale(maxCm) {
  for (const v of [5000, 2000, 1000, 500, 200, 100, 50, 20, 10]) if (v <= maxCm) return v;
  return 10;
}

function header(pg, title, sub) {
  pg.color(0.12, 0.16, 0.22, false);
  pg.text(title, 36, 44, 18, { bold: true });
  pg.color(0.4, 0.45, 0.5, false);
  pg.text(sub, 36, 62, 9);
  pg.color(0.85, 0.87, 0.9); pg.width(0.7); pg.line(36, 72, W - 36, 72);
}

function wrap(s, max) {
  const lines = [];
  for (const para of String(s || '').split('\n')) {
    let cur = '';
    for (const w of para.split(' ')) {
      if ((cur + ' ' + w).trim().length > max) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    }
    lines.push(cur);
  }
  return lines;
}

export function projectPDF(project) {
  const date = new Date().toLocaleDateString('fr-FR');
  const pages = [];
  const rooms = project.rooms.filter(r => r.points.length >= 2);

  // Synthèse
  const s = new Page();
  header(s, project.name, `Relevé du ${date} · ${rooms.length} pièce${rooms.length > 1 ? 's' : ''}`);
  let y = 100, tot = 0, totW = 0;
  s.color(0.4, 0.45, 0.5, false);
  ['Pièce', 'Surface au sol', 'Périmètre', 'Hauteur', 'Surface des murs', 'Volume'].forEach((h, i) => s.text(h, 36 + i * 128, y, 9, { bold: true }));
  y += 8; s.color(0.85, 0.87, 0.9); s.line(36, y, W - 36, y); y += 16;
  s.color(0.12, 0.16, 0.22, false);
  for (const r of rooms) {
    const st = roomStats(r); tot += st.floor; totW += st.walls;
    [r.name, fmtNum(st.floor) + ' m²', fmtNum(st.perimeter) + ' m', fmtM(r.height), fmtNum(st.walls) + ' m²', fmtNum(st.volume) + ' m³']
      .forEach((v, i) => s.text(v, 36 + i * 128, y, 10));
    y += 18;
    if (y > H - 60) break;
  }
  s.color(0.85, 0.87, 0.9); s.line(36, y - 8, W - 36, y - 8); y += 6;
  s.color(0.12, 0.16, 0.22, false);
  s.text('Total', 36, y, 10, { bold: true }); s.text(fmtNum(tot) + ' m²', 164, y, 10, { bold: true }); s.text(fmtNum(totW) + ' m²', 548, y, 10, { bold: true });
  pages.push(s);

  for (const r of rooms) {
    const p = new Page();
    const st = roomStats(r);
    header(p, r.name, `${project.name} · ${date}`);
    drawRoom(p, r, { x: 36, y: 84, w: 580, h: H - 84 - 30 });
    let yy = 100;
    const kv = [['Surface au sol', fmtNum(st.floor) + ' m²'], ['Périmètre', fmtNum(st.perimeter) + ' m'], ['Hauteur sous plafond', fmtM(r.height)], ['Surface des murs', fmtNum(st.walls) + ' m²'], ['Volume', fmtNum(st.volume) + ' m³'],
      ['Portes', String((r.openings || []).filter(o => o.type === 'door').length)], ['Fenêtres', String((r.openings || []).filter(o => o.type === 'window').length)]];
    for (const [k, v] of kv) {
      p.color(0.4, 0.45, 0.5, false); p.text(k, 636, yy, 9);
      p.color(0.12, 0.16, 0.22, false); p.text(v, W - 36, yy, 10, { bold: true, align: 'right' });
      yy += 18;
    }
    if (r.notes) {
      yy += 10; p.color(0.4, 0.45, 0.5, false); p.text('Notes', 636, yy, 9, { bold: true }); yy += 14;
      p.color(0.12, 0.16, 0.22, false);
      for (const line of wrap(r.notes, 36).slice(0, 18)) { p.text(line, 636, yy, 9); yy += 12; }
    }
    pages.push(p);
  }
  return build(pages);
}

function build(pages) {
  const objs = [];
  const add = s => { objs.push(s); return objs.length; };
  const catalog = add(null), pagesObj = add(null);
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const pg of pages) {
    const content = pg.ops.join('\n');
    const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: 'application/pdf' });
}
