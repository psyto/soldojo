'use client';

import Link from 'next/link';
import { useLocale } from '@/contexts/locale-context';
import {
  Code2,
  Award,
  Gamepad2,
  Users,
  ArrowRight,
  Zap,
  Shield,
  Terminal,
  Layers,
} from 'lucide-react';
import { motion } from 'framer-motion';

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const stagger = {
  animate: {
    transition: { staggerChildren: 0.1 },
  },
};

export default function LandingPage() {
  const { t } = useLocale();

  const features = [
    {
      icon: Code2,
      title: t('landing.features.interactive.title'),
      description: t('landing.features.interactive.description'),
    },
    {
      icon: Award,
      title: t('landing.features.credentials.title'),
      description: t('landing.features.credentials.description'),
    },
    {
      icon: Gamepad2,
      title: t('landing.features.gamification.title'),
      description: t('landing.features.gamification.description'),
    },
    {
      icon: Users,
      title: t('landing.features.community.title'),
      description: t('landing.features.community.description'),
    },
  ];

  const learningPaths = [
    {
      title: 'Solana Fundamentals',
      description: 'Blockchain basics, accounts, transactions, and the Solana runtime.',
      icon: Layers,
      difficulty: 'Beginner',
      courses: 4,
      color: 'from-green-500/20 to-emerald-500/20',
    },
    {
      title: 'Rust & Anchor',
      description: 'Program development with Rust and the Anchor framework.',
      icon: Terminal,
      difficulty: 'Intermediate',
      courses: 5,
      color: 'from-purple-500/20 to-violet-500/20',
    },
    {
      title: 'DeFi Developer',
      description: 'Build AMMs, lending protocols, and token systems.',
      icon: Zap,
      difficulty: 'Advanced',
      courses: 4,
      color: 'from-orange-500/20 to-amber-500/20',
    },
    {
      title: 'Security & Auditing',
      description: 'Smart contract security patterns and vulnerability detection.',
      icon: Shield,
      difficulty: 'Advanced',
      courses: 3,
      color: 'from-red-500/20 to-rose-500/20',
    },
  ];

  const stats = [
    { value: '2,500+', label: t('landing.stats.learners') },
    { value: '40+', label: t('landing.stats.courses') },
    { value: '10K+', label: t('landing.stats.completions') },
    { value: '1M+', label: t('landing.stats.xpAwarded') },
  ];

  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="pointer-events-none absolute inset-0 bg-solana-gradient-subtle" />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-solana-purple/5 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              <span className="text-solana-gradient">{t('landing.hero.title')}</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground sm:text-xl">
              {t('landing.hero.subtitle')}
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/courses"
                className="inline-flex items-center gap-2 rounded-xl bg-solana-gradient px-8 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:opacity-90 hover:shadow-xl"
              >
                {t('landing.hero.cta')}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/courses"
                className="inline-flex items-center gap-2 rounded-xl border border-border px-8 py-3.5 text-base font-semibold text-foreground transition-colors hover:bg-secondary"
              >
                {t('landing.hero.ctaSecondary')}
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((stat, i) => (
              <motion.div
                key={i}
                className="text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="text-3xl font-bold text-solana-gradient sm:text-4xl">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            {...fadeIn}
          >
            <h2 className="text-3xl font-bold sm:text-4xl">
              {t('landing.features.title')}
            </h2>
          </motion.div>

          <motion.div
            className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4"
            variants={stagger}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {features.map((feature, i) => (
              <motion.div
                key={i}
                className="group rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
                variants={fadeIn}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-solana-gradient">
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Learning Paths */}
      <section className="border-t border-border bg-card/30 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            {...fadeIn}
          >
            <h2 className="text-3xl font-bold sm:text-4xl">
              {t('landing.paths.title')}
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              {t('landing.paths.subtitle')}
            </p>
          </motion.div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2">
            {learningPaths.map((path, i) => (
              <motion.div
                key={i}
                className={`group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${path.color} p-6 transition-all hover:border-primary/50`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/50">
                    <path.icon className="h-5 w-5 text-foreground" />
                  </div>
                  <span className="rounded-full bg-background/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                    {path.difficulty}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{path.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{path.description}</p>
                <div className="mt-4 text-xs text-muted-foreground">
                  {path.courses} courses
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-solana-gradient p-12 text-center sm:p-16">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Ready to Start Building?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
              Join thousands of developers learning Solana. Earn on-chain credentials and level up your Web3 career.
            </p>
            <div className="mt-8">
              <Link
                href="/courses"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-solana-purple shadow-lg transition-all hover:bg-white/90"
              >
                {t('common.getStarted')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
