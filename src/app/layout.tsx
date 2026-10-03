import type { Metadata, Viewport } from 'next';
import { Nunito_Sans, Rubik } from 'next/font/google';
import './globals.css';

const rubik = Rubik({
  subsets: ['latin', 'arabic'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-rubik',
  display: 'swap',
});
const nunito = Nunito_Sans({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-nunito',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Adam's Learning Adventure",
  description: "Adam's own football, racing and superhero learning game.",
  applicationName: "Adam's Adventure",
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: "Adam's Adventure",
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#080e1d',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={`${rubik.variable} ${nunito.variable}`}>
      <body>{children}</body>
    </html>
  );
}
