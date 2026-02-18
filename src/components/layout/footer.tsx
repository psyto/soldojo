'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/contexts/locale-context';
import { Flame, Github, Twitter, Mail, Check } from 'lucide-react';

export function Footer() {
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    // Store subscription locally for now — connect to mailing service later
    setSubscribed(true);
    setEmail('');
    setTimeout(() => setSubscribed(false), 3000);
  };

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-solana-gradient">
                <Flame className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-solana-gradient">SolDojo</span>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              {t('common.tagline')}
            </p>
            <div className="mt-4 flex gap-3">
              <a
                href="https://twitter.com/SuperteamBR"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                href="https://github.com/psyto/soldojo"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Github className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Learn */}
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t('footer.learn')}</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/courses" className="text-sm text-muted-foreground hover:text-foreground">
                  {t('nav.courses')}
                </Link>
              </li>
              <li>
                <Link href="/leaderboard" className="text-sm text-muted-foreground hover:text-foreground">
                  {t('nav.leaderboard')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t('footer.resources')}</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <a href="https://solana.com/docs" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground">
                  Solana Docs
                </a>
              </li>
              <li>
                <a href="https://www.anchor-lang.com/" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground">
                  Anchor Framework
                </a>
              </li>
              <li>
                <a href="https://solanacookbook.com/" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground">
                  Solana Cookbook
                </a>
              </li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t('footer.community')}</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <a href="https://discord.gg/superteambrasil" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground">
                  Discord
                </a>
              </li>
              <li>
                <a href="https://twitter.com/SuperteamBR" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground">
                  Twitter
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Newsletter */}
        <div className="mt-8 rounded-xl border border-border bg-background p-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Mail className="h-4 w-4" />
                {t('footer.stayUpdated')}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('footer.newsletterDescription')}
              </p>
            </div>
            <form onSubmit={handleSubscribe} className="flex w-full gap-2 sm:w-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:w-56"
                required
              />
              <button
                type="submit"
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {subscribed ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    {t('footer.subscribed')}
                  </>
                ) : (
                  t('footer.subscribe')
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-8">
          <p className="text-center text-xs text-muted-foreground">
            {t('footer.builtBy')}
          </p>
        </div>
      </div>
    </footer>
  );
}
