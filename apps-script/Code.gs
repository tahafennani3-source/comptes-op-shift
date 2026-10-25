/**
 * Comptes OP par shift — version Google (connexion Gmail, sans jeton)
 *
 * Accès : on partage le Google Sheet (Éditeur) avec l'adresse Gmail de la personne.
 * Déploiement "page" : Exécuter en tant que = Utilisateur qui accède, Accès = Tout utilisateur disposant d'un compte Google.
 * Déploiement "API" (optionnel) : Exécuter en tant que = Moi, Accès = Tout le monde, ?api=...&key=CLE
 *
 * Feuilles : OPS (opérateurs), COMPTES (pool WMS), AFF (affectations date/shift/compte/opérateur)
 */
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const SHIFTS = { A: '09h-17h', B: '06h-14h', C: '14h-22h' };
const COLS = {
  OPS: ['id', 'nom', 'matricule', 'shift', 'off', 'poste'],
  COMPTES: ['compte'],
  AFF: ['date', 'shift', 'compte', 'opId', 'par', 'maj']
};
const KEEP_DAYS = 90;
const SS_ID_PROP = 'SS_ID';
/* Pool initial chargé par setup() si la feuille COMPTES est vide (identifiants uniquement, jamais de mots de passe) */
const DEFAULT_COMPTES = ["Admin.PP1@marjanemall.ma", "Admin.PP2@marjanemall.ma", "Admin.PP3@marjanemall.ma", "Admin.PP4@marjanemall.ma", "Admin.PP5@marjanemall.ma", "Admin.PP6@marjanemall.ma", "Admin.rep@marjanemall.ma", "Admin.XD1@marjanemall.ma", "Admin.XD2@marjanemall.ma", "Admin.XD3@marjanemall.ma", "Admin1.rep@marjanemall.ma", "Admin2.rep@marjanemall.ma", "Admin3.rep@marjanemall.ma", "Admin4.rep@marjanemall.ma", "Agent1.emb@marjanemall.ma", "Agent2.emb@marjanemall.ma", "Agent3.emb@marjanemall.ma", "Agent4.emb@marjanemall.ma", "Agent5.emb@marjanemall.ma", "Agent6.emb@marjanemall.ma", "Agent7.emb@marjanemall.ma", "Agent8.emb@marjanemall.ma", "AGENTGDS4@marjanemall.ma", "EDL_Echecdelivraison@marjanemall.ma", "EDL_Echecdelivraison2@marjanemall.ma", "EDL_Echecdelivraison3@marjanemall.ma", "EMM_PP_annulation@marjanemall.ma", "AGENTGDS7@marjanemall.ma", "AGENTGDS5@marjanemall.ma", "AGENTGDS6@marjanemall.ma", "Recep.FFM@marjanemall.ma", "AGENTGDS1@marjanemall.ma", "AGENTGDS2@marjanemall.ma", "AGENTGDS3@marjanemall.ma", "Traitement.annulations.emb-xd@marjanemall.ma"];

/* ---------- Installation : lancer une fois ---------- */
function setup() {
  const ss = SpreadsheetApp.getActive();
  PropertiesService.getScriptProperties().setProperty(SS_ID_PROP, ss.getId());
  for (const [name, cols] of Object.entries(COLS)) {
    let sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (name === 'AFF') sh.getRange('A:A').setNumberFormat('@');
  }
  const f1 = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (f1 && ss.getSheets().length > 1 && f1.getLastRow() === 0) ss.deleteSheet(f1);
  if (ss.getSheetByName('COMPTES').getLastRow() < 2) seedComptes(DEFAULT_COMPTES);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('API_KEY')) props.setProperty('API_KEY', Utilities.getUuid().replace(/-/g, '').slice(0, 24));
  Logger.log('Sheet : ' + ss.getUrl());
  Logger.log('API_KEY = ' + props.getProperty('API_KEY'));
}

/* Charge une liste de comptes WMS (un par ligne) — à appeler depuis l'éditeur si besoin */
function seedComptes(list) {
  const D = readAll_();
  (list || []).forEach(c => { c = String(c).trim(); if (c && !D.comptes.includes(c)) D.comptes.push(c); });
  writeAll_(D, { COMPTES: true });
}

