/**
 * UI controller for Till Practice. DOM only. All logic lives in money.js.
 */
import {
  DENOMINATIONS,
  denominationById,
  formatPence,
  countUpSteps,
  minimalPieces,
  checkPick,
  checkIdentify,
  pieceSum,
  randomIdentifyTarget,
  identifyChoices,
  randomChangeScenario,
  changeDistractors,
  randomPickScenario,
  shuffle,
} from './money.js';
import { renderSvg, describeDenomination, photoUrls, coinScale } from './art.js';

const STORAGE_KEY = 'tillPractice.v1';
const MODES = ['identify', 'change', 'till', 'pick'];
const MODE_TITLES = {
  identify: 'Identify coins and notes',
  change: 'Count-up change',
  till: 'Till scenarios',
  pick: 'Pick the money',
};
const ITEMS = [
  'a sandwich',
  'a newspaper',
  'a pint of milk',
  'a loaf of bread',
  'a phone charger',
  'a birthday card',
  'a bag of crisps',
  'a packet of batteries',
  'a bunch of bananas',
  'a bottle of water',
  'a magazine',
  'a bar of chocolate',
  'a tin of soup',
  'a pack of biros',
  'a lottery ticket',
];

const rng = () => Math.random();

/* ---------- storage ---------- */

function defaultStore() {
  return {
    v: 1,
    settings: { coinsOnly: false, difficulty: 'easy' },
    progress: Object.fromEntries(MODES.map((m) => [m, { correct: 0, attempted: 0 }])),
  };
}

function isCount(n) {
  return Number.isSafeInteger(n) && n >= 0;
}

function loadStore() {
  const base = defaultStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') {
      const s = data.settings;
      if (s && typeof s === 'object') {
        base.settings.coinsOnly = s.coinsOnly === true;
        if (s.difficulty === 'easy' || s.difficulty === 'hard') base.settings.difficulty = s.difficulty;
      }
      const p = data.progress;
      if (p && typeof p === 'object') {
        for (const m of MODES) {
          const v = p[m];
          if (v && isCount(v.correct) && isCount(v.attempted) && v.correct <= v.attempted) {
            base.progress[m] = { correct: v.correct, attempted: v.attempted };
          }
        }
      }
    }
  } catch (err) {
    // Storage blocked (private mode) or corrupt data: fall back to defaults.
  }
  return base;
}

let store = loadStore();

function saveStore() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    // Storage unavailable: the app still works for this session.
  }
}

function recordResult(mode, correct) {
  const p = store.progress[mode];
  p.attempted += 1;
  if (correct) p.correct += 1;
  saveStore();
}

/* ---------- DOM helpers ---------- */

