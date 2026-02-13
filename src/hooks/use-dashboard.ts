import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

export interface DashboardData {
  totalXP: number;
  currentStreak: number;
  longestStreak: number;
  coursesCompleted: number;
  rank: number;
  currentCourses: {
    slug: string;
    title: string;
    progress: number;
    nextLesson: string;
  }[];
  streakDays: string[];
  recentActivity: {
    type: string;
    title: string;
    course?: string;
    xp: number;
    time: string;
  }[];
}

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch<DashboardData>('/api/user/dashboard'),
  });
}
