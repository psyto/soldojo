'use client';

import { useParams } from 'next/navigation';
import { useLocale } from '@/contexts/locale-context';
import { useWallet } from '@solana/wallet-adapter-react';
import { getExplorerUrl } from '@/lib/solana/config';
import { learningService } from '@/lib/services/learning-progress';
import { useEffect, useState } from 'react';
import type { Credential } from '@/types';
import {
  Award,
  ExternalLink,
  CheckCircle2,
  Calendar,
  BookOpen,
  Loader2,
  Twitter,
  Copy,
  Check,
} from 'lucide-react';


export default function CertificatePage() {
  const params = useParams();
  const certId = params.id as string;
  const { t, formatT } = useLocale();
  const { publicKey } = useWallet();
  const [credential, setCredential] = useState<Credential | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchCredential() {
      if (publicKey) {
        try {
          const creds = await learningService.getCredentials(publicKey);
          const match = creds.find((c) => c.mintAddress === certId);
          if (match) {
            setCredential(match);
          }
        } catch {
          // Fall through to mock
        }
      }
      setLoading(false);
    }
    fetchCredential();
  }, [publicKey, certId]);

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleShare = (name: string) => {
    const shareText = formatT('certificates.shareText', { name });
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer,width=600,height=400');
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!credential) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <Award className="mx-auto h-16 w-16 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">{t('certificates.title')}</h1>
        <p className="mt-2 text-muted-foreground">
          {publicKey
            ? t('certificates.noCredential')
            : t('certificates.connectWallet')}
        </p>
      </div>
    );
  }

  const cert = {
    name: credential.name,
    track: credential.track,
    level: credential.level,
    courseName: credential.name,
    recipientName: publicKey?.toBase58().slice(0, 8) ?? 'Learner',
    recipientWallet: publicKey?.toBase58() ?? '',
    issuedAt: credential.issuedAt,
    mintAddress: credential.mintAddress,
    treeAddress: '',
    attributes: credential.attributes,
  };

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
            {t('certificates.completingCourse')}
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
              {cert.track} - {t('leaderboard.level')} {cert.level}
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
              {t('certificates.onChainVerification')}
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
              {cert.treeAddress && (
                <div>
                  <p className="text-xs text-muted-foreground">{t('certificates.merkleTree')}</p>
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
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3 border-t border-border p-6">
          <button
            onClick={() => window.open(getExplorerUrl('address', cert.mintAddress), '_blank', 'noopener,noreferrer')}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <ExternalLink className="h-4 w-4" />
            {t('certificates.verifyOnChain')}
          </button>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
          >
            {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
            {copied ? t('certificates.copied') : t('certificates.share')}
          </button>
          <button
            onClick={() => handleShare(cert.name)}
            className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
          >
            <Twitter className="h-4 w-4" />
            {t('certificates.tweet')}
          </button>
        </div>
      </div>
    </div>
  );
}
