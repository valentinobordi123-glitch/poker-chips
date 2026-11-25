'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Crown, Coins, Copy, Check, Settings, Eye, EyeOff, X, ChevronUp, ChevronDown, LogOut } from 'lucide-react';
import { useRoom, mutate, useUid, useMyCards, dealHand, dealBoard, revealMine } from '@/lib/room';
import { type Room, type Player, type Action, act, startHand, payout, addPlayer, rebuy, moveSeat, boardNeeded, allRevealed, resolveShowdown, best, handName } from '@/lib/engine';

const fmt = (n: number) => n.toLocaleString('es-AR');
const btn = 'rounded-2xl font-bold active:scale-[.98] active:opacity-80 disabled:opacity-40 transition';
// Espacio reservado para banners (fuera de la botonera de apuestas)
const Ad = ({ id }: { id: string }) => <div id={id} className="h-8 shrink-0 mx-3 rounded-lg border border-dashed border-zinc-800 text-[9px] text-zinc-700 grid place-items-center">espacio publicitario</div>;
const Chip = ({ t, c }: { t: string; c: string }) => <span className={`grid place-items-center w-5 h-5 rounded-full text-[9px] font-black shadow ${c}`}>{t}</span>;
const posOf = (r: Room, id: string) => ([
  r.dealerId === id && ['D', 'bg-slate-50 text-zinc-900'], r.sbId === id && ['SB', 'bg-sky-500 text-white'], r.bbId === id && ['BB', 'bg-amber-500 text-zinc-950'],
].filter(Boolean) as [string, string][]);

