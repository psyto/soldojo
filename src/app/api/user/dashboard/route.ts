import { prisma } from '@/lib/db';
import { requireAuth, apiSuccess, withErrorHandler } from '@/lib/api/utils';
import { learningService } from '@/lib/services/learning-progress';

export const GET = withErrorHandler(async () => {
  const user = await requireAuth();

  const [xp, streak, dbUser] = await Promise.all([
    learningService.getXP(user.id),
    learningService.getStreak(user.id),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { totalXP: true },
    }),
  ]);

  // Current courses with progress
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: user.id, status: 'ACTIVE' },
    include: {
      course: {
        select: { slug: true, title: true },
        include: {
          modules: {
            orderBy: { sortOrder: 'asc' },
            include: {
              lessons: {
                orderBy: { sortOrder: 'asc' },
                select: { id: true, title: true },
              },
            },
          },
        },
      },
      lessonProgress: {
        where: { isCompleted: true },
        select: { lessonId: true },
      },
    },
  });

  const currentCourses = enrollments.map((e) => {
    const allLessons = e.course.modules.flatMap((m) => m.lessons);
    const completedIds = new Set(e.lessonProgress.map((lp) => lp.lessonId));
    const nextLesson = allLessons.find((l) => !completedIds.has(l.id));

    return {
      slug: e.course.slug,
      title: e.course.title,
      progress: e.progress,
      nextLesson: nextLesson?.title || 'All done!',
    };
  });

  // Completed courses count
  const coursesCompleted = await prisma.enrollment.count({
    where: { userId: user.id, status: 'COMPLETED' },
  });

  // Rank — count users with more XP
  const rank = await prisma.user.count({
    where: { totalXP: { gt: dbUser?.totalXP ?? 0 }, isPublic: true },
  }) + 1;

  // Recent activity (last 10 XP events)
  const xpEvents = await prisma.xPEvent.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  // Resolve source names for events
  const lessonIds = xpEvents
    .filter((e) => e.reason === 'LESSON_COMPLETE' || e.reason === 'CHALLENGE_COMPLETE')
    .map((e) => e.sourceId)
    .filter(Boolean) as string[];

  const lessons = await prisma.lesson.findMany({
    where: { id: { in: lessonIds } },
    select: { id: true, title: true, module: { select: { course: { select: { title: true } } } } },
  });
  const lessonMap = new Map(lessons.map((l) => [l.id, l]));

  const recentActivity = xpEvents.map((event) => {
    const lesson = event.sourceId ? lessonMap.get(event.sourceId) : null;
    const type =
      event.reason === 'CHALLENGE_COMPLETE' ? 'challenge' :
      event.reason === 'DAILY_STREAK' || event.reason === 'FIRST_OF_DAY' ? 'streak' :
      'lesson';

    const timeAgo = getTimeAgo(event.createdAt);

    return {
      type,
      title: lesson?.title || reasonLabel(event.reason),
      course: lesson?.module?.course?.title,
      xp: event.amount,
      time: timeAgo,
    };
  });

  return apiSuccess({
    totalXP: xp,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    coursesCompleted,
    rank,
    currentCourses,
    streakDays: streak.streakHistory,
    recentActivity,
  });
});

function reasonLabel(reason: string): string {
  switch (reason) {
    case 'COURSE_COMPLETE': return 'Course completed';
    case 'DAILY_STREAK': return 'Daily streak bonus';
    case 'FIRST_OF_DAY': return 'First lesson of the day';
    case 'ACHIEVEMENT': return 'Achievement unlocked';
    default: return 'Lesson completed';
  }
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
