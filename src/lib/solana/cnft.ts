import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplBubblegum, mintV1, parseLeafFromMintV1Transaction } from '@metaplex-foundation/mpl-bubblegum';
import { publicKey, keypairIdentity, type Umi } from '@metaplex-foundation/umi';
import { SOLANA_RPC_ENDPOINT } from './config';

// Environment-configured addresses for the cNFT infrastructure
// These must be created once (see scripts/setup-cnft-tree.ts)
const MERKLE_TREE = process.env.CNFT_MERKLE_TREE;
const COLLECTION_MINT = process.env.CNFT_COLLECTION_MINT;
const TREE_AUTHORITY_SECRET = process.env.CNFT_AUTHORITY_SECRET;

function getUmi(): Umi | null {
  if (!MERKLE_TREE || !COLLECTION_MINT || !TREE_AUTHORITY_SECRET) {
    return null;
  }

  const umi = createUmi(SOLANA_RPC_ENDPOINT).use(mplBubblegum());

  // Parse authority keypair from base64-encoded secret key
  const secretKey = Buffer.from(TREE_AUTHORITY_SECRET, 'base64');
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretKey));
  umi.use(keypairIdentity(umiKeypair));

  return umi;
}

export interface MintCNFTParams {
  recipientWallet: string;
  courseName: string;
  courseSlug: string;
  completedAt: string;
  xpEarned: number;
}

export interface MintCNFTResult {
  signature: string;
  assetId: string | null;
}

/**
 * Mint a compressed NFT certificate to the learner's wallet.
 * This runs server-side using the tree authority keypair.
 */
export async function mintCourseCertificate(params: MintCNFTParams): Promise<MintCNFTResult | null> {
  const umi = getUmi();
  if (!umi) {
    console.warn('cNFT minting not configured — missing CNFT_MERKLE_TREE, CNFT_COLLECTION_MINT, or CNFT_AUTHORITY_SECRET');
    return null;
  }

  const { recipientWallet, courseName, courseSlug, completedAt, xpEarned } = params;

  const merkleTree = publicKey(MERKLE_TREE!);
  const collectionMint = publicKey(COLLECTION_MINT!);

  const { signature } = await mintV1(umi, {
    leafOwner: publicKey(recipientWallet),
    merkleTree,
    metadata: {
      name: `SolDojo: ${courseName}`,
      symbol: 'SOLDOJO',
      uri: `https://soldojo.dev/api/metadata/${courseSlug}`,
      sellerFeeBasisPoints: 0,
      collection: { key: collectionMint, verified: false },
      creators: [
        {
          address: umi.identity.publicKey,
          verified: false,
          share: 100,
        },
      ],
    },
  }).sendAndConfirm(umi);

  // Try to parse the asset ID from the transaction
  let assetId: string | null = null;
  try {
    const sig = Buffer.from(signature).toString('base64');
    const leaf = await parseLeafFromMintV1Transaction(umi, signature);
    assetId = leaf.id.toString();
    void sig; // signature used for debugging if needed
  } catch {
    // Leaf parsing failed — assetId will be null but mint succeeded
  }

  return {
    signature: Buffer.from(signature).toString('base64'),
    assetId,
  };
}

/**
 * Check if cNFT minting is configured.
 */
export function isCNFTMintingEnabled(): boolean {
  return !!(MERKLE_TREE && COLLECTION_MINT && TREE_AUTHORITY_SECRET);
}
