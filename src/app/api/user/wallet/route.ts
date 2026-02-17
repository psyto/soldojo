import { prisma } from '@/lib/db';
import { requireAuth, apiSuccess, apiError, withErrorHandler } from '@/lib/api/utils';

export const POST = withErrorHandler(async (req) => {
  const user = await requireAuth();
  const body = await req.json();
  const { walletAddress } = body;

  if (!walletAddress || typeof walletAddress !== 'string') {
    return apiError('walletAddress is required', 400);
  }

  // Validate it looks like a Solana address (base58, 32-44 chars)
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    return apiError('Invalid Solana wallet address', 400);
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
