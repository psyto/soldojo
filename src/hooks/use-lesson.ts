import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { TestCase } from '@/types';

export interface LessonDetail {
  id: string;
  title: string;
  type: 'CONTENT' | 'CHALLENGE' | 'VIDEO';
  content: string;
  xpReward: number;
  starterCode: string | null;
  solutionCode: string | null;
  testCases: TestCase[] | null;
  hints: string[];
  challengeLanguage: string | null;
  moduleTitle: string;
  courseSlug: string;
  courseTitle: string;
  lessonIndex: number;
  prevLesson: { id: string; title: string } | null;
  nextLesson: { id: string; title: string } | null;
  isCompleted: boolean;
}

export function useLesson(slug: string, id: string) {
  return useQuery<LessonDetail>({
    queryKey: ['lesson', slug, id],
    queryFn: () => apiFetch<LessonDetail>(`/api/courses/${slug}/lessons/${id}`),
    enabled: !!slug && !!id,
  });
}
