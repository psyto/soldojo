import { PublicKey } from '@solana/web3.js';

// ==========================================
// Service Interfaces (swap-ready for on-chain)
// ==========================================

export interface Progress {
  courseId: string;
  userId: string;
  completedLessons: number[];
  totalLessons: number;
  percentage: number;
  enrollmentStatus: 'active' | 'completed' | 'dropped';
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  streakHistory: string[]; // Array of ISO date strings
  isActiveToday: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  image: string | null;
  walletAddress: string | null;
  totalXP: number;
  level: number;
  currentStreak: number;
}

export interface Credential {
  mintAddress: string;
  name: string;
  description: string;
  image: string;
  track: string;
  level: number;
  issuedAt: string;
  attributes: Record<string, string | number>;
}

export interface LearningProgressService {
  getProgress(userId: string, courseId: string): Promise<Progress>;
  completeLesson(userId: string, courseId: string, lessonIndex: number): Promise<void>;
  getXP(userId: string): Promise<number>;
  getStreak(userId: string): Promise<StreakData>;
  getLeaderboard(timeframe: 'weekly' | 'monthly' | 'alltime'): Promise<LeaderboardEntry[]>;
  getCredentials(wallet: PublicKey): Promise<Credential[]>;
}

// ==========================================
// UI Types
// ==========================================

export interface CourseCard {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnail: string | null;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  duration: number;
  xpReward: number;
  track: string | null;
  tags: string[];
  instructorName: string | null;
  instructorImage: string | null;
  totalLessons: number;
  enrolledCount: number;
  userProgress?: number; // 0-100 if enrolled
}

export interface ModuleWithLessons {
  id: string;
  title: string;
  sortOrder: number;
  lessons: LessonSummary[];
}

export interface LessonSummary {
  id: string;
  title: string;
  slug: string;
  type: 'CONTENT' | 'CHALLENGE' | 'VIDEO';
  duration: number;
  xpReward: number;
  isCompleted?: boolean;
}

export interface TestCase {
  input: string;
  expectedOutput: string;
  description: string;
}

export interface ChallengeResult {
  passed: boolean;
  testResults: {
    description: string;
    passed: boolean;
    actual?: string;
    expected?: string;
  }[];
  output: string;
  error?: string;
}

export interface Achievement {
  id: number; // 0-255 bitmap index
  key: string;
  name: string;
  description: string;
  icon: string;
  category: 'progress' | 'streak' | 'skill' | 'community' | 'special';
  isUnlocked: boolean;
  unlockedAt?: string;
}
