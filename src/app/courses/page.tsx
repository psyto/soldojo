'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/contexts/locale-context';
import { Search, Clock, Zap, Users, BookOpen } from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';
import type { CourseCard } from '@/types';

// Mock courses for development — will be replaced by CMS/API
const MOCK_COURSES: CourseCard[] = [
  {
    id: '1',
    slug: 'solana-101',
    title: 'Solana 101: Blockchain Fundamentals',
    description: 'Learn the core concepts of Solana: accounts, transactions, programs, and the runtime model.',
    thumbnail: null,
    difficulty: 'BEGINNER',
    duration: 180,
    xpReward: 500,
    track: 'solana-fundamentals',
    tags: ['solana', 'blockchain', 'fundamentals'],
    instructorName: 'Superteam Brazil',
    instructorImage: null,
    totalLessons: 12,
    enrolledCount: 843,
  },
  {
    id: '2',
    slug: 'rust-for-solana',
    title: 'Rust for Solana Developers',
    description: 'Master the Rust programming language specifically tailored for Solana program development.',
    thumbnail: null,
    difficulty: 'BEGINNER',
    duration: 360,
    xpReward: 1000,
    track: 'solana-fundamentals',
    tags: ['rust', 'programming', 'fundamentals'],
    instructorName: 'Superteam Brazil',
    instructorImage: null,
    totalLessons: 20,
    enrolledCount: 1205,
  },
  {
    id: '3',
    slug: 'anchor-framework',
    title: 'Building with Anchor Framework',
    description: 'Build Solana programs using the Anchor framework. Macros, account validation, CPIs, and testing.',
    thumbnail: null,
    difficulty: 'INTERMEDIATE',
    duration: 480,
    xpReward: 1500,
    track: 'rust-anchor',
    tags: ['anchor', 'rust', 'smart-contracts'],
    instructorName: 'Superteam Brazil',
    instructorImage: null,
    totalLessons: 24,
    enrolledCount: 654,
  },
  {
    id: '4',
    slug: 'token-extensions',
    title: 'SPL Token & Token-2022 Extensions',
    description: 'Create tokens with advanced features: transfer hooks, confidential transfers, and more.',
    thumbnail: null,
    difficulty: 'INTERMEDIATE',
    duration: 300,
    xpReward: 1200,
    track: 'rust-anchor',
    tags: ['tokens', 'spl', 'token-2022'],
    instructorName: 'Superteam Brazil',
    instructorImage: null,
    totalLessons: 16,
    enrolledCount: 432,
  },
  {
    id: '5',
    slug: 'defi-amm',
    title: 'Build a DeFi AMM on Solana',
    description: 'Design and implement an automated market maker with constant product pricing and liquidity pools.',
    thumbnail: null,
    difficulty: 'ADVANCED',
    duration: 600,
    xpReward: 2000,
    track: 'defi-developer',
    tags: ['defi', 'amm', 'advanced'],
    instructorName: 'Superteam Brazil',
    instructorImage: null,
    totalLessons: 18,
    enrolledCount: 289,
  },
  {
    id: '6',
    slug: 'solana-security',
    title: 'Solana Security & Auditing',
    description: 'Learn common vulnerabilities, attack vectors, and security patterns for Solana programs.',
    thumbnail: null,
    difficulty: 'ADVANCED',
    duration: 420,
    xpReward: 1800,
    track: 'security',
    tags: ['security', 'audit', 'advanced'],
    instructorName: 'Superteam Brazil',
    instructorImage: null,
    totalLessons: 15,
    enrolledCount: 376,
  },
];

const DIFFICULTY_COLORS = {
  BEGINNER: 'bg-green-500/10 text-green-400 border-green-500/20',
  INTERMEDIATE: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  ADVANCED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function CourseCatalogPage() {
  const { t } = useLocale();
  const [search, setSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');

  const filteredCourses = MOCK_COURSES.filter((course) => {
    const matchesSearch =
      search === '' ||
      course.title.toLowerCase().includes(search.toLowerCase()) ||
      course.description.toLowerCase().includes(search.toLowerCase()) ||
      course.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));

    const matchesDifficulty =
      difficultyFilter === 'all' || course.difficulty === difficultyFilter;

    return matchesSearch && matchesDifficulty;
  });

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

      {/* Course Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filteredCourses.map((course) => (
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

      {filteredCourses.length === 0 && (
        <div className="py-20 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-muted-foreground">No courses found matching your filters.</p>
        </div>
      )}
    </div>
  );
}