export default function RoomPage() {
  const { code } = useParams<{ code: string }>(); const router = useRouter();
  const pid = useUid() ?? ''; const [nick, setNick] = useState('');
  const [menu, setMenu] = useState(false); const [copied, setCopied] = useState(false); const [show, setShow] = useState(true);
  const room = useRoom(code, !!pid);
  const mine = useMyCards(code, pid);
  // Modo cartas: el cliente del anfitrión reparte el board y resuelve; cada jugador revela sus cartas en el showdown.
  useEffect(() => {
    if (!room || room.mode !== 'cards' || !pid) return;
    const me = room.players.find(p => p.id === pid), host = room.hostId === pid;
    if (host && room.board.length < boardNeeded(room.street)) dealBoard(code).catch(console.error);
    if (room.street === 'showdown') {
      if (me?.inHand && !me.folded && !me.cards.length) revealMine(code, pid).catch(console.error);
      if (host && allRevealed(room)) mutate(code, r => { if (r.street === 'showdown' && allRevealed(r)) resolveShowdown(r); }).catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.v, pid, code]);
  const run = (fn: (r: Room) => void) => mutate(code, fn).catch(e => alert(e.message));
  const copy = () => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});

  if (room === undefined || !pid) return <p className="grid h-dvh place-items-center bg-zinc-950 text-zinc-500">Cargando…</p>;
  if (room === null) return <p className="grid h-dvh place-items-center bg-zinc-950 text-zinc-300">La sala {code} no existe.</p>;
  const me = room.players.find(p => p.id === pid);
  if (!me) return (
    <div className="grid h-dvh place-items-center bg-zinc-950 p-6 text-zinc-100">
      <div className="w-full max-w-md space-y-3">
        <p className="text-center text-zinc-400">Sala <b className="tracking-widest text-white">{code}</b></p>
        <input className="w-full h-14 rounded-2xl bg-zinc-900 border border-zinc-800 px-4 text-lg outline-none focus:border-emerald-500" placeholder="Tu apodo" value={nick} onChange={e => setNick(e.target.value)} />
        <button className={btn + ' w-full h-14 bg-emerald-600'} onClick={() => run(r => addPlayer(r, pid, nick.trim()))}>Unirme</button>
      </div>
    </div>
  );

  const host = room.hostId === pid, cardsMode = room.mode === 'cards';
  const potTotal = room.pot + room.players.reduce((s, p) => s + p.bet, 0);
  const betting = ['preflop', 'flop', 'turn', 'river'].includes(room.street);
  const turnName = room.players.find(p => p.id === room.turnId)?.name;
  const rivals = room.players.filter(p => p.id !== pid);
  const rows: Player[][] = []; for (let i = 0; i < rivals.length; i += 5) rows.push(rivals.slice(i, i + 5));
  const myCards = cardsMode && room.street !== 'waiting' && me.inHand ? (mine?.hand === room.hand ? mine.cards : null) : [];

  return (
    <div className="h-dvh max-w-md mx-auto flex flex-col overflow-hidden bg-zinc-950 text-zinc-100 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Ad id="ad-top" />
      <header className="flex items-center gap-2 px-3 py-1.5">
        <button onClick={copy} aria-label="Copiar código" className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 font-black tracking-[0.25em]">
          {code}{copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-zinc-500" />}
        </button>
        <span className="text-xs tabular-nums text-zinc-400"><span className="text-zinc-600">SB/BB </span>{room.config.sb}/{room.config.bb}</span>
        <span className="rounded-full border border-amber-600/30 px-2 py-0.5 text-[10px] font-bold text-amber-300">{cardsMode ? 'CARTAS' : 'FICHAS'}</span>
        <button onClick={() => setMenu(true)} aria-label="Opciones" className="ml-auto grid h-9 w-9 place-items-center rounded-lg border border-zinc-800 bg-zinc-900"><Settings size={18} /></button>
      </header>

      {/* Mesa: rivales en arco + centro */}
      <main className="mx-2 flex min-h-0 flex-1 flex-col rounded-[2.5rem] border border-amber-600/30 bg-radial from-emerald-950 via-emerald-900/80 to-zinc-950 px-2 py-4 shadow-[inset_0_0_40px_rgba(0,0,0,.6)]">
        <div className="space-y-1.5">
          {rows.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-1.5 pb-4">
              {row.map((p, i) => <Rival key={p.id} p={p} room={room}
                style={{ transform: `translateY(${row.length > 1 ? Math.round((1 - Math.sin(Math.PI * (i + 0.5) / row.length)) * 22) : 0}px)` }} />)}
            </div>
          ))}
          {rivals.length === 0 && <p className="py-3 text-center text-xs text-emerald-100/50">Comparte el código <b className="tracking-widest">{code}</b> para que se unan</p>}
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
          <div className="flex items-center gap-3">
            <ChipStack amount={potTotal} bb={room.config.bb} size="md" />
            <div className="flex items-baseline gap-2 rounded-full border border-amber-600/20 bg-black/50 px-5 py-1 backdrop-blur">
              <span className="text-[10px] font-bold tracking-widest text-amber-200/70">POT</span>
              <span className="text-3xl font-black tabular-nums text-amber-400">{fmt(potTotal)}</span>
            </div>
          </div>
          <div className="text-[11px] font-bold tracking-[0.3em] text-amber-200/60">{room.street === 'waiting' ? 'ESPERANDO' : room.street.toUpperCase()}</div>
          <Board street={room.street} board={cardsMode ? room.board : undefined} />
          <p className="h-4 max-w-full truncate text-[11px] text-emerald-100/60">{cardsMode ? (room.board.length < boardNeeded(room.street) ? 'Repartiendo…' : room.log) : `${room.log} · ${HINT[room.street]}`}</p>
        </div>
      </main>

      {/* Tu zona: cartas, stack y botonera */}
      <footer className="space-y-2 px-3 pb-1 pt-2">
        {myCards === null && <p className="text-center text-xs text-red-400">No llegan tus cartas. Publica firestore.rules en Firebase y recarga.</p>}
        <MySeat room={room} me={me} cards={myCards ?? []} show={show} setShow={setShow} host={host} />
        {room.street === 'waiting' && (
          <div className="space-y-2">
            {me.stack === 0 && <button className={btn + ' h-12 w-full bg-amber-600 text-zinc-950'} onClick={() => run(r => rebuy(r, pid))}>Recargar {fmt(room.config.stack)} fichas</button>}
            {host
              ? <button className={btn + ' h-14 w-full bg-emerald-600 text-lg'} onClick={() => cardsMode ? dealHand(code, pid).catch(e => alert(e.message)) : run(startHand)}>{room.hand ? 'Siguiente mano' : 'Iniciar mano'}</button>
              : <p className="py-3 text-center text-sm text-zinc-500">Esperando al anfitrión…</p>}
          </div>
        )}
        {room.street === 'showdown' && (cardsMode
          ? <p className="py-3 text-center text-sm text-zinc-400">Revelando manos…</p>
          : <div className="max-h-[40dvh] overflow-y-auto"><Showdown room={room} host={host} onPay={w => run(r => payout(r, w))} /></div>)}
        {betting && <Controls room={room} me={me} off={room.turnId !== pid || (cardsMode && room.board.length < boardNeeded(room.street))} turnName={turnName} send={a => run(r => act(r, pid, a))} />}
      </footer>
      <Ad id="ad-bottom" />

      {menu && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setMenu(false)}>
          <aside className="h-full w-72 space-y-5 overflow-y-auto border-l border-amber-600/30 bg-zinc-950 p-4 pt-[calc(1rem+env(safe-area-inset-top))]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="font-bold">Opciones</h2><button onClick={() => setMenu(false)} aria-label="Cerrar"><X /></button></div>
            <section>
              <h3 className="mb-2 text-xs font-bold tracking-widest text-zinc-500">ASIENTOS</h3>
              {host && room.street === 'waiting' ? (
                <ul className="space-y-1.5">
                  <p className="pb-1 text-xs text-zinc-500">Ordénalos como están sentados (sentido horario). {room.hand === 0 ? 'El primero recibe el botón D.' : 'El botón sigue este orden.'}</p>
                  {room.players.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-xl bg-zinc-900 p-2">
                      <span className="flex-1 truncate text-sm">{p.name}</span>
                      <button aria-label="Subir" disabled={i === 0} onClick={() => run(r => moveSeat(r, pid, p.id, -1))} className="grid h-10 w-10 place-items-center rounded-lg bg-zinc-800 disabled:opacity-30"><ChevronUp size={20} /></button>
                      <button aria-label="Bajar" disabled={i === room.players.length - 1} onClick={() => run(r => moveSeat(r, pid, p.id, 1))} className="grid h-10 w-10 place-items-center rounded-lg bg-zinc-800 disabled:opacity-30"><ChevronDown size={20} /></button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-zinc-500">{host ? 'Solo se pueden reordenar entre manos.' : 'Solo el anfitrión reordena los asientos.'}</p>}
            </section>
            <section>
              <h3 className="mb-2 text-xs font-bold tracking-widest text-zinc-500">FICHAS</h3>
              <button disabled={!(room.street === 'waiting' && me.stack === 0)} onClick={() => { run(r => rebuy(r, pid)); setMenu(false); }} className={btn + ' h-12 w-full bg-amber-600 text-zinc-950'}>Recargar {fmt(room.config.stack)}</button>
              <p className="mt-1.5 text-xs text-zinc-500">Solo entre manos y con 0 fichas.{me.rebuys > 0 ? ` Recargas: ${me.rebuys}.` : ''}</p>
            </section>
            <button onClick={() => router.push('/')} className={btn + ' flex h-12 w-full items-center justify-center gap-2 bg-zinc-900 text-zinc-300'}><LogOut size={18} /> Salir al lobby</button>
          </aside>
        </div>
      )}
    </div>
  );
}

