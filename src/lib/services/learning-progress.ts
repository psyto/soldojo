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

    // Award XP
    await prisma.xPEvent.create({
      data: {
        userId,
        amount: lesson.xpReward,
        reason: lesson.type === 'CHALLENGE' ? 'CHALLENGE_COMPLETE' : 'LESSON_COMPLETE',
        sourceId: lesson.id,
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { totalXP: { increment: lesson.xpReward } },
    });

    // Update streak
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
      await prisma.user.update({
        where: { id: userId },
        data: {
          currentStreak: newStreak,
          longestStreak: Math.max(newStreak, user.longestStreak),
          lastActiveAt: new Date(),
        },
      });
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
    if (progress >= 100) {
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

  async getCredentials(_wallet: PublicKey): Promise<Credential[]> {
    // TODO: Implement using Helius DAS API to read cNFTs
    // For now return empty — this will be connected to on-chain later
    return [];
  }
}

export const learningService = new StubLearningProgressService();
