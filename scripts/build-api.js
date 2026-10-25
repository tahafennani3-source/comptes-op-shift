// Génère l'API JSON statique dans _site/api/ à partir de data/ops.json
// Lancé par GitHub Actions à chaque modification + chaque jour à 05h (Casablanca).
const fs = require('fs');
const path = require('path');

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const SHIFTS = { A: '09h-17h', B: '06h-14h', C: '14h-22h' };
const out = path.join('_site', 'api');

const src = JSON.parse(fs.readFileSync('data/ops.json', 'utf8'));
const ops = (src.ops || []).filter(o => o && o.id);
const now = new Date();
const casa = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Casablanca' }));
const today = JOURS[(casa.getDay() + 6) % 7];

const write = (rel, obj) => {
  const f = path.join(out, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ genere: now.toISOString(), ...obj }, null, 2));
};

function effectif(jour) {
  const r = {};
  for (const s of Object.keys(SHIFTS)) {
    const all = ops.filter(o => o.shift === s);
    const pres = all.filter(o => o.off !== jour);
    r[s] = {
      horaire: SHIFTS[s], total: all.length, presents: pres.length, off: all.length - pres.length,
      PICK: pres.filter(o => o.poste === 'PICK').length, PACK: pres.filter(o => o.poste === 'PACK').length
    };
  }
  return r;
}

write('ops.json', { count: ops.length, data: ops });
write('effectif.json', { jour: today, shifts: effectif(today) });
for (const j of JOURS) write(`effectif/${j}.json`, { jour: j, shifts: effectif(j) });
for (const s of Object.keys(SHIFTS)) {
  const all = ops.filter(o => o.shift === s);
  write(`shift/${s}.json`, { shift: s, horaire: SHIFTS[s], count: all.length, data: all });
  const pres = all.filter(o => o.off !== today);
  write(`presents/${s}.json`, { shift: s, jour: today, count: pres.length, data: pres });
  for (const j of JOURS) {
    const pj = all.filter(o => o.off !== j);
    write(`presents/${j}/${s}.json`, { shift: s, jour: j, count: pj.length, data: pj });
  }
}
console.log(`API générée : ${ops.length} OP, jour ${today}`);
