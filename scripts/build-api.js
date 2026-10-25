// Génère l'API JSON statique dans _site/api/ à partir de data/ops.json
// Lancé par GitHub Actions à chaque modification + chaque jour à 05h (Casablanca).
const fs = require('fs');
const path = require('path');

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const SHIFTS = { A: '09h-17h', B: '06h-14h', C: '14h-22h' };
const out = path.join('_site', 'api');

const src = JSON.parse(fs.readFileSync('data/ops.json', 'utf8'));
const ops = (src.ops || []).filter(o => o && o.id);
const comptes = src.comptes || [];
const aff = src.aff || {};
const byId = new Map(ops.map(o => [o.id, o]));
const now = new Date();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(now); // AAAA-MM-JJ
const jourDe = d => JOURS[(new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7];

const write = (rel, obj) => {
  const f = path.join(out, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ genere: now.toISOString(), ...obj }, null, 2));
};

// Accès WMS d'une date : une ligne par OP présent du shift
function acces(date, s) {
  const b = (aff[date] || {})[s] || { a: {}, par: {} };
  const parOp = {};
  for (const [login, id] of Object.entries(b.a || {})) parOp[id] = login;
  const j = jourDe(date);
  return ops.filter(o => o.shift === s).map(o => ({
    nom: o.nom, matricule: o.matricule, shift: s, jour_off: o.off || '',
    present: o.off !== j, compte_wms: parOp[o.id] || '', attribue_par: parOp[o.id] ? (b.par || {})[parOp[o.id]] || '' : ''
  }));
}
function jourComplet(date) {
  const shifts = {};
  for (const s of Object.keys(SHIFTS)) {
    const l = acces(date, s), pres = l.filter(x => x.present);
    shifts[s] = {
      horaire: SHIFTS[s], effectif: l.length, presents: pres.length, off: l.length - pres.length,
      equipes: pres.filter(x => x.compte_wms).length, sans_compte: pres.filter(x => !x.compte_wms).length,
      comptes_libres: comptes.length - Object.keys(((aff[date] || {})[s] || {}).a || {}).length, data: l
    };
  }
  return { date, jour: jourDe(date), shifts };
}

write('ops.json', { count: ops.length, data: ops.map(({ id, ...o }) => o) });
write('comptes.json', { count: comptes.length, capacite_jour: comptes.length * 3, data: comptes });
write('acces.json', jourComplet(today));                       // aujourd'hui, tous shifts
for (const s of Object.keys(SHIFTS)) write(`acces/${s}.json`, { ...jourComplet(today).shifts[s], date: today, shift: s });
const dates = Object.keys(aff).sort();
for (const d of dates) {
  write(`acces/${d}.json`, jourComplet(d));
  for (const s of Object.keys(SHIFTS)) write(`acces/${d}/${s}.json`, { ...jourComplet(d).shifts[s], date: d, shift: s });
}
write('dates.json', { count: dates.length, data: dates });
console.log(`API générée : ${ops.length} OP, ${comptes.length} comptes, ${dates.length} dates, aujourd'hui ${today}`);
