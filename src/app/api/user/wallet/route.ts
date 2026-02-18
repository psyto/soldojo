import { prisma } from '@/lib/db';
import { requireAuth, apiSuccess, apiError, withErrorHandler } from '@/lib/api/utils';
import nacl from 'tweetnacl';

export const POST = withErrorHandler(async (req) => {
  const user = await requireAuth();
  const body = await req.json();
  const { walletAddress, signature, message } = body;

  if (!walletAddress || typeof walletAddress !== 'string') {
    return apiError('walletAddress is required', 400);
  }

  // Validate it looks like a Solana address (base58, 32-44 chars)
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    return apiError('Invalid Solana wallet address', 400);
  }

  // Require signature proof of wallet ownership
  if (!signature || !message) {
    return apiError('Signature verification required to link wallet', 400);
  }

  // Verify the signature
  try {
    // Decode base58 public key manually (Solana addresses are base58-encoded 32-byte keys)
    const { PublicKey } = await import('@solana/web3.js');
    const pubkey = new PublicKey(walletAddress);
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Buffer.from(signature, 'base64');

    const verified = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      pubkey.toBytes()
    );

    if (!verified) {
      return apiError('Invalid signature — wallet ownership could not be verified', 403);
    }
  } catch {
    return apiError('Signature verification failed', 400);
  }

  // Check if this wallet is already linked to another user
  const existingUser = await prisma.user.findUnique({
    where: { walletAddress },
    select: { id: true },
  });

  if (existingUser && existingUser.id !== user.id) {
    return apiError('This wallet is already linked to another account', 409);
  }

  // Link wallet to user
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { walletAddress },
    select: { walletAddress: true },
  });

  return apiSuccess({ walletAddress: updated.walletAddress });
});

export const DELETE = withErrorHandler(async () => {
  const user = await requireAuth();

  await prisma.user.update({
    where: { id: user.id },
    data: { walletAddress: null },
  });

  return apiSuccess({ walletAddress: null });
});
