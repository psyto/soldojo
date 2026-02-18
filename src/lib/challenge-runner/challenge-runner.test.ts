import { describe, it, expect } from 'vitest';
import { runChallenge, type ChallengeInput } from './index';

describe('runChallenge', () => {
  it('returns error for empty code', async () => {
    const result = await runChallenge({
      code: '',
      language: 'typescript',
      testCases: [{ description: 'test', input: '', expectedOutput: '42' }],
      solutionCode: '',
    });
    expect(result.passed).toBe(false);
    expect(result.output).toContain('No code');
  });

  it('returns error for whitespace-only code', async () => {
    const result = await runChallenge({
      code: '   \n  ',
      language: 'typescript',
      testCases: [{ description: 'test', input: '', expectedOutput: '42' }],
      solutionCode: '',
    });
    expect(result.passed).toBe(false);
  });

  it('returns error for no test cases', async () => {
    const result = await runChallenge({
      code: 'const x = 1;',
      language: 'typescript',
      testCases: [],
      solutionCode: '',
    });
    expect(result.passed).toBe(false);
    expect(result.output).toContain('No test cases');
  });

  it('returns error for unsupported language', async () => {
    const result = await runChallenge({
      code: 'print("hello")',
      language: 'python',
      testCases: [{ description: 'test', input: '', expectedOutput: 'hello' }],
      solutionCode: '',
    });
    expect(result.passed).toBe(false);
    expect(result.output).toContain('Unsupported language');
  });

  it('routes rust to validator', async () => {
    const result = await runChallenge({
      code: '#[account]\npub struct Counter { pub count: u64 }',
      language: 'rust',
      testCases: [{ description: 'Counter defined', input: '', expectedOutput: 'Counter defined' }],
      solutionCode: '#[account]\npub struct Counter { pub count: u64 }',
    });
    expect(result.testResults.length).toBe(1);
    expect(result.testResults[0].passed).toBe(true);
  });
});

describe('Rust validator', () => {
  it('validates struct presence', async () => {
    const input: ChallengeInput = {
      code: `
        pub struct Vault {
          pub balance: u64,
          pub owner: Pubkey,
          pub is_locked: bool,
        }
      `,
      language: 'rust',
      testCases: [{ description: 'Vault defined', input: '', expectedOutput: 'Vault defined' }],
      solutionCode: '',
    };
    const result = await runChallenge(input);
    expect(result.passed).toBe(true);
  });

  it('fails when struct is missing', async () => {
    const input: ChallengeInput = {
      code: 'pub struct SomethingElse { }',
      language: 'rust',
      testCases: [{ description: 'Vault defined', input: '', expectedOutput: 'Vault defined' }],
      solutionCode: '',
    };
    const result = await runChallenge(input);
    expect(result.passed).toBe(false);
  });

  it('validates counter with account attribute', async () => {
    const input: ChallengeInput = {
      code: `
        #[account]
        pub struct Counter {
          pub count: u64,
        }
      `,
      language: 'rust',
      testCases: [{ description: 'Counter defined', input: '', expectedOutput: 'Counter defined' }],
      solutionCode: '',
    };
    const result = await runChallenge(input);
    expect(result.passed).toBe(true);
  });

  it('validates solution-based fallback patterns', async () => {
    const input: ChallengeInput = {
      code: `
        pub struct MyToken { pub supply: u64 }
        impl MyToken {
          pub fn mint(&mut self, amount: u64) {
            self.supply += amount;
          }
        }
      `,
      language: 'rust',
      testCases: [{ description: 'Implementation correct', input: '', expectedOutput: 'correct' }],
      solutionCode: `
        pub struct MyToken { pub supply: u64 }
        impl MyToken {
          pub fn mint(&mut self, amount: u64) {
            self.supply += amount;
          }
        }
      `,
    };
    const result = await runChallenge(input);
    expect(result.passed).toBe(true);
  });
});
