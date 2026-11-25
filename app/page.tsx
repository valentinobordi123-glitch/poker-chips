'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spade, Plus, LogIn, Coins, Layers } from 'lucide-react';
import { createRoom, mutate, useUid } from '@/lib/room';
import { newRoom, addPlayer } from '@/lib/engine';

const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const rnd = () => Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join('');
const inp = 'w-full h-14 rounded-2xl bg-zinc-900 border border-zinc-800 px-4 text-lg text-zinc-100 outline-none focus:border-emerald-500 placeholder:text-zinc-600';
const btn = 'w-full h-14 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 active:scale-[.98] active:opacity-80 disabled:opacity-40 transition';

export default function Lobby() {
  const router = useRouter(); const uid = useUid();
  const [name, setName] = useState(''); const [code, setCode] = useState('');
  const [cfg, setCfg] = useState({ stack: 1000, sb: 5, bb: 10 });
  const [mode, setMode] = useState<'chips' | 'cards'>('chips');
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  const go = async (f: () => Promise<string>) => {
    setBusy(true); setErr('');
    try { router.push('/room/' + await f()); } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const create = () => go(async () => {
    const pid = uid!;
    for (let i = 0; i < 5; i++) {
      const c = rnd();
      try { await createRoom(newRoom(c, pid, name.trim(), cfg, mode)); return c; }
      catch (e: any) { if (e.message !== 'collision') throw e; }
    }
    throw new Error('No se pudo generar un código, reintenta');
  });
  const join = () => go(async () => {
    const c = code.trim().toUpperCase();
    await mutate(c, r => addPlayer(r, uid!, name.trim()));
    return c;
  });
  const num = (k: 'stack' | 'sb' | 'bb', label: string) => (
    <label className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}
      <input type="number" inputMode="numeric" value={cfg[k] || ''} onChange={e => setCfg({ ...cfg, [k]: +e.target.value })} className={inp + ' mt-1 h-12 px-3 text-base font-bold normal-case tracking-normal'} />
    </label>
  );
  const modes = [
    { m: 'chips' as const, title: 'Solo fichas', sub: 'Con cartas físicas', Icon: Coins },
    { m: 'cards' as const, title: 'Juego completo', sub: 'Cartas virtuales', Icon: Layers },
  ];

  return (
    <main className="h-dvh overflow-y-auto bg-zinc-950 text-zinc-100">
      <div className="min-h-full max-w-md mx-auto p-5 flex flex-col justify-center gap-4">
        <header className="flex items-center gap-3">
          <div className="grid place-items-center w-12 h-12 rounded-2xl bg-emerald-950 border border-emerald-700/40"><Spade className="text-emerald-400" /></div>
          <div><h1 className="text-xl font-black leading-tight">Virtual Poker Chips</h1><p className="text-xs text-zinc-500">Tu mesa de póker, en el celular</p></div>
        </header>

        <input className={inp} placeholder="Tu apodo" value={name} maxLength={14} onChange={e => setName(e.target.value)} />

        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-zinc-900 p-1">
          {([['create', 'Crear sala'], ['join', 'Unirse con código']] as const).map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)} className={`h-11 rounded-xl text-sm font-bold transition ${tab === t ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500'}`}>{l}</button>
          ))}
        </div>

        {tab === 'create' ? (
          <section className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {modes.map(({ m, title, sub, Icon }) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`h-32 rounded-2xl border-2 p-3 flex flex-col items-center justify-center gap-1.5 text-center transition ${mode === m ? 'border-emerald-400 bg-emerald-950/60 shadow-[0_0_24px_rgba(52,211,153,.25)]' : 'border-zinc-800 bg-zinc-900'}`}>
                  <Icon size={30} className={mode === m ? 'text-emerald-400' : 'text-zinc-500'} />
                  <div className="font-bold leading-tight">{title}</div><div className="text-xs text-zinc-500">{sub}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-2">{num('stack', 'Stack')}{num('sb', 'Small blind')}{num('bb', 'Big blind')}</div>
            <button className={btn + ' bg-emerald-600 text-white'} disabled={busy || !uid || !name.trim()} onClick={create}><Plus /> Crear sala</button>
          </section>
        ) : (
          <section className="space-y-4">
            <input className={inp + ' h-20 text-center text-4xl font-black uppercase tracking-[0.4em] placeholder:tracking-[0.4em]'} placeholder="ABCD" maxLength={4} value={code} onChange={e => setCode(e.target.value)} />
            <button className={btn + ' bg-amber-500 text-zinc-950'} disabled={busy || !uid || code.length !== 4 || !name.trim()} onClick={join}><LogIn /> Unirme</button>
          </section>
        )}
        {err && <p className="text-center text-red-400">{err}</p>}
      </div>
    </main>
  );
}