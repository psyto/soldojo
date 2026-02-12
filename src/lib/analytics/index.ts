/**
 * Analytics module for SolDojo
 *
 * Integrates: GA4, PostHog (heatmaps + product analytics), Sentry (error monitoring)
 * All tracking is opt-in and respects user preferences.
 */

// ==========================================
// Google Analytics 4
// ==========================================

export function trackPageView(url: string) {
  if (typeof window === 'undefined') return;
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (!gtag) return;

  gtag('config', process.env.NEXT_PUBLIC_GA4_ID, {
    page_path: url,
  });
}

export function trackEvent(action: string, category: string, label?: string, value?: number) {
  if (typeof window === 'undefined') return;
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (!gtag) return;

  gtag('event', action, {
    event_category: category,
    event_label: label,
    value,
  });
}

// ==========================================
// Custom Events for Learning Platform
// ==========================================

export const LearningEvents = {
  courseViewed: (courseSlug: string) =>
    trackEvent('course_viewed', 'engagement', courseSlug),

  courseEnrolled: (courseSlug: string) =>
    trackEvent('course_enrolled', 'conversion', courseSlug),

  courseCompleted: (courseSlug: string, xpEarned: number) =>
    trackEvent('course_completed', 'milestone', courseSlug, xpEarned),

  lessonStarted: (lessonId: string, courseSlug: string) =>
    trackEvent('lesson_started', 'engagement', `${courseSlug}/${lessonId}`),

  lessonCompleted: (lessonId: string, courseSlug: string, xpEarned: number) =>
    trackEvent('lesson_completed', 'milestone', `${courseSlug}/${lessonId}`, xpEarned),

  challengeAttempted: (lessonId: string) =>
    trackEvent('challenge_attempted', 'engagement', lessonId),

  challengePassed: (lessonId: string, xpEarned: number) =>
    trackEvent('challenge_passed', 'milestone', lessonId, xpEarned),

  codeRun: (language: string) =>
    trackEvent('code_run', 'engagement', language),

  walletConnected: (walletName: string) =>
    trackEvent('wallet_connected', 'auth', walletName),

  languageChanged: (locale: string) =>
    trackEvent('language_changed', 'preferences', locale),

  themeChanged: (theme: string) =>
    trackEvent('theme_changed', 'preferences', theme),

  achievementUnlocked: (achievementKey: string) =>
    trackEvent('achievement_unlocked', 'gamification', achievementKey),

  streakMilestone: (days: number) =>
    trackEvent('streak_milestone', 'gamification', `${days}_days`, days),

  leaderboardViewed: (timeframe: string) =>
    trackEvent('leaderboard_viewed', 'engagement', timeframe),

  credentialViewed: (mintAddress: string) =>
    trackEvent('credential_viewed', 'engagement', mintAddress),

  signUp: (method: string) =>
    trackEvent('sign_up', 'auth', method),

  signIn: (method: string) =>
    trackEvent('sign_in', 'auth', method),
};

// ==========================================
// PostHog (Product Analytics + Heatmaps)
// ==========================================

export function initPostHog() {
  if (typeof window === 'undefined') return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return;

  // PostHog is loaded via script tag in layout — this initializes it
  const posthog = (window as unknown as { posthog?: { init: (key: string, opts: object) => void } }).posthog;
  if (posthog) {
    posthog.init(key, {
      api_host: host,
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
    });
  }
}

// ==========================================
// Sentry (Error Monitoring)
// ==========================================

export function captureError(error: Error, context?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const Sentry = (window as unknown as { Sentry?: { captureException: (err: Error, ctx?: object) => void } }).Sentry;
  if (Sentry) {
    Sentry.captureException(error, { extra: context });
  }
  // Always log in development
  if (process.env.NODE_ENV === 'development') {
    console.error('[SolDojo Error]', error, context);
  }
}
