import { apiSuccess, withErrorHandler } from '@/lib/api/utils';
import { learningService } from '@/lib/services/learning-progress';

export const GET = withErrorHandler(async (req) => {
  const { searchParams } = new URL(req.url);
  const timeframe = (searchParams.get('timeframe') || 'alltime') as
    'weekly' | 'monthly' | 'alltime';

  const leaderboard = await learningService.getLeaderboard(timeframe);

  return apiSuccess(leaderboard);
});
