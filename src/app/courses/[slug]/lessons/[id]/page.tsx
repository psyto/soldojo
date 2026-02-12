'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLocale } from '@/contexts/locale-context';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Lightbulb,
  Eye,
  Play,
  RotateCcw,
  Zap,
  Loader2,
  BookOpen,
  Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';

// Lazy load Monaco Editor for performance
const CodeEditor = dynamic(() => import('@/components/editor/code-editor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-card">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

// Mock lesson data
const MOCK_LESSON = {
  id: 'l3',
  title: 'Your First Anchor Program',
  type: 'CHALLENGE' as const,
  content: `# Your First Anchor Program

In this challenge, you'll create a simple Anchor program that initializes a counter account and increments it.

## Objectives

1. Define a \`Counter\` account struct with a \`count\` field
2. Implement an \`initialize\` instruction that creates the counter
3. Implement an \`increment\` instruction that adds 1 to the count

## Key Concepts

- **\`#[account]\`** — Marks a struct as a Solana account
- **\`#[derive(Accounts)]\`** — Defines the account validation struct
- **\`init\`** constraint — Creates a new account
- **\`mut\`** constraint — Marks an account as mutable

## Example

\`\`\`rust
use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod counter {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = 0;
        Ok(())
    }
}
\`\`\`
`,
  xpReward: 50,
  starterCode: `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod counter {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        // TODO: Initialize the counter to 0
        Ok(())
    }

    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        // TODO: Increment the counter by 1
        Ok(())
    }
}

// TODO: Define the Counter account struct

// TODO: Define the Initialize accounts struct

// TODO: Define the Increment accounts struct
`,
  solutionCode: `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod counter {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = 0;
        Ok(())
    }

    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count += 1;
        Ok(())
    }
}

#[account]
pub struct Counter {
    pub count: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 8)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(mut)]
    pub counter: Account<'info, Counter>,
}
`,
  testCases: [
    { input: '', expectedOutput: 'Counter struct defined', description: 'Counter account struct with count field' },
    { input: '', expectedOutput: 'Initialize accounts defined', description: 'Initialize accounts with init constraint' },
    { input: '', expectedOutput: 'Increment accounts defined', description: 'Increment accounts with mut constraint' },
    { input: '', expectedOutput: 'Counter initialized to 0', description: 'Initialize sets count to 0' },
    { input: '', expectedOutput: 'Counter incremented', description: 'Increment adds 1 to count' },
  ],
  hints: [
    'Use #[account] to define the Counter struct with a pub count: u64 field',
    'The Initialize struct needs init, payer, and space constraints',
    'Space = 8 (discriminator) + 8 (u64 count)',
    'Use &mut ctx.accounts.counter to get a mutable reference',
  ],
  challengeLanguage: 'rust',
  moduleTitle: 'Getting Started with Anchor',
  courseSlug: 'anchor-framework',
  courseTitle: 'Building with Anchor Framework',
  prevLesson: { id: 'l2', title: 'Project Setup & Architecture' },
  nextLesson: { id: 'l4', title: 'The Accounts Macro' },
};

export default function LessonPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useLocale();
  const [code, setCode] = useState(MOCK_LESSON.starterCode);
  const [showHints, setShowHints] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [output, setOutput] = useState('');
  const [testResults, setTestResults] = useState<{ description: string; passed: boolean }[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [splitPosition, setSplitPosition] = useState(50);

  const isChallenge = MOCK_LESSON.type === 'CHALLENGE';

  const handleRun = async () => {
    setIsRunning(true);
    setOutput('');

    // Simulate code evaluation
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Simple pattern matching for the mock
    const hasCounterStruct = code.includes('pub struct Counter') && code.includes('pub count');
    const hasInitialize = code.includes("struct Initialize") && code.includes('init');
    const hasIncrement = code.includes("struct Increment") && code.includes('mut');
    const hasInitLogic = code.includes('counter.count = 0');
    const hasIncrementLogic = code.includes('counter.count += 1');

    const results = [
      { description: 'Counter account struct with count field', passed: hasCounterStruct },
      { description: 'Initialize accounts with init constraint', passed: hasInitialize },
      { description: 'Increment accounts with mut constraint', passed: hasIncrement },
      { description: 'Initialize sets count to 0', passed: hasInitLogic },
      { description: 'Increment adds 1 to count', passed: hasIncrementLogic },
    ];

    setTestResults(results);
    const allPassed = results.every((r) => r.passed);

    if (allPassed) {
      setOutput('All tests passed! Great job!');
      setIsCompleted(true);
    } else {
      const failed = results.filter((r) => !r.passed);
      setOutput(`${results.filter((r) => r.passed).length}/${results.length} tests passed.\n\nFailing:\n${failed.map((f) => `- ${f.description}`).join('\n')}`);
    }

    setIsRunning(false);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Lesson header bar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="text-sm">
            <span className="text-muted-foreground">{MOCK_LESSON.courseTitle}</span>
            <span className="mx-2 text-muted-foreground">/</span>
            <span className="font-medium">{MOCK_LESSON.title}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isCompleted && (
            <div className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1 text-sm font-medium text-accent">
              <CheckCircle2 className="h-4 w-4" />
              +{MOCK_LESSON.xpReward} XP
            </div>
          )}
          {MOCK_LESSON.prevLesson && (
            <button
              onClick={() => router.push(`/courses/${MOCK_LESSON.courseSlug}/lessons/${MOCK_LESSON.prevLesson!.id}`)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"
              title={t('lesson.previousLesson')}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {MOCK_LESSON.nextLesson && (
            <button
              onClick={() => router.push(`/courses/${MOCK_LESSON.courseSlug}/lessons/${MOCK_LESSON.nextLesson!.id}`)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"
              title={t('lesson.nextLesson')}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main content area — split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left pane: Lesson content */}
        <div
          className="flex flex-col overflow-y-auto border-r border-border"
          style={{ width: isChallenge ? `${splitPosition}%` : '100%' }}
        >
          <div className="prose prose-invert max-w-none p-6">
            {/* Render markdown content */}
            <div
              className="text-sm leading-relaxed text-foreground [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3 [&_p]:text-muted-foreground [&_p]:mb-3 [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre]:bg-card [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-4 [&_li]:text-muted-foreground [&_li]:mb-1 [&_ul]:mb-3 [&_ol]:mb-3 [&_strong]:text-foreground"
              dangerouslySetInnerHTML={{
                __html: MOCK_LESSON.content
                  .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                  .replace(/^- (.+)$/gm, '<li>$1</li>')
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                  .replace(/`([^`]+)`/g, '<code>$1</code>')
                  .replace(/```(\w+)?\n([\s\S]+?)```/g, '<pre><code>$2</code></pre>')
                  .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
                  .replace(/\n\n/g, '</p><p>')
                  .replace(/^(?!<[hluop])/gm, '<p>')
              }}
            />

            {/* Hints */}
            {isChallenge && MOCK_LESSON.hints.length > 0 && (
              <div className="mt-8">
                <button
                  onClick={() => setShowHints(!showHints)}
                  className="flex items-center gap-2 rounded-lg bg-yellow-500/10 px-4 py-2 text-sm font-medium text-yellow-400 transition-colors hover:bg-yellow-500/20"
                >
                  <Lightbulb className="h-4 w-4" />
                  {t('lesson.hint')}
                </button>
                {showHints && (
                  <ol className="mt-3 space-y-2">
                    {MOCK_LESSON.hints.map((hint, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="font-medium text-yellow-400">{i + 1}.</span>
                        {hint}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            {/* Solution toggle */}
            {isChallenge && (
              <div className="mt-4">
                <button
                  onClick={() => setShowSolution(!showSolution)}
                  className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Eye className="h-4 w-4" />
                  {t('lesson.solution')}
                </button>
                {showSolution && (
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-card p-4 text-xs">
                    <code>{MOCK_LESSON.solutionCode}</code>
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* Mark complete (for content lessons) */}
          {!isChallenge && (
            <div className="border-t border-border p-4">
              <button
                onClick={() => setIsCompleted(true)}
                disabled={isCompleted}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all',
                  isCompleted
                    ? 'bg-accent/10 text-accent'
                    : 'bg-solana-gradient text-white hover:opacity-90'
                )}
              >
                {isCompleted ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    {t('lesson.completed')}
                  </>
                ) : (
                  t('lesson.markComplete')
                )}
              </button>
            </div>
          )}
        </div>

        {/* Right pane: Code editor (challenges only) */}
        {isChallenge && (
          <div
            className="flex flex-col"
            style={{ width: `${100 - splitPosition}%` }}
          >
            {/* Editor */}
            <div className="flex-1 overflow-hidden">
              <CodeEditor
                value={code}
                onChange={(value) => setCode(value || '')}
                language={MOCK_LESSON.challengeLanguage || 'rust'}
              />
            </div>

            {/* Output panel */}
            {(output || testResults.length > 0) && (
              <div className="max-h-48 overflow-y-auto border-t border-border bg-card p-4">
                {testResults.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    {testResults.map((result, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {result.passed ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border-2 border-destructive" />
                        )}
                        <span className={result.passed ? 'text-accent' : 'text-destructive'}>
                          {result.description}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {output && (
                  <pre className="text-xs text-muted-foreground">{output}</pre>
                )}
              </div>
            )}

            {/* Action bar */}
            <div className="flex items-center justify-between border-t border-border bg-card px-4 py-3">
              <button
                onClick={() => setCode(MOCK_LESSON.starterCode)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('lesson.challenge.reset')}
              </button>

              <div className="flex items-center gap-2">
                {testResults.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {testResults.filter((r) => r.passed).length}/{testResults.length} passed
                  </span>
                )}
                <button
                  onClick={handleRun}
                  disabled={isRunning}
                  className="flex items-center gap-1.5 rounded-lg bg-solana-gradient px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {t('lesson.challenge.run')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
