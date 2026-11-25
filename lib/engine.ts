// Lógica pura del juego. Cada función muta un Room (se ejecuta dentro de una transacción de Firestore).
export type Street = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export interface Player { id: string; name: string; stack: number; bet: number; totalBet: number; inHand: boolean; folded: boolean; allIn: boolean; acted: boolean; rebuys: number; cards: string[]; handName: string; won: boolean }
export interface SidePot { amount: number; eligible: string[] }
export interface Room {
  code: string; hostId: string; v: number;
  playerIds: string[];  // copia de los ids para que las reglas de Firestore puedan validar membresía
  expiresAt?: unknown;  // TTL: Firestore borra la sala sola
  mode: 'chips' | 'cards'; // chips = cartas físicas · cards = cartas virtuales
  board: string[];      // cartas comunitarias reveladas (formato 'As', 'Td', '2c')
  config: { stack: number; sb: number; bb: number };
  players: Player[]; street: Street; hand: number;
  dealerId: string | null; sbId: string | null; bbId: string | null; turnId: string | null;
  pot: number;          // fichas ya recogidas de calles anteriores
  currentBet: number;   // apuesta más alta de la calle actual
  minRaise: number;     // incremento mínimo de subida
  pots: SidePot[];      // se calcula al llegar al showdown
  log: string;
}
export type Action = { type: 'fold' | 'check' | 'call' } | { type: 'raise'; to: number };

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];
const get = (r: Room, id: string) => r.players.find(p => p.id === id)!;
const live = (r: Room) => r.players.filter(p => p.inHand && !p.folded);
const canAct = (r: Room) => live(r).filter(p => !p.allIn);
const canActPred = (p: Player) => p.inHand && !p.folded && !p.allIn;

function nextId(r: Room, fromId: string | null, pred: (p: Player) => boolean) {
  const n = r.players.length, i = r.players.findIndex(p => p.id === fromId);
  for (let k = 1; k <= n; k++) { const p = r.players[(i + k) % n]; if (pred(p)) return p.id; }
  return null;
}
function put(p: Player, amt: number) {
  const a = Math.min(amt, p.stack); p.stack -= a; p.bet += a; p.totalBet += a; if (p.stack === 0) p.allIn = true;
}
const newPlayer = (id: string, name: string, stack: number): Player =>
  ({ id, name, stack, bet: 0, totalBet: 0, inHand: false, folded: false, allIn: false, acted: false, rebuys: 0, cards: [], handName: '', won: false });

