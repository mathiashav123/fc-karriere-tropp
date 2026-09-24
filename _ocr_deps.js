var KARRIERE_POSITIONS = [
    { code: 'K', label: 'K · keeper' },
    { code: 'VB', label: 'VB · venstreback' },
    { code: 'VWB', label: 'VWB · venstre wingback' },
    { code: 'MS', label: 'MS · midtstopper' },
    { code: 'HB', label: 'HB · høyreback' },
    { code: 'HWB', label: 'HWB · høyre wingback' },
    { code: 'SDM', label: 'SDM · sittende midtbane / 6-er' },
    { code: 'SM', label: 'SM · sentral midtbane / 8-er' },
    { code: 'AM', label: 'AM · angripende midtbane / 10-er' },
    { code: 'VV', label: 'VV · venstre ving' },
    { code: 'S', label: 'S · spiss' },
    { code: 'HV', label: 'HV · høyre ving' }
  ];

  var POS_BY_CODE = {};
  KARRIERE_POSITIONS.forEach(function (p) { POS_BY_CODE[p.code] = p; });
  /* Hidden aliases for old saves / OCR / slot labels — never in player dropdowns. */
  POS_BY_CODE['CB'] = { code: 'CB', label: 'MS · midtstopper' };
  POS_BY_CODE['VMS'] = { code: 'VMS', label: 'VMS · venstre midtstopper (plassering)' };
  POS_BY_CODE['HMS'] = { code: 'HMS', label: 'HMS · høyre midtstopper (plassering)' };
  POS_BY_CODE['VSM'] = { code: 'VSM', label: 'VSM · venstre SM-plass (plassering)' };
  POS_BY_CODE['HSM'] = { code: 'HSM', label: 'HSM · høyre SM-plass (plassering)' };
  POS_BY_CODE['CAM'] = { code: 'CAM', label: 'AM · angripende midtbane / 10-er' };
  POS_BY_CODE['GK'] = { code: 'GK', label: 'K · keeper' };
  POS_BY_CODE['LB'] = { code: 'LB', label: 'VB · venstreback' };
  POS_BY_CODE['RB'] = { code: 'RB', label: 'HB · høyreback' };
  POS_BY_CODE['LWB'] = { code: 'LWB', label: 'VWB · venstre wingback' };
  POS_BY_CODE['RWB'] = { code: 'RWB', label: 'HWB · høyre wingback' };
  POS_BY_CODE['CDM'] = { code: 'CDM', label: 'SDM · sittende midtbane / 6-er' };
  POS_BY_CODE['CM'] = { code: 'CM', label: 'SM · sentral midtbane / 8-er' };
  POS_BY_CODE['LM'] = { code: 'LM', label: 'SM · sentral midtbane' };
  POS_BY_CODE['RM'] = { code: 'RM', label: 'SM · sentral midtbane' };
  POS_BY_CODE['LW'] = { code: 'LW', label: 'VV · venstre ving' };
  POS_BY_CODE['RW'] = { code: 'RW', label: 'HV · høyre ving' };
  POS_BY_CODE['ST'] = { code: 'ST', label: 'S · spiss' };
  POS_BY_CODE['CF'] = { code: 'CF', label: 'S · spiss' };
  POS_BY_CODE['LF'] = { code: 'LF', label: 'VV · venstre ving' };
  POS_BY_CODE['RF'] = { code: 'RF', label: 'HV · høyre ving' };

  /* Old / sided codes → player attribute codes on load. */
  var OLD_TO = {
    GK: 'K', LB: 'VB', RB: 'HB', LWB: 'VWB', RWB: 'HWB',
    CDM: 'SDM', CM: 'SM', CAM: 'AM',
    LM: 'SM', RM: 'SM', VSM: 'SM', HSM: 'SM',
    LW: 'VV', RW: 'HV', ST: 'S', CF: 'S', LF: 'VV', RF: 'HV',
    CB: 'MS', VMS: 'MS', HMS: 'MS'
  };

  /* Formation slot → which player attribute codes qualify.
     VMS/HMS/VSM/HSM are pitch places; MS/SM are what you set on the player. */
  var SLOT_ALIASES = {
    K:   ['K', 'GK'],
    VB:  ['VB', 'LB', 'LWB', 'VWB'],
    VWB: ['VWB', 'LWB', 'VB', 'LB'],
    VMS: ['MS', 'VMS', 'HMS', 'CB'],
    HMS: ['MS', 'HMS', 'VMS', 'CB'],
    HB:  ['HB', 'RB', 'RWB', 'HWB'],
    HWB: ['HWB', 'RWB', 'HB', 'RB'],
    SDM: ['SDM', 'CDM'],
    SM:  ['SM', 'CM'],
    AM:  ['AM', 'CAM', 'SM', 'CM'],
    CAM: ['AM', 'CAM', 'SM', 'CM'],
    VSM: ['SM', 'CM', 'VSM', 'HSM', 'LM', 'RM'],
    HSM: ['SM', 'CM', 'HSM', 'VSM', 'RM', 'LM'],
    VV:  ['VV', 'LW', 'LF'],
    HV:  ['HV', 'RW', 'RF'],
    S:   ['S', 'ST', 'CF']
  };

    var FORMATIONS = {
    min11: {
      id: 'min11',
      name: 'Min 11',
      hint: '',
      rows: [
        ['VV', 'S', 'HV'],
        ['VSM', 'HSM'],
        ['SDM'],
        ['VB', 'VMS', 'HMS', 'HB'],
        ['K']
      ],
      slots: [
        { id: 'k', pos: 'K' },
        { id: 'vb', pos: 'VB' },
        { id: 'vms', pos: 'VMS' },
        { id: 'hms', pos: 'HMS' },
        { id: 'hb', pos: 'HB' },
        { id: 'sdm', pos: 'SDM' },
        { id: 'vsm', pos: 'VSM' },
        { id: 'hsm', pos: 'HSM' },
        { id: 'vv', pos: 'VV' },
        { id: 's', pos: 'S' },
        { id: 'hv', pos: 'HV' }
      ]
    },
    '433': {
      id: '433',
      name: '4-3-3',
      hint: '4-3-3: én SDM + to SM · VMS/HMS = midtstoppere',
      rows: [
        ['VV', 'S', 'HV'],
        ['SM', 'SM'],
        ['SDM'],
        ['VB', 'VMS', 'HMS', 'HB'],
        ['K']
      ],
      slots: [
        { id: 'k', pos: 'K' },
        { id: 'vb', pos: 'VB' },
        { id: 'vms', pos: 'VMS' },
        { id: 'hms', pos: 'HMS' },
        { id: 'hb', pos: 'HB' },
        { id: 'sdm', pos: 'SDM' },
        { id: 'sm1', pos: 'SM' },
        { id: 'sm2', pos: 'SM' },
        { id: 'vv', pos: 'VV' },
        { id: 's', pos: 'S' },
        { id: 'hv', pos: 'HV' }
      ]
    },
    '4231': {
      id: '4231',
      name: '4-2-3-1',
      hint: '4-2-3-1: AM (#10) mellom VSM og HSM · to SDM · VMS/HMS = midtstoppere',
      rows: [
        ['S'],
        ['VSM', 'AM', 'HSM'],
        ['SDM', 'SDM'],
        ['VB', 'VMS', 'HMS', 'HB'],
        ['K']
      ],
      slots: [
        { id: 'k', pos: 'K' },
        { id: 'vb', pos: 'VB' },
        { id: 'vms', pos: 'VMS' },
        { id: 'hms', pos: 'HMS' },
        { id: 'hb', pos: 'HB' },
        { id: 'sdm1', pos: 'SDM' },
        { id: 'sdm2', pos: 'SDM' },
        { id: 'vsm', pos: 'VSM' },
        { id: 'cam', pos: 'AM' },
        { id: 'hsm', pos: 'HSM' },
        { id: 's', pos: 'S' }
      ]
    },
    '442': {
      id: '442',
      name: '4-4-2',
      hint: '',
      rows: [
        ['S', 'S'],
        ['VSM', 'SDM', 'SM', 'HSM'],
        ['VB', 'VMS', 'HMS', 'HB'],
        ['K']
      ],
      slots: [
        { id: 'k', pos: 'K' },
        { id: 'vb', pos: 'VB' },
        { id: 'vms', pos: 'VMS' },
        { id: 'hms', pos: 'HMS' },
        { id: 'hb', pos: 'HB' },
        { id: 'vsm', pos: 'VSM' },
        { id: 'sdm', pos: 'SDM' },
        { id: 'sm', pos: 'SM' },
        { id: 'hsm', pos: 'HSM' },
        { id: 's1', pos: 'S' },
        { id: 's2', pos: 'S' }
      ]
    },
    '4141': {
      id: '4141',
      name: '4-1-4-1',
      hint: '',
      rows: [
        ['S'],
        ['VSM', 'SM', 'SM', 'HSM'],
        ['SDM'],
        ['VB', 'VMS', 'HMS', 'HB'],
        ['K']
      ],
      slots: [
        { id: 'k', pos: 'K' },
        { id: 'vb', pos: 'VB' },
        { id: 'vms', pos: 'VMS' },
        { id: 'hms', pos: 'HMS' },
        { id: 'hb', pos: 'HB' },
        { id: 'sdm', pos: 'SDM' },
        { id: 'vsm', pos: 'VSM' },
        { id: 'sm1', pos: 'SM' },
        { id: 'sm2', pos: 'SM' },
        { id: 'hsm', pos: 'HSM' },
        { id: 's', pos: 'S' }
      ]
    }
  };

  function defaultState() {
    return {
      players: [],
      akademi: [],
      formationId: '433',
      manualSlots: {},
      notes: '',
      sort: { by: 'rating', dir: 'desc' },
      updatedAt: null,
      _app: 'fc-karriere-tropp'
    };
  }

  function normalizePosCode(code) {
    if (!code) return '';
    code = String(code).trim().toUpperCase();
    if (OLD_TO[code]) return OLD_TO[code];
    return code;
  }

  function normalizeEkstra(raw) {
    var arr;
    if (Array.isArray(raw)) {
      arr = raw;
    } else if (typeof raw === 'string' && raw.trim()) {
      arr = [raw.trim()];
    } else {
      arr = [];
    }
    var seen = {};
    var out = [];
    arr.forEach(function (c) {
      var n = normalizePosCode(c);
      if (n && POS_BY_CODE[n] && !seen[n]) {
        seen[n] = true;
        out.push(n);
      }
    });
    return out;
  }

  