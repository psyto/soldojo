'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useLocale } from '@/contexts/locale-context';
import { calculateLevel, xpProgressInLevel, formatXP } from '@/lib/utils';
import {
  Zap,
  Flame,
  Trophy,
  BookOpen,
  ArrowRight,
  Star,
  Calendar,
  TrendingUp,
} from 'lucide-react';

// Mock user data — will come from API/service
const MOCK_USER_STATS = {
  totalXP: 2450,
  currentStreak: 7,
  longestStreak: 14,
  coursesCompleted: 2,
  rank: 42,
  recentActivity: [
    { type: 'lesson', title: 'CPI Fundamentals', course: 'Anchor Framework', xp: 25, time: '2h ago' },
    { type: 'challenge', title: 'Custom Account Validation', course: 'Anchor Framework', xp: 75, time: '3h ago' },
    { type: 'streak', title: '7-day streak bonus', xp: 10, time: '3h ago' },
    { type: 'lesson', title: 'Account Constraints Deep Dive', course: 'Anchor Framework', xp: 25, time: '1d ago' },
  ],
  currentCourses: [
    { slug: 'anchor-framework', title: 'Building with Anchor Framework', progress: 42, nextLesson: 'CPI with PDAs' },
    { slug: 'token-extensions', title: 'SPL Token & Token-2022', progress: 15, nextLesson: 'Mint Authority' },
  ],
  streakDays: [
    '2026-02-06', '2026-02-07', '2026-02-08', '2026-02-09',
    '2026-02-10', '2026-02-11', '2026-02-12',
  ],
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const { t, formatT } = useLocale();

  const stats = MOCK_USER_STATS;
  const level = calculateLevel(stats.totalXP);
  const progress = xpProgressInLevel(stats.totalXP);

  const statCards = [
    {
      label: t('dashboard.stats.totalXP'),
      value: formatXP(stats.totalXP),
      icon: Zap,
      color: 'text-solana-green',
    },
    {
      label: t('dashboard.stats.level'),
      value: level.toString(),
      icon: Star,
      color: 'text-solana-purple',
    },
    {
      label: t('dashboard.stats.streak'),
      value: `${stats.currentStreak}`,
      icon: Flame,
      color: 'text-orange-400',
    },
    {
      label: t('dashboard.stats.coursesCompleted'),
      value: stats.coursesCompleted.toString(),
      icon: BookOpen,
      color: 'text-blue-400',
    },
    {
      label: t('dashboard.stats.rank'),
      value: `#${stats.rank}`,
      icon: Trophy,
      color: 'text-yellow-400',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">
          {formatT('dashboard.welcome', { name: session?.user?.name || 'Builder' })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {stats.currentStreak > 0
            ? formatT('dashboard.streakMessage.active', { days: stats.currentStreak.toString() })
            : t('dashboard.streakMessage.broken')}
        </p>
      </div>

      {/* Stats row */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((stat, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <div className="mt-2 text-2xl font-bold">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Level progress */}
      <div className="mb-8 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-muted-foreground">
              {formatT('gamification.level', { level: level.toString() })}
            </span>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {formatT('gamification.nextLevel', {
                xp: (progress.required - progress.current).toString(),
                level: (level + 1).toString(),
              })}
            </div>
          </div>
          <span className="text-2xl font-bold text-solana-gradient">
            {formatXP(stats.totalXP)} XP
          </span>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="xp-bar h-full rounded-full"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>Lvl {level}</span>
          <span>{Math.round(progress.percentage)}%</span>
          <span>Lvl {level + 1}</span>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Current courses */}
        <div className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">{t('dashboard.currentCourses')}</h2>
          <div className="space-y-4">
            {stats.currentCourses.map((course) => (
              <Link
                key={course.slug}
                href={`/courses/${course.slug}`}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/50"
              >
                <div className="flex-1">
                  <h3 className="font-semibold">{course.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Next: {course.nextLesson}
                  </p>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t('courses.progress.inProgress')}</span>
                      <span className="font-medium">{course.progress}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="xp-bar h-full rounded-full"
                        style={{ width: `${course.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
                <ArrowRight className="ml-4 h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>

          {/* Streak calendar */}
          <div className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Calendar className="h-5 w-5" />
              {t('gamification.streak.title')}
            </h2>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 28 }, (_, i) => {
                  const date = new Date();
                  date.setDate(date.getDate() - 27 + i);
                  const dateStr = date.toISOString().split('T')[0];
                  const isActive = stats.streakDays.includes(dateStr);
                  const isToday = i === 27;

                  return (
                    <div
                      key={i}
                      className={`flex h-8 w-full items-center justify-center rounded-md text-xs ${
                        isActive
                          ? 'bg-accent/20 text-accent font-medium'
                          : isToday
                            ? 'border border-border bg-secondary text-foreground'
                            : 'bg-secondary/30 text-muted-foreground/50'
                      }`}
                      title={dateStr}
                    >
                      {date.getDate()}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Activity feed */}
        <div>
          <h2 className="mb-4 text-lg font-semibold">{t('dashboard.recentActivity')}</h2>
          <div className="rounded-xl border border-border bg-card">
            {stats.recentActivity.map((activity, i) => (
              <div
                key={i}
                className="flex items-start gap-3 border-b border-border/50 p-4 last:border-b-0"
              >
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    activity.type === 'challenge'
                      ? 'bg-primary/10 text-primary'
                      : activity.type === 'streak'
                        ? 'bg-orange-500/10 text-orange-400'
                        : 'bg-accent/10 text-accent'
                  }`}
                >
                  {activity.type === 'challenge' ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : activity.type === 'streak' ? (
                    <Flame className="h-4 w-4" />
                  ) : (
                    <BookOpen className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{activity.title}</p>
                  {'course' in activity && activity.course && (
                    <p className="text-xs text-muted-foreground">{activity.course}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-medium text-accent">+{activity.xp} XP</span>
                  <p className="text-[10px] text-muted-foreground">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
