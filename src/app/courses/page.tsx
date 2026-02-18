'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/contexts/locale-context';
import { Search, Clock, Zap, Users, BookOpen, Loader2 } from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';
import { useCourses } from '@/hooks';

const DIFFICULTY_COLORS = {
  BEGINNER: 'bg-green-500/10 text-green-400 border-green-500/20',
  INTERMEDIATE: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  ADVANCED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function CourseCatalogPage() {
  const { t } = useLocale();
  const [search, setSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');

  const { data: courses, isLoading, error } = useCourses(search, difficultyFilter);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t('courses.catalog.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('courses.catalog.subtitle')}</p>
      </div>

      {/* Filters */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('courses.catalog.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((level) => (
            <button
              key={level}
              onClick={() => setDifficultyFilter(level)}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                difficultyFilter === level
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              )}
            >
              {level === 'all'
                ? t('common.all')
                : t(`courses.difficulty.${level.toLowerCase()}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="py-20 text-center">
          <p className="text-destructive">{t('errors.loadCourses')}</p>
        </div>
      )}

      {/* Course Grid */}
      {courses && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/courses/${course.slug}`}
              className="group rounded-2xl border border-border bg-card transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
            >
              {/* Thumbnail placeholder */}
              <div className="flex h-40 items-center justify-center rounded-t-2xl bg-solana-gradient-subtle">
                <BookOpen className="h-12 w-12 text-muted-foreground/30" />
              </div>

              <div className="p-5">
                {/* Difficulty badge */}
                <span
                  className={cn(
                    'inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium',
                    DIFFICULTY_COLORS[course.difficulty]
                  )}
                >
                  {t(`courses.difficulty.${course.difficulty.toLowerCase()}`)}
                </span>

                <h3 className="mt-3 text-lg font-semibold group-hover:text-primary transition-colors">
                  {course.title}
                </h3>
                <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                  {course.description}
                </p>

                {/* Meta */}
                <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuration(course.duration)}
                  </span>
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5" />
                    {course.totalLessons} {t('courses.detail.lessons').toLowerCase()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" />
                    {course.xpReward} XP
                  </span>
                </div>

                {/* Enrolled count */}
                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {course.enrolledCount.toLocaleString()} {t('courses.detail.students').toLowerCase()}
                </div>

                {/* Progress bar (if enrolled) */}
                {course.userProgress !== undefined && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t('courses.progress.inProgress')}</span>
                      <span className="font-medium">{course.userProgress}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="xp-bar h-full rounded-full"
                        style={{ width: `${course.userProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {courses && courses.length === 0 && (
        <div className="py-20 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-muted-foreground">{t('courses.catalog.noResults')}</p>
        </div>
      )}
    </div>
  );
}