function h(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v; // only ever used with our own generated SVG
    else if (k === 'disabled') node.disabled = Boolean(v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const app = document.getElementById('app');
const live = document.getElementById('live');

function announce(text) {
  if (live) live.textContent = text;
}

function labelOf(id) {
  return formatPence(denominationById(id).pence);
}

/* ---------- navigation and render ---------- */

let screen = 'home';
let round = null;

function render(focusId = 'screen-title') {
  // Keep the scroll position, so adding money to the tray does not move the view.
  const scrollY = window.scrollY;
  const build = SCREENS[screen];
  app.replaceChildren(build());
  let target = document.getElementById(focusId);
  // A disabled control cannot take focus (e.g. Remove last empties the tray), so use the tray text instead.
  if (target && target.disabled) target = document.getElementById('tray-text');
  if (!target) target = document.getElementById('screen-title');
  if (target && !target.disabled) target.focus({ preventScroll: true });
  window.scrollTo(0, scrollY);
}

function go(next) {
  screen = next;
  round = null;
  render('screen-title');
  window.scrollTo(0, 0);
}

function backBar() {
  return h('div', { class: 'topbar' }, h('button', { type: 'button', class: 'btn', onclick: () => go('home') }, 'Back to home'));
}

function title(text) {
  return h('h1', { id: 'screen-title', tabindex: '-1' }, text);
}

function feedbackBox(ok, body) {
  return h(
    'div',
    { id: 'feedback', tabindex: '-1', class: `feedback ${ok ? 'correct' : 'wrong'}` },
    h('strong', { text: ok ? 'Correct. ' : 'Not quite. ' }),
    body,
  );
}

/* ---------- home ---------- */

function screenHome() {
  const { coinsOnly, difficulty } = store.settings;
  const menuItem = (label, hint, target) =>
    h('button', { type: 'button', class: 'btn menu-btn', onclick: () => go(target) }, label, h('small', { text: hint }));
  return h(
    'section',
    { class: 'screen', 'aria-label': 'Home' },
    h('h1', { id: 'screen-title', tabindex: '-1' }, 'Till Practice'),
    h('p', { class: 'lead' }, 'Practise recognising money, giving change and handling till situations.'),
    h(
      'nav',
      { class: 'menu', 'aria-label': 'Practice modes' },
      menuItem('Identify coins and notes', 'See a coin or note and tap its value', 'identify'),
      menuItem('Count-up change', 'Work out the change and count it up', 'change'),
      menuItem('Till scenarios', 'Read the till, then give back the change', 'till'),
      menuItem('Pick the money', 'Build an amount with the fewest pieces', 'pick'),
      menuItem('Progress', 'See your scores, or reset them', 'progress'),
    ),
    h(
      'section',
      { class: 'card settings', 'aria-labelledby': 'settings-title' },
      h('h2', { id: 'settings-title' }, 'Settings'),
      h(
        'button',
        {
          type: 'button',
          id: 'toggle-coins',
          class: 'btn toggle',
          'aria-pressed': String(coinsOnly),
          onclick: () => {
            store.settings.coinsOnly = !store.settings.coinsOnly;
            saveStore();
            render('toggle-coins');
          },
        },
        `Coins only: ${coinsOnly ? 'on' : 'off'}`,
      ),
      h('p', { class: 'muted' }, 'Coins only applies to Identify.'),
      h('p', { id: 'difficulty-label' }, 'Difficulty for count-up and till scenarios'),
      h(
        'div',
        { class: 'row', role: 'group', 'aria-labelledby': 'difficulty-label' },
        ['easy', 'hard'].map((level) =>
          h(
            'button',
            {
              type: 'button',
              id: `diff-${level}`,
              class: 'btn toggle',
              'aria-pressed': String(difficulty === level),
              onclick: () => {
                store.settings.difficulty = level;
                saveStore();
                render(`diff-${level}`);
              },
            },
            level === 'easy' ? 'Easy' : 'Hard',
          ),
        ),
      ),
    ),
  );
}

/* ---------- identify ---------- */

/** The last question shown, as a key, so the same question is not asked twice in a row. */
let lastQuestion = null;

/** Draw a question, redrawing (a few times at most) if it matches the previous one. */
function nextQuestion(draw, keyOf) {
  let value = draw();
  for (let i = 0; i < 20 && keyOf(value) === lastQuestion; i++) value = draw();
  lastQuestion = keyOf(value);
  return value;
}

function startIdentify() {
  const coinsOnly = store.settings.coinsOnly;
  const target = nextQuestion(() => randomIdentifyTarget(rng, { coinsOnly }), (t) => `identify:${t.id}`);
  round = {
    kind: 'identify',
    targetId: target.id,
    choices: identifyChoices(target.id, rng, { coinsOnly, count: 4 }),
    answered: null,
  };
}

function answerIdentify(choiceId) {
  if (!round || round.answered !== null) return;
  round.answered = choiceId;
  const ok = checkIdentify(choiceId, round.targetId);
  recordResult('identify', ok);
  const explanation = describeDenomination(round.targetId);
  const body = ok ? explanation : `You chose ${labelOf(choiceId)}. ${explanation}`;
  announce(`${ok ? 'Correct' : 'Not quite'}. ${body}`);
  render('feedback');
}

/**
 * Real photo if one is available, otherwise the stylised SVG.
 * scale (from coinScale) shrinks a photo to the coin's real size. The SVG already draws coins to
 * scale inside its frame, so it is not scaled again.
 */
/*
 * Picture elements kept between screen updates. Re-rendering otherwise makes new images that start
 * blank until loaded, which flickers on every tap. Moving an existing element keeps its image.
 */
const artCache = new Map();

function pieceArt(id, { key, size, quiz = false, alt = '', scale = 1, className = 'piece-art' }) {
  if (key && artCache.has(key)) return artCache.get(key);
  const box = h('span', { class: className });
  const candidates = photoUrls(id);
  const showSvg = () => {
    box.innerHTML = renderSvg(id, { size, quiz }); // our own generated SVG
  };
  const tryNext = () => {
    const src = candidates.shift();
    if (!src) return showSvg();
    const style = scale < 1 ? `width:${(scale * 100).toFixed(1)}%;margin:0 auto` : undefined;
    box.replaceChildren(h('img', { class: 'art-photo', src, alt, style, onerror: tryNext }));
  };
  if (key) artCache.set(key, box);
  tryNext();
  return box;
}

function identifyArt(id) {
  return pieceArt(id, { size: 240, quiz: true, alt: 'Coin or note to identify', className: 'art' });
}

function screenIdentify() {
  if (!round || round.kind !== 'identify') startIdentify();
  const r = round;
  const locked = r.answered !== null;
  // Build the picture once per question. Re-rendering after an answer would otherwise reload it and flicker.
  if (!r.art) r.art = identifyArt(r.targetId);
  return h(
    'section',
    { class: 'screen' },
    backBar(),
    title(MODE_TITLES.identify),
    h('p', { class: 'lead' }, 'What is this coin or note worth?'),
    r.art,
    h(
      'div',
      { class: 'choices', role: 'group', 'aria-label': 'Possible answers' },
      r.choices.map((id, i) =>
        h(
          'button',
          {
            type: 'button',
            class: 'btn choice',
            id: `choice-${i}`,
            disabled: locked,
            onclick: () => answerIdentify(id),
          },
          labelOf(id),
        ),
      ),
    ),
    locked ? feedbackBox(r.answered === r.targetId, r.answered === r.targetId ? describeDenomination(r.targetId) : `You chose ${labelOf(r.answered)}. ${describeDenomination(r.targetId)}`) : null,
    locked ? h('button', { type: 'button', class: 'btn primary', onclick: () => { startIdentify(); render(); } }, 'Next question') : null,
  );
}

/* ---------- count-up change and till scenarios ---------- */

function startCount(kind) {
  const scenario = nextQuestion(
    () => randomChangeScenario(rng, { difficulty: store.settings.difficulty }),
    (s) => `change:${s.pricePence}:${s.paidPence}`,
  );
  const change = scenario.changePence;
  const item = kind === 'till' ? ITEMS[Math.floor(rng() * ITEMS.length)] : null;
  round = {
    kind,
    scenario,
    item,
    mode: 'tray',
    tray: [],
    choices: shuffle([change, ...changeDistractors(change, rng)], rng),
    picked: null,
    locked: false,
    result: null,
    steps: countUpSteps(scenario.pricePence, scenario.paidPence),
    revealed: 0,
  };
}

function setMode(mode) {
  if (!round || round.locked) return;
  round.mode = mode;
  render(mode === 'tray' ? 'mode-tray' : 'mode-choose');
}

function checkChange() {
  const r = round;
  if (r.locked) return;
  const change = r.scenario.changePence;
  const total = pieceSum(r.tray);
  const ok = total === change;
  r.locked = true;
  r.result = {
    ok,
    body: ok
      ? `The change is ${formatPence(change)}.`
      : `Your tray adds up to ${formatPence(total)}, but the change is ${formatPence(change)}.`,
  };
  if (ok && r.tray.length > minimalPieces(change).length) {
    r.result.body += ` You can do it in fewer pieces: ${minimalPieces(change).map(labelOf).join(', ')}.`;
  }
  recordResult(r.kind, ok);
  announce(`${ok ? 'Correct' : 'Not quite'}. ${r.result.body}`);
  render('feedback');
}

function chooseAmount(value) {
  const r = round;
  if (!r || r.locked) return;
  const change = r.scenario.changePence;
  const ok = value === change;
  r.picked = value;
  r.locked = true;
  r.result = {
    ok,
    body: ok
      ? `The change is ${formatPence(change)}.`
      : `You chose ${formatPence(value)}. The change is ${formatPence(change)}.`,
  };
  recordResult(r.kind, ok);
  announce(`${ok ? 'Correct' : 'Not quite'}. ${r.result.body}`);
  render('feedback');
}

/** Shared tray: tap pieces in, remove the last, clear, check. Used by count-up, till and pick. */
function trayText(r) {
  const contents = r.tray.length ? r.tray.map(labelOf).join(', ') : 'nothing yet';
  return `In your tray: ${contents}. Total ${formatPence(pieceSum(r.tray))}.`;
}

/** Pieces on the table, as stacks: coins and notes in separate rows, one stack per denomination. */
const PILE_MAX_VISIBLE = 6;

function pileStack(d, count) {
  const visible = Math.min(count, PILE_MAX_VISIBLE);
  const pieces = Array.from({ length: visible }, (_, i) =>
    h('span', { class: 'pile-piece', style: `bottom:${i * 5}px` }, pieceArt(d.id, { key: `pile:${d.id}:${i}`, size: 84, scale: coinScale(d.id) })),
  );
  return h(
    'div',
    { class: 'pile-stack' },
    h('div', { class: `pile-pieces ${d.kind}` }, pieces),
    h('span', { class: 'pile-label', text: `${formatPence(d.pence)} × ${count}` }),
  );
}

function pileView(r) {
  const counts = new Map();
  for (const id of r.tray) counts.set(id, (counts.get(id) || 0) + 1);
  // Each row always takes its full height, so the pile never pushes the buttons down.
  const row = (kind, heading) => {
    const items = DENOMINATIONS.filter((d) => d.kind === kind && counts.has(d.id));
    return h(
      'div',
      { class: 'pile-group' },
      h('h3', { class: 'pile-heading', text: heading }),
      h(
        'div',
        { class: 'pile-row' },
        items.length ? items.map((d) => pileStack(d, counts.get(d.id))) : h('p', { class: 'pile-empty', text: 'None yet' }),
      ),
    );
  };
  // Decorative: the tray text above already says what is in the pile, for screen readers.
  return h('section', { class: 'pile', 'aria-hidden': 'true' }, row('coin', 'Coins'), row('note', 'Notes'));
}

function trayPanel(r, { onCheck, checkLabel = 'Check' }) {
  const add = (d) => {
    if (r.locked) return;
    r.tray.push(d.id);
    announce(trayText(r));
    render(`piece-${d.id}`);
  };
  return h(
    'section',
    { class: 'tray', 'aria-label': 'Your tray' },
    h('p', { id: 'tray-text', tabindex: '-1', class: 'tray-text' }, trayText(r)),
    pileView(r),
    h(
      'div',
      { class: 'piece-grid', role: 'group', 'aria-label': 'Coins and notes' },
      DENOMINATIONS.map((d) =>
        h(
          'button',
          {
            type: 'button',
            id: `piece-${d.id}`,
            class: `btn piece ${d.kind}`,
            disabled: r.locked,
            'aria-label': `Add ${formatPence(d.pence)} ${d.kind}`,
            onclick: () => add(d),
          },
          pieceArt(d.id, { key: `piece:${d.id}`, size: 96, scale: coinScale(d.id) }),
        ),
      ),
    ),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          type: 'button',
          id: 'btn-remove',
          class: 'btn',
          disabled: r.locked || r.tray.length === 0,
          onclick: () => {
            r.tray.pop();
            announce(trayText(r));
            render('btn-remove');
          },
        },
        'Remove last',
      ),
      h(
        'button',
        {
          type: 'button',
          id: 'btn-clear',
          class: 'btn',
          disabled: r.locked || r.tray.length === 0,
          onclick: () => {
            r.tray.length = 0;
            announce(trayText(r));
            render('btn-clear');
          },
        },
        'Clear',
      ),
    ),
    h('button', { type: 'button', id: 'btn-check', class: 'btn primary', disabled: r.locked, onclick: onCheck }, checkLabel),
  );
}

