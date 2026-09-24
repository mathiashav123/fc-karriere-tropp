'use strict';
/**
 * Sanity: foot-mismatch tip text must use the player's stored fot (V/H),
 * never the role's ideal prefer foot.
 * Run: node test-fot-tip-sanity.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const htmlPath = path.join(__dirname, 'fc-karriere-tropp.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function extractFunc(src, name) {
  const m = src.match(new RegExp('  function ' + name + '\\s*\\('));
  if (!m) return '';
  const start = m.index;
  let i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1) + '\n';
    }
  }
  return '';
}
function extractVar(src, name) {
  const m = src.match(new RegExp('  var ' + name + ' = '));
  if (!m) return '';
  const start = m.index;
  let depth = 0, inStr = null;
  for (let j = start + m[0].length - 1; j < src.length; j++) {
    const c = src[j];
    if (inStr) {
      if (c === inStr && src[j - 1] !== '\\') inStr = null;
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === ';' && depth === 0) return src.slice(start, j + 1) + '\n';
  }
  return '';
}

const parts = [];
parts.push(`'use strict';\nvar state = { players: [], akademi: [], formationId: '433', manualSlots: {}, notes: {}, sort: 'pos' };\n`);
['OLD_TO', 'SLOT_ALIASES', 'FORMATIONS', 'POS_BY_CODE'].forEach(v => {
  const x = extractVar(code, v);
  if (x) parts.push(x);
});
[
  'normalizeFot','normalizePosCode','playerPositions','fotLabel',
  'plainSmCode','footPosForSlot','footFitForPos','footScoreDelta','footRoleClass',
  'footRetrainTarget','playerHasPos','footTrenLabel','footRetrainTip','footOppositePos',
  'isBackPosCode','backSideOf','academyBackFootPrefer','academyNeedSimilar','academyPreferTarget',
  'academyPosNeedScore','academyPosFitScore','academyHeightCm','academyHeightFitForPos',
  'academyOptimisticPot','formationUsedPlayerPositions','academyEffectivePos',
  'pickBestAcademyTarget','academyBestPosLead','qualifies'
].forEach(f => {
  try { parts.push(extractFunc(code, f)); } catch (e) { console.error(e.message); process.exit(1); }
});
['ACADEMY_HEIGHT_BANDS'].forEach(v => { const x = extractVar(code, v); if (x) parts.push(x); });
parts.push(`
function posDisplayCode(c){ return c; }
function fmtPlayerArrow(p){ return p && p.navn ? p.navn : '?'; }
function getFormation(){ return FORMATIONS[state.formationId] || FORMATIONS['433']; }
function signedDepthForPos(posCode) {
  return state.players.filter(function(p){ return qualifies(p, posCode); })
    .sort(function(a,b){ return (b.potensial||0)-(a.potensial||0); });
}
function projectedAcademyRank(prospect, potOverride, posCode) {
  var pot = potOverride != null ? potOverride : academyOptimisticPot(prospect);
  var pos = posCode || prospect.hoved;
  var depth = signedDepthForPos(pos);
  var rank = 1;
  for (var i = 0; i < depth.length; i++) {
    var s = depth[i];
    if (pot > s.potensial) break;
    if (pot === s.potensial && prospect.rating > s.rating) break;
    rank++;
  }
  return { rank: rank, depth: depth, pot: pot, pos: pos };
}
`);

const sandbox = { console, Set, Map, Array, Object, Math, Number, String, Date, JSON, parseInt, parseFloat, isNaN, Infinity, NaN, undefined, Error, TypeError, RegExp };
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(parts.join('\n') + '\nthis.__ex={footFitForPos,footRetrainTarget,footTrenLabel,normalizeFot,pickBestAcademyTarget,academyBestPosLead,academyOptimisticPot,academyBackFootPrefer};', sandbox);
const { footFitForPos, footRetrainTarget, footTrenLabel, pickBestAcademyTarget, academyBestPosLead, academyOptimisticPot } = sandbox.__ex;

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed++; }
  else console.log('OK:', msg);
}

/* Schuster-like: fot=H, hoved HB + ekstra VB — mismatch on VB must say H, never V */
const schusterVB = footFitForPos('H', 'VB');
assert(schusterVB && schusterVB.score < 0, 'H on VB is a mismatch (penalty)');
assert(schusterVB.note && schusterVB.note.indexOf('naturlig fot er H') >= 0,
  'Schuster-like H→VB note says naturlig fot er H: ' + schusterVB.note);
assert(schusterVB.note.indexOf('naturlig fot er V') < 0,
  'Schuster-like H→VB never claims naturlig fot er V');

/* Mirror: fot=V mismatch on HB must say V, never H */
const leftOnHB = footFitForPos('V', 'HB');
assert(leftOnHB && leftOnHB.score < 0, 'V on HB is a mismatch');
assert(leftOnHB.note.indexOf('naturlig fot er V') >= 0,
  'V→HB note says naturlig fot er V: ' + leftOnHB.note);
assert(leftOnHB.note.indexOf('naturlig fot er H') < 0,
  'V→HB never claims naturlig fot er H');

