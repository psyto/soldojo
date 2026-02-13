import { prisma } from '@/lib/db';
import { apiSuccess, apiError, requireAuth, withErrorHandler } from '@/lib/api/utils';

export const POST = withErrorHandler(async (_req, ctx) => {
  const user = await requireAuth();
  const { slug } = await ctx.params;

  const course = await prisma.course.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!course) {
    return apiError('Course not found', 404);
  }

  const existing = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId: course.id } },
  });

  if (existing) {
    return apiSuccess({ enrolled: true, enrollmentId: existing.id });
  }

  const enrollment = await prisma.enrollment.create({
    data: {
      userId: user.id,
      courseId: course.id,
    },
  });

  return apiSuccess({ enrolled: true, enrollmentId: enrollment.id }, 201);
});