/* ---------- Web ---------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.api) return api_(p);
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Comptes OP par shift')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* Appelé par la page : tout l'état + qui est connecté */
function getAll() {
  const D = readAll_();
  return { ...D, me: email_(), maj: new Date().toISOString() };
}

/* Appelé par la page : liste d'opérations appliquées sous verrou, renvoie l'état à jour */
function apply(ops) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const D = readAll_();
    const me = email_();
    const errs = [];
    const touched = {};
    for (const op of ops || []) {
      try { applyOne_(D, op, me, touched); } catch (err) { errs.push(String(err.message || err)); }
    }
    prune_(D, touched);
    writeAll_(D, touched);
    return { ...D, me, errs, maj: new Date().toISOString() };
  } finally { lock.releaseLock(); }
}

function applyOne_(D, op, me, touched) {
  const t = op.type;
  if (t === 'setAcc') { setAcc_(D, op.d, op.s, op.opId, op.login, me); touched.AFF = true; return; }
  if (t === 'clear') { if (D.aff[op.d]) op.shifts.forEach(s => delete D.aff[op.d][s]); touched.AFF = true; return; }
  if (t === 'opAdd') { D.ops.push(cleanOp_(op.op)); touched.OPS = true; return; }
  if (t === 'opUpdate') {
    const o = D.ops.find(x => x.id === op.id); if (!o) throw new Error('OP introuvable');
    if (!COLS.OPS.includes(op.f) || op.f === 'id') throw new Error('champ invalide');
    Object.assign(o, cleanOp_({ ...o, [op.f]: op.v })); touched.OPS = true; return;
  }
  if (t === 'opDelete') {
    D.ops = D.ops.filter(o => o.id !== op.id);
    for (const d in D.aff) for (const s in D.aff[d]) for (const [l, id] of Object.entries(D.aff[d][s].a)) if (id === op.id) { delete D.aff[d][s].a[l]; delete D.aff[d][s].par[l]; }
    touched.OPS = touched.AFF = true; return;
  }
  if (t === 'import') {
    const list = (op.ops || []).map(cleanOp_);
    if (op.mode === 'replace') {
      const old = new Map(D.ops.filter(o => o.matricule).map(o => [o.matricule, o.id]));
      D.ops = list.map(o => ({ ...o, id: old.get(o.matricule) || o.id }));
    } else {
      for (const o of list) { const e = o.matricule && D.ops.find(y => y.matricule === o.matricule); if (e) Object.assign(e, { ...o, id: e.id }); else D.ops.push(o); }
    }
    (op.cpts || []).forEach(c => { if (c && !D.comptes.includes(c)) D.comptes.push(c); });
    touched.OPS = touched.COMPTES = true; return;
  }
  if (t === 'addComptes') { (op.list || []).forEach(c => { c = String(c).trim(); if (c && !D.comptes.includes(c)) D.comptes.push(c); }); touched.COMPTES = true; return; }
  if (t === 'delCompte') { D.comptes = D.comptes.filter(c => c !== op.c); touched.COMPTES = true; return; }
  throw new Error('opération inconnue : ' + t);
}

function setAcc_(D, d, s, opId, login, par) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !SHIFTS[s]) throw new Error('date ou shift invalide');
  D.aff[d] = D.aff[d] || {};
  const b = D.aff[d][s] = D.aff[d][s] || { a: {}, par: {}, maj: {} };
  for (const [l, o] of Object.entries(b.a)) if (o === opId) { delete b.a[l]; delete b.par[l]; }
  if (login) {
    if (!D.comptes.includes(login)) throw new Error(login + ' n\'est pas dans les comptes WMS');
    if (b.a[login] && b.a[login] !== opId) throw new Error(login + ' déjà pris sur le shift ' + s);
    b.a[login] = opId; b.par[login] = par || '';
  }
}

