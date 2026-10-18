import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MedRing: prescriptions and discharge sheets as one day',
  description: 'Restates medication labels as a collision-free day ring. It never guesses; anything unclear goes to your pharmacist.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#FBF9F5' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-contrast="normal" suppressHydrationWarning>
      <body className={`${inter.className} bg-[var(--paper)] text-[var(--ink)] antialiased min-h-screen`}>
        {children}
      </body>
    </html>
  );
}