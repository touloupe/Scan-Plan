// Stockage local des projets (IndexedDB), avec repli en mémoire si indisponible.

const DB = 'planpoche';
const STORE = 'projects';
let dbp = null;
const memory = new Map();

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export async function listProjects() {
  const db = await open();
  const all = db ? await tx(db, 'readonly', s => s.getAll()) : [...memory.values()];
  return all.sort((a, b) => b.updated - a.updated);
}

export async function getProject(id) {
  const db = await open();
  return db ? tx(db, 'readonly', s => s.get(id)) : memory.get(id);
}

export async function saveProject(p) {
  p.updated = Date.now();
  const copy = structuredClone(p);
  const db = await open();
  if (db) await tx(db, 'readwrite', s => s.put(copy));
  else memory.set(p.id, copy);
}

export async function deleteProject(id) {
  const db = await open();
  if (db) await tx(db, 'readwrite', s => s.delete(id));
  else memory.delete(id);
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function newProject(name) {
  return { id: uid(), name: name || 'Nouveau projet', rooms: [], created: Date.now(), updated: Date.now() };
}

export function newRoom(name) {
  return { id: uid(), name: name || 'Pièce', height: 250, points: [], closed: false, openings: [], notes: '', photos: [] };
}
