/** Unit test: Marković youth card layout parse (fasit OVR 63, pot 72-94, age 17, MS). */
var fs = require('fs');
var vm = require('vm');
var KARRIERE_POSITIONS = [
  { code: 'K' }, { code: 'VB' }, { code: 'VWB' }, { code: 'MS' }, { code: 'HB' }, { code: 'HWB' },
  { code: 'SDM' }, { code: 'SM' }, { code: 'AM' }, { code: 'VV' }, { code: 'S' }, { code: 'HV' }
];
var POS_BY_CODE = {};
KARRIERE_POSITIONS.forEach(function (p) { POS_BY_CODE[p.code] = p; });
POS_BY_CODE.CB = { code: 'CB' };
var OLD_TO = {
  GK: 'K', ST: 'S', CB: 'MS', CDM: 'SDM', CM: 'SM', CAM: 'AM', LB: 'VB', RB: 'HB',
  LWB: 'VWB', RWB: 'HWB', LW: 'VV', RW: 'HV', CF: 'S', VMS: 'MS', HMS: 'MS'
};
function normalizePosCode(c) {
  if (!c) return '';
  c = String(c).trim().toUpperCase();
  return OLD_TO[c] || c;
}
var src = fs.readFileSync(__dirname + '/_ocr_extract.js', 'utf8');
var code = src.slice(0, src.indexOf('function fillTroppFormFromOcr'));
var sandbox = {
  KARRIERE_POSITIONS: KARRIERE_POSITIONS, POS_BY_CODE: POS_BY_CODE, OLD_TO: OLD_TO,
  normalizePosCode: normalizePosCode, console: console, window: {},
  document: { createElement: function () { return {}; }, head: { appendChild: function () {} }, getElementById: function () { return null; } },
  URL: { createObjectURL: function () { return ''; }, revokeObjectURL: function () {} },
  Image: function () {}, Promise: Promise, Math: Math, JSON: JSON, parseInt: parseInt,
  String: String, Array: Array, isFinite: isFinite, Uint8ClampedArray: Uint8ClampedArray
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
function W(t, x0, y0, x1, y1, c) {
  return { text: t, confidence: c == null ? 90 : c, bbox: { x0: x0, y0: y0, x1: x1, y1: y1 } };
}
var words = [
  W('MS', 220, 40, 270, 70, 92), W('Z.', 180, 90, 210, 130, 88), W('MARKOVIĆ', 215, 88, 420, 132, 95),
  W('63', 160, 150, 205, 190, 93), W('72-94', 250, 152, 340, 188, 91), W('17', 165, 200, 200, 230, 90),
  W('193', 300, 200, 350, 228, 89), W('CM', 355, 205, 390, 225, 85),
  W('PAC', 140, 320, 190, 340, 80), W('61', 140, 345, 175, 370, 80),
  W('DEF', 380, 320, 430, 340, 80), W('59', 380, 345, 415, 370, 80),
  W('ig', 50, 400, 70, 415, 40), W('bi', 75, 400, 95, 415, 38), W('Pes', 100, 400, 140, 415, 42)
];
var merged = sandbox.mergeLayoutWithTextParse(sandbox.parseEaFcOcrLayout(words), sandbox.emptyOcrParse());
var fails = 0;
function assert(c, m) { if (!c) { console.error('FAIL', m); fails++; } else console.log('OK', m); }
assert(/^Z\.\s*Markovi/i.test(merged.navn), 'name≈Z. Marković got=' + merged.navn);
assert(merged.rating === 63, 'rating=63');
assert(merged.potMin === 72 && merged.potMax === 94, 'pot 72-94');
assert(merged.alder === 17, 'age=17');
assert(merged.hoved === 'MS', 'pos=MS');
assert(merged.hoyde === 193, 'height=193');
assert(!/pes|ig bi/i.test(merged.navn), 'reject garbage name');
process.exit(fails ? 1 : 0);
