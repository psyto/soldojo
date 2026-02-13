import type { TestCase, ChallengeResult } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Regex-based removal of TypeScript syntax so code can run as plain JS */
function stripTypeAnnotations(code: string): string {
  let result = code;

  // Remove type/interface declarations (entire block)
  result = result.replace(/^(export\s+)?(type|interface)\s+\w+[\s\S]*?(?=\n(?:export|const|let|var|function|class|import|\/\/|\n|$))/gm, '');

  // Remove import statements (they reference server-side modules)
  result = result.replace(/^import\s+.*$/gm, '');

  // Remove `export` keyword but keep the declaration
  result = result.replace(/^export\s+(?=(?:function|const|let|var|class|async)\s)/gm, '');

  // Remove generic type parameters from function signatures: <T, U>
  result = result.replace(/<\s*[A-Z]\w*(?:\s*,\s*[A-Z]\w*)*\s*>/g, '');

  // Remove `: Type` annotations (params, return types, variable declarations)
  // Careful not to strip object literal colons — only match after identifier/closing paren
  result = result.replace(/(?<=[\w\)?\]])\s*:\s*(?:readonly\s+)?[A-Z]\w*(?:<[^>]*>)?(?:\[\])*(?:\s*\|\s*(?:null|undefined|[A-Z]\w*(?:<[^>]*>)?))*(?=\s*[=,\)\{;])/g, '');

  // Remove `as Type` assertions
  result = result.replace(/\s+as\s+[A-Z]\w*(?:<[^>]*>)?/g, '');

  // Remove non-null assertions (!)
  result = result.replace(/(?<=\w)!/g, '');

  return result;
}

/** Find the name of the first exported function or const arrow fn */
function findExportedFunction(code: string): string | null {
  // export function foo(
  const fnMatch = code.match(/export\s+(?:async\s+)?function\s+(\w+)/);
  if (fnMatch) return fnMatch[1];

  // export const foo =
  const constMatch = code.match(/export\s+const\s+(\w+)\s*=/);
  if (constMatch) return constMatch[1];

  return null;
}

