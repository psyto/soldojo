'use client';

import { useState } from 'react';
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
  Award,
  BookOpen,
  Loader2,
  CheckCircle2,
  Lock,
  Code,
  Shield,
  Layers,
  Globe,
} from 'lucide-react';
import { useProfile } from '@/hooks';
import { useWallet } from '@solana/wallet-adapter-react';
import type { Achievement } from '@/types';

const SKILL_LABELS: Record<string, { label: string; icon: typeof Code }> = {
  'solana-fundamentals': { label: 'Fundamentals', icon: Globe },
  'rust-anchor': { label: 'Rust & Anchor', icon: Code },
  'defi-developer': { label: 'DeFi', icon: Layers },
  'security': { label: 'Security', icon: Shield },
  'frontend-web3': { label: 'Frontend', icon: Globe },
};

function SkillRadar({ skills }: { skills: Record<string, number> }) {
  const maxVal = Math.max(...Object.values(skills), 1);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Object.entries(SKILL_LABELS).map(([key, { label, icon: Icon }]) => {
        const val = skills[key] ?? 0;
        const pct = Math.min((val / Math.max(maxVal, 5)) * 100, 100);
        return (
          <div key={key} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="xp-bar h-full rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs font-medium">{val} lessons</p>
          </div>
        );
      })}
    </div>
  );
}

function AchievementBadge({ achievement }: { achievement: Achievement }) {
  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
        achievement.isUnlocked
          ? 'border-primary/30 bg-primary/5'
          : 'border-border bg-card opacity-50'
      }`}
      title={achievement.description}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full ${
          achievement.isUnlocked ? 'bg-solana-gradient text-white' : 'bg-secondary text-muted-foreground'
        }`}
      >
        {achievement.isUnlocked ? (
          <Award className="h-5 w-5" />
        ) : (
          <Lock className="h-4 w-4" />
        )}
      </div>
      <p className="text-[11px] font-medium leading-tight">{achievement.name}</p>
    </div>
  );
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const { t, formatT } = useLocale();
  const { data: profile, isLoading, error } = useProfile();
  const { publicKey } = useWallet();
  const [mintingSlug, setMintingSlug] = useState<string | null>(null);
  const [mintSuccess, setMintSuccess] = useState<string | null>(null);

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

  const handleMintCertificate = async (courseSlug: string) => {
    setMintingSlug(courseSlug);
    setMintSuccess(null);
    try {
      const res = await fetch('/api/certificates/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseSlug }),
      });
      const data = await res.json();
      if (res.ok) {
        setMintSuccess(courseSlug);
      } else {
        console.error('Mint failed:', data.error);
      }
    } catch {
      console.error('Mint request failed');
    } finally {
      setMintingSlug(null);
    }
  };

  const level = calculateLevel(profile.totalXP);
  const achievements: Achievement[] = profile.achievements ?? [];
  const unlockedCount = achievements.filter((a) => a.isUnlocked).length;
  const skills: Record<string, number> = profile.skills ?? {};

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

      {/* Skill Breakdown */}
      {Object.values(skills).some((v) => v > 0) && (
        <div className="mt-10">
          <h2 className="mb-4 text-lg font-semibold">{t('profile.skills') || 'Skills'}</h2>
          <SkillRadar skills={skills} />
        </div>
      )}

      {/* Achievements */}
      {achievements.length > 0 && (
        <div className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('profile.achievements') || 'Achievements'}</h2>
            <span className="text-sm text-muted-foreground">
              {unlockedCount}/{achievements.length} unlocked
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {achievements
              .sort((a, b) => (a.isUnlocked === b.isUnlocked ? a.id - b.id : a.isUnlocked ? -1 : 1))
              .map((achievement) => (
                <AchievementBadge key={achievement.id} achievement={achievement} />
              ))}
          </div>
        </div>
      )}

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
                <div className="flex items-center gap-2">
                  {publicKey && profile.walletAddress && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        handleMintCertificate(course.slug);
                      }}
                      disabled={mintingSlug === course.slug || mintSuccess === course.slug}
                      className="flex items-center gap-1 rounded-lg bg-solana-gradient px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {mintingSlug === course.slug ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : mintSuccess === course.slug ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Award className="h-3 w-3" />
                      )}
                      {mintSuccess === course.slug ? 'Minted' : 'Mint cNFT'}
                    </button>
                  )}
                  <Trophy className="h-4 w-4 text-yellow-400" />
                </div>
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
