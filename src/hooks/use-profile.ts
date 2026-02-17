import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { Achievement } from '@/types';

export interface ProfileData {
  displayName: string;
  bio: string | null;
  walletAddress: string | null;
  totalXP: number;
  currentStreak: number;
  longestStreak: number;
  joinDate: string;
  completedCourses: {
    slug: string;
    title: string;
    completedAt: string;
  }[];
  locale: string;
  theme: string;
  isPublic: boolean;
  image: string | null;
  email: string | null;
  achievements?: Achievement[];
  skills?: Record<string, number>;
}

export function useProfile() {
  return useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/api/user/profile'),
  });
}
