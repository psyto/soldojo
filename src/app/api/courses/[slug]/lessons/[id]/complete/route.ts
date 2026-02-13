import { prisma } from '@/lib/db';
import { requireAuth, apiSuccess, apiError, withErrorHandler } from '@/lib/api/utils';
import { learningService } from '@/lib/services/learning-progress';

export const POST = withErrorHandler(async (_req, ctx) => {
  const user = await requireAuth();
  const { slug, id } = await ctx.params;

  const course = await prisma.course.findUnique({
    where: { slug },
    include: {
      modules: {
        orderBy: { sortOrder: 'asc' },
        include: {
          lessons: { orderBy: { sortOrder: 'asc' }, select: { id: true } },
        },
      },
    },
  });

  if (!course) {
    return apiError('Course not found', 404);
  }

  const allLessons = course.modules.flatMap((m) => m.lessons);
  const lessonIndex = allLessons.findIndex((l) => l.id === id);

  if (lessonIndex === -1) {
    return apiError('Lesson not found', 404);
  }

  // Ensure user is enrolled
  let enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId: course.id } },
  });

  if (!enrollment) {
    enrollment = await prisma.enrollment.create({
      data: { userId: user.id, courseId: course.id },
    });
  }

  await learningService.completeLesson(user.id, course.id, lessonIndex);

  const xp = await learningService.getXP(user.id);

  return apiSuccess({ completed: true, totalXP: xp });
});
