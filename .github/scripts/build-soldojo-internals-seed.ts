#!/usr/bin/env tsx
/**
 * Build prisma/seed-soldojo-internals-{foundations,hl-primitives}-{en,ja}.ts
 * from drafts/solana_internals_ch*_{en,ja}.md.
 *
 * Adapted from rethlab/.github/scripts/build-openhl-clob-seed.ts. Same
 * fence-extraction algorithm; emits 4 seed files (2 courses × 2 locales)
 * in one run rather than rethlab's 2 (1 course × 2 locales).
 *
 * Run from soldojo root:
 *   npx tsx .github/scripts/build-soldojo-internals-seed.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOLDOJO_ROOT = join(SCRIPT_DIR, '..', '..');
const DRAFTS_DIR = join(SOLDOJO_ROOT, 'drafts');
const PRISMA_DIR = join(SOLDOJO_ROOT, 'prisma');

type Locale = 'en' | 'ja';
type CourseKey = 'foundations' | 'hl-primitives';

interface LessonSpec {
  /** Chapter number — 1..14. */
  chapterNum: number;
  /** Slug fragment used in the import-script naming convention. */
  chapterSlug: string;
  /** Lesson sort order within the course. */
  sortOrder: number;
}

interface CourseSpec {
  key: CourseKey;
  slugBase: string;
  /** Sort order across all courses in the soldojo course list. */
  courseSortOrder: number;
  module: { title: { en: string; ja: string }; sortOrder: number };
  titles: { en: string; ja: string };
  descriptions: { en: string; ja: string };
  tags: string[];
  lessons: LessonSpec[];
}

const SHARED = {
  durationPerLesson: 45,
  xpPerLesson: 100,
  instructorName: 'SolDojo Internals',
  track: 'solana-internals',
  difficulty: 'ADVANCED' as const,
};

const COURSES: CourseSpec[] = [
  {
    key: 'foundations',
    slugBase: 'solana-internals-foundations',
    courseSortOrder: 100,
    module: {
      title: { en: 'Foundations', ja: '基礎編' },
      sortOrder: 0,
    },
    titles: {
      en: 'Solana Internals — Foundations',
      ja: 'Solana 内部 — 基礎編',
    },
    descriptions: {
      en: "Learn Solana from scratch by building. Five chapters covering the runtime fundamentals — account model, native programs without Anchor, Program-Derived Addresses, compute budget and heap discipline, Sealevel parallelism — with a working companion repo at every step. No SDK abstractions hide the bytes.",
      ja: "本物の Solana を、組み立てながら学ぶ。ランタイムの基礎をすべて扱う 5 章 — アカウントモデル、Anchor なしのネイティブプログラム、Program-Derived Address、コンピュートバジェットとヒープ規律、Sealevel 並列性 — 各段に動く教材コード付き。SDK の抽象がバイトを覆い隠さない。",
    },
    tags: ['solana', 'internals', 'native-programs', 'pdas', 'compute-budget', 'sealevel'],
    lessons: [
      { chapterNum:  1, chapterSlug: 'account-model',     sortOrder: 0 },
      { chapterNum:  2, chapterSlug: 'native-program',    sortOrder: 1 },
      { chapterNum:  3, chapterSlug: 'pdas',              sortOrder: 2 },
      { chapterNum:  4, chapterSlug: 'compute-budget',    sortOrder: 3 },
      { chapterNum:  5, chapterSlug: 'sealevel',          sortOrder: 4 },
    ],
  },
  {
    key: 'hl-primitives',
    slugBase: 'solana-internals-hl-primitives',
    courseSortOrder: 101,
    module: {
      title: { en: 'HL Primitives', ja: 'HL プリミティブ編' },
      sortOrder: 0,
    },
    titles: {
      en: 'Solana Internals — HL Primitives',
      ja: 'Solana 内部 — HL プリミティブ編',
    },
    descriptions: {
      en: "Build a Hyperliquid-style perpetuals exchange on top of the Foundations track. Nine chapters: SPL Token CPI, on-chain CLOB, matching engine under CU pressure, oracle ingestion, funding rates, liquidations, native trading vaults, builder codes, and the off-chain keeper layer that runs the whole thing.",
      ja: "Foundations トラックの上に Hyperliquid 風パープ取引所を組み立てる。9 章: SPL Token CPI、オンチェーン CLOB、CU 圧下のマッチングエンジン、オラクル取り込み、ファンディングレート、清算、ネイティブ取引 vault、builder codes、すべてを走らせるオフチェーン keeper 層。",
    },
    tags: ['solana', 'internals', 'perpetuals', 'clob', 'oracle', 'funding', 'liquidation', 'vault', 'builder-codes'],
    lessons: [
      { chapterNum:  6, chapterSlug: 'cpi',               sortOrder: 0 },
      { chapterNum:  7, chapterSlug: 'clob',              sortOrder: 1 },
      { chapterNum:  8, chapterSlug: 'matching',          sortOrder: 2 },
      { chapterNum:  9, chapterSlug: 'oracle',            sortOrder: 3 },
      { chapterNum: 10, chapterSlug: 'funding',           sortOrder: 4 },
      { chapterNum: 11, chapterSlug: 'liquidation',       sortOrder: 5 },
      { chapterNum: 12, chapterSlug: 'vault',             sortOrder: 6 },
      { chapterNum: 13, chapterSlug: 'builder-codes',     sortOrder: 7 },
      { chapterNum: 14, chapterSlug: 'cranks-keepers',    sortOrder: 8 },
    ],
  },
];

