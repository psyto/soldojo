import { prisma } from '@/lib/db';
import { requireAuth, apiSuccess, apiError, withErrorHandler } from '@/lib/api/utils';
import { mintCourseCertificate, isCNFTMintingEnabled } from '@/lib/solana/cnft';

export const POST = withErrorHandler(async (req) => {
  const user = await requireAuth();
  const body = await req.json();
  const { courseSlug } = body;

  if (!courseSlug || typeof courseSlug !== 'string') {
    return apiError('courseSlug is required', 400);
  }

  // Verify user has a linked wallet
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { walletAddress: true },
  });

  if (!dbUser?.walletAddress) {
    return apiError('Link your wallet in Settings before minting a certificate', 400);
  }

  // Verify the user actually completed this course
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      userId: user.id,
      course: { slug: courseSlug },
      completedAt: { not: null },
    },
    include: {
      course: { select: { title: true, slug: true, xpReward: true } },
    },
  });

  if (!enrollment) {
    return apiError('You have not completed this course', 403);
  }

  // Check if cNFT minting is configured
  if (!isCNFTMintingEnabled()) {
    return apiSuccess({
      minted: false,
      message: 'cNFT minting is not yet configured for this environment',
      course: enrollment.course.title,
    });
  }

  // Mint the cNFT
  const result = await mintCourseCertificate({
    recipientWallet: dbUser.walletAddress,
    courseName: enrollment.course.title,
    courseSlug: enrollment.course.slug,
    completedAt: enrollment.completedAt!.toISOString(),
    xpEarned: enrollment.course.xpReward,
  });

  if (!result) {
    return apiError('Failed to mint certificate', 500);
  }

  return apiSuccess({
    minted: true,
    signature: result.signature,
    assetId: result.assetId,
    course: enrollment.course.title,
  });
});
