import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { apiSuccess, apiError, withErrorHandler } from '@/lib/api/utils';

export const GET = withErrorHandler(async (_req, ctx) => {
  const { slug, id } = await ctx.params;

  const course = await prisma.course.findUnique({
    where: { slug },
    include: {
      modules: {
        orderBy: { sortOrder: 'asc' },
        include: {
          lessons: {
            orderBy: { sortOrder: 'asc' },
            select: { id: true, title: true, slug: true },
          },
        },
      },
    },
  });

  if (!course) {
    return apiError('Course not found', 404);
  }

  // Flatten all lessons in order to find prev/next
  const allLessons = course.modules.flatMap((m) =>
    m.lessons.map((l) => ({ ...l, moduleTitle: m.title }))
  );
  const lessonIndex = allLessons.findIndex((l) => l.id === id);

  if (lessonIndex === -1) {
    return apiError('Lesson not found', 404);
  }

  // Fetch full lesson data
  const lesson = await prisma.lesson.findUnique({
    where: { id },
  });

  if (!lesson) {
    return apiError('Lesson not found', 404);
  }

  const prevLesson = lessonIndex > 0
    ? { id: allLessons[lessonIndex - 1].id, title: allLessons[lessonIndex - 1].title }
    : null;
  const nextLesson = lessonIndex < allLessons.length - 1
    ? { id: allLessons[lessonIndex + 1].id, title: allLessons[lessonIndex + 1].title }
    : null;

  // Check completion status
  const user = await getCurrentUser().catch(() => null);
  let isCompleted = false;

  if (user?.id) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: course.id } },
    });
    if (enrollment) {
      const progress = await prisma.lessonProgress.findUnique({
        where: {
          enrollmentId_lessonId: {
            enrollmentId: enrollment.id,
            lessonId: id,
          },
        },
      });
      isCompleted = progress?.isCompleted ?? false;
    }
  }

  return apiSuccess({
    id: lesson.id,
    title: lesson.title,
    type: lesson.type,
    content: lesson.content,
    xpReward: lesson.xpReward,
    starterCode: lesson.starterCode,
    solutionCode: lesson.solutionCode,
    testCases: lesson.testCases,
    hints: lesson.hints,
    challengeLanguage: lesson.challengeLanguage,
    moduleTitle: allLessons[lessonIndex].moduleTitle,
    courseSlug: course.slug,
    courseTitle: course.title,
    lessonIndex,
    prevLesson,
    nextLesson,
    isCompleted,
  });
});