/* ---------- Stockage dans les feuilles ---------- */
function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty(SS_ID_PROP);
  try { return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive(); }
  catch (e) { throw new Error('ACCES_REFUSE'); }
}
function rows_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Lance setup() une fois');
  const n = sh.getLastRow() - 1;
  return n < 1 ? [] : sh.getRange(2, 1, n, COLS[name].length).getDisplayValues();
}
function readAll_() {
  const ops = rows_('OPS').filter(r => r[0]).map(r => ({ id: r[0], nom: r[1], matricule: r[2], shift: r[3], off: r[4], poste: r[5] }));
  const comptes = rows_('COMPTES').map(r => r[0].trim()).filter(Boolean);
  const aff = {};
  for (const [d, s, c, id, par] of rows_('AFF')) {
    if (!d || !s || !c) continue;
    aff[d] = aff[d] || {};
    const b = aff[d][s] = aff[d][s] || { a: {}, par: {} };
    b.a[c] = id; b.par[c] = par;
  }
  return { ops, comptes, aff };
}
function writeAll_(D, touched) {
  const ss = ss_();
  const put = (name, data) => {
    const sh = ss.getSheetByName(name), w = COLS[name].length;
    const n = Math.max(sh.getLastRow() - 1, 0);
    if (n) sh.getRange(2, 1, n, w).clearContent();
    if (data.length) sh.getRange(2, 1, data.length, w).setValues(data);
  };
  if (touched.OPS) put('OPS', D.ops.map(o => COLS.OPS.map(c => o[c] || '')));
  if (touched.COMPTES) put('COMPTES', D.comptes.map(c => [c]));
  if (touched.AFF) {
    const now = new Date().toISOString(), rows = [];
    Object.keys(D.aff).sort().forEach(d => Object.keys(D.aff[d]).sort().forEach(s => {
      const b = D.aff[d][s];
      Object.entries(b.a).forEach(([c, id]) => rows.push([d, s, c, id, b.par[c] || '', now]));
    }));
    put('AFF', rows);
  }
}
function prune_(D, touched) {
  const lim = Utilities.formatDate(new Date(Date.now() - KEEP_DAYS * 864e5), 'Africa/Casablanca', 'yyyy-MM-dd');
  for (const d of Object.keys(D.aff)) if (d < lim) { delete D.aff[d]; touched.AFF = true; }
}
function cleanOp_(o) {
  const s = String(o.shift || 'B').toUpperCase();
  return {
    id: String(o.id || Utilities.getUuid().slice(0, 8)),
    nom: String(o.nom || '').trim(), matricule: String(o.matricule || '').trim(),
    shift: SHIFTS[s] ? s : 'B', off: JOURS.includes(o.off) ? o.off : '',
    poste: String(o.poste).toUpperCase() === 'PACK' ? 'PACK' : 'PICK'
  };
}
function email_() { try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; } }

/* ---------- API JSON (déploiement "Moi / Tout le monde", clé obligatoire) ---------- */
function api_(p) {
  const key = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!key || p.key !== key) return json_({ ok: false, error: 'cle_invalide' });
  const D = readAll_();
  const today = Utilities.formatDate(new Date(), 'Africa/Casablanca', 'yyyy-MM-dd');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : today;
  if (p.api === 'comptes') return json_({ ok: true, count: D.comptes.length, data: D.comptes });
  if (p.api === 'ops') return json_({ ok: true, count: D.ops.length, data: D.ops });
  if (p.api === 'acces') {
    const j = JOURS[(new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7];
    const shifts = (p.shift ? [String(p.shift).toUpperCase()] : Object.keys(SHIFTS)).filter(s => SHIFTS[s]);
    const out = {};
    for (const s of shifts) {
      const b = (D.aff[date] || {})[s] || { a: {}, par: {} }, parOp = {};
      Object.entries(b.a).forEach(([c, id]) => parOp[id] = c);
      out[s] = D.ops.filter(o => o.shift === s).map(o => ({ nom: o.nom, matricule: o.matricule, shift: s, jour_off: o.off, present: o.off !== j, compte_wms: parOp[o.id] || '', attribue_par: parOp[o.id] ? b.par[parOp[o.id]] || '' : '' }));
    }
    return json_({ ok: true, date, jour: j, shifts: out });
  }
  return json_({ ok: false, error: 'api_inconnue', aide: 'api=acces[&date=AAAA-MM-JJ][&shift=B] | api=ops | api=comptes' });
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