function revealPanel(r) {
  const steps = r.steps;
  if (steps.length === 0) {
    return h('section', { class: 'card steps-card' }, h('p', { text: 'No change is due. This is an exact payment.' }));
  }
  const shown = steps.slice(0, r.revealed);
  const done = r.revealed >= steps.length;
  return h(
    'section',
    { class: 'card steps-card', 'aria-label': 'Count-up' },
    r.revealed > 0 ? h('p', { class: 'big-step' }, `Start at ${formatPence(r.scenario.pricePence)}`) : null,
    r.revealed > 0
      ? h(
          'ol',
          { class: 'steps' },
          shown.map((s) =>
            h('li', {}, `Add ${labelOf(s.pieceId)}. Running total ${formatPence(s.runningTotalPence)}.`),
          ),
        )
      : null,
    done
      ? h('p', { class: 'muted' }, `Count-up complete at ${formatPence(r.scenario.paidPence)}.`)
      : h(
          'button',
          {
            type: 'button',
            id: 'btn-reveal',
            class: 'btn',
            onclick: () => {
              r.revealed += 1;
              render('btn-reveal');
            },
          },
          r.revealed === 0 ? 'Show count-up' : 'Show next step',
        ),
  );
}

/** The till's screen: price, amount paid and the change it works out. The learner counts out the change. */
function tillDisplay(s) {
  return h(
    'div',
    { class: 'till-display', role: 'group', 'aria-label': 'Till display' },
    h('div', { class: 'till-row' }, h('span', { text: 'Price' }), h('span', { text: formatPence(s.pricePence) })),
    h('div', { class: 'till-row' }, h('span', { text: 'Paid' }), h('span', { text: formatPence(s.paidPence) })),
    h('div', { class: 'till-row till-due' }, h('span', { text: 'Change due' }), h('span', { text: formatPence(s.changePence) })),
  );
}