/** Parse a test-case input string into a JS value */
function parseInput(input: string): unknown {
  const trimmed = input.trim();

  // Try JSON (handles arrays, objects, booleans, null)
  try {
    return JSON.parse(trimmed);
  } catch {
    // not JSON
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  // Plain string
  return trimmed;
}

/** Normalize a value to a comparable string */
function normalizeOutput(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ---------------------------------------------------------------------------
// Structural validation (fallback)
// ---------------------------------------------------------------------------

/** Patterns indicating server-side / Solana imports that can't run in-browser */
const NON_BROWSER_PATTERNS = [
  '@solana/web3.js',
  '@solana/spl-token',
  '@coral-xyz/anchor',
  '@metaplex',
  'node:',
  'require(',
];

function shouldUseStructuralValidation(code: string, testCases: TestCase[]): boolean {
  // If any test case has empty input, we can't do real execution
  if (testCases.some((tc) => !tc.input.trim())) return true;

  // If code references non-browser modules
  if (NON_BROWSER_PATTERNS.some((p) => code.includes(p))) return true;

  return false;
}

/** Structural validation: check for key code patterns based on expectedOutput */
function validateStructural(
  code: string,
  testCases: TestCase[],
  solutionCode: string,
): ChallengeResult {
  const testResults: ChallengeResult['testResults'] = [];

  for (const tc of testCases) {
    const rules = buildStructuralRules(tc, solutionCode);
    const failures = rules.filter((r) => !r.check(code));

    if (failures.length === 0) {
      testResults.push({ description: tc.description, passed: true });
    } else {
      testResults.push({
        description: tc.description,
        passed: false,
        expected: failures[0].expected,
        actual: failures[0].failMessage,
      });
    }
  }

  const passed = testResults.every((r) => r.passed);
  const passCount = testResults.filter((r) => r.passed).length;
  const output = passed
    ? 'All tests passed! Great job!'
    : `${passCount}/${testResults.length} tests passed.`;

  return { passed, testResults, output };
}

interface StructuralRule {
  check: (code: string) => boolean;
  expected: string;
  failMessage: string;
}

function buildStructuralRules(tc: TestCase, solutionCode: string): StructuralRule[] {
  const expected = tc.expectedOutput.trim();
  const rules: StructuralRule[] = [];

  // Pattern: Connection / getBalance / web3.js related
  if (/connection/i.test(expected) || /balance/i.test(expected)) {
    rules.push({
      check: (c) => /Connection/.test(c),
      expected: 'Use Connection from @solana/web3.js',
      failMessage: 'Missing Connection usage',
    });
    if (/balance/i.test(expected)) {
      rules.push({
        check: (c) => /getBalance/.test(c),
        expected: 'Call getBalance',
        failMessage: 'Missing getBalance call',
      });
    }
  }

  // Pattern: createMint / spl-token
  if (/mint/i.test(expected) || /token/i.test(expected)) {
    if (/createMint/i.test(expected) || /create.*mint/i.test(expected)) {
      rules.push({
        check: (c) => /createMint/.test(c),
        expected: 'Call createMint',
        failMessage: 'Missing createMint call',
      });
    }
    if (/token.*account/i.test(expected) || /associated/i.test(expected)) {
      rules.push({
        check: (c) => /getOrCreateAssociatedTokenAccount|createAssociatedTokenAccount/.test(c),
        expected: 'Create or get associated token account',
        failMessage: 'Missing associated token account creation',
      });
    }
    if (/mintTo/i.test(expected)) {
      rules.push({
        check: (c) => /mintTo/.test(c),
        expected: 'Call mintTo',
        failMessage: 'Missing mintTo call',
      });
    }
  }

  // Pattern: transfer
  if (/transfer/i.test(expected)) {
    rules.push({
      check: (c) => /transfer/.test(c),
      expected: 'Implement transfer',
      failMessage: 'Missing transfer call',
    });
  }

  // Pattern: Keypair / PublicKey
  if (/keypair/i.test(expected)) {
    rules.push({
      check: (c) => /Keypair/.test(c),
      expected: 'Use Keypair',
      failMessage: 'Missing Keypair usage',
    });
  }

  // Fallback: extract keywords from solution
  if (rules.length === 0) {
    const keywords = extractKeywords(solutionCode);
    for (const kw of keywords) {
      rules.push({
        check: (c) => c.includes(kw),
        expected: `Code should contain: ${kw}`,
        failMessage: `Missing expected pattern: ${kw}`,
      });
    }
  }

  return rules;
}

/** Extract meaningful identifiers from solution code */
function extractKeywords(solutionCode: string): string[] {
  if (!solutionCode) return [];
  const keywords: string[] = [];

  // Function calls: name(
  const calls = solutionCode.match(/\b([a-zA-Z]\w{2,})\s*\(/g);
  if (calls) {
    const unique = [...new Set(calls.map((c) => c.replace(/\s*\($/, '')))];
    // Filter out common noise
    const noise = new Set(['console', 'log', 'error', 'warn', 'parseInt', 'parseFloat', 'String', 'Number', 'Boolean', 'Array', 'Object', 'Promise', 'async', 'await', 'return', 'const', 'import', 'from', 'require']);
    keywords.push(...unique.filter((k) => !noise.has(k)).slice(0, 5));
  }

  // Class / type instantiations: new Foo
  const news = solutionCode.match(/new\s+([A-Z]\w+)/g);
  if (news) {
    keywords.push(...[...new Set(news.map((n) => n.replace(/^new\s+/, '')))]);
  }

  return [...new Set(keywords)].slice(0, 6);
}

// ---------------------------------------------------------------------------
// Browser execution
// ---------------------------------------------------------------------------

function executeInBrowser(
  code: string,
  testCases: TestCase[],
): ChallengeResult {
  const fnName = findExportedFunction(code);
  if (!fnName) {
    return {
      passed: false,
      testResults: testCases.map((tc) => ({
        description: tc.description,
        passed: false,
        expected: tc.expectedOutput,
        actual: 'No exported function found',
      })),
      output: 'Could not find an exported function. Make sure to export your function.',
      error: 'No exported function found',
    };
  }

  const jsCode = stripTypeAnnotations(code);
  const testResults: ChallengeResult['testResults'] = [];
  let lastError: string | undefined;

  for (const tc of testCases) {
    const input = parseInput(tc.input);
    const args = Array.isArray(input) ? input : [input];

    try {
      // Wrap in a function scope to isolate execution
      const wrapper = new Function(
        `${jsCode}\nreturn ${fnName}(${args.map((a) => JSON.stringify(a)).join(', ')});`,
      );
      const result = wrapper();
      const actual = normalizeOutput(result);
      const expected = tc.expectedOutput.trim();
      const passed = actual === expected;

      testResults.push({
        description: tc.description,
        passed,
        actual,
        expected,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = message;
      testResults.push({
        description: tc.description,
        passed: false,
        actual: `Error: ${message}`,
        expected: tc.expectedOutput,
      });
    }
  }

  const passed = testResults.every((r) => r.passed);
  const passCount = testResults.filter((r) => r.passed).length;
  const output = passed
    ? 'All tests passed! Great job!'
    : `${passCount}/${testResults.length} tests passed.`;

  return { passed, testResults, output, error: lastError };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function runTypeScript(
  code: string,
  testCases: TestCase[],
  solutionCode: string,
): ChallengeResult {
  if (shouldUseStructuralValidation(code, testCases)) {
    return validateStructural(code, testCases, solutionCode);
  }

  try {
    return executeInBrowser(code, testCases);
  } catch {
    // If browser execution fails entirely, fall back to structural
    return validateStructural(code, testCases, solutionCode);
  }
}
