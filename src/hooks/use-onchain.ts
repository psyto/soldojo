import { useCallback, useState } from 'react';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import idlJson from '@/lib/solana/idl.json';
import { PROGRAM_ID, getProfilePDA, getCompletionPDA } from '@/lib/solana/program';

export function useOnChain() {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getProgram = useCallback(() => {
    if (!wallet) throw new Error('Wallet not connected');
    const provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
    return new Program(idlJson as Idl, provider);
  }, [wallet, connection]);

  /**
   * Initialize the learner profile PDA (one-time per wallet).
   * If profile already exists, this is a no-op.
   */
  const initProfile = useCallback(async (): Promise<string | null> => {
    if (!wallet) return null;
    setLoading(true);
    setError(null);
    try {
      const program = getProgram();
      const [profilePDA] = getProfilePDA(wallet.publicKey);

      // Check if profile already exists
      const existing = await connection.getAccountInfo(profilePDA);
      if (existing) return null; // Already initialized

      const tx = await program.methods
        .initProfile()
        .accounts({
          profile: profilePDA,
          authority: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return tx;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to init profile';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, getProgram]);

  /**
   * Record a course completion on-chain.
   * Creates a PDA = [completion, wallet, course_slug] and
   * increments the profile counters.
   */
  const recordCompletion = useCallback(
    async (courseSlug: string, xpEarned: number): Promise<string | null> => {
      if (!wallet) return null;
      setLoading(true);
      setError(null);
      try {
        const program = getProgram();
        const [profilePDA] = getProfilePDA(wallet.publicKey);
        const [completionPDA] = getCompletionPDA(wallet.publicKey, courseSlug);

        // Ensure profile exists first
        const profileAccount = await connection.getAccountInfo(profilePDA);
        if (!profileAccount) {
          await initProfile();
        }

        // Check if already recorded
        const existing = await connection.getAccountInfo(completionPDA);
        if (existing) {
          setError('Course completion already recorded on-chain');
          return null;
        }

        const tx = await program.methods
          .recordCompletion(courseSlug, xpEarned)
          .accounts({
            completion: completionPDA,
            profile: profilePDA,
            authority: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        return tx;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to record completion';
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [wallet, connection, getProgram, initProfile]
  );

  /**
   * Fetch the on-chain learner profile for the connected wallet.
   */
  const fetchProfile = useCallback(async () => {
    if (!wallet) return null;
    try {
      const program = getProgram();
      const [profilePDA] = getProfilePDA(wallet.publicKey);
      const account = await connection.getAccountInfo(profilePDA);
      if (!account) return null;
      return await (program.account as Record<string, { fetch: (key: unknown) => Promise<unknown> }>)['learnerProfile'].fetch(profilePDA);
    } catch {
      return null;
    }
  }, [wallet, connection, getProgram]);

  return {
    initProfile,
    recordCompletion,
    fetchProfile,
    loading,
    error,
    isConnected: !!wallet,
    programId: PROGRAM_ID.toBase58(),
  };
}
