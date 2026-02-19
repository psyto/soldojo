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
  Loader2,
  Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import { useLesson, useCompleteLesson, useOnChain } from '@/hooks';
import { runChallenge } from '@/lib/challenge-runner';
import type { ChallengeResult } from '@/types';

// Lazy load Monaco Editor for performance
const CodeEditor = dynamic(() => import('@/components/editor/code-editor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-card">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

export default function LessonPage() {
  const params = useParams();
  const router = useRouter();
  const { t, formatT } = useLocale();
  const slug = params.slug as string;
  const id = params.id as string;

  const { data: lesson, isLoading, error } = useLesson(slug, id);
  const completeMutation = useCompleteLesson(slug, id);
  const { recordCompletion, isConnected } = useOnChain();

  const [code, setCode] = useState('');
  const [codeInitialized, setCodeInitialized] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [testResults, setTestResults] = useState<ChallengeResult['testResults']>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [splitPosition] = useState(50);

  // Initialize code from lesson data once loaded
  if (lesson && !codeInitialized) {
    setCode(lesson.starterCode || '');
    setCodeInitialized(true);
  }

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <p className="text-destructive">{t('errors.loadLesson')}</p>
      </div>
    );
  }

  const isChallenge = lesson.type === 'CHALLENGE';
  const isCompleted = lesson.isCompleted || completeMutation.isSuccess;

  const handleRun = async () => {
    setIsRunning(true);
    setOutput('');
    setTestResults([]);

    try {
      const result = await runChallenge({
        code,
        language: lesson.challengeLanguage || 'typescript',
        testCases: (lesson.testCases || []) as import('@/types').TestCase[],
        solutionCode: lesson.solutionCode || '',
      });

      setTestResults(result.testResults);
      setOutput(result.output);

      if (result.passed) {
        completeMutation.mutate();
        // Record on-chain completion (best-effort, non-blocking)
        if (isConnected) {
          recordCompletion(slug, lesson.xpReward).catch(() => {});
        }
      }
    } catch {
      setOutput(t('errors.runCode'));
    } finally {
      setIsRunning(false);
    }
  };

  const handleMarkComplete = () => {
    completeMutation.mutate();
    if (isConnected) {
      recordCompletion(slug, lesson.xpReward).catch(() => {});
    }
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
            <span className="text-muted-foreground">{lesson.courseTitle}</span>
            <span className="mx-2 text-muted-foreground">/</span>
            <span className="font-medium">{lesson.title}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isCompleted && (
            <div className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1 text-sm font-medium text-accent">
              <CheckCircle2 className="h-4 w-4" />
              +{lesson.xpReward} XP
            </div>
          )}
          {lesson.prevLesson && (
            <button
              onClick={() => router.push(`/courses/${lesson.courseSlug}/lessons/${lesson.prevLesson!.id}`)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary"
              title={t('lesson.previousLesson')}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {lesson.nextLesson && (
            <button
              onClick={() => router.push(`/courses/${lesson.courseSlug}/lessons/${lesson.nextLesson!.id}`)}
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
              className="text-sm leading-relaxed text-foreground [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3 [&_p]:text-muted-foreground [&_p]:mb-3 [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre]:bg-card [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-4 [&_pre_code]:p-0 [&_pre_code]:bg-transparent [&_pre_code]:rounded-none [&_li]:text-muted-foreground [&_li]:mb-1 [&_ul]:mb-3 [&_ol]:mb-3 [&_strong]:text-foreground"
              dangerouslySetInnerHTML={{
                __html: (() => {
                  let content = lesson.content;
                  // Extract fenced code blocks into placeholders before other regexes
                  const codeBlocks: string[] = [];
                  content = content.replace(/```(\w+)?\n([\s\S]+?)```/g, (_match, _lang, code) => {
                    const index = codeBlocks.length;
                    codeBlocks.push(`<pre><code>${code.replace(/^\n+|\n+$/g, '')}</code></pre>`);
                    return `\x00CODEBLOCK_${index}\x00`;
                  });
                  // Run heading/list/bold/inline-code/paragraph regexes on remaining content
                  content = content
                    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                    .replace(/^- (.+)$/gm, '<li>$1</li>')
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/`([^`]+)`/g, '<code>$1</code>')
                    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
                    .replace(/\n\n/g, '</p><p>')
                    .replace(/^(?!<[hluop\x00])/gm, '<p>');
                  // Re-insert code blocks after all other replacements
                  content = content.replace(/\x00CODEBLOCK_(\d+)\x00/g, (_match, index) => codeBlocks[Number(index)]);
                  return content;
                })()
              }}
            />

            {/* Hints */}
            {isChallenge && lesson.hints.length > 0 && (
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
                    {lesson.hints.map((hint, i) => (
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
                    <code className="font-mono">{lesson.solutionCode}</code>
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* Mark complete (for content lessons) */}
          {!isChallenge && (
            <div className="border-t border-border p-4">
              <button
                onClick={handleMarkComplete}
                disabled={isCompleted || completeMutation.isPending}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all',
                  isCompleted
                    ? 'bg-accent/10 text-accent'
                    : 'bg-solana-gradient text-white hover:opacity-90'
                )}
              >
                {completeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isCompleted ? (
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
                language={lesson.challengeLanguage || 'rust'}
              />
            </div>

            {/* Output panel */}
            {(output || testResults.length > 0) && (
              <div className="max-h-48 overflow-y-auto border-t border-border bg-card p-4">
                {testResults.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {testResults.map((result, i) => (
                      <div key={i}>
                        <div className="flex items-center gap-2 text-xs">
                          {result.passed ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                          ) : (
                            <div className="h-3.5 w-3.5 rounded-full border-2 border-destructive" />
                          )}
                          <span className={result.passed ? 'text-accent' : 'text-destructive'}>
                            {result.description}
                          </span>
                        </div>
                        {!result.passed && (result.expected || result.actual) && (
                          <div className="ml-5.5 mt-1 space-y-0.5 rounded bg-secondary/50 px-3 py-2 text-xs">
                            {result.expected && (
                              <div>
                                <span className="text-muted-foreground">{t('lesson.challenge.expected')} </span>
                                <code className="whitespace-pre-wrap rounded bg-secondary px-1 py-0.5 font-mono text-accent">
                                  {result.expected}
                                </code>
                              </div>
                            )}
                            {result.actual && (
                              <div>
                                <span className="text-muted-foreground">{t('lesson.challenge.actual')} </span>
                                <code className="whitespace-pre-wrap rounded bg-secondary px-1 py-0.5 font-mono text-destructive">
                                  {result.actual}
                                </code>
                              </div>
                            )}
                          </div>
                        )}
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
                onClick={() => setCode(lesson.starterCode || '')}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('lesson.challenge.reset')}
              </button>

              <div className="flex items-center gap-2">
                {testResults.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {formatT('lesson.challenge.passedCount', { passed: testResults.filter((r) => r.passed).length.toString(), total: testResults.length.toString() })}
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
