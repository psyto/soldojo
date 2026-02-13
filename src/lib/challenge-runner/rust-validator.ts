import type { TestCase, ChallengeResult } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ValidationRule {
  check: (code: string) => boolean;
  expected: string;
  failMessage: string;
}

// ---------------------------------------------------------------------------
// Rule builders per expectedOutput pattern
// ---------------------------------------------------------------------------

function rulesForVaultDefined(): ValidationRule[] {
  return [
    {
      check: (c) => /pub\s+struct\s+Vault/.test(c),
      expected: 'Define `pub struct Vault`',
      failMessage: 'Missing `pub struct Vault` definition',
    },
    {
      check: (c) => /pub\s+balance\s*:\s*u64/.test(c),
      expected: 'Vault should have `pub balance: u64`',
      failMessage: 'Vault should have `pub balance: u64`',
    },
    {
      check: (c) => /pub\s+owner\s*:/.test(c),
      expected: 'Vault should have `pub owner` field',
      failMessage: 'Vault should have a `pub owner` field',
    },
    {
      check: (c) => /pub\s+is_locked\s*:\s*bool/.test(c),
      expected: 'Vault should have `pub is_locked: bool`',
      failMessage: 'Vault should have `pub is_locked: bool`',
    },
  ];
}

function rulesForDepositWorks(): ValidationRule[] {
  return [
    {
      check: (c) => /fn\s+deposit\s*\(\s*&mut\s+self/.test(c),
      expected: 'Implement `fn deposit(&mut self, ...)`',
      failMessage: 'Missing `fn deposit(&mut self, ...)` method',
    },
    {
      check: (c) => /self\s*\.\s*balance\s*\+=|self\s*\.\s*balance\s*=\s*self\s*\.\s*balance\s*\+/.test(c),
      expected: 'Deposit should increment balance',
      failMessage: 'Deposit should increment `self.balance`',
    },
  ];
}

function rulesForWithdrawChecks(): ValidationRule[] {
  return [
    {
      check: (c) => /fn\s+withdraw/.test(c),
      expected: 'Implement `fn withdraw`',
      failMessage: 'Missing `fn withdraw` method',
    },
    {
      check: (c) => /is_locked/.test(c),
      expected: 'Withdraw should check is_locked',
      failMessage: 'Withdraw should check `is_locked` before proceeding',
    },
    {
      check: (c) => /Err\s*\(/.test(c),
      expected: 'Return Err when locked or insufficient funds',
      failMessage: 'Withdraw should return `Err(...)` for invalid cases',
    },
  ];
}

function rulesForCounterDefined(): ValidationRule[] {
  return [
    {
      check: (c) => /#\[account\]/.test(c),
      expected: 'Use `#[account]` attribute',
      failMessage: 'Missing `#[account]` attribute on struct',
    },
    {
      check: (c) => /pub\s+struct\s+Counter/.test(c),
      expected: 'Define `pub struct Counter`',
      failMessage: 'Missing `pub struct Counter` definition',
    },
    {
      check: (c) => /pub\s+count\s*:\s*(u64|i64|u32)/.test(c),
      expected: 'Counter should have a `count` field',
      failMessage: 'Counter should have `pub count: u64` (or similar integer)',
    },
  ];
}

function rulesForInitWorks(): ValidationRule[] {
  return [
    {
      check: (c) => /#\[account\(\s*init/.test(c),
      expected: 'Use `#[account(init, ...)]` for initialization',
      failMessage: 'Missing `#[account(init, ...)]` constraint',
    },
    {
      check: (c) => /count\s*[:=]\s*0/.test(c),
      expected: 'Initialize count to 0',
      failMessage: 'Counter count should be initialized to 0',
    },
  ];
}

function rulesForIncrementWorks(): ValidationRule[] {
  return [
    {
      check: (c) => /count\s*\+=\s*1|count\s*=\s*.*count.*\+\s*1/.test(c),
      expected: 'Increment count by 1',
      failMessage: 'Should increment count by 1 (e.g., `count += 1`)',
    },
  ];
}

function rulesForDepositCPI(): ValidationRule[] {
  return [
    {
      check: (c) => /CpiContext\s*::\s*new/.test(c),
      expected: 'Create CpiContext::new',
      failMessage: 'Missing `CpiContext::new` for the CPI call',
    },
    {
      check: (c) => /token\s*::\s*transfer/.test(c),
      expected: 'Call token::transfer',
      failMessage: 'Missing `token::transfer` CPI call',
    },
  ];
}

function rulesForWithdrawPDA(): ValidationRule[] {
  return [
    {
      check: (c) => /CpiContext\s*::\s*new_with_signer/.test(c),
      expected: 'Create CpiContext::new_with_signer',
      failMessage: 'PDA withdraw needs `CpiContext::new_with_signer`',
    },
    {
      check: (c) => /signer_seeds|seeds/.test(c),
      expected: 'Provide signer seeds for PDA',
      failMessage: 'Missing signer seeds for PDA-signed CPI',
    },
  ];
}

function rulesForNumericOutput(expected: string, solutionCode: string): ValidationRule[] {
  const rules: ValidationRule[] = [];

  // Check the solution for function signatures
  const fnMatch = solutionCode.match(/fn\s+(\w+)/);
  if (fnMatch) {
    rules.push({
      check: (c) => new RegExp(`fn\\s+${fnMatch[1]}`).test(c),
      expected: `Define function \`${fnMatch[1]}\``,
      failMessage: `Missing function \`${fnMatch[1]}\``,
    });
  }

  // Check for common numeric operations hinted at by solution
  if (/sqrt/.test(solutionCode)) {
    rules.push({
      check: (c) => /sqrt/.test(c),
      expected: 'Use sqrt operation',
      failMessage: 'Missing `sqrt` call',
    });
  }
  if (/\/\s*100/.test(solutionCode) || /as\s+f64/.test(solutionCode)) {
    rules.push({
      check: (c) => /\/\s*100|as\s+f64/.test(c),
      expected: 'Perform division / type conversion',
      failMessage: 'Missing division or type conversion (e.g., `/ 100`, `as f64`)',
    });
  }
  if (/floor/.test(solutionCode)) {
    rules.push({
      check: (c) => /floor/.test(c),
      expected: 'Use floor',
      failMessage: 'Missing `floor` call',
    });
  }

  // If we didn't find specific operations, fall back
  if (rules.length === 0) {
    return rulesFromSolution(solutionCode);
  }

  return rules;
}

/** Fallback: extract structural patterns from solution code */
function rulesFromSolution(solutionCode: string): ValidationRule[] {
  if (!solutionCode) return [];
  const rules: ValidationRule[] = [];

  // Structs
  const structs = solutionCode.match(/(?:pub\s+)?struct\s+(\w+)/g);
  if (structs) {
    for (const s of structs) {
      const name = s.match(/struct\s+(\w+)/)?.[1];
      if (name) {
        rules.push({
          check: (c) => new RegExp(`struct\\s+${name}`).test(c),
          expected: `Define struct \`${name}\``,
          failMessage: `Missing struct \`${name}\``,
        });
      }
    }
  }

  // Functions
  const fns = solutionCode.match(/(?:pub\s+)?fn\s+(\w+)/g);
  if (fns) {
    for (const f of fns) {
      const name = f.match(/fn\s+(\w+)/)?.[1];
      if (name && name !== 'main' && name !== 'new') {
        rules.push({
          check: (c) => new RegExp(`fn\\s+${name}`).test(c),
          expected: `Implement function \`${name}\``,
          failMessage: `Missing function \`${name}\``,
        });
      }
    }
  }

  // Impl blocks
  const impls = solutionCode.match(/impl\s+(\w+)/g);
  if (impls) {
    for (const imp of impls) {
      const name = imp.match(/impl\s+(\w+)/)?.[1];
      if (name) {
        rules.push({
          check: (c) => new RegExp(`impl\\s+${name}`).test(c),
          expected: `Implement \`impl ${name}\``,
          failMessage: `Missing \`impl ${name}\` block`,
        });
      }
    }
  }

  return rules;
}

// ---------------------------------------------------------------------------
// Build rules based on expectedOutput
// ---------------------------------------------------------------------------

function buildRulesForTestCase(tc: TestCase, solutionCode: string): ValidationRule[] {
  const expected = tc.expectedOutput.trim();

  if (/vault\s+defined/i.test(expected)) return rulesForVaultDefined();
  if (/deposit\s+works/i.test(expected)) return rulesForDepositWorks();
  if (/withdraw\s+checks/i.test(expected)) return rulesForWithdrawChecks();
  if (/counter\s+defined/i.test(expected)) return rulesForCounterDefined();
  if (/init\s+works/i.test(expected)) return rulesForInitWorks();
  if (/increment\s+works/i.test(expected)) return rulesForIncrementWorks();
  if (/deposit\s+cpi/i.test(expected)) return rulesForDepositCPI();
  if (/withdraw\s+pda/i.test(expected)) return rulesForWithdrawPDA();

  // Numeric expectedOutput (e.g. "42", "3.14")
  if (/^-?\d+(\.\d+)?$/.test(expected)) {
    return rulesForNumericOutput(expected, solutionCode);
  }

  // Fallback: extract patterns from solution
  return rulesFromSolution(solutionCode);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function validateRust(
  code: string,
  testCases: TestCase[],
  solutionCode: string,
): ChallengeResult {
  const testResults: ChallengeResult['testResults'] = [];

  for (const tc of testCases) {
    const rules = buildRulesForTestCase(tc, solutionCode);

    if (rules.length === 0) {
      // No rules could be inferred — pass by default with a note
      testResults.push({ description: tc.description, passed: true });
      continue;
    }

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
