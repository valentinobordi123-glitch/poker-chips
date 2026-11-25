'use client';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { type Room, startHandCards, boardNeeded } from './engine';

const app = getApps()[0] ?? initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);
const ref = (code: string) => doc(db, 'rooms', code);
const priv = (code: string, id: string) => doc(db, 'rooms', code, 'private', id); // cartas privadas y mazo
const ttl = () => new Date(Date.now() + 24 * 3600 * 1000); // la sala expira 24 h después de la última jugada

// Sesión anónima: Firebase la guarda en el navegador, así el uid sobrevive a recargas.
export function useUid() {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => onAuthStateChanged(auth, u => {
    if (u) setUid(u.uid); else signInAnonymously(auth).catch(console.error);
  }), []);
  return uid;
}
// undefined = cargando, null = no existe. Solo escucha cuando ya hay sesión.
export function useRoom(code: string, enabled: boolean) {
  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(ref(code), s => setRoom(s.exists() ? (s.data() as Room) : null), e => { console.error(e); setRoom(null); });
  }, [code, enabled]);
  return room;
}
// Toda escritura es una transacción: dos celulares tocando a la vez no pisan el estado.
export const mutate = (code: string, fn: (r: Room) => void) =>
  runTransaction(db, async t => {
    const s = await t.get(ref(code));
    if (!s.exists()) throw new Error('La sala no existe');
    const r = s.data() as Room; fn(r); r.v++; r.expiresAt = ttl(); t.set(ref(code), r);
  });
export const createRoom = (r: Room) =>
  runTransaction(db, async t => {
    if ((await t.get(ref(r.code))).exists()) throw new Error('collision');
    t.set(ref(r.code), { ...r, expiresAt: ttl() });
  });

// ───────────── Modo "cards" ─────────────
// Mis 2 cartas: solo yo puedo leer rooms/{code}/private/{mi uid} (ver firestore.rules).
export function useMyCards(code: string, uid: string) {
  const [d, setD] = useState<{ cards: string[]; hand: number } | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(priv(code, uid), s => setD(s.exists() ? (s.data() as { cards: string[]; hand: number }) : null), () => setD(null));
  }, [code, uid]);
  return d;
}
// El anfitrión actúa como crupier: baraja, escribe las cartas privadas y guarda el mazo (solo él lo puede leer).
export const dealHand = (code: string, uid: string) =>
  runTransaction(db, async t => {
    const s = await t.get(ref(code));
    if (!s.exists()) throw new Error('La sala no existe');
    const r = s.data() as Room;
    if (r.hostId !== uid) throw new Error('Solo el anfitrión reparte');
    const { deck, hole } = startHandCards(r), exp = ttl();
    Object.entries(hole).forEach(([id, cards]) => t.set(priv(code, id), { cards, hand: r.hand, expiresAt: exp }));
    t.set(priv(code, 'deck'), { cards: deck, hand: r.hand, expiresAt: exp });
    r.v++; r.expiresAt = exp; t.set(ref(code), r);
  });
// Revela Flop/Turn/River en el doc público cuando la calle lo exige (lo ejecuta el cliente del anfitrión).
export const dealBoard = (code: string) =>
  runTransaction(db, async t => {
    const s = await t.get(ref(code)); if (!s.exists()) return;
    const r = s.data() as Room, n = boardNeeded(r.street) - r.board.length;
    if (n <= 0) return;
    const d = await t.get(priv(code, 'deck')), deck = d.data()?.cards as string[] | undefined;
    if (!deck || d.data()?.hand !== r.hand) return;
    r.board.push(...deck.splice(0, n));
    t.set(priv(code, 'deck'), { cards: deck, hand: r.hand, expiresAt: ttl() });
    r.v++; r.expiresAt = ttl(); t.set(ref(code), r);
  });
// En el showdown cada jugador activo publica SUS cartas (nadie más puede leerlas antes).
export const revealMine = (code: string, uid: string) =>
  runTransaction(db, async t => {
    const s = await t.get(ref(code)); if (!s.exists()) return;
    const r = s.data() as Room, p = r.players.find(x => x.id === uid);
    if (!p || r.street !== 'showdown' || !p.inHand || p.folded || p.cards.length) return;
    const d = await t.get(priv(code, uid));
    if (d.data()?.hand !== r.hand) return;
    p.cards = d.data()!.cards; r.v++; r.expiresAt = ttl(); t.set(ref(code), r);
  });