function Rival({ p, room, style }: { p: Player; room: Room; style: React.CSSProperties }) {
  const turn = room.turnId === p.id, out = p.folded || (!p.inHand && room.street !== 'waiting');
  return (
    <div style={style} className={`relative min-w-0 max-w-[4.5rem] flex-1 rounded-xl border bg-zinc-950/70 px-1 py-1.5 text-center ${p.won ? 'border-amber-400' : 'border-amber-600/20'} ${out ? 'opacity-40' : ''}`}>
      {turn && <span className="pointer-events-none absolute inset-0 animate-pulse rounded-xl ring-2 ring-amber-400" />}
      <div className="absolute -right-1 -top-2 flex gap-0.5">{posOf(room, p.id).map(([t, c]) => <Chip key={t} t={t} c={c} />)}</div>
      <div className="truncate text-[10px] font-semibold text-zinc-300">{p.name}</div>
      <div className="text-sm font-black tabular-nums text-amber-100">{fmt(p.stack)}</div>
      {p.cards?.length > 0
        ? <div className="mt-0.5 flex justify-center gap-0.5">{p.cards.map(c => <PlayingCard key={c} c={c} sz="xs" />)}</div>
        : p.bet > 0
          ? <div className="mt-0.5 flex flex-col items-center gap-0.5">
              <ChipStack amount={p.bet} bb={room.config.bb} size="xs" />
              <div className="rounded-full bg-black/50 px-1 text-[10px] font-bold tabular-nums text-amber-300">{fmt(p.bet)}</div>
            </div>
          : <div className="h-4" />}
      <div className="truncate text-[9px] font-bold text-zinc-400">{p.won ? 'GANADOR' : p.handName || (p.allIn ? 'ALL-IN' : p.folded ? 'FOLD' : '\u00a0')}</div>
    </div>
  );
}

