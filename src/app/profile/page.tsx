'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useLocale } from '@/contexts/locale-context';
import { calculateLevel, formatXP, xpProgressInLevel, shortenAddress } from '@/lib/utils';
import {
  Zap,
  Flame,
  Trophy,
  Star,
  Calendar,
  Settings,
  ExternalLink,
  Award,
  BookOpen,
  Loader2,
} from 'lucide-react';
import { useProfile } from '@/hooks';

export default function ProfilePage() {
  const { data: session } = useSession();
  const { t, formatT } = useLocale();
  const { data: profile, isLoading, error } = useProfile();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="py-20 text-center">
        <p className="text-destructive">Failed to load profile. Please sign in and try again.</p>
      </div>
    );
  }

  const level = calculateLevel(profile.totalXP);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Profile header */}
      <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-solana-gradient text-3xl font-bold text-white">
          {(session?.user?.name || profile.displayName)[0]}
        </div>
        <div className="mt-4 sm:ml-6 sm:mt-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{session?.user?.name || profile.displayName}</h1>
            <Link
              href="/settings"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
          {profile.bio && (
            <p className="mt-1 text-sm text-muted-foreground">{profile.bio}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {profile.walletAddress && (
              <span className="flex items-center gap-1 font-mono text-xs">
                {shortenAddress(profile.walletAddress, 6)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatT('profile.memberSince', {
                date: new Date(profile.joinDate).toLocaleDateString(),
              })}
            </span>
          </div>
          {/* XP + Level */}
          <div className="mt-3 flex items-center gap-4">
            <span className="flex items-center gap-1 text-sm font-semibold text-solana-gradient">
              <Zap className="h-4 w-4" />
              {formatXP(profile.totalXP)} XP
            </span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Star className="h-3.5 w-3.5" />
              Level {level}
            </span>
            <span className="flex items-center gap-1 text-sm text-orange-400">
              <Flame className="h-3.5 w-3.5" />
              {profile.currentStreak}d streak
            </span>
          </div>
        </div>
      </div>

      {/* Completed courses */}
      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">{t('profile.completedCourses')}</h2>
        {profile.completedCourses.length > 0 ? (
          <div className="space-y-3">
            {profile.completedCourses.map((course) => (
              <Link
                key={course.slug}
                href={`/courses/${course.slug}`}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50"
              >
                <div className="flex items-center gap-3">
                  <BookOpen className="h-5 w-5 text-accent" />
                  <div>
                    <h3 className="text-sm font-semibold">{course.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      Completed {new Date(course.completedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Trophy className="h-4 w-4 text-yellow-400" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No courses completed yet. Keep learning!</p>
        )}
      </div>
    </div>
  );
}
