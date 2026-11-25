import { Suspense } from 'react';
import RoomClient from './RoomClient';

// useParams() (dentro de RoomClient) lee la URL: con Cache Components debe ir dentro de <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<p className="grid h-dvh place-items-center bg-zinc-950 text-zinc-500">Cargando…</p>}>
      <RoomClient />
    </Suspense>
  );
}