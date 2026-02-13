import { prisma } from '@/lib/db';
import { requireAuth, apiSuccess, apiError, withErrorHandler } from '@/lib/api/utils';

export const GET = withErrorHandler(async () => {
  const user = await requireAuth();

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      displayName: true,
      name: true,
      bio: true,
      walletAddress: true,
      totalXP: true,
      currentStreak: true,
      longestStreak: true,
      createdAt: true,
      locale: true,
      theme: true,
      isPublic: true,
      image: true,
      email: true,
    },
  });

  if (!dbUser) {
    return apiError('User not found', 404);
  }

  // Completed courses
  const completedEnrollments = await prisma.enrollment.findMany({
    where: { userId: user.id, status: 'COMPLETED' },
    include: {
      course: { select: { slug: true, title: true } },
    },
    orderBy: { completedAt: 'desc' },
  });

  const completedCourses = completedEnrollments.map((e) => ({
    slug: e.course.slug,
    title: e.course.title,
    completedAt: e.completedAt?.toISOString() || e.startedAt.toISOString(),
  }));

  return apiSuccess({
    displayName: dbUser.displayName || dbUser.name || 'Anonymous',
    bio: dbUser.bio,
    walletAddress: dbUser.walletAddress,
    totalXP: dbUser.totalXP,
    currentStreak: dbUser.currentStreak,
    longestStreak: dbUser.longestStreak,
    joinDate: dbUser.createdAt.toISOString(),
    completedCourses,
    locale: dbUser.locale,
    theme: dbUser.theme,
    isPublic: dbUser.isPublic,
    image: dbUser.image,
    email: dbUser.email,
  });
});

export const PATCH = withErrorHandler(async (req) => {
  const user = await requireAuth();
  const body = await req.json();

  const allowedFields = ['name', 'displayName', 'bio', 'theme', 'locale', 'isPublic'] as const;
  const data: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      data[field] = body[field];
    }
  }

  if (Object.keys(data).length === 0) {
    return apiError('No valid fields to update', 400);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: {
      displayName: true,
      name: true,
      bio: true,
      theme: true,
      locale: true,
      isPublic: true,
    },
  });

  return apiSuccess(updated);
});
