import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * Serves Metaplex-compatible JSON metadata for cNFT certificates.
 * This is the URI stored in the cNFT's on-chain metadata.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const course = await prisma.course.findUnique({
    where: { slug },
    select: { title: true, description: true, slug: true, difficulty: true },
  });

  const name = course ? `SolDojo: ${course.title}` : `SolDojo Certificate: ${slug}`;
  const description = course
    ? `Proof of completion for "${course.title}" on SolDojo — the Solana developer learning platform.`
    : `Proof of course completion on SolDojo.`;

  const metadata = {
    name,
    symbol: 'SOLDOJO',
    description,
    image: 'https://soldojo.dev/certificate-badge.png',
    external_url: `https://soldojo.dev/courses/${slug}`,
    attributes: [
      { trait_type: 'Platform', value: 'SolDojo' },
      { trait_type: 'Type', value: 'Course Completion' },
      ...(course
        ? [
            { trait_type: 'Course', value: course.title },
            { trait_type: 'Difficulty', value: course.difficulty },
          ]
        : []),
    ],
    properties: {
      category: 'certificate',
      files: [],
    },
  };

  return NextResponse.json(metadata, {
    headers: {
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