function screenCount(kind) {
  if (!round || round.kind !== kind) startCount(kind);
  const r = round;
  const s = r.scenario;
  const isTill = kind === 'till';
  const hasChoose = !isTill;
  const choosing = hasChoose && r.mode === 'choose';

  const scenarioCard = isTill
    ? h(
        'section',
        { class: 'card scenario', 'aria-label': 'Scenario' },
        h('p', { class: 'scenario-text' }, `Customer buys ${r.item} for ${formatPence(s.pricePence)}, hands over ${formatPence(s.paidPence)}. What do you give back?`),
        tillDisplay(s),
      )
    : h(
        'section',
        { class: 'card scenario', 'aria-label': 'Amounts' },
        h('p', { class: 'big-step' }, `Price: ${formatPence(s.pricePence)}`),
        h('p', { class: 'big-step' }, `Handed over: ${formatPence(s.paidPence)}`),
        h('p', { class: 'scenario-text' }, 'What do you give back?'),
      );

  const modeRow = hasChoose
    ? h(
        'div',
        { class: 'row', role: 'group', 'aria-label': 'How to answer' },
        h(
          'button',
          {
            type: 'button',
            id: 'mode-tray',
            class: 'btn toggle',
            'aria-pressed': String(!choosing),
            disabled: r.locked,
            onclick: () => setMode('tray'),
          },
          'Build the change',
        ),
        h(
          'button',
          {
            type: 'button',
            id: 'mode-choose',
            class: 'btn toggle',
            'aria-pressed': String(choosing),
            disabled: r.locked,
            onclick: () => setMode('choose'),
          },
          'Choose the total',
        ),
      )
    : null;

  const answerArea = choosing
    ? h(
        'div',
        { class: 'choices', role: 'group', 'aria-label': 'Change amounts' },
        r.choices.map((v, i) =>
          h(
            'button',
            {
              type: 'button',
              id: `choice-${i}`,
              class: 'btn choice',
              disabled: r.locked,
              onclick: () => chooseAmount(v),
            },
            formatPence(v),
          ),
        ),
      )
    : trayPanel(r, { onCheck: checkChange });

  return h(
    'section',
    { class: 'screen' },
    backBar(),
    title(isTill ? MODE_TITLES.till : MODE_TITLES.change),
    scenarioCard,
    modeRow,
    answerArea,
    r.result ? feedbackBox(r.result.ok, r.result.body) : null,
    r.locked || r.revealed > 0 ? revealPanel(r) : null,
    h('button', { type: 'button', class: 'btn primary', onclick: () => { startCount(kind); render(); } }, 'Next question'),
  );
}

