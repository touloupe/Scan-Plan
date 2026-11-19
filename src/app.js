import * as G from './geometry.js';
import { renderRoom, roomSVG } from './render.js';
import { projectPDF } from './pdf.js';
import { projectDXF } from './dxf.js';
import * as S from './store.js';
import { $, h, esc, num, sheet, closeSheet, ask, confirmBox, toast, shareFile, safeName, compressImage, svgToPng } from './ui.js';

const app = $('#app');
let cleanup = null;

// ---------- Routage ----------
async function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  closeSheet();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'p' && parts[1]) {
    const project = await S.getProject(parts[1]);
    if (!project) { location.hash = '#/'; return; }
    if (parts[2] === 'r' && parts[3]) {
      const room = project.rooms.find(r => r.id === parts[3]);
      if (!room) { location.hash = `#/p/${project.id}`; return; }
      return roomView(project, room);
    }
    return projectView(project);
  }
  return homeView();
}
window.addEventListener('hashchange', route);

const icon = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fit: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ---------- Accueil ----------
async function homeView() {
  const projects = await S.listProjects();
  app.innerHTML = '';
  const el = h(`<div class="page">
    <header class="bar"><h1>PlanPoche</h1><button class="icon-btn" data-more aria-label="Plus">${icon.more}</button></header>
    <main class="content">
      ${projects.length ? '' : `<div class="empty"><div class="empty-art"></div><h2>Relevez vos plans</h2><p class="muted">Créez un projet (un logement, un chantier), puis tracez chaque pièce. Les cotes, surfaces et exports PDF ou DXF sont calculés pour vous.</p></div>`}
      <ul class="list">${projects.map(p => {
        const tot = p.rooms.reduce((s, r) => s + G.roomStats(r).floor, 0);
        return `<li><a href="#/p/${p.id}" class="card"><div class="card-main"><strong>${esc(p.name)}</strong><span class="muted">${p.rooms.length} pièce${p.rooms.length > 1 ? 's' : ''} · ${G.fmtNum(tot)} m²</span></div><span class="muted small">${new Date(p.updated).toLocaleDateString('fr-FR')}</span></a></li>`;
      }).join('')}</ul>
    </main>
    <button class="fab" data-new>${icon.plus}<span>Nouveau projet</span></button>
  </div>`);
  app.appendChild(el);
  $('[data-new]', el).onclick = async () => {
    const name = await ask('Nom du projet', '', { placeholder: 'Ex. : Appartement rue des Lilas', ok: 'Créer' });
    if (name === null) return;
    const p = S.newProject(name || 'Nouveau projet');
    await S.saveProject(p);
    location.hash = `#/p/${p.id}`;
  };
  $('[data-more]', el).onclick = () => {
    const s = sheet(`<h3>PlanPoche</h3><div class="stack">
      <label class="btn ghost file-btn">Importer une sauvegarde (.json)<input type="file" accept="application/json,.json" hidden></label>
      <p class="muted small">Vos plans sont enregistrés sur cet appareil. Pensez à exporter une sauvegarde de temps en temps depuis chaque projet.</p></div>`);
    $('input', s).onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data || !Array.isArray(data.rooms)) throw new Error('format');
        data.id = S.uid();
        await S.saveProject(data);
        closeSheet(); toast('Projet importé'); route();
      } catch { toast('Fichier non reconnu'); }
    };
  };
}

// ---------- Projet ----------
function thumb(room) {
  if (room.points.length < 2) return '<div class="thumb empty-thumb"></div>';
  const b = G.bounds(room.points);
  const pad = Math.max(b.w, b.h) * 0.12 + 20;
  return `<svg class="thumb" viewBox="${b.minX - pad} ${b.minY - pad} ${b.w + 2 * pad} ${b.h + 2 * pad}">${renderRoom({ ...room, name: '' }, { font: 0.001 })}</svg>`;
}

