#!/usr/bin/env tsx
/**
 * Read chapter drafts from the openhl-solana companion repo and stamp them
 * into soldojo/drafts/ with the rethlab-style metadata header + ````markdown
 * fence wrapping that build-soldojo-internals-*-seed.ts expects.
 *
 * One-shot — re-run whenever openhl-solana chapter content changes upstream.
 *
 * Env vars:
 *   OPENHL_SOLANA_DOCS    path to openhl-solana/docs/ (default: ../openhl-solana/docs)
 *
 * Run from soldojo root:
 *   npx tsx .github/scripts/import-internals-drafts.ts
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOLDOJO_ROOT = join(SCRIPT_DIR, '..', '..');
const DEFAULT_SRC = join(SOLDOJO_ROOT, '..', 'openhl-solana', 'docs');
const SRC_DIR = process.env.OPENHL_SOLANA_DOCS ?? DEFAULT_SRC;
const DRAFTS_DIR = join(SOLDOJO_ROOT, 'drafts');

interface ChapterSpec {
  num: number;
  /** Trailing fragment of dirname after "chapter-NN-". Used in the slug. */
  slug: string;
  /** "foundations" or "hl-primitives". */
  course: 'foundations' | 'hl-primitives';
  /** Sort order within the course (0-indexed). */
  sortOrder: number;
}

const CHAPTERS: ChapterSpec[] = [
  { num:  1, slug: 'account-model',     course: 'foundations',   sortOrder: 0 },
  { num:  2, slug: 'native-program',    course: 'foundations',   sortOrder: 1 },
  { num:  3, slug: 'pdas',              course: 'foundations',   sortOrder: 2 },
  { num:  4, slug: 'compute-budget',    course: 'foundations',   sortOrder: 3 },
  { num:  5, slug: 'sealevel',          course: 'foundations',   sortOrder: 4 },
  { num:  6, slug: 'cpi',               course: 'hl-primitives', sortOrder: 0 },
  { num:  7, slug: 'clob',              course: 'hl-primitives', sortOrder: 1 },
  { num:  8, slug: 'matching',          course: 'hl-primitives', sortOrder: 2 },
  { num:  9, slug: 'oracle',            course: 'hl-primitives', sortOrder: 3 },
  { num: 10, slug: 'funding',           course: 'hl-primitives', sortOrder: 4 },
  { num: 11, slug: 'liquidation',       course: 'hl-primitives', sortOrder: 5 },
  { num: 12, slug: 'vault',             course: 'hl-primitives', sortOrder: 6 },
  { num: 13, slug: 'builder-codes',     course: 'hl-primitives', sortOrder: 7 },
  { num: 14, slug: 'cranks-keepers',    course: 'hl-primitives', sortOrder: 8 },
];

const DURATION_MINUTES = 45;
const XP_REWARD = 100;

const COURSE_LABELS = {
  foundations: {
    en: 'Solana Internals — Foundations',
    ja: 'Solana 内部 — 基礎編',
  },
  'hl-primitives': {
    en: 'Solana Internals — HL Primitives',
    ja: 'Solana 内部 — HL プリミティブ編',
  },
};

const LOCALE_LABELS = { en: 'EN', ja: 'JA' };

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

async function findChapterDir(num: number): Promise<string> {
  const entries = await readdir(SRC_DIR);
  const match = entries.find((e) => e.startsWith(`chapter-${pad2(num)}-`));
  if (!match) {
    throw new Error(`No chapter directory found for chapter ${num} in ${SRC_DIR}`);
  }
  return join(SRC_DIR, match);
}

function extractH1(markdown: string): string {
  for (const line of markdown.split('\n')) {
    if (line.startsWith('# ')) {
      return line.slice(2).trim();
    }
  }
  throw new Error('No H1 found in source markdown');
}

/**
 * Strip cross-repo relative markdown links that point back into openhl-solana.
 *
 * The chapter drafts include `[\`crates/state/src/lib.rs\`](../../crates/state/src/lib.rs)`
 * style references that resolve correctly in the openhl-solana repo but render
 * as broken links in the soldojo lesson view. We collapse them to the bare
 * inline code span — the file:line citation is still readable, just no
 * longer clickable. Future work: replace with absolute GitHub URLs once the
 * companion repo has a stable public URL.
 *
 * Matches:
 *   - `[\`text\`](../../path)`            → `\`text\``
 *   - `[\`text\`](../../path#Lnn)`        → `\`text\``
 *   - `[plain text](../../path)`          → `plain text`
 */
function stripRelativeRepoLinks(markdown: string): string {
  return markdown.replace(/\[([^\]]+)\]\(\.\.\/\.\.\/[^)]*\)/g, '$1');
}

function renderDraft(args: {
  spec: ChapterSpec;
  locale: 'en' | 'ja';
  body: string;
  title: string;
}): string {
  const { spec, locale, body, title } = args;
  const courseSlug = `solana-internals-${spec.course}-${locale}`;
  const lessonSlug = `solana-internals-ch${pad2(spec.num)}-${spec.slug}-${locale}`;
  const courseLabel = COURSE_LABELS[spec.course][locale];

  return `# ${courseLabel} — Chapter ${spec.num} draft (${LOCALE_LABELS[locale]})

> Imported from \`psyto/openhl-solana\` \`docs/chapter-${pad2(spec.num)}-${spec.slug}/DRAFT.${locale}.md\`.
> Course: \`${courseSlug}\` (track: \`solana-internals\`).

---

## Chapter ${spec.num} — \`${lessonSlug}\`

- **Module:** 0 (one module per course), sortOrder ${spec.sortOrder} within module
- **Course-level sortOrder:** ${spec.sortOrder}
- **Duration:** ${DURATION_MINUTES} min
- **XP reward:** ${XP_REWARD}
- **Type:** CONTENT

### Content

\`\`\`\`markdown
${body}
\`\`\`\`
`;
}

async function importOne(spec: ChapterSpec, locale: 'en' | 'ja'): Promise<void> {
  const chapterDir = await findChapterDir(spec.num);
  const srcPath = join(chapterDir, `DRAFT.${locale}.md`);
  const src = await readFile(srcPath, 'utf8');
  const title = extractH1(src);
  const body = stripRelativeRepoLinks(src);
  const draft = renderDraft({ spec, locale, body, title });
  const outPath = join(
    DRAFTS_DIR,
    `solana_internals_ch${pad2(spec.num)}_${locale}.md`,
  );
  await writeFile(outPath, draft, 'utf8');
  console.log(`  → ${outPath} (${spec.course}/${title})`);
}

async function main(): Promise<void> {
  console.log(`Importing internals drafts:`);
  console.log(`  src:  ${SRC_DIR}`);
  console.log(`  dst:  ${DRAFTS_DIR}`);
  console.log();
  for (const spec of CHAPTERS) {
    await importOne(spec, 'en');
    await importOne(spec, 'ja');
  }
  console.log(`\nImported ${CHAPTERS.length * 2} drafts (${CHAPTERS.length} chapters × en/ja).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
