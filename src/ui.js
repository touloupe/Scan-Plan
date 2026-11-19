// Petits composants d'interface : feuilles (bottom sheets), boîtes de saisie, partage de fichiers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Lit un nombre saisi à la française (virgule ou point).
export const num = v => { const x = parseFloat(String(v).replace(',', '.').replace(/\s/g, '')); return Number.isFinite(x) ? x : NaN; };

let openSheet = null;

export function closeSheet() {
  if (!openSheet) return;
  const el = openSheet; openSheet = null;
  el.classList.remove('open');
  setTimeout(() => el.remove(), 200);
}

export function sheet(html, { onClose } = {}) {
  closeSheet();
  const el = h(`<div class="sheet-wrap"><div class="sheet-backdrop"></div><div class="sheet" role="dialog"><div class="sheet-grip"></div>${html}</div></div>`);
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('open'));
  el.querySelector('.sheet-backdrop').addEventListener('click', () => { closeSheet(); onClose && onClose(); });
  openSheet = el;
  return el.querySelector('.sheet');
}

export function ask(title, value = '', { placeholder = '', ok = 'OK', inputmode = 'text' } = {}) {
  return new Promise(resolve => {
    const s = sheet(`<h3>${esc(title)}</h3><form class="stack"><input name="v" value="${esc(value)}" placeholder="${esc(placeholder)}" inputmode="${inputmode}" autocomplete="off"><div class="row"><button type="button" class="btn ghost" data-cancel>Annuler</button><button class="btn primary">${esc(ok)}</button></div></form>`, { onClose: () => resolve(null) });
    const input = s.querySelector('input');
    setTimeout(() => { input.focus(); input.select(); }, 250);
    s.querySelector('[data-cancel]').onclick = () => { closeSheet(); resolve(null); };
    s.querySelector('form').onsubmit = e => { e.preventDefault(); closeSheet(); resolve(input.value.trim()); };
  });
}

export function confirmBox(title, msg, okLabel = 'Supprimer') {
  return new Promise(resolve => {
    const s = sheet(`<h3>${esc(title)}</h3><p class="muted">${esc(msg)}</p><div class="row"><button class="btn ghost" data-no>Annuler</button><button class="btn danger" data-yes>${esc(okLabel)}</button></div>`, { onClose: () => resolve(false) });
    s.querySelector('[data-no]').onclick = () => { closeSheet(); resolve(false); };
    s.querySelector('[data-yes]').onclick = () => { closeSheet(); resolve(true); };
  });
}

let toastTimer;
export function toast(msg) {
  let el = $('#toast');
  if (!el) { el = h('<div id="toast"></div>'); document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// Partage le fichier (feuille de partage iOS) ou le télécharge.
export async function shareFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const safeName = s => String(s || 'plan').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'plan';

// Réduit une photo (max 1280 px, JPEG) pour limiter la place prise.
export function compressImage(file, max = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function svgToPng(svgText, width = 2000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    img.onload = () => {
      const ratio = img.height / img.width || 1;
      const c = document.createElement('canvas');
      c.width = width; c.height = Math.round(width * ratio);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error('png')), 'image/png');
    };
    img.onerror = reject;
    img.src = url;
  });
}