export function newRoom(code: string, hostId: string, name: string, config: Room['config'], mode: Room['mode'] = 'chips'): Room {
  if (!name) throw new Error('Escribe tu apodo');
  if (config.sb <= 0 || config.bb < config.sb || config.stack < config.bb * 2) throw new Error('Revisa stack y ciegas');
  return { code, hostId, v: 0, mode, board: [], playerIds: [hostId], config, players: [newPlayer(hostId, name, config.stack)], street: 'waiting', hand: 0,
    dealerId: null, sbId: null, bbId: null, turnId: null, pot: 0, currentBet: 0, minRaise: config.bb, pots: [], log: 'Sala creada' };
}
export function addPlayer(r: Room, id: string, name: string) {
  if (!name) throw new Error('Escribe tu apodo');
  if (r.players.some(p => p.id === id)) return;
  if (r.players.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('Ese apodo ya está en uso');
  if (r.players.length >= 10) throw new Error('Sala llena');
  r.players.push(newPlayer(id, name, r.config.stack)); r.playerIds.push(id); r.log = `${name} se unió`; // entra en la próxima mano
}

export function startHand(r: Room) {
  if (r.street !== 'waiting') throw new Error('Hay una mano en curso');
  const elig = r.players.filter(p => p.stack > 0);
  if (elig.length < 2) throw new Error('Se necesitan 2 jugadores con fichas');
  r.players.forEach(p => Object.assign(p, { bet: 0, totalBet: 0, folded: false, allIn: false, acted: false, inHand: p.stack > 0, cards: [], handName: '', won: false }));
  r.dealerId = nextId(r, r.dealerId, p => p.inHand);                           // rota el botón
  r.sbId = elig.length === 2 ? r.dealerId : nextId(r, r.dealerId, p => p.inHand); // heads-up: dealer = SB
  r.bbId = nextId(r, r.sbId, p => p.inHand);
  put(get(r, r.sbId!), r.config.sb); put(get(r, r.bbId!), r.config.bb);
  r.pot = 0; r.pots = []; r.board = []; r.hand++; r.street = 'preflop';
  r.currentBet = r.config.bb; r.minRaise = r.config.bb;
  r.turnId = nextId(r, r.bbId, canActPred);
  r.log = `Mano #${r.hand}: ciegas ${r.config.sb}/${r.config.bb}`;
  if (!r.turnId) toShowdown(r);
}

function collect(r: Room) {
  r.players.forEach(p => { r.pot += p.bet; p.bet = 0; p.acted = false; });
  r.currentBet = 0; r.minRaise = r.config.bb;
}

export function act(r: Room, id: string, a: Action) {
  if (r.turnId !== id) throw new Error('No es tu turno');
  if (r.mode === 'cards' && r.board.length < boardNeeded(r.street)) throw new Error('Esperando al repartidor…');
  const p = get(r, id), need = r.currentBet - p.bet;
  if (a.type === 'fold') { p.folded = true; r.log = `${p.name} se retira`; }
  else if (a.type === 'check') { if (need > 0) throw new Error('No puedes pasar'); r.log = `${p.name} pasa`; }
  else if (a.type === 'call') { const paid = Math.min(need, p.stack); put(p, need); r.log = `${p.name} iguala ${paid}`; }
  else {
    if (a.type !== 'raise') return;
const maxTo = p.bet + p.stack, to = Math.min(Math.round(a.to), maxTo);
    if (to <= r.currentBet) throw new Error('La subida debe superar la apuesta actual');
    const full = to - r.currentBet >= r.minRaise;
    if (!full && to < maxTo) throw new Error(`Subida mínima: ${r.currentBet + r.minRaise}`);
    put(p, to - p.bet);
    if (full) { r.minRaise = to - r.currentBet; r.players.forEach(o => { if (o.id !== id) o.acted = false; }); }
    r.currentBet = to; r.log = `${p.name} sube a ${to}${p.allIn ? ' (all-in)' : ''}`;
  }
  p.acted = true;
  advance(r);
}

function advance(r: Room) {
  const lv = live(r);
  if (lv.length === 1) {                                   // todos hicieron fold: premio directo
    collect(r); lv[0].stack += r.pot;
    r.log = `${lv[0].name} gana ${r.pot}`; r.pot = 0; r.street = 'waiting'; r.turnId = null; return;
  }
  const ca = canAct(r);
  if (ca.every(p => p.acted && p.bet === r.currentBet)) {   // ronda de apuestas cerrada
    if (ca.length <= 1) return toShowdown(r);               // nadie más puede apostar
    collect(r);
    r.street = STREETS[STREETS.indexOf(r.street) + 1];
    if (r.street === 'showdown') return toShowdown(r);
    r.turnId = nextId(r, r.dealerId, canActPred);
    return;
  }
  r.turnId = nextId(r, r.turnId, canActPred);
}

function toShowdown(r: Room) {
  collect(r); r.street = 'showdown'; r.turnId = null;
  // Side pots: un pozo por cada nivel de all-in entre los jugadores que siguen en la mano
  const levels = [...new Set(live(r).map(p => p.totalBet))].filter(x => x > 0).sort((a, b) => a - b);
  let prev = 0, sum = 0; const pots: SidePot[] = [];
  for (const lvl of levels) {
    const amount = r.players.reduce((s, p) => s + Math.max(0, Math.min(p.totalBet, lvl) - prev), 0);
    pots.push({ amount, eligible: live(r).filter(p => p.totalBet >= lvl).map(p => p.id) });
    sum += amount; prev = lvl;
  }
  if (r.pot > sum && pots.length) pots[pots.length - 1].amount += r.pot - sum;
  // Un pozo con un solo candidato es una apuesta no igualada: vuelve a su dueño sin votar
  let msg = 'Showdown: el anfitrión elige ganadores';
  r.pots = pots.filter(pt => pt.eligible.length > 1);
  pots.filter(pt => pt.eligible.length === 1).forEach(pt => {
    const p = get(r, pt.eligible[0]); p.stack += pt.amount; r.pot -= pt.amount; msg += ` · ${p.name} recupera ${pt.amount}`;
  });
  r.log = msg;
}

// winners[i] = ids ganadores del pozo i (varios = split pot; el resto indivisible va a los primeros)
export function payout(r: Room, winners: string[][]) {
  if (r.street !== 'showdown') throw new Error('No hay showdown');
  r.pots.forEach((pt, i) => {
    const ws = winners[i];
    if (!ws?.length || ws.some(id => !pt.eligible.includes(id))) throw new Error('Ganadores inválidos');
    const share = Math.floor(pt.amount / ws.length); let rem = pt.amount - share * ws.length;
    ws.forEach(id => { get(r, id).stack += share + (rem-- > 0 ? 1 : 0); });
  });
  r.players.forEach(p => { p.bet = 0; p.totalBet = 0; });
  r.pot = 0; r.pots = []; r.street = 'waiting'; r.log = 'Pozo repartido';
}

// Re-buy: solo entre manos y solo con 0 fichas
export function rebuy(r: Room, id: string) {
  const p = get(r, id);
  if (r.street !== 'waiting') throw new Error('Puedes recargar entre manos');
  if (p.stack > 0) throw new Error('Aún tienes fichas');
  p.stack = r.config.stack; p.rebuys++; r.log = `${p.name} recarga ${r.config.stack}`;
}

// Reordenar asientos (solo anfitrión, entre manos). El orden del array = sentido horario en la mesa física.
// El botón D se guarda por id: al reordenar, sigue en el mismo jugador y rota según el nuevo orden.
export function moveSeat(r: Room, actorId: string, id: string, dir: -1 | 1) {
  if (actorId !== r.hostId) throw new Error('Solo el anfitrión reordena los asientos');
  if (r.street !== 'waiting') throw new Error('Reordena entre manos');
  const i = r.players.findIndex(p => p.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= r.players.length) return;
  [r.players[i], r.players[j]] = [r.players[j], r.players[i]];
  r.log = 'Orden de asientos actualizado';
}

// ───────────── Modo "cards": mazo, reparto y evaluador ─────────────
const RANKS = '23456789TJQKA', SUITS = 'shdc', BASE = 13 ** 5;
const NAMES = ['Carta alta', 'Pareja', 'Doble pareja', 'Trío', 'Escalera', 'Color', 'Full house', 'Póker', 'Escalera de color'];
const BOARD_N: Record<Street, number> = { waiting: 0, preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5 };
export const boardNeeded = (s: Street) => BOARD_N[s];
export const newDeck = () => [...RANKS].flatMap(rk => [...SUITS].map(s => rk + s));
const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
export function shuffle<T>(a: T[]) { // Fisher-Yates
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Inicia la mano y devuelve el mazo restante + las 2 cartas privadas de cada jugador (NO van en el doc público).
export function startHandCards(r: Room) {
  startHand(r);
  const deck = shuffle(newDeck()), hole: Record<string, string[]> = {};
  r.players.forEach(p => { hole[p.id] = p.inHand ? deck.splice(0, 2) : []; });
  return { deck, hole };
}
// Puntaje de 5 cartas: categoría * 13^5 + desempates (comparables como número)
function score5(cs: string[]) {
  const r = cs.map(c => RANKS.indexOf(c[0])).sort((a, b) => b - a), flush = cs.every(c => c[1] === cs[0][1]);
  const cnt = new Map<number, number>(); r.forEach(x => cnt.set(x, (cnt.get(x) ?? 0) + 1));
  const g = [...cnt].sort((a, b) => b[1] - a[1] || b[0] - a[0]); // por repeticiones, luego por valor
  const shape = g.map(e => e[1]).join(''), wheel = r.join() === '12,3,2,1,0';
  const straight = g.length === 5 && (r[0] - r[4] === 4 || wheel);
  const ord = straight ? [wheel ? 3 : r[0]] : g.map(e => e[0]);
  const cat = straight && flush ? 8 : shape === '41' ? 7 : shape === '32' ? 6 : flush ? 5 : straight ? 4
    : shape === '311' ? 3 : shape === '221' ? 2 : shape === '2111' ? 1 : 0;
  return cat * BASE + [...ord, 0, 0, 0, 0, 0].slice(0, 5).reduce((s, x) => s * 13 + x, 0);
}
// Mejor mano de 5 entre 5–7 cartas (21 combinaciones con 7)
export function best(cards: string[]) {
  let b = -1; const n = cards.length;
  const rec = (from: number, pick: string[]) => {
    if (pick.length === 5) { b = Math.max(b, score5(pick)); return; }
    for (let i = from; i < n; i++) rec(i + 1, [...pick, cards[i]]);
  };
  rec(0, []); return b;
}
export const handName = (s: number) => s < 0 ? '' : s === 8 * BASE + 12 * 13 ** 4 ? 'Escalera real' : NAMES[Math.floor(s / BASE)];
export const allRevealed = (r: Room) => live(r).every(p => p.cards.length === 2);

// Showdown automático: mejor mano por pozo (side pots incluidos); empate = split pot vía payout()
export function resolveShowdown(r: Room) {
  if (r.street !== 'showdown' || !allRevealed(r)) throw new Error('Faltan manos por revelar');
  const sc = new Map(live(r).map(p => [p.id, best([...p.cards, ...r.board])]));
  const winners = r.pots.map(pt => {
    const top = Math.max(...pt.eligible.map(id => sc.get(id)!));
    return pt.eligible.filter(id => sc.get(id) === top);
  });
  live(r).forEach(p => { p.handName = handName(sc.get(p.id)!); });
  const main = winners[0], names = main.map(id => get(r, id).name).join(' y ');
  const msg = `${names} ${main.length > 1 ? 'empatan' : 'gana'} con ${handName(sc.get(main[0])!)}`;
  payout(r, winners);
  winners.flat().forEach(id => { get(r, id).won = true; });
  r.log = msg;
}