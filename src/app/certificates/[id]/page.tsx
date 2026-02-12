'use client';

import { useParams } from 'next/navigation';
import { useLocale } from '@/contexts/locale-context';
import { getExplorerUrl } from '@/lib/solana/config';
import {
  Award,
  ExternalLink,
  Download,
  Share2,
  CheckCircle2,
  Calendar,
  User,
  BookOpen,
} from 'lucide-react';

// Mock certificate — will come from cNFT read via DAS API
const MOCK_CERTIFICATE = {
  id: 'cert-1',
  name: 'Anchor Framework Developer',
  track: 'Rust & Anchor',
  level: 2,
  courseName: 'Building with Anchor Framework',
  recipientName: 'CryptoNinja',
  recipientWallet: 'Gh7mKxR3pQ2vN8tY6wJ4bF9eC1dA5hL7xK2nM8rT3qW',
  issuedAt: '2026-02-10',
  mintAddress: '7xW9y7R62vnxachrhTfL3KcpjbKzFaQ8JYN3hZj2JKmM',
  treeAddress: 'DrgZ5sAtjqyobypa18b6tQ3owGxgTi9j3JW68k7JGf8m',
  attributes: {
    'Total XP': 1500,
    'Lessons Completed': 12,
    'Challenges Passed': 4,
    'Completion Time': '3 weeks',
  },
};

export default function CertificatePage() {
  const params = useParams();
  const { t, formatT } = useLocale();
  const cert = MOCK_CERTIFICATE;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Certificate card */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
        {/* Gradient header */}
        <div className="bg-solana-gradient px-8 py-10 text-center text-white">
          <Award className="mx-auto h-16 w-16" />
          <h1 className="mt-4 text-3xl font-bold">{t('certificates.title')}</h1>
          <p className="mt-2 text-lg text-white/80">{cert.name}</p>
        </div>

        {/* Certificate body */}
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('certificates.issuedTo')}</p>
          <h2 className="mt-1 text-2xl font-bold">{cert.recipientName}</h2>

          <p className="mt-4 text-sm text-muted-foreground">
            For successfully completing
          </p>
          <h3 className="mt-1 text-lg font-semibold text-primary">{cert.courseName}</h3>

          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {formatT('certificates.issuedOn', {
                date: new Date(cert.issuedAt).toLocaleDateString(),
              })}
            </span>
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" />
              {cert.track} - Level {cert.level}
            </span>
          </div>

          {/* Attributes */}
          <div className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-4">
            {Object.entries(cert.attributes).map(([key, value]) => (
              <div key={key} className="rounded-lg bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground">{key}</p>
                <p className="mt-0.5 text-lg font-bold">{value}</p>
              </div>
            ))}
          </div>

          {/* On-chain verification */}
          <div className="mx-auto mt-8 max-w-md rounded-xl border border-border bg-background p-4">
            <h4 className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-accent" />
              On-Chain Verification
            </h4>
            <div className="space-y-2 text-left">
              <div>
                <p className="text-xs text-muted-foreground">{t('certificates.mintAddress')}</p>
                <a
                  href={getExplorerUrl('address', cert.mintAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                >
                  {cert.mintAddress}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Merkle Tree</p>
                <a
                  href={getExplorerUrl('address', cert.treeAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                >
                  {cert.treeAddress}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3 border-t border-border p-6">
          <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            <ExternalLink className="h-4 w-4" />
            {t('certificates.verifyOnChain')}
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80">
            <Download className="h-4 w-4" />
            {t('certificates.download')}
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80">
            <Share2 className="h-4 w-4" />
            {t('certificates.share')}
          </button>
        </div>
      </div>
    </div>
  );
}