async function projectView(project) {
  const save = () => S.saveProject(project);
  const draw = () => {
    const tot = project.rooms.reduce((s, r) => s + G.roomStats(r).floor, 0);
    app.innerHTML = '';
    const el = h(`<div class="page">
      <header class="bar"><a href="#/" class="icon-btn" aria-label="Retour">${icon.back}</a><h1 class="title-edit" data-rename>${esc(project.name)}</h1><button class="icon-btn" data-more aria-label="Plus">${icon.more}</button></header>
      <main class="content">
        <div class="summary"><div><span class="big">${G.fmtNum(tot)}</span><span class="muted"> m² au total</span></div><span class="muted">${project.rooms.length} pièce${project.rooms.length > 1 ? 's' : ''}</span></div>
        <ul class="rooms">${project.rooms.map(r => {
          const st = G.roomStats(r);
          return `<li><a class="room-card" href="#/p/${project.id}/r/${r.id}">${thumb(r)}<div><strong>${esc(r.name)}</strong><span class="muted small">${r.closed ? `${G.fmtNum(st.floor)} m² · ${G.fmtNum(st.perimeter)} m de murs` : 'Plan à terminer'}</span></div></a></li>`;
        }).join('')}</ul>
        ${project.rooms.length ? `<div class="exports"><button class="btn" data-pdf>Exporter en PDF</button><button class="btn ghost" data-dxf>Exporter en DXF</button></div>` : '<p class="muted center">Ajoutez votre première pièce.</p>'}
      </main>
      <button class="fab" data-add>${icon.plus}<span>Ajouter une pièce</span></button>
    </div>`);
    app.appendChild(el);
    $('[data-add]', el).onclick = async () => {
      const name = await ask('Nom de la pièce', suggestName(project), { ok: 'Ajouter' });
      if (name === null) return;
      const r = S.newRoom(name || 'Pièce');
      project.rooms.push(r);
      await save();
      location.hash = `#/p/${project.id}/r/${r.id}`;
    };
    $('[data-rename]', el).onclick = async () => {
      const name = await ask('Renommer le projet', project.name, { ok: 'Renommer' });
      if (name) { project.name = name; await save(); draw(); }
    };
    const pdf = $('[data-pdf]', el), dxf = $('[data-dxf]', el);
    if (pdf) pdf.onclick = () => shareFile(projectPDF(project), safeName(project.name) + '.pdf');
    if (dxf) dxf.onclick = () => shareFile(projectDXF(project), safeName(project.name) + '.dxf');
    $('[data-more]', el).onclick = () => {
      const s = sheet(`<h3>${esc(project.name)}</h3><div class="stack">
        <button class="btn ghost" data-json>Exporter une sauvegarde (.json)</button>
        <button class="btn ghost" data-dup>Dupliquer le projet</button>
        <button class="btn danger" data-del>Supprimer le projet</button></div>`);
      $('[data-json]', s).onclick = () => { closeSheet(); shareFile(new Blob([JSON.stringify(project)], { type: 'application/json' }), safeName(project.name) + '.json'); };
      $('[data-dup]', s).onclick = async () => {
        const c = structuredClone(project); c.id = S.uid(); c.name = project.name + ' (copie)';
        await S.saveProject(c); closeSheet(); location.hash = `#/p/${c.id}`;
      };
      $('[data-del]', s).onclick = async () => {
        if (await confirmBox('Supprimer ce projet ?', 'Toutes ses pièces seront effacées de cet appareil.')) {
          await S.deleteProject(project.id); location.hash = '#/';
        }
      };
    };
  };
  draw();
}

function suggestName(project) {
  const names = ['Séjour', 'Cuisine', 'Chambre', 'Salle de bain', 'WC', 'Entrée', 'Bureau', 'Couloir'];
  const used = new Set(project.rooms.map(r => r.name));
  return names.find(n => !used.has(n)) || `Pièce ${project.rooms.length + 1}`;
}

