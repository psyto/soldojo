import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { CourseCard } from '@/types';

export function useCourses(search?: string, difficulty?: string) {
  return useQuery<CourseCard[]>({
    queryKey: ['courses', search, difficulty],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (difficulty && difficulty !== 'all') params.set('difficulty', difficulty);
      const qs = params.toString();
      return apiFetch<CourseCard[]>(`/api/courses${qs ? `?${qs}` : ''}`);
    },
  });
}
