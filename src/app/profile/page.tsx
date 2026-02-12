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
  Shield,
  Code2,
  BookOpen,
  Users,
  Terminal,
  Cpu,
} from 'lucide-react';

const MOCK_PROFILE = {
  displayName: 'CryptoNinja',
  bio: 'Solana builder focused on DeFi and security. Building the future of finance.',
  walletAddress: 'Gh7mKxR3pQ2vN8tY6wJ4bF9eC1dA5hL7xK2nM8rT3qW',
  totalXP: 2450,
  currentStreak: 7,
  longestStreak: 14,
  joinDate: '2025-11-01',
  completedCourses: [
    { slug: 'solana-101', title: 'Solana 101: Blockchain Fundamentals', completedAt: '2025-12-15' },
    { slug: 'rust-for-solana', title: 'Rust for Solana Developers', completedAt: '2026-01-20' },
  ],
  skills: [
    { name: 'Rust', value: 65 },
    { name: 'Anchor', value: 45 },
    { name: 'Frontend', value: 70 },
    { name: 'Security', value: 30 },
    { name: 'Testing', value: 50 },
    { name: 'DeFi', value: 25 },
  ],
  achievements: [
    { name: 'First Steps', icon: '🎯', description: 'Complete your first lesson' },
    { name: 'Week Warrior', icon: '🔥', description: '7-day streak' },
    { name: 'Rust Rookie', icon: '🦀', description: 'Complete Rust fundamentals' },
    { name: 'Course Completer', icon: '🎓', description: 'Complete your first course' },
    { name: 'Early Adopter', icon: '🌟', description: 'Join SolDojo early' },
  ],
  credentials: [] as { name: string; track: string; level: number; mintAddress: string }[],
};

const SKILL_ICONS: Record<string, typeof Code2> = {
  Rust: Terminal,
  Anchor: Shield,
  Frontend: Code2,
  Security: Shield,
  Testing: Cpu,
  DeFi: Zap,
};

export default function ProfilePage() {
  const { data: session } = useSession();
  const { t, formatT } = useLocale();

  const profile = MOCK_PROFILE;
  const level = calculateLevel(profile.totalXP);
  const progress = xpProgressInLevel(profile.totalXP);

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

      {/* Skills radar (simplified as bars) */}
      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">{t('profile.skills')}</h2>
        <div className="grid gap-3 rounded-xl border border-border bg-card p-6 sm:grid-cols-2">
          {profile.skills.map((skill) => {
            const Icon = SKILL_ICONS[skill.name] || Code2;
            return (
              <div key={skill.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {skill.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{skill.value}%</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="xp-bar h-full rounded-full"
                    style={{ width: `${skill.value}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Achievements */}
      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">{t('profile.achievements')}</h2>
        {profile.achievements.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {profile.achievements.map((achievement, i) => (
              <div
                key={i}
                className="flex flex-col items-center rounded-xl border border-border bg-card p-4 text-center"
              >
                <span className="text-2xl">{achievement.icon}</span>
                <span className="mt-2 text-xs font-semibold">{achievement.name}</span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  {achievement.description}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('profile.noAchievements')}</p>
        )}
      </div>

      {/* Credentials */}
      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">{t('profile.credentials')}</h2>
        {profile.credentials.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {profile.credentials.map((cred, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-solana-gradient">
                    <Award className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{cred.name}</h3>
                    <p className="text-xs text-muted-foreground">{cred.track} - Level {cred.level}</p>
                  </div>
                </div>
                <a
                  href={`https://explorer.solana.com/address/${cred.mintAddress}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t('certificates.verifyOnChain')}
                </a>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('profile.noCredentials')}</p>
        )}
      </div>

      {/* Completed courses */}
      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">{t('profile.completedCourses')}</h2>
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
      </div>
    </div>
  );
}
