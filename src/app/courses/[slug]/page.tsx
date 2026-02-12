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
} from 'lucide-react';
import { useState } from 'react';
import { cn, formatDuration } from '@/lib/utils';

// Mock course detail — will come from CMS/API
const MOCK_COURSE = {
  id: '3',
  slug: 'anchor-framework',
  title: 'Building with Anchor Framework',
  description:
    'Build production-ready Solana programs using the Anchor framework. Learn macros, account validation, Cross-Program Invocations (CPIs), and comprehensive testing strategies.',
  difficulty: 'INTERMEDIATE' as const,
  duration: 480,
  xpReward: 1500,
  instructorName: 'Superteam Brazil',
  instructorImage: null,
  enrolledCount: 654,
  prerequisites: ['Rust basics', 'Solana account model understanding'],
  learningOutcomes: [
    'Write Solana programs using Anchor macros',
    'Validate accounts with constraints and custom checks',
    'Implement Cross-Program Invocations (CPIs)',
    'Write comprehensive tests with TypeScript',
    'Deploy programs to Devnet and Mainnet',
    'Handle errors and logging properly',
  ],
  modules: [
    {
      id: 'm1',
      title: 'Getting Started with Anchor',
      lessons: [
        { id: 'l1', title: 'What is Anchor?', slug: 'what-is-anchor', type: 'CONTENT' as const, duration: 15, xpReward: 25, isCompleted: false },
        { id: 'l2', title: 'Project Setup & Architecture', slug: 'project-setup', type: 'CONTENT' as const, duration: 20, xpReward: 25, isCompleted: false },
        { id: 'l3', title: 'Your First Anchor Program', slug: 'first-program', type: 'CHALLENGE' as const, duration: 30, xpReward: 50, isCompleted: false },
      ],
    },
    {
      id: 'm2',
      title: 'Account Validation & Constraints',
      lessons: [
        { id: 'l4', title: 'The Accounts Macro', slug: 'accounts-macro', type: 'CONTENT' as const, duration: 20, xpReward: 25, isCompleted: false },
        { id: 'l5', title: 'Account Constraints Deep Dive', slug: 'constraints', type: 'CONTENT' as const, duration: 25, xpReward: 25, isCompleted: false },
        { id: 'l6', title: 'Custom Account Validation', slug: 'custom-validation', type: 'CHALLENGE' as const, duration: 35, xpReward: 75, isCompleted: false },
      ],
    },
    {
      id: 'm3',
      title: 'Cross-Program Invocations',
      lessons: [
        { id: 'l7', title: 'CPI Fundamentals', slug: 'cpi-fundamentals', type: 'CONTENT' as const, duration: 20, xpReward: 25, isCompleted: false },
        { id: 'l8', title: 'CPI with PDAs', slug: 'cpi-pdas', type: 'CONTENT' as const, duration: 25, xpReward: 25, isCompleted: false },
        { id: 'l9', title: 'Build a Token Vault', slug: 'token-vault', type: 'CHALLENGE' as const, duration: 45, xpReward: 100, isCompleted: false },
      ],
    },
    {
      id: 'm4',
      title: 'Testing & Deployment',
      lessons: [
        { id: 'l10', title: 'Testing with Bankrun', slug: 'testing-bankrun', type: 'CONTENT' as const, duration: 25, xpReward: 25, isCompleted: false },
        { id: 'l11', title: 'Integration Tests', slug: 'integration-tests', type: 'CHALLENGE' as const, duration: 40, xpReward: 75, isCompleted: false },
        { id: 'l12', title: 'Deploy to Devnet', slug: 'deploy-devnet', type: 'CONTENT' as const, duration: 20, xpReward: 50, isCompleted: false },
      ],
    },
  ],
};

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
  const { t } = useLocale();
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(['m1']));

  const course = MOCK_COURSE; // In production: fetch by params.slug
  const totalLessons = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
  const completedLessons = course.modules.reduce(
    (sum, m) => sum + m.lessons.filter((l) => l.isCompleted).length,
    0
  );

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
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

          {/* What you'll learn */}
          <div className="mt-10">
            <h2 className="text-xl font-semibold">{t('courses.detail.whatYouLearn')}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {course.learningOutcomes.map((outcome, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span className="text-sm text-muted-foreground">{outcome}</span>
                </div>
              ))}
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
        </div>

        {/* Sidebar */}
        <div className="mt-8 lg:mt-0">
          <div className="sticky top-24 rounded-2xl border border-border bg-card p-6">
            {/* Progress (if enrolled) */}
            {completedLessons > 0 && (
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
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-solana-gradient px-6 py-3 text-base font-semibold text-white transition-all hover:opacity-90">
              {completedLessons > 0 ? t('courses.detail.enrolled') : t('courses.detail.enroll')}
              <ArrowRight className="h-4 w-4" />
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

            {/* Prerequisites */}
            {course.prerequisites.length > 0 && (
              <div className="mt-6 border-t border-border pt-4">
                <h3 className="text-sm font-semibold">{t('courses.detail.prerequisites')}</h3>
                <ul className="mt-2 space-y-1">
                  {course.prerequisites.map((prereq, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="h-1 w-1 rounded-full bg-muted-foreground" />
                      {prereq}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