/* Match cases keep correct natural-side wording */
const herrmannHB = footFitForPos('H', 'HB');
assert(herrmannHB && herrmannHB.score > 0, 'H on HB matches');
assert(herrmannHB.note && herrmannHB.note.indexOf('naturlig') >= 0,
  'Herrmann-like match note: ' + herrmannHB.note);

/* Exhaustive: any strong natural mismatch note must echo player fot */
['VB','HB','VWB','HWB'].forEach(function (pos) {
  ['V','H'].forEach(function (fot) {
    var f = footFitForPos(fot, pos);
    if (!f || !f.note || f.score >= 0) return;
    if (f.note.indexOf('naturlig fot er') < 0) return;
    assert(f.note.indexOf('naturlig fot er ' + fot) >= 0,
      fot + ' @ ' + pos + ' echoes player fot: ' + f.note);
    var other = fot === 'V' ? 'H' : 'V';
    assert(f.note.indexOf('naturlig fot er ' + other) < 0,
      fot + ' @ ' + pos + ' never claims ' + other + ': ' + f.note);
  });
});

/* Retrain: H on VB → Tren til HB (not inverted wing logic) */
const schuster = { fot: 'H', hoved: 'VB', ekstra: ['HB'] };
assert(footRetrainTarget({ fot: 'H', hoved: 'VB', ekstra: [] }) === 'HB',
  'H hoved VB → retrain HB');
assert(footTrenLabel({ fot: 'H', hoved: 'HB', ekstra: ['VB'] }) === null,
  'H hoved HB already has correct side — no Tren tip');


/* --- Best-pos: natural foot for dual HB/VB (Schuster-like) --- */
function setPlayers(list) { sandbox.state.players = list; }

const thickHB = [
  {id:'h1', navn:'A', rating:70, potensial:80, hoved:'HB', ekstra:[], fot:'H'},
  {id:'h2', navn:'B', rating:68, potensial:78, hoved:'HB', ekstra:[], fot:'H'},
  {id:'h3', navn:'C', rating:66, potensial:76, hoved:'HB', ekstra:[], fot:'H'}
];
const oneVB = [{id:'v1', navn:'V1', rating:70, potensial:80, hoved:'VB', ekstra:[], fot:'V'}];

const schusterLike = { navn:'Schuster', rating:63, potMax:94, potensial:81, hoved:'HB', ekstra:['VB'], fot:'H', alder:16, hoyde:173 };
const leftFootDual = { navn:'LeftDual', rating:63, potMax:94, potensial:81, hoved:'HB', ekstra:['VB'], fot:'V', alder:16, hoyde:173 };

setPlayers(thickHB.concat(oneVB)); /* HB=3, VB=1 — depth would old-pick VB */
{
  const potHi = academyOptimisticPot(schusterLike);
  const t = pickBestAcademyTarget(schusterLike, potHi);
  assert(t && t.pos === 'HB', 'Schuster-like fot=H dual HB+VB (VB thinner) → best HB, got ' + (t && t.pos));
  const lead = academyBestPosLead(t, schusterLike);
  assert(lead.indexOf('Best på HB') === 0 || lead.indexOf('Best som HB') === 0,
    'lead starts Best på HB: ' + lead);
  assert(lead.indexOf('Best på VB') < 0, 'lead must not recommend VB: ' + lead);
}
{
  const potHi = academyOptimisticPot(leftFootDual);
  const t = pickBestAcademyTarget(leftFootDual, potHi);
  assert(t && t.pos === 'VB', 'fot=V dual HB+VB → best VB, got ' + (t && t.pos));
}

/* Empty both sides: foot still decides */
setPlayers([]);
{
  const t = pickBestAcademyTarget(schusterLike, academyOptimisticPot(schusterLike));
  assert(t.pos === 'HB', 'empty squad fot=H → HB');
  const t2 = pickBestAcademyTarget(leftFootDual, academyOptimisticPot(leftFootDual));
  assert(t2.pos === 'VB', 'empty squad fot=V → VB');
}

/* Critical thin override: VB empty + HB≥2 → may pick VB with explanation */
setPlayers(thickHB); /* HB=3, VB=0 */
{
  const t = pickBestAcademyTarget(schusterLike, academyOptimisticPot(schusterLike));
  assert(t.pos === 'VB', 'critically empty VB + covered HB → allow VB, got ' + t.pos);
  assert(t.footDepthOverride === true, 'footDepthOverride set when picking wrong-foot back');
  const lead = academyBestPosLead(t, schusterLike);
  assert(lead.indexOf('mangler helt') >= 0 || lead.indexOf('naturlig') >= 0,
    'override tip explains: ' + lead);
}

/* Wings inverted meta intact: VV prefer H */
{
  const fVV = footFitForPos('H', 'VV');
  const fHV = footFitForPos('H', 'HV');
  assert(fVV.score > 0 && fHV.score < 0, 'inverted wing: H prefers VV over HV');
  const fVVonV = footFitForPos('V', 'VV');
  assert(fVVonV.score < 0, 'inverted wing: V on VV is mismatch');
}

if (failed) {
  console.error('\n' + failed + ' assert(s) failed');
  process.exit(1);
}
console.log('\nAll fot-tip sanity asserts passed');

