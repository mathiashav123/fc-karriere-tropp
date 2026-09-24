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
  'footRetrainTarget','playerHasPos','footTrenLabel','footRetrainTip','footOppositePos'
].forEach(f => parts.push(extractFunc(code, f)));

const sandbox = { console, Set, Map, Array, Object, Math, Number, String, Date, JSON, parseInt, parseFloat, isNaN, Infinity, NaN, undefined, Error, TypeError, RegExp };
sandbox.global = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(parts.join('\n') + '\nthis.__ex={footFitForPos,footRetrainTarget,footTrenLabel,normalizeFot};', sandbox);
const { footFitForPos, footRetrainTarget, footTrenLabel } = sandbox.__ex;

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

if (failed) {
  console.error('\n' + failed + ' assert(s) failed');
  process.exit(1);
}
console.log('\nAll fot-tip sanity asserts passed');
