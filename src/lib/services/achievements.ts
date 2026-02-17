import { prisma } from '@/lib/db';
import type { Achievement } from '@/types';

// ==========================================
// Achievement Definitions (256-bit bitmap)
// ==========================================

export interface AchievementDef {
  id: number; // 0-255 bitmap index
  key: string;
  name: string;
  description: string;
  icon: string;
  category: Achievement['category'];
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Progress (0-19)
  { id: 0, key: 'first_steps', name: 'First Steps', description: 'Complete your first lesson', icon: 'footprints', category: 'progress' },
  { id: 1, key: 'course_completer', name: 'Course Completer', description: 'Complete your first course', icon: 'graduation-cap', category: 'progress' },
  { id: 2, key: 'speed_runner', name: 'Speed Runner', description: 'Complete a course in under 7 days', icon: 'timer', category: 'progress' },
  { id: 3, key: 'five_courses', name: 'Scholar', description: 'Complete 5 courses', icon: 'library', category: 'progress' },
  { id: 4, key: 'ten_lessons', name: 'Dedicated Learner', description: 'Complete 10 lessons', icon: 'book-open', category: 'progress' },
  { id: 5, key: 'fifty_lessons', name: 'Knowledge Seeker', description: 'Complete 50 lessons', icon: 'brain', category: 'progress' },

  // Streaks (20-39)
  { id: 20, key: 'week_warrior', name: 'Week Warrior', description: 'Maintain a 7-day streak', icon: 'flame', category: 'streak' },
  { id: 21, key: 'monthly_master', name: 'Monthly Master', description: 'Maintain a 30-day streak', icon: 'fire-extinguisher', category: 'streak' },
  { id: 22, key: 'consistency_king', name: 'Consistency King', description: 'Maintain a 100-day streak', icon: 'crown', category: 'streak' },

  // Skills (40-59)
  { id: 40, key: 'rust_rookie', name: 'Rust Rookie', description: 'Complete your first Rust challenge', icon: 'code', category: 'skill' },
  { id: 41, key: 'anchor_expert', name: 'Anchor Expert', description: 'Complete all Anchor track courses', icon: 'anchor', category: 'skill' },
  { id: 42, key: 'full_stack_solana', name: 'Full Stack Solana', description: 'Complete courses in 3+ tracks', icon: 'layers', category: 'skill' },

  // Community (60-79)
  { id: 60, key: 'first_enrollment', name: 'Eager Learner', description: 'Enroll in your first course', icon: 'user-plus', category: 'community' },

  // Special (80-99)
  { id: 80, key: 'early_adopter', name: 'Early Adopter', description: 'Join SolDojo in the first month', icon: 'sparkles', category: 'special' },
  { id: 81, key: 'bug_hunter', name: 'Bug Hunter', description: 'Report a valid bug', icon: 'bug', category: 'special' },
  { id: 82, key: 'perfect_score', name: 'Perfect Score', description: 'Pass all challenges in a course on first try', icon: 'target', category: 'special' },
  { id: 83, key: 'xp_1000', name: 'Rising Star', description: 'Earn 1,000 XP', icon: 'star', category: 'special' },
  { id: 84, key: 'xp_5000', name: 'Power Learner', description: 'Earn 5,000 XP', icon: 'zap', category: 'special' },
  { id: 85, key: 'xp_10000', name: 'Solana Master', description: 'Earn 10,000 XP', icon: 'trophy', category: 'special' },
];

// ==========================================
// Bitmap Helpers
// ==========================================

/** Parse hex bitmap string into a Set of unlocked achievement IDs */
export function parseBitmap(hex: string): Set<number> {
  const unlocked = new Set<number>();
  // Convert hex to binary
  const cleaned = hex.replace(/^0x/i, '') || '0';
  const bigint = BigInt(`0x${cleaned}`);
  for (let i = 0; i < 256; i++) {
    if ((bigint >> BigInt(i)) & 1n) {
      unlocked.add(i);
    }
  }
  return unlocked;
}

/** Convert a Set of achievement IDs to hex bitmap string */
export function toBitmap(ids: Set<number>): string {
  let bigint = 0n;
  for (const id of ids) {
    bigint |= 1n << BigInt(id);
  }
  return bigint.toString(16);
}

/** Check if a specific achievement is unlocked */
export function isUnlocked(hex: string, id: number): boolean {
  const cleaned = hex.replace(/^0x/i, '') || '0';
  const bigint = BigInt(`0x${cleaned}`);
  return Boolean((bigint >> BigInt(id)) & 1n);
}

