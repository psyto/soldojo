# Solana Internals chapters → the parts that do it in production

Each chapter builds a mechanism by hand. The part listed next to it is that mechanism packaged for
use in your own program, or a tool that checks you built it right. Chapters link forward to the
part at the end ("now use the part"), and each part's README links back to the chapter that explains
it.

Chapter sources live in [`psyto/openhl-solana`](https://github.com/psyto/openhl-solana)
`docs/chapter-NN-*/DRAFT.{en,ja}.md` and are imported here as `solana_internals_chNN_*.md`. SolDojo
has no public URL yet, so the links point at the chapter files on GitHub until it does.

| Ch | Chapter | Part | Install (public entry) | Status |
|---|---|---|---|---|
| 1 | The Account Model from the Bytes Up | `openhl-state` (account layouts) | git, openhl-solana | split not yet committed |
| 2 | Writing a Native Program Without Anchor | — | | the point is to have none |
| 3 | PDAs from First Principles | solinv `signer_skip` / `account_swap` via [`fuzz/basics`](https://github.com/psyto/openhl-solana/tree/main/fuzz/basics) | solinv git rev `1badc31` | **linked**: §3.7 exercise, measured |
| 4 | Compute Budget and Heap Discipline | solinv `cu_dos` via [`fuzz/basics`](https://github.com/psyto/openhl-solana/tree/main/fuzz/basics) | solinv git rev `1badc31` | **linked**: §4.7 exercise, measured |
| 5 | Sealevel Parallelism and Account Locks | — | | |
| 6 | CPI Internals via Vault Deposits | solinv `signer_skip` / `owner_skip` / `account_swap` (+ `check_sets`) via [`fuzz/basics`](https://github.com/psyto/openhl-solana/tree/main/fuzz/basics) | solinv git rev `1badc31` | **linked**: §6.6 exercise, measured |
| 7 | On-Chain CLOB Data Structures | `openhl-slab` | git, openhl-solana | split not yet committed |
| 8 | Matching Engine Under CU Pressure | `openhl-slab`; solinv `cu_dos` via [`fuzz/matching`](https://github.com/psyto/openhl-solana/tree/main/fuzz/matching) | openhl-solana git; solinv git rev `1badc31` | **linked**: §8.6 exercise; §8.2's CU table re-measured |
| 9 | Oracle Ingestion: Pyth Internals | `openhl-oracle` | git, openhl-solana | split not yet committed |
| 10 | Funding Rate Mechanics | `openhl-funding` | git, openhl-solana | split not yet committed |
| 11 | Position Lifecycle and Liquidation Engine | `openhl-margin`; solinv `signer_skip` / `account_swap` (+ `check_sets`) via [`fuzz/positions`](https://github.com/psyto/openhl-solana/tree/main/fuzz/positions) | openhl-solana git; solinv git rev `1badc31` | **linked**: §11.7 exercise, measured; its first run found the unbound oracle |
| 12 | Native Vault Program (Pooled Trading) | `openhl-vault`; solinv `signer_skip` / `owner_skip` / `account_swap` (+ `check_sets`) via [`fuzz/vault`](https://github.com/psyto/openhl-solana/tree/main/fuzz/vault) | openhl-solana git; solinv git rev `8bcb011` | **linked**: §12.7 exercise, measured; imported here |
| 13 | Builder Codes as a Protocol Primitive | `openhl-fees`; solinv relation + guard (`unchecked_math`, `precondition_skip`) via [`fuzz/fees`](https://github.com/psyto/openhl-solana/tree/main/fuzz/fees) | openhl-solana git; solinv git rev `1badc31` | **linked**: §13.6 exercise, measured |
| 14 | Cranks, Keepers, and Off-Chain Glue | — | | |
| 15 | (slab; in openhl-solana, not yet imported here) | `openhl-slab` | | import pending |

## Rules for adding a link

- Link only to a part installed through its public entry (a crates.io version, or a git tag or
  rev). A `path =` dependency does not count.
- The exercise must run from the reader's clone, and its expected output must be measured, not
  written from memory.
- Put the part at the end of the chapter, after the hand-built version. The chapters teach what the
  SDK hides, so the reader should not use the part before seeing what it does.
- When a part changes the code the chapter quotes (the openhl split moved the logic into
  `crates/*`), say so in the chapter header, as chapters 9–13 already do.

## Not here

- `rdk` (EVM, Reth) belongs with the rethlab DIY Perp track, not here.
- `hl-price-guard` (HyperEVM) belongs with a HyperEVM course, not this one.
- `princeps-solana`'s `psol-vault` is a KYC-gated vault. It is not the Chapter 12 vault, though its
  `fuzz/psol-vault` was the template for `fuzz/vault`.