/* ---------- pick the money ---------- */

function startPick() {
  const target = nextQuestion(() => randomPickScenario(rng), (p) => `pick:${p}`);
  round = { kind: 'pick', target, tray: [], locked: false, result: null };
}

function checkPickRound() {
  const r = round;
  if (r.locked) return;
  const total = pieceSum(r.tray);
  const ok = checkPick(r.tray, r.target);
  const fewest = minimalPieces(r.target);
  let body;
  if (ok) {
    body = `${formatPence(r.target)} in ${fewest.length} pieces, the fewest possible.`;
  } else if (total === r.target) {
    body = `Exact, but not the fewest pieces. You used ${r.tray.length}. The fewest is ${fewest.length}: ${fewest.map(labelOf).join(', ')}.`;
  } else {
    body = `Not exact. Your tray adds up to ${formatPence(total)}, and the target is ${formatPence(r.target)}.`;
  }
  r.locked = true;
  r.result = { ok, body };
  recordResult('pick', ok);
  announce(`${ok ? 'Correct' : 'Not quite'}. ${body}`);
  render('feedback');
}

function screenPick() {
  if (!round || round.kind !== 'pick') startPick();
  const r = round;
  return h(
    'section',
    { class: 'screen' },
    backBar(),
    title(MODE_TITLES.pick),
    h(
      'section',
      { class: 'card scenario', 'aria-label': 'Target' },
      h('p', { class: 'scenario-text' }, `Build exactly ${formatPence(r.target)} using the fewest pieces.`),
    ),
    trayPanel(r, { onCheck: checkPickRound }),
    r.result ? feedbackBox(r.result.ok, r.result.body) : null,
    h('button', { type: 'button', class: 'btn primary', onclick: () => { startPick(); render(); } }, 'Next question'),
  );
}

