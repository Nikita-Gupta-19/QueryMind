import './globals.css';
import type { Metadata } from 'next';
import Providers from '../components/providers';

export const metadata: Metadata = {
  title: 'QueryMind AI',
  description: 'Enterprise-grade Natural Language to SQL Analytics Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-950 text-slate-100 min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
