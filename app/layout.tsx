import './globals.css';
import type { Metadata, Viewport } from 'next';
export const metadata: Metadata = { title: 'Virtual Poker Chips' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, viewportFit: 'cover', themeColor: '#0a0a0a' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body className="antialiased">{children}</body></html>;
}