// ==========================================
// Achievement Checker
// ==========================================

interface CheckContext {
  userId: string;
  totalXP: number;
  currentStreak: number;
  completedLessonsCount: number;
  completedCoursesCount: number;
  completedChallengesCount: number;
  completedTracks: string[];
  hasRustChallenge: boolean;
  currentBitmap: string;
}

async function buildContext(userId: string): Promise<CheckContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totalXP: true, currentStreak: true, achievements: true },
  });

  const completedLessonsCount = await prisma.lessonProgress.count({
    where: { enrollment: { userId }, isCompleted: true },
  });

  const completedEnrollments = await prisma.enrollment.findMany({
    where: { userId, status: 'COMPLETED' },
    include: { course: { select: { track: true } } },
  });
  const completedCoursesCount = completedEnrollments.length;
  const completedTracks = [...new Set(completedEnrollments.map((e) => e.course.track).filter(Boolean) as string[])];

  const completedChallengesCount = await prisma.lessonProgress.count({
    where: {
      enrollment: { userId },
      isCompleted: true,
      lesson: { type: 'CHALLENGE' },
    },
  });

  // Check if any completed challenge used Rust
  const rustChallenge = await prisma.lessonProgress.findFirst({
    where: {
      enrollment: { userId },
      isCompleted: true,
      lesson: { type: 'CHALLENGE', challengeLanguage: 'rust' },
    },
  });

  return {
    userId,
    totalXP: user?.totalXP ?? 0,
    currentStreak: user?.currentStreak ?? 0,
    completedLessonsCount,
    completedCoursesCount,
    completedChallengesCount,
    completedTracks,
    hasRustChallenge: !!rustChallenge,
    currentBitmap: user?.achievements ?? '0',
  };
}

/** Check and unlock any newly earned achievements. Returns newly unlocked IDs. */
export async function checkAndUnlockAchievements(userId: string): Promise<number[]> {
  const ctx = await buildContext(userId);
  const unlocked = parseBitmap(ctx.currentBitmap);
  const newlyUnlocked: number[] = [];

  const checks: [number, boolean][] = [
    // Progress
    [0, ctx.completedLessonsCount >= 1],     // first_steps
    [1, ctx.completedCoursesCount >= 1],     // course_completer
    [3, ctx.completedCoursesCount >= 5],     // five_courses
    [4, ctx.completedLessonsCount >= 10],    // ten_lessons
    [5, ctx.completedLessonsCount >= 50],    // fifty_lessons

    // Streaks
    [20, ctx.currentStreak >= 7],            // week_warrior
    [21, ctx.currentStreak >= 30],           // monthly_master
    [22, ctx.currentStreak >= 100],          // consistency_king

    // Skills
    [40, ctx.hasRustChallenge],                       // rust_rookie
    [42, ctx.completedTracks.length >= 3],            // full_stack_solana

    // Community
    [60, ctx.completedLessonsCount >= 1],    // first_enrollment (same as first lesson for now)

    // Special - XP milestones
    [83, ctx.totalXP >= 1000],               // xp_1000
    [84, ctx.totalXP >= 5000],               // xp_5000
    [85, ctx.totalXP >= 10000],              // xp_10000
  ];

  for (const [id, condition] of checks) {
    if (condition && !unlocked.has(id)) {
      unlocked.add(id);
      newlyUnlocked.push(id);
    }
  }

  if (newlyUnlocked.length > 0) {
    const newBitmap = toBitmap(unlocked);
    await prisma.user.update({
      where: { id: userId },
      data: { achievements: newBitmap },
    });

    // Award XP for each new achievement
    for (const id of newlyUnlocked) {
      await prisma.xPEvent.create({
        data: {
          userId,
          amount: 50,
          reason: 'ACHIEVEMENT',
          sourceId: String(id),
        },
      });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { totalXP: { increment: newlyUnlocked.length * 50 } },
    });
  }

  return newlyUnlocked;
}

/** Get all achievements with unlock status for a user */
export function getUserAchievements(bitmap: string): Achievement[] {
  const unlocked = parseBitmap(bitmap);
  return ACHIEVEMENTS.map((def) => ({
    ...def,
    isUnlocked: unlocked.has(def.id),
    unlockedAt: undefined, // Would need separate tracking for timestamps
  }));
}
