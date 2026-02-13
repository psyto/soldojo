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
  // Course 1: Solana 101 — BEGINNER, 3 modules, 10 lessons
  // =============================================
  const solana101 = await prisma.course.create({
    data: {
      slug: 'solana-101',
      title: 'Solana 101: Blockchain Fundamentals',
      description:
        'Learn the core concepts of Solana: accounts, transactions, programs, and the runtime model.',
      difficulty: 'BEGINNER',
      duration: 180,
      xpReward: 500,
      track: 'solana-fundamentals',
      tags: ['solana', 'blockchain', 'fundamentals'],
      isPublished: true,
      sortOrder: 1,
      instructorName: 'Superteam Brazil',
      modules: {
        create: [
          {
            title: 'Introduction to Solana',
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

Solana is a high-performance blockchain platform designed for decentralized applications and crypto-currencies. It can process thousands of transactions per second with sub-second finality.

## Key Features

- **Proof of History (PoH)** — A clock before consensus
- **Tower BFT** — A PoH-optimized version of PBFT
- **Gulf Stream** — Mempool-less transaction forwarding
- **Turbine** — Block propagation protocol
- **Sealevel** — Parallel smart contract runtime

## Why Solana?

Solana solves the blockchain trilemma by achieving **speed**, **security**, and **decentralization** simultaneously. With block times of ~400ms and transaction costs under $0.01, it's ideal for consumer-facing applications.

## Architecture Overview

Unlike Ethereum's account-based model, Solana uses a unique **account model** where everything is an account — programs, data, tokens, and SOL balances.

\`\`\`
┌─────────────┐
│   Accounts   │ ← Everything is an account
├─────────────┤
│   Programs   │ ← Stateless executable code
├─────────────┤
│ Transactions │ ← Instructions to programs
├─────────────┤
│   Runtime    │ ← Sealevel parallel execution
└─────────────┘
\`\`\`

In the next lessons, we'll dive deep into each of these concepts.`,
                },
                {
                  title: 'Solana vs Other Blockchains',
                  slug: 'solana-comparison',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 15,
                  xpReward: 25,
                  content: `# Solana vs Other Blockchains

## Performance Comparison

| Feature | Solana | Ethereum | Bitcoin |
|---------|--------|----------|---------|
| TPS | ~65,000 | ~15 | ~7 |
| Block Time | ~400ms | ~12s | ~10min |
| Tx Cost | <$0.01 | $1-50 | $1-30 |
| Consensus | PoH + PoS | PoS | PoW |

## Key Differences

### Account Model
Solana uses a flat account model. Every piece of data lives in an **account** with a known address. Programs are stateless — they read from and write to accounts.

### Parallel Execution
Solana's Sealevel runtime can execute transactions in parallel when they don't touch the same accounts.

### Rent
Accounts must maintain a minimum SOL balance (rent exemption) to persist on-chain. This prevents state bloat.`,
                },
                {
                  title: 'Setting Up Your Environment',
                  slug: 'setup-environment',
                  type: 'CHALLENGE',
                  sortOrder: 2,
                  duration: 20,
                  xpReward: 50,
                  content: `# Setting Up Your Environment

In this challenge, you'll configure a connection to the Solana devnet and verify it works.

## Objectives

1. Import the \`Connection\` class from \`@solana/web3.js\`
2. Create a connection to devnet
3. Fetch and return the current slot number

## Key Concepts

- **Connection** — The main class for interacting with a Solana cluster
- **Cluster** — A set of validators (mainnet-beta, devnet, testnet)
- **Slot** — A period of time for which a leader ingests transactions`,
                  starterCode: `import { Connection, clusterApiUrl } from "@solana/web3.js";

export async function getSlot(): Promise<number> {
  // TODO: Create a connection to devnet
  // TODO: Get and return the current slot
  return 0;
}`,
                  solutionCode: `import { Connection, clusterApiUrl } from "@solana/web3.js";

export async function getSlot(): Promise<number> {
  const connection = new Connection(clusterApiUrl("devnet"));
  const slot = await connection.getSlot();
  return slot;
}`,
                  testCases: [
                    { input: '', expectedOutput: 'Connection created', description: 'Creates a Connection to devnet' },
                    { input: '', expectedOutput: 'Slot returned', description: 'Returns the current slot number' },
                  ],
                  hints: [
                    'Use clusterApiUrl("devnet") to get the devnet URL',
                    'Pass the URL to new Connection()',
                    'Call connection.getSlot() to get the current slot',
                  ],
                  challengeLanguage: 'typescript',
                },
              ],
            },
          },
          {
            title: 'Accounts & Data',
            sortOrder: 1,
            lessons: {
              create: [
                {
                  title: 'The Account Model',
                  slug: 'account-model',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 20,
                  xpReward: 25,
                  content: `# The Account Model

Everything on Solana is an account. Accounts are the fundamental building block.

## Account Structure

Every account has:
- **Public Key** — 32-byte address
- **Lamports** — SOL balance (1 SOL = 1 billion lamports)
- **Owner** — The program that owns this account
- **Data** — Arbitrary byte array
- **Executable** — Whether this account contains a program

\`\`\`typescript
interface AccountInfo {
  lamports: number;
  owner: PublicKey;
  data: Buffer;
  executable: boolean;
  rentEpoch: number;
}
\`\`\`

## Account Ownership

Only the **owner program** can modify an account's data. The System Program owns all wallet accounts. When you deploy a program, the BPF Loader becomes the owner.

## Rent

Accounts must maintain a minimum balance to be rent-exempt. This is approximately 0.00089 SOL per byte of data.`,
                },
                {
                  title: 'Program Derived Addresses (PDAs)',
                  slug: 'pdas',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 20,
                  xpReward: 25,
                  content: `# Program Derived Addresses (PDAs)

PDAs are deterministic addresses that don't have a corresponding private key. They're derived from a program ID and a set of seeds.

## Why PDAs?

- Programs can **sign** for PDAs they own
- Addresses are **deterministic** — same seeds always give the same address
- No private key exists — only the program can authorize changes

## Deriving a PDA

\`\`\`typescript
const [pda, bump] = PublicKey.findProgramAddressSync(
  [Buffer.from("seed"), userPubkey.toBuffer()],
  programId
);
\`\`\`

The \`bump\` is a value (0-255) that ensures the derived address falls off the ed25519 curve (making it a valid PDA with no private key).

## Common Patterns

- **Config accounts** — \`[Buffer.from("config")]\`
- **User data** — \`[Buffer.from("user"), userPubkey.toBuffer()]\`
- **Token vaults** — \`[Buffer.from("vault"), mintPubkey.toBuffer()]\``,
                },
                {
                  title: 'Reading Account Data',
                  slug: 'reading-accounts',
                  type: 'CHALLENGE',
                  sortOrder: 2,
                  duration: 25,
                  xpReward: 50,
                  content: `# Reading Account Data

In this challenge, you'll read data from a Solana account and parse the balance.

## Objectives

1. Connect to devnet
2. Create a PublicKey from a string
3. Fetch the account info
4. Return the balance in SOL`,
                  starterCode: `import { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";

export async function getBalance(address: string): Promise<number> {
  // TODO: Create connection to devnet
  // TODO: Create PublicKey from address string
  // TODO: Get balance and convert to SOL
  return 0;
}`,
                  solutionCode: `import { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";

export async function getBalance(address: string): Promise<number> {
  const connection = new Connection(clusterApiUrl("devnet"));
  const publicKey = new PublicKey(address);
  const balance = await connection.getBalance(publicKey);
  return balance / LAMPORTS_PER_SOL;
}`,
                  testCases: [
                    { input: '', expectedOutput: 'PublicKey created', description: 'Creates PublicKey from string' },
                    { input: '', expectedOutput: 'Balance fetched', description: 'Fetches balance and converts to SOL' },
                  ],
                  hints: [
                    'Use new PublicKey(address) to create a PublicKey',
                    'Use connection.getBalance(publicKey) to get lamports',
                    'Divide by LAMPORTS_PER_SOL to convert to SOL',
                  ],
                  challengeLanguage: 'typescript',
                },
              ],
            },
          },
          {
            title: 'Transactions & Instructions',
            sortOrder: 2,
            lessons: {
              create: [
                {
                  title: 'Transaction Anatomy',
                  slug: 'transaction-anatomy',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 20,
                  xpReward: 25,
                  content: `# Transaction Anatomy

A Solana transaction consists of one or more **instructions**, each calling a specific program.

## Transaction Structure

\`\`\`typescript
const transaction = new Transaction().add(
  instruction1,
  instruction2  // Multiple instructions = atomic batch
);
\`\`\`

## Instruction Components

Each instruction specifies:
- **Program ID** — Which program to call
- **Accounts** — Accounts the instruction reads/writes
- **Data** — Serialized instruction data

## Signatures

Every transaction requires at least one signature (the fee payer). Additional signatures are needed for accounts marked as \`isSigner\`.

## Fees

Transaction fees on Solana are ~0.000005 SOL (~$0.001). Fees go to validators.`,
                },
                {
                  title: 'Sending SOL',
                  slug: 'sending-sol',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 15,
                  xpReward: 25,
                  content: `# Sending SOL

The System Program handles SOL transfers. Let's learn how to create and send a transfer transaction.

## Transfer Instruction

\`\`\`typescript
import {
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const transaction = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: sender.publicKey,
    toPubkey: recipient,
    lamports: 0.1 * LAMPORTS_PER_SOL,
  })
);

const signature = await sendAndConfirmTransaction(
  connection,
  transaction,
  [sender]  // Signers array
);
\`\`\`

## Confirmation Levels

- **processed** — Transaction executed (may be rolled back)
- **confirmed** — Supermajority of validators confirmed
- **finalized** — ~32 slots deep, irreversible`,
                },
                {
                  title: 'Build a Transfer',
                  slug: 'build-transfer',
                  type: 'CHALLENGE',
                  sortOrder: 2,
                  duration: 25,
                  xpReward: 50,
                  content: `# Build a Transfer

Create a function that builds a SOL transfer transaction.

## Objectives

1. Create a Transaction
2. Add a SystemProgram.transfer instruction
3. Return the transaction (don't send it)`,
                  starterCode: `import { Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

export function buildTransfer(
  from: PublicKey,
  to: PublicKey,
  amountSol: number
): Transaction {
  // TODO: Create transaction with transfer instruction
  return new Transaction();
}`,
                  solutionCode: `import { Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

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
                    { input: '', expectedOutput: 'Transaction created', description: 'Creates a Transaction with transfer' },
                    { input: '', expectedOutput: 'Amount converted', description: 'Converts SOL to lamports correctly' },
                  ],
                  hints: [
                    'Use new Transaction().add(...) to create with instructions',
                    'SystemProgram.transfer needs fromPubkey, toPubkey, lamports',
                    'Multiply amountSol by LAMPORTS_PER_SOL',
                  ],
                  challengeLanguage: 'typescript',
                },
                {
                  title: 'Course Recap & Next Steps',
                  slug: 'recap',
                  type: 'CONTENT',
                  sortOrder: 3,
                  duration: 10,
                  xpReward: 25,
                  content: `# Course Recap

Congratulations on completing Solana 101! Here's what you've learned:

## Key Takeaways

1. **Solana's Architecture** — PoH, Sealevel, Gulf Stream
2. **Account Model** — Everything is an account with owner, data, lamports
3. **PDAs** — Deterministic addresses without private keys
4. **Transactions** — Atomic bundles of instructions
5. **Transfers** — Using SystemProgram to move SOL

## Next Steps

- **Rust for Solana Developers** — Learn the language for on-chain programs
- **Building with Anchor Framework** — Build production programs
- Practice on **Solana Playground** (beta.solpg.io)

Keep building!`,
                },
              ],
            },
          },
        ],
      },
    },
  });

  // =============================================
  // Course 2: Rust for Solana — BEGINNER, 4 modules, 16 lessons
  // =============================================
  const rustForSolana = await prisma.course.create({
    data: {
      slug: 'rust-for-solana',
      title: 'Rust for Solana Developers',
      description:
        'Master the Rust programming language specifically tailored for Solana program development.',
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

Rust is Solana's primary language for on-chain programs. Here's why:

## Safety

Rust's ownership model prevents common bugs:
- No null pointer dereferences
- No data races
- No buffer overflows
- Memory safety without garbage collection

## Performance

Rust compiles to native code with zero-cost abstractions. On-chain programs must be efficient — every computation costs.

## Ecosystem

The Solana ecosystem is built on Rust:
- \`solana-program\` crate for native programs
- \`anchor-lang\` for the Anchor framework
- \`spl-token\` for token operations`,
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
let s = String::from("hello");  // Owned string
let slice: &str = "hello";      // String slice (reference)
\`\`\`

## Important for Solana

On-chain, prefer \`u64\` for amounts (lamports). Use fixed-size types to keep account data predictable.`,
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
    a + b  // No semicolon = return value
}

fn greet(name: &str) {
    println!("Hello, {}!", name);
}
\`\`\`

## If / Else

\`\`\`rust
let level = if xp >= 1000 { "advanced" } else { "beginner" };
\`\`\`

## Match

\`\`\`rust
match difficulty {
    "easy" => 10,
    "medium" => 25,
    "hard" => 50,
    _ => 0,  // Default case
}
\`\`\`

## Loops

\`\`\`rust
for i in 0..10 {
    println!("{}", i);
}

while condition {
    // ...
}
\`\`\``,
                },
                {
                  title: 'Rust Basics Quiz',
                  slug: 'basics-quiz',
                  type: 'CHALLENGE',
                  sortOrder: 3,
                  duration: 20,
                  xpReward: 50,
                  content: `# Rust Basics Challenge

Write a function that calculates the level from XP points.

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
                    'Divide by 100.0 first, then sqrt()',
                    'Use .floor() then cast to u32',
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

Rust's ownership system is its most distinctive feature. Three rules:

1. Each value has exactly **one owner**
2. When the owner goes out of scope, the value is **dropped**
3. Ownership can be **transferred** (moved)

## Move Semantics

\`\`\`rust
let s1 = String::from("hello");
let s2 = s1;  // s1 is moved to s2
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

Simple types implement \`Copy\` — they're copied, not moved:
- Integers, floats, booleans
- Characters
- Tuples of Copy types`,
                },
                {
                  title: 'References & Borrowing',
                  slug: 'references',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 25,
                  xpReward: 25,
                  content: `# References & Borrowing

Instead of moving ownership, you can **borrow** a value with references.

## Immutable References

\`\`\`rust
fn calculate_length(s: &String) -> usize {
    s.len()  // Can read but not modify
}

let s = String::from("hello");
let len = calculate_length(&s);
println!("{} has length {}", s, len);  // s still valid
\`\`\`

## Mutable References

\`\`\`rust
fn push_world(s: &mut String) {
    s.push_str(", world!");
}

let mut s = String::from("hello");
push_world(&mut s);
\`\`\`

## Rules

1. You can have **many immutable** references OR **one mutable** reference
2. References must always be **valid** (no dangling pointers)

## Why This Matters for Solana

Account data in Solana programs uses \`&mut\` references. Understanding borrowing is essential for modifying account state safely.`,
                },
                {
                  title: 'Lifetimes',
                  slug: 'lifetimes',
                  type: 'CONTENT',
                  sortOrder: 2,
                  duration: 20,
                  xpReward: 25,
                  content: `# Lifetimes

Lifetimes ensure references don't outlive the data they point to.

## The Problem

\`\`\`rust
// This won't compile — dangling reference
fn dangle() -> &String {
    let s = String::from("hello");
    &s  // s is dropped, reference is invalid
}
\`\`\`

## Lifetime Annotations

\`\`\`rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
\`\`\`

## In Solana / Anchor

You'll see lifetimes in Anchor's \`Accounts\` structs:

\`\`\`rust
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 8)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}
\`\`\`

The \`'info\` lifetime ties all account references to the same transaction context.`,
                },
                {
                  title: 'Ownership Challenge',
                  slug: 'ownership-challenge',
                  type: 'CHALLENGE',
                  sortOrder: 3,
                  duration: 25,
                  xpReward: 75,
                  content: `# Ownership Challenge

Fix the borrowing issues in the code to make it compile and work correctly.

## Objectives

1. Fix the \`process_name\` function to borrow instead of taking ownership
2. Fix the \`update_balance\` function to use a mutable reference
3. Ensure both values are usable after function calls`,
                  starterCode: `pub struct Account {
    pub name: String,
    pub balance: u64,
}

// TODO: Fix this function — it should borrow, not take ownership
pub fn process_name(name: String) -> usize {
    name.len()
}

// TODO: Fix this function — it should mutably borrow
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
                    'Change String to &str for borrowing',
                    'Add &mut before Account parameter',
                    'The caller will use &name and &mut account',
                  ],
                  challengeLanguage: 'rust',
                },
              ],
            },
          },
          {
            title: 'Structs & Enums',
            sortOrder: 2,
            lessons: {
              create: [
                {
                  title: 'Defining Structs',
                  slug: 'structs',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 20,
                  xpReward: 25,
                  content: `# Defining Structs

Structs are the foundation of Solana account data.

## Basic Struct

\`\`\`rust
pub struct Counter {
    pub count: u64,
    pub authority: Pubkey,
    pub bump: u8,
}
\`\`\`

## Impl Blocks

\`\`\`rust
impl Counter {
    pub fn increment(&mut self) {
        self.count += 1;
    }

    pub fn space() -> usize {
        8 +  // discriminator
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
\`\`\``,
                },
                {
                  title: 'Enums & Pattern Matching',
                  slug: 'enums',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 20,
                  xpReward: 25,
                  content: `# Enums & Pattern Matching

## Defining Enums

\`\`\`rust
pub enum OrderStatus {
    Open,
    Filled { price: u64 },
    Cancelled,
}
\`\`\`

## Pattern Matching

\`\`\`rust
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
    let value = might_fail()?;  // Returns error if Err
    Ok(())
}
\`\`\``,
                },
                {
                  title: 'Traits',
                  slug: 'traits',
                  type: 'CONTENT',
                  sortOrder: 2,
                  duration: 20,
                  xpReward: 25,
                  content: `# Traits

Traits define shared behavior — similar to interfaces in other languages.

## Defining a Trait

\`\`\`rust
pub trait Stakeable {
    fn stake(&mut self, amount: u64) -> Result<(), String>;
    fn unstake(&mut self, amount: u64) -> Result<(), String>;
    fn rewards(&self) -> u64;
}
\`\`\`

## Implementing a Trait

\`\`\`rust
pub struct Pool {
    pub staked: u64,
    pub reward_rate: u64,
}

impl Stakeable for Pool {
    fn stake(&mut self, amount: u64) -> Result<(), String> {
        self.staked += amount;
        Ok(())
    }

    fn unstake(&mut self, amount: u64) -> Result<(), String> {
        if amount > self.staked {
            return Err("Insufficient stake".to_string());
        }
        self.staked -= amount;
        Ok(())
    }

    fn rewards(&self) -> u64 {
        self.staked * self.reward_rate / 100
    }
}
\`\`\`

## Common Solana Traits

- \`BorshSerialize\` / \`BorshDeserialize\` — For account data serialization
- \`AnchorSerialize\` / \`AnchorDeserialize\` — Anchor's serialization
- \`AccountSerialize\` / \`AccountDeserialize\` — Account data handling`,
                },
                {
                  title: 'Struct Challenge',
                  slug: 'struct-challenge',
                  type: 'CHALLENGE',
                  sortOrder: 3,
                  duration: 25,
                  xpReward: 75,
                  content: `# Struct Challenge

Create a \`Vault\` struct for a simple DeFi vault.

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
                    'Use pub struct Vault with three fields',
                    'deposit just adds to self.balance',
                    'withdraw should check is_locked first, then balance',
                  ],
                  challengeLanguage: 'rust',
                },
              ],
            },
          },
          {
            title: 'Error Handling & Collections',
            sortOrder: 3,
            lessons: {
              create: [
                {
                  title: 'Error Handling in Rust',
                  slug: 'error-handling',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 20,
                  xpReward: 25,
                  content: `# Error Handling in Rust

Rust doesn't have exceptions. Instead, it uses \`Result\` and \`Option\` types.

## Custom Errors

\`\`\`rust
#[derive(Debug)]
pub enum AppError {
    NotFound,
    Unauthorized,
    InsufficientFunds { required: u64, available: u64 },
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            AppError::NotFound => write!(f, "Not found"),
            AppError::Unauthorized => write!(f, "Unauthorized"),
            AppError::InsufficientFunds { required, available } =>
                write!(f, "Need {} but only have {}", required, available),
        }
    }
}
\`\`\`

## In Anchor Programs

\`\`\`rust
#[error_code]
pub enum ErrorCode {
    #[msg("You are not authorized")]
    Unauthorized,
    #[msg("Insufficient funds")]
    InsufficientFunds,
}

// Usage:
require!(ctx.accounts.authority.key() == expected, ErrorCode::Unauthorized);
\`\`\``,
                },
                {
                  title: 'Vectors & HashMaps',
                  slug: 'collections',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 20,
                  xpReward: 25,
                  content: `# Vectors & HashMaps

## Vectors

\`\`\`rust
let mut scores: Vec<u64> = Vec::new();
scores.push(100);
scores.push(200);

let first = scores[0];  // Access by index
let maybe = scores.get(5);  // Returns Option<&u64>

for score in &scores {
    println!("{}", score);
}
\`\`\`

## HashMaps

\`\`\`rust
use std::collections::HashMap;

let mut balances: HashMap<String, u64> = HashMap::new();
balances.insert("Alice".to_string(), 1000);
balances.insert("Bob".to_string(), 500);

if let Some(balance) = balances.get("Alice") {
    println!("Alice has {}", balance);
}
\`\`\`

## Iterators

\`\`\`rust
let total: u64 = scores.iter().sum();
let doubled: Vec<u64> = scores.iter().map(|s| s * 2).collect();
let high: Vec<&u64> = scores.iter().filter(|s| **s > 150).collect();
\`\`\`

## On-Chain Note

Vectors are used in Solana for variable-length account data. Be careful with sizes — account space must be allocated upfront.`,
                },
                {
                  title: 'Iterators & Closures',
                  slug: 'iterators',
                  type: 'CONTENT',
                  sortOrder: 2,
                  duration: 20,
                  xpReward: 25,
                  content: `# Iterators & Closures

## Closures

\`\`\`rust
let add = |a: u64, b: u64| -> u64 { a + b };
let result = add(5, 3);  // 8

// Closures can capture environment
let threshold = 100;
let is_high = |xp: u64| xp > threshold;
\`\`\`

## Iterator Methods

\`\`\`rust
let numbers = vec![1, 2, 3, 4, 5];

// map + collect
let squares: Vec<u64> = numbers.iter().map(|n| n * n).collect();

// filter
let evens: Vec<&u64> = numbers.iter().filter(|n| *n % 2 == 0).collect();

// fold (reduce)
let sum = numbers.iter().fold(0, |acc, n| acc + n);

// find
let first_even = numbers.iter().find(|n| *n % 2 == 0);

// any / all
let has_zero = numbers.iter().any(|n| *n == 0);
let all_positive = numbers.iter().all(|n| *n > 0);
\`\`\`

These patterns are very common in Solana programs for processing account arrays and instruction data.`,
                },
                {
                  title: 'Course Recap',
                  slug: 'rust-recap',
                  type: 'CONTENT',
                  sortOrder: 3,
                  duration: 10,
                  xpReward: 25,
                  content: `# Rust for Solana — Recap

You now have the Rust foundation needed for Solana development!

## What You Learned

1. **Variables & Types** — Immutability, numeric types, strings
2. **Ownership & Borrowing** — Rust's killer feature for memory safety
3. **Structs & Enums** — Building data structures and patterns
4. **Traits** — Shared behavior and interfaces
5. **Error Handling** — Result, Option, custom errors
6. **Collections** — Vec, HashMap, iterators

## Ready for Anchor

With these fundamentals, you're ready to build Solana programs using the Anchor framework. In the next course, you'll apply everything you've learned to build real on-chain programs.

Keep practicing and building!`,
                },
              ],
            },
          },
        ],
      },
    },
  });

  // =============================================
  // Course 3: Anchor Framework — INTERMEDIATE, 4 modules, 12 lessons
  // =============================================
  const anchorFramework = await prisma.course.create({
    data: {
      slug: 'anchor-framework',
      title: 'Building with Anchor Framework',
      description:
        'Build production-ready Solana programs using the Anchor framework. Learn macros, account validation, Cross-Program Invocations (CPIs), and comprehensive testing strategies.',
      difficulty: 'INTERMEDIATE',
      duration: 480,
      xpReward: 1500,
      track: 'rust-anchor',
      tags: ['anchor', 'rust', 'smart-contracts'],
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

Anchor is a framework for Solana's Sealevel runtime that provides several developer conveniences.

## Why Anchor?

Writing raw Solana programs requires:
- Manual account deserialization
- Manual instruction data parsing
- Manual security checks
- Lots of boilerplate

Anchor solves all of this with macros and conventions.

## Key Features

- **\`#[program]\`** — Defines your program's instruction handlers
- **\`#[derive(Accounts)]\`** — Declarative account validation
- **\`#[account]\`** — Automatic (de)serialization of account data
- **Built-in security checks** — Signer validation, ownership checks
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
\`\`\``,
                },
                {
                  title: 'Project Setup & Architecture',
                  slug: 'project-setup',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 20,
                  xpReward: 25,
                  content: `# Project Setup & Architecture

## Installing Anchor

\`\`\`bash
# Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install latest
avm use latest

# Create new project
anchor init my-project
cd my-project
\`\`\`

## Project Structure

\`\`\`
my-project/
├── Anchor.toml       # Project config
├── Cargo.toml        # Rust dependencies
├── programs/
│   └── my-program/
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs   # Your program
├── tests/
│   └── my-program.ts   # TypeScript tests
├── app/                 # Frontend (optional)
└── migrations/
    └── deploy.ts
\`\`\`

## Anchor.toml

\`\`\`toml
[features]
seeds = false

[programs.devnet]
my_program = "YourProgramIdHere..."

[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"
\`\`\``,
                },
                {
                  title: 'Your First Anchor Program',
                  slug: 'first-program',
                  type: 'CHALLENGE',
                  sortOrder: 2,
                  duration: 30,
                  xpReward: 50,
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
                },
              ],
            },
          },
          {
            title: 'Account Validation & Constraints',
            sortOrder: 1,
            lessons: {
              create: [
                {
                  title: 'The Accounts Macro',
                  slug: 'accounts-macro',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 20,
                  xpReward: 25,
                  content: `# The Accounts Macro

The \`#[derive(Accounts)]\` macro is Anchor's declarative account validation system.

## How It Works

\`\`\`rust
#[derive(Accounts)]
pub struct CreatePost<'info> {
    #[account(
        init,
        payer = author,
        space = 8 + 32 + 280 + 8,
        seeds = [b"post", author.key().as_ref()],
        bump
    )]
    pub post: Account<'info, Post>,

    #[account(mut)]
    pub author: Signer<'info>,

    pub system_program: Program<'info, System>,
}
\`\`\`

## Account Types

| Type | Description |
|------|-------------|
| \`Account<'info, T>\` | Deserialized account of type T |
| \`Signer<'info>\` | Must be a transaction signer |
| \`Program<'info, T>\` | Validated program account |
| \`SystemAccount<'info>\` | System-owned account |
| \`UncheckedAccount<'info>\` | No validation (use with care) |

## Automatic Checks

Anchor automatically verifies:
- Account ownership (matches program ID)
- Account discriminator (matches expected type)
- Signer status
- Mutability`,
                },
                {
                  title: 'Account Constraints Deep Dive',
                  slug: 'constraints',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 25,
                  xpReward: 25,
                  content: `# Account Constraints Deep Dive

## Common Constraints

### init — Create new account
\`\`\`rust
#[account(init, payer = user, space = 8 + 32)]
pub data: Account<'info, MyData>,
\`\`\`

### mut — Mutable account
\`\`\`rust
#[account(mut)]
pub counter: Account<'info, Counter>,
\`\`\`

### seeds + bump — PDA validation
\`\`\`rust
#[account(
    seeds = [b"vault", user.key().as_ref()],
    bump
)]
pub vault: Account<'info, Vault>,
\`\`\`

### has_one — Relationship check
\`\`\`rust
#[account(has_one = authority)]
pub config: Account<'info, Config>,
// Ensures config.authority == authority.key()
\`\`\`

### constraint — Custom validation
\`\`\`rust
#[account(constraint = amount > 0 @ ErrorCode::InvalidAmount)]
pub token_account: Account<'info, TokenAccount>,
\`\`\`

### close — Close account and reclaim rent
\`\`\`rust
#[account(mut, close = destination)]
pub data: Account<'info, MyData>,
\`\`\``,
                },
                {
                  title: 'Custom Account Validation',
                  slug: 'custom-validation',
                  type: 'CHALLENGE',
                  sortOrder: 2,
                  duration: 35,
                  xpReward: 75,
                  content: `# Custom Account Validation

Create account validation structs for a simple blog program.

## Objectives

1. Define a \`Post\` account with author, title, and content fields
2. Create \`CreatePost\` accounts with PDA seeds and init constraint
3. Create \`UpdatePost\` accounts with has_one constraint for authorization`,
                  starterCode: `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod blog {
    use super::*;

    pub fn create_post(ctx: Context<CreatePost>, title: String, content: String) -> Result<()> {
        let post = &mut ctx.accounts.post;
        post.author = ctx.accounts.author.key();
        post.title = title;
        post.content = content;
        Ok(())
    }

    pub fn update_post(ctx: Context<UpdatePost>, title: String, content: String) -> Result<()> {
        let post = &mut ctx.accounts.post;
        post.title = title;
        post.content = content;
        Ok(())
    }
}

// TODO: Define Post account struct

// TODO: Define CreatePost accounts (use PDA with seeds [b"post", author])

// TODO: Define UpdatePost accounts (use has_one = author)`,
                  solutionCode: `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod blog {
    use super::*;

    pub fn create_post(ctx: Context<CreatePost>, title: String, content: String) -> Result<()> {
        let post = &mut ctx.accounts.post;
        post.author = ctx.accounts.author.key();
        post.title = title;
        post.content = content;
        Ok(())
    }

    pub fn update_post(ctx: Context<UpdatePost>, title: String, content: String) -> Result<()> {
        let post = &mut ctx.accounts.post;
        post.title = title;
        post.content = content;
        Ok(())
    }
}

#[account]
pub struct Post {
    pub author: Pubkey,
    pub title: String,
    pub content: String,
}

#[derive(Accounts)]
pub struct CreatePost<'info> {
    #[account(
        init,
        payer = author,
        space = 8 + 32 + 4 + 200 + 4 + 1000,
        seeds = [b"post", author.key().as_ref()],
        bump
    )]
    pub post: Account<'info, Post>,
    #[account(mut)]
    pub author: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePost<'info> {
    #[account(mut, has_one = author)]
    pub post: Account<'info, Post>,
    pub author: Signer<'info>,
}`,
                  testCases: [
                    { input: '', expectedOutput: 'Post defined', description: 'Post account with author, title, content' },
                    { input: '', expectedOutput: 'PDA seeds correct', description: 'CreatePost uses PDA seeds' },
                    { input: '', expectedOutput: 'Authorization check', description: 'UpdatePost uses has_one' },
                  ],
                  hints: [
                    'Post needs Pubkey (32), String (4 + len), String (4 + len)',
                    'Use seeds = [b"post", author.key().as_ref()] for PDA',
                    'has_one = author ensures post.author matches signer',
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

Cross-Program Invocations allow one program to call another program's instructions.

## Why CPIs?

- **Composability** — Programs can build on each other
- **Reuse** — Use existing programs (SPL Token, System Program)
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

## CPI Depth Limit

Solana allows up to **4 levels** of CPI depth. Your program counts as level 0.`,
                },
                {
                  title: 'CPI with PDAs',
                  slug: 'cpi-pdas',
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 25,
                  xpReward: 25,
                  content: `# CPI with PDAs

Programs can sign CPIs using PDAs they own.

## PDA Signing

\`\`\`rust
pub fn transfer_from_vault(ctx: Context<VaultTransfer>, amount: u64) -> Result<()> {
    let seeds = &[
        b"vault".as_ref(),
        &[ctx.accounts.vault.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token.to_account_info(),
        to: ctx.accounts.user_token.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,  // PDA signs the CPI
    );

    token::transfer(cpi_ctx, amount)?;
    Ok(())
}
\`\`\`

## Key Insight

\`CpiContext::new_with_signer\` lets the runtime verify that the PDA is derived from your program's ID with the given seeds. This is how programs "own" and control accounts without private keys.`,
                },
                {
                  title: 'Build a Token Vault',
                  slug: 'token-vault',
                  type: 'CHALLENGE',
                  sortOrder: 2,
                  duration: 45,
                  xpReward: 100,
                  content: `# Build a Token Vault

Create a simple vault program that can hold and release tokens.

## Objectives

1. Define a \`Vault\` account with authority and bump
2. Implement \`deposit\` instruction using CPI to transfer tokens in
3. Implement \`withdraw\` instruction using PDA-signed CPI to transfer tokens out`,
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
        // TODO: PDA-signed CPI transfer tokens from vault to user
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
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
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
                    { input: '', expectedOutput: 'Deposit CPI', description: 'Deposit uses CPI transfer' },
                    { input: '', expectedOutput: 'Withdraw PDA sign', description: 'Withdraw uses PDA-signed CPI' },
                  ],
                  hints: [
                    'Store ctx.bumps.vault in the vault account on init',
                    'Deposit: CpiContext::new for user-signed transfer',
                    'Withdraw: CpiContext::new_with_signer with vault seeds',
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
                  title: 'Testing with Bankrun',
                  slug: 'testing-bankrun',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 25,
                  xpReward: 25,
                  content: `# Testing with Bankrun

Bankrun provides a fast, lightweight Solana test environment.

## Setup

\`\`\`typescript
import { startAnchor } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";

const context = await startAnchor(".", [], []);
const provider = new BankrunProvider(context);
const program = new Program(IDL, provider);
\`\`\`

## Writing Tests

\`\`\`typescript
describe("counter", () => {
  it("initializes the counter", async () => {
    const counter = Keypair.generate();

    await program.methods
      .initialize()
      .accounts({ counter: counter.publicKey })
      .signers([counter])
      .rpc();

    const account = await program.account.counter.fetch(counter.publicKey);
    expect(account.count.toNumber()).toBe(0);
  });

  it("increments the counter", async () => {
    await program.methods
      .increment()
      .accounts({ counter: counter.publicKey })
      .rpc();

    const account = await program.account.counter.fetch(counter.publicKey);
    expect(account.count.toNumber()).toBe(1);
  });
});
\`\`\`

## Benefits over anchor test

- **10x faster** — No validator startup
- **Deterministic** — Same results every time
- **Time travel** — Warp slots and epochs`,
                },
                {
                  title: 'Integration Tests',
                  slug: 'integration-tests',
                  type: 'CHALLENGE',
                  sortOrder: 1,
                  duration: 40,
                  xpReward: 75,
                  content: `# Integration Tests Challenge

Write tests for the counter program.

## Objectives

1. Write a test that initializes a counter to 0
2. Write a test that increments the counter
3. Write a test that verifies the count after multiple increments`,
                  starterCode: `import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";

describe("counter", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // TODO: Get program reference

  it("initializes the counter", async () => {
    // TODO: Initialize counter and verify count is 0
  });

  it("increments the counter", async () => {
    // TODO: Increment and verify count is 1
  });

  it("increments multiple times", async () => {
    // TODO: Increment 3 more times and verify count is 4
  });
});`,
                  solutionCode: `import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { expect } from "chai";

describe("counter", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Counter as Program;
  const counter = Keypair.generate();

  it("initializes the counter", async () => {
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

  it("increments the counter", async () => {
    await program.methods
      .increment()
      .accounts({ counter: counter.publicKey })
      .rpc();

    const account = await program.account.counter.fetch(counter.publicKey);
    expect(account.count.toNumber()).to.equal(1);
  });

  it("increments multiple times", async () => {
    for (let i = 0; i < 3; i++) {
      await program.methods
        .increment()
        .accounts({ counter: counter.publicKey })
        .rpc();
    }

    const account = await program.account.counter.fetch(counter.publicKey);
    expect(account.count.toNumber()).to.equal(4);
  });
});`,
                  testCases: [
                    { input: '', expectedOutput: 'Init test', description: 'Test verifies counter initializes to 0' },
                    { input: '', expectedOutput: 'Increment test', description: 'Test verifies increment works' },
                    { input: '', expectedOutput: 'Multiple test', description: 'Test verifies multiple increments' },
                  ],
                  hints: [
                    'Use anchor.workspace.Counter to get program',
                    'Generate a Keypair for the counter account',
                    'Use program.methods.initialize().accounts({...}).signers([counter]).rpc()',
                  ],
                  challengeLanguage: 'typescript',
                },
              ],
            },
          },
          {
            title: 'Deployment & Best Practices',
            sortOrder: 4,
            lessons: {
              create: [
                {
                  title: 'Deploy to Devnet',
                  slug: 'deploy-devnet',
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 20,
                  xpReward: 50,
                  content: `# Deploy to Devnet

## Pre-deployment Checklist

1. All tests pass
2. Program ID is correct in \`declare_id!\` and \`Anchor.toml\`
3. Sufficient SOL for deployment (use devnet faucet)

## Deployment Steps

\`\`\`bash
# Configure for devnet
solana config set --url devnet

# Get devnet SOL
solana airdrop 2

# Build
anchor build

# Deploy
anchor deploy

# Verify
solana program show <PROGRAM_ID>
\`\`\`

## Program Upgrades

By default, Anchor programs are upgradeable:

\`\`\`bash
# Upgrade
anchor upgrade target/deploy/my_program.so --program-id <ID>

# Make immutable (irreversible!)
solana program set-upgrade-authority <ID> --final
\`\`\`

## Mainnet Deployment

For mainnet:
1. Audit your code
2. Test extensively on devnet
3. Use a multisig for upgrade authority
4. Consider making the program immutable after stabilization

Congratulations! You've completed the Anchor Framework course. You're now ready to build production Solana programs.`,
                },
              ],
            },
          },
        ],
      },
    },
  });

  console.log(`Seeded courses:`);
  console.log(`  - ${solana101.title} (${solana101.slug})`);
  console.log(`  - ${rustForSolana.title} (${rustForSolana.slug})`);
  console.log(`  - ${anchorFramework.title} (${anchorFramework.slug})`);

  // Count lessons
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
