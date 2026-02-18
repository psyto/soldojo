'use client';

import { useState } from 'react';
import { useLocale } from '@/contexts/locale-context';
import { formatXP, shortenAddress } from '@/lib/utils';
import { Trophy, Medal, Award, Flame, Zap, Star, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLeaderboard } from '@/hooks';

const PODIUM_ICONS = [Trophy, Medal, Award];
const PODIUM_COLORS = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];
const PODIUM_BG = ['bg-yellow-400/10 border-yellow-400/30', 'bg-gray-300/10 border-gray-300/30', 'bg-amber-600/10 border-amber-600/30'];

export default function LeaderboardPage() {
  const { t, formatT } = useLocale();
  const [timeframe, setTimeframe] = useState<'weekly' | 'monthly' | 'alltime'>('alltime');

  const { data, isLoading, error } = useLeaderboard(timeframe);

  const top3 = data?.slice(0, 3) || [];
  const rest = data?.slice(3) || [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">{t('leaderboard.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('leaderboard.subtitle')}</p>
      </div>

      {/* Timeframe filter */}
      <div className="mb-8 flex justify-center gap-2">
        {(['weekly', 'monthly', 'alltime'] as const).map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              timeframe === tf
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            )}
          >
            {t(`leaderboard.timeframes.${tf}`)}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="py-20 text-center">
          <p className="text-destructive">{t('errors.loadLeaderboard')}</p>
        </div>
      )}

      {data && data.length === 0 && (
        <div className="py-20 text-center">
          <Trophy className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-muted-foreground">{t('leaderboard.noRankings')}</p>
        </div>
      )}

      {data && data.length > 0 && (
        <>
          {/* Podium — top 3 */}
          <div className="mb-10 grid grid-cols-3 gap-4">
            {[1, 0, 2].map((podiumIndex) => {
              const entry = top3[podiumIndex];
              if (!entry) return null;
              const Icon = PODIUM_ICONS[podiumIndex];

              return (
                <div
                  key={entry.userId}
                  className={cn(
                    'flex flex-col items-center rounded-2xl border p-6 text-center',
                    PODIUM_BG[podiumIndex],
                    podiumIndex === 0 && 'mt-0',
                    podiumIndex !== 0 && 'mt-8'
                  )}
                >
                  <Icon className={cn('h-8 w-8', PODIUM_COLORS[podiumIndex])} />
                  <div className="mt-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-lg font-bold">
                    {entry.displayName[0]}
                  </div>
                  <h3 className="mt-2 text-sm font-semibold truncate max-w-full">{entry.displayName}</h3>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="h-3 w-3" />
                    {formatT('gamification.lvl', { level: entry.level.toString() })}
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-lg font-bold text-solana-gradient">
                    <Zap className="h-4 w-4" />
                    {formatXP(entry.totalXP)}
                  </div>
                  {entry.currentStreak > 0 && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-orange-400">
                      <Flame className="h-3 w-3" />
                      {entry.currentStreak}d
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Rankings table */}
          {rest.length > 0 && (
            <div className="rounded-xl border border-border bg-card">
              <div className="grid grid-cols-12 gap-2 border-b border-border px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                <div className="col-span-1">{t('leaderboard.rank')}</div>
                <div className="col-span-5">{t('leaderboard.builder')}</div>
                <div className="col-span-2 text-right">{t('leaderboard.xp')}</div>
                <div className="col-span-2 text-right">{t('leaderboard.level')}</div>
                <div className="col-span-2 text-right">{t('leaderboard.streak')}</div>
              </div>

              {rest.map((entry) => (
                <div
                  key={entry.userId}
                  className="grid grid-cols-12 items-center gap-2 border-b border-border/50 px-4 py-3 last:border-b-0 hover:bg-secondary/30 transition-colors"
                >
                  <div className="col-span-1 text-sm font-medium text-muted-foreground">
                    #{entry.rank}
                  </div>
                  <div className="col-span-5 flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                      {entry.displayName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{entry.displayName}</p>
                      {entry.walletAddress && (
                        <p className="text-[10px] text-muted-foreground">
                          {shortenAddress(entry.walletAddress)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="flex items-center justify-end gap-1 text-sm font-semibold">
                      <Zap className="h-3 w-3 text-accent" />
                      {formatXP(entry.totalXP)}
                    </span>
                  </div>
                  <div className="col-span-2 text-right text-sm text-muted-foreground">
                    {formatT('gamification.lvl', { level: entry.level.toString() })}
                  </div>
                  <div className="col-span-2 text-right">
                    {entry.currentStreak > 0 ? (
                      <span className="flex items-center justify-end gap-1 text-sm text-orange-400">
                        <Flame className="h-3 w-3" />
                        {entry.currentStreak}d
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
