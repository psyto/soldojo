import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { apiSuccess, withErrorHandler } from '@/lib/api/utils';
import type { CourseCard } from '@/types';

export const GET = withErrorHandler(async (req) => {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const difficulty = searchParams.get('difficulty') || 'all';

  const where: Record<string, unknown> = { isPublished: true };

  if (difficulty !== 'all') {
    where.difficulty = difficulty;
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { tags: { hasSome: [search.toLowerCase()] } },
    ];
  }

  const courses = await prisma.course.findMany({
    where,
    orderBy: { sortOrder: 'asc' },
    include: {
      modules: {
        include: { lessons: { select: { id: true } } },
      },
      _count: { select: { enrollments: true } },
    },
  });

  // Optionally add user progress
  const user = await getCurrentUser().catch(() => null);
  let enrollments: Record<string, number> = {};

  if (user?.id) {
    const userEnrollments = await prisma.enrollment.findMany({
      where: { userId: user.id },
      select: { courseId: true, progress: true },
    });
    enrollments = Object.fromEntries(
      userEnrollments.map((e) => [e.courseId, e.progress])
    );
  }

  const result: CourseCard[] = courses.map((course) => ({
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    thumbnail: course.thumbnail,
    difficulty: course.difficulty,
    duration: course.duration,
    xpReward: course.xpReward,
    track: course.track,
    tags: course.tags,
    instructorName: course.instructorName,
    instructorImage: course.instructorImage,
    totalLessons: course.modules.reduce((sum, m) => sum + m.lessons.length, 0),
    enrolledCount: course._count.enrollments,
    userProgress: enrollments[course.id],
  }));

  return apiSuccess(result);
});
