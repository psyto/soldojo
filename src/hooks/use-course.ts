import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { ModuleWithLessons } from '@/types';

export interface CourseDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  duration: number;
  xpReward: number;
  instructorName: string | null;
  instructorImage: string | null;
  enrolledCount: number;
  modules: ModuleWithLessons[];
  enrollment: { progress: number } | null;
}

export function useCourse(slug: string) {
  return useQuery<CourseDetail>({
    queryKey: ['course', slug],
    queryFn: () => apiFetch<CourseDetail>(`/api/courses/${slug}`),
    enabled: !!slug,
  });
}
