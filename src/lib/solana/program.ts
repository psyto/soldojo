import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { SOLANA_RPC_ENDPOINT } from './config';
import idlJson from './idl.json';

export const PROGRAM_ID = new PublicKey(idlJson.address);

/**
 * Derive the learner profile PDA for a given wallet.
 */
export function getProfilePDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('profile'), authority.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derive the course completion PDA for a given wallet + course slug.
 */
export function getCompletionPDA(authority: PublicKey, courseSlug: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('completion'), authority.toBuffer(), Buffer.from(courseSlug)],
    PROGRAM_ID
  );
}

/**
 * Create an Anchor Program instance from a connected wallet.
 */
export function getProgram(wallet: AnchorProvider['wallet']): Program {
  const connection = new Connection(SOLANA_RPC_ENDPOINT, 'confirmed');
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  return new Program(idlJson as Idl, provider);
}
