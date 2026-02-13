import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { apiSuccess, apiError, withErrorHandler } from '@/lib/api/utils';

export const GET = withErrorHandler(async (_req, ctx) => {
  const { slug } = await ctx.params;

  const course = await prisma.course.findUnique({
    where: { slug },
    include: {
      modules: {
        orderBy: { sortOrder: 'asc' },
        include: {
          lessons: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              title: true,
              slug: true,
              type: true,
              duration: true,
              xpReward: true,
            },
          },
        },
      },
      _count: { select: { enrollments: true } },
    },
  });

  if (!course) {
    return apiError('Course not found', 404);
  }

  // Check user enrollment and lesson completion
  const user = await getCurrentUser().catch(() => null);
  let enrollment: { progress: number; completedLessonIds: string[] } | null = null;

  if (user?.id) {
    const userEnrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: course.id } },
      include: {
        lessonProgress: {
          where: { isCompleted: true },
          select: { lessonId: true },
        },
      },
    });

    if (userEnrollment) {
      enrollment = {
        progress: userEnrollment.progress,
        completedLessonIds: userEnrollment.lessonProgress.map((lp) => lp.lessonId),
      };
    }
  }

  const modules = course.modules.map((m) => ({
    id: m.id,
    title: m.title,
    sortOrder: m.sortOrder,
    lessons: m.lessons.map((l) => ({
      ...l,
      isCompleted: enrollment?.completedLessonIds.includes(l.id) ?? false,
    })),
  }));

  return apiSuccess({
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    difficulty: course.difficulty,
    duration: course.duration,
    xpReward: course.xpReward,
    instructorName: course.instructorName,
    instructorImage: course.instructorImage,
    enrolledCount: course._count.enrollments,
    modules,
    enrollment: enrollment ? { progress: enrollment.progress } : null,
  });
});
