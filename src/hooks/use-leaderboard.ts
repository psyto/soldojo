import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { LeaderboardEntry } from '@/types';

export function useLeaderboard(timeframe: 'weekly' | 'monthly' | 'alltime') {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard', timeframe],
    queryFn: () =>
      apiFetch<LeaderboardEntry[]>(`/api/leaderboard?timeframe=${timeframe}`),
  });
}
