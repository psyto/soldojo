import type { TestCase, ChallengeResult } from '@/types';
import { runTypeScript } from './typescript-runner';
import { validateRust } from './rust-validator';

export interface ChallengeInput {
  code: string;
  language: string;
  testCases: TestCase[];
  solutionCode: string;
}

export async function runChallenge(input: ChallengeInput): Promise<ChallengeResult> {
  const { code, language, testCases, solutionCode } = input;

  if (!code.trim()) {
    return {
      passed: false,
      testResults: [],
      output: 'No code to evaluate. Write some code and try again.',
    };
  }

  if (!testCases || testCases.length === 0) {
    return {
      passed: false,
      testResults: [],
      output: 'No test cases defined for this challenge.',
    };
  }

  try {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return runTypeScript(code, testCases, solutionCode);

      case 'rust':
        return validateRust(code, testCases, solutionCode);

      default:
        return {
          passed: false,
          testResults: [],
          output: `Unsupported language: ${language}`,
        };
    }
  } catch (err) {
    return {
      passed: false,
      testResults: [],
      output: 'An unexpected error occurred while evaluating your code.',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