// ---------- Éditeur de pièce ----------
function roomView(project, room) {
  room.openings = room.openings || []; room.photos = room.photos || [];
  let sel = null;
  const history = [];
  let saveTimer = null;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => S.saveProject(project), 300); };
  const snapshot = () => { history.push(JSON.stringify({ points: room.points, closed: room.closed, openings: room.openings })); if (history.length > 60) history.shift(); };
  const commit = () => { G.sanitizeOpenings(room); save(); render(); };

  app.innerHTML = '';
  const el = h(`<div class="page editor">
    <header class="bar"><a href="#/p/${project.id}" class="icon-btn" aria-label="Retour">${icon.back}</a><h1 class="title-edit" data-info></h1><button class="icon-btn" data-undo aria-label="Annuler">${icon.undo}</button><button class="icon-btn" data-more aria-label="Plus">${icon.more}</button></header>
    <div class="canvas-wrap"><svg class="canvas" xmlns="http://www.w3.org/2000/svg"></svg><div class="hint"></div><button class="icon-btn fit" data-fit aria-label="Recentrer">${icon.fit}</button></div>
    <div class="dock"></div>
  </div>`);
  app.appendChild(el);
  const svg = $('svg.canvas', el), dock = $('.dock', el), hint = $('.hint', el), title = $('[data-info]', el);
  let view = { x: -100, y: -100, w: 700, h: 700 };

  const rect = () => svg.getBoundingClientRect();
  const fixAspect = () => { const r = rect(); if (r.width) view.h = view.w * r.height / r.width; };
  const toWorld = (cx, cy) => { const r = rect(); return { x: view.x + (cx - r.left) / r.width * view.w, y: view.y + (cy - r.top) / r.height * view.h }; };
  const pxToCm = px => px * view.w / rect().width;

  function fit() {
    const r = rect();
    const b = room.points.length ? G.bounds(room.points) : { minX: 0, minY: 0, w: 400, h: 300 };
    const pad = Math.max(b.w, b.h, 200) * 0.25 + 40;
    const w = b.w + 2 * pad, hh = b.h + 2 * pad;
    const aspect = r.height / r.width || 1;
    view.w = Math.max(w, hh / aspect);
    view.h = view.w * aspect;
    view.x = b.minX + b.w / 2 - view.w / 2;
    view.y = b.minY + b.h / 2 - view.h / 2;
  }

  function gridMarkup() {
    const step = view.w > 3000 ? 500 : view.w > 1200 ? 100 : 50;
    const major = step * (step === 50 ? 2 : 5);
    const lines = [];
    const x0 = Math.floor(view.x / step) * step, y0 = Math.floor(view.y / step) * step;
    const sw = pxToCm(1);
    for (let x = x0; x < view.x + view.w; x += step) lines.push(`<line x1="${x}" y1="${view.y}" x2="${x}" y2="${view.y + view.h}" class="${x % major === 0 ? 'g2' : 'g1'}" stroke-width="${sw}"/>`);
    for (let y = y0; y < view.y + view.h; y += step) lines.push(`<line x1="${view.x}" y1="${y}" x2="${view.x + view.w}" y2="${y}" class="${y % major === 0 ? 'g2' : 'g1'}" stroke-width="${sw}"/>`);
    return `<g class="grid">${lines.join('')}</g>`;
  }

  function render() {
    fixAspect();
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    const font = Math.min(Math.max(pxToCm(13), 4), 400);
    svg.innerHTML = gridMarkup() + renderRoom(room, { font, interactive: true, sel });
    title.textContent = room.name;
    const st = G.roomStats(room);
    hint.textContent = room.closed ? `${G.fmtNum(st.floor)} m² · périmètre ${G.fmtNum(st.perimeter)} m` :
      room.points.length === 0 ? 'Touchez le plan pour placer le premier coin, ou saisissez les murs.' :
      room.points.length < 3 ? 'Placez les coins suivants.' : 'Touchez le point vert pour fermer la pièce.';
    $('[data-undo]', el).disabled = !history.length;
    renderDock();
  }

  function renderDock() {
    if (!room.closed) {
      dock.innerHTML = `<div class="tools">
        <button class="tool" data-walk>Saisir les murs</button>
        <button class="tool" data-rect>Rectangle</button>
        <button class="tool primary" data-close ${room.points.length < 3 ? 'disabled' : ''}>Fermer la pièce</button></div>`;
      $('[data-walk]', dock).onclick = walkSheet;
      $('[data-rect]', dock).onclick = rectSheet;
      $('[data-close]', dock).onclick = () => { snapshot(); room.closed = true; sel = null; commit(); fit(); render(); };
      return;
    }
    if (!sel) {
      dock.innerHTML = `<div class="tools">
        <button class="tool" data-door>+ Porte</button>
        <button class="tool" data-win>+ Fenêtre</button>
        <button class="tool" data-props>Infos et photos</button></div>
        <p class="muted small center">Touchez un mur, un coin ou une ouverture pour le modifier.</p>`;
      $('[data-door]', dock).onclick = () => addOpening('door');
      $('[data-win]', dock).onclick = () => addOpening('window');
      $('[data-props]', dock).onclick = propsSheet;
      return;
    }
    if (sel.kind === 'wall') {
      const [a, b] = G.wall(room.points, sel.index);
      const L = G.dist(a, b);
      dock.innerHTML = `<form class="tools wrap" data-len>
        <label class="field"><span>Longueur du mur (m)</span><input name="len" inputmode="decimal" value="${G.fmtNum(L / 100)}"></label>
        <button class="tool primary">Appliquer</button>
        <button type="button" class="tool" data-door>+ Porte</button>
        <button type="button" class="tool" data-win>+ Fenêtre</button>
        <button type="button" class="tool" data-split>Ajouter un coin</button>
        <button type="button" class="tool ghost" data-done>OK</button></form>`;
      $('[data-len]', dock).onsubmit = e => {
        e.preventDefault();
        const v = num(e.target.len.value);
        if (!(v > 0)) return toast('Longueur invalide');
        snapshot(); G.setWallLength(room, sel.index, v * 100); commit();
      };
      $('[data-door]', dock).onclick = () => addOpening('door', sel.index);
      $('[data-win]', dock).onclick = () => addOpening('window', sel.index);
      $('[data-split]', dock).onclick = () => {
        snapshot();
        const i = sel.index; const [p, q] = G.wall(room.points, i);
        room.points.splice(i + 1, 0, { x: G.round1((p.x + q.x) / 2), y: G.round1((p.y + q.y) / 2) });
        room.openings = room.openings.filter(o => o.wall !== i).map(o => o.wall > i ? { ...o, wall: o.wall + 1 } : o);
        sel = { kind: 'vertex', index: i + 1 }; commit();
      };
      $('[data-done]', dock).onclick = () => { sel = null; render(); };
      return;
    }
    if (sel.kind === 'vertex') {
      dock.innerHTML = `<div class="tools"><span class="muted">Coin ${sel.index + 1} : faites-le glisser pour le déplacer.</span>
        <button class="tool danger" data-del ${room.points.length <= 3 ? 'disabled' : ''}>Supprimer le coin</button>
        <button class="tool ghost" data-done>OK</button></div>`;
      $('[data-del]', dock).onclick = () => {
        snapshot();
        const i = sel.index;
        room.points.splice(i, 1);
        const n = room.points.length;
        room.openings = room.openings.filter(o => o.wall !== i && o.wall !== (i - 1 + n + 1) % (n + 1)).map(o => o.wall > i ? { ...o, wall: o.wall - 1 } : o);
        sel = null; commit();
      };
      $('[data-done]', dock).onclick = () => { sel = null; render(); };
      return;
    }
    if (sel.kind === 'opening') {
      const o = room.openings.find(x => x.id === sel.id);
      if (!o) { sel = null; return renderDock(); }
      dock.innerHTML = `<form class="tools wrap" data-op>
        <label class="field"><span>${o.type === 'door' ? 'Porte' : 'Fenêtre'} : largeur (cm)</span><input name="w" inputmode="decimal" value="${G.fmtNum(o.width, 0)}"></label>
        <label class="field"><span>Hauteur (cm)</span><input name="hh" inputmode="decimal" value="${G.fmtNum(o.height || (o.type === 'door' ? 204 : 115), 0)}"></label>
        <label class="field"><span>Distance au coin (cm)</span><input name="off" inputmode="decimal" value="${G.fmtNum(o.offset, 0)}"></label>
        <button class="tool primary">Appliquer</button>
        ${o.type === 'door' ? '<button type="button" class="tool" data-flip>Inverser le sens</button>' : ''}
        <button type="button" class="tool danger" data-del>Supprimer</button>
        <button type="button" class="tool ghost" data-done>OK</button></form>`;
      $('[data-op]', dock).onsubmit = e => {
        e.preventDefault();
        const w = num(e.target.w.value), hh = num(e.target.hh.value), off = num(e.target.off.value);
        if (!(w > 0)) return toast('Largeur invalide');
        snapshot(); o.width = w; if (hh > 0) o.height = hh; if (off >= 0) o.offset = off; commit();
      };
      const flip = $('[data-flip]', dock);
      if (flip) flip.onclick = () => {
        snapshot(); o.hingeEnd = !o.hingeEnd; commit();
      };
      $('[data-del]', dock).onclick = () => { snapshot(); room.openings = room.openings.filter(x => x.id !== o.id); sel = null; commit(); };
      $('[data-done]', dock).onclick = () => { sel = null; render(); };
    }
  }

  function addOpening(type, wallIndex) {
    const n = G.wallCount(room);
    if (!n) return;
    let i = wallIndex;
    if (i === undefined) {
      // Mur le plus long sans ouverture, à défaut le plus long.
      const lens = [...Array(n).keys()].map(k => ({ k, L: G.dist(...G.wall(room.points, k)), used: room.openings.some(o => o.wall === k) }));
      lens.sort((u, v) => (u.used - v.used) || (v.L - u.L));
      i = lens[0].k;
    }
    const L = G.dist(...G.wall(room.points, i));
    const width = Math.min(type === 'door' ? 83 : 120, L * 0.8);
    const o = { id: S.uid(), type, wall: i, width, offset: Math.max(0, (L - width) / 2), height: type === 'door' ? 204 : 115 };
    snapshot(); room.openings.push(o); sel = { kind: 'opening', id: o.id }; commit();
  }

  function walkSheet() {
    const rows = [{ len: '', turn: 90 }, { len: '', turn: 90 }, { len: '', turn: 90 }, { len: '', turn: 90 }];
    const s = sheet(`<h3>Saisir les murs</h3><p class="muted small">Mesurez chaque mur dans l'ordre en tournant dans le sens des aiguilles d'une montre. Le dernier mur est calculé si vous le laissez vide.</p>
      <form class="stack"><div class="walk"></div><button type="button" class="btn ghost" data-addrow>+ Ajouter un mur</button><div class="row"><button type="button" class="btn ghost" data-cancel>Annuler</button><button class="btn primary">Créer la pièce</button></div></form>`);
    const box = $('.walk', s);
    const drawRows = () => {
      box.innerHTML = rows.map((r, i) => `<div class="walk-row"><span class="muted">Mur ${i + 1}</span>
        <input data-len="${i}" inputmode="decimal" placeholder="m" value="${esc(r.len)}">
        <select data-turn="${i}">${[[90, 'puis à droite'], [-90, 'puis à gauche'], [45, 'à droite 45°'], [-45, 'à gauche 45°'], [0, 'tout droit']].map(([v, l]) => `<option value="${v}" ${+r.turn === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`).join('');
      box.querySelectorAll('[data-len]').forEach(inp => inp.oninput = () => rows[+inp.dataset.len].len = inp.value);
      box.querySelectorAll('[data-turn]').forEach(sl => sl.onchange = () => rows[+sl.dataset.turn].turn = +sl.value);
    };
    drawRows();
    $('[data-addrow]', s).onclick = () => { rows.push({ len: '', turn: 90 }); drawRows(); };
    $('[data-cancel]', s).onclick = closeSheet;
    $('form', s).onsubmit = e => {
      e.preventDefault();
      let steps = rows.map(r => ({ len: num(r.len) * 100, turn: +r.turn }));
      while (steps.length && !(steps[steps.length - 1].len > 0)) steps.pop();
      if (steps.some(st => !(st.len > 0)) || steps.length < 2) return toast('Renseignez au moins deux longueurs');
      const pts = G.fromWalk(steps);
      if (pts.length < 3) return toast('Il faut au moins trois coins');
      snapshot(); room.points = pts; room.closed = true; room.openings = []; sel = null;
      closeSheet(); commit(); fit(); render();
    };
  }

  function rectSheet() {
    const s = sheet(`<h3>Pièce rectangulaire</h3><form class="stack">
      <label class="field"><span>Longueur (m)</span><input name="a" inputmode="decimal" placeholder="4,20"></label>
      <label class="field"><span>Largeur (m)</span><input name="b" inputmode="decimal" placeholder="3,10"></label>
      <div class="row"><button type="button" class="btn ghost" data-cancel>Annuler</button><button class="btn primary">Créer</button></div></form>`);
    setTimeout(() => s.querySelector('input').focus(), 250);
    $('[data-cancel]', s).onclick = closeSheet;
    $('form', s).onsubmit = e => {
      e.preventDefault();
      const a = num(e.target.a.value) * 100, b = num(e.target.b.value) * 100;
      if (!(a > 0 && b > 0)) return toast('Dimensions invalides');
      snapshot(); room.points = [{ x: 0, y: 0 }, { x: a, y: 0 }, { x: a, y: b }, { x: 0, y: b }]; room.closed = true; room.openings = []; sel = null;
      closeSheet(); commit(); fit(); render();
    };
  }

  function propsSheet() {
    const st = G.roomStats(room);
    const s = sheet(`<h3>${esc(room.name)}</h3><form class="stack" data-f>
      <label class="field"><span>Nom</span><input name="name" value="${esc(room.name)}"></label>
      <label class="field"><span>Hauteur sous plafond (m)</span><input name="height" inputmode="decimal" value="${G.fmtNum(room.height / 100)}"></label>
      <div class="stats">
        <div><span class="muted small">Sol</span><strong>${G.fmtNum(st.floor)} m²</strong></div>
        <div><span class="muted small">Murs</span><strong>${G.fmtNum(st.walls)} m²</strong></div>
        <div><span class="muted small">Périmètre</span><strong>${G.fmtNum(st.perimeter)} m</strong></div>
        <div><span class="muted small">Volume</span><strong>${G.fmtNum(st.volume)} m³</strong></div></div>
      <label class="field"><span>Notes</span><textarea name="notes" rows="3" placeholder="Revêtement, prises, état...">${esc(room.notes)}</textarea></label>
      <div class="photos">${room.photos.map((p, i) => `<div class="photo"><img src="${p}" alt=""><button type="button" data-delphoto="${i}" aria-label="Supprimer">×</button></div>`).join('')}
        <label class="photo add">+ Photo<input type="file" accept="image/*" hidden></label></div>
      <div class="row"><button type="button" class="btn ghost" data-png>Exporter l'image</button><button class="btn primary">Enregistrer</button></div>
      <button type="button" class="btn danger" data-delroom>Supprimer la pièce</button></form>`);
    $('[data-f]', s).onsubmit = e => {
      e.preventDefault();
      room.name = e.target.name.value.trim() || room.name;
      const hh = num(e.target.height.value); if (hh > 0) room.height = hh * 100;
      room.notes = e.target.notes.value;
      closeSheet(); save(); render();
    };
    $('input[type=file]', s).onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { room.photos.push(await compressImage(f)); save(); room.notes = $('[name=notes]', s).value; propsSheet(); } catch { toast('Photo illisible'); }
    };
    s.querySelectorAll('[data-delphoto]').forEach(b => b.onclick = () => { room.photos.splice(+b.dataset.delphoto, 1); save(); propsSheet(); });
    $('[data-png]', s).onclick = async () => {
      if (room.points.length < 2) return toast('Plan vide');
      const png = await svgToPng(roomSVG(room));
      shareFile(png, safeName(room.name) + '.png');
    };
    $('[data-delroom]', s).onclick = async () => {
      if (await confirmBox('Supprimer cette pièce ?', `« ${room.name} » sera effacée du projet.`)) {
        project.rooms = project.rooms.filter(r => r.id !== room.id);
        await S.saveProject(project); location.hash = `#/p/${project.id}`;
      }
    };
  }

  $('[data-info]', el).onclick = propsSheet;
  $('[data-more]', el).onclick = propsSheet;
  $('[data-fit]', el).onclick = () => { fit(); render(); };
  $('[data-undo]', el).onclick = () => {
    const last = history.pop(); if (!last) return;
    Object.assign(room, JSON.parse(last)); sel = null; save(); render();
  };

  // ----- Gestes : toucher, glisser, pincer -----
  const pointers = new Map();
  let g = null, pinch = null;

  svg.addEventListener('pointerdown', e => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      pinch = { d: Math.hypot(p2.x - p1.x, p2.y - p1.y), view: { ...view }, mid: toWorld((p1.x + p2.x) / 2, (p1.y + p2.y) / 2) };
      g = null; return;
    }
    const t = e.target.dataset || {};
    g = { sx: e.clientX, sy: e.clientY, view: { ...view }, moved: false, t: { ...t }, snap: false };
    if (room.closed || room.points.length) {
      if (t.vertex !== undefined) g.type = 'vertex';
      else if (t.opening !== undefined && room.closed) g.type = 'opening';
      else g.type = 'pan';
    } else g.type = 'pan';
  });

  svg.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [p1, p2] = [...pointers.values()];
      const d = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      const k = pinch.d / d;
      const r = rect();
      view.w = Math.min(Math.max(pinch.view.w * k, 60), 20000); fixAspect();
      const mx = (p1.x + p2.x) / 2 - r.left, my = (p1.y + p2.y) / 2 - r.top;
      view.x = pinch.mid.x - mx / r.width * view.w; view.y = pinch.mid.y - my / r.height * view.h;
      render(); return;
    }
    if (!g) return;
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 6) g.moved = true;
    if (!g.moved) return;
    if (g.type === 'pan') {
      const r = rect();
      view.x = g.view.x - (e.clientX - g.sx) / r.width * view.w;
      view.y = g.view.y - (e.clientY - g.sy) / r.height * view.h;
      render();
    } else if (g.type === 'vertex') {
      if (!g.snap) { snapshot(); g.snap = true; }
      const i = +g.t.vertex, n = room.points.length;
      let p = G.snapGrid(toWorld(e.clientX, e.clientY), 1);
      const prev = (room.closed || i > 0) ? room.points[(i - 1 + n) % n] : null;
      const next = (room.closed || i < n - 1) ? room.points[(i + 1) % n] : null;
      if (prev) p = G.snapOrtho(p, prev);
      if (next) p = G.snapOrtho(p, next);
      room.points[i] = p; sel = { kind: 'vertex', index: i };
      G.sanitizeOpenings(room); render();
    } else if (g.type === 'opening') {
      const o = room.openings.find(x => x.id === g.t.opening); if (!o) return;
      if (!g.snap) { snapshot(); g.snap = true; }
      const [a, b] = G.wall(room.points, o.wall);
      o.offset = Math.round(Math.max(0, Math.min(G.dist(a, b) - o.width, G.projectOnWall(toWorld(e.clientX, e.clientY), a, b) - o.width / 2)));
      sel = { kind: 'opening', id: o.id }; render();
    }
  });

  const end = e => {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; g = null; return; }
    if (!g) return;
    const gg = g; g = null;
    if (gg.moved) { if (gg.snap) commit(); return; }
    if (e.type === 'pointercancel') return;
    // Toucher simple
    const t = gg.t;
    if (!room.closed) {
      const n = room.points.length;
      if (t.vertex === '0' && n >= 3) { snapshot(); room.closed = true; sel = null; commit(); return; }
      let p = G.snapGrid(toWorld(e.clientX, e.clientY), 5);
      if (n) p = G.snapOrtho(p, room.points[n - 1]);
      snapshot(); room.points.push(p); commit(); return;
    }
    if (t.vertex !== undefined) sel = { kind: 'vertex', index: +t.vertex };
    else if (t.opening !== undefined) sel = { kind: 'opening', id: t.opening };
    else if (t.wall !== undefined) sel = { kind: 'wall', index: +t.wall };
    else sel = null;
    render();
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const p = toWorld(e.clientX, e.clientY);
    const k = Math.exp(e.deltaY * 0.0015);
    const r = rect();
    view.w = Math.min(Math.max(view.w * k, 60), 20000); fixAspect();
    view.x = p.x - (e.clientX - r.left) / r.width * view.w;
    view.y = p.y - (e.clientY - r.top) / r.height * view.h;
    render();
  }, { passive: false });

  const onResize = () => { fixAspect(); render(); };
  window.addEventListener('resize', onResize);
  cleanup = () => { window.removeEventListener('resize', onResize); clearTimeout(saveTimer); S.saveProject(project); };

  requestAnimationFrame(() => { fit(); render(); });
}

route();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
