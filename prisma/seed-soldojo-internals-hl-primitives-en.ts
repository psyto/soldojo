// AUTO-GENERATED from drafts/solana_internals_ch*_en.md
// by .github/scripts/build-soldojo-internals-seed.ts.
// Do not hand-edit. Re-run the build script when drafts change.

import { PrismaClient } from '@prisma/client';

export async function seedSoldojoInternalsHlPrimitivesEN(prisma: PrismaClient) {
  const tags = ["solana","internals","perpetuals","clob","oracle","funding","liquidation","vault","builder-codes"];

  await prisma.course.create({
    data: {
      slug: "solana-internals-hl-primitives-en",
      title: "Solana Internals — HL Primitives",
      description:
        "Build a Hyperliquid-style perpetuals exchange on top of the Foundations track. Nine chapters: SPL Token CPI, on-chain CLOB, matching engine under CU pressure, oracle ingestion, funding rates, liquidations, native trading vaults, builder codes, and the off-chain keeper layer that runs the whole thing.",
      difficulty: "ADVANCED",
      duration: 450,
      xpReward: 1200,
      track: "solana-internals",
      tags,
      isPublished: true,
      sortOrder: 101,
      locale: "en",
      instructorName: "SolDojo Internals",
      modules: {
        create: [
          {
            title: "HL Primitives",
            sortOrder: 0,
            lessons: {
              create: [
                {
                  title: "Chapter 6 — CPI Internals via Vault Deposits",
                  slug: "solana-internals-ch06-cpi-en",
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 45,
                  xpReward: 100,
                  content: `# Chapter 6 — CPI Internals via Vault Deposits

> Status: draft (v0.1).
> Companion code: [\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs) (\`process_create_vault\` at lines 892–1001, \`process_deposit\` at lines 1008–1076), [\`scripts/create-vault/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/create-vault/src/main.rs), [\`scripts/deposit/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/deposit/src/main.rs), [\`fuzz/basics/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/basics/src/main.rs) (the solinv harness for §6.6).
> Tested against: solana-cpi 2.2.1, solana-program 2.3.0, SPL Token program (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA).

---

## §6.0  Framing

Phase A built the runtime fundamentals. Phase B builds the HL primitives — and they all talk to other programs, mostly SPL Token. Every order placement moves tokens. Every settlement moves tokens. Every withdrawal moves tokens. None of this is "do something inside our program"; it is "tell SPL Token to do something on our behalf." That conversation between programs is called **cross-program invocation** (CPI), and it is the most consequential thing your program does after the owner check.

This chapter builds the most fundamental CPI we need: an SPL Token vault for a market, plus a \`Deposit\` instruction that moves user tokens into it. The two together exercise the full CPI mechanism:

- **CreateVault** does two consecutive CPIs — \`System::create_account\` (signed by the vault PDA via \`invoke_signed\`) and \`SPL Token InitializeAccount3\` (signed by no one, plain \`invoke\`).
- **Deposit** does one CPI — \`SPL Token Transfer\`, signed by the user *not* via PDA but via signer-privilege extension from the outer transaction.

By the end you will have:

1. Read \`invoke\` and \`invoke_signed\` side by side and understood that they are literally the same call with a different "do you have seeds?" parameter.
2. Walked the runtime's rule for signer privilege: every signer that appears in the outer transaction's \`AccountMeta\` and is then re-emitted in a CPI's \`AccountInfo\` is treated as a signer by the callee.
3. Built two SPL Token instructions by hand — \`INITIALIZE_ACCOUNT_3\` (tag 18) and \`TRANSFER\` (tag 3) — knowing exactly what bytes go on the wire.
4. Understood why we use \`invoke_signed\` to create the vault but \`invoke\` to deposit into it. They are *not* interchangeable — the choice is dictated by who needs to sign for the operation.

This is the chapter that turns the program from "owns its own accounts" to "talks to the rest of the chain." Everything in Phase B builds on it.

---

## §6.1  \`invoke\` and \`invoke_signed\` are the same call

Open \`solana-cpi-2.2.1/src/lib.rs:137–139\`:

\`\`\`rust
pub fn invoke(instruction: &Instruction, account_infos: &[AccountInfo]) -> ProgramResult {
    invoke_signed(instruction, account_infos, &[])
}
\`\`\`

That is the entire body of \`invoke\`. It calls \`invoke_signed\` with an empty seeds slice. The two functions are the same syscall under the hood. The only thing that varies is whether you supply PDA seeds.

The semantic distinction:

- **\`invoke_signed(ix, accounts, signers_seeds)\`** — "Execute this instruction, and treat the PDAs derivable from these seeds as additional signers." Used in Chapter 3 to let our program sign for the market PDA during \`create_account\`.
- **\`invoke(ix, accounts)\`** — "Execute this instruction, with no new signers from us. Whatever signers are already in \`accounts\` (because they signed the outer transaction) remain signers." Used when the original transaction's signer already has the authority you need.

When to use which is determined entirely by who needs to sign for the CPI's operation:

- The new account in \`create_account\`? That's a PDA we own. Only we can sign for it. → \`invoke_signed\`.
- The transfer authority on an SPL Token Transfer? That's the *user's* wallet keypair. They already signed the outer transaction. → \`invoke\`.
- The mint authority on \`SPL Token MintTo\`? Depends. If your program is the mint authority (e.g., it's a PDA we control), → \`invoke_signed\`. If the user is the mint authority and signed the outer tx, → \`invoke\`.

There is no third option. Every CPI either inherits signers from the outer transaction or extends them via PDA seeds. The runtime's job is to verify that whatever signers the CPI requires can be accounted for via one of those two mechanisms.

**What the SDK hides:** Anchor's \`CpiContext::new(...)\` and \`CpiContext::new_with_signer(...)\` are direct wrappers around \`invoke\` and \`invoke_signed\` respectively. The choice is yours; Anchor never picks for you. Pick the wrong one and the runtime fails the CPI with a signature error.

> **Exercise §6.1.** What happens if you call \`invoke_signed\` with a non-empty seeds slice when the CPI doesn't need any PDA signers? (Hint: it's not an error. The runtime just ignores PDA signers that don't appear in the inner instruction's required-signer list.)

---

## §6.2  Signer privilege extension

The rule that makes \`Deposit\` work without any PDA signing is short: **when a signer appears in your program's outer-transaction \`AccountMeta\` and you re-emit it in a CPI's \`AccountInfo\`, the callee sees that account as a signer.**

This is the runtime's "signer privilege extension." The user signs *once* at the outer transaction. Inside \`process_deposit\`, the \`user\` account's \`AccountInfo\` has \`is_signer = true\` (because the outer tx signed it). When we build the SPL Token Transfer instruction with \`AccountMeta::new_readonly(*user_ai.key, true)\` (signer = true) and pass \`user_ai.clone()\` in the \`account_infos\` to \`invoke\`, the runtime checks: "is this account marked as a signer at my level? yes. Is it marked as a signer in the CPI's account list? yes. Do they agree?" — and if yes, the callee program (SPL Token) receives an \`AccountInfo\` for the user with \`is_signer = true\`.

What this rule prevents: you cannot *promote* a non-signer into a signer through CPI. If the user did not sign the outer transaction, no amount of \`AccountMeta::new(*user.key, true)\` in your CPI will manufacture a signature. The runtime sees the discrepancy and rejects the CPI with \`MissingRequiredSignature\`.

What this rule allows: you can *propagate* signers without re-asking them to sign. The user signs once; that signature is good for every program in the chain that re-emits the user as a signer in its CPI declarations. This is how a single user signature can authorize an arbitrary sequence of SPL Token transfers, swaps, and program calls, all in one transaction.

There is one more piece. The PDA signers from \`invoke_signed\`'s \`signers_seeds\` parameter are *added* to the outer signer set for the duration of the CPI. The runtime hashes the seeds + the calling program ID, confirms the result matches the account being signed for, and treats that account as a signer for the CPI. This is the PDA's only mechanism for signing anything — they have no private key.

Both mechanisms — outer-tx propagation and PDA seeds — live in the same \`invoke_signed\` body. The runtime takes the union of the two when deciding what counts as a signer for the inner instruction.

> **Exercise §6.2.** In \`process_deposit\`, what would happen if you constructed the SPL Token Transfer instruction with \`AccountMeta::new_readonly(*user_ai.key, false)\` (signer = false)? Would the transfer succeed? Why or why not?

---

## §6.3  Walking CreateVault — two consecutive CPIs

CreateVault is the place where both flavors of CPI appear in the same handler. From \`programs/openhl-core/src/lib.rs:892–1001\`.

**The PDA derivation** (lines 932–954) sets up two pubkeys: \`vault_token_account\` at \`[VAULT_SEED, market.key, mint.key]\` and \`vault_authority\` at \`[VAULT_AUTH_SEED, market.key]\`. Same find_program_address mechanic as Chapter 3. The bumps are returned and the vault bump is used below; the authority bump we don't need yet (it will matter when we add withdrawals in a later chapter and the program must sign as the vault authority).

**CPI 1 — System::create_account** at lines 956–975:

\`\`\`rust
let create_ix = system_instruction::create_account(
    payer_ai.key,
    vault_ai.key,
    rent,
    TOKEN_ACCOUNT_LEN as u64,
    &SPL_TOKEN_PROGRAM_ID,
);
invoke_signed(
    &create_ix,
    &[payer_ai.clone(), vault_ai.clone(), system_ai.clone()],
    &[&[
        VAULT_SEED,
        market_ai.key.as_ref(),
        mint_ai.key.as_ref(),
        &[vault_bump],
    ]],
)?;
\`\`\`

This is \`invoke_signed\` because the new account is a PDA we own and System requires the new account to sign. The seeds + bump are exactly what we used in the \`find_program_address\` call. The third argument to \`create_account\` is the *owner program* of the new account — we pass \`SPL_TOKEN_PROGRAM_ID\`, not our own program. From this point on, the vault token account is owned by SPL Token (at the Solana-runtime level), and only SPL Token can write to its data.

Note the AccountInfo array: \`[payer_ai, vault_ai, system_ai]\`. These are the only three accounts the System program needs to see for \`create_account\` (the rest of our handler's accounts — market, mint, vault_authority, token_program — aren't passed because System doesn't need them).

**CPI 2 — SPL Token InitializeAccount3** at lines 977–997:

\`\`\`rust
let mut init_data = Vec::with_capacity(1 + 32);
init_data.push(spl_token_ix::INITIALIZE_ACCOUNT_3);
init_data.extend_from_slice(vault_auth_ai.key.as_ref());
let init_ix = Instruction {
    program_id: SPL_TOKEN_PROGRAM_ID,
    accounts: vec![
        AccountMeta::new(*vault_ai.key, false),
        AccountMeta::new_readonly(*mint_ai.key, false),
    ],
    data: init_data,
};
invoke(&init_ix, &[vault_ai.clone(), mint_ai.clone(), token_ai.clone()])?;
\`\`\`

This is plain \`invoke\` because no one needs to sign. The vault account is already SPL Token-owned (we just set that up in CPI 1). InitializeAccount3 is a pure data write — it sets the mint and owner fields on the empty token account. No signature is required because the mere act of being SPL Token-owned authorizes SPL Token to write to your data.

Note the *AccountInfo* array passed to \`invoke\` is \`[vault_ai, mint_ai, token_ai]\` — but the *AccountMeta* in the instruction only mentions \`vault_ai\` and \`mint_ai\`. Why the extra \`token_ai\`? Because the runtime requires you to also pass the AccountInfo for the *program being invoked*, even though it's not in the instruction's account list. This is the "AccountInfo reborrowing" rule: you must pass every AccountInfo the runtime will need to set up the call, which includes the callee program itself.

Two CPIs, one handler, both kinds of signing. The pattern repeats throughout the rest of Phase B.

> **Exercise §6.3.** Remove the \`token_ai.clone()\` from the \`invoke\` call. What error does the runtime return? It is one of the most common CPI bugs in early Solana code — and one of the least googleable error messages.

---

## §6.4  Walking Deposit — user signs at the outer level

Deposit is the simpler case. From \`programs/openhl-core/src/lib.rs:1008–1076\`.

The instruction data:

\`\`\`rust
let mut transfer_data = Vec::with_capacity(1 + 8);
transfer_data.push(spl_token_ix::TRANSFER);
transfer_data.extend_from_slice(&amount.to_le_bytes());
\`\`\`

Nine bytes total: a one-byte tag (3 for Transfer) and an eight-byte amount in little-endian. That is the entire wire format for SPL Token Transfer.

The accounts:

\`\`\`rust
let transfer_ix = Instruction {
    program_id: SPL_TOKEN_PROGRAM_ID,
    accounts: vec![
        AccountMeta::new(*user_token_ai.key, false),
        AccountMeta::new(*vault_token_ai.key, false),
        AccountMeta::new_readonly(*user_ai.key, true),
    ],
    data: transfer_data,
};
\`\`\`

Three accounts: source token account (writable), destination token account (writable), authority (signer, readonly). The authority is the user's wallet, marked as signer. We don't write to the user's wallet here — the token movement is reflected in the source token account's balance field, not the wallet's lamports — so the wallet itself is read-only-but-signing.

The CPI:

\`\`\`rust
invoke(
    &transfer_ix,
    &[
        user_token_ai.clone(),
        vault_token_ai.clone(),
        user_ai.clone(),
        token_ai.clone(),
    ],
)?;
\`\`\`

Plain \`invoke\`. No seeds. The user signed at the outer transaction; that signature flows through to SPL Token via the \`is_signer = true\` flag on the \`user_ai\` \`AccountInfo\`. SPL Token sees a signer it accepts as the authority, and the transfer commits.

This is the canonical "program-mediated user transfer" pattern: the user authorizes the operation by signing the outer transaction, the program orchestrates whatever CPIs are needed, and the user's signer privilege flows through.

> **Exercise §6.4.** Build a Deposit transaction where the \`user_token_account\` and \`vault_token_account\` belong to different mints. What error do you get, and at which layer does it surface — our program or SPL Token?

---

## §6.5  Hand-rolling SPL Token instruction data

We deliberately did *not* import the \`spl-token\` crate. Instead we hand-rolled two instructions worth of bytes. Lines 861–864 of \`lib.rs\`:

\`\`\`rust
mod spl_token_ix {
    pub const TRANSFER: u8 = 3;
    pub const INITIALIZE_ACCOUNT_3: u8 = 18;
}
\`\`\`

That is the full vocabulary we needed. Two tag values. Everything else — the field encoding, the account order — comes from reading the SPL Token program's source (or its \`Instruction\` enum in the \`spl-token\` crate, which we are deliberately not depending on).

Two reasons:

1. **Pedagogy.** This chapter is about CPI bytes. Importing a builder that produces the exact bytes for you would let you finish the chapter without ever seeing them. Hand-rolling them once teaches the format permanently — every future SPL Token instruction you encounter, you can read the tag and the data without consulting docs.
2. **Binary size.** The \`spl-token\` crate at recent versions pulls in roughly 25 KB of dependencies (the Token enum, the error types, helper builders) when compiled to BPF. For a program that needs two instructions, that is pure overhead. Hand-rolling the data adds maybe 200 bytes.

This is a tradeoff most production programs do *not* make — they import \`spl-token\` for the type safety and the maintenance story. We make it here because the chapter requires it. Once you understand the bytes, the tradeoff goes the other way: pay the 25 KB and let the typed builder catch tag mistakes for you.

The general technique applies to any program you CPI to:

1. Find the instruction tag in the callee's source.
2. Find the data fields (Borsh-encoded, or hand-packed, depending on the program).
3. Find the account list in the callee's processor — usually documented as account references like \`[WRITE, SIGNER]\` in the variant's doc comment.
4. Build the \`Instruction\` struct manually.
5. \`invoke\` or \`invoke_signed\` it.

The five-step recipe works for SPL Token, the Address Lookup Table program, the Compute Budget program, the BPF Loader program, and any custom program someone built. The mechanics don't change.

**What Anchor hides:** Anchor has typed CPI wrappers for SPL Token (\`anchor_spl::token::{Transfer, MintTo, ...}\`) that hide the byte layout entirely. They work — but they obscure exactly what this chapter wants you to see. A native program that hand-rolls its CPIs and exposes them clearly has a much better security audit story than one that calls \`anchor_spl::token::transfer(ctx, amount)\` and trusts the macro.

---

## §6.6  Recap + verify yourself

### Recap diagram

\`\`\`
                  invoke                            invoke_signed
                  ──────                            ─────────────
   What it is:    invoke_signed(ix, accs, &[])      invoke_signed(ix, accs, seeds)
   PDA signing:   no                                yes (program signs for derived PDAs)
   Outer signers: passed through automatically      passed through automatically
   When to use:   user / outer-tx signs the op      a PDA we own must sign


Per-CPI privilege resolution:
    For each AccountMeta in the inner instruction with is_signer = true:
       Is the same pubkey marked is_signer in the *outer* AccountMeta?   ──► YES → signer ok
       OR did we pass seeds that derive this pubkey via PDA?              ──► YES → signer ok
       OTHERWISE                                                          ──► reject CPI


openhl-core CPI map:

    CreateVault
       CPI 1: System::create_account
          invoke_signed, vault PDA seeds
       CPI 2: SPL Token InitializeAccount3
          invoke (no signing needed — SPL Token owns the new account)

    Deposit
       CPI 1: SPL Token Transfer
          invoke (user signed at outer tx, privilege flows through)
\`\`\`

### Three things to verify yourself

1. **\`invoke\` is \`invoke_signed\` with no seeds.** Open \`solana-cpi-2.2.1/src/lib.rs:137\` and read the three-line body. Internalize that the only difference between the two is "did we pass PDA seeds." Everything else is the same syscall.
2. **AccountInfo for the callee program.** In both CPIs in CreateVault, the \`accounts\` slice passed to \`invoke[_signed]\` includes the callee program's AccountInfo — \`system_ai\` for CPI 1, \`token_ai\` for CPI 2. Omitting them is one of the most common early-Solana mistakes; the runtime returns a confusing \`AccountNotFound\`-flavored error. Verify by reading [\`lib.rs:966, 997\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs#L966).
3. **User signs once, used by SPL Token.** Run \`deposit\` against your validator. The user keypair signs the outer transaction; SPL Token receives a \`Transfer\` instruction with \`is_signer = true\` on the user; the transfer commits. There is no second signature anywhere. One signature, propagated.


### Now let a tool try the checks

\`CreateVault\` has seven checks and \`Deposit\` four. Chapter 3 §3.7 ran [solinv](https://github.com/psyto/solinv) on \`CreateMarket\`, and every deleted check was backed by the runtime. These two handlers make CPIs to a second program, so there are more places a check can be backed, and one where it is not. The same harness, [\`fuzz/basics/\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/basics), has specs for both: the payer's or user's signer flag cleared, and each slot swapped for something an attacker could pass (a "market" this program does not own, a token account as the "mint", a vault address that is not the PDA, the caller as the vault's authority, the wrong program in each program slot, B's token account as A's source). Set up as in Chapter 3 §3.7, then:

\`\`\`bash
cd fuzz/basics
cargo build --release --features invariant_ch6
cargo test --release --features invariant_ch6      # A cannot spend B's tokens
timeout -s INT 60 crucible run openhl_basics_fuzz invariant_ch6 \\
    --binary-in target/release/invariant_test --timeout 45
\`\`\`

On the program as it is, no \`[FUZZ_FINDING]\` line appears.

> **Exercise §6.6.** Delete each check in turn, rebuild, run, and predict first. Here is what we measured, 45 seconds each. The last column is what refused the swapped call instead, read from its logs:
>
> | Check deleted | Caught? | What refused the call instead |
> |---|---|---|
> | CreateVault: \`payer_ai.is_signer\` | no | the runtime: unauthorized signer |
> | CreateVault: \`market_ai.owner == program_id\` | no | our vault PDA check |
> | CreateVault: \`mint_ai.owner == SPL Token\` | no | our vault PDA check |
> | CreateVault: \`system_ai.key == System\` | no | the runtime: an account required by the instruction is missing |
> | CreateVault: \`token_ai.key == SPL Token\` | no | the runtime: an account required by the instruction is missing |
> | CreateVault: \`vault_ai.key == expected_vault\` | no | the runtime: unauthorized signer |
> | CreateVault: \`vault_auth_ai.key == expected_auth\` | **yes**, account-swap, slot 4 | — |
> | Deposit: \`user_ai.is_signer\` | no | the runtime: unauthorized signer |
> | Deposit: \`user_token_ai.owner == SPL Token\` | no | the runtime: instruction modified data of an account it does not own |
> | Deposit: \`vault_token_ai.owner == SPL Token\` | no | the runtime: instruction modified data of an account it does not own |
> | Deposit: \`token_ai.key == SPL Token\` | no | the runtime: an account required by the instruction is missing |
>
> Before reading on, find the one row where nothing else stands behind the check.
>
> Most rows are §6.2 and §6.1 again. A program can pass on only the signatures it was given, so a missing payer or user signature fails at the CPI (§6.2). The handler builds each inner instruction with the callee's ID written in (\`SPL_TOKEN_PROGRAM_ID\`, \`system_program::ID\`), so a wrong program in the slot does not redirect the CPI; the runtime just cannot find the real callee's account (§6.1). \`create_account\` on an address that is not the PDA needs that address's own signature. A token account owned by some other program, with the same bytes inside, gets past SPL Token, which runs the \`Transfer\`; then the runtime refuses it, because SPL Token changed an account it does not own (Chapter 1). B's real token account is refused by SPL Token itself, because A is not its authority (\`owner does not match\`, which the test pins).
>
> Two rows are backed by our own code, and only because of how the fuzzer swaps. The vault PDA is derived from the market and the mint, so swapping either one alone makes slot 3 the wrong address. Swap them together with the accounts derived from them, a set (\`account_swap::check_sets\`; Chapter 12 §12.7 uses one too), and the rows split: with the mint owner check gone, SPL Token still refuses a token account as a mint (\`Invalid Mint\`). With the market owner check gone, the call went through and created a token account for a "market" that was someone's token account. That check is doing real work.
>
> The **yes** row is the one to remember. \`vault_authority\` is never created; it is only an address, which \`InitializeAccount3\` writes into the new token account as its owner. Nothing about the CPI depends on it being the PDA, so if the program does not check it, the caller can name themselves, and from then on every deposit into that market's vault is the caller's to move. No runtime rule can catch this, because to the runtime the address is just data.
>
> Two more to try. First, add \`self.b_ata\` to \`Deposit\`'s slot 2 alternates in \`fuzz/basics/src/main.rs\` (the destination) and run again: it is reported on every execution, since A can deposit into any token account. Is that a hole? Here it is not. \`Deposit\` records nothing, so A paying into B's account is a gift. Chapters 11 and 12 add the bookkeeping that makes the destination matter, and bind it. A finding is a call the program allowed; whether it matters is a question about what the program promised.
>
> Second, the read-time question from Chapter 3. \`CreateVault\` checks the market's owner, not its address. Chapter 2's \`Initialize\` can still make a \`Market\` in any account the caller creates, so a pair can have a second market that is not at its PDA. Build with \`--features invariant_ch3_reader\` and run: that harness makes such a market and has \`CreateVault\` read it (three slots swapped together: the market and the two addresses derived from it). It is reported on the current program, and the test \`create_vault_accepts_a_market_not_at_its_pda\` shows it directly. Is *that* a hole? Work it out before reading on.
>
> What the PDA promised was one address per \`(base, quote)\`. Almost nothing in the program relies on that. Every account keyed to a market (its token accounts and their authority, the book, oracle, funding state, positions, trading vaults, insurance fund) is seeded by the market's own address, so a second market is a separate island, and \`CreateMarket\` lets anyone choose a market's authority anyway. The exceptions are all in Chapter 13: the fee vault and its authority (one per quote mint, shared by every market) and builder profiles (one per builder). We found no way in Chapters 6–12 for a second market to reach another market's tokens; whether it can take more out of the fee vault than its users paid in, Chapter 13 §13.6 checks with the same tool: it cannot, because every credit is paid for in the same transaction. A client that finds "the" market by deriving its PDA is fine; a client that believes any account shaped like a market is not. If the program wanted to enforce one market per pair, \`CreateVault\` would re-derive the address from the market's own \`base_mint\`, \`quote_mint\` and stored \`bump\` (Chapter 3's "bump stored"). We tried it: with that check added, the set was refused (\`InvalidSeeds\`) and the fuzzer found nothing in 45 seconds.

---

## Hook into Chapter 7

You can now talk to other programs. But the program you're going to talk to most in Phase B is *yourself* — the on-chain order book. The CLOB lives inside the market account as a slab of bids and asks, and every place/cancel instruction will read and write substantial chunks of it. That data structure is the next thing to build.

Chapter 7 walks the on-chain CLOB design: critbit vs heap vs slab, zero-copy account access via \`bytemuck\`, the trade-off between memory locality and account size, why production programs almost always pick the slab. We will extend the \`Market\` struct to embed an order book of fixed capacity, add a \`place_order\` instruction that writes into it, and watch the CU envelope tighten as the book fills up. By the end the market will accept its first order — and the question that drove Phase A's compute-budget chapter ("how do you fit a matcher in 200K CU?") becomes urgent for the first time.
`,
                },
                {
                  title: "Chapter 7 — On-Chain CLOB Data Structures",
                  slug: "solana-internals-ch07-clob-en",
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 45,
                  xpReward: 100,
                  content: `# Chapter 7 — On-Chain CLOB Data Structures

> Status: draft (v0.1).
> Companion code: [\`crates/state/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/state/src/lib.rs) (\`Order\` + \`OrderBook\`), [\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs) (\`process_create_order_book\` at 1091–1155, \`process_place_order\` at 1162–1253, \`process_cancel_order\` at 1260–1327), [\`scripts/book/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/book/src/main.rs).

---

## §7.0  Framing

A perp DEX without an order book is a price feed with a database. The book is where price discovery happens, where partial fills attribute liquidity, and where you spend almost all of your compute budget. Every business-relevant question downstream of "how does this exchange make money" eventually hits the data structure that holds the resting orders.

On Solana the constraints are unusual. You cannot allocate dynamically per transaction (heap is 32 KiB and the bump allocator never frees). You cannot grow accounts arbitrarily (data length is fixed at creation, only \`realloc\` to within MAX_PERMITTED_DATA_INCREASE per tx). You cannot have unbounded loops (200 KCU default, 1.4 M max). And whatever you build must be readable and writable by every other program on the chain via \`bytemuck\` casts — because there is no Rust runtime on the other side to do anything smarter.

This chapter is where Phase A's CU lecture starts to bite. We will:

1. Pick a layout — \`Order\` slot, \`OrderBook\` containing a fixed-capacity array — and explain why it is *the simplest correct one*, not the production one.
2. Compare it explicitly against the two real production choices (slab and critbit), and pin down what trade we are making.
3. Walk \`place_order\` and \`cancel_order\` as linear scans, and read the CU log to see exactly what "linear" costs.
4. Watch the book fill up, the per-instruction CU rise with it, and stop just before the matcher chapter — where the question becomes "how do you avoid this growth entirely."

We will not implement matching in this chapter. The book is *passive*: orders go in, orders come out by ID. Crossing bids and asks is Chapter 8.

---

## §7.1  Why an array, and not the right thing

A real CLOB on Solana looks like one of two things:

1. **Slab** — a contiguous arena of nodes, linked into a doubly-linked FIFO queue per price level, with price levels themselves stored in a sorted critbit tree (Serum, Phoenix). O(log N) for place/cancel, O(1) for best-bid/best-ask lookup, no compaction needed on cancellation.
2. **Critbit-of-orders** — every order is a leaf in a critbit tree keyed by price (and a secondary timestamp for FIFO ordering at the same price). O(log N) for everything, simpler to reason about than slab, slightly worse memory locality.

What we are building is neither. It is **a fixed-capacity flat array, scanned linearly.** From \`crates/state/src/lib.rs\`:

\`\`\`rust
pub const ORDER_CAPACITY: usize = 32;

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct OrderBook {
    pub discriminator: [u8; 8],
    pub bump: u8,
    pub _pad0: [u8; 7],
    pub market: [u8; 32],
    pub next_order_id: u64,
    pub active_count: u32,
    pub _pad1: [u8; 4],
    pub slots: [Order; ORDER_CAPACITY],
}
\`\`\`

2112 bytes per market. Bids and asks share the same slot pool, distinguished by the \`side\` byte on each \`Order\`. \`size == 0\` means "empty slot." There is no sort order — slot positions are determined by "first empty slot wins" in linear scan order.

This is the wrong choice for production for one specific reason: **best-bid / best-ask lookup is O(N).** Every matching engine starts by asking "what is the highest bid?" and "what is the lowest ask?", and our array forces a scan of all 32 slots to answer either question. A slab or critbit answers in O(1) or O(log N).

So why pick it?

- **It exposes the cost.** The CU log shows the linear scan happening. A student can run \`book --place\` and watch the CU rise as the book fills (by a few CU per order; §7.3).
- **It is easy to verify.** Two \`for\` loops over an array. No invariants to break. No subtle off-by-one in tree rebalancing.
- **It is enough for Chapter 7.** This chapter is about the data layout and the cost shape. Chapter 8 will introduce matching, and *that* is where the wrong choice becomes a real problem — at which point we have permission to refactor to a slab.

Building the wrong thing first, correctly, then refactoring once we know what the right thing must do, is a reasonable pedagogical sequence. Building the right thing first, before understanding what makes it right, would skip the lesson.

> **Exercise §7.1.** Look at \`solana-program-2.3.0/src/system_instruction.rs:9\` (the deprecation note) and consider: what if our \`_reserved\` were a \`Vec<u8>\` instead of a fixed array? Why does that break Pod? (Hint: re-read Chapter 1's discussion of layout.)

---

## §7.2  The \`Order\` slot and the empty-slot convention

\`Order\` is 64 bytes, Pod, repr(C). From \`crates/state/src/lib.rs\`:

\`\`\`rust
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct Order {
    pub order_id: u64,    // 0..8
    pub price: u64,       // 8..16
    pub size: u64,        // 16..24  (size == 0 ⇒ empty slot)
    pub owner: [u8; 32],  // 24..56
    pub side: u8,         // 56
    pub _pad: [u8; 7],    // 57..64
}
\`\`\`

64 bytes is a power of two and aligns well with cache lines on every reasonable architecture. The \`_pad\` exists so the struct ends on an 8-byte boundary and \`[Order; N]\` packs without gaps.

The **empty-slot convention** is \`size == 0\`. A fresh \`OrderBook\` has all slots zeroed (System program's \`create_account\` always zero-initializes). \`place_order\` searches for the first slot with \`size == 0\`, writes the new order there, and increments \`active_count\`. \`cancel_order\` overwrites the matched slot with \`Order::zeroed()\`, decrementing \`active_count\`. No compaction.

Why \`size == 0\` and not a separate \`is_active: bool\`?

- A boolean field would cost a byte plus padding to maintain alignment. The \`size\` field already exists and a real order always has \`size > 0\`. Repurposing it as the active sentinel saves the extra field.
- Zero-initialization on account creation makes the convention work for free: a newly allocated \`OrderBook\`'s slots are all "empty" without any explicit setup pass.

The cost is a one-line invariant the program must respect: never write an \`Order\` with \`size == 0\`. \`place_order\` rejects \`size == 0\` in the payload as its first guard (\`cancel_order\` takes only an order id, and writes an all-zero \`Order\` on purpose to empty the slot). From \`process_place_order\` (lib.rs:1183–1186):

\`\`\`rust
if price == 0 || size == 0 {
    msg!("place_order: price and size must be > 0");
    return Err(ProgramError::InvalidInstructionData);
}
\`\`\`

That's the price of repurposing the field. Anchor's \`#[derive(BorshSerialize)]\` accounts often have an explicit \`is_active: bool\` so the field semantics are independent — at the cost of an extra byte per slot times N slots per book times M books. For us, the tradeoff lands in favor of repurposing.

> **Exercise §7.2.** Add a field to \`Order\` called \`_pad2: [u8; 16]\` and re-run \`cargo test -p openhl-state\`. The \`order_size_is_64_bytes\` test will fail. Then add \`pub const LEN: usize = 80;\` to keep the rest of the code typing-correct, and observe what happens to \`OrderBook::LEN\` in the size test. What is the relationship?

---

## §7.3  Walking \`place_order\`

From \`programs/openhl-core/src/lib.rs:1162–1253\`. The handler decomposes into three parts.

**Validation** (lines 1167–1210): payload size, side byte (must be 0 or 1), price and size non-zero, user is a signer, book owner matches our program, book size matches \`OrderBook::LEN\`, book discriminator matches.

**The linear scan** at lines 1216–1222:

\`\`\`rust
let mut chosen_slot: Option<usize> = None;
for (i, slot) in book.slots.iter().enumerate() {
    if slot.size == 0 {
        chosen_slot = Some(i);
        break;
    }
}
\`\`\`

Scan from index 0, take the first slot with \`size == 0\`, break. Worst case: book is full. Then the loop runs all 32 iterations and returns \`None\`, which triggers the "book full" branch and returns \`AccountDataTooSmall\`. Best case: slot 0 is empty (the book is fresh). One iteration.

The CU cost shape, measured (whole instruction, LiteSVM, with \`fuzz/matching\`'s \`ch7_grid\` test; Chapter 4 §4.5 checked that LiteSVM counts like \`solana-test-validator\`):

| Book before the place | Iterations | CU |
|---|---|---|
| empty | 1 | 2,357 |
| 8 orders | 9 | 2,374 |
| 16 orders | 17 | 2,417 |
| 24 orders | 25 | 2,433 |
| 31 orders | 32 | 2,446 |
| 32 orders (full) | 32 + error | fails (we did not measure failed calls) |

The scan is linear, and cheap: 89 CU from an empty book to 31 orders, about 3 CU per slot visited. (An earlier draft estimated about 50 CU per slot, 1,550 CU at 31 orders; it was more than ten times too high.) Almost all of the 2,357 is the fixed cost of an instruction: entry, validation, the two \`sol_log_compute_units\` calls and the \`msg!\` lines. So the *shape* is the lesson here more than the size: O(N) means the cost grows with the data, but at 32 slots and a few CU per slot it hardly shows. It shows in Chapter 8, where the scan runs once per fill, and with a bigger book. For comparison, Chapter 15's slab places an order into 1,023 others for 1,954 CU, less than this array charges at 16.

**The write** (lines 1228–1242): increment \`next_order_id\`, increment \`active_count\`, copy the user pubkey into \`owner\`, construct an \`Order\` literal, drop it into the chosen slot. All O(1) once the slot is found.

The CU brackets at lines 1203 (before scan) and 1250 (after write) let you read the cost from the validator log. Two \`sol_log_compute_units\` calls, subtract, get the CU consumed between them: the scan and the write, plus the data borrow, the discriminator check and the logging in that range.

> **Exercise §7.3.** Pre-populate the book with N orders for various N (say 0, 8, 16, 24, 31) and then place a single new order. Record the CU consumed (between the two log calls) for each N. Plot it. It should be linear in N, with a slope of a few CU per order: compare your numbers with the table above.

---

## §7.4  Walking \`cancel_order\`

\`process_cancel_order\` (lines 1260–1327) is structurally the same as \`place_order\` — linear scan, then mutation — but with a different match key and a different mutation.

**The scan** at lines 1295–1301:

\`\`\`rust
let mut found: Option<usize> = None;
for (i, slot) in book.slots.iter().enumerate() {
    if slot.size != 0 && slot.order_id == order_id {
        found = Some(i);
        break;
    }
}
\`\`\`

\`slot.size != 0\` skips empty slots; \`slot.order_id == order_id\` selects by ID. Worst case is "order is in the last slot" or "order not found" — both pay full O(N).

**The authorization check** at lines 1307–1311:

\`\`\`rust
if book.slots[slot_idx].owner != *user_ai.key.as_ref() {
    msg!("cancel_order: caller is not the order owner");
    return Err(ProgramError::IllegalOwner);
}
\`\`\`

Only the order's original placer may cancel it. The \`owner\` field on the slot is the cancel-authorization mechanism. This is a per-slot check, not a per-book check — there is no single "operator can cancel anything" path, which is appropriate for an open CLOB but would be different for a vault-managed strategy.

**The zero** at line 1315:

\`\`\`rust
book.slots[slot_idx] = <Order as bytemuck::Zeroable>::zeroed();
\`\`\`

\`Order::zeroed()\` returns the all-zeros \`Order\`. The \`<Order as bytemuck::Zeroable>::zeroed()\` qualified-syntax is needed because \`Order::zeroed\` is not in scope as an inherent method — it comes from the \`bytemuck::Zeroable\` trait. Once written, the slot's \`size\` is 0 and the next \`place_order\` scanning for an empty slot will see this position as available.

The CU cost is symmetric to \`place_order\`: best case is "matched at slot 0" (1 iteration); worst case is "not found" (N iterations + error). We measured 1,994 CU for the order in the first slot of a full book and 2,177 for the one in the last, about 6 CU per slot visited (the "not found" path fails, and we did not measure failed calls). The brackets at lines 1284 and 1324 let you measure.

> **Exercise §7.4.** Place 10 orders, then cancel order_id 5. Then place another order. Which slot does the new order land in? Trace the slot allocation through the dump output of \`book\` (no flags) before and after each operation.

---

## §7.5  Why this design will not survive Chapter 8

Chapter 8 implements matching. The core matching loop is "for each incoming taker order, find the best resting maker on the opposite side and cross until exhausted." In O(log N) data structures that loop terminates with one tree lookup per crossing. In our flat array, the loop must:

1. Linear-scan every taker → O(N) per taker
2. For each match attempt, linear-scan every maker → O(N) per maker check
3. With M takers crossing K makers, the total cost is O(M × K × N) just to find the right slots, before any token movement happens

At ORDER_CAPACITY = 32, M = 10, K = 5, this is ~1600 array-traversals per match instruction. An earlier draft priced that at about 80,000 CU of pure scanning, using the 50 CU per slot above; with the measured few CU per slot it is a few thousand. Chapter 8's matcher, which scans the book once per fill, measured 12,662 CU for 5 fills against a full book and 22,250 for 10, everything included. The default budget is 200,000.

So the flat book's problem at 32 slots is not this instruction's budget. It is what happens as the book grows: every fill scans every slot, so the cost is O(fills × N), and Chapter 8 §8.2 shows a 128-slot book running out of budget. Adding token movement to each fill (a CPI to SPL Token per transfer) makes that come sooner. We will need to either:

- Refactor to a slab — the production answer
- Raise the CU limit via \`ComputeBudgetInstruction::set_compute_unit_limit\` — the band-aid
- Limit matching per-instruction to N crossings and require multiple matcher invocations — the workaround

Chapter 8 explores all three and explains why slab is the only one that actually scales; Chapter 15 ships the slab implementation. For now, the flat array is correct, slow, and visibly so. That visibility is the prerequisite for understanding what the refactor buys us.

**What Anchor hides:** Anchor's \`#[account(zero_copy)]\` attribute makes \`bytemuck\`-cast accounts available with typed field access. It does nothing about choosing the right data structure — that decision is yours regardless of the framework. Anchor programs with naive \`Vec<Order>\` book layouts blow CU budgets just as fast as ours would in the matcher.

---

## §7.6  Recap + verify yourself

### Recap diagram

\`\`\`
OrderBook account (2112 bytes, owned by openhl-core):

  ┌──────── header (64 bytes) ────────────────────────────────────┐
  │ discriminator   bump  _pad0  market  next_order_id  active   │
  │                                       (u64)         (u32)    │
  └──────────────────────────────────────────────────────────────┘
  ┌──────── slots [Order; 32] (2048 bytes) ──────────────────────┐
  │ [0] Order or empty                                            │
  │ [1] Order or empty                                            │
  │ ...                                                           │
  │ [31] Order or empty                                           │
  └──────────────────────────────────────────────────────────────┘

  Each Order (64 bytes):
    order_id (u64) | price (u64) | size (u64, 0 = empty)
    owner ([u8;32]) | side (u8, 0=bid 1=ask) | _pad ([u8;7])

place_order(side, price, size):
  validate → scan slots[0..32] for first size==0 → write → done
  cost: O(active_count + 1)

cancel_order(order_id):
  validate → scan slots[0..32] for order_id → owner check → zero
  cost: O(N) worst case, O(matched_position) best
\`\`\`

### Three things to verify yourself

1. **Linear cost.** Run \`book --init\`, then place 30 orders, then place a 31st. Compare the \`sol_log_compute_units\` delta between the start-of-handler reading and the after-write reading. The 31st-order placement should cost roughly 30× more in the scan portion than the 1st-order placement did. Subtract a constant (the validation/CPI/log overhead) to isolate the scan cost itself.
2. **Empty-slot convention.** Place 5 orders, cancel order 3, then place a 6th. The 6th order should land at slot index 2 (the slot vacated by cancel), not at slot index 5. The "first empty slot wins" rule fills holes left by cancellations.
3. **Pod-layout invariants stay enforced.** \`cargo test -p openhl-state\` runs three Order/OrderBook layout tests. Change \`ORDER_CAPACITY\` to 33, recompile. The \`order_book_size_matches_layout\` test should now show \`2112 → 2176\`. That stable, predictable byte count is why bytemuck works at all on this struct.


### What a fuzzer can and cannot check here

The checks in \`place_order\` and \`cancel_order\` are about two accounts, the signer and the book, and one rule: only an order's owner may cancel it (§7.4). That rule is out of reach of a [solinv](https://github.com/psyto/solinv)-style account swap, because the order to cancel is named by its id in the instruction data, not by an account. So it is pinned by a test instead: \`cancel_refuses_another_users_order\` in [\`fuzz/matching/\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/matching) has someone else cancel the maker's order and expects \`caller is not the order owner\`. Delete the owner check and rebuild: the test fails (we checked). Chapters 3, 6 and 12 show what the fuzzer does find, the bindings between accounts; Chapter 13 §13.6 shows how to state a rule like this one as a guard when the values live in account fields.

The numbers in §7.3 and §7.4 come from the same harness: \`cargo test --release --features invariant_ch8 -- --ignored --nocapture ch7_grid\` in \`fuzz/matching\`, after building the program as in Chapter 3 §3.7.

---

## Hook into Chapter 8

You have a book. You can fill it. You can cancel orders out of it. What you cannot yet do is **cross** a bid against an ask. A taker order arrives, scans the opposite side for the best price, fills against the maker, repeats until either side runs out. This is matching, and it is the single most CU-hungry operation in any perp DEX.

Chapter 8 implements \`Match\` (or \`Take\`, depending on the flavor) — an instruction that takes a taker order, walks the resting book, and produces fills. We will see exactly why the flat-array layout from this chapter cannot survive any real load, write a working slab implementation as the replacement, and measure the CU difference. The matcher is the place where every Phase A constraint — CU budget, heap discipline, parallelism — converges into a single design problem.
`,
                },
                {
                  title: "Chapter 8 — Matching Engine Under CU Pressure",
                  slug: "solana-internals-ch08-matching-en",
                  type: 'CONTENT',
                  sortOrder: 2,
                  duration: 45,
                  xpReward: 100,
                  content: `# Chapter 8 — Matching Engine Under CU Pressure

> Status: draft (v0.1).
> Companion code: [\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs) (\`process_match\` at lines 1365–1493), [\`scripts/match/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/match/src/main.rs), [\`fuzz/matching/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/matching/src/main.rs) (the solinv harness for §8.6).
> Builds on Chapter 7's \`OrderBook\` data structure.

---

## §8.0  Framing — what this chapter teaches

Chapter 7 hooked a slab implementation here; that promise moved to its own chapter (15) because the slab grew big enough to deserve one. This chapter is about the **CU cost shape** of matching against the flat-array book Chapter 7 shipped — measured precisely, with the three responses to CU exhaustion (raise the budget, paginate via \`max_fills\`, refactor to a slab) named and costed. The slab pseudocode in §8.4 is the design spec that Chapter 15's code implements.

So this chapter:

1. Walks the \`Match\` algorithm on the flat book.
2. Reads its CU cost shape from real logs and shows it is O(fills × N).
3. Demonstrates the three CU-pressure responses (budget raise, pagination, slab refactor) and explains which costs what.
4. Provides slab pseudocode + diagrams as the design spec; Chapter 15 ships the implementation.

---

## §8.1  The Match algorithm on a flat book

From \`programs/openhl-core/src/lib.rs:1365–1493\`. The handler takes four payload fields:

\`\`\`text
[side u8][limit_price u64 LE][size u64 LE][max_fills u8]
\`\`\`

\`side\` is the *taker's* side (a bid taker buys against asks, an ask taker sells against bids). \`limit_price\` is the worst price the taker will accept. \`size\` is total base units to take. \`max_fills\` is the per-instruction cap on how many resting maker orders to cross — the pagination knob.

The matching loop at lines 1424–1483:

\`\`\`rust
let mut fills_done: u8 = 0;
while remaining > 0 && fills_done < max_fills {
    // (a) linear scan for best opposite-side resting order
    //     whose price is acceptable to the taker
    let mut best: Option<(usize, u64)> = None;
    for (i, slot) in book.slots.iter().enumerate() {
        if slot.size == 0 || slot.side != maker_side { continue; }
        let price_acceptable = match taker_side {
            side::BID => slot.price <= limit_price,
            side::ASK => slot.price >= limit_price,
            _ => unreachable!(),
        };
        if !price_acceptable { continue; }
        // ... "is this better than current best?" check ...
    }

    // (b) if no acceptable maker exists, stop
    let (maker_idx, fill_price) = match best { Some(b) => b, None => break };

    // (c) cross: min(taker_remaining, maker_remaining)
    let maker = &mut book.slots[maker_idx];
    let fill_size = remaining.min(maker.size);
    maker.size -= fill_size;
    remaining -= fill_size;
    fills_done += 1;

    // (d) if maker fully filled, vacate slot
    if maker.size == 0 {
        *maker = <Order as bytemuck::Zeroable>::zeroed();
        book.active_count = book.active_count.saturating_sub(1);
    }
}
\`\`\`

Five steps per fill. Two things to absorb.

**Each fill costs a full O(N) scan.** Step (a) walks every slot in the book to find the best opposite-side order. This is the design decision in \`OrderBook\` from Chapter 7 — bids and asks share an unsorted slot pool. There is no shortcut. Finding the lowest ask requires looking at every slot.

**The work is multiplicative.** With \`fills_done\` fills in a single instruction call, total scan work is \`fills_done × ORDER_CAPACITY\`. With ORDER_CAPACITY = 32 and a 10-fill cross, that's 320 slot inspections plus the per-inspection comparison overhead. Each inspection is cheap (~30 CU), so 320 inspections is ~10 KCU just for the scan. The actual write work is constant.

The handler deliberately omits the *settlement* step. A real exchange would also move quote tokens from taker to maker for each fill (via SPL Token CPI). Each such CPI is ~3,000 CU. Inside a 10-fill match that adds 30,000 CU on top of the scan work, putting us at ~40 KCU minimum before any logging or program housekeeping. The default 200 KCU budget would still cover this — but the headroom is shrinking, and N = 32 is the *smallest* book worth talking about.

> **Exercise §8.1.** Pre-populate the book with 10 asks at increasing prices (e.g., 100, 101, 102, ...). Run \`match-cli --side bid --limit-price 110 --size 50 --max-fills 5\`. Trace the program log: which 5 makers does the matcher cross, in what order, and what is the resulting \`taker_remaining\`?

---

## §8.2  Reading the CU cost shape

Run the matcher with \`--max-fills\` varying from 1 to 16 against a half-full book (16 active makers, all bids, taker is an ask matching against them):

| max_fills | units consumed | per-fill marginal |
|-----------|----------------|-------------------|
|   1       |    4,254       |   —               |
|   2       |    5,950       |   1,696           |
|   4       |    9,276       |   1,663           |
|   8       |   15,637       |   1,590           |
|  16       |   27,220       |   1,448           |

(Measured with \`fuzz/matching\`'s \`grid\` test, which runs the real program in LiteSVM; Chapter 4 §4.5 checked that LiteSVM and \`solana-test-validator\` 4.1.2 count the same. An earlier draft of this table, from an older toolchain, read about 3,500 CU per fill. Measure your own.)

Per-fill marginal cost is roughly constant, about 1.5 KCU for a 16-maker book. Part of it is the linear scan, which visits all 32 slots on every fill, empty or not. Part is the maker write and the \`msg!\` line each fill logs. We did not split it further; the number that matters is how it grows.

It grows with the book, but slowly at this size. Four fills against 8, 16, 24 and 32 makers cost 8,500, 9,276, 9,980 and 10,680 CU: about 22 CU per extra active maker per fill. A full 32-slot book can never hold more than 32 makers, so a single \`Match\` here makes at most 32 fills: 57,696 CU with \`max_fills = 32\`. Asking for more adds one more scan that finds nothing, and that is the worst case: 58,148 CU with \`max_fills = 255\`, well inside the 200K default. To see the budget break, make the book bigger. With \`ORDER_CAPACITY = 128\` (in \`crates/state\`), one fill against 128 makers costs 7,565 CU and 16 fills 80,533, so each fill after the first adds about 4,900; 64 fills against 64 makers cost 194,916, and 64 fills against 128 makers no longer fit at all.

This is the cost shape the chapter exists to make visible. The flat matcher's per-fill cost grows linearly with the book size. The total per-instruction cost is \`O(fills × N)\`. Both factors are knobs you might want to push (more fills per call, bigger book). Push either far enough and the budget breaks; at 32 slots, "far enough" is further than the book can go.

**What the SDK hides:** Anchor's program logs include the same "consumed N of M compute units" line because it comes from the runtime, not the user code. But Anchor does not surface a typed \`units_consumed\` field anywhere — you read it from the simulation result like we do here, with \`sim.value.units_consumed\`.

> **Exercise §8.2.** With the book at 30/32 capacity, run the matcher with \`--max-fills 30\`. We measured 54,935 CU on a full book: comfortably inside the default. Now set \`ORDER_CAPACITY = 128\` in \`crates/state/src/lib.rs\`, rebuild the program, fill the book with 128 makers, and run \`--max-fills 64\`. It should fail with \`ComputationalBudgetExceeded\`. Add \`--cu-limit 400000\` and re-run. Does the on-chain commit succeed? At what \`max_fills\` does it stop succeeding even at \`--cu-limit 1400000\` (the network maximum)?

---

## §8.3  Three responses to CU pressure

When a matcher (or any handler) starts pressing against the budget, you have three real options. Each has costs.

### (1) Raise the per-tx compute unit limit

The easiest fix and the worst long-term answer. Prepend a \`ComputeBudgetInstruction::set_compute_unit_limit(N)\` to your transaction, with N up to 1,400,000. From Chapter 4, we know this works for any single transaction. From \`scripts/match/src/main.rs\`:

\`\`\`rust
if let Some(limit) = cli.cu_limit {
    instructions.push(ComputeBudgetInstruction::set_compute_unit_limit(limit));
}
instructions.push(match_ix);
\`\`\`

**Cost:** Priority fees scale with the requested limit, not the actual consumption. A transaction that requests 1.4M CU and uses 100K still pays the priority fee against a 1.4M ceiling. At network capacity (~50 K-CU/slot at high contention), large requests can also starve other transactions in the same slot.

**When it's the right answer:** for instructions that genuinely need >200K CU one time per call (initial setup, occasional bulk operations) and where priority fee dilution is acceptable.

### (2) Paginate via \`max_fills\`

The matcher already supports this. Cap the work per call, expose the cap to the caller, and let clients iterate until done:

\`\`\`text
match --max-fills 8
match --max-fills 8     # next page
match --max-fills 8     # next page
...
\`\`\`

Each call fits comfortably in the budget. Total network cost is the same (you do the same matching work either way), but it's spread across multiple transactions instead of one.

**Cost:** Multiple round trips. Risk that another transaction modifies the book between your matcher pages (you lose atomicity across pages — book state can change between page N and page N+1, and your matcher needs to handle that gracefully). Per-transaction fee overhead multiplied by page count.

**When it's the right answer:** for matchers where atomicity across the whole cross isn't required (HFT-style takers expecting to slice anyway), or as an emergency stopgap before a slab refactor.

### (3) Refactor to a slab

The production answer. Replace the flat \`[Order; N]\` slots array with:

- A **node pool**: a fixed-size arena of nodes, with a separate free-list of indices for vacated slots. Insertions and cancellations are O(1) once the right slot is found.
- A **per-price-level FIFO**: at each price, a doubly-linked list of order nodes in FIFO order. Best-price advance during matching is just \`head.next\`.
- A **critbit tree of price levels**: keyed on price, sorted, supports O(log N) "best price" and "insert new price level" operations.

The matcher becomes:

\`\`\`text
while remaining > 0 and fills_done < max_fills:
    level = tree.find_best_acceptable(taker_side, limit_price)   # O(log N)
    if level is None: break
    fill_size = min(remaining, level.head.size)
    cross with level.head
    if level.head.size == 0:
        level.pop_head()        # O(1)
        if level.is_empty():
            tree.remove(level)  # O(log N)
    fills_done += 1
\`\`\`

Per-fill cost is \`O(log N)\` instead of \`O(N)\` when prices are spread out: for N = 1024, ~10 vs ~1000 inspections per fill. A critbit is not self-balancing, though. Its depth follows the bits of the prices, up to the key's 64 bits, and a maker who picks prices can make it that deep (Chapter 15 §15.7 measures this). The matcher fits in budget for realistic books, and a cap on \`max_fills\` keeps it there for adversarial ones.

**Cost:** Significant implementation effort. A correct critbit + node pool + FIFO is roughly 1,500 lines of careful Rust with strong invariants (every node either lives in the tree+queue or on the free-list; every level either has ≥1 order or is gone from the tree). Audit cost is correspondingly higher. The whole thing is \`bytemuck::Pod\`-friendly but requires care: the tree nodes carry indices into the pool, not pointers.

**When it's the right answer:** for production CLOBs with non-trivial liquidity. Phoenix and Serum both use this design for good reasons.

The slab implementation lives in Chapter 15, which walks the code produced from the design spec below.

---

## §8.4  Slab pseudocode

A minimum slab structure, in pseudo-Rust:

\`\`\`rust
const POOL_CAPACITY: usize = 1024;
const TREE_CAPACITY: usize = 256;   // tree nodes: about 128 price levels per side (leaves + inner nodes)

#[repr(C, Pod)]
struct Slab {
    discriminator: [u8; 8],
    bump: u8,
    _pad: [u8; 7],

    // Node pool — each slot is either a live OrderNode or part of free_list
    nodes: [OrderNode; POOL_CAPACITY],
    free_head: u16,         // index of first free node, or NONE_INDEX

    // Critbit-tree of price levels — bid tree separate from ask tree
    bid_tree: CritbitTree,
    ask_tree: CritbitTree,
}

#[repr(C, Pod)]
struct OrderNode {
    order_id: u64,
    owner: [u8; 32],
    size: u64,
    next: u16,              // next OrderNode in this price level's FIFO
    prev: u16,              // prev OrderNode in this price level's FIFO
    _pad: [u8; 4],
}
// 64 bytes per node, [OrderNode; 1024] = 64 KiB. Fits with a 64 KiB
// account if you don't pack much else.

#[repr(C, Pod)]
struct CritbitTree {
    nodes: [TreeNode; TREE_CAPACITY],
    root: u16,
    free_head: u16,
}

#[repr(C, Pod)]
struct TreeNode {
    // Critbit-style: either an INNER node (split bit + two child indices)
    // or a LEAF node (price + head/tail of FIFO queue).
    tag: u8,                // 0 = leaf, 1 = inner
    // ... layout depends on tag
}
\`\`\`

Key operations and their costs:

- **insert(order)**: critbit walk to find the price level (O(log N) where N = number of distinct price levels), if level doesn't exist create it (one tree node allocation), pop a node from \`free_head\`, fill it, push to the level's tail. Total: O(log N) tree work + O(1) pool work.
- **best_price(side)**: critbit walk to the leftmost (asks) or rightmost (bids) leaf. O(log N).
- **match_top(side, max_size)**: best_price → head of FIFO → cross → if head fully filled, pop head, push node back to \`free_head\`, if level empty, remove from tree. O(log N) per fill.

The pedagogical points to absorb if you do implement this:

1. **Use indices, not pointers.** \`bytemuck::Pod\` doesn't allow pointer fields. Use \`u16\` indices into the pool and tree arrays. \`u16\` is enough for 65k entries — plenty for most books.
2. **A sentinel \`NONE_INDEX = u16::MAX\`.** No \`Option<u16>\` — that would push the struct out of Pod safety. Use the sentinel.
3. **Free-list as singly-linked stack.** Free nodes' \`next\` field points to the next free node. Allocation pops \`free_head\`; deallocation pushes to \`free_head\`. O(1) both ways.
4. **Critbit, not red-black.** Critbit trees have simpler rebalancing rules and don't need rotation logic. Serum uses critbit; Phoenix uses critbit. The pattern is well-trodden.
5. **One tree per side.** Bids and asks have different "best" semantics (max vs min). Keep two trees and you avoid threading a comparator through the tree code.

Implementing slab is a 3-4 day exercise if you've never done it before. The first day is the pool + free-list. The second is critbit insert/remove. The third is wiring it into a matcher. The fourth is testing edge cases (book full, level full, all-or-nothing fills). Chapter 15 walks the resulting implementation.

> **Exercise §8.4.** Build the pool + free-list piece *from scratch* before reading Chapter 15. Write a \`Pool<OrderNode, 1024>\` with \`alloc() -> Option<u16>\` and \`free(idx: u16)\` methods. Verify with 10,000 random alloc/free pairs that the pool always has the right \`available_count\`. Then compare to Chapter 15's \`pool_alloc_node\` / \`pool_free_node\`. The invariants are easy to break; checking against a working implementation is part of the value.

---

## §8.5  What we shipped vs. what's enough

This chapter shipped a working matcher on the flat book with pagination. That's enough for:

- A learning artifact: the matcher is auditable, ~110 lines of Rust, and the CU cost shape is observable.
- A low-throughput production deployment: a market with \`<= 32\` resting orders matching \`<= 16\` fills per call comfortably fits the 200 KCU budget.
- Educational research: experiment with matching rules (price-time priority is what we did; pro-rata, time-weighted-pro-rata, last-look — any of these slot into the same handler shape).

It is not enough for:

- A book holding hundreds or thousands of resting orders.
- A matcher that needs to atomically process large takers.
- Any HFT-style use case where latency-per-fill matters.

For those, ship the slab. The pseudo-code in §8.4 is the design spec and Chapter 15 is its implementation.

---

## §8.6  Recap + verify yourself

### Recap diagram

\`\`\`
Match on flat book (this chapter):

  Per fill:    O(N) scan + O(1) write     → O(K × N) total
  Per K=16 on ORDER_CAPACITY=32 book:    ~27 KCU (16 makers), 33 KCU (32)
  Failure mode:  none at 32 slots (worst case 32 fills + one empty scan ≈ 58 KCU);
                 CU exhaustion past ~40 fills at 128 slots


Match on slab (Chapter 15, pseudocoded above):

  Per fill:    O(log N) tree walk + O(1) FIFO advance  →  O(K × log N) total
  Per K=16 on a 1,024-order slab:          22 KCU (measured, §15.6)
  Failure mode:  pool exhaustion (handle with separate place_order rejection);
                 CU on long matches over deep price keys (§15.7)


Three responses to CU pressure:

  1. ComputeBudgetInstruction::set_compute_unit_limit(N)
     - Budget extension up to 1.4M CU.
     - Cost: priority fees against the requested ceiling, not actual usage.

  2. max_fills pagination
     - Cap work per call, multiple round-trips.
     - Cost: lost atomicity across pages, fee per page.

  3. Slab refactor
     - O(log N) per fill instead of O(N).
     - Cost: implementation + audit work.
\`\`\`

### Three things to verify yourself

1. **Cost grows multiplicatively.** Pre-populate the book with 8, 16, 24 active makers. For each, run \`match-cli\` with \`--max-fills 4\` (constant). Record \`units_consumed\`. They grow with N, but at this size the fixed part of each fill dominates: we measured 8,500, 9,276 and 9,980. The \`O(K × N)\` term is there (about 22 CU per extra maker per fill); it just needs a bigger N to matter (§8.2).
2. **Pagination has correct subtotals.** Run \`match-cli\` with \`--max-fills 16\` against a full 32-maker book and a 10-unit taker. Note \`units_consumed\` and the post-state \`active_count\`. Now do the same matcher work as two calls with \`--max-fills 8\`. The sum of both calls' \`units_consumed\` should be very close to the single 16-call's number (slightly higher due to two \`process_match\` setup overheads). With a taker large enough to take all 16, we measured 33,020 for one call and 18,476 + 17,072 for two.
3. **Budget raise is real.** A 32-slot book cannot hold a match too large for the default budget: 25 fills against a packed 32-maker book measured 47,645. Raise \`ORDER_CAPACITY\` to 128 (as in Exercise §8.2), fill the book, and run 64 fills without \`--cu-limit\`. It should fail. Add \`--cu-limit 500000\`. Should succeed. Confirm that \`sim.value.units_consumed\` is between the default 200,000 and 500,000.


### Now let a tool look for the expensive match

Chapter 4 §4.7 ran [solinv](https://github.com/psyto/solinv)'s cu-dos check on \`Bench\`, whose cost the caller picks on purpose. \`Match\` is the instruction other people depend on, and its cost is picked by two parties: the taker chooses \`max_fills\`, and the makers choose how full the book is. [\`fuzz/matching/\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/matching) fills the book with 32 bids (the most it holds; cu-dos restores it after every attempt), lets the taker pick any \`max_fills\` from 1 to 255, and declares a cap of 50,000 CU (\`MATCH_CU_CAP\`) for one \`Match\`. Set up as in Chapter 3 §3.7, then:

\`\`\`bash
cargo build-sbf --manifest-path programs/openhl-core/Cargo.toml
cd fuzz/matching
cargo build --release --features invariant_ch8
cargo test --release --features invariant_ch8      # cost grows with the book
timeout -s INT 60 crucible run openhl_matching_fuzz invariant_ch8 \\
    --binary-in target/release/invariant_test --timeout 45
\`\`\`

> **Exercise §8.6.** Run it. Within seconds you should see lines like
>
> \`\`\`
> [FUZZ_FINDING] [cu-dos:…] ix match consumed 58148 CU (cap 50000)
> \`\`\`
>
> The taker asked for more fills than the cap allows on a full book; 58,148 is the full-book worst case from §8.2. In Chapter 4 the lesson was that raising the cap to the runtime's limit fixes nothing. Here there is a real fix, because the worst case is bounded: the book has 32 slots, and the program decides how much work one call may do. From the §8.2 numbers, how large may \`max_fills\` be for a full book to stay under 50,000? Add \`if max_fills > N { return Err(...) }\` to \`process_match\` with your answer, rebuild, and run again.
>
> The measurements answer it. On a full book, 26 fills cost 49,147 and 27 cost 50,627, so 26 is the largest that fits. A partly full book costs less for the same cap (28 asked of 27 makers: 48,011), because the fills stop when the makers run out, so the full book is the worst case for any cap. We used 24, to leave room for the next toolchain's prices, and the fuzzer then found nothing in 45 seconds, as the bound predicts. That is option (2) of §8.3, pagination, made mandatory: a taker who wants more fills sends more calls. It holds only while the book stays at 32 slots. At 128 slots the first fill costs 7,565 CU and each later one about 4,900, so the same cap would let a call cost about 119,000, and the cap would have to come down with every increase in \`ORDER_CAPACITY\`. That coupling is the argument for option (3), the slab (Chapter 15), whose per-fill cost grows with log N rather than N (§8.4).

---

## Hook into Chapter 9

You now have a market with a vault and a matcher. What you don't have is a **mark price**. The matcher crosses orders against each other, but the *price* in a perp DEX has two sources of truth: the trade tape (last fill price, which our matcher implicitly produces) and an external oracle (Pyth, Switchboard) that pins the mark to spot. Funding rate, liquidation triggers, and risk math all depend on the oracle mark, not the last fill.

Chapter 9 walks Pyth integration: the price-account layout, how to read it inside an instruction handler without trusting our own derserialization, how to handle stale prices (\`slots_since_published\`), and how to fall back to a Switchboard secondary if Pyth is unavailable. The chapter culminates in the program reading an external mark price and using it to validate that a \`place_order\` price is within a sanity band — the first real risk control in the program.
`,
                },
                {
                  title: "Chapter 9 — Oracle Ingestion: Pyth Internals",
                  slug: "solana-internals-ch09-oracle-en",
                  type: 'CONTENT',
                  sortOrder: 3,
                  duration: 45,
                  xpReward: 100,
                  content: `# Chapter 9 — Oracle Ingestion: Pyth Internals

> Status: draft (v0.1).
> Companion code: [\`crates/state/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/state/src/lib.rs) (\`Oracle\`, plus the Pyth v1 and v2 layout constants for §9.5), [\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs) (\`process_create_oracle\`, \`process_set_oracle_price\`, \`process_place_order_checked\`, \`process_place_order_checked_pyth\`, \`process_place_order_checked_pyth_v2\`, and the \`read_fresh_oracle\` / \`read_fresh_pyth_v1_oracle\` / \`read_fresh_pyth_v2_oracle\` helpers), [\`scripts/oracle/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/oracle/src/main.rs), [\`programs/openhl-core/tests/pyth_binding.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/tests/pyth_binding.rs) (the feed-pinning tests for §9.5).
> Reference targets: Pyth Network mainnet program (\`FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH\`), Switchboard On-Demand.
>
> Since the parts split, the logic this chapter walks through lives in [\`crates/oracle/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/oracle/src/lib.rs) (\`openhl-oracle\`); the program calls it. The code quoted below is the pre-split version from \`programs/openhl-core/src/lib.rs\`, and its line numbers are not kept in sync.

---

## §9.0  Framing — and a deliberate mock

A perp DEX without an external price oracle is a derivatives market whose mark price is just "wherever the last trade happened." That works fine until a stale book or a thin moment lets the last trade drift away from the spot market — at which point your liquidation engine starts triggering on prices that have nothing to do with reality, and your insurance fund pays for it. The mark price is the load-bearing input to funding rate, liquidations, margin requirements, and every other risk-side computation in the program. It cannot come from the program's own trade tape; it must come from outside.

The standard answer on Solana is **Pyth Network** (with **Switchboard** as a common secondary). Both publish per-asset price accounts that any program can read. The accounts are owned by the publisher's program, not yours — you are strictly a reader.

This chapter is about how a reader handles oracle input safely. The job has three pieces:

1. Find the price account, validate its layout, read the price + confidence + exponent.
2. Check freshness via the Clock sysvar — refuse to operate on a stale price.
3. Apply the price to a meaningful program check — here, a sanity band on \`place_order\`.

For the worked example, we build our own \`Oracle\` account type that mirrors the shape of a Pyth price feed and is owned by our program. This is a deliberate scope call. A genuine Pyth integration would import \`pyth-sdk-solana\`, pull the price feed account's owner check from \`pyth_program_id\`, and parse a price-update message that has a non-trivial v2 format. Doing that here would teach the SDK call rather than the *reading pattern*. By owning our oracle locally we control the publish moment, which makes staleness experiments trivial — and the techniques (staleness check, sanity band, defensive parse) transfer directly. The chapter calls out the production differences carefully.

---

## §9.1  Pyth in shape, in summary

A real Pyth v1 price account is a ~3 KiB struct that includes a small header (magic + version + type + size), product association, and an array of recent price observations. The fields we actually need fit in 24 bytes:

\`\`\`text
price:        i64    // signed mantissa
conf:         u64    // 1-sigma confidence interval, same units
expo:         i32    // base-10 exponent (typically negative, e.g. -8 → 8 decimals)
publish_slot: u64    // slot at which this price was last updated
\`\`\`

The real mark price is \`price × 10^expo\`. The confidence interval \`conf × 10^expo\` bounds how tight the price is — a wide conf means the publisher is uncertain, and many programs refuse prices with \`conf > tolerance × price\`.

Our \`Oracle\` struct at \`crates/state/src/lib.rs\` carries exactly this shape, plus discriminator, bump, and the market it prices:

\`\`\`rust
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct Oracle {
    pub discriminator: [u8; 8],   // 0..8   — ORACLE\\0\\0
    pub bump: u8,                  // 8
    pub _pad0: [u8; 7],            // 9..16
    pub market: [u8; 32],          // 16..48
    pub price: i64,                // 48..56
    pub conf: u64,                 // 56..64
    pub expo: i32,                 // 64..68
    pub _pad1: [u8; 4],            // 68..72
    pub publish_slot: u64,         // 72..80
    pub _reserved: [u8; 32],       // 80..112
}
\`\`\`

112 bytes total, Pod, repr(C). Bytemuck-cast from the raw account data with no allocation, same trick as the OrderBook from Chapter 7.

The differences from a real Pyth integration, called out so they don't surprise you:

| Aspect | Our \`Oracle\` | Real Pyth |
|---|---|---|
| Account owner | openhl-core (our program) | Pyth program (\`FsJ3...epH\` on mainnet) |
| Owner check looks for | \`program_id\` (our own) | \`&pyth_program::ID\` |
| Account layout | this 112-byte struct | Pyth v1 PriceAccount (~3 KiB) or v2 update message |
| Update mechanism | \`SetOraclePrice\` instruction (our publisher) | Pyth publishers call into the Pyth program |
| Discriminator | \`ORACLE\\0\\0\` (our convention) | Pyth's magic constant + version field |
| Staleness clock | Clock sysvar \`slot\` (our publish_slot) | Pyth's \`publish_time\` + \`prev_publish_time\` |

Every column on the right has a direct counterpart in the column on the left. Everything you do with our \`Oracle\` you do with a real Pyth account, just with different magic numbers and a different owner check.

> **Exercise §9.1.** Look up Pyth's SOL/USD price account on mainnet. Note its size (in bytes), its owner program, and the first 4 bytes of its data (the Pyth magic constant). Compare to our \`Oracle\`'s size, owner, and first 8 bytes.

---

## §9.2  Writing the oracle — \`SetOraclePrice\`

For the chapter to exercise staleness scenarios we need a way to write the oracle at a known moment. From \`programs/openhl-core/src/lib.rs:1513–1571\`:

\`\`\`rust
fn process_set_oracle_price(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    payload: &[u8],
) -> ProgramResult {
    // ... payload + account validation ...
    msg!("set_oracle_price: open-auth publisher = {}", publisher_ai.key);

    let clock = Clock::get()?;
    let mut data = oracle_ai.try_borrow_mut_data()?;
    let oracle: &mut Oracle = bytemuck::from_bytes_mut(&mut data[..Oracle::LEN]);
    // ... discriminator check ...

    oracle.price = price;
    oracle.conf = conf;
    oracle.expo = expo;
    oracle.publish_slot = clock.slot;
    // ...
}
\`\`\`

Two things to absorb.

**\`Clock::get()?\` is a syscall.** The Clock sysvar carries \`slot\`, \`epoch\`, \`unix_timestamp\`, and a few related fields. It is the *only* way a program knows what slot it is currently executing in. Programs cannot read a wall clock and cannot trust the user to supply the current time. Stamping \`publish_slot = clock.slot\` at write time is the foundation of the staleness check we do at read time.

**The publisher check is missing on purpose.** The instruction accepts a signer but does not verify *which* signer. In production this is wrong — anyone with the program ID could write any price and trigger the sanity band to accept any limit. The fixes are:

1. **Pin to a known publisher pubkey.** Read a \`pub const ORACLE_PUBLISHER: Pubkey = ...;\` and check \`publisher_ai.key == &ORACLE_PUBLISHER\`. Simple, requires a publisher rotation procedure if the pubkey changes.
2. **Multi-publisher signature.** Store a set of acceptable publishers in the oracle account itself. Either signer must match.
3. **Hand off the account to Pyth.** Make the oracle account owned by the Pyth program, drop \`SetOraclePrice\` entirely. Now you cannot write the oracle yourself, which is the right architecture for production.

The chapter codes (1) and (2) as exercises and walks (3) in prose. The deliberate auth gap is so the reader can pause the price at known slots and run the staleness scenarios in §9.3.

> **Exercise §9.2.** Add a \`ORACLE_PUBLISHER: Pubkey\` constant to \`programs/openhl-core/src/lib.rs\` and an explicit check in \`process_set_oracle_price\` that \`publisher_ai.key == &ORACLE_PUBLISHER\`. Choose the constant to be your own wallet pubkey. Verify that \`oracle --set ...\` still works from your wallet but fails from a fresh keypair.

---

## §9.3  Reading the oracle — staleness as the foundational check

The reader pattern lives in a small helper \`read_fresh_oracle\` (lib.rs:1965–1987), called from \`process_place_order_checked\` and reused by the three position handlers Chapter 11 will add (so the gauntlet stays in one place rather than copied four times):

\`\`\`rust
fn read_fresh_oracle(
    oracle_ai: &AccountInfo,
    program_id: &Pubkey,
) -> Result<u64, ProgramError> {
    if oracle_ai.owner != program_id || oracle_ai.data_len() != Oracle::LEN {
        return Err(ProgramError::InvalidAccountData);
    }
    let oracle_data = oracle_ai.try_borrow_data()?;
    let oracle: &Oracle = bytemuck::from_bytes(&oracle_data[..Oracle::LEN]);
    if oracle.discriminator != ORACLE_DISCRIMINATOR {
        return Err(ProgramError::UninitializedAccount);
    }
    if oracle.price <= 0 {
        return Err(ProgramError::InvalidAccountData);
    }
    let clock = Clock::get()?;
    let age = clock.slot.saturating_sub(oracle.publish_slot);
    if age > MAX_ORACLE_STALENESS_SLOTS {
        msg!("oracle stale ({} slots, max {})", age, MAX_ORACLE_STALENESS_SLOTS);
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(oracle.price as u64)
}
\`\`\`

\`process_place_order_checked\` calls it as \`let mark = read_fresh_oracle(oracle_ai, program_id)?;\` and then runs the sanity band against \`mark\`.

Four checks before the price is trusted:

1. **Discriminator check** (\`oracle.discriminator != ORACLE_DISCRIMINATOR\`): refuses an oracle account that isn't initialized. In real Pyth this is the magic constant + version match.
2. **Price-positivity check** (\`oracle.price <= 0\`): refuses oracle states with non-positive prices. Real Pyth occasionally publishes \`0\` to signal "no good price right now" — your reader must handle that.
3. **Staleness check** (\`age > MAX_ORACLE_STALENESS_SLOTS\`): refuses prices older than 25 slots (~10 sec). This is the heart of the chapter. A price you cannot freshness-check is a price you cannot trust — because an attacker who can pause the publisher (or just exploit a network outage) can use a stale price to game any program that trusts it blindly.
4. **Owner check** (line 1969, \`oracle_ai.owner != program_id\`): refuses an account from a different program. In real Pyth this is \`oracle_ai.owner == &pyth_program::ID\`.

\`MAX_ORACLE_STALENESS_SLOTS = 25\` from \`lib.rs:205\`. The choice is workload-driven: 25 slots is ~10 seconds at the current target slot time. High-volatility pairs (BTC, ETH on a fast-moving day) need tighter — perhaps 10–15 slots. Stablecoin pairs can tolerate wider. The constant should ideally live on the per-market \`Market\` struct so each market tunes it; we keep it global for simplicity.

The borrow inside \`read_fresh_oracle\` is naturally scoped to the helper's body — it drops when the function returns, before the caller mutates the book. This matters because both the oracle and the book are passed as \`AccountInfo\`, and the runtime requires that no two mutable borrows of the same underlying account memory coexist. Even though our oracle and book are different accounts, the pattern of scoping borrows tightly is good hygiene — it prevents subtle aliasing bugs when handlers grow.

**What the SDK hides:** \`pyth-sdk-solana::load_price_feed_from_account_info\` does the discriminator check, the owner check, and a deserialization into a typed \`PriceFeed\`. It does *not* do the staleness check — that is always your job. Programs that use Pyth without an explicit staleness gate ship with one of the largest classes of oracle bugs in DeFi.

> **Exercise §9.3.** Set the oracle price at slot N (run \`oracle --set --price 100 ...\` and note the slot from the output). Wait 30 slots (about 12 seconds; just count slots in \`solana confirm\` against any tx). Now run \`oracle\` with no flags. The reported \`age (slots)\` should exceed 25. Run \`place-order-checked\` (assuming you wire one) — it should fail with \`oracle stale\`.

---

## §9.4  Using the oracle — the sanity band

A staleness-checked price is now safe to read. The first risk control we use it for: refuse \`place_order\` calls whose limit price drifts too far from the oracle mark.

From \`process_place_order_checked\` lines 1658–1671:

\`\`\`rust
let band = mark.saturating_mul(SANITY_BAND_BPS) / 10_000;
let low = mark.saturating_sub(band);
let high = mark.saturating_add(band);
if price < low || price > high {
    msg!(
        "place_order_checked: price {} outside sanity band [{}, {}] (mark={})",
        price,
        low,
        high,
        mark
    );
    return Err(ProgramError::InvalidArgument);
}
\`\`\`

\`SANITY_BAND_BPS = 2000\` (lib.rs:211) means ±20%. With \`mark = 100\`, an order at price 50 is rejected (below \`low = 80\`), an order at 95 is accepted, an order at 121 is rejected. A wide band on purpose: tighter bands cause legitimate users to fail more often during normal volatility, and ch.9 is about the *pattern*, not the calibration.

Production bands are tuned per market:

- **High-vol perps (BTC, ETH on a wild day):** 5–10% might be acceptable; wider rejects too many legitimate fat-finger-adjacent orders.
- **Mid-vol perps (SOL, AVAX):** 3–5% typical.
- **Low-vol pairs (stablecoin perps, FX):** 1–2%, sometimes tighter.

The band is the first risk control in the program because it's the simplest one that depends on external truth. Funding rate (Chapter 10) and liquidation (Chapter 11) build on the same oracle read, applying it to harder math.

**Saturating arithmetic.** \`saturating_mul\` and \`saturating_sub\` are used deliberately. If \`mark = u64::MAX\` (impossible in practice but theoretically) the multiplication would wrap. Saturating reduces that to a band of \`[u64::MAX - band, u64::MAX]\`, which fails all reasonable orders gracefully instead of producing a bizarre band that happens to be 0..something due to wraparound. Solana's program runtime panics on integer overflow (in \`release\` builds it wraps silently, in \`debug\` it panics) — explicit saturating ops are a small habit that pays off in audits.

> **Exercise §9.4.** Set the oracle price to 100. Try to place an order at price 90 (inside band), 75 (outside band — below low at 80), 120 (just inside — high is 120 since mark*0.2=20). Trace each. Then change \`SANITY_BAND_BPS\` to 500 (5%) and re-test the same prices.

---

## §9.5  Production Pyth v1 — implemented bytes-up

The mock \`Oracle\` is built so the chapter can pause publishes at known slots. Production reads from a Pyth account that publishers populate independently. The migration is localized — same staleness gauntlet, same sanity band, different parser — and the chapter ships it as a peer instruction \`PlaceOrderCheckedPyth\` (tag 32) so you can compare the two paths side by side. The Pyth v1 layout is well-defined enough that we parse it bytes-up, with no \`pyth-sdk-solana\` dependency — the bytes-up posture from Chapter 1 carries straight through.

### The Pyth v1 PriceAccount layout

Every Pyth v1 price account begins with a magic constant + version + account-type discriminator, then a header of EMA bookkeeping, then the aggregate \`agg\` block we actually trust. The six fields we read:

\`\`\`text
offset | size | field                       | what we check
-------+------+-----------------------------+---------------------------------
   0   |  4   | magic (u32)                 | == 0xa1b2c3d4
   4   |  4   | ver   (u32)                 | == 2 (Pyth v1)
   8   |  4   | atype (u32)                 | == 3 (PriceAccount)
  20   |  4   | expo  (i32)                 | logged; not applied (see below)
 208   |  8   | agg.price (i64)             | > 0
 216   |  8   | agg.conf  (u64)             | logged
 224   |  4   | agg.status (u32)            | == 1 (Trading)
 232   |  8   | agg.pub_slot (u64)          | clock.slot - pub_slot <= MAX_ORACLE_STALENESS_SLOTS
\`\`\`

(\`agg\` is the publisher network's aggregated price for the slot. Pyth has up to 32 publishers; the on-chain aggregation runs every slot and \`agg.status\` reflects whether they agreed.)

Offsets are exported as \`PYTH_V1_OFFSET_*\` constants from \`crates/state/src/lib.rs\`. We deliberately don't mirror the full ~3 KiB \`PriceAccount\` as a Pod struct — the bulk of the bytes are per-publisher \`comp[]\` entries we don't read. Hardcoding the six offsets is fewer bytes of code, easier to audit, and matches the chapter's "the byte layout *is* the contract" stance.

### \`read_fresh_pyth_v1_oracle\`

The helper, in skeleton:

\`\`\`rust
fn read_fresh_pyth_v1_oracle(oracle_ai: &AccountInfo) -> Result<u64, ProgramError> {
    let data = oracle_ai.try_borrow_data()?;
    if data.len() < PYTH_V1_MIN_LEN { return Err(InvalidAccountData); }

    // (1) Header gauntlet.
    if u32::from_le_bytes(data[0..4]) != PYTH_V1_MAGIC      { return Err(...); }
    if u32::from_le_bytes(data[4..8]) != PYTH_V1_VERSION    { return Err(...); }
    if u32::from_le_bytes(data[8..12]) != PYTH_V1_ACCOUNT_TYPE_PRICE { return Err(...); }

    // (2) Aggregate status.
    let status = u32::from_le_bytes(data[PYTH_V1_OFFSET_AGG_STATUS..]);
    if status != PYTH_V1_STATUS_TRADING { return Err(InvalidAccountData); }

    // (3) Staleness — agg.pub_slot vs Clock.slot.
    let pub_slot = u64::from_le_bytes(data[PYTH_V1_OFFSET_AGG_PUB_SLOT..]);
    let age = Clock::get()?.slot.saturating_sub(pub_slot);
    if age > MAX_ORACLE_STALENESS_SLOTS { return Err(InvalidAccountData); }

    // (4) Read price + log expo/conf for observability.
    let price_i = i64::from_le_bytes(data[PYTH_V1_OFFSET_AGG_PRICE..]);
    if price_i <= 0 { return Err(InvalidAccountData); }
    Ok(price_i as u64)
}
\`\`\`

The check order mirrors the mock path: structural validation first (magic / version / atype), then the status check (the Pyth analog of our mock's discriminator+initialization check), then staleness, then the price sanity. Any failure returns \`InvalidAccountData\` so callers can handle a stale or non-Trading Pyth feed the same way they handle a stale mock.

Four design decisions worth flagging:

**1. The reader checks bytes; the handler checks which account.** The mock path requires \`oracle_ai.owner == program_id\`; the reader here has no owner check, and the first version of this chapter said it did not need one, because "the magic+version+atype gauntlet already structurally guarantees the account is a Pyth v1 PriceAccount." It does not. Anyone can create an account they own, write the magic, version, account type, a Trading status and any price they like into it, and pass it in; the test \`pyth_v1_reads_only_the_pinned_price_account\` in \`programs/openhl-core/tests/pyth_binding.rs\` did exactly that, and the order went through against a price the caller chose. Hardcoding the Pyth program ID would force a mainnet-vs-devnet choice up front (\`FsJ3...epH\` for mainnet, \`gSbE...92s\` for devnet), so the market stores both instead, set by the market authority with \`SetPythFeeds\` (tag 34): the expected Pyth account *pubkey* (\`Market.pyth_v1_price_account\`) and the program that must own it (\`Market.pyth_v1_program\`). \`PlaceOrderCheckedPyth\` checks both on every call, and refuses outright while nothing is pinned. The address alone is not enough: an account at that address could be closed and recreated by someone else, and the test's \`recreated\` case shows the owner check refusing it. Pinning the address also settles the wrong-asset question, since a genuine feed for another pair is a different address. What the program still trusts is the authority's configuration: pin the wrong account and owner, and it will read them.

**2. \`expo\` is read and logged, not applied.** Pyth prices come as \`(mantissa, expo)\` pairs — the real price is \`mantissa × 10^expo\`. For USD pairs \`expo\` is typically \`-8\`. The mock side has no expo (our \`Oracle.price\` is a u64 in whatever scale the market uses), so to keep the two paths interoperable in our chapter we treat the mantissa as the price and log \`expo\` for observability. A production deployment would normalize: either pin a single supported \`expo\` and reject anything else, or translate the price into the program's fixed-point convention on the fly. This is the most likely place to write a real bug in the migration; the chapter calls it out so you can put a TODO there yourself.

**3. We refuse \`price <= 0\` even when status == Trading.** Pyth occasionally publishes zero — a publisher-network corner case where the aggregate is non-negative but degenerate. The mock path refuses the same; the Pyth path matches.

**4. \`agg.status != Trading\` is a hard refusal, not a fallback.** A real production reader with a Switchboard fallback would try the other oracle here rather than returning an error. We don't ship the fallback because the *worked example* is the v1 single-oracle migration; the fallback pattern (try-A-then-B with disagreement tolerance) is straightforward to add on top — the §9.5 closing notes lay it out.

### \`PlaceOrderCheckedPyth\` (tag 32)

The peer instruction. Same payload as \`PlaceOrderChecked\` (\`[side u8][price u64 LE][size u64 LE]\`), same eight prefix accounts modulo two changes:

- Slot 2 is a Pyth v1 PriceAccount, not our mock \`Oracle\`. (The oracle-PDA-from-market cross-check is dropped; Pyth accounts aren't ours to PDA-derive.)
- The oracle-side gauntlet calls \`read_fresh_pyth_v1_oracle\` instead of \`read_fresh_oracle\`, and before it the handler requires slot 2 to be the market's pinned \`pyth_v1_price_account\` (decision 1 above).

Everything downstream — sanity-band, fee escrow, book write — is identical to the mock path. Both handlers share the same \`SANITY_BAND_BPS\`, \`PROTOCOL_FEE_BPS\`, and the same \`spl_token_transfer_user_signed\` Transfer at the end. The migration's surface is exactly what §9.5 promised: localized.

### Pyth v2 — same chapter, different architecture

The "v1" in \`read_fresh_pyth_v1_oracle\` matters. Pyth's v1 model — publishers writing a static PriceAccount each slot, readers parsing it — is being deprecated in favor of v2's *pull-oracle* architecture. The critical insight for a perp DEX is that the v2 architecture splits cleanly across two layers:

1. **Pyth's \`pyth-solana-receiver\` program** does the cryptographic work. It accepts a Pyth update message wrapped in a Wormhole VAA (Verified Action Approval — a payload signed by 2/3+ of Wormhole's guardian set), verifies the guardian signatures using Solana's secp256k1 precompile, checks any Merkle proofs in the bundled update, and writes the verified price into a \`PriceUpdateV2\` account.
2. **The consumer** (you, the perp DEX) reads that \`PriceUpdateV2\` account. No VAA verification. No guardian-set management. No cryptography on your hot path.

If you confused those two layers (and an earlier draft of this section did), you'd conclude that v2 needs ~2000 lines of cryptographic code on your side. It doesn't. The Wormhole work lives in Pyth's program, which is shared infrastructure; what you ship on the perp DEX is structurally the same as the v1 reader, just against a different account layout.

\`PlaceOrderCheckedPythV2\` (tag 33) ships the consumer side. Two checks come before the reader, in the handler, because the reader cannot make them: the account must be owned by the receiver program the market pinned (\`Market.pyth_v2_receiver\`; its ID differs between clusters, so it is data, not a constant), and its \`feed_id\` must equal \`Market.pyth_v2_feed_id\`. Without the first, anyone can write a \`PriceUpdateV2\`-shaped account, discriminator and all, from their own program; without the second, a genuine update for another asset passes. The handler also requires the update to be fully verified (\`VerificationLevel::Full\`): a Partial update was checked against fewer guardian signatures than Wormhole's quorum, and Pyth's own SDK refuses one for prices. \`pyth_v2_reads_only_the_pinned_receiver_and_feed\` tries all three, including Partial updates with 0 and 13 signatures. The reader:

\`\`\`rust
fn read_fresh_pyth_v2_oracle(oracle_ai: &AccountInfo) -> Result<u64, ProgramError> {
    let data = oracle_ai.try_borrow_data()?;
    if data.len() < PYTH_V2_MIN_LEN { return Err(InvalidAccountData); }

    // (1) Anchor account discriminator. PriceUpdateV2 uses Anchor's
    // sha256("account:PriceUpdateV2")[..8] convention.
    if data[0..8] != PYTH_V2_PRICE_UPDATE_DISCRIMINATOR { return Err(...); }

    // (2) VerificationLevel — log only. Production may demand Full.
    let level_tag = data[PYTH_V2_OFFSET_VERIFICATION_LEVEL];
    // Partial { num_signatures }  | Full

    // (3) Staleness — against posted_slot, the Solana slot in which
    // the receiver wrote the update.
    let posted_slot = u64::from_le_bytes(data[PYTH_V2_OFFSET_POSTED_SLOT..]);
    if Clock::get()?.slot.saturating_sub(posted_slot) > MAX_ORACLE_STALENESS_SLOTS {
        return Err(InvalidAccountData);
    }

    // (4) Price + log exponent / conf / publish_time.
    let price_i = i64::from_le_bytes(data[PYTH_V2_OFFSET_PRICE..]);
    if price_i <= 0 { return Err(InvalidAccountData); }
    Ok(price_i as u64)
}
\`\`\`

PriceUpdateV2's on-chain layout, parsed by offset (Anchor borsh-serializes Pyth's struct):

\`\`\`text
offset | size | field                            | what we do with it
-------+------+----------------------------------+---------------------------------------
   0   |  8   | anchor_discriminator             | == [34,241,35,99,157,126,244,205]
   8   | 32   | write_authority (Pubkey)         | (not checked — whoever may update or close this account)
  40   |  1   | verification_level tag           | log; 0=Partial, 1=Full
  41   |  1   | verification_level.num_signatures| log (only when tag==Partial)
  42   | 32   | price_message.feed_id            | == \`Market.pyth_v2_feed_id\` (checked by the handler)
  74   |  8   | price_message.price (i64)        | > 0; returned as u64 mark
  82   |  8   | price_message.conf  (u64)        | log
  90   |  4   | price_message.exponent (i32)     | log; production normalizes by 10^expo
  94   |  8   | price_message.publish_time (i64) | log; informational (Pyth's Unix timestamp)
 102   |  8   | price_message.prev_publish_time  | unused
 110   |  8   | price_message.ema_price          | unused (the chapter uses the spot price)
 118   |  8   | price_message.ema_conf           | unused
 126   |  8   | posted_slot (u64)                | staleness gauntlet
 134                                                — end
\`\`\`

The offsets are exported as \`PYTH_V2_OFFSET_*\` from \`crates/state/src/lib.rs\`. They are the offsets of a **Partial** update: Borsh writes \`VerificationLevel::Full\` as 1 byte instead of 2, so in a Full update every field from \`price_message\` on sits one byte earlier. The pre-split reader quoted above used the fixed offsets and misread Full updates; \`openhl_oracle::pyth_v2::parse\` now handles both. As with v1, we don't mirror the full Pod struct — six field reads, no Anchor dep, the byte layout *is* the contract.

### The two-instruction transaction pattern

There's one piece of architecture the v2 reader assumes: the \`PriceUpdateV2\` account has to be *fresh* when the trade instruction runs. In practice the consumer transaction does this by including the receiver's \`post_update_v2\` instruction as the first instruction, and the trade instruction as the second:

\`\`\`text
tx = [
  pyth-solana-receiver::post_update_v2(vaa_data, update_data, …),  // verifies VAA, writes account
  openhl::place_order_checked_pyth_v2(side, price, size),          // reads the just-written account
]
\`\`\`

\`post_update_v2\` writes a per-(feed_id, write_authority) \`PriceUpdateV2\` PDA that \`place_order_checked_pyth_v2\` then reads. The client fetches the latest VAA from Pyth's price-update service (an HTTP endpoint that aggregates publisher signatures into VAAs ready to submit), bundles it into the first instruction, and lets the staleness gauntlet enforce that everything stays in sync. There is no on-chain CPI from our handler into the receiver — they communicate through the account, not directly.

This is also why our v2 handler doesn't take a "post" instruction or any Wormhole accounts: the consumer transaction is the wiring; the program just reads.

### What's still genuinely deferred

Now that the consumer side ships, what's left is **running your own Wormhole-style receiver**. That'd be useful if you wanted to read Pyth updates from a Wormhole chain that doesn't have an official Pyth receiver, or if you wanted to verify additional message types (governance updates, mapping changes) the receiver doesn't expose. It's its own chapter — secp256k1 signature recovery against a stored guardian set, replay protection, Merkle proof verification on bundled updates. The perp DEX consumer path here doesn't need any of it.

### The Switchboard fallback

A single oracle is a single point of failure. Pyth has been down. Switchboard has been down. Both at the same time has happened (rarely). Programs that protect downside trust *both* and refuse to operate when neither is fresh. The wiring is mechanical:

1. The transaction's \`AccountMeta\` array includes both oracle accounts.
2. The handler reads each, doing the full validation pattern (discriminator/magic + status + price-positive + staleness).
3. If either passes, use it. If both fail, refuse the call.

Programs that do this also typically *compare* the two when both are fresh — refuse the call if they disagree by more than some tolerance (e.g., 50 bps). A 50-bp disagreement between Pyth and Switchboard usually means one of them is wrong, and a program that just picks the cheaper price for the user has been gamed.

> **Exercise §9.5.** Pick a real Pyth v1 mainnet PriceAccount (SOL/USD is \`H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG\` at the time of writing — verify via Pyth's price-feed-ids page). Use the local validator's \`clone\` feature to mirror that account into your test cluster, pin it on your market with \`SetPythFeeds\` (signed by the market authority), then invoke \`PlaceOrderCheckedPyth\` against it. Then try the attack decision 1 describes: copy the account's bytes into an account you own and pass that instead. It should fail with \`oracle is not the market's pinned Pyth v1 feed\`. Compare the logged \`expo\` to the SOL/USD product (should be \`-8\`). Confirm the staleness gauntlet by replaying a stale slot of the account from an archive.

---

## §9.6  Recap + verify yourself

### Recap diagram

\`\`\`
External truth → program safety:

  Pyth/Switchboard publisher          Our Oracle account
   ┌──────────────────┐                ┌───────────────────────┐
   │ writes price+conf│ ──── owns ───► │  Pyth program (mainnet)│
   │  every few slots │                │  openhl-core (ours)    │
   └──────────────────┘                └───────────────────────┘
                                                │  reads
                                                ▼
                                   ┌─────────────────────────────┐
                                   │ place_order_checked         │
                                   │  - load oracle account      │
                                   │  - owner check              │
                                   │  - discriminator check      │
                                   │  - price > 0                │
                                   │  - staleness via Clock      │
                                   │  - sanity band ±X bps       │
                                   │  - then run normal place    │
                                   └─────────────────────────────┘

Required checks before trusting a price:

  ┌────────────────────────┬──────────────────────────────────┐
  │ Check                  │ Where                            │
  ├────────────────────────┼──────────────────────────────────┤
  │ owner == oracle program│ before any data read             │
  │ discriminator matches  │ first 8 bytes of data            │
  │ price > 0              │ rejects "no price" signal        │
  │ slot age <= MAX        │ requires Clock sysvar            │
  │ (optional) conf small  │ rejects wide / uncertain prices  │
  │ sanity band            │ applies the price to user input  │
  └────────────────────────┴──────────────────────────────────┘
\`\`\`

### Three things to verify yourself

1. **The discriminator check matters.** Create a market PDA, then construct a transaction that calls \`place_order_checked\` passing the market PDA in the oracle slot. The discriminator check in \`read_fresh_oracle\` at [\`lib.rs:1974\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs#L1974) should fail with \`UninitializedAccount\`. Without this check, the code would \`bytemuck::from_bytes\` into garbage data and use a nonsensical \`price\`.
2. **Staleness is the security gate.** Set the oracle, wait 30+ slots, try to place an order at any price inside the band. It should fail with \`oracle stale\`. This is the most commonly forgotten check; it is also the one that has caused the most oracle exploits in the wild.
3. **The band's edge is exact.** With \`SANITY_BAND_BPS = 2000\` and \`mark = 100\`, an order at exactly 80 should be *accepted* (the check is \`< low\`, not \`<= low\`). An order at exactly 79 should be rejected. Confirm by running both. The edge case for a \`<=\` vs \`<\` slip is a single bp; for tighter bands at higher prices, the dollar value of the difference can be significant.

---

## Hook into Chapter 10

You now have a mark price. The next thing a perp DEX does with that mark is *funding rate*. Funding is the mechanism by which long and short positions periodically exchange payments to keep the perp's price tethered to spot — formally, \`funding_rate ≈ k × (perp_premium_index - mark_price) / mark_price\`, where \`perp_premium_index\` is some accumulator over recent fill prices and \`mark_price\` is what we just learned to read. The rate is paid every funding window (1 hour on most venues, 8 hours on some), and the program must accumulate per-position settlements continuously without an unbounded loop.

Chapter 10 walks the time-windowed accumulator pattern, the Clock sysvar's \`unix_timestamp\` field for funding deadlines, and the crank/keeper pattern for getting "every position pays funding at this slot" done without a single transaction touching all positions. This is where Phase A's parallelism lesson (Chapter 5) starts to dictate the data layout: funding settlement is the canonical case where a singleton "totals" account becomes a bottleneck, and we use the sharding pattern from §5.5 to avoid it.
`,
                },
                {
                  title: "Chapter 10 — Funding Rate Mechanics",
                  slug: "solana-internals-ch10-funding-en",
                  type: 'CONTENT',
                  sortOrder: 4,
                  duration: 45,
                  xpReward: 100,
                  content: `# Chapter 10 — Funding Rate Mechanics

> Status: draft (v0.1).
> Companion code: [\`crates/state/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/state/src/lib.rs) (\`FundingState\`), [\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs) (\`process_create_funding_state\` 2162–2232, \`process_update_funding\` 2239–2317), [\`scripts/funding/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/funding/src/main.rs).
>
> Since the parts split, the logic this chapter walks through lives in [\`crates/funding/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/funding/src/lib.rs) (\`openhl-funding\`); the program calls it. The code quoted below is the pre-split version from \`programs/openhl-core/src/lib.rs\`, and its line numbers are not kept in sync.

---

## §10.0  Framing

A perpetual futures contract has no expiry. Without one, there is nothing in its structure that pulls the contract's price back to the spot price of its underlying. Funding is the mechanism that does it: longs and shorts periodically pay each other a small amount proportional to how far the perp's mark deviates from the underlying. When the perp trades above spot, longs pay shorts (encouraging shorts to enter, longs to exit); when it trades below, shorts pay longs.

The economics is simple. The engineering is not.

Solana programs cannot iterate over every position in a market in a single transaction — there are too many, and the per-tx CU budget would exhaust before the first hundred. They cannot rely on a wall clock (Clock sysvar's \`unix_timestamp\` is the only legal time signal). They cannot trust an off-chain process to update the rate honestly (every keeper is a trust assumption you must minimize). And they must produce per-position settlement amounts that match a global accumulator exactly, no matter how many times a position is touched between funding intervals.

The pattern that solves all four constraints simultaneously is the **time-windowed cumulative index**. This chapter walks it. We will:

1. Read what funding is in formal terms, and why the accumulator pattern falls out of the constraints.
2. Walk the \`FundingState\` account layout — one fixed-size PDA per market, holding the cumulative index and the current rate.
3. Walk \`UpdateFunding\` — the keeper crank that advances the index in piecewise-linear segments.
4. Pseudocode the per-position \`SettleFunding\` half of the pattern (Position lands in Chapter 11; the read-side pattern is too important to defer entirely).
5. Connect the design back to Chapter 5's parallelism argument: funding-settlement-as-touch is the canonical case where the *wrong* design (a singleton "totals" account) destroys throughput.

This chapter is short on novel syscalls and long on architectural taste. The code is small. The pattern is the lesson.

---

## §10.1  What funding is, in formal terms

Two quantities anchor the calculation:

- **Mark price** — what your program (or the rest of the chain) considers the current price of the underlying. Chapter 9's oracle. Read with a staleness check.
- **Premium index** — a smoothed measure of how far perp prices have deviated from mark over the recent past. In practice, exchanges compute this as \`(perp_mid - mark) / mark\`, averaged over the funding window with some clamps.

The funding rate is roughly proportional to the premium index:

\`\`\`
funding_rate ≈ k × clamp(premium_index, -max_rate, +max_rate)
\`\`\`

Sign convention: positive rate means longs pay shorts; negative means shorts pay longs.

Over a window of length \`T\` seconds, a position of size \`s\` (positive for long, negative for short) accrues funding:

\`\`\`
funding_owed(s, T) = funding_rate × T × s
\`\`\`

This is paid in quote currency (usually USDC). Longs and shorts net to zero across the whole market — funding is *redistribution*, not a fee.

Two design observations fall out of this:

1. **The integral matters, not the instantaneous rate.** A position that exists for half a funding window owes half a window's worth of funding. The settlement amount depends on the time-integral of the rate over the position's lifetime, not the rate at any particular moment.
2. **The integral is the same for every position in the market.** Whether a position is opened at the start of a window or in the middle, the *rate* applied to it is the market's rate, not a per-position rate. So instead of recomputing for every position, we maintain a single market-wide running total — the **cumulative funding index** — and let each position subtract its snapshot of the index at open time.

This is the pattern. The rest of the chapter implements it.

> **Exercise §10.1.** Suppose \`funding_rate = 0.0001 / hour\` (10 bps/hour), constant for 24 hours, and you hold a long position of size 100 the entire time. How much funding did you pay (or receive)? Now suppose the rate was +0.0001/hour for the first 12 hours and -0.0001/hour for the second 12. Same answer? Why?

---

## §10.2  The \`FundingState\` account

One PDA per market, 120 bytes. From \`crates/state/src/lib.rs\`:

\`\`\`rust
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct FundingState {
    pub discriminator: [u8; 8],          // 0..8
    pub bump: u8,                         // 8
    pub _pad0: [u8; 7],                   // 9..16
    pub market: [u8; 32],                 // 16..48
    pub cumulative_funding_index: i64,    // 48..56  — scaled by 1e9
    pub last_update_ts: i64,              // 56..64  — Clock.unix_timestamp
    pub last_update_slot: u64,            // 64..72
    pub current_rate_per_sec: i64,        // 72..80  — scaled by 1e9
    pub window_seconds: u64,              // 80..88
    pub _reserved: [u8; 32],              // 88..120
}
\`\`\`

Three fields are load-bearing.

**\`cumulative_funding_index: i64\`** is the running total. Every time \`UpdateFunding\` runs, this advances by \`current_rate_per_sec × seconds_elapsed\`. Signed because rates can be negative (shorts paying longs). Scaled by \`1e9\` so the smallest representable rate is one nanosecond's worth at one unit of base notional — comfortable precision for typical perp economics.

**\`last_update_ts: i64\`** is the Clock unix_timestamp at which the index was last advanced. The next update computes \`elapsed = clock.unix_timestamp - last_update_ts\` and uses that as the integration interval. This is the only way Solana programs know how much time has passed between two on-chain events.

**\`current_rate_per_sec: i64\`** is the rate that has been in effect *since* \`last_update_ts\`. When \`UpdateFunding\` runs, it first applies this prior rate over the elapsed window, then installs the new rate for the next window. This is the "step function" half — the index advances in piecewise-linear segments, one segment per keeper call.

The other fields are mechanical: discriminator for the standard check, bump for the PDA, market pubkey for traceability, window_seconds for callers that need to know the configured funding window, and 32 bytes of forward-compat slack.

> **Exercise §10.2.** Convert a funding rate of "0.01% per 8 hours" (Binance's default perp funding) into the scaled-1e9 \`current_rate_per_sec\` format used here. Show your arithmetic.

---

## §10.3  Walking \`UpdateFunding\`

\`process_update_funding\` at \`programs/openhl-core/src/lib.rs:2239–2317\` is the only mutator. Its body, ignoring validation:

\`\`\`rust
let new_rate = new_rate_raw
    .max(-MAX_FUNDING_RATE_PER_SEC_ABS)
    .min(MAX_FUNDING_RATE_PER_SEC_ABS);

let clock = Clock::get()?;
let elapsed = clock.unix_timestamp.saturating_sub(funding.last_update_ts);
let elapsed_u = elapsed as u64;

let delta = (funding.current_rate_per_sec as i128) * (elapsed_u as i128);
let new_cumulative = (funding.cumulative_funding_index as i128).saturating_add(delta);
// ... i64 saturation clamp ...

funding.cumulative_funding_index = new_cumulative_clamped;
funding.current_rate_per_sec = new_rate;
funding.last_update_ts = clock.unix_timestamp;
funding.last_update_slot = clock.slot;
\`\`\`

Four operations.

**Clamp the keeper rate.** \`MAX_FUNDING_RATE_PER_SEC_ABS = 1_000_000\` scaled-1e9 units = 0.001 / sec ≈ 86.4% / day. Loose for pedagogy; production caps are much tighter (perhaps 0.05% per hour, ~1.5% per day max). The clamp is your defense against a compromised or buggy keeper — the worst they can do is push the rate to the cap.

**Compute elapsed time from Clock.** \`Clock::get()?\` is the only legal way to know what time it is on-chain. \`unix_timestamp\` is a \`i64\` count of seconds since the Unix epoch. The runtime updates it once per slot, so a tx that runs within the same slot as a previous \`UpdateFunding\` would see \`elapsed = 0\` — no funding accrues, and the rate just gets re-set. That's fine; the keeper schedule is policy, not invariant.

**Apply the *prior* rate over the elapsed window.** This is the heart of the pattern. The rate that gets multiplied by \`elapsed_u\` is \`funding.current_rate_per_sec\` — the rate that was set on the *previous* \`UpdateFunding\` call. Then the new rate is installed. This is what makes the index a piecewise-linear function of time: it grows at rate \`r₀\` from \`t₀\` to \`t₁\`, then at rate \`r₁\` from \`t₁\` to \`t₂\`, etc.

**Promote to \`i128\` to avoid mid-computation overflow.** The intermediate \`delta = rate × elapsed\` can exceed \`i64\` for long intervals or large rates. We compute in \`i128\` and then saturate back to \`i64\` for storage. A position cumulative \`i64\` can hold ~9 × 10^18 scaled-1e9 units — enough for centuries of normal rates. Saturating instead of panicking means an overflow degrades gracefully (rate calculations cap rather than crash the program).

**What the SDK hides:** Anchor accounts with \`Time::now()\`-style helpers tend to obscure the fact that *every* time read is a Clock syscall. There is no "wall clock" you can read for free. Each \`Clock::get()\` is a CU cost. For handlers that read it twice (once to validate staleness, once to compute elapsed), you can cache the first read in a local variable rather than calling twice.

> **Exercise §10.3.** Call \`UpdateFunding\` three times in succession over a few seconds:
>   1. \`--rate 100\` (some non-zero rate)
>   2. wait ~5 seconds, \`--rate 200\`
>   3. wait ~5 seconds, \`--rate 0\`
>
> After each call, dump the funding state. The \`cumulative_funding_index\` should:
>   - After call 1: still be 0 (no prior rate to accumulate over).
>   - After call 2: ~ \`100 × 5 = 500\` (rate 100 for ~5 seconds).
>   - After call 3: ~ \`500 + 200 × 5 = 1500\`.
>
> The exact numbers depend on the actual elapsed seconds. The shape is the lesson.

---

## §10.4  The other half — per-position settlement (pseudocode)

\`FundingState\` carries the global index. The per-position half is the read side. When a position is opened, you snapshot the current index:

\`\`\`rust
// On open_position:
position.funding_snapshot_index = funding.cumulative_funding_index;
\`\`\`

When the position is touched later (closed, modified, liquidated, settled-without-closing), you compute the delta and apply it as PnL:

\`\`\`rust
// On any position touch:
let index_delta = funding.cumulative_funding_index - position.funding_snapshot_index;
let funding_pnl_scaled = (index_delta as i128) * (position.size as i128);
let funding_pnl = (funding_pnl_scaled / 1_000_000_000) as i64; // un-scale 1e9
position.realized_pnl += funding_pnl;
position.funding_snapshot_index = funding.cumulative_funding_index;
\`\`\`

This is the entire pattern. Three properties to notice:

1. **Constant time per touch.** No iteration. No matter how many UpdateFunding calls happened between open and touch, the per-position settle is a fixed-cost subtraction-and-multiply.
2. **No coordination across positions.** Position A and Position B can be settled in parallel — they touch different position accounts and only *read* the (single) \`FundingState\`. From Chapter 5: this is a read-on-shared-account pattern, which the Sealevel scheduler permits in full parallelism.
3. **Settlement is exact, not approximate.** Because the index is a monotone integral of the rate, the delta between any two snapshots is *exactly* the funding that accrued to a constant-size position over that interval. No drift, no rounding error beyond what the 1e9 scaling forces.

A real implementation lives in \`process_settle_position\` (Chapter 11 onward) and is called from every other instruction that touches a position. We will introduce \`Position\` properly in Chapter 11 and connect this half directly. For now, the pseudocode is correct and complete — implementing it is mechanical once Position exists.

> **Exercise §10.4.** A position is opened when \`cumulative_funding_index = 1500\`, size = 100. Three updates later, the index reads 1800. What is the funding PnL? Now another update advances the index to 1750 (i.e., it went *down* by 50 since the snapshot). What is the new PnL?

---

## §10.5  Crank / keeper — what runs UpdateFunding, and when

\`UpdateFunding\` is *not* called by traders. It is called by a keeper — an off-chain process whose only job is to drive the index forward by submitting \`UpdateFunding\` transactions on a schedule.

A minimal keeper loop, in pseudo-Python:

\`\`\`python
import time
while True:
    mark = read_oracle_mark(market)            # Chapter 9
    perp_mid = read_book_mid(market)           # Chapter 7
    premium = clamp((perp_mid - mark) / mark, -MAX, +MAX)
    new_rate_per_sec = premium * RATE_SCALAR
    send_tx(UpdateFunding(new_rate_per_sec), market)
    time.sleep(60)  # tune per market
\`\`\`

Three design questions a real keeper must answer:

**1. How often?** Too frequent and you waste tx fees + add jitter to the index. Too infrequent and the rate is stale; positions opened near the end of a long interval pay the wrong rate. Common choice: every 60 seconds for liquid markets, every 5 minutes for less liquid. The on-chain \`window_seconds\` is the *advertised* window (used in fee disclosures and external docs); the *actual* keeper cadence is policy.

**2. Who runs it?** Three patterns:
   - **The exchange itself** — simplest, single trust assumption, but a single point of failure.
   - **A permissioned set of keepers** — multiple operators with rotating responsibility, the program checks the signer against a whitelist.
   - **Permissionless crank** — anyone can call, the program clamps the rate it accepts. Resistant to censorship but requires very careful bounds (a malicious keeper can still push the rate to the cap repeatedly).
   
   Our \`process_update_funding\` accepts any signer for pedagogy. Production picks one of the three above.

**3. What if the keeper goes down?** A stalled keeper means a stale rate continues to apply for an extended window. Positions opened during the outage pay funding at the last-published rate, which may be wildly off from the actual premium. Mitigation: cap the maximum elapsed time per update (refuse calls where \`elapsed > N seconds\`) and require manual intervention to restart, or accept the rate drift as a known degradation mode.

**What Anchor hides:** Nothing here. Keeper patterns are entirely the program author's choice; neither Anchor nor any framework provides a "funding rate" abstraction because the policy is too domain-specific to default.

> **Exercise §10.5.** Write a 30-line Python script that runs the keeper loop above against your local validator. Hard-code the rate as a constant (e.g., 100). Verify by dumping the funding state every 30 seconds that \`cumulative_funding_index\` grows by about 3000 each time (100 × 30s).

---

## §10.6  Parallelism revisited — settlement as the canonical case

Chapter 5 introduced the singleton-write-shared antipattern. Funding settlement is where it goes operational.

Consider a perp DEX with 1,000 active positions. At each funding settlement moment, two designs are possible:

**Design A — singleton "totals" account.** A single \`MarketAggregates\` account holds \`total_long_size\`, \`total_short_size\`, and a running PnL. Every settlement increments these. Every position touch reads and writes this singleton.

Result: every position-touching transaction shares a write on \`MarketAggregates\`. Two such transactions cannot run in the same slot. Throughput collapses to single-transaction latency. With 1,000 positions touching once per hour, you serialize at ~1 tx/slot = 2.5 tx/sec maximum. The program is a single-threaded queue.

**Design B — per-position settlement (this chapter).** No singleton totals account. \`FundingState\` is read-only when settling — its write happens once per \`UpdateFunding\` call, off the position-touch hot path. Position A and Position B settle in parallel because their write sets are \`{position_A}\` and \`{position_B}\` — disjoint.

Result: position settlements scale to the number of cores the validator has. 1,000 positions can settle in a small number of slots. The program is parallel-friendly by construction.

This is the lesson of Chapter 5 paying off. Picking Design B doesn't *feel* like an optimization at the time you make the choice — it just feels like "don't store global totals if you don't need them." The reason it pays off in throughput is because of Sealevel's read/write set scheduling, which you cannot see directly when designing the data layout.

The same pattern applies anywhere a "global counter" would be tempting:
- Total volume traded? Don't store it. Index transactions off-chain.
- Total fees collected? Have the fee accumulate in the fee receiver token account, not in a counter.
- Total positions? \`getProgramAccounts(programId, filter: discriminator == POSITION).len()\`, off-chain.

The exception that proves the rule: things that are *load-bearing for program logic* (the funding index itself, the insurance fund balance, the oracle staleness check) genuinely require write-shared accounts. For those, accept the serialization and design around it (keeper-only writes, short critical sections, sharding where possible). For everything else, refuse the global counter.

---

## §10.7  Recap + verify yourself

### Recap diagram

\`\`\`
Time:           t0 ───────── t1 ───────── t2 ───────── t3 ──── now
Keeper call:    UpdateFunding   UpdateFunding   UpdateFunding
Rate set:       r0              r1              r2
Elapsed:        Δ0              Δ1              Δ2

cumulative_funding_index over time:

  idx(t1) = idx(t0) + r0 × (t1 - t0)
  idx(t2) = idx(t1) + r1 × (t2 - t1)
  idx(t3) = idx(t2) + r2 × (t3 - t2)

Per-position settle (Chapter 11 will implement):

  position.funding_pnl_delta
    = (idx_now - position.funding_snapshot_index) × position.size / 1e9
  position.funding_snapshot_index = idx_now


Sealevel scheduling impact:

  UpdateFunding writes the singleton FundingState — serial across keepers.
  SettleFunding writes per-position accounts — parallel across positions.
  Result: settlements scale to N cores; rate updates happen once per minute
  per market and don't gate anything.
\`\`\`

### Three things to verify yourself

1. **The accumulator is piecewise-linear.** Run three UpdateFunding calls a known number of seconds apart with different rates. The cumulative index after each call should match \`prior_index + prior_rate × elapsed_seconds\` exactly (within the integer division of the 1e9 scaling).
2. **The clamp is enforced.** Try \`--rate 5000000\` (way above the cap). The chapter's clamp at [\`lib.rs:2260–2262\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs#L2260) should reduce it to \`MAX_FUNDING_RATE_PER_SEC_ABS = 1_000_000\`, and you'll see the \`clamped to\` log line.
3. **The slot-vs-time distinction matters.** Run \`UpdateFunding --rate 100\`, immediately run another \`UpdateFunding --rate 200\` (same slot). The second call should report \`elapsed=0s\` and the index should not advance. Wait 10 seconds, run a third with \`--rate 0\` — now you'll see \`elapsed≈10\` and the index advanced by \`200 × 10\`.

---

## Hook into Chapter 11

You now have a market with vaults, a matcher, an oracle, and a funding accumulator. What you still don't have is **positions**. Every other primitive in the program either operates on accounts that are themselves not positions (the book, the funding state) or assumes positions will exist somewhere (Chapter 6's deposit moves funds into a vault, but doesn't open a position; Chapter 10's settle-on-touch pattern is incomplete because there is nothing to settle yet).

Chapter 11 introduces the \`Position\` account: per-user-per-market, holds size + entry price + funding snapshot + margin balance. We will add \`OpenPosition\`, \`ClosePosition\`, and \`Liquidate\` — the liquidation engine being the canonical use case where every other Phase A and Phase B primitive converges. Liquidation reads the oracle (with staleness check), reads the funding index (and settles), checks margin against the position size, calls into the matcher (or its slab cousin) to close the position, and sweeps the user's vault. Chapter 11 is where the program becomes a perp DEX in the full sense, not just a collection of primitives.
`,
                },
                {
                  title: "Chapter 11 — Position Lifecycle and Liquidation Engine",
                  slug: "solana-internals-ch11-liquidation-en",
                  type: 'CONTENT',
                  sortOrder: 5,
                  duration: 45,
                  xpReward: 100,
                  content: `# Chapter 11 — Position Lifecycle and Liquidation Engine

> Status: draft (v0.1).
> Companion code: [\`crates/state/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/state/src/lib.rs) (\`Position\`, \`InsuranceFund\`), [\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs) (helpers + \`process_open_position\`, \`process_close_position\`, \`process_liquidate\`, \`process_create_insurance_fund\`, \`process_insurance_fund_deposit\`), [\`scripts/position/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/position/src/main.rs), [\`fuzz/positions/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/positions/src/main.rs) (the solinv harness for §11.7).
>
> Since the parts split, the logic this chapter walks through lives in [\`crates/margin/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/margin/src/lib.rs) (\`openhl-margin\`); the program calls it. The code quoted below is the pre-split version from \`programs/openhl-core/src/lib.rs\`, and its line numbers are not kept in sync.

---

## §11.0  Framing

This is the convergence chapter. Every other Phase A and Phase B primitive — oracle, funding, vault, matcher, parallelism — exists so this chapter can be written. A perp DEX without \`OpenPosition\` / \`ClosePosition\` / \`Liquidate\` is a collection of pieces; a perp DEX with them is a perp DEX.

The chapter ships three instructions, each of which integrates the SPL Token escrow path from Chapter 6 directly into the position lifecycle:

1. **\`OpenPosition\`** — creates a per-(user, market) Position PDA, reads the oracle for the entry price, snapshots the cumulative funding index for later settlement, validates the initial margin requirement, and **escrows the collateral** by CPI'ing an SPL Token Transfer from the user's quote token account into the market vault (the per-(market, mint) vault built in Chapter 6).
2. **\`ClosePosition\`** — the owner's exit. Settles funding via the snapshot pattern from Chapter 10, computes realized PnL = \`size × (mark - entry)\`, **transfers the realized amount back to the user** via an SPL Token CPI signed by the vault authority PDA (\`invoke_signed\` with \`[b"vault_auth", market]\` seeds), and zeros the position.
3. **\`Liquidate\`** — anyone's exit on someone else's underwater position. Computes equity, compares to maintenance margin, and if the position has fallen below, force-closes at the current mark. **Two SPL Token CPIs run inside the handler:** vault → liquidator for the penalty bounty, and vault → position-owner for whatever remains. Both signed by the vault authority PDA.

The collateral now lives where a real perp DEX puts it — the program's vault token account, owned by SPL Token, controlled by an \`invoke_signed\`-only PDA. The position record holds the *bookkeeping* (size, entry price, snapshot index); the vault holds the *money*. The two stay in sync because every state transition that touches the bookkeeping also runs the matching CPI.

The chapter also ships the §11.6 **insurance fund**: a per-market \`InsuranceFund\` PDA + dedicated token account that receives a configurable slice (\`INSURANCE_FUND_PENALTY_SHARE_BPS = 5000\`, i.e. half) of every liquidation penalty and drains to cover underwater-close shortfalls. The fund's token account is authority-shared with the position vault (\`[b"vault_auth", market]\`), so no new signer PDA is introduced. Bootstrap via \`CreateInsuranceFund\` once per market; permissionless top-up via \`InsuranceFundDeposit\`.

---

## §11.1  The \`Position\` account

One PDA per (user, market) pair. 144 bytes. From \`crates/state/src/lib.rs\`:

\`\`\`rust
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct Position {
    pub discriminator: [u8; 8],
    pub bump: u8,
    pub _pad0: [u8; 7],
    pub user: [u8; 32],
    pub market: [u8; 32],
    pub size: i64,                    // base units; signed: long > 0, short < 0
    pub entry_price: u64,             // quote per base, stamped at open
    pub collateral: u64,              // quote units posted as margin
    pub funding_snapshot_index: i64,  // FundingState.cumulative at last touch
    pub _reserved: [u8; 32],
}
\`\`\`

Six load-bearing fields, plus discriminator + bump + padding.

**\`size: i64\`** is signed. A long position has positive size; a short has negative. \`size == 0\` is the "position closed" sentinel — like the empty-slot convention in Chapter 7. After a close or liquidate, the account stays around with \`size = 0\`, and can be reopened by issuing a fresh \`OpenPosition\` (which will derive the same PDA and write over the dormant state). We chose not to literally close the account (refunding rent) because the per-(user, market) PDA derivation guarantees a position-or-nothing relationship, and keeping the slot around saves a re-create CPI on reopen.

**\`entry_price: u64\`** is the mark price stamped from the oracle at \`OpenPosition\` time. It's the reference point for price PnL: \`(mark - entry) × size\`. We do not maintain a running entry-price for partial closes; the chapter's \`ClosePosition\` is all-or-nothing. Partial closes would require resetting \`entry_price\` to a size-weighted blend on each partial — a useful extension but not in scope.

**\`collateral: u64\`** is the quote-currency margin amount. Strictly positive while the position is open; can be reduced to zero by underwater close or liquidation. Cannot go negative — losses beyond collateral are absorbed by the per-market insurance fund up to its balance (§11.6); the residual once the fund is empty falls on whoever holds the other side of the trade (no autodeleverage logic in this chapter — that branch is its own architectural problem and is the only insurance-fund piece §11.6 still defers).

**\`funding_snapshot_index: i64\`** is the cumulative funding index at the last touch (open, close, liquidate). The per-position settle pattern from Chapter 10 makes this the only field needed for funding accounting — the delta between \`funding_now\` and \`funding_snapshot_index\` times \`size\` is the funding PnL accrued since the snapshot.

The PDA derivation uses both \`user\` and \`market\` as seeds: \`[b"position", user.key, market.key]\`. So every (user, market) pair has exactly one position address that everyone can compute without storing a mapping anywhere. The pubkey is bound to the asset pair and the trader by the seed scheme alone.

> **Exercise §11.1.** Why does the position store both \`user\` and \`market\` *inside* the account, despite both being seeds of the PDA derivation? (Hint: think about what a third party reading the account knows vs. what they have to derive.)

---

## §11.2  Equity, notional, and the margin formulas

Before walking the handlers, fix the formulas. From \`programs/openhl-core/src/lib.rs:2329–2342\`:

\`\`\`rust
fn compute_equity(position: &Position, mark: u64, funding_index_now: i64) -> i128 {
    let size = position.size as i128;
    let entry = position.entry_price as i128;
    let mark_i = mark as i128;
    let collateral = position.collateral as i128;

    let price_pnl = size * (mark_i - entry);

    let funding_delta = (funding_index_now as i128) - (position.funding_snapshot_index as i128);
    let funding_pnl = funding_delta * size / 1_000_000_000_i128;

    collateral + price_pnl + funding_pnl
}

fn notional(size: i64, mark: u64) -> u128 {
    let abs_size = (size.unsigned_abs()) as u128;
    abs_size * (mark as u128)
}
\`\`\`

Three quantities the chapter cares about.

**Notional** = \`|size| × mark\`. The dollar (quote-currency) value of the position at current price. A long of 5 base units at mark 100 has notional 500 quote units. Both long and short have positive notional — direction matters for PnL, not for notional.

**Price PnL** = \`size × (mark - entry)\`. Signed. Long positions profit when mark rises (positive size × positive delta = positive PnL); short positions profit when mark falls (negative size × negative delta = positive PnL). The arithmetic works without special-casing direction because \`size\` carries the sign.

**Funding PnL** = \`(index_now - index_snapshot) × size / 1e9\`. Same shape as price PnL but with the funding index playing the role of price. The \`/1e9\` un-scales the 1e9 scaling Chapter 10's \`FundingState\` uses for its index. For a long with positive size, a rising funding index (longs paying shorts) means positive \`funding_delta × size\`, which becomes negative funding PnL after the formula's signs work out — exactly the right semantics.

**Equity** = \`collateral + price_pnl + funding_pnl\`. The total quote-currency value the position commands right now. Equity can go negative for severely underwater positions; the program clamps to zero on close/liquidate (the loss is socialized rather than passed to a counterparty).

**Maintenance margin** = \`notional × MAINT_MARGIN_BPS / 10000\`. The minimum equity required to keep the position open. With \`MAINT_MARGIN_BPS = 500\` (5%), a 500-notional position needs equity ≥ 25 quote to avoid liquidation.

**Initial margin** = \`notional × INITIAL_MARGIN_BPS / 10000\`. The minimum collateral required at open. With \`INITIAL_MARGIN_BPS = 1000\` (10%), the same 500-notional position needs ≥ 50 quote of collateral to open.

The gap between IM (10%) and MM (5%) is the **maintenance buffer** — how far the position can move against you before you're liquidated. A position opened at IM and immediately moving 50% of its notional against you would have equity zero (collateral wiped out) before liquidation triggers; a position opened at IM with a 5% adverse move would still be healthy. The narrower the IM↔MM gap, the more capital-efficient but the easier to liquidate.

> **Exercise §11.2.** A long position is opened with size = 10 base units, entry = 100, collateral = 200 (10% IM). Compute equity at marks 90, 95, 100, 105, 110. At which marks is the position liquidatable? (Ignore funding for now.)

---

## §11.3  Walking \`OpenPosition\`

\`process_open_position\` at \`programs/openhl-core/src/lib.rs\`. The handler decomposes into six parts: validation, oracle/funding read, initial margin check, position PDA allocation, **collateral escrow CPI**, and the position state write.

**Validation**: payload size, non-zero size and collateral, user is signer, market is a Market account owned by us **whose \`quote_mint\` is the passed mint** (a position records no mint and ClosePosition/Liquidate pay out of the quote-mint vault, so without this a worthless mint could be escrowed and closed out for real quote tokens), system program is the System program, **token program is SPL Token, user_token_account is owned by SPL Token, and the vault_token_account matches the derived PDA at \`[VAULT_SEED, market, mint]\`** (the new escrow-side checks). PDA derivation for the position itself:

\`\`\`rust
let (expected, bump) = Pubkey::find_program_address(
    &[POSITION_SEED, user_ai.key.as_ref(), market_ai.key.as_ref()],
    program_id,
);
if position_ai.key != &expected {
    return Err(ProgramError::InvalidSeeds);
}
\`\`\`

**Read external inputs** (lines 2911–2912):

\`\`\`rust
verify_market_oracle_and_funding(oracle_ai, funding_ai, market_ai.key, program_id)?;
let mark = read_fresh_oracle(oracle_ai, program_id)?;
let funding_snapshot = read_funding_index(funding_ai, program_id)?;
\`\`\`

\`read_fresh_oracle\` (lines 2353–2372) factors the Chapter 9 staleness gauntlet into a helper — same checks (owner + discriminator + price>0 + age vs Clock), reused across all three position handlers. \`read_funding_index\` (lines 2597–2607) is the simpler read used to snapshot the funding index.

Neither helper asks *whose* oracle or funding state it was handed: every market's oracle is owned by this program and carries the same discriminator. So all three position handlers first call \`verify_market_oracle_and_funding\`, which requires the two accounts to be this market's PDAs, \`[ORACLE_SEED, market]\` and \`[FUNDING_SEED, market]\`, the same derivation \`PlaceOrderChecked\` already used for its oracle (Chapter 9). The first version of this chapter left it out of all three handlers. With two markets in one quote mint, one at 100 and one at 200, a user opened a long on the first and closed it naming the second market's oracle: 200 in, 1,200 out of the first market's token account, which holds everyone's collateral. A liquidator could liquidate a healthy short the same way. Chapter 9's publisher check (Exercise §9.2) does not help, because both prices are honest; they are just the wrong market's. §11.7 shows how a fuzzer found it. (Chapter 9's two Pyth order variants cannot use \`[ORACLE_SEED, market]\`, because Pyth's accounts are not this program's PDAs; they check the feed the market pinned with \`SetPythFeeds\` instead, §9.5.)

**Initial margin check** (lines 2915–2926):

\`\`\`rust
let notional_val = notional(size, mark);
let im_required = notional_val * (INITIAL_MARGIN_BPS as u128) / 10_000;
if (collateral as u128) < im_required {
    msg!(
        "open_position: collateral {} < initial margin {} ...",
        collateral, im_required, ...
    );
    return Err(ProgramError::InvalidArgument);
}
\`\`\`

The collateral must cover at least 10% of notional. If you ask for a position of 10 at price 100 (notional = 1000) with collateral 50, the check rejects: 50 < 100 (IM). With collateral 100, accepted exactly at IM. With collateral 200, accepted with 100 of buffer above IM.

**Allocate the position PDA**: standard \`invoke_signed\` to \`System::create_account\`, signing with \`[POSITION_SEED, user.key, market.key, bump]\`. Same pattern as \`CreateMarket\`, \`CreateVault\`, etc. — Chapter 3 introduced it, every subsequent chapter has reused it.

**Escrow the collateral via CPI to SPL Token Transfer**:

\`\`\`rust
spl_token_transfer_user_signed(
    user_token_ai,    // source — user's quote account
    vault_token_ai,   // destination — per-(market, mint) vault PDA
    user_ai,          // authority — the user, signing the outer tx
    token_ai,         // SPL Token program
    collateral,       // amount in quote base-units
)?;
\`\`\`

\`spl_token_transfer_user_signed\` is one of the four escrow helpers factored at the top of the position section. It builds the SPL Token Transfer instruction by hand (Chapter 6's bytes-up pattern — \`[tag=3, amount_le]\` data + \`[source, dest, authority]\` accounts), then calls plain \`invoke\`. The user's signature on the outer transaction extends through to SPL Token via signer-privilege extension (Chapter 6 §6.2). After this CPI commits, the user's quote balance has dropped by \`collateral\` and the vault's has grown by the same.

The order matters: the position PDA must be allocated *before* the transfer, because if the transfer fails (insufficient funds) we want the whole transaction to revert — which it does, leaving no orphan Position account. If the order were reversed, an InsufficientFunds error on transfer would leave a half-initialized Position behind (rent paid, but no escrow). Atomicity of the whole tx is what makes the natural error handling correct.

**Write the position state**:

\`\`\`rust
position.size = size;
position.entry_price = mark;
position.collateral = collateral;
position.funding_snapshot_index = funding_snapshot;
\`\`\`

Four data writes. \`entry_price = mark\` stamps the oracle's price as the position's reference. \`funding_snapshot_index = funding_snapshot\` captures the funding index at this moment — every future close/liquidate computes funding PnL as the delta from this snapshot. \`collateral\` mirrors what's escrowed in the vault; the bookkeeping and the vault balance stay in sync because the same handler updates both atomically.

> **Exercise §11.3.** What happens if you try to \`OpenPosition\` against a stale oracle (more than 25 slots since the last \`SetOraclePrice\`)? Trace the failure path through \`read_fresh_oracle\`. Then run \`funding --update --rate 0\` and \`oracle --set --price ...\` and re-try the open.

---

## §11.4  Walking \`ClosePosition\`

\`process_close_position\`. Simpler than open in one dimension (no PDA creation) but more involved in another: it runs two outbound SPL Token CPIs signed by the vault authority PDA via \`invoke_signed\` — the user payout, and (on underwater close) the insurance fund's shortfall drain. The handler takes 12 accounts; the last two are the insurance fund state and its token account (§11.6).

**Validation + owner check** (lines 3052–3062):

\`\`\`rust
if position.user != *user_ai.key.as_ref() {
    msg!("close_position: caller is not the position owner");
    return Err(ProgramError::IllegalOwner);
}
\`\`\`

Only the position's owner may close it voluntarily. Liquidate (§11.5) is the route for anyone else. The user check uses the \`user\` field stored in the position rather than the PDA derivation — same information, easier to read.

**Read external inputs + compute equity** (lines 3040–3072):

\`\`\`rust
let mark = read_fresh_oracle(oracle_ai, program_id)?;
let funding_now = read_funding_index(funding_ai, program_id)?;
// ...
let equity = compute_equity(position, mark, funding_now);
\`\`\`

The same oracle + funding read pattern from open. Equity is the only computation that matters at close — it tells us what the position is worth right now in quote-currency terms.

**Compute the payout + zero the position record** (inside a \`try_borrow_mut_data\` scope so the borrow drops before the CPI):

\`\`\`rust
let payout: u64;
{
    let mut data = position_ai.try_borrow_mut_data()?;
    let position: &mut Position = bytemuck::from_bytes_mut(...);
    // ... owner check, size != 0 check ...
    let equity = compute_equity(position, mark, funding_now);
    payout = if equity < 0 { 0 } else { equity as u64 };

    position.collateral = 0;
    position.size = 0;
    position.entry_price = 0;
    position.funding_snapshot_index = funding_now;
}
\`\`\`

Note \`position.collateral = 0\` — the value isn't held in the position account anymore; it's about to be paid out from the vault. The position becomes a pure "closed" sentinel: size 0, entry 0, collateral 0.

**Pay the user from the vault** via \`invoke_signed\`:

\`\`\`rust
spl_token_transfer_vault_signed(
    vault_token_ai,
    user_token_ai,
    vault_authority_ai,
    market_ai.key,
    vault_auth_bump,
    token_ai,
    payout,
)?;
\`\`\`

The vault authority is a PDA at \`[VAULT_AUTH_SEED, market]\`, so the program signs for it: \`invoke_signed\` with \`[VAULT_AUTH_SEED, market_key, &[bump]]\`. The vault token account drops \`payout\` units; the user's token account receives them. If \`payout == 0\` (underwater close), the helper skips the CPI — no point burning CU on a zero-amount transfer.

**Underwater closes drain the insurance fund.** A position that closes with equity = -50 sends \`payout = 0\` to the user, and the handler additionally drains \`min(50, fund.balance)\` from the insurance fund's token account into the vault. The drain is the bookkeeping side of "the protocol covered the shortfall instead of the residue silently subsidizing the counterparty" — see §11.6 for the full design including the cap behavior when the fund runs dry.

> **Exercise §11.4.** Open a position at entry = 100, size = 5, collateral = 100. Move the oracle to mark = 80. Close. The expected equity is \`100 + 5 × (80 - 100) = 0\`. Verify the user's quote token balance after the close is unchanged from before the open (because payout = 0 — the 100 they deposited went into the vault and stayed there).

---

## §11.5  Walking \`Liquidate\`

\`process_liquidate\`. The crucial difference from close: **anyone can call it**. The handler runs *four* outbound SPL Token CPIs — vault → liquidator (the liquidator's slice of the penalty), vault → insurance fund (the fund's slice of the penalty), vault → position-owner (the remainder), and fund → vault (the shortfall drain when equity < 0) — all signed by the same vault authority PDA. The handler takes 13 accounts; the last two are the InsuranceFund state and its token account (§11.6).

**Validation**: the *liquidator* must be a signer, but the program does *not* check that the liquidator matches the position's user. Anyone can call liquidate on anyone's position. Additional escrow-side checks: token_program is SPL Token, both \`owner_token\` and \`liquidator_token\` are SPL Token-owned, vault_token matches the derived PDA, vault_authority matches the derived PDA (and the bump is captured for the two invoke_signed calls below).

\`\`\`rust
let liquidator_ai = accounts.first().ok_or(...)?;
// ...
if !liquidator_ai.is_signer { return Err(...); }
\`\`\`

This permissionless property is the heart of the liquidation engine. The system pays a small bounty (the liquidation penalty) to whoever first notices an underwater position and submits the liquidation tx. Without this, liquidations would depend on the protocol team running a centralized liquidator bot — which works but introduces uptime risk.

**Health check** (lines 3233–3253):

\`\`\`rust
let equity = compute_equity(position, mark, funding_now);
let notional_val = notional(position.size, mark);
let maint_required = (notional_val * (MAINT_MARGIN_BPS as u128) / 10_000) as i128;

if equity >= maint_required {
    msg!(
        "liquidate: position is healthy (equity {} >= maint {}), not liquidatable",
        equity, maint_required
    );
    return Err(ProgramError::InvalidArgument);
}
\`\`\`

If \`equity >= maintenance_margin\`, the position is fine and the call is rejected. The liquidator just paid tx fees for nothing — a small disincentive to spam-call liquidate against healthy positions. (Production protocols sometimes refund tx fees when this happens, or simply expect liquidators to do their own off-chain health check before submitting.)

**Apply penalty (split between liquidator and fund) + force-close + run four CPIs**:

\`\`\`rust
// Inside a borrow scope (so position data ref drops before CPIs):
let equity = compute_equity(position, mark, funding_now);
let raw_penalty = (notional_val * LIQUIDATION_PENALTY_BPS as u128 / 10_000) as i128;
let equity_positive = if equity < 0 { 0 } else { equity };
let penalty = raw_penalty.min(equity_positive);             // cap at available equity
let owner_remainder = (equity_positive - penalty).max(0);

// Split the penalty per INSURANCE_FUND_PENALTY_SHARE_BPS (= 5000 → 50/50).
let fund_slice = penalty * INSURANCE_FUND_PENALTY_SHARE_BPS / 10_000;
let liquidator_slice = penalty - fund_slice;

position.collateral = 0;
position.size = 0;
position.entry_price = 0;
position.funding_snapshot_index = funding_now;
// ─── borrow ends ───

// Fund state updates (own borrow scope):
//   fund.balance         += fund_slice;
//   fund.total_deposits  += fund_slice;
//   shortfall_drain      = if equity < 0 { min(-equity, fund.balance) } else { 0 };
//   fund.balance         -= shortfall_drain;
//   fund.total_drawdowns += shortfall_drain;

// Then four Token Transfers, all invoke_signed with vault_authority seeds:
spl_token_transfer_vault_signed(vault_token_ai, liquidator_token_ai, ..., liquidator_slice)?;
spl_token_transfer_vault_signed(vault_token_ai, fund_token_ai,       ..., fund_slice)?;
spl_token_transfer_vault_signed(vault_token_ai, owner_token_ai,      ..., owner_remainder)?;
spl_token_transfer_vault_signed(fund_token_ai,  vault_token_ai,      ..., shortfall_drain)?;
\`\`\`

The penalty is capped at the equity that survives (you can't pay a 50-unit bounty out of a position with 10 units of equity remaining). The four CPIs are sequential, all \`invoke_signed\` with the same vault-authority seeds. Either every Transfer succeeds and the position + fund state are fully wound, or the whole transaction reverts. The shortfall drain only fires (non-zero) on the equity < 0 path; on a healthy liquidation it's a 0-amount Transfer that the helper short-circuits.

The penalty serves two purposes:

1. **Liquidator incentive.** Running a liquidator bot has costs (RPC bandwidth, gas, monitoring infra). The penalty is the bounty that makes the work economically viable.
2. **User disincentive.** Approaching the liquidation threshold becomes costly even if you'd ultimately survive (e.g., the price reverses immediately after liquidation). Users are pushed to maintain higher buffers above MM than the IM↔MM gap suggests.

The Liquidate handler does NOT verify *why* the position is underwater. It could be price movement (mark moved against you), funding accumulation (rate compounded over time), or both. The equity calculation includes both contributions, and the maintenance check is on equity vs notional regardless of the cause. This is correct: liquidation triggers on insolvency, not on root cause.

> **Exercise §11.5.** Build the textbook "death spiral" scenario:
>   1. Open a long at size = 10, entry = 100, collateral = 100 (right at IM).
>   2. Move the oracle mark to 95 (price drop). Check \`equity\` and \`maint_required\` — is the position liquidatable? The drop costs 10 × (95 − 100) = -50, so equity = 50, maint = 10×95×0.05 = 47.5. Still healthy.
>   3. Move to 94. Equity = 40, maint = 47. *Now* liquidatable.
>   4. Submit Liquidate from a *different* keypair. Confirm the position closes and the penalty is applied.

---

## §11.6  Insurance fund — penalty split, shortfall drain

The vanilla escrow path leaves one honesty problem: when a position closes underwater (\`equity < 0\`), the user's deposited collateral is already in the vault, the user gets 0, and the residue implicitly subsidizes the counterparty. There's no accounting of "the protocol absorbed this loss" — the vault is just quieter than it should be. The insurance fund is the bookkeeping piece that fixes this.

### The state

Two PDAs per market:

\`\`\`rust
// crates/state/src/lib.rs
pub struct InsuranceFund {
    pub discriminator: [u8; 8],   // INSFUND\\0
    pub bump: u8,
    pub _pad0: [u8; 7],
    pub market: [u8; 32],
    pub mint: [u8; 32],           // quote_mint (matches market.quote_mint)
    pub balance: u64,             // mirrors the token-account balance
    pub total_deposits: u64,      // observability
    pub total_drawdowns: u64,     // observability
    pub _reserved: [u8; 32],
}
\`\`\`

\`\`\`text
fund state PDA  : [b"insurance_fund",       market]      — program-owned
fund token PDA  : [b"insurance_fund_token", market, mint] — SPL Token-owned,
                                                             authority = vault_authority
                                                             (the same PDA Liquidate
                                                              already signs as)
\`\`\`

Reusing \`vault_authority\` is the choice that keeps the implementation small. The position vault and the fund vault are different token accounts but share one signer PDA — so \`Liquidate\` already knows how to sign \`vault → fund\` or \`fund → vault\` Transfers without introducing a new authority surface. The on-chain \`balance\` counter is redundant with the SPL Token account's lamport-side balance, but it gives scripts and indexers cheap access to the running total without parsing SPL Token bytes, and it lets the chapter's "verify yourself" tests assert on it directly.

### Penalty split

\`Liquidate\` now splits the penalty between the liquidator and the fund:

\`\`\`rust
let fund_slice = penalty * INSURANCE_FUND_PENALTY_SHARE_BPS / 10_000;  // = penalty / 2
let liquidator_slice = penalty - fund_slice;
\`\`\`

With \`INSURANCE_FUND_PENALTY_SHARE_BPS = 5000\`, half the penalty goes to the fund as a deposit, the rest to the liquidator as their bounty. Three Token Transfers fire per liquidate now instead of two — vault → liquidator (liquidator slice), vault → fund (fund slice), vault → owner (remainder).

In a healthy liquidation (equity > 0, position only underwater on margin), the liquidator still gets paid enough to make liquidation worth their CU + tx-fee cost. With \`LIQUIDATION_PENALTY_BPS = 100\` and the 50/50 split, the liquidator's effective bounty drops from 1% of notional to 0.5%. For our chapter values that's fine; production tuning is a function of typical position size, liquidator infrastructure costs, and how aggressively the protocol wants to grow the fund.

### Shortfall drain

\`ClosePosition\` and \`Liquidate\` both run the same drain logic at the end of their handler:

\`\`\`rust
let shortfall_drain = if equity < 0 {
    let shortfall = (-equity).min(u64::MAX as i128) as u64;
    shortfall.min(fund.balance)        // never drain more than the fund holds
} else {
    0
};
fund.balance -= shortfall_drain;
fund.total_drawdowns += shortfall_drain;
// ... then: SPL Token Transfer fund_token → vault_token (shortfall_drain)
\`\`\`

The Transfer goes *into* the vault, not to the user. The user still receives \`payout = if equity < 0 { 0 } else { equity }\`. The drain is bookkeeping for the protocol — it represents the fund covering the loss the vault would otherwise have absorbed silently. The Transfer is signed by \`vault_authority\`, the same PDA that signs the vault → user payout, so the same \`invoke_signed\` call path is reused for both.

When \`fund.balance < shortfall\` the drain caps at \`fund.balance\`. The uncovered remainder is a *socialized loss*: it stays in the vault as residue and falls implicitly on whoever holds the other side of the trade. Production exchanges resolve this with **autodeleverage** (force-close the most profitable counterparty positions until the loss is fully absorbed) or **explicit socialization** (mark all open positions in the same direction down). Our chapter ships the simpler path of "let it stay residue, document the cap" — autodeleverage is its own architectural problem.

### CreateInsuranceFund + InsuranceFundDeposit

\`CreateInsuranceFund\` is the one-shot bootstrap, run once per market. It mirrors \`CreateVault\` from Chapter 6 — System \`create_account\` with PDA signing for both the state account and the token account, plus an \`InitializeAccount3\` CPI to set the fund-token's owner to \`vault_authority\`.

\`InsuranceFundDeposit\` is permissionless. Anyone with quote tokens can credit the fund — most commonly the protocol team for initial seed, but in practice donations or admin top-ups are valid uses too. The handler runs in the standard "update counters in borrow scope, drop borrow, Transfer at the end" pattern, with \`total_deposits\` advancing alongside \`balance\`.

### Two account additions to ClosePosition / Liquidate

Both handlers grew two accounts at the end of their list:

\`\`\`
N-2.  [WRITE]  insurance_fund        — InsuranceFund state PDA
N-1.  [WRITE]  insurance_fund_token  — fund's SPL token account
\`\`\`

\`ClosePosition\` is now 12 accounts; \`Liquidate\` is 13. The fund-state writability is for the counter updates; the fund-token writability is for the penalty-credit Transfer and (on underwater close) the shortfall drain.

> **Exercise §11.6.** Open a position, push the oracle hard against it until equity falls below \`maint\`, but stop *before* equity goes negative. Liquidate. Observe in the dump: the fund's \`total_deposits\` should grow by \`fund_slice\`. Now reduce the oracle further to push equity below zero on the same market with a fresh position. Liquidate again — \`total_drawdowns\` should grow by \`min(-equity, fund.balance)\`. When does the fund stop being able to absorb shortfalls, and what would you ship at that point?

---

## §11.7  Recap + verify yourself

### Recap diagram

\`\`\`
Position lifecycle:

  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │            ┌────────────────┐                                    │
  │   user ──► │ OpenPosition   │   reads: oracle(mark) + funding    │
  │            │                │   writes: position (size, entry,   │
  │            └───────┬────────┘            collateral, snapshot)   │
  │                    │                                             │
  │                    ▼                                             │
  │            ┌────────────────┐                                    │
  │            │   live state   │   (mark moves, funding accrues)    │
  │            └───┬────────┬───┘                                    │
  │                │        │                                        │
  │   owner-only   │        │   permissionless                       │
  │                ▼        ▼                                        │
  │     ┌──────────────┐  ┌──────────────┐                           │
  │     │ ClosePosition│  │  Liquidate   │   reads: oracle + funding │
  │     │ (settle PnL) │  │ (penalty +   │   writes: position        │
  │     │              │  │  force-close)│       (collateral, size=0)│
  │     └──────────────┘  └──────────────┘                           │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘


Math:
  notional       = |size| × mark
  initial_margin = notional × INITIAL_MARGIN_BPS / 10000   (10%)
  maint_margin   = notional × MAINT_MARGIN_BPS / 10000     (5%)
  price_pnl      = size × (mark − entry_price)
  funding_pnl    = (index_now − snapshot_index) × size / 1e9
  equity         = collateral + price_pnl + funding_pnl
  liquidatable   = equity < maint_margin
\`\`\`

### Three things to verify yourself

1. **The IM↔MM gap is the buffer.** Open a position right at IM (collateral = 10% of notional). Without any oracle move, check via the dump output that the position is healthy (equity ≈ collateral, well above MM). Move the oracle to where the IM gap is consumed (5% adverse). Now equity ≈ MM — still not liquidatable. One more bp of adverse move and \`Liquidate\` succeeds.
2. **Funding accrual can flip the answer.** Open a position with collateral right at MM. Don't touch the oracle. Let funding accumulate against you via \`funding --update --rate 100\`, wait a minute, \`funding --update --rate 100\`. Check the position's computed equity in the dump — funding PnL has dragged it below MM even though the price hasn't moved. \`Liquidate\` will succeed.
3. **Closing returns collateral; liquidating doesn't.** Open at IM, close immediately (no price move, no funding). \`position.collateral\` ≈ original. Open at IM again, let it fall to MM, get liquidated by a separate keypair. \`position.collateral\` after liquidate = equity − penalty ≈ much less. The penalty is the daylight between "exit cleanly" and "let yourself get liquidated."


### Now let a tool look for the check you forgot

[\`fuzz/positions/\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/positions) is a [solinv](https://github.com/psyto/solinv) harness for the three position handlers. Two markets share the quote mint Q, each with its oracle, funding state, token account and insurance fund: \`m\` at 100 and \`n\` at 200. On \`m\`, A holds a long and B a short, both healthy; E holds a long opened at 110 that is under maintenance margin at 100 but still owed a remainder; C has no position yet. On \`n\`, D holds a long, so \`n\`'s token account has tokens in it. The specs open C's position, close A's, liquidate B's and E's, and swap in \`n\`'s oracle and funding state, another user's position, \`n\`'s token account and insurance fund, and token accounts the caller does not hold; two sets swap all of \`n\`'s accounts at once. Set up as in Chapter 3 §3.7, then:

\`\`\`bash
cargo build-sbf --manifest-path programs/openhl-core/Cargo.toml
cd fuzz/positions
cargo build --release --features invariant_ch11
cargo test --release --features invariant_ch11
timeout -s INT 60 crucible run openhl_positions_fuzz invariant_ch11 \\
    --binary-in target/release/invariant_test --timeout 45
\`\`\`

On the program as it is, no \`[FUZZ_FINDING]\` line appears. On the program before \`verify_market_oracle_and_funding\`, the first run reported, within seconds:

\`\`\`
[FUZZ_FINDING] [account-swap:…] ix open_position succeeded with account 3 swapped … (different context, same shape)
\`\`\`

Slot 3 is the oracle. Crucible stops an iteration at the first finding, so Close and Liquidate never got their turn; the tests \`close_refuses_another_markets_oracle\` and \`liquidate_refuses_another_markets_oracle\` pin those two.

> **Exercise §11.7.** Delete each check in turn, rebuild, run, and predict first. Here is what we measured, 45 seconds each; for the "no" rows, the last column is what refused the swapped call instead, read from its logs (the \`probe\` test prints them):
>
> | Check deleted | Caught? | How, or what refused it instead |
> |---|---|---|
> | Open: \`user_ai.is_signer\` | no | the runtime: unauthorized signer (the collateral transfer needs the user's signature) |
> | Open: \`market_ai.owner == program_id\` | no | our next check: \`market is not a Market account\` |
> | Open: \`verify_vault_token_account\` | **yes**, account-swap, slot 7 | collateral escrowed into \`n\`'s account, recorded on \`m\` |
> | Open: the position PDA | no | the runtime: unauthorized signer (\`create_account\` at another address needs its signature) |
> | Open: \`verify_market_oracle_and_funding\` | **yes**, account-swap, slot 3 | entry price from \`n\`'s oracle |
> | Open: the initial margin check | no | nothing in the harness states the margin rule; \`open_below_initial_margin_is_refused\` fails |
> | Close: \`user_ai.is_signer\` | **yes**, signer-skip | anyone could close A's position |
> | Close: \`position.user == user\` | **yes**, account-swap, slot 1 | A closed B's position |
> | Close: \`position.market == market\` | **yes**, with a set | \`m\`'s position closed against all of \`n\`'s accounts |
> | Close: \`verify_vault_token_account\` | no | SPL Token: \`owner does not match\` (\`m\`'s authority cannot sign for \`n\`'s account) |
> | Close: \`verify_market_oracle_and_funding\` | **yes**, account-swap, slot 2 | closed at \`n\`'s price; \`close_refuses_another_markets_oracle\` fails |
> | Close: \`fund.market == market\` | **yes**, account-swap, slot 10 | \`n\`'s insurance fund accepted for \`m\`'s position (A's close was in profit, so no fund was drawn on; the finding is the acceptance) |
> | Liquidate: \`liquidator_ai.is_signer\` | **yes**, signer-skip | — but see below |
> | Liquidate: \`position.market == market\` | **yes**, with a set | as for Close |
> | Liquidate: the owner's token account | **yes**, account-swap, slot 6 | E's remainder paid to the liquidator |
> | Liquidate: \`is_liquidatable\` | no | nothing in the harness states when liquidation is allowed; \`healthy_position_is_not_liquidatable\` fails |
> | Liquidate: \`verify_market_oracle_and_funding\` | **yes**, account-swap, slot 2 | B's healthy short liquidated at \`n\`'s price; \`liquidate_refuses_another_markets_oracle\` fails |
>
> Three rows need a second look. The liquidator signer row is a finding that is not a hole: liquidation is permissionless (§11.5), the penalty goes to whatever token account the caller names, and nothing else depends on who signed, so dropping that check lets in no one who was not already allowed. The two margin rows are holes the fuzzer cannot see: a position opened without enough collateral, or a healthy one liquidated, is a call with all the right accounts. Only the tests, which state the rules, catch those. A fuzzer that swaps accounts finds missing *bindings*; rules about numbers need someone to write them down (Chapter 13 §13.6 does that for fees).
>
> Two traps from writing the harness, both of which made a row read "no" for the wrong reason. Our first liquidation target was B, healthy at \`m\`'s price, so every swap of B's liquidation failed the health check before it reached the account being tested. E, liquidatable at 100, fixed that, and then E's remainder after the penalty was 0, so routing it to the liquidator moved nothing; E now has 130 collateral. And our first version of the owner-account mutation added \`false &&\` to a condition chained with \`||\`, which by precedence left the rest of the check in place. In each case the probe's log line showed which check had actually refused the call.

---

## Hook into Chapter 12

You now have a perp DEX whose positions can be opened, closed, and force-liquidated. The unit of throughput is now bigger: a single \`OpenPosition\` involves 6 accounts, a \`Liquidate\` involves 4, and the supporting reads (oracle + funding) add a few more. The accounts touched form a write-set graph — and how that graph is laid out determines what Sealevel can run in parallel and what serializes.

Chapter 12 builds the **native vault program** — the dedicated wrapper account that aggregates user collateral into a fund that's traded as a whole. Vault depositors share PnL; the vault manager places trades on their behalf using the Phase B primitives we've built. The vault accounts form a different write-set graph than per-position trading: every deposit touches the vault aggregate, every trade touches positions owned by the vault. We'll see how the singleton-write-shared antipattern from Chapter 5 reasserts itself (the vault total *is* a singleton), and the design moves the architecture has to make to keep throughput sane.
`,
                },
                {
                  title: "Chapter 12 — Native Vault Program (Pooled Trading)",
                  slug: "solana-internals-ch12-vault-en",
                  type: 'CONTENT',
                  sortOrder: 6,
                  duration: 45,
                  xpReward: 100,
                  content: `# Chapter 12 — Native Vault Program (Pooled Trading)

> Status: draft (v0.1).
> Companion code: [\`crates/state/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/state/src/lib.rs) (\`TradingVault\`, \`VaultShare\`), [\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs) (\`process_create_trading_vault\` 3444–3563, \`process_vault_deposit\` 3578–3737, \`process_vault_withdraw\` 3751–3902, \`process_vault_update_nav\` 3909–3949), [\`scripts/vault/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/vault/src/main.rs), [\`fuzz/vault/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/vault/src/main.rs) (the solinv harness for §12.7).
>
> Since the parts split, the logic this chapter walks through lives in [\`crates/vault/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/vault/src/lib.rs) (\`openhl-vault\`); the program calls it. The code quoted below is the pre-split version from \`programs/openhl-core/src/lib.rs\`, and its line numbers are not kept in sync.

---

## §12.0  Framing — and a naming clarification

The word "vault" appears twice in this codebase:

- **Chapter 6's \`Vault\`** was an SPL Token Account — a single-user custody account where one user's collateral lived. Owner: the SPL Token program. Pure plumbing.
- **Chapter 12's \`TradingVault\`** is something completely different — a pooled fund where many users deposit assets and share the manager's PnL pro-rata via shares. Owner: openhl-core. Has shares, NAV, deposit/withdraw economics.

Both are reasonable uses of the word "vault." We picked the type names to disambiguate (\`TradingVault\` is unambiguous; \`Vault\` from Chapter 6 has no dedicated state struct — it's just an SPL Token Account). The instructions don't collide because of the \`CreateVault\` (token account) vs \`CreateTradingVault\` (this chapter) split.

The trading vault is the conceptual primitive that turns a perp DEX from a venue where users trade directly into a venue that also hosts *funds*. A user who doesn't want to manage positions themselves can deposit into a vault; the vault's manager runs the strategy; depositors share returns. This is the structure behind every yield vault on Solana — Drift's spot vaults, Kamino's leveraged vaults, Jupiter's perps vault, and so on.

This chapter builds the vault's accounting half — shares, deposits, withdrawals, NAV updates — *with the real SPL Token escrow wired in*. Deposit moves actual quote tokens from the depositor's account into the trading vault's own token account, a PDA at \`[TRADING_VAULT_TOKEN_SEED, vault]\` that \`CreateTradingVault\` creates next to the vault. Withdraw moves them back, signed by the trading vault PDA itself via \`invoke_signed\`. (The first version of this chapter used the per-(market, mint) account that Chapter 6 created and Chapter 11 uses for position collateral, shared by every vault in the market. §12.5 shows what that cost.) The bookkeeping (\`total_shares\`, \`total_assets\`, \`VaultShare.shares\`) and the actual token balance stay in sync because each handler updates both atomically.

It does not build the manager's trading half (which would be a thin wrapper instruction calling into Chapter 11's \`OpenPosition\` with the vault's PDA as the position owner, moving collateral from the vault's token account into the market's). Adding that is mechanical once the share accounting and the escrow are in place; the chapter explains the design and leaves implementation as a homework piece.

What this chapter is actually about:

1. **The share/asset math** — how deposits and withdrawals preserve the pro-rata invariant when NAV changes. Independent of escrow; the math would be identical whether tokens moved or not.
2. **Atomic bookkeeping ↔ escrow updates** — every handler that touches \`total_shares\` / \`total_assets\` also runs the matching SPL Token CPI in the same transaction. Either both succeed or both revert. The two states cannot drift.
3. **The singleton-write reassertion** — every deposit and withdrawal mutates the same \`TradingVault\` account, so vault operations serialize at the scheduler. Chapter 5's antipattern shows up because we *deliberately* introduced it; we now see what mitigations look like in practice.
4. **The manager-trust model** — \`VaultUpdateNAV\` is the load-bearing trust assumption. How that's structured determines whether the vault is "trust the manager not to lie" or "verify NAV against on-chain state."

---

## §12.1  The two account types

From \`crates/state/src/lib.rs\`. Two new structs, both Pod, repr(C).

**\`TradingVault\`** (160 bytes): one per (market, manager) pair.

\`\`\`rust
pub struct TradingVault {
    pub discriminator: [u8; 8],
    pub bump: u8,
    pub _pad0: [u8; 7],
    pub market: [u8; 32],
    pub manager: [u8; 32],   // the trader; signs UpdateNAV
    pub mint: [u8; 32],      // asset mint (e.g., USDC)
    pub total_shares: u64,
    pub total_assets: u64,   // NAV — manager-reported
    pub _reserved: [u8; 32],
}
\`\`\`

The two load-bearing fields are \`total_shares\` and \`total_assets\`. Their ratio is the NAV per share. They are updated *together* on every deposit and withdrawal (proportionally, preserving the per-share value) and updated *independently* by NAV updates from the manager.

\`market\` and \`mint\` are denormalized — the (market, manager) pair already implies them via the PDA's seed scheme, but storing them in-account lets readers identify the vault without re-deriving from external context. \`manager\` is what \`VaultUpdateNAV\` checks the signer against.

**\`VaultShare\`** (128 bytes): one per (vault, depositor) pair.

\`\`\`rust
pub struct VaultShare {
    pub discriminator: [u8; 8],
    pub bump: u8,
    pub _pad0: [u8; 7],
    pub vault: [u8; 32],
    pub owner: [u8; 32],
    pub shares: u64,
    pub cost_basis: u64,     // cumulative assets deposited (for reporting)
    pub _reserved: [u8; 32],
}
\`\`\`

\`shares\` is the depositor's share count. \`cost_basis\` is the cumulative quote-asset amount they've deposited — used for P&L reporting (gain = \`withdraw_assets - cost_basis_share\`), not for any in-program logic. The depositor signs \`VaultWithdraw\` to prove they own these shares.

The PDA derivations:

- TradingVault: \`[b"trading_vault", market.key, manager.key]\`
- VaultShare: \`[b"vault_share", vault.key, owner.key]\`

> **Exercise §12.1.** A user holds 200 shares of a vault with \`total_shares = 1000\` and \`total_assets = 1500\`. What fraction of the vault do they own, and what is the per-share NAV? If the manager runs a successful trade that lifts \`total_assets\` to 1800 (without changing \`total_shares\`), what is the new per-share NAV?

---

## §12.2  The share/asset math

Three operations, one invariant.

**Invariant.** For any depositor, the value they could withdraw at any moment is:

\`\`\`
their_value = their_shares × total_assets / total_shares
\`\`\`

A deposit must preserve this invariant for *all existing depositors*: their pre-deposit value equals their post-deposit value. A withdrawal does the same: the remaining depositors' value is unchanged. NAV updates change everyone's value by the same proportion.

**Deposit.** From \`process_vault_deposit\` at \`programs/openhl-core/src/lib.rs:3564–3572\`:

\`\`\`rust
let shares_to_mint: u64 = if vault.total_shares == 0 || vault.total_assets == 0 {
    assets
} else {
    let numer = (assets as u128) * (vault.total_shares as u128);
    let s = numer / (vault.total_assets as u128);
    if s > u64::MAX as u128 {
        return Err(ProgramError::ArithmeticOverflow);
    }
    s as u64
};
\`\`\`

Two branches. The first deposit (when \`total_shares == 0\`) mints shares 1:1 with assets — there's no NAV history to interpolate from. Subsequent deposits use:

\`\`\`
shares_minted = assets_in × total_shares / total_assets
\`\`\`

Algebraically: this is the value of \`assets_in\` *expressed in shares*, at the current per-share NAV. After the deposit:

\`\`\`
new_total_shares = total_shares + shares_minted
new_total_assets = total_assets + assets_in
new_NAV_per_share = new_total_assets / new_total_shares
                  = (total_assets + assets_in)
                    / (total_shares + assets_in × total_shares / total_assets)
                  = total_assets × (total_assets + assets_in)
                    / (total_assets × total_shares + assets_in × total_shares)
                  = total_assets / total_shares
                  = old_NAV_per_share
\`\`\`

The NAV per share is unchanged. The invariant holds.

**Withdrawal.** From \`process_vault_withdraw\` at \`lib.rs:3729–3736\`:

\`\`\`rust
let assets_to_return: u64 = {
    let numer = (shares_to_burn as u128) * (vault.total_assets as u128);
    let a = numer / (vault.total_shares as u128);
    if a > u64::MAX as u128 {
        return Err(ProgramError::ArithmeticOverflow);
    }
    a as u64
};
\`\`\`

Same math, run backward:

\`\`\`
assets_returned = shares_burned × total_assets / total_shares
\`\`\`

After the withdrawal:

\`\`\`
new_total_shares = total_shares - shares_burned
new_total_assets = total_assets - assets_returned
new_NAV_per_share = (total_assets - shares_burned × total_assets / total_shares)
                  / (total_shares - shares_burned)
                  = ... (same algebra in reverse) ...
                  = total_assets / total_shares
                  = old_NAV_per_share
\`\`\`

Withdrawal also preserves the invariant.

**NAV update.** From \`process_vault_update_nav\` at \`lib.rs:3830–3831\`:

\`\`\`rust
let prev = vault.total_assets;
vault.total_assets = new_total_assets;
\`\`\`

The manager writes a new \`total_assets\`. \`total_shares\` is unchanged. So per-share NAV moves from \`prev / total_shares\` to \`new_total_assets / total_shares\`. Every depositor's value moves by the same factor. This is how PnL is shared.

These three pieces — deposit, withdraw, NAV update — are the entire vault accounting model. Everything else (gates, fees, vesting, restrictions) is policy on top.

**Integer division and dust.** The \`/\` operations are integer division. A user depositing 7 assets into a vault with 1000 total assets and 1000 total shares would mint \`7 × 1000 / 1000 = 7\` shares — clean. A user depositing 7 assets into a vault with 1000 total assets and 999 total shares would mint \`7 × 999 / 1000 = 6\` shares (\`6993 / 1000\`, integer-truncated). That extra 1/1000 of a share is dust — the user paid 7 assets but received the equivalent of 6.993 shares' worth of NAV value at deposit. The dust effectively donates that 0.007 shares' worth to the remaining depositors (their per-share value ticks up slightly).

This is generally acceptable for vaults because (1) the dust is rounding-error scale, (2) it favors existing depositors over new ones, which is the conservative direction. For programs that need exact preservation (e.g., yield-bearing tokens used as collateral elsewhere), additional precision via scaled u128 share representations or fixed-point arithmetic is required. We deliberately don't add that here — it would multiply the code without adding pedagogical value.

> **Exercise §12.2.** Start with an empty vault. Deposit 100 assets (depositor A). Set NAV to 200 (price doubled). Have depositor B deposit 100 assets. How many shares does B receive? What fraction of the vault does B now own?

---

## §12.3  Walking \`VaultDeposit\`

\`process_vault_deposit\` is the most complex of the four handlers because it conditionally creates the VaultShare PDA on first deposit *and* runs an SPL Token Transfer CPI at the end. Five phases:

**Validation**: payload size, non-zero deposit, depositor is signer, vault has correct owner + size, system program is correct, **token program is SPL Token, depositor's token account is SPL Token-owned, and the vault_token account is this vault's own, the PDA at \`[TRADING_VAULT_TOKEN_SEED, vault]\`**. The mint and market accounts passed in must match what's stored in the vault — caught by a \`vault.mint != mint_ai.key\` / \`vault.market != market_ai.key\` check inside the borrow scope below. Share PDA derivation is unchanged from before.

**Read vault state and compute shares to mint**: borrow vault data, cross-check the passed market/mint against vault.market/vault.mint, branch on first-deposit (1:1) vs subsequent (pro-rata).

**Update vault aggregate** (lines 3580–3587):

\`\`\`rust
vault.total_shares = vault.total_shares.checked_add(shares_to_mint)?;
vault.total_assets = vault.total_assets.checked_add(assets)?;
drop(vault_data);
\`\`\`

\`checked_add\` (not \`saturating_add\`): if the addition would overflow, refuse the deposit rather than silently capping. A vault that accepts deposits past \`u64::MAX\` shares has a different problem to solve. The explicit \`drop(vault_data)\` releases the mutable borrow before we touch the share account — necessary because share creation may CPI back through the vault account check path.

**Conditional create-or-update of the share account** (lines 3591–3636):

\`\`\`rust
let share_exists = share_ai.owner == program_id && share_ai.data_len() == VaultShare::LEN;
if !share_exists {
    let rent = Rent::get()?.minimum_balance(VaultShare::LEN);
    let create_ix = system_instruction::create_account(...);
    invoke_signed(...)?;
    // ... write VaultShare fields ...
} else {
    // ... add to existing shares + cost_basis ...
}
\`\`\`

The "exists?" check is by owner + data_len — if the account is owned by us and the right size, we assume it's a VaultShare we'd previously created. (The discriminator check happens inside the \`else\` branch when we cast the data.) If it's not ours, we create it via the standard \`invoke_signed\` + \`create_account\` pattern.

A user's first deposit pays the rent for their VaultShare account (small one-time cost). Subsequent deposits just increment fields. This is the conventional pattern — the alternative would be requiring the user to call a separate \`CreateVaultShare\` instruction first, which adds friction without benefit.

The handler must own the share account at the end regardless of which branch ran. In both branches the final state has \`share.shares\` reflecting the depositor's total holdings and \`share.cost_basis\` reflecting their cumulative deposits.

**Escrow the depositor's tokens** as the final step:

\`\`\`rust
spl_token_transfer_user_signed(
    depositor_token_ai,
    vault_token_ai,
    depositor_ai,
    token_ai,
    assets,
)?;
\`\`\`

Same helper from Chapter 11. The depositor signs the outer transaction; the signature flows through to SPL Token via the standard signer-privilege-extension pattern (Chapter 6 §6.2). \`assets\` units move from \`depositor_token\` into \`vault_token\`, the vault's own token account. Nothing else is in it: not other vaults' deposits, not position collateral.

**Order matters.** The CPI is placed *after* the share+aggregate updates. If the transfer fails (\`InsufficientFunds\`, account frozen, etc.), Solana reverts the entire transaction — including the share creation, the share field updates, and the vault aggregate increment. So a failed escrow leaves the depositor with no shares minted and no vault state change. The atomicity guarantee is what makes the natural error handling correct without explicit rollback code.

> **Exercise §12.3.** A user deposits 100, then 50, then 25 in three separate transactions. The vault's NAV is constant (no UpdateNAV in between). At each step, dump the user's share account *and* the vault token account balance. The shares count should grow linearly (100 / 150 / 175), the cost_basis should be the running sum, and the vault token balance should equal the cost_basis exactly.

---

## §12.4  Walking \`VaultWithdraw\`

Simpler than deposit because there's nothing to create — but it does pay out tokens from the vault, which means an \`invoke_signed\` CPI signed by the trading vault PDA. \`process_vault_withdraw\`:

**Compute assets to return** at lines 3729–3736 — the inverse of the deposit formula, as covered in §12.2.

**Authorization** at lines 3751–3754:

\`\`\`rust
if share.owner != *owner_ai.key.as_ref() {
    msg!("vault_withdraw: caller is not the share owner");
    return Err(ProgramError::IllegalOwner);
}
\`\`\`

Only the share's recorded owner may burn it. This is a *per-share* authorization, not vault-wide — different from the manager check in UpdateNAV. There is no "vault admin can liquidate any share" path in this design (which a real production vault might add for compliance reasons).

**Binding the share to this vault**, just before the owner check:

\`\`\`rust
if share.vault != *vault_ai.key.as_ref() {
    msg!("vault_withdraw: share belongs to another vault");
    return Err(ProgramError::InvalidAccountData);
}
\`\`\`

Deposit never needed this line: it re-derives the share PDA from \`[VAULT_SHARE_SEED, vault, depositor]\`, so a share of another vault fails the seed check. Withdraw does not re-derive it, and the first version of this chapter left the comparison out. It looked harmless, but vaults' share prices differ. They differ honestly, too, with no one lying: if vault X's shares are worth 1 and vault Y's are worth 2 after a good month, a holder of X shares who burns them against Y gets twice what they put in, paid out of Y's token account, which is Y's depositors' money. A manager who lies makes it worse. The regression test opens its own vault with 100,000 tokens, reports NAV 1, deposits 2 more for 200,000 new shares, and burns them against another vault: without the check that took all 200,000 tokens of the other vault. solinv found the gap, not a reviewer; §12.7 has you find it the same way.

**Sufficient-balance check** at lines 3755–3762:

\`\`\`rust
if share.shares < shares_to_burn {
    return Err(ProgramError::InsufficientFunds);
}
\`\`\`

You can't burn more shares than you hold.

**Cost basis reduction** at lines 3767–3769:

\`\`\`rust
let basis_reduction = (((shares_to_burn as u128) * (share.cost_basis as u128))
    / (share.shares as u128 + shares_to_burn as u128)) as u64;
share.cost_basis = share.cost_basis.saturating_sub(basis_reduction);
\`\`\`

Proportional reduction. If a user has 100 shares with cost_basis 1000 and burns 25 shares, the cost_basis reduces by \`25 × 1000 / 100 = 250\`, leaving the remaining 75 shares with cost_basis 750. This keeps the per-share cost_basis flat across partial withdrawals, which is what P&L reports want.

The \`as u128 + shares_to_burn as u128\` in the denominator uses \`share.shares\` *before* the subtraction (because we haven't subtracted yet). A naive \`share.shares as u128\` after a \`share.shares -= shares_to_burn\` would compute the wrong basis.

**Update aggregates** — \`total_shares -= shares_to_burn\`, \`total_assets -= assets_to_return\`. Both \`saturating_sub\` defensively, though both should never underflow given the prior checks.

**Pay the assets out from the vault** as the final step — this is the escrow CPI:

\`\`\`rust
let ix = Instruction {
    program_id: SPL_TOKEN_PROGRAM_ID,
    accounts: vec![
        AccountMeta::new(*vault_token_ai.key, false),
        AccountMeta::new(*owner_token_ai.key, false),
        AccountMeta::new_readonly(*vault_ai.key, true),
    ],
    data, // [TRANSFER][assets_to_return u64 LE]
};
// (inside \`if assets_to_return > 0\`: a zero payout skips the CPI)
invoke_signed(
    &ix,
    &[vault_token_ai.clone(), owner_token_ai.clone(), vault_ai.clone(), token_ai.clone()],
    &[&[TRADING_VAULT_SEED, vault_market.as_ref(), vault_manager.as_ref(), &[vault_bump]]],
)?;
\`\`\`

The mechanics differ from the deposit side in one critical way: **the authority is a PDA, not the user.** The depositor's signature on the outer transaction is meaningless to SPL Token here, because the token account being debited (\`vault_token\`) answers to the trading vault PDA. \`CreateTradingVault\` set that up: it created \`vault_token\` at \`[TRADING_VAULT_TOKEN_SEED, vault]\` and ran \`InitializeAccount3\` with the vault's address as the owner. So the program signs the inner CPI as the vault, with the vault's own seeds: \`[TRADING_VAULT_SEED, market, manager, bump]\`, all read from the \`TradingVault\` account, where \`CreateTradingVault\` stored them.

Two details. First, \`vault_market\`, \`vault_manager\` and \`vault_bump\` are copied out inside the borrow scope, and the borrow ends before the CPI: the vault account is passed to SPL Token as the signer, and the runtime refuses a CPI on an account whose data the caller still has borrowed. Second, a vault signs only for its own token account. If a caller passes another vault's token account as \`vault_token\`, the program refuses it first (the \`[TRADING_VAULT_TOKEN_SEED, vault]\` check), and SPL Token would refuse anyway, because this vault is not that account's authority.

And SPL Token checks the balance: if \`assets_to_return\` is more than \`vault_token\` holds, the transfer fails and the whole withdrawal reverts. The vault cannot pay out tokens it does not have, whatever its \`total_assets\` says.

**Order matters here too.** The CPI is last. If the token transfer fails (vault_token frozen, dest closed, etc.), the share-burn and aggregate-decrement revert with it. So a failed payout leaves the depositor with their shares intact and the vault unchanged.

> **Exercise §12.4.** With the vault from §12.2's exercise, have depositor A withdraw all their shares. Dump three things before and after: (1) depositor A's share account, (2) the vault aggregate state, and (3) the vault token account balance. Verify that the tokens A receives match what depositor B's claimable value implies for the remaining shares (i.e. that B's value is unchanged). Then look at (3) again: A took 200, the account held 200, and B is still owed 100 out of an empty account. The NAV went from 100 to 200 on the manager's word, not by tokens arriving. §12.5 is about that gap.

---

## §12.5  The manager-trust problem — \`VaultUpdateNAV\`

\`process_vault_update_nav\` at lines 3800–3840 is short, but it is where the entire vault model's trust assumption lives:

\`\`\`rust
if vault.manager != *manager_ai.key.as_ref() {
    msg!("vault_update_nav: caller is not the vault manager");
    return Err(ProgramError::IllegalOwner);
}

let prev = vault.total_assets;
vault.total_assets = new_total_assets;
\`\`\`

The manager signs a transaction that updates \`total_assets\` to whatever number they choose. There is no on-chain verification that this number reflects the manager's actual trading PnL. **The depositors trust the manager.**

The first version of this chapter was worse than that: *everyone in the market* trusted *every* manager, and \`CreateTradingVault\` lets anyone become one. Withdrawals paid out of the per-(market, mint) token account, which also held every other vault's deposits and every position's collateral, so nothing capped a vault's payout at what that vault held. A manager who deposited 100,000 into their own vault, reported NAV 300,000 and withdrew got 300,000 out, other people's 200,000 included. No check was missing; every account passed was the right one. The fix was the design: each vault now has its own token account (§12.0), and withdraw pays only from it. The test \`manager_cannot_withdraw_more_than_its_vault_holds\` in \`fuzz/vault\` runs the same steps now: the withdrawal of 300,000 fails in SPL Token, because the vault's account holds 100,000, and the other vault's 200,000 is untouched.

So the trust is back to what the paragraph above says, and no wider: a vault's depositors trust that vault's manager. A manager can still report a false NAV, and it still moves money between that vault's own depositors (whoever withdraws first at an inflated NAV takes tokens the others were counting on, as Exercise §12.4 shows). The three patterns below are about that.

Three patterns to harden this in production:

**(1) Compute NAV on-chain from referenced state.** Instead of accepting \`new_total_assets\` as a payload, the handler reads the vault's open Position accounts, sums their equity (using the same \`compute_equity\` from Chapter 11), and writes the result. Now the manager can't lie — \`total_assets\` is mechanically derived. Cost: a lot more accounts referenced per UpdateNAV call (one per position), pushing into CU and account-list limits.

**(2) Allow withdrawals at oracle prices, not stated NAV.** Withdrawals compute the assets they're owed based on a transparent on-chain rule (e.g., NAV-by-formula, not NAV-by-manager-report). Manager NAV reports become advisory metadata, not the basis for redemption.

**(3) Two-step NAV updates with delay.** Manager proposes a new NAV; the change applies after some delay (e.g., 1 hour); during that delay, depositors who think the manager is reporting falsely can withdraw at the *old* NAV. This is the trust-but-verify pattern used by some Curve/Yearn vaults.

Our chapter ships pattern (0) — no verification, manager is trusted. This is fine for educational and small-deployment vaults but is the right place to start a security audit when productizing.

The reason pattern (1) is so attractive in theory and so rarely implemented in practice: summing position equity across N positions requires loading N accounts, and N can be hundreds for a real vault. The transaction limit of ~64 accounts and the CU budget put hard limits on how many positions can be aggregated in one transaction. Production vaults either restrict themselves to a small number of concurrent positions or batch NAV updates across multiple transactions.

> **Exercise §12.5.** Walk through what would happen if the manager set \`total_assets\` to \`u64::MAX\` (a malicious update). What's the immediate effect on existing depositors? On new depositors? What's the eventual outcome when somebody tries to withdraw?

---

## §12.6  Singleton-write reassertion — the Chapter 5 antipattern, redux

\`TradingVault\` is the canonical singleton-write-shared account this codebase has had since Chapter 5's \`Stats\` warning. Every deposit, every withdrawal, every NAV update writes the same \`(total_shares, total_assets)\` pair. Two concurrent deposits from different users cannot run in parallel — they both write to the vault aggregate, and Sealevel serializes them.

How bad is this? With a 1-second deposit latency, the vault accepts one deposit per slot, ~2.5 deposits/sec maximum. For a vault with thousands of depositors moving capital between strategies, this is the binding constraint on user experience.

Three mitigations, all real, all used in production by different vaults:

**(1) Off-chain deposit queue.** Deposits are written off-chain to a queue (Redis, a database). A periodic on-chain "batch settle" instruction processes N deposits in one transaction, paying the singleton-write cost once for many users. Tradeoff: deposits aren't atomic anymore — users see "pending" status, then "confirmed" minutes later. Most institutional vaults work this way; it's the "you wait, but at 4 PM ET you're in the strategy" pattern.

**(2) Shard the vault.** Have N independent \`TradingVault\` accounts, each with its own (total_shares, total_assets). Deposits route to a shard based on the depositor's pubkey hash. Reads aggregate across all shards. This breaks the singleton — N shards mean N-way parallel deposits. Tradeoff: NAV updates now require N transactions, and rebalances across shards become a thing. Real-world example: large Curve/Yearn vaults sometimes shard for exactly this reason.

**(3) Per-deposit accumulator.** Instead of updating the singleton on every deposit, individual deposit "tickets" are written to per-user accounts, and a periodic "checkpoint" call rolls them into the singleton. Looks like option 1 but stays on-chain — the queue is the set of unsettled ticket accounts. Tradeoff: settlement complexity, slight delay between deposit and share issuance.

Our chapter ships option (0) — vanilla synchronous deposits. This is fine for low-throughput vaults (< 10 deposits/sec) and pedagogically clearest. The production path through (1) or (3) is well-trodden and not in scope for this chapter; the framing is "you can see why you'd want it now."

The deeper lesson, restating Chapter 5's: **every singleton write is a future scaling bottleneck.** When you find yourself reaching for a "totals" or "aggregate" account, ask whether you can express the same semantics without one. Sometimes the answer is yes (per-position settlement from Chapter 10 — no aggregate needed); sometimes the answer is no and you need the mitigation patterns above. The point is to make the trade consciously rather than discover it under load.

---

## §12.7  Recap + verify yourself

### Recap diagram

\`\`\`
Vault lifecycle:

  manager ──► CreateTradingVault ──► TradingVault{shares=0, assets=0}
                                            │
   user A deposits 100 ──► VaultDeposit ──► │
                                            ▼
                          TradingVault{shares=100, assets=100} (1:1 first)
                          VaultShare_A{shares=100, basis=100}
                                            │
   manager trades ──► UpdateNAV(200) ────►  │
                                            ▼
                          TradingVault{shares=100, assets=200} (NAV ×2)
                                            │
   user B deposits 100 ──► VaultDeposit ──► │  shares = 100 × 100 / 200 = 50
                                            ▼
                          TradingVault{shares=150, assets=300}
                          VaultShare_B{shares=50, basis=100}

   A withdraws all ──► VaultWithdraw(100) ──► assets_out = 100 × 300 / 150 = 200
                                            ▼
                          TradingVault{shares=50, assets=100}
                          VaultShare_A{shares=0, basis=0}
                          VaultShare_B{shares=50, basis=100} (unchanged)


Singleton-write reassertion (Ch.5 redux):

  All four instructions WRITE the TradingVault account:
    deposit / withdraw / update_nav / create

  ⇒ Sealevel serializes every vault operation against every other.
  ⇒ Throughput cap: ~1 op per slot per vault.

  Mitigations (not implemented here):
    - off-chain deposit queue → batch settle
    - shard the vault across N independent aggregates
    - per-deposit accumulator + periodic checkpoint
\`\`\`

### Three things to verify yourself

1. **NAV preservation across deposits.** Start with empty vault. Have A deposit 100. Have B deposit 100 immediately (no UpdateNAV between). The vault should have \`total_shares = 200, total_assets = 200\`, and A's and B's per-share NAV must both equal 1.0. Now have C deposit 100. Same per-share NAV: 1.0.
2. **NAV update changes everyone's value uniformly.** From the above state, run \`vault --update-nav --total-assets 600\` (3× value). A's \`claimable_assets = A.shares × total_assets / total_shares = 100 × 600 / 300 = 200\`. B and C the same. All three depositors share the 3× gain proportionally.
3. **Withdrawal at non-1:1 NAV.** From the above (each depositor has 100 shares worth 200 assets each), have A withdraw all 100 shares. They receive 200 assets. The vault now has \`total_shares = 200, total_assets = 400\`. B and C each still own 100 shares (50% of vault), worth 200 assets each — unchanged by A's exit.

### Now let a tool look for the check you forgot

Three exercises check the arithmetic. None of them checks the account checks: the \`if ... { return Err(...) }\` lines in §12.3 and §12.4 that decide *which* accounts a caller may pass. Forgetting one of those fails no test you would think to write, as §12.4's \`share.vault\` line shows. [solinv](https://github.com/psyto/solinv) fuzzes a native program for exactly this. You tell it which accounts an attacker could pass instead (another depositor's share, another vault, a token account the vault doesn't hold), and it sends each instruction with one of them swapped in, or, for a set you declare, several together. If a swapped call succeeds and changes state, that is a finding.

\`fuzz/vault/\` is that harness for this chapter. It sets up one market with three vaults, each with its own token account: K's, where A and B hold shares, A's own, and C's in a junk mint. It installs solinv the way its README tells anyone to, by git rev. You need the Solana toolchain and the Crucible CLI (\`cargo install --locked --git https://github.com/asymmetric-research/crucible --tag v0.1.0 crucible-fuzz-cli\`):

\`\`\`bash
cargo build-sbf --manifest-path programs/openhl-core/Cargo.toml
cd fuzz/vault
cargo build --release --features invariant_vault
cargo test --release --features invariant_vault        # the attack from §12.4, refused
timeout -s INT 90 crucible run openhl_vault_fuzz invariant_vault \\
    --binary-in target/release/invariant_test --timeout 90
\`\`\`

On the program as it is, no \`[FUZZ_FINDING]\` line appears. (Crucible checks \`--timeout\` only every 1000 iterations, hence the outer \`timeout\`. On macOS it is \`gtimeout\` from coreutils.)

> **Exercise §12.7.** Delete the \`share.vault\` check from \`process_vault_withdraw\`, rebuild the program (the first command), and run the fuzzer again. Within a few seconds you should see:
>
> \`\`\`
> [FUZZ_FINDING] [account-swap:…] ix vault_withdraw succeeded with account 1 swapped from <K's vault> to <A's vault> (different context, same shape)
> \`\`\`
>
> \`cargo test\` fails too, and its message tells you how much A took. Put the check back. Then delete the others one at a time and predict the result before you run it. Here is what we measured, 60 seconds each:
>
> | Check deleted | Caught? |
> |---|---|
> | withdraw: \`owner.is_signer\` | yes, signer-skip, slot 0 |
> | withdraw: \`share.vault == vault\` | yes, account-swap, slot 1 |
> | withdraw: \`share.owner == owner\` | yes, account-swap, slot 2 |
> | deposit: the share PDA re-derivation | yes, account-swap, slot 1 |
> | deposit: \`verify_trading_vault_token\` | yes, account-swap, slot 7 |
> | deposit: \`depositor.is_signer\` | no |
> | withdraw: \`vault.owner == program_id\` | no |
> | withdraw: \`share.owner == program_id\` | no |
> | withdraw: \`verify_trading_vault_token\` | no, not even with the two-slot set below |
>
> Before reading on, work out why the four "no" rows come back "no".
>
> All four are backed by something else. We did not try to exploit these, we only found no way through. The two owner checks are backed by the runtime itself (Chapter 1): withdraw writes both accounts, and a program cannot change an account it does not own, so a substituted account fails at the next CPI or at the end of the instruction. The deposit signer check is backed by the runtime's signer rule (Chapter 6 §6.2): deposit's SPL Token \`Transfer\` marks the depositor as a signer, and a program can pass on only the signatures it was given, so the CPI fails (\`Cross-program invocation with unauthorized signer\`) before SPL Token runs. These three are still worth keeping, because they fail earlier and with a clearer error.
>
> The fourth is backed by SPL Token's authority check. A vault signs only as itself, and each vault's token account answers only to its own vault, so naming another vault's token account as the source fails with \`OwnerMismatch\`. It was not always so. In the first version of this chapter every token account in the market answered to one \`vault_authority\` PDA, \`[VAULT_AUTH_SEED, market]\`, and this row was a real hole: C opened a vault in a junk mint, deposited 300,000 junk, and withdrew it naming the real mint's token account as the source and C's own real-mint account as the destination, swapping 300,000 junk for 300,000 real. That takes *two* accounts changed together. solinv's plain account-swap changes one slot at a time, our first table listed the row as "no" and called it harmless, and a reviewer found the attack. The harness still declares that pair (\`check_sets\`: C's junk withdrawal with the destination and the source swapped together, now for K's token account), and the test \`withdraw_refuses_the_token_account_of_another_vault\` pins it. That test asks for 100,000, under K's balance, on purpose. Asking for 300,000, more than K's account holds, SPL Token refuses on the balance before it looks at the authority, so with the program's check deleted you would see "insufficient funds" and learn nothing about whether SPL Token backs the row. With 100,000 you see \`OwnerMismatch\`. When you reason from a refusal, check *which* refusal. And a "no" from a fuzzer means only that the swaps you described found no way through. It does not mean there is none.
>
> What the harness does not cover: §12.5's manager-reported NAV. A manager who reports a false NAV passes only accounts they are entitled to pass, so a fuzzer that swaps accounts has nothing to swap. The market-wide version of that hole survived all nine checks; closing it took a design change (one token account per vault), not a line. What is left, a manager misreporting to their own depositors, is just as invisible to the fuzzer. Finding these takes reading the design, not deleting lines.

---

## Hook into Chapter 13

You now have a vault that can pool depositor capital and distribute PnL pro-rata. What you don't have is **a mechanism for the vault to actually trade**. The manager's NAV updates in §12.5 are claims, not verified actions — there is no instruction that says "vault manager opens a position using the vault's assets." Adding that is the natural next step in the Phase B integration arc: a manager-signed \`VaultOpenPosition\` that creates a Position owned by the vault PDA (using \`invoke_signed\` with the vault's seeds), drawing collateral from the vault's tracked assets.

Chapter 13 builds builder codes — the protocol-native referral / fee-share mechanism that lets a trading frontend collect a slice of fees from users routed through it. Builder codes touch every fee-bearing instruction in the program (place_order, deposits in the production-escrow path, liquidations) and add a fee_recipient account to each transaction's AccountMeta. The chapter explores how the fee split happens atomically with the underlying action (no separate "claim fees" call required) and how the builder-code structure encodes the distribution incentives that make Solana DEX frontends viable as standalone businesses.
`,
                },
                {
                  title: "Chapter 13 — Builder Codes as a Protocol Primitive",
                  slug: "solana-internals-ch13-builder-codes-en",
                  type: 'CONTENT',
                  sortOrder: 7,
                  duration: 45,
                  xpReward: 100,
                  content: `# Chapter 13 — Builder Codes as a Protocol Primitive

> Status: draft (v0.1).
> Companion code: [\`crates/state/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/state/src/lib.rs) (\`BuilderProfile\`), [\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs) (\`process_register_builder\`, \`process_place_order_with_builder\`, \`process_claim_builder_fees\`, \`process_create_fee_vault\`), [\`scripts/builder/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/builder/src/main.rs), [\`fuzz/fees/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/fees/src/main.rs) (the solinv harness for §13.6).
>
> Since the parts split, the logic this chapter walks through lives in [\`crates/fees/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/fees/src/lib.rs) (\`openhl-fees\`); the program calls it. The code quoted below is the pre-split version from \`programs/openhl-core/src/lib.rs\`, and its line numbers are not kept in sync.

---

## §13.0  Framing — what builder codes are, and what they aren't

A **builder code** is a per-frontend identifier that gets attached to a trade. When a user opens an order through a frontend, the frontend includes its builder code in the transaction; the program then credits a configurable fraction of the trade's protocol fee to that builder's on-chain account.

Hyperliquid coined the term in its current sense. It is the protocol-native mechanism that lets a frontend monetize its order flow without having to operate the order book itself. Same family as "router fees" (Uniswap), "white-label routing" (CEXes), "introducing broker" (TradFi) — Solana's version of a long-standing distribution incentive.

Two things builder codes are **not**:

- **Referral codes.** Referral codes reward whoever introduced a new user; they typically pay once per signup or as a long-tail percentage of the referee's fees forever. Builder codes pay per *trade* and don't track who introduced whom — they reward routing, not introductions.
- **Maker/taker rebates.** Maker rebates pay the user (the limit order placer) part of their own fee back. Builder codes pay a *third party* (the frontend) a fraction of the user's fee. The user pays the same gross fee either way; what differs is who receives the split.

This chapter ships three trading instructions and one bootstrap:

1. **\`RegisterBuilder\`** — each builder creates a per-builder \`BuilderProfile\` PDA that holds their accumulated fees and their self-declared max share. Registration is required because the program needs an account to credit; no account, no fees.
2. **\`PlaceOrderWithBuilder\`** — the trading instruction variant that takes a builder profile as its last account. Computes the protocol fee, escrows it into the per-(quote_mint) fee vault, splits the builder's share into the profile's \`accumulated_fees\`, and runs the same place-order path as \`PlaceOrderChecked\`.
3. **\`ClaimBuilderFees\`** — the builder's withdraw call. Zeroes the accumulator and PDA-signs an SPL Token Transfer of the claimed amount from the fee vault into the builder's token account.
4. **\`CreateFeeVault\`** — one-shot bootstrap per quote mint, run once per cluster before any place-order variant. Allocates the per-(quote_mint) fee_vault token account owned by the \`[b"fee_vault_auth", quote_mint]\` PDA. Mirrors Chapter 6's \`CreateVault\`.

The chapter also extends \`PlaceOrderChecked\` to escrow the same protocol fee. The reason — design choice #2 in §13.5b — is symmetry: if only the builder path escrowed a fee, trades through a builder would cost the user more in real terms than identical trades without one. Production deployments resolve this by treating the protocol fee as universal across both variants from day one.

The chapter's intellectual content is three-part: the atomicity argument in §13.4 (why fee splits happen inside the trade instruction, not in a separate "claim per trade" call), the cap-stacking pattern in §13.2 (how a self-declared cap interacts with the protocol-level cap to bound fee leakage even if a builder is compromised), and the production-escrow design discussion in §13.5b (what makes builder fees structurally different from the two-party movements of Chapters 11 and 12 — and the four design choices behind our fee-vault implementation).

---

## §13.1  The \`BuilderProfile\` account

From \`crates/state/src/lib.rs\`:

\`\`\`rust
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct BuilderProfile {
    pub discriminator: [u8; 8],
    pub bump: u8,
    pub _pad0: [u8; 7],
    pub builder: [u8; 32],          // pubkey of the builder
    pub max_fee_share_bps: u64,     // self-cap, clamped at register-time
    pub accumulated_fees: u64,      // claim target
    pub total_volume: u64,          // stat: base size routed through this builder
    pub fee_mint: [u8; 32],         // set at registration; fees are earned and claimed only in it
}
\`\`\`

104 bytes. Four of the fields carry the design (\`fee_mint\` is covered under the constraints below):

**\`builder\`** is the pubkey of the frontend / aggregator. Used as the only seed in the PDA derivation: \`[BUILDER_PROFILE_SEED, builder.key]\`. This means every Solana pubkey has at most one builder profile, derivable by anyone who knows the pubkey. The profile is owned by openhl-core (so only this program can mutate \`accumulated_fees\`), but anyone can *read* the public-facing fields (\`builder\`, \`total_volume\`) to verify a builder's claimed routing volume.

**\`max_fee_share_bps\`** is the builder's self-declared cap on what fraction of the protocol fee they will take. A builder that registers with \`max_fee_share_bps = 2000\` is publicly committing to take at most 20% of the protocol fee on any order routed through them. This is a credibility signal — a builder advertising "20% to us, 80% to protocol" vs. one advertising "50/50" tells users something about how the frontend monetizes. Lower self-cap → more user-friendly fee split → potentially more flow.

**\`accumulated_fees\`** is the running total of fees credited to the builder, awaiting claim. Incremented by every \`PlaceOrderWithBuilder\` that routes through this profile. Reset to zero by \`ClaimBuilderFees\`. The builder accumulates inside the program account and withdraws in batches — much cheaper than claiming once per trade.

**\`total_volume\`** is observability — base size routed through the builder. Used by builders to prove their flow to potential partners (or by users to vet a builder's track record). Not used by the program for any logic.

Two design constraints worth noting:

- **One profile per builder.** The PDA derivation makes the (builder pubkey) → (profile pubkey) mapping bijective. A builder cannot have two profiles with different fee splits per market; if they want to A/B test fee splits they use two different builder wallets.
- **Fee accumulation in quote units.** \`accumulated_fees\` is denominated in whatever quote currency the protocol fee is taken in. With multiple quote currencies (USDC and USDT, say) the design would need per-(builder, mint) profiles, not just per-builder. We deliberately keep it single-quote here since the rest of the program is also single-quote — and the program enforces it: anyone can create a market with any quote mint, so the builder names its \`fee_mint\` in \`RegisterBuilder\` (account 3, the builder signs), a \`PlaceOrderWithBuilder\` on a market quoted in another mint is refused, and \`ClaimBuilderFees\` pays only from \`fee_mint\`'s fee vault. Fixing it at registration rather than at the first credit matters: \`PlaceOrderWithBuilder\` is signed by the trader, not the builder, so a first-credit pin would let anyone pin someone else's profile to a junk mint. Without that pin, fees earned on a market quoted in a worthless mint could be claimed, unit for unit, from the USDC fee vault (\`tests/builder_fee_mint.rs\`).

> **Exercise §13.1.** A frontend registers with \`max_fee_share_bps = 3000\`. Three trades route through them: notional 1000, 2500, 700. With \`PROTOCOL_FEE_BPS = 10\` (0.1%), what is the total \`accumulated_fees\` after all three trades?

---

## §13.2  Two caps, stacked

Builder codes need *two* fee-share caps, not one, because two parties have different incentives:

**Protocol cap (\`PROTOCOL_BUILDER_SHARE_CAP_BPS = 5000\`)** — the maximum fraction of any protocol fee that *any* builder may keep. Hard-coded into the program. With our value of 5000 bps, the protocol guarantees that at least 50% of every protocol fee stays with the protocol regardless of builder configuration.

**Builder self-cap (\`BuilderProfile.max_fee_share_bps\`)** — the maximum fraction this *particular* builder will keep. Self-declared at registration; user-visible.

The effective share on any trade is \`min(builder.max_fee_share_bps, PROTOCOL_BUILDER_SHARE_CAP_BPS)\`. From \`programs/openhl-core/src/lib.rs:4044–4049\`:

\`\`\`rust
share_bps = profile.max_fee_share_bps;
if share_bps > PROTOCOL_BUILDER_SHARE_CAP_BPS {
    // Defensive: registered profile shouldn't exceed cap, but the
    // cap could have been lowered since the builder registered.
    share_bps = PROTOCOL_BUILDER_SHARE_CAP_BPS;
}
\`\`\`

The protocol cap clamps at register-time (the user can't request more than the cap), but it also re-clamps at trade-time — because the cap could conceivably be lowered between registration and trade. (Our chapter ships a constant; a real program might make \`PROTOCOL_BUILDER_SHARE_CAP_BPS\` a governance-tunable value living on a config account, which is exactly where the defensive re-clamp matters.)

The two-cap structure is the core safety property. Three failure modes it handles:

1. **Malicious builder.** A builder who somehow declares \`max_fee_share_bps = 10000\` (100% of fee) at registration is clamped to \`PROTOCOL_BUILDER_SHARE_CAP_BPS\` immediately. The protocol always keeps its floor.
2. **User mistake.** A user who routes through an unfamiliar builder still knows the *maximum* possible fee leak before the trade — they can read both caps from on-chain state. No surprise fees.
3. **Compromised builder.** If a builder's wallet is compromised and the attacker tries to inflate their share, they can't go above the registered cap (immutable after register) without re-registering — which would create a new PDA at a different address, breaking the existing flow.

Production builder programs often add a *third* cap — a per-market or per-asset cap that lets the protocol charge different fee splits in different markets. Our chapter omits this for clarity; the pattern extends naturally.

> **Exercise §13.2.** A builder is registered with \`max_fee_share_bps = 8000\`. Run through the cap stacking: what's their effective share with our \`PROTOCOL_BUILDER_SHARE_CAP_BPS = 5000\`? What if a governance vote drops the protocol cap to 3000 *after* the builder registered — what happens on the next trade through their profile?

---

## §13.3  Walking \`PlaceOrderWithBuilder\`

\`process_place_order_with_builder\` in \`programs/openhl-core/src/lib.rs\`. The handler is a strict superset of \`PlaceOrderChecked\` — same eight prefix accounts (\`user\`, \`book\`, \`oracle\`, \`market\`, \`mint\`, \`user_token\`, \`fee_vault_token\`, \`token_program\`), one extra \`builder_profile\` account at the end, same fee math, same place logic, plus the builder credit step.

**Validation + sanity band**: identical to \`PlaceOrderChecked\`. Both handlers cross-check the (book, oracle, mint) chain against the passed market, run the oracle staleness gauntlet, and apply the price sanity band.

**Fee computation + builder credit**:

\`\`\`rust
let notional_val = (price as u128) * (size as u128);
let protocol_fee = (notional_val * (PROTOCOL_FEE_BPS as u128) / 10_000) as u64;

// ... read builder profile, compute share_bps clamped to caps ...
if profile.fee_mint != *mint_ai.key.as_ref() {
    return Err(ProgramError::InvalidAccountData); // profile earns fees in another mint
}

let builder_share = ((protocol_fee as u128) * (share_bps as u128) / 10_000) as u64;
profile.accumulated_fees = profile.accumulated_fees.checked_add(builder_share)?;
new_volume = profile.total_volume.checked_add(size)?;
profile.total_volume = new_volume;
\`\`\`

Three numbers fall out:

- \`notional_val = price × size\` — the trade's gross value in quote-unit-scaled form.
- \`protocol_fee = notional × 10 / 10_000\` — 0.1% of notional, in quote units.
- \`builder_share = protocol_fee × share_bps / 10_000\` — fraction of the protocol fee, in quote units.

\`builder_share\` is added to \`profile.accumulated_fees\` with \`checked_add\` (overflow refuses the trade rather than silently capping — the builder can claim periodically to keep the running total under u64::MAX). \`total_volume\` advances by the trade size for observability.

**Order placement**: identical to \`PlaceOrderChecked\` from §9.4. Linear-scan for an empty slot, write the order, increment counters.

**Fee escrow**: the handler ends with a CPI to SPL Token Transfer (\`spl_token_transfer_user_signed\`) moving the *full* \`protocol_fee\` from the user's quote-token account into the per-(quote_mint) fee vault. The \`(protocol_fee - builder_share)\` remainder stays in the fee vault as the protocol's take; \`ClaimBuilderFees\` later releases \`accumulated_fees\` from the same vault to each builder. Placed last so a Transfer failure (InsufficientFunds, frozen account) reverts both the order write and the builder credit atomically — same order-matters argument as Chapter 11's collateral escrow.

The CU cost of \`PlaceOrderWithBuilder\` is \`PlaceOrderChecked + ~600 CU\` for the builder profile borrow. The fee math and the fee-escrow Transfer are already in \`PlaceOrderChecked\`; the marginal cost over the no-builder path is just the builder credit.

> **Exercise §13.3.** What happens if \`PlaceOrderWithBuilder\` is called with \`price × size\` so large that \`notional × PROTOCOL_FEE_BPS\` overflows \`u128\`? Trace the failure path. Why is \`u128\` the right precision for this calculation rather than \`u64\`?

---

## §13.4  The atomicity argument

\`PlaceOrderWithBuilder\` does the fee split *inside the same instruction* as the order placement. There is no "after each trade, builder calls a separate \`RecordFee(trade_id, amount)\` instruction" pattern. The atomicity is load-bearing for three reasons:

**1. Settlement honesty.** If the fee split happened in a separate transaction, the user could pay the trade fee at slot N and the builder could fail to receive their share at slot N+1 (their account was closed, the cap changed, etc.). Atomicity means: either the trade commits with the split applied, or neither happens. No "I paid the fee but the builder didn't get credit" failure mode.

**2. CU efficiency.** A separate "record fee" instruction would cost another transaction's worth of fees, network round-trip, and CU overhead — for every single trade. With thousands of trades per day per builder, that adds up to material cost. Inline accumulation pays once per trade, claim pays once per N trades, total cost is amortized.

**3. Scheduling.** A separate fee-recording instruction would require the builder profile to be a writable account in *every* trade transaction even when split == 0. Sealevel would then serialize all trades on the same builder's profile (Chapter 5's antipattern). With the split inside the trade, *only trades routed through that builder* touch the profile — so two builders' flows can be processed in parallel even if both involve the same market.

The split between **accrual** (atomic with trade, inside \`PlaceOrderWithBuilder\`) and **claim** (batch, separate \`ClaimBuilderFees\` call) is also load-bearing. Claim is the expensive operation: it needs to move actual tokens (in production), which means an SPL Token CPI, which means signer setup and account validation. Doing that per-trade would be wasteful. By accumulating in the profile and letting builders claim periodically (hourly, daily, whatever), the per-trade cost stays minimal.

This accrue-batch-claim pattern is identical to ERC-20 dividend distributions in Ethereum-land — same problem, same solution, different runtime.

> **Exercise §13.4.** Sketch the alternative design where every trade emits a separate \`RecordFee\` instruction that the builder must process. Count the writes against the BuilderProfile account per second under load (say, 10 trades/sec routed through one builder). Compare to our design. Which one Sealevel-serializes more aggressively?

---

## §13.5  \`RegisterBuilder\`, \`ClaimBuilderFees\`, \`CreateFeeVault\`

\`RegisterBuilder\` is the standard PDA-creation pattern from Chapter 3, with one twist: the requested \`max_fee_share_bps\` is clamped at registration time:

\`\`\`rust
if max_share > PROTOCOL_BUILDER_SHARE_CAP_BPS {
    msg!(
        "register_builder: requested {} bps clamped to protocol cap {} bps",
        max_share,
        PROTOCOL_BUILDER_SHARE_CAP_BPS
    );
    max_share = PROTOCOL_BUILDER_SHARE_CAP_BPS;
}
\`\`\`

The clamp is silent — the registration succeeds, just with a reduced share. Logging the clamp lets builders verify their effective cap from program logs.

\`ClaimBuilderFees\` is two steps — zero the accumulator inside a borrow scope, then PDA-sign a Transfer out of the fee vault:

\`\`\`rust
if profile.builder != *builder_ai.key.as_ref() {
    return Err(ProgramError::IllegalOwner);
}
if profile.fee_mint != *mint_ai.key.as_ref() {
    return Err(ProgramError::InvalidAccountData); // fees were earned in another mint
}
let claimed = profile.accumulated_fees;
profile.accumulated_fees = 0;
// ... borrow scope ends ...

spl_token_transfer_fee_vault_signed(
    fee_vault_ai,
    builder_token_ai,
    fee_vault_auth_ai,
    mint_ai.key,
    fee_vault_auth_bump,
    token_ai,
    claimed,
)?;
\`\`\`

Authorization (only the builder can claim their own fees, and only from its \`fee_mint\`'s vault), zero the accumulator, release the borrow, PDA-sign the Transfer. The Transfer helper is structurally identical to \`spl_token_transfer_vault_signed\`, which makes Chapter 11's position payouts (close and liquidate) — same \`invoke_signed\` pattern, same \`InvalidSeeds\` protection — with the per-(quote_mint) \`[FEE_VAULT_AUTH_SEED, quote_mint]\` seeds instead of per-(market) \`[VAULT_AUTH_SEED, market]\`. Order matters: zero the accumulator *before* the Transfer so a transfer-failure tx revert restores the accumulator (atomic), and so a successful Transfer cannot be replayed against a still-funded accumulator.

A real production claim also typically supports partial withdrawals (\`claim --amount N\` rather than always-everything), accumulator timeouts (fees idle for >N days are forfeited to the protocol), and per-token claims when the protocol supports multiple quote currencies. None of these change the fundamental shape; they're policy decisions on top.

\`CreateFeeVault\` is the one-shot bootstrap. Mirrors \`process_create_vault\` from Chapter 6 verbatim, with two differences: the seeds are \`[b"fee_vault", quote_mint]\` / \`[b"fee_vault_auth", quote_mint]\` instead of \`[b"vault", market, mint]\` / \`[b"vault_auth", market]\`, and only one is needed per quote currency (not per market). The handler does the standard two-CPI dance — System \`create_account\` with PDA signing, then SPL Token \`InitializeAccount3\` setting the authority PDA as the owner — and is run once before any place-order variant.

> **Exercise §13.5.** Modify \`process_claim_builder_fees\` to accept a \`partial_amount: Option<u64>\` in the payload. If \`Some(n)\`, claim \`min(n, accumulated_fees)\`; if \`None\`, claim all. Why is the partial-withdraw pattern useful for builders even though the total they can withdraw is the same?

### §13.5b  Production-escrow design notes — the four choices behind the implementation

Chapters 11 and 12 added real SPL Token escrow to position collateral and vault deposits with a single matching helper apiece. This chapter's escrow needed four design choices instead, because builder fees are a *structurally different* escrow problem than the two-party token movements those chapters needed. The implementation in \`process_place_order_checked\`, \`process_place_order_with_builder\`, and \`process_claim_builder_fees\` is shaped by all four; understanding them is what makes the code read as a sequence of forced moves rather than arbitrary choices.

**1. Two parties vs three.** Position collateral and vault deposits are two-party movements: user ↔ vault, signed by one side, with the entire economic decision (how much, signed by whom) encoded in the instruction. Builder fees are a *three-party split*: the user pays a single protocol fee, of which one fraction goes to the protocol and another to the builder. Splitting one user payment across two recipients atomically — and crediting the right fraction to each — does not fit \`spl_token_transfer_user_signed\` and \`spl_token_transfer_vault_signed\` alone. The implementation introduces a *fee-vault* token account (one per quote mint) owned by a PDA at \`[b"fee_vault_auth", quote_mint]\`. Every place-order variant (a) Transfers the *full* \`protocol_fee\` from the user's token account into the fee vault, then (b) credits \`builder_share\` to the builder's accumulator (in the builder variant). The \`(protocol_fee - builder_share)\` remainder stays in the fee vault as the protocol's take.

**2. The \`PlaceOrderChecked\` asymmetry.** Adding fee escrow only to \`PlaceOrderWithBuilder\` would create a perverse incentive: the no-builder path would charge no token-denominated fee, so trades through a builder would cost the user more in real terms than identical trades without one. The chapter resolves this by making *all* place-order variants escrow the protocol fee — which is why \`process_place_order_checked\` grew the same \`(market, mint, user_token, fee_vault_token, token_program)\` prefix that \`PlaceOrderWithBuilder\` carries. Both variants now escrow the same fee; the builder variant additionally credits the builder share. Production deployments make this choice from day one rather than as a follow-up because the asymmetric design is a one-way migration trap — once users have signed transactions that assume an account shape, you can't quietly add slots later.

**3. Multi-quote support.** With one quote currency (our case) the fee vault is a single account per cluster, and the per-builder accumulator is a single u64. With multiple quote currencies the design needs per-(quote_mint) fee vaults *and* per-(builder, quote_mint) accumulators — meaning \`BuilderProfile\` either grows a map field (not Pod-friendly) or splits into many one-per-quote profile PDAs. §13.1 mentioned the single-quote constraint as deliberate; here is where it pays off architecturally. Note that the PDA seeds we picked (\`[b"fee_vault", quote_mint]\` rather than \`[b"fee_vault"]\`) already support per-mint vaults; only the per-(builder, quote_mint) accumulator side would need restructuring to go multi-quote.

**4. Claim-side authority.** With the fee vault in place, \`ClaimBuilderFees\` is a PDA-signed Transfer from \`fee_vault\` to \`builder_token\`, signed by the fee-vault authority PDA — structurally identical to §12.4's \`VaultWithdraw\`, same \`invoke_signed\` pattern, same \`InvalidSeeds\` protection, different seeds. This is the piece that was always going to be a "mechanical extension" of work the prior chapters already did; it lands as the new \`spl_token_transfer_fee_vault_signed\` helper next to its per-(market) cousin.

The mechanism the chapter teaches — accrual atomic with trade, claim as a separate batch operation, two-cap safety — survives all four design choices unchanged. Choices 1 and 2 dictate where Transfers land; choice 4 dictates how the claim signs; choice 3 is what we get for free by keeping the seeds mint-scoped.

> **Exercise §13.5b (design).** Compare the \`accounts: vec![...]\` declarations in \`scripts/builder/src/main.rs\` for \`--place-with-builder\`, \`--claim\`, and the original Chapter 12 \`--withdraw\` (in \`scripts/vault/src/main.rs\`). Identify three structural similarities and three structural differences. Trace each difference back to one of the four design choices above. Hint: the seed-derivation pattern is identical; the authority side is identical; the asymmetries are in account count, signer role, and PDA-derivation seeds.

---

## §13.6  Recap + verify yourself

### Recap diagram

\`\`\`
Builder lifecycle:

  0) Cluster bootstrap (once per quote mint)
     CreateFeeVault(quote_mint)
     ──► fee_vault token account at [b"fee_vault", quote_mint]
         owned by [b"fee_vault_auth", quote_mint] PDA


  1) Builder registers
     RegisterBuilder(max_fee_share_bps=2000)
     accounts: [payer/builder(S,W), builder_profile(W), system_program(R),
                mint(R)]
     ──► BuilderProfile{ builder, max_share=2000, fees=0, vol=0,
                         fee_mint=mint }


  2) User trades through builder
     PlaceOrderWithBuilder(side, price, size)
     accounts: [user(S,W), book(W), oracle(R), market(R), mint(R),
                user_token(W), fee_vault(W), token_program(R),
                builder_profile(W)]

       notional       = price × size
       protocol_fee   = notional × 10 / 10000    (PROTOCOL_FEE_BPS)
       share_bps      = min(profile.max, 5000)    (PROTOCOL cap)
       builder_share  = protocol_fee × share_bps / 10000

     atomic:
       order placed in book                       ─┐
       profile.accumulated_fees += builder_share   ├─ same tx, same slot
       profile.total_volume     += size            │
       SPL Token Transfer:                         │
         user_token → fee_vault   protocol_fee     ─┘


  3) Builder claims periodically
     ClaimBuilderFees(empty)
     accounts: [builder(S), profile(W), mint(R), fee_vault(W),
                fee_vault_auth(R), builder_token(W), token_program(R)]
     ──► profile.accumulated_fees = 0
     ──► invoke_signed SPL Token Transfer:
           fee_vault → builder_token  (claimed amount)
           signer seeds: [b"fee_vault_auth", quote_mint, &[bump]]


Two-cap safety:

  effective_share = min( builder.max_fee_share_bps
                       , PROTOCOL_BUILDER_SHARE_CAP_BPS
                       )

  ↑ builder commits to maximum self-cap (user-visible)
  ↑ protocol commits to maximum cap-of-caps (hard-coded / governance)

  Floor on protocol take = (10000 - 5000) × PROTOCOL_FEE_BPS / 10000
                         = 5 bps of notional, always retained
\`\`\`

### Three things to verify yourself

Prerequisites: bootstrap the fee vault for the quote mint (\`builder --create-fee-vault --mint <quote_mint>\`) and ensure your trader has a funded quote-token account before any place-order variant; otherwise the fee Transfer reverts.

1. **The cap stacks correctly.** Register a builder with \`--max-share-bps 9999 --mint <quote_mint>\`. The handler should log the clamp, and the dump should show \`max_fee_share_bps = 5000\` (our \`PROTOCOL_BUILDER_SHARE_CAP_BPS\`). Now route a trade through them — the builder's share should be exactly 50% of the protocol fee.
2. **Atomicity holds under failure.** Use a simulated failure: try \`PlaceOrderWithBuilder\` with a stale oracle (so the order placement will fail). The simulation should fail with \`oracle stale\` *and* the builder profile's \`accumulated_fees\` should be unchanged, the fee vault's balance should be unchanged, and the trader's quote-token account should be unchanged after the failed sim (the entire transaction reverts). The split doesn't happen unless the trade does.
3. **Volume accrues per trade.** Place 5 orders through the same builder with sizes 10, 20, 30, 40, 50. The \`total_volume\` should be exactly 150 (10+20+30+40+50). If \`accumulated_fees\` doesn't add up to \`(notional_total × PROTOCOL_FEE_BPS × share_bps / 10000 / 10000)\`, there's an off-by-one in the math — chase it down. Then run \`--claim --mint <fee_mint> --builder-token-account <pubkey>\` (the dump prints \`fee_mint\`); the builder's quote-token account balance should grow by exactly \`accumulated_fees\`, and the dump should show \`accumulated_fees = 0\`.


### Now let a tool check the money, not just the accounts

Chapters 3, 6 and 12 end with [solinv](https://github.com/psyto/solinv) swapping accounts. The question here is different: does the fee vault always hold what builders are owed? Chapter 6 §6.6 left it open, because the fee vault is the one account every market shares, and a pair can have a second market that is not at its PDA.

[\`fuzz/fees/\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/fees) is the harness. Builders B and B2 register in the quote mint Q; user U trades through either. There are three markets, each with its book and a fresh oracle: \`(base, Q)\` at its PDA, a second \`(base, Q)\` market made by \`Initialize\` (Chapter 2) at an address that is not the PDA, and \`(base, J)\` for a mint J that anyone can make. Besides the usual signer-skip and account-swap, the specs declare two rules:

- a **relation** (solinv's \`Relation\`, checked by \`unchecked_math\`): the sum of \`accumulated_fees\` over B's and B2's profiles is at most the Q fee vault's balance, on both \`PlaceOrderWithBuilder\` and \`ClaimBuilderFees\`. (B2's profile is appended to each instruction's accounts so the relation can read it; the handlers ignore the extra account.) It is reported only if it held before the instruction and fails after it.
- a **guard** (checked by \`precondition_skip\`): \`PlaceOrderWithBuilder\` may succeed only if \`profile.fee_mint == market.quote_mint\`. solinv compares fields of at most 16 bytes, so the 32-byte mints take two guards.

Set up as in Chapter 3 §3.7, then:

\`\`\`bash
cargo build-sbf --manifest-path programs/openhl-core/Cargo.toml
cd fuzz/fees
cargo build --release --features invariant_ch13
cargo test --release --features invariant_ch13
timeout -s INT 60 crucible run openhl_fees_fuzz invariant_ch13 \\
    --binary-in target/release/invariant_test --timeout 45
\`\`\`

On the program as it is, no \`[FUZZ_FINDING]\` line appears, on any of the three markets. That answers §6.6's question for this chapter. Every credit to \`accumulated_fees\` is at most half of a \`protocol_fee\` that the same transaction moves into the fee vault, in the same mint, so a second market (or any market) cannot owe a builder more than its users paid. The test \`credit_never_exceeds_payment\` checks it on both Q markets.

> **Exercise §13.6.** Delete each check below in turn, or make the change in the last two rows, rebuild, and run. Predict first. Here is what we measured, 45 seconds each; for the "no" rows, the last column is what refused the swapped call instead, read from its logs (the \`probe\` test prints them):
>
> | Change | Caught? | How, or what refused it instead |
> |---|---|---|
> | Place: \`profile.fee_mint == mint\` | **yes** | precondition-skip: the guard was false on J's market and the order went through; \`junk_mint_order_does_not_credit_a_q_builder\` fails |
> | Place: \`market.quote_mint == mint\` | no | the \`fee_mint\` check: paying in J on the Q market still names B, who is paid in Q |
> | Place: \`verify_fee_vault_token_account\` | no | SPL Token: \`Account not associated with this Mint\` |
> | Place: \`user_ai.is_signer\` | no | the runtime: unauthorized signer |
> | Place: the book PDA | **yes** | account-swap: the order went into another market's book |
> | Place: the oracle PDA | **yes** | account-swap: the price band came from another market's oracle |
> | Claim: \`profile.builder == builder\` | **yes** | account-swap: B claimed B2's fees |
> | Claim: \`builder_ai.is_signer\` | **yes** | signer-skip: anyone could claim B's fees, into an account they name |
> | Claim: \`profile.fee_mint == mint\` | **yes**, with a set | account-swap \`check_sets\`: B's Q fees paid out of J's vault into B's J account (four slots together) |
> | Claim: \`verify_fee_vault_token_account\` | no | SPL Token: \`owner does not match\` (the Q vault authority cannot sign for J's vault) |
> | Claim: no \`accumulated_fees = 0\` | **yes** | the relation, on the first claim: owed 12,262 against 12,266 in the vault before, 12,262 against 6 after; \`claim_pays_once\` fails |
> | Place: builder share of \`notional\`, not of \`protocol_fee\` | **yes** | the relation: 0 owed against 0 before the first order, 5,000 owed against 10 after |
>
> Three things are worth a second look. The last two rows are not missing checks at all: every account is right and every check passes, and the program still promises more than it holds. Only a rule about the numbers can see that, and it is the rule the chapter's atomicity argument (§13.4) is about. One more trap, this one in our harness: the first version had B2 earn its fees in \`setup()\`. With the share computed from \`notional\`, that setup order already broke the relation, and solinv reports a relation that is false before the instruction as a declaration problem, not a finding, so the row read "no". Now only the fuzzer's own orders credit builders. And the claim-side \`fee_mint\` row needed four accounts swapped together. Our first set swapped three and left B's Q account as the destination, so SPL Token refused it for a mint mismatch, which said nothing about the check we had deleted. An attacker names a destination in J. As in Chapter 12, a refusal is evidence only once you know which check gave it.
>
> One swap is left out on purpose. Point \`PlaceOrderWithBuilder\`'s slot 8 at another builder's profile and it goes through: U credits B2 instead of B. That is the design. The user chooses which frontend to credit, and pays the fee either way.

---

## Hook into Chapter 14

You now have a perp DEX program that handles every primitive a production deployment needs: accounts, programs, PDAs, CPI, compute, parallelism, vaults, an order book, a matcher, an oracle reader, funding, positions, liquidations, pooled trading vaults, and builder codes. What you do *not* have is the off-chain plumbing that keeps it running.

Chapter 14 — Cranks, Keepers, and Off-Chain Glue — closes Phase B and the track. We will walk through every keeper this program implicitly requires: the funding-rate keeper (Chapter 10's hook), the liquidator bots (Chapter 11's permissionless \`Liquidate\`), the vault NAV reporter (Chapter 12's \`UpdateNAV\` cadence), the builder claim cron (Chapter 13's accumulator), the oracle publisher (Chapter 9's \`SetOraclePrice\` if we ran it ourselves rather than using Pyth), the matching-engine cranker (if we'd built async matching), and the off-chain indexer that feeds frontends. The chapter has zero new on-chain code — its content is design patterns for off-chain processes, fee economics, redundancy and failover, and the architectural reality that "Solana DEX" is half on-chain program and half coordinated off-chain infrastructure.
`,
                },
                {
                  title: "Chapter 14 — Cranks, Keepers, and Off-Chain Glue",
                  slug: "solana-internals-ch14-cranks-keepers-en",
                  type: 'CONTENT',
                  sortOrder: 8,
                  duration: 45,
                  xpReward: 100,
                  content: `# Chapter 14 — Cranks, Keepers, and Off-Chain Glue

> Status: draft (v0.1).
> Companion code: none. This chapter has zero on-chain additions; its content is the off-chain operational design that surrounds the program we've spent thirteen chapters building.

---

## §14.0  Framing

A Solana DEX program is half of a Solana DEX. The other half is a coordinated set of off-chain processes — keepers, cranks, indexers, monitoring — that drive the on-chain primitives at the right cadence and surface the resulting state to users. Without them, your beautifully audited on-chain program runs once when a user triggers a transaction and then sits idle. Funding doesn't accrue. Underwater positions don't get liquidated. NAVs go stale. Frontends show last-known state from minutes ago.

This chapter walks the operational layer. Every keeper and crank this program implicitly requires, in detail enough that you can implement each one. The chapter is intentionally short on on-chain code (we add none) and long on production design patterns — failure modes, redundancy, fee economics, cadence selection — that you only learn by running these systems in anger.

Six keepers, one indexer:

1. **Funding-rate keeper** — calls \`UpdateFunding\` on each market periodically; computes the rate from book mid + oracle mark.
2. **Liquidator bot** — scans positions, identifies underwater ones, submits permissionless \`Liquidate\` calls.
3. **Vault NAV reporter** — for each vault, the manager (or their delegate) periodically calls \`UpdateNAV\`.
4. **Builder claim cron** — each builder periodically drains their \`accumulated_fees\` via \`ClaimBuilderFees\`.
5. **Oracle publisher** — if we ran our own oracle rather than using Pyth, this is the process pushing fresh prices via \`SetOraclePrice\`.
6. **Maintenance keeper** — odds and ends: closing dormant accounts, archiving filled orders, garbage collecting empty book slots.
7. **Indexer** — not a keeper but an essential read-side service: subscribes to chain state and feeds frontends, analytics, alerting.

The chapter closes Phase B's main arc. §14.7's retrospective summarizes what the fourteen chapters built. Chapter 15 follows as a separate appendix-style chapter that ships the slab order book §8.4 designed — the Phase B program is feature-complete with or without it, but the slab is the production-grade order book and lives next to the flat-array Chapter 7 book for direct comparison. Where you go after is your own choice — production deployment, audit prep, scaling experiments, your own perp DEX. The pieces are in your hands.

---

## §14.1  The keeper inventory

| Keeper | Trigger | Cadence | Authority | What fails without it |
|---|---|---|---|---|
| Funding-rate keeper | Per market | 1–5 min | Permissioned or permissionless with clamp | Funding stops accruing; longs and shorts no longer pay each other; mark drifts from spot |
| Liquidator bot | Per position | Per slot (sub-second scanning) | Permissionless | Underwater positions stay open; insurance fund eventually depleted |
| Vault NAV reporter | Per vault | 1 min – 1 hour | Vault manager only | Vault NAV becomes stale; deposits/withdrawals price against wrong NAV |
| Builder claim cron | Per builder | 1 hour – 1 day | Builder only | \`accumulated_fees\` grows; no functional impact unless it overflows u64 (extremely unlikely) |
| Oracle publisher | Per oracle | Per slot | Permissioned publisher list | Oracle ages past staleness window; \`PlaceOrderChecked\` / \`OpenPosition\` / \`Liquidate\` all start refusing |
| Maintenance keeper | Per program | Daily or weekly | Program admin or permissionless | Dormant data accumulates; cheap to skip but eventually pays rent on garbage |
| Indexer | Per program | Real-time | None (read-only) | Frontends show stale state; analytics break; users blind |

Two patterns visible from the table:

**Permissioned vs permissionless.** Liquidators and oracle publishers (sometimes) are permissionless — anyone can call them, and the protocol is robust against any single keeper going down. Vault NAV reporters and builder claim crons are by-definition permissioned — only the specific entity can act on their own state. Funding keepers fall in between depending on the program's clamp strictness.

**Cadence vs latency tolerance.** Liquidators must scan sub-second because the liquidation race rewards speed; an oracle stale by 25 slots (10 sec) is acceptable. Vault NAV can be a minute or an hour depending on the strategy's volatility. Builder claims can wait days. Picking the wrong cadence is one of the most common operational mistakes — too aggressive wastes fees, too lazy bleeds value.

---

## §14.2  The funding-rate keeper

Chapter 10's §10.5 sketched the funding keeper in pseudo-Python. The real version is more complex along three dimensions: how the rate is computed, how the keeper handles its own downtime, and how multiple keepers coordinate.

**Rate computation.** A naive keeper just samples the book mid and the oracle mark:

\`\`\`python
def compute_rate(market):
    mark = read_oracle_mark(market)         # ch.9
    bid, ask = read_top_of_book(market)     # ch.7
    mid = (bid + ask) / 2
    premium = (mid - mark) / mark
    return clamp(premium * K, -MAX_RATE, +MAX_RATE)
\`\`\`

This is correct in form but fragile in practice. Two improvements:

1. **TWAP the book mid** over the last few minutes, not the instantaneous spread. A keeper that submits funding based on a single transient quote-stuffing wide spread can produce nonsense rates that move users' equity meaningfully. Production keepers sample every few seconds and TWAP over 1–5 minutes.

2. **Cap the per-update change.** If the previous rate was 0.0001/sec and the current premium implies 0.001/sec, don't jump in one update — clamp the rate change to (say) 50% per update. This is rate-limiting in the control-systems sense; protects against single-keeper-call disasters from runaway feedback loops.

A real keeper structure:

\`\`\`python
class FundingKeeper:
    def __init__(self, market, program, signer):
        self.market = market
        self.program = program
        self.signer = signer
        self.history = collections.deque(maxlen=300)  # 5 min at 1Hz

    def tick(self):
        # 1. sample
        mark = read_oracle_mark(self.market)
        if mark is None:                # oracle stale; skip this tick
            return
        bid, ask = read_top_of_book(self.market)
        if bid is None or ask is None:  # empty book; skip
            return
        self.history.append((time.time(), mark, bid, ask))

        # 2. compute (TWAP over history)
        if len(self.history) < 60:      # need 1 min minimum
            return
        avg_mid = mean((b+a)/2 for _, _, b, a in self.history)
        avg_mark = mean(m for _, m, _, _ in self.history)
        premium = (avg_mid - avg_mark) / avg_mark
        target_rate = clamp(premium * K, -MAX, +MAX)

        # 3. clamp per-update delta
        last_rate = read_current_funding_rate(self.market)
        delta_cap = abs(last_rate) * 0.5 + MIN_DELTA
        new_rate = clamp(target_rate, last_rate - delta_cap, last_rate + delta_cap)

        # 4. submit
        send_tx(UpdateFunding(new_rate), self.market, self.signer)

    def run(self):
        while True:
            self.tick()
            time.sleep(1)
\`\`\`

**Keeper downtime.** What happens when the keeper crashes? If \`MAX_ORACLE_STALENESS_SLOTS\` is 25 slots (~10 sec) for the oracle, but the funding keeper is down for an hour, the funding rate set 60 minutes ago continues to apply for 60 minutes. Longs/shorts pay funding at a rate set under conditions that no longer exist.

Two defenses:

- **Heartbeat the keeper.** Operations monitoring (Grafana, PagerDuty) alerts within minutes if the keeper hasn't submitted in N minutes.
- **Bound max elapsed in the on-chain handler.** Add a check that refuses \`UpdateFunding\` if \`clock.unix_timestamp - last_update_ts > MAX_FUNDING_ELAPSED_SECONDS\`; in such cases, the keeper or a multisig has to call a "reset" instruction first. This is the "fail loud rather than fail silent" pattern — better to break the market briefly than to apply year-old funding once the keeper recovers.

**Multiple keepers.** Funding rate updates are idempotent in the sense that the *last* call's rate is what applies, but not in the sense that multiple calls in the same minute are fine — each adds CU cost and may produce different rates. Coordination patterns:

- **Single keeper, single source of truth.** Simplest. One process, one VPS, one alert.
- **Hot-standby.** Two keepers, one active. The standby promotes itself if it detects the primary hasn't submitted in N minutes. Coordination via a lock account or off-chain leader election.
- **Permissionless with clamps.** Anyone can call \`UpdateFunding\`; the program's clamps prevent griefing. Multiple keepers race, the first one wins, the second tx fails harmlessly (their rate read was already stale by the time they submitted). Used by some perp DEXes.

Our chapter ships permission as fully open (per §10.3 — open-auth \`process_update_funding\` was deliberate for testability). Production decides which of the three patterns above based on operator preference.

---

## §14.3  The liquidator bot

Chapter 11's \`Liquidate\` is permissionless: anyone can submit a liquidation tx against any underwater position. The economics rewards speed — first liquidator to a victim wins the penalty, so liquidator bots compete intensively on scanning latency and tx submission speed.

The liquidator's loop is structurally simple but operationally demanding:

\`\`\`python
def liquidator_loop():
    while True:
        positions = scan_all_positions()
        for pos in positions:
            mark = current_mark(pos.market)
            funding = current_funding_index(pos.market)
            equity = compute_equity(pos, mark, funding)
            notional = abs(pos.size) * mark
            maint = notional * MAINT_MARGIN_BPS / 10_000
            if equity < maint:
                send_tx(Liquidate(pos.pubkey), signer)
\`\`\`

Three operational problems hidden in this innocent loop:

**Scanning latency.** \`scan_all_positions()\` over thousands of position accounts is not cheap. RPC-based \`getProgramAccounts(programId, filter: discriminator)\` is slow (hundreds of ms to seconds) and not real-time. Production liquidators use Geyser plugins or RPC pubsub to receive position-account updates in real time, maintaining an in-memory mirror of every position and recomputing health on each oracle/funding tick.

**Race conditions.** Multiple bots see the same liquidatable position. The first one to land their tx wins; the rest pay fees for failed txes (the on-chain \`Liquidate\` rejects on already-closed positions). Bots compete by:

- **Pre-built txes.** Build the \`Liquidate\` tx the moment a position drops below threshold; only fetch a fresh blockhash and sign at submission time. Saves milliseconds.
- **Submitting through Jito or directly to leader RPCs.** Public RPC has measurable lag; specialized infra cuts it.
- **Priority fees.** Pay extra to land first in a contested slot. The liquidator who pays the highest priority fee that still leaves them profitable wins.

**Profitability.** A liquidation pays \`notional × LIQUIDATION_PENALTY_BPS / 10000 = notional × 0.01\` (Chapter 11's value). A liquidator needs revenue > (tx cost + RPC cost + infra cost + opportunity cost of the capital tied up running the bot). At $0.001 per Solana tx, a successful liquidation of a $1000 notional position pays $10 — comfortably profitable. A $10 notional position pays $0.10, which is below most operational thresholds — small underwater positions get less competition, may sit underwater longer, and (if collateral has already gone to zero) are net-negative to liquidate. Production designs sometimes add a per-position minimum size to avoid this.

A modern Solana liquidator architecture:

\`\`\`
   Validator Geyser plugin / RPC pubsub
              │
              ▼
   Local position mirror (in-memory)
              │
              ▼
   Health computer (triggered on oracle/funding updates)
              │
              ▼
   Liquidation candidate queue (sorted by expected revenue)
              │
              ▼
   Tx builder + submitter (Jito MEV searcher or direct leader RPC)
\`\`\`

Multiple competing liquidators run essentially identical stacks. Differentiation is in latency, priority-fee tuning, and the small algorithmic edges (e.g., predicting which positions will become liquidatable next oracle tick, pre-building their txes).

---

## §14.4  The vault NAV reporter

Chapter 12's \`UpdateNAV\` is manager-only and trusted. The keeper is therefore a process the manager runs, with two things to get right: cadence and accuracy.

**Cadence.** Too frequent and depositors see NAV bouncing on noise (the manager hasn't actually changed positions, but the keeper updates anyway because the underlying oracle moved). Too lazy and deposits/withdrawals price against multi-minute-stale NAVs, giving the late mover a free option on price movement.

Typical patterns:

- **High-frequency vaults (HFT, market making):** every minute. The cadence approximates real-time enough that the deposit/withdraw timing arbitrage is negligible.
- **Mid-frequency vaults (trend following, momentum):** every 5–15 minutes. Enough for the manager's positions to actually change.
- **Slow vaults (yield aggregators, basis trades):** every hour or per epoch boundary.

A subtle design choice: should the keeper update NAV *only when it changes meaningfully*, or always? "Always" gives depositors predictable cadence and visible "yes, the manager is still reporting." "Only when meaningful" saves tx fees. Most production vaults pick a hybrid: always update at least once per N hours (heartbeat), update sooner if the change exceeds some threshold.

**Accuracy.** The manager computes the NAV off-chain — sum of vault's open position equities (using \`compute_equity\` from Chapter 11), plus cash collateral, minus any pending fees. This computation must match what the on-chain handler would compute if given the same inputs, or depositors see drift between the reported NAV and what they'd actually receive.

Three risk areas:

- **Funding accrual drift.** If \`UpdateFunding\` hasn't been called since the last NAV report, the position's funding PnL is computed against a stale index. Production keepers call \`UpdateFunding\` for the relevant markets *before* calling \`UpdateNAV\` to ensure the NAV reflects accrued funding accurately.
- **Oracle staleness drift.** If the oracle hasn't been updated, the mark used in \`compute_equity\` is stale. Same fix: refresh the oracle before NAV update.
- **Unrealized vs realized.** A vault holding open positions has unrealized PnL that depends on mark price. A vault that mostly closed positions has realized PnL sitting in cash. The keeper should compute both correctly and not double-count partial closes.

This is the part where, in production, the manager often *outsources* the keeper to a service (Squads multi-sig + automated NAV scripts, or a vault-management platform like Lulo or Kamino's vault SDK). Doing it yourself requires owning the operational reliability problem — keeper outages = stale NAV = unhappy depositors.

---

## §14.5  Builder claim cron

The simplest keeper. A builder's \`accumulated_fees\` grows monotonically until they call \`ClaimBuilderFees\`. The keeper is a cron job:

\`\`\`python
def claim_loop():
    while True:
        profile = read_builder_profile(my_pubkey)
        if profile.accumulated_fees >= CLAIM_THRESHOLD:
            send_tx(ClaimBuilderFees(), my_pubkey)
        time.sleep(CLAIM_CHECK_INTERVAL)
\`\`\`

Two parameters and one boilerplate.

**\`CLAIM_THRESHOLD\`.** Don't claim every single fee, even though each is small. A claim tx costs ~$0.001 in Solana fees; if your accumulated fee is $0.005, you've blown 20% of it on a claim. Set the threshold high enough that claim cost is < a few % of claimed amount — typically several dollars' worth of accumulated fee.

**\`CLAIM_CHECK_INTERVAL\`.** Hourly is generous. There's no urgency in claiming — your fees can't be stolen, can't be inflated away (no inflation; all u64 quote units), only sit there. Some builders claim daily, others weekly, others monthly.

**Boilerplate.** Set up monitoring so a stuck claim job (e.g., wallet ran out of SOL for tx fees) doesn't silently let fees accumulate forever. Trivial in operational terms but easy to forget.

This is the lowest-stakes keeper in the system. We mention it primarily for completeness — but it's also a good first keeper to write if you're new to operating Solana infrastructure, because the failure mode (a few unclaimed dollars) is gentle.

---

## §14.6  Off-chain indexer

Not strictly a keeper, but essential. An indexer subscribes to chain state, processes it, and exposes the result to frontends, analytics tools, and alerting.

Three architectural choices.

**(1) Geyser plugin.** Geyser is Solana's validator-side streaming interface. A Geyser plugin runs inside a validator and gets every account change, transaction, and slot event in real time, sub-millisecond latency from chain commit. Pros: lowest latency, complete data. Cons: requires running your own validator (or partnering with a node operator who runs the plugin for you), operational complexity, hardware costs.

Production indexers for large DEXes almost always use Geyser. Helius, Triton, and other Solana-RPC providers offer Geyser-as-a-service to avoid the validator-running burden.

**(2) RPC pubsub.** Subscribe to account changes via the WebSocket-based RPC pubsub interface (\`accountSubscribe\`, \`programSubscribe\`, \`logsSubscribe\`). Pros: simple to set up, no infrastructure beyond a WebSocket client. Cons: latency is higher (~hundreds of ms), connections drop, some events can be missed during reconnect.

Fine for mid-stakes use cases: a frontend that updates user-facing state every few seconds, an analytics service computing daily volumes. Insufficient for high-frequency uses (liquidator bots, market-making bots).

**(3) RPC polling.** \`getProgramAccounts\` + \`getTransaction\` in a loop. The fallback when pubsub isn't an option (development, debugging, simple bots). Pros: maximally simple. Cons: high latency, expensive in RPC calls, scales badly with many accounts.

A typical production architecture for this program:

\`\`\`
   Geyser stream (account changes + tx logs)
        │
        ▼
   Event dispatcher (route by program ID, account discriminator)
        │
        ├─► Position mirror (for liquidator bots)
        │
        ├─► Vault NAV cache (for frontend)
        │
        ├─► Trade history DB (for analytics)
        │
        ├─► Alert engine (oracle staleness, vault NAV staleness,
        │                 builder fee accumulation, ...)
        │
        └─► WebSocket fan-out (for frontends subscribing to user events)
\`\`\`

The indexer is the load-bearing piece of the off-chain stack — every keeper above implicitly depends on having fast, correct state queries against the chain, and the indexer is what provides them.

What to compute off-chain rather than on-chain (Chapter 5's lesson, restated for the indexer specifically):

- **Total volume traded per market.** Off-chain. Cheap to compute from tx logs.
- **Total open interest.** Off-chain. Sum of all Position accounts' notionals.
- **Per-market activity, top-of-book history, fill price tape.** Off-chain.
- **NAV per share, historical PnL of a vault.** Off-chain. Computed from \`UpdateNAV\` log events.
- **Builder volume rankings.** Off-chain. From BuilderProfile reads.

The on-chain program holds *only* what it needs to enforce its own invariants. Everything that's nice to have but not part of the trust boundary lives in the indexer.

---

## §14.7  Closing — what we built, and what to do with it

Across fourteen chapters, we built:

**Phase A (foundations, ch.1–5):** Account model, native programs, PDAs, compute budget, Sealevel parallelism. A complete "Solana from scratch, no Anchor" curriculum that stands on its own — a learner who finishes Phase A can write a real Solana program and debug a real Solana program, without ever touching a framework.

**Phase B (HL primitives, ch.6–14, plus the ch.15 appendix):** SPL Token vaults via CPI, on-chain order books (flat-array in ch.7 + slab in ch.15), matching engines, oracle integration, funding rate accumulators, position lifecycle with liquidation, pooled trading vaults, builder codes, insurance fund, and the off-chain infrastructure that runs the result. A working — if scope-deferred — perp DEX, with every design choice annotated and every honesty note about what's deferred written into the chapter.

Things explicitly deferred (so they're easy to find later):

- **A self-hosted Wormhole-style oracle receiver.** Ch.9 §9.5 ships consumer readers for both Pyth v1 (\`PlaceOrderCheckedPyth\`) and Pyth v2 (\`PlaceOrderCheckedPythV2\`, which reads \`PriceUpdateV2\` accounts that Pyth's receiver program produces). What's still genuinely open is *being* a receiver — verifying Wormhole VAA signatures against a stored guardian set, doing Merkle proof verification on bundled updates, writing your own price-cache PDAs. You only need this if you're consuming updates from a chain where Pyth's receiver isn't deployed, or you want to verify additional message types. Its own chapter.

Things you'd add for a real production deployment:

- An audit. Three months of security review minimum.
- A multisig admin authority on all the constants this chapter referenced (margin BPS, fee BPS, caps).
- Per-market configuration on the constants currently global to the program.
- A governance program if the project is meant to be community-controlled rather than admin-controlled.
- The full keeper stack from this chapter, with monitoring, alerting, runbooks.
- A frontend and an indexer.
- Legal review (which jurisdictions can operate, can list, can be users).

Things to do with the curriculum:

- **Use it.** The companion code is MIT-licensed. Fork it, deploy it, extend it. Drop the educational variants (Bench, Stats) and ship the actual primitives.
- **Teach it.** The chapters were designed for a SolDojo internals track. Run a workshop, build a course, write follow-ups. The pedagogical framework (validated chapter format, deliberate scope-deferral with explicit honesty notes, two-language coverage) generalizes to other Solana subjects.
- **Critique it.** Every chapter has design choices that another designer would make differently. Build your own version, then write up your divergences as a counter-curriculum.

The pieces are in your hands.

---

## What's not here (intentionally)

This is a closing chapter, not a roadmap. We didn't write:

- A "what to read next" reading list. The Phase A and Phase B chapters cite Solana docs, Pyth docs, and source code where relevant; that's the canonical further reading.
- A pitch for any particular Solana ecosystem direction. Where the chain goes from here is for the people building on it to decide; this track teaches the substrate, not the strategy.
- A "thank you" or "see you next time." Curriculum endings are for readers, not writers. If you got something out of these fourteen chapters, the next valuable thing you do is ship something with it. Go.
`,
                },
                {
                  title: "Chapter 15 — Slab Order Book",
                  slug: "solana-internals-ch15-slab-en",
                  type: 'CONTENT',
                  sortOrder: 9,
                  duration: 45,
                  xpReward: 100,
                  content: `# Chapter 15 — Slab Order Book

> Status: draft (v0.1).
> Companion code: [\`crates/state/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/state/src/lib.rs) (\`Slab\`, \`OrderNode\`, \`CritbitTree\`, \`TreeNode\`), [\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs) (slab helpers + \`process_create_slab\`, \`process_slab_place_order\`, \`process_slab_match\`), [\`scripts/slab/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/slab/src/main.rs), [\`fuzz/slab/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/slab/src/main.rs) (the solinv harness for §15.6–15.7).
>
> Since the parts split, the logic this chapter walks through lives in [\`crates/slab/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/slab/src/lib.rs) (\`openhl-slab\`); the program calls it. The code quoted below is the pre-split version from \`programs/openhl-core/src/lib.rs\`, and its line numbers are not kept in sync.

---

## §15.0  Framing — what the slab buys, and why it deserved its own chapter

Chapter 7 shipped a flat-array \`OrderBook\` — 32 slots, linear-scan for an empty slot on insert, linear-scan for a price-match in \`Match\`. Chapter 8 measured the cost: a \`K = 10\` fill loop against a \`N = 32\` book runs ~\`O(K × N)\` and spends about 22 KCU (re-measured; §8.2) just on book bookkeeping before any settlement runs. That works *as a teaching baseline*. It does not work as a production book — the scan dominates for any realistic depth.

The Hyperliquid and Serum / Phoenix answer is a **slab**: a tree over price levels (ours is a critbit, which is not self-balancing: its depth follows the bits of the prices, about log₂ N when they are spread out and up to 64 when a maker picks them adversarially; §15.7), with each leaf holding a FIFO of orders at that price. Insert is O(log N) by price level. Best-price is O(log N) — walk root toward the side you want. Pop-the-best is O(log N) in the worst case (a level empties and the leaf has to be removed; an inner node above it goes redundant and collapses with it). The §8.4 pseudocode promised this chapter; here it is.

The chapter ships three new instructions, parallel to Chapter 7's \`CreateOrderBook\` / \`PlaceOrder\` / \`Match\`:

1. **\`CreateSlab\`** (tag 29) — initializes a \`Slab\` account the client created in the same transaction, and the OrderNode pool's free list plus both critbit trees' free lists.
2. **\`SlabPlaceOrder\`** (tag 30) — same payload as \`PlaceOrder\`. Runs the critbit insert, allocates an OrderNode from the pool, threads it onto the price level's FIFO.
3. **\`SlabMatch\`** (tag 31) — same payload as \`Match\` (taker side + limit price + size + max_fills cap). Walks the best leaf on the maker side, fills against its FIFO head, removes drained levels, applies the §8.3 pagination cap.

The flat-array \`OrderBook\` and the slab \`Slab\` coexist in the program. Different markets can choose different books; existing markets aren't disturbed. The chapter is about the *new* path.

Three things this chapter is *not* about:

- **It is not a Match-engine surgery chapter.** The slab's \`SlabMatch\` runs the same fill-loop shape as Chapter 8 — the change is in how the maker side is reached (O(log N) instead of O(N)), not in how a fill is accounted. Settlement, fees, builder splits — none of that lives here.
- **It is not a guide to every critbit variant.** Serum's slab packs leaves and inners into the same node pool with discriminator bits; Phoenix uses a slightly different layout with a separate per-level FIFO accounting struct. Ours follows §8.4's split — one OrderNode pool, one TreeNode pool per side — because the split makes the pedagogical argument cleanest. Other layouts trade a few hundred bytes of header for slightly faster access.
- **It is not a full benchmark.** §15.6 gives measured numbers for both books at the sizes this program allows; a study at production depth and with settlement CPIs is a follow-up.

---

## §15.1  The four account types

From \`crates/state/src/lib.rs\`:

\`\`\`rust
pub struct OrderNode {                          // 64 bytes
    pub order_id: u64,
    pub owner: [u8; 32],
    pub size: u64,
    pub next: u16,        // next in FIFO (or in free list)
    pub prev: u16,
    pub _pad: [u8; 12],
}

pub struct TreeNode {                           // 32 bytes — tagged union
    pub tag: u8,          // 0 FREE, 1 INNER, 2 LEAF
    pub split_bit: u8,    // INNER only
    pub next_free: u16,   // FREE only
    pub left_child: u16,  // INNER only
    pub right_child: u16, // INNER only
    pub head_node: u16,   // LEAF only (FIFO head order_node idx)
    pub tail_node: u16,   // LEAF only
    pub order_count: u32, // LEAF only (observability)
    pub price: u64,       // LEAF only
    pub _pad: [u8; 8],
}

pub struct CritbitTree {                        // 8 + 256 × 32 = 8208 bytes
    pub root: u16,                              // SLAB_NONE_INDEX if empty
    pub free_head: u16,
    pub _pad: [u8; 4],
    pub nodes: [TreeNode; SLAB_TREE_CAPACITY],  // SLAB_TREE_CAPACITY = 256
}

pub struct Slab {                               // ~82 KiB total
    pub discriminator: [u8; 8],                 // SLAB\\0\\0\\0\\0
    pub bump: u8,
    pub _pad0: [u8; 7],
    pub market: [u8; 32],
    pub next_order_id: u64,
    pub active_count: u32,
    pub pool_free_head: u16,
    pub _pad1: [u8; 2],
    pub bid_tree: CritbitTree,
    pub ask_tree: CritbitTree,
    pub nodes: [OrderNode; SLAB_POOL_CAPACITY], // SLAB_POOL_CAPACITY = 1024
}
\`\`\`

Five design choices to absorb:

**1. \`u16\` everywhere, never \`Option<u16>\`.** Pod safety. The sentinel \`SLAB_NONE_INDEX = u16::MAX\` stands in for "no index." Free-list terminators, empty-tree roots, and dangling FIFO endpoints all use it. With \`u16\` we can address up to 65,535 entries — \`SLAB_POOL_CAPACITY = 1024\` is well within that.

**2. Tagged union via \`tag\` byte, no enum.** \`TreeNode\` could in principle be a Rust enum (\`Free\`, \`Inner { ... }\`, \`Leaf { ... }\`). It can't, because enums aren't \`Pod\`. So we lay out all the fields any variant might need, and the \`tag\` byte tells consumers which fields to read. Unused fields hold zero / \`SLAB_NONE_INDEX\`. The discipline trade is real — a stale \`head_node\` in a freshly-freed node is a latent bug — but the layout pays off in zero-copy bytemuck access.

**3. Two trees per slab, not one.** Bid and ask trees are structurally identical; the only thing that differs is the "best price" walk direction (max vs min). Keeping them separate means the bid-side insert never traverses ask state and vice versa, which matters for Sealevel-style parallelism: a market with bids-only churn would still write the ask tree if they shared a root, serializing what could be independent.

**4. One shared OrderNode pool.** \`Slab.nodes\` is a single array. Both trees draw FIFOs from the same pool. The alternative (per-side pool) would double the OrderNode capacity per side for the same total footprint, but it would also mean that a one-sided book (e.g., almost all bids during a one-way move) would exhaust one pool while the other sat empty. Sharing keeps the slab usable across asymmetric flow.

**5. Account size = ~82 KiB.** Computed: \`64 (header) + 2 × 8208 (trees) + 1024 × 64 (pool) = 82_064\` bytes. That's well over the 10 KiB (\`MAX_PERMITTED_DATA_INCREASE\`) an account may be given from inside a program: a \`create_account\` issued by CPI is held to that limit, and only a top-level instruction may allocate up to \`MAX_PERMITTED_DATA_LENGTH = 10 MiB\`. So the program cannot allocate the slab itself. The client sends \`SystemProgram::CreateAccount\` (space \`Slab::LEN\`, owner openhl-core) as the first instruction of the transaction and \`CreateSlab\` as the second, which only initializes the account — the same split OpenBook and Phoenix use. The slab is therefore a keypair account, not a PDA. One consequence: a market can have any number of slabs, and \`SlabPlaceOrder\` / \`SlabMatch\` take no market account and don't check \`slab.market\`. The slab has no settlement path, so today this only decides which book a client reads; a production program would record the official slab's address in market state and check it. The rent is a one-time cost the creator pays at bootstrap.

> **Exercise §15.1.** Compute the exact \`Slab::LEN\` from the struct layout (don't trust the comment). Verify with \`bytemuck::bytes_of(&Slab::zeroed()).len()\`. Now compute the rent in lamports at \`lamports_per_byte_year = 3_480\` and \`years = 2\` (Solana's two-year rent exemption). That's roughly what \`CreateSlab\` charges.

---

## §15.2  The pool + free list

\`Slab.nodes\` is a flat array of 1024 OrderNodes. At any moment some are "live" (part of a FIFO at some price level), some are "free" (waiting to be allocated). Free nodes form a singly-linked stack via their \`next\` field; \`Slab.pool_free_head\` is the top of the stack. Allocation pops \`pool_free_head\`; deallocation pushes.

From \`programs/openhl-core/src/lib.rs\`:

\`\`\`rust
fn slab_init_pool(slab: &mut Slab) {
    for i in 0..SLAB_POOL_CAPACITY {
        slab.nodes[i].next = if i + 1 < SLAB_POOL_CAPACITY {
            (i as u16) + 1
        } else {
            SLAB_NONE_INDEX
        };
        // ... zero the other fields ...
    }
    slab.pool_free_head = 0;
}

fn pool_alloc_node(slab: &mut Slab) -> Result<u16, ProgramError> {
    let head = slab.pool_free_head;
    if head == SLAB_NONE_INDEX {
        return Err(ProgramError::AccountDataTooSmall);
    }
    slab.pool_free_head = slab.nodes[head as usize].next;
    Ok(head)
}

fn pool_free_node(slab: &mut Slab, idx: u16) {
    let head = slab.pool_free_head;
    slab.nodes[idx as usize].next = head;
    // ... zero the other fields ...
    slab.pool_free_head = idx;
}
\`\`\`

Three details worth flagging.

**The init walks the array once.** It costs \`O(N)\` at bootstrap (~1k iterations). That cost is paid in \`CreateSlab\`, which runs once per slab. Every subsequent op is O(log N) or O(1).

**Free fields stay zeroed.** When a node is freed, we don't just push it on the list — we also clear \`size\`, \`order_id\`, and \`owner\`. The cost is small (a few stores), and it means a stale \`owner\` field can't leak into a future allocation by mistake. This matters because we're reusing the same memory for many orders' lifetimes.

**Failure is \`AccountDataTooSmall\`.** When the pool exhausts, we return an error rather than overwriting some existing node. \`1024 nodes\` is large for a single market; if you hit it, the answer is to either (a) batch-cancel old orders to free nodes, or (b) ship a larger \`Slab\` variant. The chapter ships the conservative answer.

The two per-tree pools (\`bid_tree.nodes\` and \`ask_tree.nodes\`, both \`[TreeNode; 256]\`) work identically. \`tree_init\` walks each one once; \`tree_alloc\` and \`tree_free\` follow the same pop/push pattern via the \`next_free\` field.

> **Exercise §15.2.** Implement an \`available_count(slab) -> u32\` helper that walks the free list and counts. Run it before and after a sequence of inserts + cancels; the invariant \`live + free == SLAB_POOL_CAPACITY\` should hold. Free-list corruption (a node appearing twice on the list, or a cycle) is the single hardest class of slab bug — instrumenting \`available_count\` is the cheapest way to catch it.

---

## §15.3  Critbit insert

The critbit algorithm walks a tree where each inner node tests one specific bit of the key. The bit tested at a deeper inner node is *less* significant — more significant bits are decided closer to the root.

**Find or create a leaf for \`price\`.** From \`critbit_find_or_create_leaf\`:

\`\`\`rust
// (1) Empty tree → create root leaf.
if tree.root == SLAB_NONE_INDEX {
    let leaf_idx = tree_alloc(tree)?;
    tree.nodes[leaf_idx] = TreeNode { tag: LEAF, price, ... };
    tree.root = leaf_idx;
    return Ok((leaf_idx, true));
}

// (2) Walk to any leaf to compare prices.
let found_leaf = critbit_walk_to_leaf(tree, price);  // descend by (price >> split_bit) & 1
let found_price = tree.nodes[found_leaf].price;
if found_price == price {
    return Ok((found_leaf, false));  // existing level
}

// (3) New price — splice in a new inner + new leaf.
let diff = price ^ found_price;
let shared_bit = 63 - diff.leading_zeros() as u8;  // highest bit where prices differ

// Walk again from root looking for the spot to splice.
let mut parent = SLAB_NONE_INDEX;
let mut parent_side = 0u8;
let mut cur = tree.root;
loop {
    let node = &tree.nodes[cur];
    if node.tag == LEAF || node.split_bit < shared_bit { break; }
    let bit = ((price >> node.split_bit) & 1) as u8;
    parent = cur;
    parent_side = bit;
    cur = if bit == 1 { node.right_child } else { node.left_child };
}

// (4) Allocate new leaf + new inner; the new inner splits at \`shared_bit\`.
let new_leaf_idx = tree_alloc(tree)?;
tree.nodes[new_leaf_idx] = TreeNode { tag: LEAF, price, ... };
let new_inner_idx = tree_alloc(tree)?;
let price_bit = ((price >> shared_bit) & 1) as u8;
let (left, right) = if price_bit == 1 { (cur, new_leaf_idx) } else { (new_leaf_idx, cur) };
tree.nodes[new_inner_idx] = TreeNode { tag: INNER, split_bit: shared_bit, left_child: left, right_child: right, ... };

// (5) Wire into parent.
if parent == SLAB_NONE_INDEX {
    tree.root = new_inner_idx;
} else if parent_side == 1 {
    tree.nodes[parent].right_child = new_inner_idx;
} else {
    tree.nodes[parent].left_child = new_inner_idx;
}
\`\`\`

Five things to absorb.

**Step 2 is "walk to *any* leaf." Not the right one.** Critbit's elegance is that walking by \`(price >> split_bit) & 1\` from root ends at *some* leaf — the one that shares the longest critical-bit prefix with \`price\`. That's the only leaf we need to compare against to find \`shared_bit\`. We don't have to enumerate; we don't have to compare against multiple leaves.

**\`shared_bit = 63 - diff.leading_zeros()\`.** Standard trick: the highest set bit of \`diff\` is at position \`63 - leading_zeros\` (for \`u64\`). Since \`diff != 0\` (we ruled out the equal-prices case), \`leading_zeros\` is in \`0..=63\`.

**Step 3's walk stops at the right invariant.** We splice when we hit (a) a leaf, or (b) an inner node whose \`split_bit < shared_bit\`. Both cases mean: the existing tree doesn't have an inner discriminating at \`shared_bit\` on this path, so the new inner should go here. The invariant is maintained: at any inner with \`split_bit >= shared_bit\`, both \`price\` and \`found_price\` would agree at that bit, so we can keep descending.

**Step 4's \`price_bit\` decides which side the new leaf goes on.** If \`price\` has bit \`shared_bit\` set, it goes right; otherwise left. The existing subtree (\`cur\`) takes the other side. Why? Because at \`shared_bit\`, \`price\` and \`found_price\` differ — so they belong on opposite sides of the new inner.

**Step 5 is the only "wiring" step.** Everything before just allocated and filled in nodes. The actual tree connection is one parent's \`left_child\` or \`right_child\` pointer (or \`tree.root\`). Easy to get wrong; easy to test for.

The handler \`process_slab_place_order\` then attaches the new OrderNode (already allocated and initialized) to the leaf's FIFO. If the leaf is brand new (\`head_node == SLAB_NONE_INDEX\`), the new order becomes both head and tail. If it's existing, the new order becomes the new tail; the old tail's \`next\` and the new node's \`prev\` are linked.

> **Exercise §15.3.** Insert prices in three different orders: \`[100, 200, 150]\`, \`[200, 100, 150]\`, \`[150, 100, 200]\`. Walk the resulting trees by hand (or with a debug print). All three should produce trees that yield \`[100, 150, 200]\` when iterated in ascending order — but the internal structure (which inner is the root, which sides leaves are on) will differ. That's fine: critbit is *order-independent* in its leaves, not its internal shape.

---

## §15.4  Best-price + match-and-pop

\`critbit_find_best\`:

\`\`\`rust
fn critbit_find_best(tree: &CritbitTree, want_max: bool) -> Option<u16> {
    if tree.root == SLAB_NONE_INDEX { return None; }
    let mut cur = tree.root;
    loop {
        let node = &tree.nodes[cur];
        if node.tag == LEAF { return Some(cur); }
        cur = if want_max { node.right_child } else { node.left_child };
    }
}
\`\`\`

The whole algorithm is "walk root toward your side." For bids we want the highest price, so we always go right. For asks we want the lowest, so we always go left. The tree's invariant — right-side leaves have a 1 at \`split_bit\`, left-side have a 0 — combined with descending from highest split_bit to lowest, guarantees this monotonically arrives at the extremum.

\`SlabMatch\` then runs:

\`\`\`rust
while fills < max_fills && remaining > 0 {
    let (leaf_idx, head_idx, level_price) = slab_peek_best(slab, want_max)?;
    if !crosses(level_price, limit_price) { break; }

    let maker_size = slab.nodes[head_idx].size;
    let fill = remaining.min(maker_size);

    if fill == maker_size {
        slab_pop_head_of_leaf(slab, maker_side, leaf_idx)?;  // may drop the leaf
    } else {
        slab.nodes[head_idx].size = maker_size - fill;
    }

    remaining -= fill;
    fills += 1;
}
\`\`\`

This is structurally the same fill-loop shape as Chapter 8's flat-book \`Match\` — taker has a \`remaining\`, walk the maker side from best, fill until either \`remaining == 0\`, the next maker doesn't cross the limit, or the \`max_fills\` pagination cap kicks in. What's different is that finding the maker is O(log N) instead of O(N), and popping the maker is O(log N) instead of O(1) (the trade-off lives in \`slab_pop_head_of_leaf\` when the level drains).

The \`crosses\` predicate (inline above) is the limit-price gate:

- **BID taker:** willing to buy at most \`limit_price\` → cross asks where \`level_price <= limit_price\`.
- **ASK taker:** willing to sell at least \`limit_price\` → cross bids where \`level_price >= limit_price\`.

When the gate stops crossing (the maker's price is no longer favorable to the taker), the match returns with \`remaining > 0\`. The taker can then post the unfilled portion as a maker if they want — that's a separate \`SlabPlaceOrder\` call from the same caller.

> **Exercise §15.4.** Insert ten asks at prices 100, 101, 102, ..., 109. Send a BID taker with \`limit_price = 105\`, \`size = 25\`, \`max_fills = 10\`. Trace the fills: which prices are hit, in what order, how many fills does the taker take before hitting the limit gate, what's left of \`remaining\` after the match returns?

---

## §15.5  Critbit remove — the hard one

When a level's FIFO empties (\`slab_pop_head_of_leaf\` walked the last order off), the leaf has to come out of the tree. That's not just freeing the leaf — the inner node directly above it now has only one valid child, which makes it redundant. We splice the sibling subtree up past the redundant inner.

\`\`\`rust
fn critbit_remove_leaf(tree: &mut CritbitTree, leaf_idx: u16) -> ProgramResult {
    // (1) Edge case: leaf is the root.
    if tree.root == leaf_idx {
        tree_free(tree, leaf_idx);
        tree.root = SLAB_NONE_INDEX;
        return Ok(());
    }

    // (2) Walk by price, tracking parent + grandparent.
    let target_price = tree.nodes[leaf_idx].price;
    let mut grandparent = SLAB_NONE_INDEX;
    let mut parent = SLAB_NONE_INDEX;
    let mut gp_to_p_side = 0u8;
    let mut parent_side = 0u8;
    let mut cur = tree.root;
    loop {
        if cur == leaf_idx { break; }
        let node = &tree.nodes[cur];
        let bit = ((target_price >> node.split_bit) & 1) as u8;
        grandparent = parent;
        gp_to_p_side = parent_side;
        parent = cur;
        parent_side = bit;
        cur = if bit == 1 { node.right_child } else { node.left_child };
    }

    // (3) The sibling at \`parent\` is the side \`parent_side\` did NOT take.
    let parent_node = tree.nodes[parent];
    let sibling = if parent_side == 1 { parent_node.left_child } else { parent_node.right_child };

    // (4) Wire \`sibling\` up where \`parent\` used to live (under grandparent, or as root).
    if grandparent == SLAB_NONE_INDEX {
        tree.root = sibling;
    } else if gp_to_p_side == 1 {
        tree.nodes[grandparent].right_child = sibling;
    } else {
        tree.nodes[grandparent].left_child = sibling;
    }

    tree_free(tree, parent);
    tree_free(tree, leaf_idx);
    Ok(())
}
\`\`\`

Four invariants making this work.

**The walk is by price, not by index.** The leaf we're removing has a stable index in \`tree.nodes\`, but the *path* to it from root descends by the bit-test routine. Walking by index would require remembering parents during insert, doubling state. Walking by price is O(log N) every time, no extra bookkeeping.

**Two ancestors matter.** \`parent\` is the inner directly above the leaf; that's the one being deleted along with the leaf. \`grandparent\` is the inner above the parent; *that* is the one whose child pointer needs updating to bypass the deleted parent. If parent IS the root (no grandparent), we update \`tree.root\` directly.

**The sibling's subtree is preserved.** We don't recurse into it, we don't touch its nodes — we just rewire one pointer (parent's slot in grandparent) to point at the sibling. Whatever it was — a leaf, an inner, a whole subtree — moves up one level intact.

**Two \`tree_free\` calls.** The leaf AND the parent. Both go back on the tree's free list. The first allocation after a remove will reuse one of them (probably the parent, since free-list pops are LIFO).

The single-leaf root case in step 1 is the only "shape-different" branch. For everything else there's always a parent (the leaf isn't the root because at minimum we have an inner discriminating between this leaf and at least one other).

> **Exercise §15.5.** Build a slab, insert ten levels at prices \`[100, 200, 50, 150, 250, 75, 125, 175, 225, 275]\`. Walk what the tree looks like (root, splits, leaves). Now cancel the level at 150 — trace which inner gets freed and which subtree moves up. Now cancel at 250. Now at 100. After three removes, are there any "wasted" inner nodes? (Hint: there shouldn't be — the remove always collapses the parent, by construction.)

---

## §15.6  The three handlers

\`process_create_slab\` (tag 29) is the bootstrap. Accounts: \`slab (WRITE, SIGNER)\`, \`market\`. It validates the market, then refuses a slab that didn't sign (so only the keypair holder can pick its market), isn't writable, isn't owned by openhl-core, isn't exactly \`Slab::LEN\` bytes, isn't rent-exempt, or already carries a discriminator (no re-initializing a live book). Then it writes the discriminator + market (\`bump\` stays 0: there is no PDA), and runs \`tree_init\` on both trees plus \`slab_init_pool\` on the OrderNode pool. The init walk is the heaviest part of the instruction (~1k pool entries + 256 tree entries × 2 sides = ~1.5k iterations); subsequent ops are sub-log-N.

\`process_slab_place_order\` (tag 30) reads \`[side u8][price u64 LE][size u64 LE]\` — identical to \`PlaceOrder\`'s payload. Validates the slab discriminator, copies the user's pubkey, calls \`slab_insert_order\`. Two accounts: \`user (SIGNER), slab (WRITE)\`. Worth comparing to ch.7's flat-book \`process_place_order\`: same payload, +0 accounts. The slab's added complexity is entirely inside the program; the on-the-wire instruction shape is unchanged. That matters for client-side migration: existing trading clients can swap \`PlaceOrder\` for \`SlabPlaceOrder\` by changing the tag byte and the account they pass.

\`process_slab_match\` (tag 31) reads \`[taker_side u8][price u64 LE][size u64 LE][max_fills u8]\` — identical to ch.8's \`Match\`. Validates, runs the fill loop above, logs \`fills\` + \`remaining\` so the pagination cap is visible. The same \`max_fills\` semantics ch.8 introduced apply here unchanged: the slab is still bounded by CU, just at a much higher effective N.

The CU shapes, measured in LiteSVM with \`fuzz/slab\`'s \`grid\` test (size-1 bids; Chapter 4 §4.5 checked that LiteSVM counts like \`solana-test-validator\`):

| op | flat (ch.7/8) | slab (ch.15) |
|---|---|---|
| place, empty book | 2,357 | 1,788 |
| place, full-ish book | 2,446 (31 orders) | 1,954 (1,023 orders, 128 levels); 2,008 (a new level after 126 levels) |
| match, 10 fills | 22,250 (32 orders) | 14,553 (10 orders) to 15,818 (128 orders, one per level); 14,284 (1,024 orders at 128 levels), 13,921 (1,024 at 8 levels) |
| match, 4 fills | 8,147 (4 orders), 8,500 (8), 9,276 (16) | 6,597 (4), 6,784 (8), 6,793 (16) |
| cancel | 1,994 (first slot) – 2,174 (last of 32) | not built (Exercise §15.6) |

An earlier draft of this table, written before measuring, said the slab costs more per place (about 3–4 KCU against 1 KCU) and that the flat book wins \`Match\` below about 8 orders. Neither held. The slab was cheaper per place; we did not break the difference down, but the flat insert scans the slots for a free one. And it was cheaper on \`Match\` at every size we tried, down to 4 orders. What does hold is the shape: 10 fills cost about the same on 10 orders as on 1,024, because each fill walks one path down a tree of price levels, not every order. That path is short for prices like these (consecutive integers); §15.7 shows how long it can be made.

The cost does depend on two things the depth does not show. One is the prices' bits (§15.7). The other is how many orders share a level. When each fill empties a level, the leaf removal (§15.5) runs every time: 64 fills cost 92,122 CU on 128 orders at 128 prices, against 83,871 on 1,024 orders at 128 prices (8 per level).

> **Exercise §15.6.** Add a \`SlabCancelOrder\` instruction that takes \`(order_id, side, price)\` and removes a specific order from a specific price level. Hint: the slab as built doesn't index orders by \`order_id\`, so you'll need to walk the level's FIFO to find the right one. Why is the \`price\` argument important — what does it save you over walking the whole tree?

---

## §15.7  Recap + verify yourself

### Recap diagram

\`\`\`
A slab at a glance:

  Slab {
    discriminator: "SLAB\\0\\0\\0\\0"
    market: <market pubkey>
    next_order_id: u64
    active_count: u32
    pool_free_head: u16 ──┐
                          │
    bid_tree: CritbitTree {
      root: u16 ──────────┼─── pointer into nodes[] (or NONE_INDEX)
      free_head: u16 ─────┼─── stack of free TreeNode slots
      nodes: [TreeNode; 256]
              ┌──────────────────────────────┐
              │ INNER: split_bit, l_idx, r_idx
              │ LEAF:  price, head_node, tail_node, order_count
              │ FREE:  next_free
              └──────────────────────────────┘
    }
    ask_tree: CritbitTree { … same shape … }

    nodes: [OrderNode; 1024]  ◄── shared OrderNode pool
            ┌─────────────────────────┐
            │ order_id, owner, size,  │
            │ next, prev              │  (FIFO links, or free-list link)
            └─────────────────────────┘
  }


Insert price 117, size 5, BID:
  pool_alloc_node() → idx_O
  nodes[idx_O] = OrderNode{order_id, owner, size=5, next=NONE, prev=NONE}
  critbit_find_or_create_leaf(bid_tree, 117) → (idx_L, was_new)
  if was_new:
    bid_tree.nodes[idx_L].{head_node, tail_node} = idx_O
    bid_tree.nodes[idx_L].order_count = 1
  else:
    old_tail = bid_tree.nodes[idx_L].tail_node
    bid_tree.nodes[idx_L].tail_node = idx_O
    nodes[old_tail].next = idx_O
    nodes[idx_O].prev   = old_tail


Match BID-taker, limit=110, size=25, max_fills=3:
  best ask leaf via critbit_find_best(ask_tree, want_max=false)
  pop FIFO head:
    if head.size <= remaining: pop_head_of_leaf() (may remove leaf)
    else:                      shrink head.size in place
  repeat until !crosses or remaining=0 or fills==3
\`\`\`

### Three things to verify yourself

1. **The pool exhausts gracefully.** Insert 1024 orders (a side's tree holds at most 128 distinct prices, so spread them over 128 or fewer levels). Try a 1025th — \`pool_alloc_node\` should fail with \`AccountDataTooSmall\` (no pool slot left), the place should fail, and \`active_count\` should stay at 1024.
2. **A drained level removes its leaf cleanly.** Insert two orders at price 100 (same level). Cross-match both via \`SlabMatch\`. The slab dump should show 0 active orders, the bid leaf at 100 should be gone (\`describe_best\` returns \`(empty)\`), and the tree's \`free_head\` should have advanced (a leaf and its parent inner went back on the free list — except when 100 was the only level, in which case only the leaf returns and the parent didn't exist).
3. **\`active_count\` invariant.** After any sequence of place + match + cancel, \`active_count\` should equal the actual count of \`nodes[i].size > 0\` (i.e., live orders). The slab dump prints \`active_count\` directly; counting from the pool walk takes one extra script pass. Catching a divergence here means a counter wasn't updated somewhere — a latent bug.


### Now let a tool look for the expensive match

Chapter 8 §8.6 capped the flat matcher's \`max_fills\` so a full book stays under a CU cap, and showed why that cap must shrink as the book grows. [\`fuzz/slab/\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/slab) asks the same question of \`SlabMatch\`, with a cap of 100,000 CU (\`SLAB_MATCH_CU_CAP\`), on the costliest shape we could build: 128 bids at 128 prices (a side's tree holds at most 128 levels), one order per level so every fill also removes a level, and prices chosen so the best bid sits deep in the critbit. Those prices are \`u64::MAX\` and \`u64::MAX - 2^k\` for k < 63, plus 64 ordinary ones below. Every split in a critbit is on a different bit of the 64-bit key, so a path is at most 64 nodes long; these prices build one such path, with the best bids (\`u64::MAX\` and \`u64::MAX - 1\`) at its bottom and each later one hanging off it a little higher, so the first fills walk the longest paths the key allows. Set up as in Chapter 3 §3.7, then:

\`\`\`bash
cargo build-sbf --manifest-path programs/openhl-core/Cargo.toml
cd fuzz/slab
cargo build --release --features invariant_ch15
cargo test --release --features invariant_ch15      # 10 fills cost the same at 32 and 1,024 orders
timeout -s INT 60 crucible run openhl_slab_fuzz invariant_ch15 \\
    --binary-in target/release/invariant_test --timeout 45
\`\`\`

> **Exercise §15.7.** Run it. You should see \`[FUZZ_FINDING] [cu-dos:…] ix slab_match consumed … CU (cap 100000)\` lines. As in Chapter 8, the bound is the program's to set. From the \`grid\` numbers, what is the largest \`max_fills\` that keeps every shape you can think of under 100,000? Add the check to \`process_slab_match\`, rebuild, and run again. (The program as shipped has no cap, which is why the run above reports; the caps below were measured on copies with the check added.)
>
> Our first answer was wrong, and the way it was wrong is the lesson. We measured contiguous prices (100, 101, …) at one order per level and found 69 fills at 99,037 CU, so we capped at 69. A reviewer pointed out that a critbit is not self-balancing: its depth follows the bits of the prices, not the number of levels. On the deep prices above, 10 fills cost 35,819 CU (against about 14,500 on contiguous prices), 32 cost 100,222, and with the cap at 69 the fuzzer reported 157,245. The makers choose those prices, so the makers set how expensive the taker's match is. The largest cap that fits the deep shape is 31 (97,678 CU); with \`if max_fills > 31\` the fuzzer found nothing in 45 seconds.
>
> 31 is a measurement on the deepest shape we found, not a proof. The bound it rests on is real (a path is at most as long as the key has bits), and the cap still does not depend on how many orders the pool holds, which is what Chapter 8's cap could not say. What it does depend on is that worst path, and on the price of removing a level. A match past the default budget is still possible without a cap: 128 fills on the deep shape did not fit in 200,000.

---

## What's not here (intentionally)

This is an implementation chapter, not a comparison chapter. We didn't write:

- A benchmark beyond the \`grid\` test in \`fuzz/slab\` (§15.6): production depth, settlement CPIs, and cancel on the slab.
- A side-by-side of Serum's slab vs Phoenix's slab vs ours. Both production slabs have features ours doesn't (Serum's order book stores cancel-on-disconnect tags; Phoenix has its own market-maker reservation slots), and a fair comparison would be its own chapter.
- A migration guide from flat books to slab books. The two account types are independent — there's no on-chain conversion. A market built on \`OrderBook\` (Chapter 7) and a market built on \`Slab\` (this chapter) can coexist on the same program.

If you got this far and want more, the §8.4 pseudocode's "3-4 day exercise" framing was accurate: spend the days, write the variants, measure the results.
`,
                },
              ],
            },
          },
        ],
      },
    },
  });
}
