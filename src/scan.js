// Relevé automatique d'une pièce à partir de photos, analysé par Claude.
// La clé API reste sur l'appareil ; les photos partent uniquement vers l'API Anthropic.
import { round1, area } from './geometry.js';

const MODEL = 'claude-opus-5-5';
const KEY_STORE = 'planpoche.apiKey';

export function getApiKey() {
  try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; }
}
export function setApiKey(k) {
  try { k ? localStorage.setItem(KEY_STORE, k) : localStorage.removeItem(KEY_STORE); } catch { /* stockage indisponible */ }
}

// Réduit une image pour l'envoi (côté max 1568 px, recommandé pour la vision).
export function toJpegBase64(file, max = 1568, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Photo illisible')); };
    img.src = url;
  });
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['corners', 'openings', 'ceiling_height_cm', 'confidence', 'remarks'],
  properties: {
    corners: {
      type: 'array',
      description: 'Coins du sol de la pièce, vue de dessus, dans le sens des aiguilles d\'une montre. x vers la droite, y vers le bas, en centimètres.',
      items: {
        type: 'object', additionalProperties: false, required: ['x_cm', 'y_cm'],
        properties: { x_cm: { type: 'number' }, y_cm: { type: 'number' } },
      },
    },
    openings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['type', 'wall_index', 'offset_cm', 'width_cm', 'height_cm'],
        properties: {
          type: { type: 'string', enum: ['door', 'window'] },
          wall_index: { type: 'integer', description: 'Le mur i va du coin i au coin i+1 (le dernier revient au coin 0).' },
          offset_cm: { type: 'number', description: 'Distance entre le coin i et le bord le plus proche de l\'ouverture.' },
          width_cm: { type: 'number' },
          height_cm: { type: 'number' },
        },
      },
    },
    ceiling_height_cm: { type: 'number' },
    confidence: { type: 'string', enum: ['faible', 'moyenne', 'bonne'] },
    remarks: { type: 'string', description: 'Une ou deux phrases en français pour l\'utilisateur : ce qui est incertain, ce qu\'il faudrait vérifier au mètre.' },
  },
};

const SYSTEM = `Tu es un métreur expérimenté. À partir de photos d'une seule pièce prises au téléphone, tu reconstruis son plan au sol, vu de dessus, en centimètres.

Méthode :
- Repère tous les murs et les coins visibles, et relie les photos entre elles par les éléments communs (portes, fenêtres, radiateurs, meubles, prises).
- Établis l'échelle à partir des références disponibles, par ordre de fiabilité : la cote connue donnée par l'utilisateur, une feuille A4 posée contre un mur (21 x 29,7 cm), la hauteur sous plafond indiquée, puis les standards français (porte intérieure 204 cm de haut et 73 à 93 cm de large, poignée à environ 105 cm, prise électrique à environ 30 cm du sol, plinthe 7 à 10 cm, carrelage courant 30, 45 ou 60 cm).
- Les murs sont presque toujours d'équerre : garde des angles de 90° sauf si un angle différent est clairement visible.
- Donne les coins dans le sens des aiguilles d'une montre vu de dessus, en partant du coin en haut à gauche du plan, avec x vers la droite et y vers le bas. Le premier coin est à (0, 0).
- Arrondis les longueurs à 5 cm près. Ne donne pas de fausse précision.
- Si une partie de la pièce n'est pas visible, déduis la forme la plus probable, et dis-le dans les remarques avec une confiance « faible » ou « moyenne ».`;

export async function analyzeRoom({ apiKey, imagesB64, ceilingCm, knownDimension, roomName }) {
  const { default: Anthropic } = await import('./vendor/anthropic-sdk-1.4.0.mjs');
  // Application personnelle : la clé de l'utilisateur est stockée sur son appareil et utilisée directement.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 5 * 60 * 1000 });

  const hints = [
    `Pièce : ${roomName || 'non précisée'}.`,
    ceilingCm ? `Hauteur sous plafond indiquée par l'utilisateur : ${ceilingCm} cm.` : 'Hauteur sous plafond inconnue.',
    knownDimension ? `Cote connue mesurée par l'utilisateur : ${knownDimension}.` : 'Aucune cote mesurée fournie.',
    `${imagesB64.length} photo(s) jointe(s).`,
  ].join('\n');

  const content = [
    ...imagesB64.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
    { type: 'text', text: `${hints}\n\nReconstruis le plan de cette pièce.` },
  ];

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') throw new Error('L\'analyse a été refusée pour ces photos. Essayez d\'autres photos de la pièce.');
  if (response.stop_reason === 'max_tokens') throw new Error('L\'analyse a été interrompue. Réessayez avec moins de photos.');
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Réponse illisible, réessayez.'); }
  return { data, usage: response.usage };
}

// Valide et convertit le résultat en pièce de l'éditeur.
export function resultToRoom(data, uid) {
  const pts = (data.corners || []).map(c => ({ x: round1(+c.x_cm), y: round1(+c.y_cm) }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 3 || area(pts) < 1e4) throw new Error('Le plan obtenu n\'est pas exploitable. Ajoutez des photos montrant chaque coin.');
  const n = pts.length;
  const openings = (data.openings || [])
    .filter(o => Number.isInteger(o.wall_index) && o.wall_index >= 0 && o.wall_index < n && o.width_cm > 0)
    .map(o => ({ id: uid(), type: o.type === 'door' ? 'door' : 'window', wall: o.wall_index, offset: Math.max(0, +o.offset_cm || 0), width: +o.width_cm, height: +o.height_cm || (o.type === 'door' ? 204 : 115) }));
  const height = data.ceiling_height_cm > 150 && data.ceiling_height_cm < 600 ? Math.round(data.ceiling_height_cm) : null;
  return { points: pts, openings, height, confidence: data.confidence, remarks: data.remarks || '' };
}

export function friendlyError(e) {
  const status = e && e.status;
  if (status === 401) return 'Clé API refusée. Vérifiez-la dans les réglages.';
  if (status === 429) return 'Trop de demandes en même temps. Réessayez dans une minute.';
  if (status === 400 && /credit|balance/i.test(String(e.message))) return 'Crédit API insuffisant sur votre compte Anthropic.';
  if (status >= 500) return 'Le service est momentanément indisponible. Réessayez.';
  if (e && /fetch|network|Failed/i.test(String(e.message)) && !status) return 'Pas de connexion internet. L\'analyse des photos en a besoin.';
  return (e && e.message) || 'Erreur inconnue.';
}
