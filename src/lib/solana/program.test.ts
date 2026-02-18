import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID, getProfilePDA, getCompletionPDA } from './program';

describe('PROGRAM_ID', () => {
  it('is a valid public key', () => {
    expect(PROGRAM_ID).toBeInstanceOf(PublicKey);
    expect(PROGRAM_ID.toBase58()).toBe('CzTcLkeLZvk77ZJQpaL5fCYVgxqU63JV8rZBwC1kQ3rQ');
  });
});

describe('getProfilePDA', () => {
  const wallet = new PublicKey('11111111111111111111111111111112');

  it('returns a PublicKey and bump', () => {
    const [pda, bump] = getProfilePDA(wallet);
    expect(pda).toBeInstanceOf(PublicKey);
    expect(typeof bump).toBe('number');
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
  });

  it('is deterministic', () => {
    const [pda1] = getProfilePDA(wallet);
    const [pda2] = getProfilePDA(wallet);
    expect(pda1.toBase58()).toBe(pda2.toBase58());
  });

  it('differs per wallet', () => {
    const wallet2 = new PublicKey('11111111111111111111111111111113');
    const [pda1] = getProfilePDA(wallet);
    const [pda2] = getProfilePDA(wallet2);
    expect(pda1.toBase58()).not.toBe(pda2.toBase58());
  });
});

describe('getCompletionPDA', () => {
  const wallet = new PublicKey('11111111111111111111111111111112');

  it('returns a PublicKey and bump', () => {
    const [pda, bump] = getCompletionPDA(wallet, 'solana-core');
    expect(pda).toBeInstanceOf(PublicKey);
    expect(typeof bump).toBe('number');
  });

  it('is deterministic for same inputs', () => {
    const [pda1] = getCompletionPDA(wallet, 'solana-core');
    const [pda2] = getCompletionPDA(wallet, 'solana-core');
    expect(pda1.toBase58()).toBe(pda2.toBase58());
  });

  it('differs per course slug', () => {
    const [pda1] = getCompletionPDA(wallet, 'solana-core');
    const [pda2] = getCompletionPDA(wallet, 'anchor-basics');
    expect(pda1.toBase58()).not.toBe(pda2.toBase58());
  });

  it('differs per wallet', () => {
    const wallet2 = new PublicKey('11111111111111111111111111111113');
    const [pda1] = getCompletionPDA(wallet, 'solana-core');
    const [pda2] = getCompletionPDA(wallet2, 'solana-core');
    expect(pda1.toBase58()).not.toBe(pda2.toBase58());
  });
});
