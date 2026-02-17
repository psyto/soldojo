import { PublicKey } from '@solana/web3.js';
import type {
  LearningProgressService,
  Progress,
  StreakData,
  LeaderboardEntry,
  Credential,
} from '@/types';
import { prisma } from '@/lib/db';
import { calculateLevel } from '@/lib/utils';
import { checkAndUnlockAchievements } from './achievements';
import { SOLANA_RPC_ENDPOINT } from '@/lib/solana/config';

/**
 * Stubbed implementation of LearningProgressService.
 * Uses Prisma/PostgreSQL for now — swap to on-chain calls later.
 * The interface remains stable regardless of backend.
 */
export class StubLearningProgressService implements LearningProgressService {
  async getProgress(userId: string, courseId: string): Promise<Progress> {
    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      include: {
        lessonProgress: { where: { isCompleted: true } },
        course: {
          include: {
            modules: {
              include: { lessons: { select: { id: true } } },
            },
          },
        },
      },
    });

    if (!enrollment) {
      return {
        courseId,
        userId,
        completedLessons: [],
        totalLessons: 0,
        percentage: 0,
        enrollmentStatus: 'active',
      };
    }

    const totalLessons = enrollment.course.modules.reduce(
      (sum, m) => sum + m.lessons.length,
      0
    );
    const completedLessonIds = enrollment.lessonProgress.map((lp) => {
      const allLessons = enrollment.course.modules.flatMap((m) => m.lessons);
      return allLessons.findIndex((l) => l.id === lp.lessonId);
    });

    return {
      courseId,
      userId,
      completedLessons: completedLessonIds.filter((i) => i >= 0),
      totalLessons,
      percentage: totalLessons > 0
        ? Math.round((completedLessonIds.length / totalLessons) * 100)
        : 0,
      enrollmentStatus: enrollment.status.toLowerCase() as 'active' | 'completed' | 'dropped',
    };
  }

  async completeLesson(
    userId: string,
    courseId: string,
    lessonIndex: number
  ): Promise<void> {
    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      include: {
        course: {
          include: {
            modules: {
              orderBy: { sortOrder: 'asc' },
              include: {
                lessons: { orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
      },
    });

    if (!enrollment) throw new Error('Not enrolled');

    const allLessons = enrollment.course.modules.flatMap((m) => m.lessons);
    const lesson = allLessons[lessonIndex];
    if (!lesson) throw new Error('Lesson not found');

    // Check if lesson was already completed (avoid double XP)
    const existing = await prisma.lessonProgress.findUnique({
      where: {
        enrollmentId_lessonId: {
          enrollmentId: enrollment.id,
          lessonId: lesson.id,
        },
      },
    });
    const alreadyCompleted = existing?.isCompleted ?? false;

    await prisma.lessonProgress.upsert({
      where: {
        enrollmentId_lessonId: {
          enrollmentId: enrollment.id,
          lessonId: lesson.id,
        },
      },
      create: {
        enrollmentId: enrollment.id,
        lessonId: lesson.id,
        isCompleted: true,
        completedAt: new Date(),
      },
      update: {
        isCompleted: true,
        completedAt: new Date(),
      },
    });

    // Only award XP if not already completed
    if (!alreadyCompleted) {
      // Award lesson/challenge XP
      await prisma.xPEvent.create({
        data: {
          userId,
          amount: lesson.xpReward,
          reason: lesson.type === 'CHALLENGE' ? 'CHALLENGE_COMPLETE' : 'LESSON_COMPLETE',
          sourceId: lesson.id,
        },
      });

      let bonusXP = 0;

      // Check for first-of-day bonus (25 XP)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayEvents = await prisma.xPEvent.count({
        where: {
          userId,
          createdAt: { gte: today, lt: tomorrow },
          reason: { in: ['LESSON_COMPLETE', 'CHALLENGE_COMPLETE'] },
        },
      });

      // If this is the first lesson/challenge completed today (the one we just created is count 1)
      if (todayEvents <= 1) {
        await prisma.xPEvent.create({
          data: {
            userId,
            amount: 25,
            reason: 'FIRST_OF_DAY',
          },
        });
        bonusXP += 25;
      }

      await prisma.user.update({
        where: { id: userId },
        data: { totalXP: { increment: lesson.xpReward + bonusXP } },
      });

      // Update streak
      await prisma.streakDay.upsert({
        where: { userId_date: { userId, date: today } },
        create: { userId, date: today },
        update: {},
      });

      // Recalculate streak
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const hadYesterday = await prisma.streakDay.findUnique({
          where: { userId_date: { userId, date: yesterday } },
        });

        const newStreak = hadYesterday ? user.currentStreak + 1 : 1;

        // Daily streak bonus (10 XP) — awarded when streak continues
        if (hadYesterday && newStreak > user.currentStreak) {
          await prisma.xPEvent.create({
            data: {
              userId,
              amount: 10,
              reason: 'DAILY_STREAK',
              sourceId: String(newStreak),
            },
          });
          await prisma.user.update({
            where: { id: userId },
            data: {
              totalXP: { increment: 10 },
              currentStreak: newStreak,
              longestStreak: Math.max(newStreak, user.longestStreak),
              lastActiveAt: new Date(),
            },
          });
        } else {
          await prisma.user.update({
            where: { id: userId },
            data: {
              currentStreak: newStreak,
              longestStreak: Math.max(newStreak, user.longestStreak),
              lastActiveAt: new Date(),
            },
          });
        }
      }
    }

    // Update enrollment progress
    const completedCount = await prisma.lessonProgress.count({
      where: { enrollmentId: enrollment.id, isCompleted: true },
    });
    const totalLessons = allLessons.length;
    const progress = Math.round((completedCount / totalLessons) * 100);

    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        progress,
        status: progress >= 100 ? 'COMPLETED' : 'ACTIVE',
        completedAt: progress >= 100 ? new Date() : undefined,
      },
    });

    // If course completed, award course XP
    if (progress >= 100 && !alreadyCompleted) {
      await prisma.xPEvent.create({
        data: {
          userId,
          amount: enrollment.course.xpReward,
          reason: 'COURSE_COMPLETE',
          sourceId: courseId,
        },
      });
      await prisma.user.update({
        where: { id: userId },
        data: { totalXP: { increment: enrollment.course.xpReward } },
      });
    }

    // Check and unlock achievements (runs after all XP updates)
    await checkAndUnlockAchievements(userId);
  }

  async getXP(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalXP: true },
    });
    return user?.totalXP ?? 0;
  }

  async getStreak(userId: string): Promise<StreakData> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { currentStreak: true, longestStreak: true, lastActiveAt: true },
    });

    const recentDays = await prisma.streakDay.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 90,
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isActiveToday = recentDays.some(
      (d) => d.date.getTime() === today.getTime()
    );

    return {
      currentStreak: user?.currentStreak ?? 0,
      longestStreak: user?.longestStreak ?? 0,
      lastActiveDate: user?.lastActiveAt?.toISOString() ?? null,
      streakHistory: recentDays.map((d) => d.date.toISOString().split('T')[0]),
      isActiveToday,
    };
  }

  async getLeaderboard(
    timeframe: 'weekly' | 'monthly' | 'alltime'
  ): Promise<LeaderboardEntry[]> {
    if (timeframe === 'alltime') {
      // All-time: sort by totalXP directly
      const users = await prisma.user.findMany({
        where: { isPublic: true },
        orderBy: { totalXP: 'desc' },
        take: 100,
        select: {
          id: true,
          displayName: true,
          name: true,
          image: true,
          walletAddress: true,
          totalXP: true,
          currentStreak: true,
        },
      });

      return users.map((user, index) => ({
        rank: index + 1,
        userId: user.id,
        displayName: user.displayName || user.name || 'Anonymous',
        image: user.image,
        walletAddress: user.walletAddress,
        totalXP: user.totalXP,
        level: calculateLevel(user.totalXP),
        currentStreak: user.currentStreak,
      }));
    }

    // Weekly/monthly: aggregate XP events within timeframe
    const now = new Date();
    const since = new Date();
    if (timeframe === 'weekly') {
      since.setDate(now.getDate() - 7);
    } else {
      since.setDate(now.getDate() - 30);
    }

    const xpByUser = await prisma.xPEvent.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: since } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 100,
    });

    if (xpByUser.length === 0) return [];

    const userIds = xpByUser.map((x) => x.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, isPublic: true },
      select: {
        id: true,
        displayName: true,
        name: true,
        image: true,
        walletAddress: true,
        totalXP: true,
        currentStreak: true,
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return xpByUser
      .filter((x) => userMap.has(x.userId))
      .map((x, index) => {
        const user = userMap.get(x.userId)!;
        return {
          rank: index + 1,
          userId: user.id,
          displayName: user.displayName || user.name || 'Anonymous',
          image: user.image,
          walletAddress: user.walletAddress,
          totalXP: x._sum.amount ?? 0,
          level: calculateLevel(user.totalXP),
          currentStreak: user.currentStreak,
        };
      });
  }

  async getCredentials(wallet: PublicKey): Promise<Credential[]> {
    const heliusRpc = process.env.NEXT_PUBLIC_HELIUS_RPC_URL;
    if (!heliusRpc) {
      // No Helius configured — return empty
      return [];
    }

    try {
      const response = await fetch(heliusRpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'soldojo-credentials',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: wallet.toBase58(),
            page: 1,
            limit: 50,
            displayOptions: { showCollectionMetadata: true },
          },
        }),
      });

      const json = await response.json();
      const items = json?.result?.items;
      if (!Array.isArray(items)) return [];

      // Filter for SolDojo credential cNFTs by checking metadata
      return items
        .filter((item: Record<string, unknown>) => {
          const content = item.content as Record<string, unknown> | undefined;
          const metadata = content?.metadata as Record<string, unknown> | undefined;
          const name = metadata?.name as string | undefined;
          // Match SolDojo credentials by name pattern or collection
          return name && (
            name.includes('SolDojo') ||
            name.includes('Superteam Academy') ||
            name.includes('Solana Developer')
          );
        })
        .map((item: Record<string, unknown>) => {
          const content = item.content as Record<string, unknown>;
          const metadata = content?.metadata as Record<string, unknown>;
          const links = content?.links as Record<string, unknown> | undefined;
          const jsonUri = content?.json_uri as string | undefined;
          const attrs = (metadata?.attributes ?? []) as { trait_type: string; value: string | number }[];

          const attrMap: Record<string, string | number> = {};
          for (const a of attrs) {
            attrMap[a.trait_type] = a.value;
          }

          return {
            mintAddress: item.id as string,
            name: (metadata?.name as string) || 'SolDojo Credential',
            description: (metadata?.description as string) || '',
            image: (links?.image as string) || (metadata?.image as string) || jsonUri || '',
            track: (attrMap['Track'] as string) || 'General',
            level: Number(attrMap['Level']) || 1,
            issuedAt: (attrMap['Issued'] as string) || new Date().toISOString(),
            attributes: attrMap,
          };
        });
    } catch (err) {
      console.error('Failed to fetch credentials from Helius:', err);
      return [];
    }
  }
}

export const learningService = new StubLearningProgressService();