/* ---------- progress ---------- */

function resetProgress() {
  if (!window.confirm('Reset all your progress scores? This cannot be undone.')) return;
  store.progress = defaultStore().progress;
  saveStore();
  render('btn-reset');
}

function screenProgress() {
  const rows = MODES.map((m) => {
    const p = store.progress[m];
    const pct = p.attempted ? `${Math.round((100 * p.correct) / p.attempted)}%` : 'not yet tried';
    return h(
      'tr',
      {},
      h('th', { scope: 'row' }, MODE_TITLES[m]),
      h('td', {}, String(p.correct)),
      h('td', {}, String(p.attempted)),
      h('td', {}, pct),
    );
  });
  return h(
    'section',
    { class: 'screen' },
    backBar(),
    title('Progress'),
    h(
      'div',
      { class: 'card table-wrap' },
      h(
        'table',
        {},
        h('caption', { class: 'muted' }, 'Correct answers out of attempts, saved on this device.'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Mode'), h('th', { scope: 'col' }, 'Correct'), h('th', { scope: 'col' }, 'Attempted'), h('th', { scope: 'col' }, 'Score'))),
        h('tbody', {}, rows),
      ),
    ),
    h('button', { type: 'button', id: 'btn-reset', class: 'btn danger', onclick: resetProgress }, 'Reset progress'),
  );
}

const SCREENS = {
  home: screenHome,
  identify: () => screenIdentify(),
  change: () => screenCount('change'),
  till: () => screenCount('till'),
  pick: screenPick,
  progress: screenProgress,
};

/* ---------- start ---------- */

render('screen-title');

if ('serviceWorker' in navigator) {
  try {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support unavailable: the app still works online.
    });
  } catch (err) {
    // Registration not possible in this browser.
  }
}