// ──────────────────────────────────────────────────────────────
// Fence extractor — adapted from rethlab build-openhl-clob-seed.ts.
// ──────────────────────────────────────────────────────────────

function extractLessonBody(draft: string): { body: string; h1: string } {
  const fenceRe = /^````markdown\s*$/m;
  const closeFenceRe = /^````\s*$/m;

  const fenceMatch = fenceRe.exec(draft);
  if (!fenceMatch) {
    throw new Error('No ````markdown fence found in draft');
  }
  const startOfBody = fenceMatch.index + fenceMatch[0].length + 1;
  const remainder = draft.slice(startOfBody);
  const closeMatch = closeFenceRe.exec(remainder);
  if (!closeMatch) {
    throw new Error('No closing ```` fence found in draft');
  }
  const body = remainder.slice(0, closeMatch.index).replace(/\n$/, '');

  // First H1 of the body is the lesson title.
  const h1Line = body.split('\n').find((l) => l.startsWith('# '));
  if (!h1Line) {
    throw new Error('Extracted body has no H1 — bad draft format');
  }
  const h1 = h1Line.slice(2).trim();
  return { body, h1 };
}

function escapeForTemplateLiteral(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

interface LoadedLesson {
  spec: LessonSpec;
  title: string;
  bodyEscaped: string;
}

async function loadLesson(spec: LessonSpec, locale: Locale): Promise<LoadedLesson> {
  const draftPath = join(
    DRAFTS_DIR,
    `solana_internals_ch${pad2(spec.chapterNum)}_${locale}.md`,
  );
  const draft = await readFile(draftPath, 'utf8');
  const { body, h1 } = extractLessonBody(draft);
  return {
    spec,
    title: h1,
    bodyEscaped: escapeForTemplateLiteral(body),
  };
}

function exportName(course: CourseSpec, locale: Locale): string {
  const camel = course.key
    .split('-')
    .map((part, i) =>
      i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
  // e.g. "seedSoldojoInternalsFoundationsEN", "seedSoldojoInternalsHlPrimitivesJA"
  return `seedSoldojoInternals${camel.charAt(0).toUpperCase()}${camel.slice(1)}${locale.toUpperCase()}`;
}

function outputFileName(course: CourseSpec, locale: Locale): string {
  return `seed-soldojo-internals-${course.key}-${locale}.ts`;
}

function renderSeedFile(
  course: CourseSpec,
  locale: Locale,
  lessons: LoadedLesson[],
): string {
  const totalDuration = lessons.length * SHARED.durationPerLesson;
  const totalXp = lessons.length * SHARED.xpPerLesson + 200; // course completion bonus

  const lessonBlocks = lessons
    .sort((a, b) => a.spec.sortOrder - b.spec.sortOrder)
    .map((l) => {
      const slug = `solana-internals-ch${pad2(l.spec.chapterNum)}-${l.spec.chapterSlug}-${locale}`;
      return `                {
                  title: ${JSON.stringify(l.title)},
                  slug: ${JSON.stringify(slug)},
                  type: 'CONTENT',
                  sortOrder: ${l.spec.sortOrder},
                  duration: ${SHARED.durationPerLesson},
                  xpReward: ${SHARED.xpPerLesson},
                  content: \`${l.bodyEscaped}\`,
                }`;
    })
    .join(',\n');

  const moduleBlock = `          {
            title: ${JSON.stringify(course.module.title[locale])},
            sortOrder: ${course.module.sortOrder},
            lessons: {
              create: [
${lessonBlocks},
              ],
            },
          }`;

  const fn = exportName(course, locale);

  return `// AUTO-GENERATED from drafts/solana_internals_ch*_${locale}.md
// by .github/scripts/build-soldojo-internals-seed.ts.
// Do not hand-edit. Re-run the build script when drafts change.

import { PrismaClient } from '@prisma/client';

export async function ${fn}(prisma: PrismaClient) {
  const tags = ${JSON.stringify(course.tags)};

  await prisma.course.create({
    data: {
      slug: ${JSON.stringify(`${course.slugBase}-${locale}`)},
      title: ${JSON.stringify(course.titles[locale])},
      description:
        ${JSON.stringify(course.descriptions[locale])},
      difficulty: ${JSON.stringify(SHARED.difficulty)},
      duration: ${totalDuration},
      xpReward: ${totalXp},
      track: ${JSON.stringify(SHARED.track)},
      tags,
      isPublished: true,
      sortOrder: ${course.courseSortOrder},
      locale: ${JSON.stringify(locale)},
      instructorName: ${JSON.stringify(SHARED.instructorName)},
      modules: {
        create: [
${moduleBlock},
        ],
      },
    },
  });
}
`;
}

async function buildCourse(course: CourseSpec, locale: Locale): Promise<void> {
  const lessons = await Promise.all(
    course.lessons.map((spec) => loadLesson(spec, locale)),
  );
  const content = renderSeedFile(course, locale, lessons);
  const outPath = join(PRISMA_DIR, outputFileName(course, locale));
  await writeFile(outPath, content, 'utf8');
  console.log(`  → ${outPath} (${lessons.length} lessons)`);
}

async function main(): Promise<void> {
  console.log('Building soldojo internals seed files:');
  console.log(`  drafts: ${DRAFTS_DIR}`);
  console.log(`  output: ${PRISMA_DIR}`);
  console.log();
  for (const course of COURSES) {
    for (const locale of ['en', 'ja'] as const) {
      await buildCourse(course, locale);
    }
  }
  console.log(`\nGenerated 4 seed files (2 courses × en/ja).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
