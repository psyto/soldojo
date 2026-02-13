import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clear existing data
  await prisma.xPEvent.deleteMany();
  await prisma.streakDay.deleteMany();
  await prisma.lessonProgress.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.module.deleteMany();
  await prisma.course.deleteMany();

  // =============================================
  // Course 1: Solana Core Architecture — BEGINNER
  // Based on solana-training Modules 2-3
  // =============================================
  const course1 = await prisma.course.create({
    data: {
      slug: 'solana-core-architecture',
      title: 'Solana Core Architecture',
      description:
        'Understand the revolutionary architecture behind Solana — Proof of History, Sealevel parallel execution, the Account model, and how they combine to achieve 65,000 TPS with 400ms block times.',
      difficulty: 'BEGINNER',
      duration: 240,
      xpReward: 750,
      track: 'solana-fundamentals',
      tags: ['solana', 'blockchain', 'architecture', 'accounts'],
      isPublished: true,
      sortOrder: 1,
      instructorName: 'Superteam Brazil',
      modules: {
        create: [
          {
            title: 'Solana Architecture',
            sortOrder: 0,
            lessons: {
              create: [
                {
                  title: 'What is Solana?',
                  slug: 'what-is-solana',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 15,
                  xpReward: 25,
                  content: `# What is Solana?

Solana is a high-performance blockchain platform designed for decentralized applications. Its theoretical throughput reaches **65,000 TPS** with block times of approximately **400ms**.

## The 8 Innovations

Solana's performance is achieved through 8 key innovations:

1. **Proof of History (PoH)** — A clock before consensus
2. **Tower BFT** — A PoH-optimized version of PBFT
3. **Gulf Stream** — Mempool-less transaction forwarding
4. **Turbine** — Block propagation protocol
5. **Sealevel** — Parallel smart contract runtime
6. **Pipelining** — Transaction processing pipeline
7. **Cloudbreak** — Horizontally-scaled accounts database
8. **Archivers** — Distributed ledger storage

## Why Solana for Enterprise?

Solana is increasingly adopted for commercial use cases including:
- **Payments** — Sub-second settlement with negligible fees
- **DeFi** — High-frequency trading and liquidity protocols
- **Tokenization** — Real-world asset tokenization (tokenized deposits, securities)
- **Gaming** — Real-time state updates for on-chain games

## Performance Comparison

| Feature | Solana | Ethereum | Bitcoin |
|---------|--------|----------|---------|
| TPS | ~65,000 | ~15 | ~7 |
| Block Time | ~400ms | ~12s | ~10min |
| Tx Cost | <$0.01 | $1-50 | $1-30 |
| Consensus | PoH + PoS | PoS | PoW |

In the next lessons, we'll dive deep into each of the three pillars: PoH, Sealevel, and Turbine.`,
                },
                {
                  title: 'Proof of History & Consensus',
                  slug: 'proof-of-history',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 20,
                  xpReward: 25,
                  content: `# Proof of History & Consensus

## The Clock Problem

In distributed systems, agreeing on **time** is one of the hardest problems. Traditional blockchains solve ordering by having validators communicate and agree on the sequence of events — which is slow.

Solana's insight: **What if we had a cryptographic clock that everyone could verify independently?**

## How PoH Works

Proof of History is a **Verifiable Delay Function (VDF)** — a sequential SHA-256 hash chain:

\`\`\`
hash(n) = SHA-256(hash(n-1))
\`\`\`

Each hash proves that time has passed, because the computation is sequential and cannot be parallelized. Any event inserted into this chain gets a provable timestamp.

\`\`\`
hash_200 = SHA-256(hash_199)
hash_201 = SHA-256(hash_200 + event_data)  ← Event gets a timestamp
hash_202 = SHA-256(hash_201)
\`\`\`

## Tower BFT

Tower BFT is Solana's consensus mechanism, optimized for PoH:

- Validators **vote** on the PoH-ordered sequence
- Each vote has an exponentially increasing **lockout period**
- After 32 confirmations, a block is considered finalized
- This eliminates the need for multiple rounds of communication

## Gulf Stream

Traditional blockchains maintain a **mempool** — a queue of unprocessed transactions. Gulf Stream eliminates this:

1. Clients send transactions directly to the **expected leader**
2. The leader schedule is known in advance (derived from stake weights)
3. Validators pre-fetch and cache transactions before their turn

This reduces confirmation times and memory pressure on validators.`,
                },
                {
                  title: 'Sealevel & Parallel Execution',
                  slug: 'sealevel-parallel',
                  type: 'CONTENT',
                  sortOrder: 2,
                  duration: 20,
                  xpReward: 25,
                  content: `# Sealevel & Parallel Execution

## The Key Insight

Most blockchain runtimes (EVM, WASM) are **single-threaded** — transactions execute one at a time. Solana's Sealevel runtime can execute transactions **in parallel**.

## How It Works

The secret is **upfront account declaration**. Every Solana transaction must declare which accounts it will read from and write to. This allows the runtime to:

1. **Identify conflicts** — Two transactions writing to the same account must be sequential
2. **Parallelize non-conflicting transactions** — Transactions touching different accounts run simultaneously

\`\`\`
Transaction A: reads [Acct1], writes [Acct2]
Transaction B: reads [Acct3], writes [Acct4]
→ No overlap — can run in parallel!

Transaction C: reads [Acct1], writes [Acct2]
Transaction D: reads [Acct2], writes [Acct5]
→ Acct2 conflict — must run sequentially
\`\`\`

## Turbine: Block Propagation

Even with fast execution, large blocks need to reach all validators quickly. Turbine solves this:

1. The leader breaks a block into small **shreds** (packets)
2. Shreds are distributed through a **tree structure** of validators
3. Each validator forwards shreds to a small subset of peers
4. Using erasure coding, validators can reconstruct the full block even with some missing shreds

This is similar to BitTorrent's approach — using the network itself to amplify bandwidth.

## Why This Matters

The combination of PoH (ordering), Sealevel (parallel execution), and Turbine (propagation) is what enables Solana's throughput. Each innovation solves a different bottleneck:

- **PoH** → Removes communication overhead for ordering
- **Sealevel** → Utilizes all CPU cores
- **Turbine** → Removes bandwidth bottleneck`,
                },
                {
                  title: 'Architecture Knowledge Check',
                  slug: 'architecture-quiz',
                  type: 'CHALLENGE',
                  sortOrder: 3,
                  duration: 15,
                  xpReward: 50,
                  content: `# Architecture Knowledge Check

Test your understanding of Solana's architecture by implementing a function that classifies Solana's innovations.

## Objectives

1. Implement a function that maps each innovation to its category
2. Categories: "ordering", "execution", "propagation", "other"
3. Return the correct category for each innovation`,
                  starterCode: `type Category = "ordering" | "execution" | "propagation" | "other";

export function classifyInnovation(innovation: string): Category {
  // TODO: Return the correct category for each Solana innovation
  // "PoH" → ordering
  // "Tower BFT" → ordering
  // "Sealevel" → execution
  // "Turbine" → propagation
  // "Gulf Stream" → ordering
  // "Pipelining" → execution
  // "Cloudbreak" → execution
  // anything else → "other"
  return "other";
}`,
                  solutionCode: `type Category = "ordering" | "execution" | "propagation" | "other";

export function classifyInnovation(innovation: string): Category {
  const ordering = ["PoH", "Tower BFT", "Gulf Stream"];
  const execution = ["Sealevel", "Pipelining", "Cloudbreak"];
  const propagation = ["Turbine"];

  if (ordering.includes(innovation)) return "ordering";
  if (execution.includes(innovation)) return "execution";
  if (propagation.includes(innovation)) return "propagation";
  return "other";
}`,
                  testCases: [
                    { input: 'PoH', expectedOutput: 'ordering', description: 'PoH is an ordering innovation' },
                    { input: 'Sealevel', expectedOutput: 'execution', description: 'Sealevel is an execution innovation' },
                    { input: 'Turbine', expectedOutput: 'propagation', description: 'Turbine handles block propagation' },
                  ],
                  hints: [
                    'Group the innovations by their primary function',
                    'PoH, Tower BFT, and Gulf Stream all relate to transaction ordering',
                    'Sealevel, Pipelining, and Cloudbreak optimize execution',
                  ],
                  challengeLanguage: 'typescript',
                },
              ],
            },
          },
          {
            title: 'The Account Model',
            sortOrder: 1,
            lessons: {
              create: [
                {
                  title: 'Everything is an Account',
                  slug: 'everything-is-account',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 20,
                  xpReward: 25,
                  content: `# Everything is an Account

## Solana vs Ethereum: A Fundamental Difference

In Ethereum, smart contracts bundle **logic (code) and state (storage)** together. Solana takes a radically different approach — it separates **logic (Program Accounts)** from **data (Data Accounts)**, and represents everything as a single data structure: the **Account**.

## Account Structure

Every account on Solana has:

\`\`\`typescript
interface AccountInfo {
  lamports: number;      // SOL balance (1 SOL = 1 billion lamports)
  owner: PublicKey;       // The program that owns this account
  data: Buffer;           // Arbitrary byte array
  executable: boolean;    // Whether this account contains a program
  rentEpoch: number;      // Epoch at which rent was last collected
}
\`\`\`

## Three Types of Accounts

### 1. Wallet Accounts (System Accounts)
- Owned by the **System Program**
- Hold SOL balances
- Can sign transactions

### 2. Program Accounts
- Contain executable code (compiled BPF bytecode)
- **Stateless** — they don't store data themselves
- Owned by the **BPF Loader**

### 3. Data Accounts
- Store arbitrary data for programs
- Owned by their parent program
- Only the owner program can modify the data

## The Key Rule

> Only the **owner program** can modify an account's data or debit its lamports. Anyone can credit lamports to any account.

This is the foundation of Solana's security model.`,
                },
                {
                  title: 'Program Derived Addresses',
                  slug: 'pda-fundamentals',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 25,
                  xpReward: 25,
                  content: `# Program Derived Addresses (PDAs)

## The Data Location Problem

Since Solana separates logic (Programs) from data (Accounts), a fundamental question arises:

> "If I want to store User A's data, which address should I use? If I create a random address, how do I find it again?"

## The Solution: PDAs

A **Program Derived Address** is an address deterministically computed from:
1. A **Program ID** (the program that will own the account)
2. A set of **seeds** (arbitrary byte arrays)

\`\`\`typescript
const [pda, bump] = PublicKey.findProgramAddressSync(
  [Buffer.from("user"), userPubkey.toBuffer()],
  programId
);
\`\`\`

Given the same program ID and seeds, you always get the **same address**. This means you can find any user's data account by simply recalculating the address.

## Why No Private Key?

PDAs are specifically designed to **not have a corresponding private key**. The \`bump\` value ensures the address falls off the ed25519 curve.

This is critical for security:
- If a PDA managing a vault had a private key, the holder could bypass the program's logic and steal funds
- Since no private key exists, assets in a PDA can **only** be moved through the program's code

## PDA Use Cases

1. **Deterministic addressing** — Store user-specific data using \`[user_pubkey]\` as seed
2. **Program-controlled vaults** — Hold tokens/SOL with the program as authority
3. **Config accounts** — Global program state using \`[b"config"]\` as seed

## PDA Signing (Signed Invocation)

Programs can "sign" CPIs using PDAs they own:

\`\`\`rust
let seeds = &[b"vault", authority.key().as_ref(), &[bump]];
let signer_seeds = &[&seeds[..]];

let cpi_ctx = CpiContext::new_with_signer(
    token_program.to_account_info(),
    transfer_accounts,
    signer_seeds,  // PDA signs the CPI
);
\`\`\`

The Solana runtime verifies the seeds match the program ID, and authorizes the operation without a private key.`,
                },
                {
                  title: 'Transactions & Instructions',
                  slug: 'transactions-instructions',
                  type: 'CONTENT',
                  sortOrder: 2,
                  duration: 20,
                  xpReward: 25,
                  content: `# Transactions & Instructions

## Transaction Structure

A Solana transaction is an **atomic bundle** of one or more **instructions**:

\`\`\`typescript
const transaction = new Transaction().add(
  instruction1,
  instruction2  // Multiple instructions = atomic batch
);
\`\`\`

If any instruction fails, the entire transaction is rolled back.

## Instruction Components

Each instruction specifies:
- **Program ID** — Which program to call
- **Accounts** — List of accounts the instruction reads/writes (with flags: \`isSigner\`, \`isWritable\`)
- **Data** — Serialized instruction arguments

## Why Declare Accounts Upfront?

This is the key to Sealevel's parallel execution. By knowing which accounts each transaction touches, the runtime can:
- Execute non-conflicting transactions in parallel
- Prevent data races on shared accounts
- Pre-load account data before execution

## Transaction Lifecycle

\`\`\`
Client → (sends TX) → Leader Validator
  → PoH timestamp
  → Execute instructions
  → Update account states
  → Broadcast via Turbine
  → Other validators verify and vote
\`\`\`

## Confirmation Levels

- **processed** — Executed by leader (may be rolled back)
- **confirmed** — Voted by supermajority (~66%) — Solana has never reverted a confirmed TX
- **finalized** — ~32 slots deep, mathematically irreversible

## Fees

Transaction fees on Solana are ~0.000005 SOL (~$0.001). A **priority fee** can be added to increase the chance of inclusion during congestion:

\`\`\`typescript
// Set compute unit price for priority
ComputeBudgetProgram.setComputeUnitPrice({
  microLamports: 50_000  // Priority fee
})
\`\`\``,
                },
                {
                  title: 'Connect & Read Accounts',
                  slug: 'connect-read-accounts',
                  type: 'CHALLENGE',
                  sortOrder: 3,
                  duration: 25,
                  xpReward: 75,
                  content: `# Connect & Read Accounts

In this challenge, you'll connect to Solana devnet, read an account's balance, and build a SOL transfer transaction.

## Objectives

1. Create a connection to devnet
2. Read an account balance and convert to SOL
3. Build a transfer transaction using SystemProgram`,
                  starterCode: `import {
  Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL,
  Transaction, SystemProgram
} from "@solana/web3.js";

// Part 1: Get account balance in SOL
export async function getBalance(address: string): Promise<number> {
  // TODO: Create connection to devnet
  // TODO: Create PublicKey from address string
  // TODO: Get balance and convert from lamports to SOL
  return 0;
}

// Part 2: Build a transfer transaction
export function buildTransfer(
  from: PublicKey,
  to: PublicKey,
  amountSol: number
): Transaction {
  // TODO: Create a transaction with SystemProgram.transfer
  // TODO: Convert SOL to lamports
  return new Transaction();
}`,
                  solutionCode: `import {
  Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL,
  Transaction, SystemProgram
} from "@solana/web3.js";

export async function getBalance(address: string): Promise<number> {
  const connection = new Connection(clusterApiUrl("devnet"));
  const publicKey = new PublicKey(address);
  const balance = await connection.getBalance(publicKey);
  return balance / LAMPORTS_PER_SOL;
}

export function buildTransfer(
  from: PublicKey,
  to: PublicKey,
  amountSol: number
): Transaction {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports: amountSol * LAMPORTS_PER_SOL,
    })
  );
  return transaction;
}`,
                  testCases: [
                    { input: '', expectedOutput: 'Connection created', description: 'Creates a Connection to devnet' },
                    { input: '', expectedOutput: 'Balance returned in SOL', description: 'Converts lamports to SOL' },
                    { input: '', expectedOutput: 'Transfer TX built', description: 'Builds SystemProgram.transfer instruction' },
                  ],
                  hints: [
                    'Use clusterApiUrl("devnet") for the connection URL',
                    'Divide lamports by LAMPORTS_PER_SOL to get SOL',
                    'Multiply SOL by LAMPORTS_PER_SOL for the transfer amount',
                  ],
                  challengeLanguage: 'typescript',
                },
              ],
            },
          },
        ],
      },
    },
  });

  // =============================================
  // Course 2: Rust for Solana — BEGINNER
  // Based on solana-training Module 5
  // =============================================
  const course2 = await prisma.course.create({
    data: {
      slug: 'rust-for-solana',
      title: 'Rust for Solana Developers',
      description:
        'Master the Rust programming language for Solana development. Rust was chosen for its memory safety without garbage collection and zero-cost abstractions — essential for secure, efficient on-chain programs.',
      difficulty: 'BEGINNER',
      duration: 360,
      xpReward: 1000,
      track: 'solana-fundamentals',
      tags: ['rust', 'programming', 'fundamentals'],
      isPublished: true,
      sortOrder: 2,
      instructorName: 'Superteam Brazil',
      modules: {
        create: [
          {
            title: 'Rust Basics',
            sortOrder: 0,
            lessons: {
              create: [
                {
                  title: 'Why Rust for Solana?',
                  slug: 'why-rust',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 15,
                  xpReward: 25,
                  content: `# Why Rust for Solana?

Solana chose Rust as its primary language for two critical reasons: **memory safety** and **performance**.

## Memory Safety Without GC

Rust enforces strict memory management at compile time — no garbage collector needed. This prevents:
- Null pointer dereferences
- Buffer overflows
- Data races
- Use-after-free bugs

For on-chain programs handling real assets, these guarantees are essential.

## Performance

Rust compiles to native machine code with **zero-cost abstractions**. On-chain programs are executed as BPF bytecode, and every computation costs Compute Units. Efficiency matters.

## The Solana Rust Ecosystem

- \`solana-program\` — Core crate for native Solana programs
- \`anchor-lang\` — The Anchor framework (most popular)
- \`anchor-spl\` — SPL token operations via Anchor
- \`spl-token\` — Low-level token operations`,
                },
                {
                  title: 'Variables & Types',
                  slug: 'variables-types',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 20,
                  xpReward: 25,
                  content: `# Variables & Types

## Variables

\`\`\`rust
let x = 5;          // Immutable by default
let mut y = 10;     // Mutable with \`mut\`
const MAX: u32 = 100; // Compile-time constant
\`\`\`

Immutability by default is a core Rust principle — you must explicitly opt into mutability.

## Numeric Types

| Type | Size | Range |
|------|------|-------|
| u8   | 1 byte | 0 to 255 |
| u16  | 2 bytes | 0 to 65,535 |
| u32  | 4 bytes | 0 to 4.2B |
| u64  | 8 bytes | 0 to 18.4 quintillion |
| i64  | 8 bytes | -9.2Q to 9.2Q |

## Strings

\`\`\`rust
let s = String::from("hello");  // Owned string (heap-allocated)
let slice: &str = "hello";      // String slice (reference)
\`\`\`

## Important for Solana

On-chain, prefer \`u64\` for amounts (lamports are u64). Use fixed-size types to keep account data predictable:
- \`bool\`: 1 byte
- \`u8\`: 1 byte
- \`u64\` / \`i64\`: 8 bytes
- \`Pubkey\`: 32 bytes
- \`String\`: 4 bytes (length prefix) + content bytes`,
                },
                {
                  title: 'Functions & Control Flow',
                  slug: 'functions-control',
                  type: 'CONTENT',
                  sortOrder: 2,
                  duration: 20,
                  xpReward: 25,
                  content: `# Functions & Control Flow

## Functions

\`\`\`rust
fn add(a: u64, b: u64) -> u64 {
    a + b  // No semicolon = return value (expression)
}

fn greet(name: &str) {
    println!("Hello, {}!", name);
}
\`\`\`

## If / Else (as Expressions)

\`\`\`rust
let level = if xp >= 1000 { "advanced" } else { "beginner" };
\`\`\`

## Match (Pattern Matching)

\`\`\`rust
match difficulty {
    "easy" => 10,
    "medium" => 25,
    "hard" => 50,
    _ => 0,  // Default case (must be exhaustive)
}
\`\`\`

## Loops

\`\`\`rust
// For loop with range
for i in 0..10 {
    println!("{}", i);
}

// While loop
while condition {
    // ...
}

// Infinite loop with break
loop {
    if done { break; }
}
\`\`\``,
                },
                {
                  title: 'Rust Basics Challenge',
                  slug: 'basics-challenge',
                  type: 'CHALLENGE',
                  sortOrder: 3,
                  duration: 20,
                  xpReward: 50,
                  content: `# Rust Basics Challenge

Write a function that calculates a user's level from their XP.

## Rules

- Level = floor(sqrt(xp / 100))
- If XP is 0, level is 0
- Return the level as u32`,
                  starterCode: `pub fn calculate_level(xp: u64) -> u32 {
    // TODO: Calculate level from XP
    // Level = floor(sqrt(xp / 100))
    0
}`,
                  solutionCode: `pub fn calculate_level(xp: u64) -> u32 {
    ((xp as f64 / 100.0).sqrt()).floor() as u32
}`,
                  testCases: [
                    { input: '0', expectedOutput: '0', description: 'Level 0 for 0 XP' },
                    { input: '100', expectedOutput: '1', description: 'Level 1 for 100 XP' },
                    { input: '400', expectedOutput: '2', description: 'Level 2 for 400 XP' },
                  ],
                  hints: [
                    'Cast xp to f64 for floating point math',
                    'Divide by 100.0 first, then call .sqrt()',
                    'Use .floor() then cast back to u32',
                  ],
                  challengeLanguage: 'rust',
                },
              ],
            },
          },
          {
            title: 'Ownership & Borrowing',
            sortOrder: 1,
            lessons: {
              create: [
                {
                  title: 'Ownership Rules',
                  slug: 'ownership',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 25,
                  xpReward: 25,
                  content: `# Ownership Rules

Rust's ownership system is its most distinctive feature — and the key to memory safety without a garbage collector.

## Three Rules

1. Each value has exactly **one owner**
2. When the owner goes out of scope, the value is **dropped** (freed)
3. Ownership can be **transferred** (moved)

## Move Semantics

\`\`\`rust
let s1 = String::from("hello");
let s2 = s1;  // s1 is MOVED to s2
// println!("{}", s1);  // ERROR: s1 is no longer valid
println!("{}", s2);     // OK
\`\`\`

## Clone

\`\`\`rust
let s1 = String::from("hello");
let s2 = s1.clone();  // Deep copy
println!("{} {}", s1, s2);  // Both valid
\`\`\`

## Copy Types

Simple stack-allocated types implement the \`Copy\` trait — they're copied, not moved:
- All integers (\`u8\`, \`u64\`, \`i32\`, etc.)
- Booleans, characters, floats
- Tuples of Copy types

## Why This Matters for Solana

Account data in Solana programs is accessed through references. Understanding ownership prevents you from accidentally invalidating data while processing a transaction.`,
                },
                {
                  title: 'References & Borrowing',
                  slug: 'references',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 25,
                  xpReward: 25,
                  content: `# References & Borrowing

Instead of transferring ownership, you can **borrow** a value using references.

## Immutable References (&T)

\`\`\`rust
fn calculate_length(s: &String) -> usize {
    s.len()  // Can read but NOT modify
}

let s = String::from("hello");
let len = calculate_length(&s);
println!("{} has length {}", s, len);  // s is still valid
\`\`\`

## Mutable References (&mut T)

\`\`\`rust
fn push_world(s: &mut String) {
    s.push_str(", world!");
}

let mut s = String::from("hello");
push_world(&mut s);
// s is now "hello, world!"
\`\`\`

## The Rules

1. You can have **many immutable** references OR **one mutable** reference (not both)
2. References must always be **valid** (no dangling pointers)

## In Solana / Anchor

Account data uses \`&mut\` references. The Anchor framework gives you:

\`\`\`rust
let counter = &mut ctx.accounts.counter;  // Mutable borrow
counter.count += 1;  // Modify through reference
\`\`\`

Understanding borrowing is essential for safely modifying on-chain state.`,
                },
                {
                  title: 'Ownership Challenge',
                  slug: 'ownership-challenge',
                  type: 'CHALLENGE',
                  sortOrder: 2,
                  duration: 25,
                  xpReward: 75,
                  content: `# Ownership Challenge

Fix the borrowing issues in the code to make it compile correctly.

## Objectives

1. Fix \`process_name\` to borrow instead of taking ownership
2. Fix \`update_balance\` to use a mutable reference
3. Ensure values remain usable after function calls`,
                  starterCode: `pub struct Account {
    pub name: String,
    pub balance: u64,
}

// TODO: Fix this — it should borrow, not take ownership
pub fn process_name(name: String) -> usize {
    name.len()
}

// TODO: Fix this — it should mutably borrow
pub fn update_balance(account: Account, amount: u64) {
    account.balance += amount;
}`,
                  solutionCode: `pub struct Account {
    pub name: String,
    pub balance: u64,
}

pub fn process_name(name: &str) -> usize {
    name.len()
}

pub fn update_balance(account: &mut Account, amount: u64) {
    account.balance += amount;
}`,
                  testCases: [
                    { input: '', expectedOutput: 'Borrows name', description: 'process_name borrows instead of moving' },
                    { input: '', expectedOutput: 'Mutably borrows', description: 'update_balance uses &mut Account' },
                  ],
                  hints: [
                    'Change String to &str for an immutable borrow',
                    'Add &mut before Account in the parameter',
                    'The caller would use &name and &mut account',
                  ],
                  challengeLanguage: 'rust',
                },
              ],
            },
          },
          {
            title: 'Structs, Enums & Traits',
            sortOrder: 2,
            lessons: {
              create: [
                {
                  title: 'Structs & Impl Blocks',
                  slug: 'structs',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 20,
                  xpReward: 25,
                  content: `# Structs & Impl Blocks

Structs are the foundation of Solana account data.

## Defining a Struct

\`\`\`rust
pub struct Counter {
    pub count: u64,
    pub authority: Pubkey,
    pub bump: u8,
}
\`\`\`

## Impl Blocks — Methods

\`\`\`rust
impl Counter {
    pub fn increment(&mut self) {
        self.count += 1;
    }

    // Calculate account space for Anchor
    pub fn space() -> usize {
        8 +  // Anchor discriminator
        8 +  // count (u64)
        32 + // authority (Pubkey)
        1    // bump (u8)
    }
}
\`\`\`

## Derive Macros

\`\`\`rust
#[derive(Debug, Clone, PartialEq)]
pub struct TokenInfo {
    pub mint: Pubkey,
    pub amount: u64,
}
\`\`\`

Common derives for Solana:
- \`BorshSerialize\` / \`BorshDeserialize\` — For account data serialization
- \`AnchorSerialize\` / \`AnchorDeserialize\` — Anchor's version`,
                },
                {
                  title: 'Enums & Error Handling',
                  slug: 'enums-errors',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 20,
                  xpReward: 25,
                  content: `# Enums & Error Handling

## Enums with Data

\`\`\`rust
pub enum OrderStatus {
    Open,
    Filled { price: u64 },
    Cancelled,
}

match status {
    OrderStatus::Open => println!("Waiting..."),
    OrderStatus::Filled { price } => println!("Filled at {}", price),
    OrderStatus::Cancelled => println!("Cancelled"),
}
\`\`\`

## Option & Result

\`\`\`rust
// Option — value that might not exist
let balance: Option<u64> = Some(1000);
let empty: Option<u64> = None;

// Result — operation that might fail
fn divide(a: u64, b: u64) -> Result<u64, String> {
    if b == 0 {
        Err("Division by zero".to_string())
    } else {
        Ok(a / b)
    }
}
\`\`\`

## The ? Operator

\`\`\`rust
fn process() -> Result<()> {
    let value = might_fail()?;  // Returns Err early if it fails
    Ok(())
}
\`\`\`

## Custom Errors in Anchor

\`\`\`rust
#[error_code]
pub enum ErrorCode {
    #[msg("You are not authorized")]
    Unauthorized,
    #[msg("Insufficient funds")]
    InsufficientFunds,
}

// Usage:
require!(
    ctx.accounts.authority.key() == expected,
    ErrorCode::Unauthorized
);
\`\`\``,
                },
                {
                  title: 'Traits & Collections',
                  slug: 'traits-collections',
                  type: 'CONTENT',
                  sortOrder: 2,
                  duration: 20,
                  xpReward: 25,
                  content: `# Traits & Collections

## Traits (Interfaces)

\`\`\`rust
pub trait Stakeable {
    fn stake(&mut self, amount: u64) -> Result<(), String>;
    fn unstake(&mut self, amount: u64) -> Result<(), String>;
    fn rewards(&self) -> u64;
}

impl Stakeable for Pool {
    fn stake(&mut self, amount: u64) -> Result<(), String> {
        self.staked += amount;
        Ok(())
    }
    // ...
}
\`\`\`

## Vectors

\`\`\`rust
let mut scores: Vec<u64> = Vec::new();
scores.push(100);
scores.push(200);

let first = scores[0];
let maybe = scores.get(5);  // Returns Option<&u64>
\`\`\`

## Iterators

\`\`\`rust
let numbers = vec![1, 2, 3, 4, 5];

let sum: u64 = numbers.iter().sum();
let doubled: Vec<u64> = numbers.iter().map(|n| n * 2).collect();
let evens: Vec<&u64> = numbers.iter().filter(|n| *n % 2 == 0).collect();
let first_even = numbers.iter().find(|n| *n % 2 == 0);
\`\`\`

## On-Chain Note

Vectors are used in Solana for variable-length account data, but be careful — account space must be allocated upfront. Use \`realloc\` if you need to grow an account later.`,
                },
                {
                  title: 'Struct Challenge: DeFi Vault',
                  slug: 'struct-challenge',
                  type: 'CHALLENGE',
                  sortOrder: 3,
                  duration: 25,
                  xpReward: 75,
                  content: `# Struct Challenge: DeFi Vault

Create a Vault struct for a simple DeFi vault.

## Objectives

1. Define a Vault struct with authority, balance, and is_locked fields
2. Implement a \`deposit\` method
3. Implement a \`withdraw\` method that checks the lock status`,
                  starterCode: `// TODO: Define the Vault struct
// Fields: authority (String), balance (u64), is_locked (bool)

// TODO: Implement methods on Vault
// deposit(&mut self, amount: u64)
// withdraw(&mut self, amount: u64) -> Result<(), String>
//   - Return Err if locked or insufficient balance`,
                  solutionCode: `pub struct Vault {
    pub authority: String,
    pub balance: u64,
    pub is_locked: bool,
}

impl Vault {
    pub fn deposit(&mut self, amount: u64) {
        self.balance += amount;
    }

    pub fn withdraw(&mut self, amount: u64) -> Result<(), String> {
        if self.is_locked {
            return Err("Vault is locked".to_string());
        }
        if amount > self.balance {
            return Err("Insufficient balance".to_string());
        }
        self.balance -= amount;
        Ok(())
    }
}`,
                  testCases: [
                    { input: '', expectedOutput: 'Vault defined', description: 'Vault struct with correct fields' },
                    { input: '', expectedOutput: 'Deposit works', description: 'deposit increases balance' },
                    { input: '', expectedOutput: 'Withdraw checks', description: 'withdraw checks lock and balance' },
                  ],
                  hints: [
                    'Use pub struct Vault with three pub fields',
                    'deposit simply adds amount to self.balance',
                    'withdraw should check is_locked first, then balance',
                  ],
                  challengeLanguage: 'rust',
                },
              ],
            },
          },
        ],
      },
    },
  });

  // =============================================
  // Course 3: Anchor Framework — INTERMEDIATE
  // Based on solana-training Modules 6-7
  // =============================================
  const course3 = await prisma.course.create({
    data: {
      slug: 'anchor-framework',
      title: 'Building with Anchor Framework',
      description:
        'Build Solana programs using the Anchor framework. Learn how macros automate account validation, serialization, and security checks that would require hundreds of lines of raw Rust.',
      difficulty: 'INTERMEDIATE',
      duration: 480,
      xpReward: 1500,
      track: 'rust-anchor',
      tags: ['anchor', 'rust', 'smart-contracts', 'accounts'],
      isPublished: true,
      sortOrder: 3,
      instructorName: 'Superteam Brazil',
      modules: {
        create: [
          {
            title: 'Getting Started with Anchor',
            sortOrder: 0,
            lessons: {
              create: [
                {
                  title: 'What is Anchor?',
                  slug: 'what-is-anchor',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 15,
                  xpReward: 25,
                  content: `# What is Anchor?

Writing raw Solana programs requires manual byte deserialization, instruction parsing, and security checks. Anchor automates all of this with **macros**.

## Key Features

- **\`#[program]\`** — Defines your instruction handlers
- **\`#[derive(Accounts)]\`** — Declarative account validation
- **\`#[account]\`** — Automatic (de)serialization with discriminator
- **Built-in security** — Signer validation, ownership checks
- **IDL generation** — Auto-generated TypeScript client

## A Minimal Anchor Program

\`\`\`rust
use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod hello {
    use super::*;

    pub fn say_hello(ctx: Context<SayHello>) -> Result<()> {
        msg!("Hello, Solana!");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct SayHello {}
\`\`\`

## Project Structure

\`\`\`
my-project/
├── Anchor.toml          # Project config
├── programs/
│   └── my-program/
│       └── src/lib.rs   # Your program
├── tests/
│   └── my-program.ts    # TypeScript tests
└── migrations/
    └── deploy.ts
\`\`\``,
                },
                {
                  title: 'Your First Anchor Program',
                  slug: 'first-anchor-program',
                  type: 'CHALLENGE',
                  sortOrder: 1,
                  duration: 30,
                  xpReward: 75,
                  content: `# Your First Anchor Program

Create a counter program with initialize and increment instructions.

## Objectives

1. Define a \`Counter\` account struct with a \`count\` field
2. Implement \`initialize\` — creates the counter and sets count to 0
3. Implement \`increment\` — adds 1 to the count`,
                  starterCode: `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod counter {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        // TODO: Set counter.count to 0
        Ok(())
    }

    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        // TODO: Increment counter.count by 1
        Ok(())
    }
}

// TODO: Define Counter account struct with pub count: u64

// TODO: Define Initialize accounts struct
//   - counter: Account<'info, Counter> with init, payer = user, space = 8 + 8
//   - user: Signer<'info> with mut
//   - system_program: Program<'info, System>

// TODO: Define Increment accounts struct
//   - counter: Account<'info, Counter> with mut`,
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
}`,
                  testCases: [
                    { input: '', expectedOutput: 'Counter defined', description: 'Counter account with count field' },
                    { input: '', expectedOutput: 'Init works', description: 'Initialize sets count to 0' },
                    { input: '', expectedOutput: 'Increment works', description: 'Increment adds 1 to count' },
                  ],
                  hints: [
                    'Use #[account] on the Counter struct',
                    'Space = 8 (discriminator) + 8 (u64 count)',
                    'Use &mut ctx.accounts.counter to get a mutable reference',
                  ],
                  challengeLanguage: 'rust',
                },
              ],
            },
          },
          {
            title: 'Account Types & Constraints',
            sortOrder: 1,
            lessons: {
              create: [
                {
                  title: 'Anchor Account Types',
                  slug: 'anchor-account-types',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 25,
                  xpReward: 25,
                  content: `# Anchor Account Types

Anchor provides specialized types that automatically validate accounts.

## Core Types

| Type | Description | Auto-checks |
|------|-------------|-------------|
| \`Account<'info, T>\` | Deserialized account of type T | Owner, discriminator, deserialization |
| \`Signer<'info>\` | Must be a transaction signer | is_signer flag |
| \`Program<'info, T>\` | Validated program account | executable flag, program ID |
| \`SystemAccount<'info>\` | System-owned account | Owner is System Program |
| \`UncheckedAccount<'info>\` | No validation (use with care!) | None — requires \`/// CHECK:\` comment |

## Account<'info, T>

The most common type. Automatically validates:
1. **Discriminator** — 8-byte SHA-256 hash prefix matches the struct
2. **Owner** — Account is owned by your program
3. **Deserialization** — Data deserializes correctly into struct T

\`\`\`rust
#[derive(Accounts)]
pub struct ReadData<'info> {
    pub my_data: Account<'info, MyData>,
}
\`\`\`

## Signer<'info>

Verifies the account signed the transaction. But Signer alone does NOT verify:
- Authority (who the signer is)
- Account ownership or type

Always combine with additional checks:

\`\`\`rust
#[account(has_one = authority)]
pub config: Account<'info, Config>,
pub authority: Signer<'info>,  // Verified: signed TX AND matches config.authority
\`\`\`

## Interface Types (Token Extensions)

For programs that work with both SPL Token and Token-2022:

\`\`\`rust
pub mint: InterfaceAccount<'info, Mint>,
pub token: InterfaceAccount<'info, TokenAccount>,
pub program: Interface<'info, TokenInterface>,
\`\`\``,
                },
                {
                  title: 'Account Constraints',
                  slug: 'account-constraints',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 25,
                  xpReward: 25,
                  content: `# Account Constraints

Constraints are Anchor's declarative validation system. They generate the security checks automatically.

## init — Create new account

\`\`\`rust
#[account(
    init,
    payer = user,
    space = 8 + 32 + 8,  // discriminator + pubkey + u64
    seeds = [b"vault", user.key().as_ref()],
    bump
)]
pub vault: Account<'info, Vault>,
\`\`\`

## mut — Mutable account

\`\`\`rust
#[account(mut)]
pub counter: Account<'info, Counter>,
\`\`\`

## seeds + bump — PDA validation

\`\`\`rust
#[account(seeds = [b"config"], bump)]
pub config: Account<'info, Config>,
\`\`\`

## has_one — Relationship check

\`\`\`rust
#[account(has_one = authority)]
pub config: Account<'info, Config>,
// Ensures config.authority == authority.key()
\`\`\`

## constraint — Custom validation

\`\`\`rust
#[account(constraint = amount > 0 @ ErrorCode::InvalidAmount)]
pub token_account: Account<'info, TokenAccount>,
\`\`\`

## close — Reclaim rent

\`\`\`rust
#[account(mut, close = destination)]
pub data: Account<'info, MyData>,
// Sends remaining lamports to destination, zeroes data
\`\`\`

## Space Calculation

\`\`\`
Total space = 8 (discriminator) + field sizes
  bool:   1 byte
  u8:     1 byte
  u64:    8 bytes
  Pubkey: 32 bytes
  String: 4 bytes (length) + content bytes
\`\`\``,
                },
                {
                  title: 'Storage Hands-On',
                  slug: 'storage-hands-on',
                  type: 'CHALLENGE',
                  sortOrder: 2,
                  duration: 30,
                  xpReward: 75,
                  content: `# Storage Hands-On

Build a simple_storage program that initializes an account with a PDA, writes data, and reads it back.

## Objectives

1. Define a \`MyStorage\` account with an \`x: u64\` field
2. Implement \`initialize\` with PDA seeds
3. Implement \`set\` to write a new value to x`,
                  starterCode: `use anchor_lang::prelude::*;
use std::mem::size_of;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod simple_storage {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        // Account is auto-initialized by Anchor's init constraint
        Ok(())
    }

    pub fn set(ctx: Context<Set>, new_x: u64) -> Result<()> {
        // TODO: Set my_storage.x to new_x
        Ok(())
    }
}

// TODO: Define MyStorage account struct with x: u64

// TODO: Define Initialize accounts struct
//   - my_storage with init, payer, space, seeds=[], bump
//   - signer with mut
//   - system_program

// TODO: Define Set accounts struct
//   - my_storage with mut, seeds=[], bump`,
                  solutionCode: `use anchor_lang::prelude::*;
use std::mem::size_of;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod simple_storage {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    pub fn set(ctx: Context<Set>, new_x: u64) -> Result<()> {
        ctx.accounts.my_storage.x = new_x;
        Ok(())
    }
}

#[account]
pub struct MyStorage {
    x: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = signer,
        space = size_of::<MyStorage>() + 8,
        seeds = [],
        bump
    )]
    pub my_storage: Account<'info, MyStorage>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Set<'info> {
    #[account(mut, seeds = [], bump)]
    pub my_storage: Account<'info, MyStorage>,
}`,
                  testCases: [
                    { input: '', expectedOutput: 'Storage initialized', description: 'MyStorage account created via PDA' },
                    { input: '', expectedOutput: 'Value set', description: 'set() writes new value to x' },
                  ],
                  hints: [
                    'Use size_of::<MyStorage>() + 8 for space',
                    'seeds = [] creates a PDA with no custom seeds',
                    'Access data via ctx.accounts.my_storage.x',
                  ],
                  challengeLanguage: 'rust',
                },
              ],
            },
          },
          {
            title: 'Cross-Program Invocations',
            sortOrder: 2,
            lessons: {
              create: [
                {
                  title: 'CPI Fundamentals',
                  slug: 'cpi-fundamentals',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 20,
                  xpReward: 25,
                  content: `# CPI Fundamentals

Cross-Program Invocations (CPIs) allow one program to call another program's instructions.

## Why CPIs?

- **Composability** — Programs build on each other
- **Reuse** — Use SPL Token, System Program, etc.
- **Modularity** — Separate concerns into different programs

## CPI in Anchor

\`\`\`rust
use anchor_spl::token::{self, Transfer, Token, TokenAccount};

pub fn transfer_tokens(ctx: Context<TransferTokens>, amount: u64) -> Result<()> {
    let cpi_accounts = Transfer {
        from: ctx.accounts.from.to_account_info(),
        to: ctx.accounts.to.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

    token::transfer(cpi_ctx, amount)?;
    Ok(())
}
\`\`\`

## PDA-Signed CPI

When a PDA needs to sign:

\`\`\`rust
let seeds = &[b"vault", authority.key().as_ref(), &[bump]];
let signer_seeds = &[&seeds[..]];

let cpi_ctx = CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    cpi_accounts,
    signer_seeds,  // PDA signs
);
\`\`\`

## Important: Account Reload After CPI

CPI operations don't automatically update your deserialized Account objects. After a CPI that modifies an account, call \`.reload()\`:

\`\`\`rust
token::transfer(cpi_ctx, amount)?;
ctx.accounts.vault_token.reload()?;  // Fetch fresh state
\`\`\`

## CPI Depth Limit

Solana allows up to **4 levels** of CPI depth (your program is level 0).`,
                },
                {
                  title: 'Build a Token Vault',
                  slug: 'token-vault',
                  type: 'CHALLENGE',
                  sortOrder: 1,
                  duration: 40,
                  xpReward: 100,
                  content: `# Build a Token Vault

Create a vault program that holds and releases tokens using CPIs.

## Objectives

1. Define a Vault account with authority and bump
2. Implement deposit using CPI (user-signed)
3. Implement withdraw using PDA-signed CPI`,
                  starterCode: `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod vault {
    use super::*;

    pub fn initialize(ctx: Context<InitVault>) -> Result<()> {
        // TODO: Set vault authority and bump
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        // TODO: CPI transfer tokens from user to vault
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        // TODO: PDA-signed CPI transfer from vault to user
        Ok(())
    }
}

// TODO: Define Vault account (authority: Pubkey, bump: u8)
// TODO: Define account structs for each instruction`,
                  solutionCode: `use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("11111111111111111111111111111111");

#[program]
pub mod vault {
    use super::*;

    pub fn initialize(ctx: Context<InitVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.bump = ctx.bumps.vault;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token.to_account_info(),
            to: ctx.accounts.vault_token.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let seeds = &[b"vault".as_ref(), &[ctx.accounts.vault.bump]];
        let signer_seeds = &[&seeds[..]];
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_token.to_account_info(),
            to: ctx.accounts.user_token.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub bump: u8,
}`,
                  testCases: [
                    { input: '', expectedOutput: 'Vault defined', description: 'Vault account with authority and bump' },
                    { input: '', expectedOutput: 'Deposit CPI', description: 'Deposit uses user-signed CPI' },
                    { input: '', expectedOutput: 'Withdraw PDA', description: 'Withdraw uses PDA-signed CPI' },
                  ],
                  hints: [
                    'Store ctx.bumps.vault in the vault account on init',
                    'Deposit: CpiContext::new for user-signed transfer',
                    'Withdraw: CpiContext::new_with_signer with vault seeds and bump',
                  ],
                  challengeLanguage: 'rust',
                },
              ],
            },
          },
          {
            title: 'Testing & Deployment',
            sortOrder: 3,
            lessons: {
              create: [
                {
                  title: 'Testing with Anchor',
                  slug: 'testing-anchor',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 25,
                  xpReward: 25,
                  content: `# Testing with Anchor

## Test Framework

Anchor uses Mocha/Chai for TypeScript tests. The key pattern:

\`\`\`typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Counter } from "../target/types/counter";

describe("counter", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Counter as Program<Counter>;

  it("initializes the counter", async () => {
    const counter = Keypair.generate();
    await program.methods
      .initialize()
      .accounts({ counter: counter.publicKey })
      .signers([counter])
      .rpc();

    const account = await program.account.counter.fetch(counter.publicKey);
    expect(account.count.toNumber()).to.equal(0);
  });
});
\`\`\`

## Naming Convention

Anchor auto-converts between Rust snake_case and TypeScript camelCase:
- Rust: \`my_storage\` → TypeScript: \`myStorage\`
- Rust: \`initialize_pda\` → TypeScript: \`initializePda\`

\`system_program\` and \`signer\` are auto-filled by Anchor.

## Best Practices

1. **Independent tests** — Each test should set up its own state
2. **Airdrop SOL** — Use \`provider.connection.requestAirdrop()\` in tests
3. **Use .fetch()** — Verify on-chain state after each operation
4. **Test errors** — Verify invalid operations fail with expected error codes`,
                },
                {
                  title: 'Deploy to Devnet',
                  slug: 'deploy-devnet',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 20,
                  xpReward: 50,
                  content: `# Deploy to Devnet

## Deployment Steps

\`\`\`bash
# Configure for devnet
solana config set --url devnet

# Check SOL balance
solana balance

# Get devnet SOL if needed
solana airdrop 2

# Build
anchor build

# Deploy
anchor deploy
\`\`\`

## Program Upgrades

Solana programs are **upgradeable by default**. The key difference:

| Command | Use Case |
|---------|----------|
| \`anchor deploy\` | First deploy or dev iteration (updates IDL automatically) |
| \`anchor upgrade\` | Production upgrades (explicit file path, for Verifiable Builds) |

## Data Compatibility on Upgrade

When upgrading, **never modify existing account fields**. Only append new fields:

\`\`\`rust
// v1
#[account]
pub struct Config {
    pub admin: Pubkey,
    pub fee: u64,
}

// v2 — SAFE: only appended new field
#[account]
pub struct Config {
    pub admin: Pubkey,
    pub fee: u64,
    pub paused: bool,  // NEW field at the end
}
\`\`\`

## Upgrade Authority

The deployer wallet is the default **Upgrade Authority**. For production:

1. Transfer to a **multisig** (e.g., Squads) for governance
2. Or make the program **immutable** (irreversible):
   \`\`\`bash
   solana program set-upgrade-authority <ID> --final
   \`\`\`

Congratulations! You're now ready to build and deploy production Solana programs with Anchor.`,
                },
              ],
            },
          },
        ],
      },
    },
  });

  // =============================================
  // Course 4: SPL Tokens & Token Extensions — INTERMEDIATE
  // Based on solana-training Modules 8-9
  // =============================================
  const course4 = await prisma.course.create({
    data: {
      slug: 'spl-tokens',
      title: 'SPL Tokens & Token Extensions',
      description:
        'Learn to create and manage tokens on Solana using SPL Token Program and Token Extensions (Token-2022). Unlike Ethereum where each token requires deploying a new contract, Solana uses a shared program for all tokens.',
      difficulty: 'INTERMEDIATE',
      duration: 360,
      xpReward: 1500,
      track: 'tokens',
      tags: ['spl-token', 'token-2022', 'token-extensions', 'defi'],
      isPublished: true,
      sortOrder: 4,
      instructorName: 'Superteam Brazil',
      modules: {
        create: [
          {
            title: 'SPL Token Program',
            sortOrder: 0,
            lessons: {
              create: [
                {
                  title: 'SPL Token Overview',
                  slug: 'spl-token-overview',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 20,
                  xpReward: 25,
                  content: `# SPL Token Overview

## A Shared Program

Unlike Ethereum's ERC-20 where each developer deploys their own smart contract, Solana's **SPL Token Program** is a single, shared on-chain program. Developers register token configuration (supply, decimals, authority) rather than writing new code.

This means:
- **Lower security risk** — One audited program for all tokens
- **Lower cost** — No custom contract deployment
- **Interoperability** — All tokens share the same interface

## Two Key Account Types

### 1. Mint Account
The "type definition" of a token:
- **Supply** — Total tokens in existence
- **Decimals** — Precision (e.g., 9 for SOL, 6 for USDC)
- **Mint Authority** — Who can create new tokens
- **Freeze Authority** — Who can freeze token accounts

### 2. Token Account
A "wallet" for a specific token:
- **Mint** — Which token this account holds
- **Owner** — The wallet that controls this account
- **Amount** — How many tokens are held

## Associated Token Accounts (ATAs)

ATAs are deterministically derived from a wallet address and mint:

\`\`\`typescript
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const ata = getAssociatedTokenAddressSync(
  mintPubkey,    // Which token
  walletPubkey   // Whose wallet
);
\`\`\`

This means you can always find someone's token account without a lookup.`,
                },
                {
                  title: 'Token Operations',
                  slug: 'token-operations',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 20,
                  xpReward: 25,
                  content: `# Token Operations

## Create a Mint

\`\`\`typescript
import { createMint } from "@solana/spl-token";

const mint = await createMint(
  connection,
  payer,           // Pays for the transaction
  mintAuthority,   // Can mint new tokens
  freezeAuthority, // Can freeze accounts (or null)
  9                // Decimals
);
\`\`\`

## Mint Tokens

\`\`\`typescript
import { mintTo } from "@solana/spl-token";

await mintTo(
  connection,
  payer,
  mint,              // Mint address
  tokenAccount,      // Destination
  mintAuthority,     // Must be mint authority
  1_000_000_000      // Amount (with decimals)
);
\`\`\`

## Transfer Tokens

\`\`\`typescript
import { transfer } from "@solana/spl-token";

await transfer(
  connection,
  payer,
  sourceTokenAccount,
  destinationTokenAccount,
  owner,            // Owner of source account
  500_000_000       // Amount
);
\`\`\`

## Burn Tokens

\`\`\`typescript
import { burn } from "@solana/spl-token";

await burn(
  connection,
  payer,
  tokenAccount,
  mint,
  owner,
  100_000_000       // Amount to burn
);
\`\`\`

## Delegate

Allow another account to transfer tokens on your behalf:

\`\`\`typescript
import { approve } from "@solana/spl-token";

await approve(
  connection, payer, tokenAccount,
  delegate, owner, 100_000_000
);
\`\`\``,
                },
                {
                  title: 'Create & Mint Tokens',
                  slug: 'create-mint-tokens',
                  type: 'CHALLENGE',
                  sortOrder: 2,
                  duration: 30,
                  xpReward: 75,
                  content: `# Create & Mint Tokens

Build a function that creates a new SPL token mint and mints initial supply.

## Objectives

1. Create a new Mint with specified decimals
2. Create an ATA for the recipient
3. Mint the initial supply to that ATA`,
                  starterCode: `import {
  Connection, Keypair, PublicKey
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

export async function createToken(
  connection: Connection,
  payer: Keypair,
  decimals: number,
  initialSupply: number,
): Promise<{ mint: PublicKey; tokenAccount: PublicKey }> {
  // TODO: 1. Create the mint
  // TODO: 2. Get or create ATA for payer
  // TODO: 3. Mint initialSupply tokens to the ATA
  // TODO: Return { mint, tokenAccount }

  return { mint: PublicKey.default, tokenAccount: PublicKey.default };
}`,
                  solutionCode: `import {
  Connection, Keypair, PublicKey
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

export async function createToken(
  connection: Connection,
  payer: Keypair,
  decimals: number,
  initialSupply: number,
): Promise<{ mint: PublicKey; tokenAccount: PublicKey }> {
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey,  // mint authority
    null,             // freeze authority
    decimals
  );

  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey
  );

  await mintTo(
    connection,
    payer,
    mint,
    ata.address,
    payer,
    initialSupply * (10 ** decimals)
  );

  return { mint, tokenAccount: ata.address };
}`,
                  testCases: [
                    { input: '', expectedOutput: 'Mint created', description: 'Creates a new SPL token mint' },
                    { input: '', expectedOutput: 'ATA created', description: 'Creates associated token account' },
                    { input: '', expectedOutput: 'Tokens minted', description: 'Mints initial supply' },
                  ],
                  hints: [
                    'createMint returns the mint PublicKey',
                    'getOrCreateAssociatedTokenAccount returns an object with .address',
                    'Remember to multiply by 10^decimals for the raw amount',
                  ],
                  challengeLanguage: 'typescript',
                },
              ],
            },
          },
          {
            title: 'Token Extensions (Token-2022)',
            sortOrder: 1,
            lessons: {
              create: [
                {
                  title: 'Token Extensions Overview',
                  slug: 'token-extensions-overview',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 20,
                  xpReward: 25,
                  content: `# Token Extensions Overview

## What is Token-2022?

Token Extensions Program (Token-2022) is an upgraded version of SPL Token that adds enterprise-grade features through **extensions**. Each Mint or Token Account can enable specific extensions at creation time.

## Key Extensions

### Metadata Pointer
Store token metadata (name, symbol, URI) directly on the Mint Account:

\`\`\`typescript
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { createInitializeMetadataPointerInstruction } from "@solana/spl-token";

// Point metadata to the mint itself
createInitializeMetadataPointerInstruction(
  mint.publicKey,
  payer.publicKey,  // update authority
  mint.publicKey,   // metadata address (self-referencing)
  TOKEN_2022_PROGRAM_ID,
);
\`\`\`

### Transfer Hook
Execute custom logic on every token transfer via CPI:

\`\`\`typescript
createInitializeTransferHookInstruction(
  mint.publicKey,
  wallet.publicKey,      // authority
  hookProgramId,         // Your custom program
  TOKEN_2022_PROGRAM_ID,
);
\`\`\`

### Confidential Transfer
Encrypt transfer amounts using zero-knowledge proofs while keeping wallet addresses public.

### Memo Transfer
Require a memo on all incoming transfers — useful for exchanges and compliance.

## When to Use Token-2022?

- **Regulated tokens** — Transfer hooks for KYC/AML compliance
- **NFTs** — Metadata directly on mint (no Metaplex needed)
- **Privacy** — Confidential transfers for sensitive financial data
- **Enterprise** — Memo requirements for audit trails`,
                },
                {
                  title: 'Transfer Hooks for Compliance',
                  slug: 'transfer-hooks',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 25,
                  xpReward: 25,
                  content: `# Transfer Hooks for Compliance

Transfer Hooks allow you to execute custom validation logic on every token transfer. This is essential for regulated assets like tokenized deposits.

## Architecture

\`\`\`
User sends transfer TX → Token-2022 Program
  → Detects Transfer Hook extension on mint
  → CPI to your custom Hook Program
  → Hook validates (e.g., whitelist check)
  → If hook returns Ok: transfer proceeds
  → If hook returns Err: transfer reverts
\`\`\`

## Hook Program Implementation

\`\`\`rust
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TransferHook;

#[program]
pub mod transfer_hook {
    use super::*;

    // Called by Token-2022 on every transfer
    pub fn transfer_hook(ctx: Context<TransferHookCtx>, amount: u64) -> Result<()> {
        // Check if destination is whitelisted
        let whitelist = &ctx.accounts.whitelist;
        require!(whitelist.is_active, ErrorCode::NotWhitelisted);
        Ok(())
    }
}
\`\`\`

## Real-World Use Case: Tokenized Deposits

A bank issues tokens backed by real deposits:
1. **Mint** created with Transfer Hook pointing to KYC program
2. Users must be **whitelisted** to receive tokens
3. Every transfer triggers the hook → verifies both sender and receiver are KYC'd
4. Non-compliant transfers are automatically blocked

## ExtraAccountMetaList

Transfer hooks can require additional accounts beyond the standard transfer accounts. These are stored in a PDA called ExtraAccountMetaList:

\`\`\`typescript
await program.methods
  .initializeExtraAccountMetaList()
  .accounts({ mint: mint.publicKey })
  .rpc();
\`\`\``,
                },
                {
                  title: 'Token Extensions Quiz',
                  slug: 'token-extensions-quiz',
                  type: 'CHALLENGE',
                  sortOrder: 2,
                  duration: 20,
                  xpReward: 50,
                  content: `# Token Extensions Quiz

Create a function that determines which Token-2022 extensions are needed based on requirements.

## Objectives

1. Map business requirements to the correct extensions
2. Return an array of required extension names`,
                  starterCode: `type Extension =
  | "MetadataPointer"
  | "TransferHook"
  | "ConfidentialTransfer"
  | "MemoTransfer"
  | "NonTransferable";

interface Requirements {
  needsOnChainMetadata: boolean;
  needsKYCCompliance: boolean;
  needsPrivacy: boolean;
  needsAuditTrail: boolean;
  isSoulbound: boolean;
}

export function getRequiredExtensions(req: Requirements): Extension[] {
  // TODO: Return the extensions needed for the given requirements
  return [];
}`,
                  solutionCode: `type Extension =
  | "MetadataPointer"
  | "TransferHook"
  | "ConfidentialTransfer"
  | "MemoTransfer"
  | "NonTransferable";

interface Requirements {
  needsOnChainMetadata: boolean;
  needsKYCCompliance: boolean;
  needsPrivacy: boolean;
  needsAuditTrail: boolean;
  isSoulbound: boolean;
}

export function getRequiredExtensions(req: Requirements): Extension[] {
  const extensions: Extension[] = [];
  if (req.needsOnChainMetadata) extensions.push("MetadataPointer");
  if (req.needsKYCCompliance) extensions.push("TransferHook");
  if (req.needsPrivacy) extensions.push("ConfidentialTransfer");
  if (req.needsAuditTrail) extensions.push("MemoTransfer");
  if (req.isSoulbound) extensions.push("NonTransferable");
  return extensions;
}`,
                  testCases: [
                    { input: 'KYC only', expectedOutput: '["TransferHook"]', description: 'KYC compliance needs TransferHook' },
                    { input: 'Full compliance', expectedOutput: '3+ extensions', description: 'Multiple requirements map to multiple extensions' },
                  ],
                  hints: [
                    'Each boolean maps to exactly one extension',
                    'KYC/AML compliance → TransferHook',
                    'Soulbound tokens → NonTransferable',
                  ],
                  challengeLanguage: 'typescript',
                },
              ],
            },
          },
        ],
      },
    },
  });

  // =============================================
  // Course 5: Production Solana Development — ADVANCED
  // Based on solana-training Modules 10-13
  // =============================================
  const course5 = await prisma.course.create({
    data: {
      slug: 'production-solana',
      title: 'Production Solana Development',
      description:
        'Master the skills needed to ship Solana programs to production: integration testing, frontend DApp development, secure coding practices, deployment strategies, CI/CD, and operational monitoring.',
      difficulty: 'ADVANCED',
      duration: 600,
      xpReward: 2000,
      track: 'production',
      tags: ['testing', 'security', 'deployment', 'monitoring', 'frontend'],
      isPublished: true,
      sortOrder: 5,
      instructorName: 'Superteam Brazil',
      modules: {
        create: [
          {
            title: 'Testing & Frontend',
            sortOrder: 0,
            lessons: {
              create: [
                {
                  title: 'Integration Testing',
                  slug: 'integration-testing',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 25,
                  xpReward: 25,
                  content: `# Integration Testing

Programs are never deployed directly to Mainnet. The path is: **Local → Devnet → Mainnet**.

## Test Setup

\`\`\`typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Counter } from "../target/types/counter";
import { expect } from "chai";

describe("counter", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Counter as Program<Counter>;
  const counter = Keypair.generate();

  it("initializes to 0", async () => {
    await program.methods
      .initialize()
      .accounts({
        counter: counter.publicKey,
        user: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([counter])
      .rpc();

    const account = await program.account.counter.fetch(counter.publicKey);
    expect(account.count.toNumber()).to.equal(0);
  });

  it("increments correctly", async () => {
    await program.methods
      .increment()
      .accounts({ counter: counter.publicKey })
      .rpc();

    const account = await program.account.counter.fetch(counter.publicKey);
    expect(account.count.toNumber()).to.equal(1);
  });

  it("fails on unauthorized decrement", async () => {
    try {
      await program.methods.decrement()
        .accounts({ counter: counter.publicKey, authority: wrongKey })
        .rpc();
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err.error.errorCode.code).to.equal("Unauthorized");
    }
  });
});
\`\`\`

## Best Practices

- Test **happy path**, **edge cases**, and **error conditions**
- Each test should be **independent** (don't rely on test execution order)
- Use \`program.account.X.fetch()\` to verify on-chain state
- Use \`BN\` (BigNumber) for numeric comparisons`,
                },
                {
                  title: 'Frontend DApp with Wallet Adapter',
                  slug: 'frontend-dapp',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 25,
                  xpReward: 25,
                  content: `# Frontend DApp with Wallet Adapter

## Solana Wallet Adapter

The wallet adapter library provides React hooks and UI components for connecting wallets (Phantom, Backpack, etc.):

\`\`\`typescript
import { useAnchorWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';

function App() {
  const wallet = useAnchorWallet();

  const callProgram = async () => {
    if (!wallet) return;

    const provider = new AnchorProvider(connection, wallet, {});
    const program = new Program(idl as Idl, programId, provider);

    await program.methods.increment()
      .accounts({ counter: counterPublicKey })
      .rpc();
  };

  return (
    <div>
      <WalletMultiButton />
      <button onClick={callProgram}>Increment</button>
    </div>
  );
}
\`\`\`

## Monitoring Account Changes

Subscribe to real-time account updates:

\`\`\`typescript
connection.onAccountChange(
  counterPublicKey,
  (accountInfo) => {
    const decoded = program.coder.accounts.decode(
      "Counter",
      accountInfo.data
    );
    setCount(decoded.count.toNumber());
  }
);
\`\`\`

## Full Development Cycle

\`\`\`
1. anchor build        → Compile program
2. anchor test         → Run integration tests
3. anchor deploy       → Deploy to localnet/devnet
4. npm run dev         → Start frontend
5. Connect wallet      → Interact via browser
\`\`\``,
                },
              ],
            },
          },
          {
            title: 'Secure Coding',
            sortOrder: 1,
            lessons: {
              create: [
                {
                  title: 'Authority & Type Verification',
                  slug: 'authority-verification',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 25,
                  xpReward: 25,
                  content: `# Authority & Type Verification

On-chain programs are public — anyone can call any instruction. Security is critical.

## Vulnerability: Missing Authority Check

\`\`\`rust
// VULNERABLE — anyone can call this!
pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    // No check that signer == vault.authority
    transfer_tokens(ctx, amount)?;
    Ok(())
}
\`\`\`

## Fix: Use has_one Constraint

\`\`\`rust
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, has_one = authority)]  // Checks vault.authority == authority.key()
    pub vault: Account<'info, Vault>,
    pub authority: Signer<'info>,         // Must sign AND match vault.authority
}
\`\`\`

## Vulnerability: Type Confusion

Using \`UncheckedAccount\` without validation lets attackers pass any account:

\`\`\`rust
// VULNERABLE — no type check!
pub user_data: AccountInfo<'info>,
\`\`\`

## Fix: Use Typed Accounts

\`\`\`rust
// SAFE — Anchor validates discriminator, owner, and type
pub user_data: Account<'info, UserData>,
\`\`\`

If you must use \`UncheckedAccount\`, manually verify:
1. **Owner** — \`account.owner == ctx.program_id\`
2. **Discriminator** — First 8 bytes match expected hash
3. **Data** — Deserializes correctly

## Discriminator Details

Anchor computes discriminators as:
\`\`\`
SHA-256("account:StructName")[0..8]
\`\`\`

This prevents passing a \`Vault\` account where a \`Counter\` is expected.`,
                },
                {
                  title: 'Common Vulnerabilities',
                  slug: 'common-vulnerabilities',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 25,
                  xpReward: 25,
                  content: `# Common Vulnerabilities

## 1. Re-Initialization Attack

If you use a manual init check instead of Anchor's \`init\` constraint, attackers can re-initialize an account and overwrite the authority:

\`\`\`rust
// VULNERABLE — can be called multiple times
pub fn initialize(ctx: Context<Init>) -> Result<()> {
    let data = &mut ctx.accounts.data;
    data.authority = ctx.accounts.signer.key();
    Ok(())
}
\`\`\`

**Fix:** Always use \`#[account(init)]\` which checks the account is uninitialized.

## 2. Account Reload After CPI

\`\`\`rust
// VULNERABLE — stale data after CPI
token::transfer(cpi_ctx, amount)?;
let balance = ctx.accounts.vault_token.amount;  // STALE!

// FIX
token::transfer(cpi_ctx, amount)?;
ctx.accounts.vault_token.reload()?;
let balance = ctx.accounts.vault_token.amount;  // Fresh!
\`\`\`

## 3. PDA Seed Collision

Different data types must use different seed prefixes:

\`\`\`rust
// VULNERABLE — same seeds for different types!
seeds = [user.key().as_ref()]  // Used for both Vault and Profile?

// FIX — unique prefixes
seeds = [b"vault", user.key().as_ref()]
seeds = [b"profile", user.key().as_ref()]
\`\`\`

## 4. remaining_accounts Misuse

When using \`ctx.remaining_accounts\`, always validate:

\`\`\`rust
// DANGEROUS — no validation
let extra = &ctx.remaining_accounts[0];

// SAFE — manual checks
let extra = &ctx.remaining_accounts[0];
require!(extra.owner == ctx.program_id, ErrorCode::InvalidOwner);
let data = MyType::try_deserialize(&mut &extra.data.borrow()[..])?;
\`\`\``,
                },
                {
                  title: 'Security Audit Challenge',
                  slug: 'security-audit',
                  type: 'CHALLENGE',
                  sortOrder: 2,
                  duration: 30,
                  xpReward: 100,
                  content: `# Security Audit Challenge

Find and fix the security vulnerabilities in this program.

## Objectives

1. Identify the missing authority check
2. Fix the re-initialization vulnerability
3. Add proper PDA seed prefixes`,
                  starterCode: `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod vulnerable {
    use super::*;

    // BUG 1: Can be re-initialized
    pub fn initialize(ctx: Context<Init>, admin: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = admin;
        config.value = 0;
        Ok(())
    }

    // BUG 2: Missing authority check
    pub fn set_value(ctx: Context<SetValue>, new_value: u64) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.value = new_value;
        Ok(())
    }
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub value: u64,
}

#[derive(Accounts)]
pub struct Init<'info> {
    // BUG 1: No init constraint
    #[account(mut)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetValue<'info> {
    // BUG 2: No has_one constraint
    #[account(mut)]
    pub config: Account<'info, Config>,
    pub signer: Signer<'info>,
}`,
                  solutionCode: `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod vulnerable {
    use super::*;

    pub fn initialize(ctx: Context<Init>, admin: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = admin;
        config.value = 0;
        Ok(())
    }

    pub fn set_value(ctx: Context<SetValue>, new_value: u64) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.value = new_value;
        Ok(())
    }
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub value: u64,
}

#[derive(Accounts)]
pub struct Init<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 8,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetValue<'info> {
    #[account(mut, has_one = admin)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}`,
                  testCases: [
                    { input: '', expectedOutput: 'Init fixed', description: 'Uses init constraint with PDA' },
                    { input: '', expectedOutput: 'Auth fixed', description: 'SetValue checks has_one = admin' },
                  ],
                  hints: [
                    'Add init, payer, space, seeds, and bump to the config in Init',
                    'Rename signer to admin and add has_one = admin to config in SetValue',
                    'Use seeds = [b"config"] for the PDA',
                  ],
                  challengeLanguage: 'rust',
                },
              ],
            },
          },
          {
            title: 'Deployment & Operations',
            sortOrder: 2,
            lessons: {
              create: [
                {
                  title: 'CI/CD & Verifiable Builds',
                  slug: 'cicd-verifiable',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 20,
                  xpReward: 25,
                  content: `# CI/CD & Verifiable Builds

## GitHub Actions for Anchor

\`\`\`yaml
name: Anchor Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: coral-xyz/setup-anchor@v3
      - run: anchor test
\`\`\`

## Verifiable Builds

Ensures the on-chain binary matches the source code:

\`\`\`bash
anchor build --verifiable
# Produces a deterministic build using Docker
# Anyone can verify the deployed program matches the repo
\`\`\`

## Multisig Governance (Squads)

For production programs, transfer upgrade authority to a multisig:

1. **No single point of failure** — Multiple signatures required
2. **Audit trail** — All upgrades are recorded
3. **Time locks** — Optional delay before upgrades take effect

## Upgrade Strategies

| Scenario | Strategy |
|----------|----------|
| Bug fix (logic only) | Direct upgrade, same account struct |
| New feature (new fields) | Append fields, use \`realloc\` |
| Breaking change | Deploy new program, migrate users |
| Emergency halt | Feature flag in Config account |`,
                },
                {
                  title: 'Monitoring & SLA',
                  slug: 'monitoring-sla',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 20,
                  xpReward: 25,
                  content: `# Monitoring & SLA

## The Web3 SLA Model

Abandon traditional Web2 SLA guarantees. Adopt a **shared responsibility model**:

| Layer | Target | Control |
|-------|--------|---------|
| Your frontend/API | 99.9% | Full control |
| RPC provider | 99.9% | Provider SLA |
| Solana Mainnet | Best effort | No control |

## RPC Redundancy

Never depend on a single RPC provider:

\`\`\`
Primary: Helius → Fallback: QuickNode → Emergency: Public RPC
\`\`\`

Auto-failover on:
- Timeout > 1 second
- HTTP 429 (rate limited)
- HTTP 5xx errors

## Transaction Lifecycle Monitoring

**Never update UI optimistically.** Show explicit status:

\`\`\`
Sent → Confirming → Confirmed → Finalized
\`\`\`

- Use WebSocket for real-time monitoring
- Set 60-second expiration timeout
- Don't update UI until \`confirmed\` status

## Key Metrics

| Metric | Warning | Critical |
|--------|---------|----------|
| RPC latency | > 500ms | > 1000ms |
| Slot lag | > 50 slots | > 100 slots |
| TX confirmation | > 5s | > 30s |
| CU consumption | > 80% limit | > 95% limit |

## Failure Handling Protocol

1. **Detect** — Circuit breaker on RPC failures
2. **Pause** — Disable writes via feature flag
3. **Queue** — Limited retries, discard after threshold (prevent RPC cost explosion)
4. **Recover** — Wait 30-60 min after Mainnet restart before re-enabling writes`,
                },
                {
                  title: 'Course Final: Architecture Review',
                  slug: 'architecture-review',
                  type: 'CONTENT',
                  sortOrder: 2,
                  duration: 15,
                  xpReward: 50,
                  content: `# Course Final: Architecture Review

Congratulations on completing the Production Solana Development course!

## What You've Mastered

### Testing
- Integration tests with Mocha/Chai and Anchor
- Happy path, edge cases, and error condition testing
- Verifying on-chain state after operations

### Frontend
- Solana Wallet Adapter for React
- Connecting wallets, signing transactions
- Real-time account monitoring

### Security
- Authority verification with \`has_one\`
- Type safety with \`Account<'info, T>\`
- Preventing re-initialization, seed collision, and stale data
- Manual validation for \`remaining_accounts\`

### Deployment
- CI/CD with GitHub Actions
- Verifiable builds for trust
- Multisig governance with Squads
- Safe upgrade strategies

### Operations
- RPC redundancy and failover
- Transaction lifecycle monitoring
- Dynamic priority fees
- Failure handling protocols

## The Full Development Cycle

\`\`\`
Design → Code → Test (Local) → Deploy (Devnet)
  → Security Audit → Verifiable Build
  → Multisig Deploy (Mainnet)
  → Monitor → Iterate
\`\`\`

You're now equipped to build, secure, deploy, and operate production Solana applications. Keep building!`,
                },
              ],
            },
          },
        ],
      },
    },
  });

  console.log(`Seeded courses:`);
  console.log(`  - ${course1.title} (${course1.slug})`);
  console.log(`  - ${course2.title} (${course2.slug})`);
  console.log(`  - ${course3.title} (${course3.slug})`);
  console.log(`  - ${course4.title} (${course4.slug})`);
  console.log(`  - ${course5.title} (${course5.slug})`);

  const lessonCount = await prisma.lesson.count();
  console.log(`Total lessons: ${lessonCount}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Seeding complete!');
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