function MySeat({ room, me, cards, show, setShow, host }: { room: Room; me: Player; cards: string[]; show: boolean; setShow: (v: boolean) => void; host: boolean }) {
  const hand = cards.length ? (room.board.length >= 3 ? handName(best([...cards, ...room.board])) : 'Tus cartas') : '';
  return (
    <div className={`flex items-center gap-3 ${me.folded ? 'opacity-50' : ''}`}>
      {cards.length > 0 && (
        <div className="flex shrink-0 -space-x-5 pl-1 pr-3">
          {cards.map((c, i) => <div key={c} style={{ transform: `rotate(${i ? 7 : -7}deg) translateY(${i ? 3 : 0}px)` }}><PlayingCard c={show ? c : undefined} sz="xl" /></div>)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate text-xs text-zinc-400">
          {host && <Crown size={12} className="shrink-0 text-amber-400" />}{me.name}
          {posOf(room, me.id).map(([t, c]) => <Chip key={t} t={t} c={c} />)}
        </div>
        <div className="text-3xl font-black leading-tight tabular-nums text-amber-100">{fmt(me.stack)}</div>
        {hand && <div className="truncate text-xs font-bold text-emerald-300">{hand}</div>}
      </div>
      {me.bet > 0 && (
        <div className="flex flex-col items-center gap-1">
          <ChipStack amount={me.bet} bb={room.config.bb} size="sm" />
          <div className="flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-sm font-bold tabular-nums text-amber-300"><Coins size={14} />{fmt(me.bet)}</div>
        </div>
      )}
      {cards.length > 0 && <button onClick={() => setShow(!show)} aria-label="Mostrar u ocultar cartas" className="grid h-10 w-10 place-items-center rounded-full bg-zinc-900 text-zinc-400">{show ? <Eye size={18} /> : <EyeOff size={18} />}</button>}
    </div>
  );
}

function Controls({ room, me, off, turnName, send }: { room: Room; me: Player; off: boolean; turnName?: string; send: (a: Action) => void }) {
  const need = room.currentBet - me.bet, maxTo = me.bet + me.stack;
  const minTo = Math.min(maxTo, room.currentBet + room.minRaise);
  const potT = room.pot + room.players.reduce((s, p) => s + p.bet, 0);
  const [to, setTo] = useState(0); const [open, setOpen] = useState(false);
  const v = Math.max(minTo, Math.min(maxTo, to || minTo));
  const clamp = (n: number) => setTo(Math.max(minTo, Math.min(maxTo, Math.round(n))));
  const canRaise = me.stack > need, disabled = off || me.folded || me.allIn;
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const base = room.currentBet || room.config.bb;
  const quick: [string, number][] = [['2x', base * 2], ['3x', base * 3], ['½ Pot', room.currentBet + (potT + need) / 2], ['All-In', maxTo]];
  return (
    <div className="space-y-2">
      {open && canRaise && !disabled && (
        <div className="space-y-2 rounded-2xl border border-amber-600/30 bg-zinc-900 p-3">
          <div className="flex gap-2">{quick.map(([l, n]) => <button key={l} className={btn + ' h-10 flex-1 bg-zinc-800 text-sm text-amber-200'} onClick={() => clamp(n)}>{l}</button>)}</div>
          <input type="range" min={minTo} max={maxTo} value={v} onChange={e => setTo(+e.target.value)} className="h-8 w-full accent-amber-400" />
          <div className="text-center text-xs text-zinc-400">Subir a <b className="text-base text-amber-300">{fmt(v)}</b></div>
        </div>
      )}
      {disabled && <p className="text-center text-xs text-zinc-500">{me.folded ? 'Te retiraste de esta mano' : me.allIn ? 'Vas all-in' : `Turno de ${turnName ?? '…'}`}</p>}
      <div className={`grid h-14 grid-cols-3 gap-2 ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
        <button className={btn + ' border border-red-900/50 bg-red-950/60 text-red-300'} onClick={() => send({ type: 'fold' })}>Fold</button>
        {need > 0
          ? <button className={btn + ' bg-emerald-600 text-white'} onClick={() => send({ type: 'call' })}>{need >= me.stack ? `All-in ${fmt(me.stack)}` : `Call ${fmt(need)}`}</button>
          : <button className={btn + ' bg-emerald-600 text-white'} onClick={() => send({ type: 'check' })}>Check</button>}
        {canRaise
          ? <button className={btn + ' bg-amber-500 text-zinc-950'} onClick={() => open ? (send({ type: 'raise', to: v }), setOpen(false)) : setOpen(true)}>{open ? `Confirmar ${fmt(v)}` : room.currentBet ? 'Raise' : 'Bet'}</button>
          : <div />}
      </div>
    </div>
  );
}

function Showdown({ room, host, onPay }: { room: Room; host: boolean; onPay: (w: string[][]) => void }) {
  const [w, setW] = useState<string[][]>(() => room.pots.map(p => (p.eligible.length === 1 ? [...p.eligible] : [])));
  const name = (id: string) => room.players.find(p => p.id === id)?.name;
  const tog = (i: number, id: string) => host && setW(w.map((a, j) => (j !== i ? a : a.includes(id) ? a.filter(x => x !== id) : [...a, id])));
  return (
    <div className="space-y-2">
      {room.pots.map((p, i) => (
        <div key={i} className="rounded-2xl border border-amber-600/20 bg-zinc-900 p-3">
          <div className="mb-2 flex justify-between text-sm"><span className="text-zinc-400">{room.pots.length === 1 ? 'Pozo' : i ? `Side pot ${i}` : 'Pozo principal'}</span><b className="text-amber-400">{fmt(p.amount)}</b></div>
          <div className="flex flex-wrap gap-2">
            {p.eligible.map(id => <button key={id} onClick={() => tog(i, id)} className={btn + ` h-11 px-4 ${w[i]?.includes(id) ? 'bg-emerald-600' : 'bg-zinc-800'}`}>{name(id)}</button>)}
          </div>
          {w[i]?.length > 1 && <p className="mt-2 text-xs text-zinc-500">Empate: se divide en partes iguales</p>}
        </div>
      ))}
      {host
        ? <button className={btn + ' h-14 w-full bg-emerald-600 text-lg'} disabled={w.some(a => !a.length)} onClick={() => onPay(w)}>Repartir pozo</button>
        : <p className="py-3 text-center text-zinc-500">El anfitrión elige al ganador…</p>}
    </div>
  );
}

const STAGES = ['preflop', 'flop', 'turn', 'river', 'showdown'] as const;
const HINT: Record<Room['street'], string> = {
  waiting: 'Esperando la próxima mano', preflop: 'Reparte 2 cartas a cada jugador', flop: 'Tira el Flop: 3 cartas',
  turn: 'Tira el Turn: 1 carta', river: 'Tira el River: 1 carta', showdown: 'Completa 5 cartas y muestren',
};
// Centro de la mesa: Flop (3) · Turn (1) · River (1). Con "board" muestra las cartas reales; sin él, guías que se iluminan.
function Board({ street, board }: { street: Room['street']; board?: string[] }) {
  const idx = STAGES.indexOf(street as (typeof STAGES)[number]); // -1 = esperando
  const groups: [string, number, number][] = [['FLOP', 1, 3], ['TURN', 2, 1], ['RIVER', 3, 1]];
  return (
    <div className="flex items-start justify-center gap-2.5">
      {groups.map(([label, from, n]) => (
        <div key={label} className="flex flex-col items-center gap-1">
          <div className="flex gap-1">
            {Array.from({ length: n }, (_, k) => board
              ? <PlayingCard key={k} c={board[from === 1 ? k : from + 1]} now={idx === from} />
              : idx >= from
                ? <div key={k} className={`${SZ.lg} grid place-items-center bg-slate-50 text-xl text-zinc-300 shadow-lg shadow-black/60 ${idx === from ? 'ring-2 ring-amber-400' : ''}`}>♠</div>
                : <PlayingCard key={k} />)}
          </div>
          <span className={`text-[9px] font-bold tracking-widest ${idx === from ? 'text-amber-400' : 'text-emerald-100/40'}`}>{label} · {n}</span>
        </div>
      ))}
    </div>
  );
}

// Mazo de 4 colores: picas negro, corazones rojo, diamantes azul, tréboles verde
const SUIT: Record<string, [string, string]> = { s: ['♠', 'text-zinc-900'], h: ['♥', 'text-red-600'], d: ['♦', 'text-blue-600'], c: ['♣', 'text-green-600'] };
const SZ = { xs: 'w-5 h-7 text-[9px] rounded', sm: 'w-8 h-11 text-xs rounded-md', lg: 'w-[3.25rem] h-[4.5rem] text-xl rounded-lg', xl: 'w-16 h-24 text-3xl rounded-xl' };
function PlayingCard({ c, sz = 'lg', now }: { c?: string; sz?: keyof typeof SZ; now?: boolean }) {
  if (!c) return <div className={`${SZ[sz]} grid place-items-center border border-amber-600/40 bg-gradient-to-br from-emerald-800 to-emerald-950 text-amber-600/50 shadow-lg shadow-black/60`}>♠</div>;
  const [sym, col] = SUIT[c[1]];
  return (
    <div className={`${SZ[sz]} flex flex-col items-center justify-center bg-slate-50 font-black leading-none shadow-lg shadow-black/60 ${col} ${now ? 'ring-2 ring-amber-400' : ''}`}>
      <span>{c[0] === 'T' ? '10' : c[0]}</span><span className="text-[1.15em]">{sym}</span>
    </div>
  );
}

// ───────────── Pilas de fichas (CSS puro) ─────────────
// El tamaño es relativo a la Big Blind: ≤3bb 1 pila baja azul/blanca · ≤15bb 2 pilas rojo/esmeralda · >15bb 3 pilas altas negro/dorado.
const PAL_SMALL = ['bg-sky-500 border-white', 'bg-slate-100 border-sky-500'];
const PAL_MID = ['bg-red-600 border-white', 'bg-emerald-600 border-white'];
const PAL_BIG = ['bg-zinc-900 border-amber-400', 'bg-amber-500 border-zinc-900'];
const CHIP_DIM = { xs: [16, 7, 3], sm: [20, 9, 3.5], md: [30, 12, 4] } as const; // ancho, alto de la elipse, paso entre fichas (px)
function chipLayout(r: number): { h: number[]; pal: string[] } {
  if (r <= 3) return { h: [r > 1.5 ? 3 : 2], pal: PAL_SMALL };
  if (r <= 15) return { h: r > 8 ? [5, 5] : [4, 5], pal: PAL_MID };
  const g = r > 60 ? 3 : r > 30 ? 2 : r > 20 ? 1 : 0; // a más pozo, pilas más altas
  return { h: [6 + g, 8 + g, 7 + g], pal: PAL_BIG };
}
function ChipStack({ amount, bb, size = 'sm' }: { amount: number; bb: number; size?: keyof typeof CHIP_DIM }) {
  if (!(amount > 0)) return null;
  const { h, pal } = chipLayout(amount / Math.max(bb, 1));
  const [w, ch, step] = CHIP_DIM[size];
  return (
    <div className="pointer-events-none flex items-end gap-0.5 pb-0.5" aria-hidden>
      {h.map((n, si) => (
        <div key={si} className="relative" style={{ width: w, height: ch + (n - 1) * step }}>
          {Array.from({ length: n }, (_, i) => (
            <span key={i} style={{ width: w, height: ch, bottom: i * step, borderWidth: size === 'xs' ? 1.5 : 2 }}
              className={`absolute left-0 rounded-[50%] border-dashed shadow-[0_2px_0_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.3)] ${pal[(i + si) % 2]}`} />
          ))}
        </div>
      ))}
    </div>
  );
}