'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from '@/contexts/locale-context';
import {
  Clock,
  Zap,
  Users,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Code2,
  FileText,
  Play,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import { cn, formatDuration } from '@/lib/utils';
import { useCourse, useEnroll } from '@/hooks';
import { useSession } from 'next-auth/react';

const LESSON_TYPE_ICONS = {
  CONTENT: FileText,
  CHALLENGE: Code2,
  VIDEO: Play,
};

const DIFFICULTY_COLORS = {
  BEGINNER: 'bg-green-500/10 text-green-400 border-green-500/20',
  INTERMEDIATE: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  ADVANCED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function CourseDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { t } = useLocale();
  const { data: session } = useSession();
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const { data: course, isLoading, error } = useCourse(slug);
  const enrollMutation = useEnroll(slug);

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="py-20 text-center">
        <p className="text-destructive">Failed to load course. Please try again.</p>
      </div>
    );
  }

  const totalLessons = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
  const completedLessons = course.modules.reduce(
    (sum, m) => sum + m.lessons.filter((l) => l.isCompleted).length,
    0
  );
  const isEnrolled = course.enrollment !== null;

  // Expand first module by default
  if (expandedModules.size === 0 && course.modules.length > 0) {
    expandedModules.add(course.modules[0].id);
  }

  const handleEnroll = () => {
    if (!session?.user) return;
    enrollMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="lg:grid lg:grid-cols-3 lg:gap-12">
        {/* Main content */}
        <div className="lg:col-span-2">
          {/* Course header */}
          <div>
            <span
              className={cn(
                'inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium',
                DIFFICULTY_COLORS[course.difficulty]
              )}
            >
              {t(`courses.difficulty.${course.difficulty.toLowerCase()}`)}
            </span>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{course.title}</h1>
            <p className="mt-4 text-lg text-muted-foreground">{course.description}</p>

            <div className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {formatDuration(course.duration)}
              </span>
              <span className="flex items-center gap-1.5">
                <BookOpen className="h-4 w-4" />
                {totalLessons} {t('courses.detail.lessons').toLowerCase()}
              </span>
              <span className="flex items-center gap-1.5">
                <Zap className="h-4 w-4" />
                {course.xpReward} XP
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {course.enrolledCount.toLocaleString()} {t('courses.detail.students').toLowerCase()}
              </span>
            </div>
          </div>

          {/* Syllabus */}
          <div className="mt-10">
            <h2 className="text-xl font-semibold">{t('courses.detail.syllabus')}</h2>
            <div className="mt-4 space-y-3">
              {course.modules.map((module, moduleIdx) => (
                <div key={module.id} className="rounded-xl border border-border bg-card">
                  <button
                    onClick={() => toggleModule(module.id)}
                    className="flex w-full items-center justify-between p-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-xs font-medium">
                        {moduleIdx + 1}
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold">{module.title}</h3>
                        <p className="text-xs text-muted-foreground">
                          {module.lessons.length} {t('courses.detail.lessons').toLowerCase()}
                        </p>
                      </div>
                    </div>
                    {expandedModules.has(module.id) ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>

                  {expandedModules.has(module.id) && (
                    <div className="border-t border-border">
                      {module.lessons.map((lesson) => {
                        const Icon = LESSON_TYPE_ICONS[lesson.type];
                        return (
                          <Link
                            key={lesson.id}
                            href={`/courses/${course.slug}/lessons/${lesson.id}`}
                            className="flex items-center justify-between border-b border-border/50 px-4 py-3 last:border-b-0 hover:bg-secondary/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              {lesson.isCompleted ? (
                                <CheckCircle2 className="h-4 w-4 text-accent" />
                              ) : (
                                <Icon className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className={cn('text-sm', lesson.isCompleted && 'text-muted-foreground line-through')}>
                                {lesson.title}
                              </span>
                              {lesson.type === 'CHALLENGE' && (
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                  {t('lesson.challenge.title')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{formatDuration(lesson.duration)}</span>
                              <span className="flex items-center gap-0.5">
                                <Zap className="h-3 w-3" />
                                {lesson.xpReward}
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Reviews */}
          <div className="mt-10">
            <h2 className="text-xl font-semibold">{t('courses.detail.reviews') || 'Reviews'}</h2>
            <div className="mt-4 rounded-xl border border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Community reviews coming soon. Complete the course and be the first to share your experience!
              </p>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="mt-8 lg:mt-0">
          <div className="sticky top-24 rounded-2xl border border-border bg-card p-6">
            {/* Progress (if enrolled) */}
            {isEnrolled && (
              <div className="mb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('courses.progress.inProgress')}</span>
                  <span className="font-medium">
                    {Math.round((completedLessons / totalLessons) * 100)}%
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="xp-bar h-full rounded-full"
                    style={{ width: `${(completedLessons / totalLessons) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {completedLessons} / {totalLessons} lessons
                </p>
              </div>
            )}

            {/* Enroll CTA */}
            <button
              onClick={handleEnroll}
              disabled={isEnrolled || enrollMutation.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-solana-gradient px-6 py-3 text-base font-semibold text-white transition-all hover:opacity-90 disabled:opacity-70"
            >
              {enrollMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isEnrolled ? (
                t('courses.detail.enrolled')
              ) : (
                t('courses.detail.enroll')
              )}
              {!enrollMutation.isPending && <ArrowRight className="h-4 w-4" />}
            </button>

            {/* Course info */}
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('courses.detail.duration')}</span>
                <span className="font-medium">{formatDuration(course.duration)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('courses.detail.modules')}</span>
                <span className="font-medium">{course.modules.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('courses.detail.lessons')}</span>
                <span className="font-medium">{totalLessons}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('courses.detail.xpReward')}</span>
                <span className="flex items-center gap-1 font-medium text-accent">
                  <Zap className="h-3.5 w-3.5" />
                  {course.xpReward} XP
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
