'use client';

import Link from 'next/link';
import { useLocale } from '@/contexts/locale-context';
import { Flame, Github, Twitter } from 'lucide-react';

export function Footer() {
  const { t } = useLocale();

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
                href="https://github.com/solanabr/superteam-academy"
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
            <h3 className="text-sm font-semibold text-foreground">Learn</h3>
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
            <h3 className="text-sm font-semibold text-foreground">Resources</h3>
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
            <h3 className="text-sm font-semibold text-foreground">Community</h3>
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

        <div className="mt-8 border-t border-border pt-8">
          <p className="text-center text-xs text-muted-foreground">
            Built by the community for Superteam Brazil. Open source under MIT License.
          </p>
        </div>
      </div>
    </footer>
  );
}
