import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { AnalyticsProvider } from '@/lib/analytics/provider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  'http://localhost:3000';

export const metadata: Metadata = {
  title: {
    default: 'SolDojo - Where Solana Builders Train',
    template: '%s | SolDojo',
  },
  description:
    'Interactive learning platform for Solana development. Master Rust, Anchor, and Web3 with hands-on coding challenges, on-chain credentials, and gamified progression.',
  keywords: [
    'Solana',
    'Solana Development',
    'Learn Solana',
    'Rust',
    'Anchor',
    'Web3',
    'Blockchain',
    'dApp',
    'Smart Contracts',
    'Crypto Education',
    'Superteam Brazil',
  ],
  authors: [{ name: 'Superteam Brazil' }],
  creator: 'Superteam Brazil',
  metadataBase: new URL(baseUrl),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: baseUrl,
    siteName: 'SolDojo',
    title: 'SolDojo - Where Solana Builders Train',
    description:
      'Interactive learning platform for Solana development. On-chain credentials, gamified learning, and a community of builders.',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'SolDojo - Where Solana Builders Train',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SolDojo - Where Solana Builders Train',
    description:
      'Interactive learning platform for Solana development. On-chain credentials, gamified learning, and a community of builders.',
    creator: '@SuperteamBR',
    site: '@SuperteamBR',
    images: ['/og-image.svg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'SolDojo',
  url: baseUrl,
  description: 'Interactive learning platform for Solana development.',
  publisher: {
    '@type': 'Organization',
    name: 'Superteam Brazil',
    url: baseUrl,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        <Providers>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
        <AnalyticsProvider />
      </body>
    </html>
  );
}
