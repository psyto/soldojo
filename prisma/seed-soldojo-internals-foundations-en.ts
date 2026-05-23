// AUTO-GENERATED from drafts/solana_internals_ch*_en.md
// by .github/scripts/build-soldojo-internals-seed.ts.
// Do not hand-edit. Re-run the build script when drafts change.

import { PrismaClient } from '@prisma/client';

export async function seedSoldojoInternalsFoundationsEN(prisma: PrismaClient) {
  const tags = ["solana","internals","native-programs","pdas","compute-budget","sealevel"];

  await prisma.course.create({
    data: {
      slug: "solana-internals-foundations-en",
      title: "Solana Internals — Foundations",
      description:
        "Learn Solana from scratch by building. Five chapters covering the runtime fundamentals — account model, native programs without Anchor, Program-Derived Addresses, compute budget and heap discipline, Sealevel parallelism — with a working companion repo at every step. No SDK abstractions hide the bytes.",
      difficulty: "ADVANCED",
      duration: 225,
      xpReward: 700,
      track: "solana-internals",
      tags,
      isPublished: true,
      sortOrder: 100,
      locale: "en",
      instructorName: "SolDojo Internals",
      modules: {
        create: [
          {
            title: "Foundations",
            sortOrder: 0,
            lessons: {
              create: [
                {
                  title: "Chapter 1 — The Account Model from the Bytes Up",
                  slug: "solana-internals-ch01-account-model-en",
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 45,
                  xpReward: 100,
                  content: `# Chapter 1 — The Account Model from the Bytes Up

> Status: draft (v0.1).
> Companion code: \`crates/state/src/lib.rs\`, \`scripts/allocate-market/src/main.rs\`.
> Tested against: solana-sdk 2.3.1, solana-rent 2.2.1, solana-account 2.2.1, solana-system-interface 1.0.0.

---

## §1.0  Framing

Most Solana tutorials start with Anchor. You write a \`#[derive(Accounts)]\` struct, sprinkle some \`#[account(init, payer = signer, space = 8 + ...)]\` attributes, and a few macros later you have a working program. The macros are seductive, but they collapse the entire Solana runtime model into a single attribute line. When the macro picks the wrong default, you don't know what to look at — because you never saw what the macro was doing on your behalf.

This chapter is the antidote. We will:

1. Open \`solana-account\` and read the five fields of an \`Account\`.
2. Compute a rent-exempt balance by hand and match it against the runtime.
3. Call the System program directly to allocate a 256-byte account on a local validator.
4. Hex-dump the raw bytes and identify every byte against our own layout.
5. Enumerate exactly what \`#[account(init, ...)]\` would have done for us.

By the end you will be able to point at any byte in any Solana account and say what it means, where it came from, and which program is allowed to change it. That is the foundation everything else in this track builds on.

The worked example is the smallest useful version of a real artifact: an empty \`Market\` account for our HL-style perp DEX. It is empty because the System program owns it after creation, and System has no instruction for "write arbitrary bytes." That gap is the hook into Chapter 2.

---

## §1.1  The five fields of an account

Open \`solana-account-2.2.1/src/lib.rs:44–56\`:

\`\`\`rust
#[repr(C)]
// ...
pub struct Account {
    /// lamports in the account
    pub lamports: u64,
    /// data held in this account
    pub data: Vec<u8>,
    /// the program that owns this account. If executable, the program that loads this account.
    pub owner: Pubkey,
    /// this account's data contains a loaded program (and is now read-only)
    pub executable: bool,
    /// the epoch at which this account will next owe rent
    pub rent_epoch: Epoch,
}
\`\`\`

That's the entire definition. Five fields. There is no \`slot\`, no \`version\`, no \`nonce\`, no \`storage_root\`. The Solana runtime stores nothing else *about* an account — everything else lives *inside* the \`data\` field as opaque bytes.

Let's take them one at a time.

**\`lamports: u64\`** — the account's balance, in lamports (1 SOL = 10⁹ lamports). Any program may *increase* an account's lamports (just transfer in). Only the account's **owner** program may *decrease* them. This is a runtime invariant enforced by the loader; if your program tries to debit an account it doesn't own, the transaction fails before your code returns.

**\`data: Vec<u8>\`** — the account's storage. To the runtime, this is opaque: just bytes, length capped at 10 MB. Programs interpret these bytes however they like (Anchor with Borsh, our code with \`bytemuck\`, raw shaders with whatever they please). Only the owner program may write to \`data\`. Other programs can read it.

**\`owner: Pubkey\`** — the public key of the program allowed to mutate \`lamports\` (downward) and \`data\`. For a wallet, this is the System program. For an SPL Token account, the SPL Token program. For our \`Market\` account in Chapter 2 onward, our own program. The owner is set once at creation (via System's \`CreateAccount\` or \`Assign\`) and changes only by an explicit \`Assign\` instruction issued by the current owner.

**\`executable: bool\`** — true if \`data\` contains a loaded BPF program, false otherwise. Once \`true\`, the account becomes read-only and can no longer be written to, ever. This is how immutability works in Solana: an account flips to executable, and the runtime refuses every subsequent write.

**\`rent_epoch: Epoch\`** — historical baggage. In early Solana, the runtime periodically charged rent against accounts based on size; this field tracked when the next charge was due. Rent collection was effectively disabled in favor of strict rent-exemption (see §1.2), so this field exists but no longer means much in practice. You will see it in \`solana account <pubkey>\` output as a number that doesn't change.

**What the SDK hides:** When you write Anchor and declare \`pub user_data: Account<'info, UserData>\`, you receive a typed view that *parses* the \`data\` field for you. The other four fields — \`lamports\`, \`owner\`, \`executable\`, \`rent_epoch\` — are still there, accessible via the underlying \`AccountInfo\`, but the type hints you toward only one of them. Most developers go their entire Anchor career without explicitly touching \`owner\`, despite owner-checking being one of the most common security bugs in Solana programs.

> **Exercise §1.1.** Pick any SPL token account address (your own USDC, for example), then run:
> \`\`\`
> solana account <pubkey> --output json
> \`\`\`
> Identify each of the five fields in the JSON output. What is \`owner\`? What does \`data\` look like base64-encoded? Is \`executable\` what you'd expect?

---

## §1.2  Rent and rent exemption

Open \`solana-rent-2.2.1/src/lib.rs:32–45\`:

\`\`\`rust
#[repr(C)]
// ...
pub struct Rent {
    /// Rental rate in lamports/byte-year.
    pub lamports_per_byte_year: u64,

    /// Amount of time (in years) a balance must include rent for the account to
    /// be rent exempt.
    pub exemption_threshold: f64,

    /// The percentage of collected rent that is burned.
    pub burn_percent: u8,
}
\`\`\`

And the formula itself, \`lib.rs:93–97\`:

\`\`\`rust
pub fn minimum_balance(&self, data_len: usize) -> u64 {
    let bytes = data_len as u64;
    (((ACCOUNT_STORAGE_OVERHEAD + bytes) * self.lamports_per_byte_year) as f64
        * self.exemption_threshold) as u64
}
\`\`\`

The rule: an account is **rent-exempt** if its lamport balance is at least enough to cover two years of rent at the current rate. If you try to create an account below this threshold, the transaction fails. If you reduce a live account's balance below the threshold (e.g. transferring lamports out), the same.

The \`ACCOUNT_STORAGE_OVERHEAD\` constant at \`lib.rs:70\` is the key surprise:

\`\`\`rust
pub const ACCOUNT_STORAGE_OVERHEAD: u64 = 128;
\`\`\`

Every account, no matter how small its \`data\` field, is *billed* for 128 extra bytes. This covers the runtime's own bookkeeping — the metadata fields from §1.1, indexing overhead, and so on. So a "zero-byte" account costs the same rent as a 128-byte account.

For our \`Market\` (256 bytes of data), the calculation:

\`\`\`
minimum_balance = (128 + 256) × lamports_per_byte_year × 2.0
                = 384 × 3480 × 2
                = 2,672,640 lamports
                ≈ 0.00267 SOL
\`\`\`

(\`lamports_per_byte_year\` defaults to ~3480 — see \`lib.rs:54\`, derived from "$0.01 per megabyte day".)

Our script asks the RPC for this number rather than computing it locally:

\`\`\`rust
// scripts/allocate-market/src/main.rs:56–58
let rent_lamports = client
    .get_minimum_balance_for_rent_exemption(Market::LEN)
    .context("fetch rent-exempt minimum")?;
\`\`\`

This is a round-trip to the validator. Why? Because \`Rent\` is a *sysvar* — its values are not hard-coded into your binary, they live on-chain and can (in principle) be changed by a future runtime update. Asking the RPC is the only way to get the value that *this* cluster will enforce.

**What the SDK hides:** Anchor's \`#[account(init, ..., space = 8 + 248)]\` reads the \`space\` argument, calls \`Rent::get()?.minimum_balance(space)\` *inside the program* (no RPC needed, because the sysvar is accessible on-chain), and uses that as the lamport amount for \`create_account\`. The \`8\` you always see in \`space = 8 + ...\` is Anchor's own discriminator overhead — eight extra bytes prepended to every account so Anchor can identify the type at runtime. Our \`Market\` already has its own 8-byte discriminator at offset 0, so we are paying the same 8-byte tax, just visibly.

> **Exercise §1.2.** Compute \`minimum_balance\` by hand for a 0-byte account, a 256-byte account, and a 10,000-byte account (the upper limit Anchor encourages). Then verify against the cluster:
> \`\`\`
> solana rent <bytes>
> \`\`\`
> Where does the 128 of overhead actually live? (Hint: read the field-name comment at \`lib.rs:67–70\`.)

---

## §1.3  Allocating an account from the System program

The System program (\`11111111111111111111111111111111\`) is the only program that can bring an account into existence. It owns every wallet, it is the only thing that can move lamports around freely, and it is the source of every other program's first account.

Open \`solana-system-interface-1.0.0/src/instruction.rs:80–95\`:

\`\`\`rust
pub enum SystemInstruction {
    /// Create a new account
    ///
    /// # Account references
    ///   0. \`[WRITE, SIGNER]\` Funding account
    ///   1. \`[WRITE, SIGNER]\` New account
    CreateAccount {
        /// Number of lamports to transfer to the new account
        lamports: u64,
        /// Number of bytes of memory to allocate
        space: u64,
        /// Address of program that will own the new account
        owner: Pubkey,
    },
    // ...
}
\`\`\`

\`CreateAccount\` does three things in one syscall:

1. **Transfer** \`lamports\` from the funding account to the new account.
2. **Allocate** \`space\` bytes for the new account's \`data\` field.
3. **Assign** \`owner\` as the new account's owner.

The doc comment at \`instruction.rs:9–12\` spells out the same decomposition:

> Account creation typically involves three steps: \`allocate\` space, \`transfer\` lamports for rent, \`assign\` to its owning program. The \`create_account\` function does all three at once.

The constructor we call is at \`instruction.rs:406–426\`:

\`\`\`rust
pub fn create_account(
    from_pubkey: &Pubkey,
    to_pubkey: &Pubkey,
    lamports: u64,
    space: u64,
    owner: &Pubkey,
) -> Instruction {
    let account_metas = vec![
        AccountMeta::new(*from_pubkey, true),
        AccountMeta::new(*to_pubkey, true),
    ];
    // ...
}
\`\`\`

Note the \`true\` on both \`AccountMeta::new\` calls — that flag means **signer required**. Both the funding account and the new account must sign the transaction. This is jarring the first time you see it: why does an account that doesn't exist yet need to sign?

The answer is grief protection. If only the payer had to sign, anyone could pay 0.003 SOL to create an account at *your* address, set its owner to a program *they* control, and bind that address to junk before you ever got there. By requiring the new account to sign, the runtime forces a proof that *you* control the private key for the new address. The lamports come from the payer; the signature on the new account comes from whoever owns the keypair that will identify it.

Our script does this at \`scripts/allocate-market/src/main.rs:79–85\`:

\`\`\`rust
let blockhash = client.get_latest_blockhash().context("fetch blockhash")?;
let tx = Transaction::new_signed_with_payer(
    &[create_ix],
    Some(&payer.pubkey()),
    &[&payer, &market],
    blockhash,
);
\`\`\`

\`&[&payer, &market]\` — two signers. The \`market\` is a \`Keypair::new()\` (line 52), generated locally; we hold its private key just long enough to sign this one transaction. After that we never use it again — the account is identified by its public key, and from this transaction forward, only the **owner program** (System, for now) can change anything about it.

In Chapter 3 we will replace the random \`Keypair::new()\` with a Program-Derived Address (PDA), at which point the new-account signature is provided by the program itself via \`invoke_signed\`. Same model, different signer.

**What the SDK hides:** Anchor's \`#[account(init, payer = payer, space = ...)]\` expands (roughly) to:

\`\`\`rust
// 1. Compute the rent-exempt minimum at runtime via Rent::get().
let rent = Rent::get()?.minimum_balance(space);

// 2. Construct the System CreateAccount instruction.
let ix = system_instruction::create_account(
    payer.key,
    account.key,
    rent,
    space as u64,
    program_id,                   // <-- our program, not System!
);

// 3. Invoke via CPI with \`invoke_signed\` if \`account\` is a PDA, else \`invoke\`.
invoke_signed(&ix, &[payer, account, system_program], &[seeds_with_bump])?;

// 4. Write Anchor's 8-byte discriminator to data[0..8].
account.try_borrow_mut_data()?[..8].copy_from_slice(&MyType::DISCRIMINATOR);

// 5. Zero-init the rest of data (because Anchor's account type is repr(C) Pod-like).
\`\`\`

Five steps. Behind a single attribute. None of them are wrong — Anchor's choices are reasonable defaults — but every one of them is a decision you didn't make.

> **Exercise §1.3.** The new account is allocated owned by the program that called \`create_account\`. In our script, what owner does the new account end up with? Look at \`main.rs:69\` and \`main.rs:71–77\`. Why is that the right choice for Chapter 1 specifically?

---

## §1.4  Reading the bytes

The script's last act is to fetch the account back and dump it. Here is the dump table from \`main.rs:113–125\`:

\`\`\`rust
fn dump_market_bytes(data: &[u8]) {
    let regions: &[(usize, usize, &str)] = &[
        (0, 8, "discriminator      [u8; 8]    expected: MARKET\\\\0\\\\0"),
        (8, 1, "version            u8"),
        (9, 1, "bump               u8"),
        (10, 6, "_pad0              [u8; 6]"),
        (16, 32, "authority          [u8; 32]"),
        (48, 32, "base_mint          [u8; 32]"),
        (80, 32, "quote_mint         [u8; 32]"),
        (112, 8, "tick_size          u64"),
        (120, 8, "lot_size           u64"),
        (128, 128, "_reserved          [u8; 128]"),
    ];
    // ...
}
\`\`\`

These offsets are *not* invented — they come straight from the \`Market\` struct at \`crates/state/src/lib.rs:43–56\`:

\`\`\`rust
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct Market {
    pub discriminator: [u8; 8],   // 0..8
    pub version: u8,              // 8
    pub bump: u8,                 // 9
    pub _pad0: [u8; 6],           // 10..16
    pub authority: [u8; 32],      // 16..48
    pub base_mint: [u8; 32],      // 48..80
    pub quote_mint: [u8; 32],     // 80..112
    pub tick_size: u64,           // 112..120
    pub lot_size: u64,            // 120..128
    pub _reserved: [u8; 128],     // 128..256
}
\`\`\`

Two things are worth pausing on.

**The \`_pad0: [u8; 6]\` field.** After \`bump: u8\` at offset 9, the next field is \`authority: [u8; 32]\`. A \`[u8; 32]\` has alignment 1, but our struct is \`#[repr(C)]\` and we want \`tick_size: u64\` further down to land on an 8-byte boundary so future code can read it as a \`u64\` without an unaligned access. The padding makes the next 8-byte-aligned offset land at 16 instead of 10. We declare it explicitly rather than letting the compiler insert hidden padding — because hidden padding would break \`bytemuck::Pod\`, which requires every byte of the struct to be initialized and accessible.

**\`Pubkey\` stored as \`[u8; 32]\`.** The doc comment at \`crates/state/src/lib.rs:8–15\` explains this: \`solana_program::pubkey::Pubkey\` does not implement \`bytemuck::Pod\` upstream, so to keep the layout \`Pod\`-safe we store the raw 32 bytes. This is also pedagogically honest — a \`Pubkey\` *is* 32 bytes; the type alias just gives them a name. Chapter 2's program will convert at the boundary.

When you run the script against a fresh \`solana-test-validator\`, expected output looks like:

\`\`\`
rpc:            http://127.0.0.1:8899
payer:          7c5...QJZ
market pubkey:  E2k...A9M
space:          256 bytes
rent lamports:  2672640  (0.002673 SOL)

create_account signature: 5xH...t8N

account metadata:
  owner:        11111111111111111111111111111111
  lamports:     2672640
  executable:   false
  rent_epoch:   18446744073709551615
  data length:  256

account data (raw bytes, annotated against openhl_state::Market):

  0x0000  discriminator      [u8; 8]    expected: MARKET\\0\\0
          00 00 00 00 00 00 00 00
  0x0008  version            u8
          00
  0x0009  bump               u8
          00
  0x000a  _pad0              [u8; 6]
          00 00 00 00 00 00
  0x0010  authority          [u8; 32]
          00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
          00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
  ... (all zeros for 256 bytes)
\`\`\`

A few things to stare at:

- \`owner: 11111111111111111111111111111111\` — the all-ones-in-base58 address is the System program. We asked for it explicitly at \`main.rs:69\`.
- \`lamports: 2672640\` — exactly the rent-exempt minimum we computed in §1.2. No more, no less.
- \`executable: false\` — this is a data account, not a program.
- \`rent_epoch: 18446744073709551615\` — that's \`u64::MAX\`. The runtime marks rent-exempt accounts with this sentinel value, effectively saying "never charge this one." This is the modern legacy of the rent system.
- \`data: [0u8; 256]\` — every byte zero. We never wrote anything; System program does not let anyone write to data fields it owns. The bytes are zero because the allocator zero-initializes them.

The discriminator at offset 0 is \`00 00 00 00 00 00 00 00\`. It is **not** \`4d 41 52 4b 45 54 00 00\` ("MARKET\\0\\0"). We allocated the right number of bytes, but no one has written \`MARKET_DISCRIMINATOR\` into them. That's the Chapter 2 job.

**What the SDK hides:** When you fetch an account through Anchor's typed \`Account<'info, T>\` interface, the framework reads \`data[0..8]\` and *compares* it against \`T::DISCRIMINATOR\`. If they don't match, you get an error before your code sees the account at all. This is invaluable safety — but it also means an account in the state we just created (correct size, all zeros) would fail Anchor's discriminator check and be invisible to typed code. The raw bytes are still there. Anchor just refuses to look.

> **Exercise §1.4.** Run the script against \`solana-test-validator\`. Open another terminal and run \`solana account <market_pubkey>\` for the market pubkey the script printed. Compare the output to the script's. They should agree on every field. Find one piece of information the \`solana account\` command shows that the script doesn't print, and one piece of information the script shows that \`solana account\` doesn't.

---

## §1.5  What \`#[account(init, ...)]\` actually does

We've now seen everything Anchor's most common attribute would have done for us. Pulling it together, here is the literal correspondence:

| Anchor does | Spelled out as |
|---|---|
| reads \`space = N\` from the attribute | \`let space = N;\` |
| calls \`Rent::get()?.minimum_balance(space)\` | §1.2 — our script uses the RPC variant \`get_minimum_balance_for_rent_exemption\` |
| constructs \`system_instruction::create_account\` | §1.3 — \`main.rs:71–77\` |
| invokes via \`invoke_signed\` (with PDA seeds) or \`invoke\` | omitted in our script (we sign client-side instead — chapter 2 introduces CPI) |
| writes \`T::DISCRIMINATOR\` to \`data[0..8]\` | omitted — bytes stay zero, as §1.4 shows |
| sets the new account's owner to the program ID | we set it to \`system_program::ID\` instead, on purpose |
| binds the typed account view to a Rust struct | we use raw \`account.data: Vec<u8>\` and a separate \`Market\` struct |

The macro is doing real work. It is not "just sugar." It picks defaults at every step — payer choice, rent calc, owner = program ID, discriminator = type ID, layout = Borsh-ish — that are right *most* of the time. When they are wrong (cross-program ownership, custom discriminators, byte-exact layouts for ZK verifiers), you need to know which line of the expansion is the one to override.

Three concentric layers, from inside out:

1. **\`solana-program\` syscalls** — the runtime ABI. \`sol_invoke\`, \`sol_log\`, \`create_program_address\`. Closest to the metal. You will rarely call these directly, but every higher abstraction eventually does.
2. **\`solana-sdk\` wrappers** — \`Transaction::new_signed_with_payer\`, \`Account\`, \`Rent\`, instruction constructors. Ergonomic, typed, no magic.
3. **\`anchor-lang\` macros** — \`#[program]\`, \`#[derive(Accounts)]\`, \`#[account(...)]\`. Maximum ergonomics, opinionated defaults, generated boilerplate. The deepest abstraction.

This track teaches the bottom two. If you understand them, you can debug the third when its defaults betray you.

---

## §1.6  Recap + verify yourself

### Recap diagram

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                       Solana Account                            │
│                                                                 │
│   lamports     : u64       ← only owner program may decrement   │
│   data         : Vec<u8>   ← only owner program may write       │
│   owner        : Pubkey    ← set at creation, changed by Assign │
│   executable   : bool      ← one-way: false → true → forever ro │
│   rent_epoch   : u64       ← legacy; u64::MAX = rent-exempt     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Account creation (System program):

  payer ──signs──┐
                 ▼
          CreateAccount { lamports, space, owner }
                 │
                 ▼
  new ──signs────┤  ← signature proves keypair control
                 ▼
       runtime: allocate \`space\` bytes of zeros,
                transfer \`lamports\` from payer to new,
                set new.owner = \`owner\`
\`\`\`

### Three things to verify yourself

1. **Owner check.** After running the script, run \`solana account <market_pubkey>\`. Confirm the \`Owner\` line is \`11111111111111111111111111111111\` (System). Our script asks for this at \`main.rs:69\` and the runtime obeys.
2. **Rent exemption math.** Run \`solana rent 256\`. The output should match what the script printed for \`rent lamports\`. Both come from the same formula at [\`solana-rent-2.2.1/src/lib.rs:93\`](#) — one via local computation, one via RPC.
3. **Layout offsets.** Open \`crates/state/src/lib.rs:43–56\` and add up the field sizes by hand. Confirm \`quote_mint\` starts at byte 80 and \`_reserved\` ends at byte 256. Run \`cargo test -p openhl-state\` to have the compiler confirm it too — the \`market_size_is_256_bytes\` test at \`lib.rs:67–70\` would fail if any field changed size.

---

## Hook into Chapter 2

You now have an account on-chain. You know exactly what its five fields contain. You know that the data field is 256 zero bytes, that the System program owns those bytes, and that — because no System instruction writes arbitrary data — those bytes will stay zero forever unless ownership changes.

To take ownership, we need a Solana program of our own. Not an Anchor program: a program built from \`entrypoint!\`, \`&[AccountInfo]\`, and a hand-written instruction dispatcher. Chapter 2 builds that program, deploys it to the same validator, and uses it to (a) take ownership of the account and (b) write the \`MARKET_DISCRIMINATOR\` bytes at offset 0.

When the script for Chapter 2 finishes, the same hex dump will start with \`4d 41 52 4b 45 54 00 00\` instead of \`00 00 00 00 00 00 00 00\`. That eight-byte change is the entire visible result of building your first program — and the invisible result is that you will understand what every Anchor program does the moment it deserializes its accounts.
`,
                },
                {
                  title: "Chapter 2 — Writing a Native Program Without Anchor",
                  slug: "solana-internals-ch02-native-program-en",
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 45,
                  xpReward: 100,
                  content: `# Chapter 2 — Writing a Native Program Without Anchor

> Status: draft (v0.1).
> Companion code: \`programs/openhl-core/src/lib.rs\`, \`scripts/init-market/src/main.rs\`.
> Tested against: solana-program 2.3.0, solana-program-entrypoint 2.3.0, solana-account-info 2.3.0, solana-program-error 2.2.2, solana-system-interface 1.0.0.

---

## §2.0  Framing

At the end of Chapter 1 you had an on-chain account: 256 zero bytes, owned by the System program, with no way to change a single bit because System has no "write arbitrary data" instruction. The account was a vessel. The next step is to build the only thing that can fill it.

That thing is a Solana program — but not an Anchor program. In this chapter we write the entire program by hand. One \`lib.rs\`. No \`#[derive(Accounts)]\`. No \`#[program]\`. No Borsh. Just \`entrypoint!\`, \`&[AccountInfo]\`, a manual byte decode, and a \`bytemuck\` cast.

We will:

1. Open \`solana-program-entrypoint\` and see what \`entrypoint!(process_instruction)\` actually expands to.
2. Open \`solana-account-info\` and see what \`AccountInfo\` gives us that \`Account\` from Chapter 1 didn't.
3. Walk every line of \`programs/openhl-core/src/lib.rs\` — the dispatcher, the owner check, the bytemuck cast.
4. Walk every line of \`scripts/init-market/src/main.rs\` — a single client transaction with two instructions, \`System::Assign\` followed by \`openhl-core::Initialize\`.
5. Run it, hex-dump the account, and watch bytes \`[0..8]\` flip from \`00 00 00 00 00 00 00 00\` to \`4d 41 52 4b 45 54 00 00\` — the eight-byte payoff of building your first Solana program.
6. Enumerate exactly what \`#[program]\` + \`#[derive(Accounts)]\` would have generated for us.

By the end you will be able to read any Anchor program's expansion (\`cargo expand\`) and identify which generated function corresponds to which line you wrote here. The cost is paying attention to about 160 lines of Rust. The benefit is permanent.

---

## §2.1  \`entrypoint!\` and \`process_instruction\` — the program ABI

Every Solana program is a \`.so\` file with a single exported C function: \`entrypoint\`. The Solana loader calls into it with a pointer to a serialized buffer containing the program ID, the accounts, and the instruction data. The macro \`entrypoint!\` wraps this ABI in a Rust-friendly facade.

Open \`solana-program-entrypoint-2.3.0/src/lib.rs:127–142\`:

\`\`\`rust
#[macro_export]
macro_rules! entrypoint {
    ($process_instruction:ident) => {
        /// # Safety
        #[no_mangle]
        pub unsafe extern "C" fn entrypoint(input: *mut u8) -> u64 {
            let (program_id, accounts, instruction_data) = unsafe { $crate::deserialize(input) };
            match $process_instruction(program_id, &accounts, instruction_data) {
                Ok(()) => $crate::SUCCESS,
                Err(error) => error.into(),
            }
        }
        $crate::custom_heap_default!();
        $crate::custom_panic_default!();
    };
}
\`\`\`

Fifteen lines. That is the entire macro. It does four things:

1. Exports a \`no_mangle extern "C" entrypoint\` function so the loader can find it by name.
2. Calls \`$crate::deserialize(input)\` to unpack the loader's binary input into \`(program_id, accounts, instruction_data)\` — a \`&Pubkey\`, a \`Vec<AccountInfo>\`, and a \`&[u8]\`.
3. Forwards those three things to *your* function (the identifier passed in).
4. Converts your \`Result<(), ProgramError>\` back into the \`u64\` exit code the loader expects (\`0\` for success, an encoded error for failure).

That is all. There is no router, no middleware, no extension point. Whatever Rust function you name in \`entrypoint!($fn)\` is the single point through which the entire chain talks to your program.

Our invocation is at \`programs/openhl-core/src/lib.rs:25–26\`:

\`\`\`rust
#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);
\`\`\`

The \`cfg\` gate lets us conditionally drop the entrypoint when the crate is linked into a host binary (our client, our tests, anything that wants the types but not the BPF entrypoint). The \`init-market\` client crate enables \`no-entrypoint\`, so the program's types are linked in but the BPF entrypoint is not — preventing a name collision with the client's own \`main\`.

Our \`process_instruction\` follows the standard signature, \`lib.rs:33–37\`:

\`\`\`rust
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
\`\`\`

The signature is fixed by \`entrypoint!\`. You cannot add parameters, take different argument types, or return a different result. \`ProgramResult\` is just \`Result<(), ProgramError>\` — see \`solana-program-error-2.2.2/src/lib.rs:28\`:

\`\`\`rust
pub type ProgramResult = std::result::Result<(), ProgramError>;
\`\`\`

\`ProgramError\` itself is a 24-variant enum (\`src/lib.rs:33–63\`) covering every standard failure mode: \`IncorrectProgramId\`, \`NotEnoughAccountKeys\`, \`InvalidAccountData\`, \`AccountAlreadyInitialized\`, and so on. You can also raise \`ProgramError::Custom(u32)\` for program-defined errors with your own numeric codes.

**What Anchor hides:** Anchor's \`#[program]\` macro generates a function with this exact signature. Anchor's "instructions" — the handler functions you write — are NOT the entrypoint. They are functions Anchor dispatches *into*, after its own generated \`process_instruction\` has unpacked the instruction data, looked up the discriminator, deserialized accounts, and routed to the right handler. You don't see this code because the macro generates it. But it exists, and it has the same shape as what we just wrote.

> **Exercise §2.1.** Build the program with \`cargo build-sbf --manifest-path programs/openhl-core/Cargo.toml\`. Inspect \`target/deploy/openhl_core.so\` with \`nm\` (or \`objdump\`) and find the exported \`entrypoint\` symbol. Confirm it's the only \`T\` (text/code) symbol with external linkage.

---

## §2.2  \`AccountInfo\` — what your program actually sees

In Chapter 1 we worked with \`Account\` — the type returned by \`RpcClient::get_account\`. It owned its \`data: Vec<u8>\`. On-chain, your program sees a different type: \`AccountInfo\`.

Open \`solana-account-info-2.3.0/src/lib.rs:19–39\`:

\`\`\`rust
/// Account information
#[derive(Clone)]
#[repr(C)]
pub struct AccountInfo<'a> {
    /// Public key of the account
    pub key: &'a Pubkey,
    /// The lamports in the account.  Modifiable by programs.
    pub lamports: Rc<RefCell<&'a mut u64>>,
    /// The data held in this account.  Modifiable by programs.
    pub data: Rc<RefCell<&'a mut [u8]>>,
    /// Program that owns this account
    pub owner: &'a Pubkey,
    /// The epoch at which this account will next owe rent
    pub rent_epoch: u64,
    /// Was the transaction signed by this account's public key?
    pub is_signer: bool,
    /// Is the account writable?
    pub is_writable: bool,
    /// This account's data contains a loaded program (and is now read-only)
    pub executable: bool,
}
\`\`\`

Compare this to \`Account\` (Chapter 1, \`solana-account-2.2.1/src/lib.rs:44–56\`):

| \`Account\` | \`AccountInfo\` |
|---|---|
| \`lamports: u64\` | \`lamports: Rc<RefCell<&'a mut u64>>\` |
| \`data: Vec<u8>\` | \`data: Rc<RefCell<&'a mut [u8]>>\` |
| \`owner: Pubkey\` | \`owner: &'a Pubkey\` |
| \`executable: bool\` | \`executable: bool\` |
| \`rent_epoch: Epoch\` | \`rent_epoch: u64\` |
| — | \`key: &'a Pubkey\` |
| — | \`is_signer: bool\` |
| — | \`is_writable: bool\` |

Two things changed; three things were added.

The **changes** are about ownership and mutability. The loader hands your program a *view* into a buffer it controls — your program does not own the lamport count or the data bytes. They are someone else's memory; you get a \`Rc<RefCell<&mut _>>\` borrow so multiple \`AccountInfo\` references (from different instructions in the same transaction) can coexist while still enforcing borrow rules at runtime. The \`Rc\` is because the loader hands you the same \`AccountInfo\` for the same pubkey across multiple instructions; the \`RefCell\` is because Rust's borrow checker cannot statically prove the borrow rules in this setting.

The **additions** are runtime-only information that doesn't exist for \`Account\`:

- **\`key\`** — the pubkey of the account itself. \`Account\` doesn't carry its own pubkey; the pubkey is the index into the on-chain account map. \`AccountInfo\` does carry it, because programs routinely need to compute things from it (PDA derivation, account-to-program mapping).
- **\`is_signer\`** — whether this account signed the *outer transaction*. The runtime sets this per-AccountInfo per-instruction.
- **\`is_writable\`** — whether the transaction marked this account writable. Even if your program could write to it (owner = you, size big enough), if the transaction didn't mark it writable, the write will fail at commit.

These three are how the runtime tells your program *about* the transaction it's running in. You did not put them there; the loader did.

**What Anchor hides:** Anchor's typed account wrappers (\`Account<'info, T>\`, \`Signer<'info>\`, \`UncheckedAccount<'info>\`, etc.) all hold an \`AccountInfo\` internally — visible as \`to_account_info()\`. The wrappers add type-level checks (deserialization, signer requirement, etc.) on top, but the underlying value is the same \`AccountInfo\`. When you see \`let info = ctx.accounts.market.to_account_info();\` in Anchor code, you are reaching through the abstraction to the layer we work with directly.

> **Exercise §2.2.** In our \`process_initialize\` (\`lib.rs:79–81\`), we use \`accounts.first()\` to get the market account. We do *not* check \`is_writable\`. Why not? (Hint: what error code would the runtime return if a non-writable account were passed and we tried to call \`try_borrow_mut_data\`?)

---

## §2.3  Owner check — the most important line in your program

We accept an account and call it a "market." How do we *know* it's actually our market and not, say, a random rent-exempt 256-byte account someone built that happens to look the right shape?

The answer — the only answer — is the **owner check**. From \`programs/openhl-core/src/lib.rs:83–94\`:

\`\`\`rust
// (1) Owner check. The single most-skipped check in Solana programs,
// and the source of most "but I checked the pubkey!" exploits. The
// *only* thing that proves an account is one of ours is that we own
// it. If owner is something else, the bytes inside could mean anything.
if market_ai.owner != program_id {
    msg!(
        "initialize: market owner {} != program {}",
        market_ai.owner,
        program_id
    );
    return Err(ProgramError::IncorrectProgramId);
}
\`\`\`

The runtime guarantee from Chapter 1: only the owner program may write to an account's \`data\`. The contrapositive: if \`owner == program_id\`, then *we* are the only program that could have written those bytes. The discriminator at offset 0 is either zero (the account exists but is uninitialized) or \`MARKET_DISCRIMINATOR\` (we initialized it). It cannot be anything else, because no other program would write to it.

Without this check, an attacker could:

1. Allocate a 256-byte account owned by *their* program.
2. Write whatever bytes they want to \`data[0..256]\`.
3. Pass that account to our \`Initialize\`.
4. Pass through every other check (size is 256, discriminator is whatever they set it to, payload decodes fine).
5. Our program would happily overwrite the bytes — but the *next* check of the discriminator would see whatever the attacker had set, not what we set. Worse, in later chapters when this same account is fed into \`place_order\`, we would trust its bytes implicitly.

Owner check is what turns "256 bytes the right shape" into "256 bytes I wrote." Skip it and you skip the security model.

The size check (\`lib.rs:99–106\`) comes second, but it's mechanical — \`bytemuck::from_bytes_mut::<Market>(buf)\` would panic if the buffer were too small, so we reject explicitly with a clean error code. The already-initialized check (\`lib.rs:111–117\`) comes third — if discriminator is non-zero, this account is already a live \`Market\` and we must not stomp it.

**What Anchor hides:** Anchor's \`#[account(mut)]\` constraint and the typed \`Account<'info, T>\` wrapper perform the owner check for you. Specifically: when Anchor deserializes \`Account<'info, MyType>\`, it asserts \`account.owner == program_id\` before returning the typed view. If the check fails, your handler is never called. This is genuinely safer than asking you to remember — but it also means many Anchor developers never internalize *why* the check exists. Read your Anchor code and find the owner check. It's there. It's just invisible.

> **Exercise §2.3.** Modify \`process_initialize\` to deliberately skip the owner check (comment out lines 87–94). Rebuild. Construct a transaction that passes a System-owned account (the one Chapter 1's allocator created, *without* the Assign step we'll add in §2.5) to \`Initialize\`. Run it. What happens? Why?

---

## §2.4  Writing data — \`try_borrow_mut_data\` + \`bytemuck\` cast

\`AccountInfo::data\` is a \`Rc<RefCell<&'a mut [u8]>>\`. To get a writable slice out, you call \`try_borrow_mut_data()\`. From \`programs/openhl-core/src/lib.rs:147–148\`:

\`\`\`rust
let mut data = market_ai.try_borrow_mut_data()?;
let market: &mut Market = bytemuck::from_bytes_mut(&mut data[..Market::LEN]);
\`\`\`

Two operations:

1. **\`try_borrow_mut_data()\`** — fallible because the \`RefCell\` may already be borrowed. The error case is \`ProgramError::AccountBorrowFailed\`. This would happen if the same \`AccountInfo\` were borrowed mutably elsewhere in the call stack (e.g., a CPI handler re-entering with the same account). For a leaf write like ours it never fails in practice — but using the \`?\` operator makes the program correct under any future use that might double-borrow.

2. **\`bytemuck::from_bytes_mut::<Market>(buf)\`** — a pointer cast from \`&mut [u8]\` to \`&mut Market\`. This is safe *only* because \`Market\` is \`Pod\`: all-bits-valid, no padding, \`repr(C)\`. We verified the buffer is exactly \`Market::LEN\` bytes back at the size check (§2.3), so the cast is well-defined. The \`&mut [u8]\` becomes a \`&mut Market\` view over the same bytes — no copy, no allocation, just type reinterpretation.

After the cast, we write each field by name (\`lib.rs:150–159\`):

\`\`\`rust
market.discriminator = MARKET_DISCRIMINATOR;
market.version = Market::VERSION;
market.bump = 0;
market._pad0 = [0u8; 6];
market.authority = authority;
market.base_mint = base_mint;
market.quote_mint = quote_mint;
market.tick_size = tick_size;
market.lot_size = lot_size;
market._reserved = [0u8; 128];
\`\`\`

These writes happen *in place* in the account's data buffer. There is no "save" call. When \`process_instruction\` returns \`Ok(())\`, the loader sees the modified bytes and commits them to the ledger as part of the transaction.

Notice the explicit \`_pad0\` and \`_reserved\` zero-writes. They're not required (the bytes were already zero from System's allocator, and bytemuck doesn't add padding because we did) — but writing them anyway makes the code robust if the account were ever reused with non-zero padding from earlier state. For a brand-new account this is paranoia. For a \`realloc\`'d account it would matter.

**What Anchor hides:** Anchor's typed wrapper exposes \`account.fieldname = value;\` directly, no \`try_borrow_mut_data\` call needed. The wrapper holds the \`RefMut\` internally and flushes back to the account on \`Drop\`. It also writes the 8-byte discriminator for you on \`init\` — at the cost of every account having Anchor's own discriminator format (the first 8 bytes of \`sha256("account:TypeName")\`) rather than something human-readable like our \`MARKET\\0\\0\`.

> **Exercise §2.4.** Change \`market.discriminator = MARKET_DISCRIMINATOR;\` to write a single byte at offset 0 instead (e.g., \`data[0] = 0x42;\`). What error code do you get when you next run \`init-market\`? Why is it that error and not a corruption?

---

## §2.5  The client side — \`Assign\` + \`Initialize\` in one transaction

The account Chapter 1 created is owned by System. Our program can't write to it yet — the owner check would fail. To take ownership we need a \`System::Assign\` instruction, signed by the market keypair itself.

From \`scripts/init-market/src/main.rs:117–146\`:

\`\`\`rust
// (1) System::Assign — transfer ownership to our program.
let assign_ix = system_instruction::assign(&market.pubkey(), &program_id);

// (2) openhl-core::Initialize — see programs/openhl-core/src/lib.rs.
let mut init_data = Vec::with_capacity(1 + 32 + 32 + 32 + 8 + 8);
init_data.push(0u8); // tag = Initialize
init_data.extend_from_slice(authority.as_ref());
init_data.extend_from_slice(base_mint.as_ref());
init_data.extend_from_slice(quote_mint.as_ref());
init_data.extend_from_slice(&cli.tick_size.to_le_bytes());
init_data.extend_from_slice(&cli.lot_size.to_le_bytes());

let init_ix = Instruction {
    program_id,
    accounts: vec![AccountMeta::new(market.pubkey(), false)],
    data: init_data,
};

let blockhash = client.get_latest_blockhash().context("fetch blockhash")?;
let tx = Transaction::new_signed_with_payer(
    &[assign_ix, init_ix],
    Some(&payer.pubkey()),
    &[&payer, &market],
    blockhash,
);
\`\`\`

Three things worth pausing on.

**Why \`Assign\` needs the market to sign.** Open \`solana-system-interface-1.0.0/src/instruction.rs:621–628\`:

\`\`\`rust
pub fn assign(pubkey: &Pubkey, owner: &Pubkey) -> Instruction {
    let account_metas = vec![AccountMeta::new(*pubkey, true)];
    // ...
}
\`\`\`

The \`true\` on \`AccountMeta::new(*pubkey, true)\` means **signer required**. Just like \`CreateAccount\` in Chapter 1, the runtime demands proof that whoever currently controls this account (the keypair that owns the pubkey) consents to the ownership change. Otherwise anyone could "steal" any rent-exempt System-owned account by reassigning it to a program they control.

**Why the two instructions are in one transaction.** Transactions are atomic: either all instructions commit or none do. By bundling \`[Assign, Initialize]\` in a single transaction, there is no observable state where openhl-core owns an uninitialized 256-zero-byte market. From the outside the account flips directly from "System-owned + zero data" to "openhl-core-owned + initialized data." This matters because in later chapters, the same atomicity will protect us from partial-update bugs where someone reads a half-initialized account.

**Why \`AccountMeta::new(market.pubkey(), false)\` for the init instruction.** The market account *is* writable (we'll mutate its data) — but it doesn't need to sign the *Initialize* instruction. The signature requirement is per-instruction, not per-transaction. Assign needs the market keypair signature (the System program enforces this); Initialize does not (our program enforces only an owner check, not a signer check). Different security models, different \`is_signer\` flags.

The \`&[&payer, &market]\` at the bottom lists transaction-level signers. The transaction collects them once; each instruction's \`AccountMeta\` then declares which of those signers are required for that specific instruction.

> **Exercise §2.5.** Run \`init-market\` against \`solana-test-validator\` (after deploying \`openhl_core.so\`). Re-run \`init-market\` against the *same* market account. What error do you get on the second run? Trace it back: which check in \`process_initialize\` rejects you?

---

## §2.6  What \`#[program]\` and \`#[derive(Accounts)]\` actually generate

In Chapter 1's §1.5 we walked through \`#[account(init, ...)]\`. This chapter the equivalent expansion is larger — the entire \`#[program]\` + \`#[derive(Accounts)]\` pair. Pulling it together:

| Anchor does | We spelled it out as |
|---|---|
| generates the \`entrypoint!\` invocation | \`lib.rs:25–26\` |
| generates a \`process_instruction\` that decodes the 8-byte discriminator | \`lib.rs:38–48\` (we use a 1-byte tag) |
| generates per-handler dispatch (one match arm per \`#[program]\` fn) | \`lib.rs:42–48\` |
| deserializes accounts into the typed \`Accounts\` struct, enforcing each constraint (\`#[account(mut)]\`, \`#[account(signer)]\`, etc.) | \`lib.rs:79–117\` (owner check, size check, already-init check) |
| asserts \`account.owner == program_id\` for every \`Account<'info, T>\` | \`lib.rs:87–94\` |
| deserializes instruction data into the handler's argument struct via Borsh | \`lib.rs:119–135\` (manual byte decode) |
| calls your handler function with the typed args | \`lib.rs:65–162\` (our handler is \`process_initialize\`) |
| serializes the modified \`Account<'info, T>\` back into the account data on \`Drop\` | \`lib.rs:147–159\` (we write in place) |
| converts any returned \`Result<(), Error>\` into the loader's \`u64\` exit code | inherited from \`entrypoint!\` itself |

Eight responsibilities. Anchor handles all of them via macro generation; we handled them in ~130 lines of Rust. Neither approach is wrong. The point is that **every one of those responsibilities exists** — the macro hides them, but they don't go away.

When an Anchor program misbehaves — wrong account passed, signer not enforced, discriminator collision, unexpected serialization layout — you debug it by mentally re-tracing this list and asking which step went wrong. Knowing the list is the difference between debugging Anchor confidently and guessing.

---

## §2.7  Recap + verify yourself

### Recap diagram

\`\`\`
Transaction
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  Instruction[0]: System::Assign                                │
│    accounts: [market (WRITE, SIGNER)]                          │
│    data:     SystemInstruction::Assign { owner: program_id }   │
│    effect:   market.owner: System → openhl_core                │
│                                                                │
│  Instruction[1]: openhl_core::Initialize                       │
│    accounts: [market (WRITE)]                                  │
│    data:     [tag=0, authority, base_mint, quote_mint,         │
│               tick_size, lot_size]                             │
│    effect:   market.data[0..256] = initialized Market layout   │
│                                                                │
│  signers: [payer, market]                                      │
│                                                                │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
   atomic commit: either both instructions apply, or neither
\`\`\`

### Three things to verify yourself

1. **Discriminator flipped.** After running \`init-market\`, the hex dump should start with \`4d 41 52 4b 45 54 00 00\` (= "MARKET\\0\\0"). Run \`init-market\` and confirm. Compare against Chapter 1's all-zero output — these eight bytes are the entire visible result of writing a Solana program.
2. **Owner changed.** Run \`solana account <market_pubkey>\` after \`init-market\`. The \`Owner\` line should now show your deployed \`openhl-core\` program ID, not \`11111111111111111111111111111111\`. The \`Assign\` instruction did this; the \`Initialize\` instruction depended on it.
3. **Re-run rejected.** Run \`init-market\` a second time against the same market. The transaction should fail. Trace the on-chain logs (\`solana logs --include-failed\`) and find the \`initialize: market already initialized\` message from \`lib.rs:114\`. The already-initialized check at \`lib.rs:111–117\` is what rejected you.

---

## Hook into Chapter 3

You can now create accounts and own them. But you cannot yet *create accounts whose addresses are derived from your program* — every account in Chapters 1 and 2 was identified by an ad-hoc keypair generated client-side. That works for single-account demos and breaks for everything else: how do you find the market account for a given \`(base_mint, quote_mint)\` pair next time without storing the keypair somewhere off-chain? How does a user's position account stay tied to their wallet without you tracking the mapping in a database?

The answer is Program-Derived Addresses (PDAs) — pubkeys mathematically derived from seeds + your program ID, with no corresponding private key. Chapter 3 walks the derivation by hand, shows how \`invoke_signed\` lets your program "sign" for a PDA it owns, and replaces the \`Keypair::new()\` from Chapter 1 with a \`find_program_address(&[b"market", base_mint.as_ref(), quote_mint.as_ref()], program_id)\` derivation.

When Chapter 3 finishes, the same market will live at a *predictable* address. Any client that knows the base and quote mints can recompute it without external state — which is what makes Solana programs composable.
`,
                },
                {
                  title: "Chapter 3 — PDAs from First Principles",
                  slug: "solana-internals-ch03-pdas-en",
                  type: 'CONTENT',
                  sortOrder: 2,
                  duration: 45,
                  xpReward: 100,
                  content: `# Chapter 3 — PDAs from First Principles

> Status: draft (v0.1).
> Companion code: \`programs/openhl-core/src/lib.rs\` (the \`process_create_market\` handler), \`scripts/create-market/src/main.rs\`.
> Tested against: solana-pubkey 2.4.0, solana-cpi 2.2.1, solana-system-interface 1.0.0, solana-program 2.3.0.

---

## §3.0  Framing

In Chapters 1 and 2 every account we touched was identified by an *ad-hoc* keypair — a \`Keypair::new()\` generated client-side, used to sign the create/assign transactions, then discarded. That works for a single-account demo. It does not work for anything else.

Consider how a user, three weeks from now, looks up the market account for \`(SOL, USDC)\`. They didn't make the market; they don't have its keypair. There is no on-chain registry of "all markets" to scan. The only way to find the account is for the program to **dictate** where it lives — to derive its address from the parameters that identify it (\`base_mint\`, \`quote_mint\`, the program ID) in a way that anyone can recompute. Pubic key derivation, with no corresponding private key, attached to your program.

That is a Program-Derived Address (PDA). In this chapter we will:

1. Open \`solana-pubkey\` and read the PDA derivation algorithm — sha256 of seeds + program ID + a special marker, plus a one-byte "bump" to push the result off the ed25519 curve.
2. Walk \`find_program_address\` (and its sibling \`create_program_address\`) line by line, understanding why one iterates and the other doesn't.
3. Open \`solana-cpi\` and read \`invoke_signed\`. See how a program "signs" for a PDA it controls by passing the seeds back through to the runtime.
4. Walk our new \`process_create_market\` handler: derive the PDA, validate the caller passed the right account, CPI to System to allocate it, write the layout, store the bump.
5. Watch a single transaction replace Chapter 2's two-step \`[Assign, Initialize]\` flow.
6. Re-run the client with the same \`(base_mint, quote_mint)\` and watch the System program reject the duplicate creation — the address is fixed.

By the end you will be able to look at any Anchor \`#[account(init, seeds = [...], bump)]\` constraint and walk the whole derivation, CPI, and signature dance it expands to. You will also understand why so many PDA exploits begin with "the program forgot to verify that the passed account matched the derived PDA."

---

## §3.1  The PDA algorithm

A regular Solana public key is a 32-byte point on the ed25519 elliptic curve. It has a corresponding private key, and that private key is what signs transactions. PDAs are deliberately *not* points on the curve — they are 32-byte hashes that happen to lie *off* the curve, which means no ed25519 private key can produce a signature for them. They can never be used to sign a transaction client-side. Only the program that derived them can authorize their use, via \`invoke_signed\`.

The algorithm lives in \`solana-pubkey-2.4.0/src/lib.rs:911–958\`. The hash construction itself is at line 928–933:

\`\`\`rust
let mut hasher = solana_sha256_hasher::Hasher::default();
for seed in seeds.iter() {
    hasher.hash(seed);
}
hasher.hashv(&[program_id.as_ref(), PDA_MARKER]);
let hash = hasher.result();
\`\`\`

Three inputs go into the hash:

1. **Each seed**, fed in concatenation order.
2. **The program ID** (32 bytes).
3. **\`PDA_MARKER\`**, a 21-byte constant defined at \`lib.rs:52\`:
   \`\`\`rust
   const PDA_MARKER: &[u8; 21] = b"ProgramDerivedAddress";
   \`\`\`

The marker is what stops anyone from constructing a *normal* keypair whose public key happens to collide with a PDA. Since real ed25519 keys are not generated by hashing \`b"ProgramDerivedAddress"\` after their seed material, a PDA can never be mistaken for an ordinary key.

After hashing, the 32-byte digest is checked against the curve at \`lib.rs:935–937\`:

\`\`\`rust
if bytes_are_curve_point(hash) {
    return Err(PubkeyError::InvalidSeeds);
}
\`\`\`

If the hash happens to land on the ed25519 curve, it is rejected — because such an address *could* in principle be signed for by some private key (statistical chance: 50%), and the whole point of a PDA is that no one can sign for it except its derived program. About half of all candidate seed combinations land on the curve and are rejected.

The runtime also enforces two structural limits, at \`lib.rs:45–47\`:

\`\`\`rust
pub const MAX_SEED_LEN: usize = 32;
// ...
pub const MAX_SEEDS: usize = 16;
\`\`\`

At most 16 seeds, each at most 32 bytes. These limits are big enough that you will never hit them in normal use; they exist to bound the worst-case syscall cost.

**What the SDK hides:** Anchor's \`seeds = [b"market", base_mint.key().as_ref(), quote_mint.key().as_ref()]\` constraint passes its seed array directly to this same algorithm at codegen time. The constraint also writes a \`bump\` field on your struct, which is the same byte we'll see in §3.2 — Anchor just hides where it came from.

> **Exercise §3.1.** What happens if you pass an empty seed list to \`create_program_address\`? Look at the function start. The behavior is intentional but easy to miss.

---

## §3.2  \`find_program_address\` vs \`create_program_address\` — the bump iteration

About half of arbitrary seed inputs land on the curve and fail. So how do you find a valid PDA for a given seed set? You append a one-byte counter (the **bump**), starting at 255, and try \`create_program_address\` with \`seeds || [bump]\`, decrementing the bump until you find one that produces an off-curve hash. That is \`find_program_address\`.

From \`solana-pubkey-2.4.0/src/lib.rs:823–862\` (off-chain path):

\`\`\`rust
pub fn try_find_program_address(seeds: &[&[u8]], program_id: &Pubkey) -> Option<(Pubkey, u8)> {
    #[cfg(not(target_os = "solana"))]
    {
        let mut bump_seed = [u8::MAX];
        for _ in 0..u8::MAX {
            {
                let mut seeds_with_bump = seeds.to_vec();
                seeds_with_bump.push(&bump_seed);
                match Self::create_program_address(&seeds_with_bump, program_id) {
                    Ok(address) => return Some((address, bump_seed[0])),
                    Err(PubkeyError::InvalidSeeds) => (),
                    _ => break,
                }
            }
            bump_seed[0] -= 1;
        }
        None
    }
    // (target_os = "solana" branch delegates to sol_try_find_program_address syscall)
}
\`\`\`

The function tries 255, 254, 253, ... until one works. The "canonical bump" is the *highest* such value — the first one tried — because both clients and the program should derive the same PDA, and "highest valid bump" is a unique deterministic answer.

For seeds whose first valid bump is 255 (very common), the loop runs once. For unlucky seed combinations the loop might run several times, paying ~1,500 CU per iteration on-chain. To avoid that cost on every CPI, programs **store the bump** in their account data the first time \`find_program_address\` succeeds — and use \`create_program_address(seeds || stored_bump)\` from then on, which never iterates. This is exactly what \`process_create_market\` does at \`lib.rs:312\`:

\`\`\`rust
market.bump = bump;
\`\`\`

\`create_program_address\`, by contrast, takes a fully-specified seed list and either succeeds or fails. It is the right tool for *verification* (cheap, deterministic) but the wrong tool for *discovery* (it doesn't know what bump to try). Use \`find_program_address\` once to discover and store; use \`create_program_address\` thereafter to verify.

**What the SDK hides:** Anchor's \`bump\` constraint stores the bump for you on \`init\`, and the \`bump = market.bump\` form on subsequent accesses uses the stored value (no iteration). The optimization is the same as ours; the only thing hidden is where the storage happens.

> **Exercise §3.2.** Pick three seed prefixes (e.g., \`b"market"\`, \`b"position"\`, \`b"vault"\`) and call \`find_program_address(&[prefix, &[0u8; 32], &[0u8; 32]], &your_keypair.pubkey())\` for each in a small Rust test. Record the bump each returns. You'll almost certainly get 255 for at least two of them. Why is 255 so common?

---

## §3.3  \`invoke_signed\` — how a program signs for its PDA

A PDA has no private key. So how does a CPI like \`System::create_account\` — which requires the new account to *sign* — work when the new account is a PDA?

The answer: the *program* signs for the PDA, by submitting the seeds (including the bump) alongside the CPI. The runtime re-derives the PDA from those seeds and the program ID; if the derived address matches the account the CPI is operating on, the runtime accepts the program as the signer.

From \`solana-cpi-2.2.1/src/lib.rs:251–273\`:

\`\`\`rust
pub fn invoke_signed(
    instruction: &Instruction,
    account_infos: &[AccountInfo],
    signers_seeds: &[&[&[u8]]],
) -> ProgramResult {
    // ...
    invoke_signed_unchecked(instruction, account_infos, signers_seeds)
}
\`\`\`

The \`signers_seeds\` parameter has type \`&[&[&[u8]]]\` — a slice of seed sets, one per PDA being signed for. Each inner \`&[&[u8]]\` is exactly what you'd pass to \`create_program_address\`.

Our usage at \`programs/openhl-core/src/lib.rs:297–301\`:

\`\`\`rust
invoke_signed(
    &create_ix,
    &[payer_ai.clone(), market_ai.clone(), system_ai.clone()],
    &[&[MARKET_SEED, base_mint.as_ref(), quote_mint.as_ref(), &[bump]]],
)?;
\`\`\`

The seeds we pass to \`invoke_signed\` are the **same seeds we used to derive the PDA**, plus the bump. The runtime hashes them, confirms the result equals \`market_ai.key\`, and treats the program as the signer for that account. The CPI then proceeds as if the market PDA had signed a real ed25519 signature.

A critical invariant: the program ID embedded in the hash is **always the calling program**. You cannot \`invoke_signed\` for a PDA derived from a *different* program's ID. This is what makes PDA ownership program-local — only the program that derived an address can sign for it.

**What the SDK hides:** Anchor's \`init\` constraint generates this exact \`invoke_signed\` call, with the seeds taken from your \`seeds = [...]\` constraint and the bump taken from the \`bump\` storage. The CPI is invisible because the macro generates it, but it is the same line of code.

> **Exercise §3.3.** Modify \`process_create_market\` to call \`invoke_signed\` with the *wrong* bump (e.g., \`bump.wrapping_sub(1)\`). What error do you get? Trace it to a specific check in the runtime.

---

## §3.4  \`process_create_market\` — the program side

We can now walk the program. From \`programs/openhl-core/src/lib.rs:196–321\`. Six numbered steps inside the handler. (1)–(3) cover payload size, signer check, and System-program-identity check — straightforward parameter validation. The interesting work starts at step (4):

\`\`\`rust
// (4) Derive the expected PDA from the payload fields + program_id, and
// verify the caller passed us the right account. This is what binds
// a \`(base_mint, quote_mint)\` pair to a single, predictable address.
let (expected_pda, bump) = Pubkey::find_program_address(
    &[MARKET_SEED, base_mint.as_ref(), quote_mint.as_ref()],
    program_id,
);
if market_ai.key != &expected_pda {
    msg!(
        "create_market: passed market {} != derived PDA {}",
        market_ai.key,
        expected_pda
    );
    return Err(ProgramError::InvalidSeeds);
}
\`\`\`

The \`market_ai.key != &expected_pda\` check is what makes the whole construction safe. Without it, the program would happily try to operate on whatever account the caller passed in slot 1 — and \`invoke_signed\`'s seed-vs-key check would catch the mismatch later, but with a less helpful error. The explicit verification fails fast with a clean message.

There is a subtlety here: in \`process_create_market\` we always call \`find_program_address\` (the iterating version), even though we have a cheap alternative. Why not use \`create_program_address(seeds || [bump])\` with a client-provided bump? Because the account doesn't exist yet — there's no on-chain \`market.bump\` to read. The client could pass the bump in the instruction data, but then the program would have to trust it and re-validate. \`find_program_address\` here is paying ~1500 CU once at creation; subsequent operations on this market (in later chapters) will read \`market.bump\` from the account and use \`create_program_address\` for free.

Step (5) is the CPI we covered in §3.3 — \`invoke_signed\` with the bump as the last seed. Step (6) writes the Market layout, identical to Chapter 2's \`process_initialize\` except for one new line at \`lib.rs:312\`:

\`\`\`rust
market.bump = bump;
\`\`\`

The bump is now persisted in the account itself. Any future instruction that touches this market — \`place_order\`, \`cancel\`, \`settle\` — will read \`market.bump\` and use \`create_program_address\` for free verification.

> **Exercise §3.4.** Remove the explicit PDA verification (the \`if market_ai.key != &expected_pda\` block). Build and deploy. Construct a \`CreateMarket\` transaction passing a fresh \`Keypair::new()\` as the market account instead of the PDA. What error does the runtime surface? Why is the explicit check still worth keeping?

---

## §3.5  The client — one instruction, no market keypair

The client side simplifies dramatically. From \`scripts/create-market/src/main.rs\`:

\`\`\`rust
let (market_pda, bump) = Pubkey::find_program_address(
    &[MARKET_SEED, base_mint.as_ref(), quote_mint.as_ref()],
    &program_id,
);
// ...
let ix = Instruction {
    program_id,
    accounts: vec![
        AccountMeta::new(payer.pubkey(), true),
        AccountMeta::new(market_pda, false),
        AccountMeta::new_readonly(system_program::ID, false),
    ],
    data,
};

let tx = Transaction::new_signed_with_payer(
    &[ix],
    Some(&payer.pubkey()),
    &[&payer],
    blockhash,
);
\`\`\`

Compare to Chapter 2's \`init-market\`, which needed:

- A market \`Keypair::new()\` generated client-side
- Two instructions: \`[System::Assign, openhl-core::Initialize]\`
- Two signers: \`[&payer, &market]\`

Chapter 3's version has:

- A market *PDA* derived from the seeds (no keypair, no secret)
- One instruction: \`openhl-core::CreateMarket\`
- One signer: \`[&payer]\`

The market account is marked \`AccountMeta::new(market_pda, false)\` — writable but not a signer. There is no keypair to sign with. The signing happens inside the program when \`invoke_signed\` provides the seeds.

The \`MARKET_SEED\` constant the client uses is imported from the program crate itself, at \`scripts/create-market/Cargo.toml\`:

\`\`\`toml
openhl-core = { path = "../../programs/openhl-core", features = ["no-entrypoint"] }
\`\`\`

With the \`no-entrypoint\` feature, the program's types and constants are available to host binaries without the BPF entrypoint coming along. The client uses \`openhl_core::MARKET_SEED\` — guaranteeing client and program agree on the seed prefix without copy-paste.

> **Exercise §3.5.** Run \`create-market\` twice with the same \`--base-mint\` and \`--quote-mint\`. The second run will fail. The error returned by the validator will mention the System program. Find it in the System program source (\`solana-system-interface-1.0.0/src/error.rs\`) and identify the variant.

---

## §3.6  What \`#[account(init, seeds = [...], bump)]\` actually generates

Anchor's PDA flavor of the \`init\` constraint expands to all of the work we did in this chapter, plus the work we did in Chapters 1 and 2. The correspondence:

| Anchor does | We spelled it out as |
|---|---|
| reads \`seeds = [...]\` from the attribute | \`process_create_market\` decodes them from the payload (\`lib.rs:235–251\`) |
| calls \`find_program_address(seeds, program_id)\` to get bump | \`lib.rs:268–271\` |
| stores the bump in the typed \`Account<T>\` so subsequent accesses are cheap | \`market.bump = bump;\` at \`lib.rs:312\` |
| asserts \`passed_account.key == derived_pda\` | \`lib.rs:272–279\` (explicit check) |
| calls \`Rent::get()?.minimum_balance(space)\` | \`lib.rs:289\` |
| builds \`system_instruction::create_account(payer, pda, lamports, space, program_id)\` | \`lib.rs:290–296\` |
| calls \`invoke_signed(create_ix, accounts, &[seeds || bump])\` | \`lib.rs:297–301\` |
| writes Anchor's 8-byte discriminator to \`data[0..8]\` | \`market.discriminator = MARKET_DISCRIMINATOR;\` at \`lib.rs:310\` |
| serializes the typed \`Account<T>\` back into the account on \`Drop\` | in-place field writes at \`lib.rs:310–319\` |

Nine responsibilities for PDA-based \`init\`. Anchor expresses them in one attribute; we needed about 60 lines.

There is one thing Anchor does that we do not: it generates a *canonical bump check* on every subsequent access. When you later write \`#[account(seeds = [...], bump = market.bump)]\`, Anchor calls \`create_program_address(seeds || bump)\` and asserts the result equals the passed account's key. This is the cheap verification we mentioned in §3.2 — paid once per access, free of iteration. Our future chapters will need the same check; we just write it by hand each time we touch a market.

---

## §3.7  Recap + verify yourself

### Recap diagram

\`\`\`
Client                                  Program                                  Runtime
──────                                  ───────                                  ───────
find_program_address(           ──┐
  [b"market", base, quote],       │
  program_id) → (pda, bump)       │
                                  ▼
build single ix:                       process_create_market
  accounts: [payer S+W,                  find_program_address(
            pda W,                          [b"market", base, quote],
            system r/o]                     program_id) → (pda, bump)
  data: [tag=1, ...]                     assert market_ai.key == pda
                                         Rent::get().minimum_balance(...)
sign with [payer]                        invoke_signed(
                                           create_account(payer, pda,
send_and_confirm_tx           ─────►       lamports, space, program_id),
                                           accounts,
                                           &[&[b"market", base, quote, [bump]]]
                                         )
                                                                  │
                                                                  ▼
                                                            runtime: hash seeds,
                                                            verify == pda,
                                                            accept program as signer,
                                                            invoke System::create_account
                                         write Market layout (incl. market.bump = bump)
                                         return Ok
\`\`\`

### Three things to verify yourself

1. **Deterministic address.** Run \`create-market\`, note the printed \`market PDA\`. Delete the on-chain account (or use a fresh \`solana-test-validator\`), re-run with the same \`--base-mint\`, \`--quote-mint\`, \`--program\`. The address printed should be byte-identical. Then change the order of \`--base-mint\` and \`--quote-mint\`. The address should change — seed order is part of the derivation.
2. **Bump stored.** After running \`create-market\`, the hex dump should show a non-zero byte at offset 9 (the \`bump\` field). The client prints both the bump it derived and the bump the program wrote — they must match. Confirm with \`scripts/create-market/src/main.rs:163\`.
3. **No private key needed.** Use \`solana account <market_pda>\` and confirm \`Owner\` is your program ID. There is no corresponding entry in \`~/.config/solana/\`, no keypair file anywhere — the address has no private key. This is what makes the PDA permanent: even if someone wanted to compromise it, there's no key to steal.

---

## Hook into Chapter 4

You now have programs that own accounts, and addresses derived from your own seeds rather than ad-hoc keypairs. But you have not yet had to *count*. Every instruction so far has run in well under the Solana per-transaction compute budget — 200,000 compute units (CU) by default, up to 1.4 million if you request more. As soon as we add anything that loops — order book matching, batch settlement, even decoding a non-trivial Borsh structure — CU becomes the first constraint that breaks.

Chapter 4 introduces the compute budget as a real engineering concern. We add CU measurement to our \`Initialize\` instruction (via the \`sol_log_compute_units\` syscall), benchmark what each part costs, walk the heap allocator that programs use to pretend Rust's \`Box\` and \`Vec\` are free, and add a \`place_order\` instruction that has to fit inside a CU envelope. The chapter ends with the question that drives the entire rest of Phase A and B: how do you write an order book matcher that fits inside 200,000 CU?
`,
                },
                {
                  title: "Chapter 4 — Compute Budget and Heap Discipline",
                  slug: "solana-internals-ch04-compute-budget-en",
                  type: 'CONTENT',
                  sortOrder: 3,
                  duration: 45,
                  xpReward: 100,
                  content: `# Chapter 4 — Compute Budget and Heap Discipline

> Status: draft (v0.1).
> Companion code: \`programs/openhl-core/src/lib.rs\` (\`process_bench\` at lines 355–402), \`scripts/bench/src/main.rs\`.
> Tested against: solana-program 2.3.0, solana-program-entrypoint 2.3.0, solana-compute-budget-interface 2.2.2.

---

## §4.0  Framing

So far every instruction we have written has cost roughly the same amount of compute: a few thousand units. The runtime's per-transaction ceiling — 200,000 compute units (CU) by default — has not even been visible. We could afford anything we wrote because we wrote very little.

That free ride ends the moment you do something proportional to anything. A hash inside a loop. A linear scan of an order book. A Borsh decode of a non-trivial struct. Each of these has a CU profile that grows with input, and that profile is the first thing that breaks before any other constraint does.

This chapter is where you learn to count. We will:

1. Open \`solana-program::log\` and read \`sol_log_compute_units\` — the only instrument programs have for measuring themselves at runtime.
2. Open \`solana-program-entrypoint\` and read the \`BumpAllocator\` that backs every program's heap. Understand why \`dealloc\` is a no-op and what that means for \`Vec\` and \`Box\`.
3. Look at the hard limits — 32 KiB default heap, 200,000 default CU, 1.4M CU absolute max — and the constants they live behind.
4. Open \`solana-compute-budget-interface\` and read the \`ComputeBudgetInstruction\` enum that raises the CU ceiling per transaction.
5. Walk the new \`process_bench\` handler, which allocates a heap buffer and iterates sha256 between \`sol_log_compute_units\` brackets so each phase's CU cost is readable.
6. Walk the new \`bench\` client, which optionally prepends a \`set_compute_unit_limit\` and surfaces both the program logs and the runtime's \`units_consumed\` number.

By the end you will be able to predict, before you ship anything, whether an instruction can fit in the default budget — and what to ask for when it cannot.

---

## §4.1  The compute unit and where it comes from

Solana's VM is a sandboxed BPF interpreter. Every instruction executed inside that VM has a fixed compute-unit cost: simple ALU ops cost 1, a hash syscall costs more, a CPI to another program costs more still. The runtime keeps a per-transaction counter, starts it at the limit (default 200,000), and decrements as each operation executes. When it hits zero, the transaction aborts with \`ComputationalBudgetExceeded\`.

These are not real-world milliseconds. They are an abstract economic unit that exists so the runtime can:

1. **Charge for work fairly** — priority fees scale with CU consumed.
2. **Bound transaction execution time** without timing the host clock (which would be non-deterministic across validators).
3. **Make scheduling predictable** — the runtime can decide ahead of time whether a transaction fits in a block.

The default per-transaction limit is 200,000 CU. The maximum a transaction can request is 1,400,000 CU. Both are network constants that have changed over time; they are not in any single Rust file (they live in runtime feature gates), so the right place to look them up is the validator's CLI: \`solana program-buffer-info\` and friends, or the official docs.

What *is* in code, and what programs use to measure themselves, is \`sol_log_compute_units\` at \`solana-program-2.3.0/src/log.rs:92–101\`:

\`\`\`rust
/// Print the remaining compute units available to the program.
#[inline]
pub fn sol_log_compute_units() {
    #[cfg(target_os = "solana")]
    unsafe {
        crate::syscalls::sol_log_compute_units_();
    }
    #[cfg(not(target_os = "solana"))]
    crate::program_stubs::sol_log_compute_units();
}
\`\`\`

A single syscall. It logs the *remaining* CU available at the moment of the call. Subtract two consecutive readings, and you have the cost of the work between them. That is the entire toolkit.

**What the SDK hides:** Anchor does not insert these calls for you. If you want CU measurement in an Anchor program, you must add \`solana_program::log::sol_log_compute_units();\` yourself — exactly as we do here.

> **Exercise §4.1.** Compute the CU cost of a single \`sol_log_compute_units\` call by issuing two in a row in a noop instruction (one line apart). The first reading minus the second is the call's own cost. Most programs treat this as zero in their accounting; in fact it is about a dozen CU.

---

## §4.2  The heap — a bump allocator that never frees

Solana programs run in a fixed-size heap arena. The default size is at \`solana-program-entrypoint-2.3.0/src/lib.rs:40–42\`:

\`\`\`rust
pub const HEAP_START_ADDRESS: u64 = 0x300000000;
// ...
pub const HEAP_LENGTH: usize = 32 * 1024;
\`\`\`

32 kibibytes. That is the total amount of heap memory available for every \`Vec\`, \`Box\`, \`String\`, and \`HashMap\` your program allocates over the course of a single instruction. Run out, and the global allocator returns a null pointer; Rust's allocation-failure handler then aborts the program.

The allocator backing the heap is at \`lib.rs:291–302\`:

\`\`\`rust
pub struct BumpAllocator {
    pub start: usize,
    pub len: usize,
}
\`\`\`

And the \`GlobalAlloc\` impl at \`lib.rs:342–364\`:

\`\`\`rust
unsafe impl std::alloc::GlobalAlloc for BumpAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let pos_ptr = self.start as *mut usize;
        let mut pos = *pos_ptr;
        if pos == 0 {
            pos = self.start + self.len;
        }
        pos = pos.saturating_sub(layout.size());
        pos &= !(layout.align().wrapping_sub(1));
        if pos < self.start + size_of::<*mut u8>() {
            return null_mut();
        }
        *pos_ptr = pos;
        pos as *mut u8
    }
    unsafe fn dealloc(&self, _: *mut u8, _: Layout) {
        // I'm a bump allocator, I don't free
    }
}
\`\`\`

Two things to absorb.

First, **\`dealloc\` is a no-op.** Drop a \`Vec\`, drop a \`Box\`, return from a function — the memory it claimed stays claimed for the rest of the instruction. Every allocation is permanent until the program returns. This is a deliberate trade: a real free-list allocator would cost CU to maintain, and an instruction's lifetime is short enough that fragmentation is bounded by the heap size anyway.

Second, **the bump pointer grows from the end downward** (see \`pos = pos.saturating_sub(layout.size())\`). When \`pos\` falls below the heap base, \`alloc\` returns null and your program panics. In our \`Bench\` we exercise this on purpose — passing \`--heap-bytes 65536\` (twice the heap size) is enough to OOM.

**What the SDK hides:** Anchor never *encourages* you to allocate, but its \`Vec\`-backed accounts (\`Vec<Pubkey>\`, \`BTreeMap\`, etc.) silently rely on this heap. A 10,000-entry vector deserialized from an account will gleefully claim ~80 KiB of heap and crash the program with no clue why — until you remember that "the heap is 32 KiB and nothing frees."

> **Exercise §4.2.** Add a second \`vec![0u8; heap_bytes]\` allocation in \`process_bench\`, right after the first one. With \`--heap-bytes 8192\`, the program will succeed (8 KiB + 8 KiB ≈ 16 KiB, under the 32 KiB limit). With \`--heap-bytes 16384\`, it will OOM. Confirm both outcomes.

---

## §4.3  Raising the ceiling — \`ComputeBudgetInstruction\`

The default per-transaction CU limit is fine for short instructions. For anything longer — a Borsh decode, a CLOB match, a multi-CPI chain — you must explicitly request more. The mechanism is a special transaction-level instruction processed by the runtime before any user program runs.

From \`solana-compute-budget-interface-2.2.2/src/lib.rs:24–38\`:

\`\`\`rust
pub enum ComputeBudgetInstruction {
    Unused,
    /// Request a specific transaction-wide program heap region size in bytes.
    /// The value requested must be a multiple of 1024.
    RequestHeapFrame(u32),
    /// Set a specific compute unit limit that the transaction is allowed to consume.
    SetComputeUnitLimit(u32),
    /// Set a compute unit price in "micro-lamports" to pay a higher transaction
    /// fee for higher transaction prioritization.
    SetComputeUnitPrice(u64),
    /// Set a specific transaction-wide account data size limit, in bytes, is allowed to load.
    SetLoadedAccountsDataSizeLimit(u32),
}
\`\`\`

Four levers, each with a constructor at \`lib.rs:55–67\`. The two you will reach for most:

- **\`set_compute_unit_limit(units)\`** — raises the CU ceiling for the whole transaction. Pass any value up to 1,400,000.
- **\`request_heap_frame(bytes)\`** — raises the per-program heap size. Must be a multiple of 1024. Useful when you genuinely need >32 KiB of heap.

Our \`bench\` client uses \`set_compute_unit_limit\` at \`scripts/bench/src/main.rs:101–102\`:

\`\`\`rust
if let Some(limit) = cli.cu_limit {
    instructions.push(ComputeBudgetInstruction::set_compute_unit_limit(limit));
}
\`\`\`

The compute-budget instruction is processed by the runtime regardless of where it appears in the transaction, but by convention it goes first for readability. There is no account list — it is interpreted entirely as data by the runtime's pre-execution phase.

Three properties to remember:

1. **One per kind per transaction.** A second \`SetComputeUnitLimit\` in the same tx is rejected with \`DuplicateInstruction\`.
2. **No partial refunds.** If you request 1M CU and your program uses 50K, the fee is still calculated against the 1M ceiling for priority-fee purposes. (Plain transaction fees are unaffected.)
3. **It costs CU itself.** The compute-budget instruction processing is ~150 CU, baked into your transaction's total.

**What the SDK hides:** Anchor does not automatically prepend compute-budget instructions. You add them on the client side, before the Anchor-generated instruction. Many Anchor users forget this and get mysterious "transaction simulation failed" errors when their handlers grow past 200K CU.

> **Exercise §4.3.** Without \`--cu-limit\`, run \`bench --rounds 200 --heap-bytes 256\`. Note the \`units_consumed\` value. Now add \`--cu-limit 50000\`. Does the program succeed or fail? Why? (Hint: compare \`units_consumed\` from the first run to the limit you set.)

---

## §4.4  Walking \`process_bench\`

The handler is small — about 50 lines at \`programs/openhl-core/src/lib.rs:355–402\`. Its structure is three phases bracketed by \`sol_log_compute_units\`:

**Entry.** Decode the 8-byte payload (\`rounds: u32 LE\` then \`heap_bytes: u32 LE\`) and log the starting CU:

\`\`\`rust
msg!("bench: start (rounds={}, heap_bytes={})", rounds, heap_bytes);
sol_log_compute_units();
\`\`\`

**Phase A — heap.** Allocate the buffer and log again:

\`\`\`rust
let mut buf = vec![0u8; heap_bytes as usize];
msg!("bench: after heap alloc ({} bytes)", buf.len());
sol_log_compute_units();
\`\`\`

The \`vec!\` macro calls into the bump allocator. The first log reading minus this one is the *cost* of allocating \`heap_bytes\` bytes. Surprisingly small — the bump allocator is just a single pointer subtraction — but proportional to the syscall stub overhead, not the byte count.

**Phase B — hash loop.** Iterate sha256 \`rounds\` times, feeding each digest back into the buffer:

\`\`\`rust
for i in 0..rounds {
    let digest = sha256(&buf);
    let bytes = digest.to_bytes();
    let copy_len = bytes.len().min(buf.len());
    buf[..copy_len].copy_from_slice(&bytes[..copy_len]);
    if !buf.is_empty() {
        buf[0] ^= i as u8;
    }
}
\`\`\`

This is the workload that actually burns CU. \`sha256\` is a syscall on BPF (\`sol_sha256_\`), and its cost depends on the input length. Subtracting the Phase A reading from the Phase B reading gives the per-round CU cost — roughly \`(sha256 syscall base) + (per-byte cost × heap_bytes)\`.

The XOR-with-counter on line \`lib.rs:392\` exists to keep the optimizer honest. Without it, every iteration would hash the same bytes, and a sufficiently aggressive optimizer could collapse the loop. Stirring \`i\` into the buffer makes every iteration's input genuinely different.

The \`_\` final reading is captured automatically by \`sol_log_compute_units\` when the function returns (in the form of the runtime's own "consumed N of M compute units" log line, emitted after the program exits).

> **Exercise §4.4.** Run \`bench --rounds 0 --heap-bytes 0\` and \`bench --rounds 0 --heap-bytes 1024\`. Subtract the "after heap alloc" CU readings. That difference is the cost of allocating 1024 bytes from the bump heap. Is it bigger or smaller than you expected? Why?

---

## §4.5  Reading the bench output

A typical run looks like:

\`\`\`
bench --rounds 50 --heap-bytes 1024

simulation:
  units_consumed: 87412
  err:            (none)

program logs:
  Program <openhl-core ID> invoke [1]
  Program log: bench: start (rounds=50, heap_bytes=1024)
  Program consumption: 199772 units remaining
  Program log: bench: after heap alloc (1024 bytes)
  Program consumption: 199639 units remaining
  Program log: bench: after 50 hash rounds
  Program consumption: 112433 units remaining
  Program <openhl-core ID> consumed 87412 of 200000 compute units
  Program <openhl-core ID> success

on-chain signature: ...
\`\`\`

Three numbers to focus on. The CU remaining after entry (199,772) tells you the fixed cost of program startup: instruction-data decode, dispatcher, logging — about 230 CU in this build. Phase A burned (199,772 − 199,639) = 133 CU to allocate 1 KiB. Phase B burned (199,639 − 112,433) = 87,206 CU for 50 sha256 rounds of 1 KiB input — about 1,744 CU per round.

From here you can extrapolate. 100 rounds: ~175K CU. 120 rounds: ~209K CU — over the default 200K limit. Run it without \`--cu-limit\` and you will see \`ProgramFailedToComplete\` with \`ComputationalBudgetExceeded\`. Add \`--cu-limit 400000\` and it succeeds again.

This is the whole point: measure once, predict, then either fit your work into the budget or explicitly raise the ceiling. Guessing is for projects that have not yet shipped under load.

**What the SDK hides:** Anchor's logs include the same "consumed N of M compute units" line because it comes from the runtime, not from your program. But Anchor does not surface a typed \`units_consumed\` field anywhere — you read it from the validator logs like we do here.

> **Exercise §4.5.** Use \`--cu-limit\` to set a value just barely below what the previous run reported as \`units_consumed\`. The transaction should fail with \`ComputationalBudgetExceeded\`. Try a value just above. It should succeed. The boundary is exact, which is what makes CU a useful planning tool.

---

## §4.6  What Anchor hides about CU

Anchor inserts no CU instrumentation. It does not auto-raise the budget. It does not warn at compile time that your handler is too long. CU is one of the few things Anchor leaves entirely to you — because there is no general-purpose answer, and any default would be wrong.

What Anchor *does* do is add roughly 2,000–5,000 CU of overhead per typed account, for the deserialization + discriminator-check + owner-check it performs automatically. A handler with five \`Account<'info, T>\` parameters might pay 15,000–25,000 CU just for the typed-account wrappers before any of your code runs. We pay roughly 600–1,000 CU for the equivalent manual checks in \`process_initialize\` and \`process_create_market\`, because we hand-roll exactly what we need.

That is the entire CU case for native programs: when you write the deserializer, the owner check, and the borrow yourself, you control their cost. When Anchor does, they cost what Anchor's defaults cost. For a handler that runs once per market creation, the difference is negligible. For a handler that runs in a per-fill loop, the difference is the entire business.

---

## §4.7  Recap + verify yourself

### Recap diagram

\`\`\`
Per-transaction limits
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  CU         default 200,000     max 1,400,000              │
│  heap       default 32 KiB      max 256 KiB (via RHF)      │
│  data size  default ~64 MB      adjustable per tx          │
│                                                            │
└────────────────────────────────────────────────────────────┘

Inside one tx:
  ┌─────────────────────────┐     ┌──────────────────────┐
  │ ComputeBudgetInstruction│ ──► │ runtime applies      │
  │ (set_compute_unit_limit │     │ limits to all user   │
  │  / request_heap_frame)  │     │ programs in this tx  │
  └─────────────────────────┘     └──────────────────────┘
                                            │
                                            ▼
  ┌─────────────────────────┐     ┌──────────────────────┐
  │ openhl-core::Bench      │ ──► │ sol_log_compute_units│
  │   - decode payload      │     │ at each phase, runs  │
  │   - vec![0u8; n] heap   │     │ until success or CU=0│
  │   - sha256 loop         │     │                      │
  └─────────────────────────┘     └──────────────────────┘
\`\`\`

### Three things to verify yourself

1. **Default ceiling is real.** Run \`bench --rounds 150 --heap-bytes 1024\` without \`--cu-limit\`. It should fail with \`ComputationalBudgetExceeded\`. The simulation \`units_consumed\` will show a number greater than 200,000 — but the runtime stops counting once you exceed the limit, so the number may be capped.
2. **Heap ceiling is real.** Run \`bench --rounds 0 --heap-bytes 65536\`. The bump allocator at [\`solana-program-entrypoint-2.3.0/src/lib.rs:342\`](#) returns null; Rust's alloc-error handler aborts the program. The error you see is not \`ComputationalBudgetExceeded\` but a memory abort.
3. **Compute-budget instruction must be in the same tx.** Modify \`bench\` to send the \`ComputeBudgetInstruction\` in a *separate* transaction from the bench instruction. The next bench tx still gets only the default 200,000. The compute-budget instruction's effect is scoped to its own transaction only — it does not persist across.

---

## Hook into Chapter 5

You can now measure what your code costs and request the budget you need. But CU is only half the throughput story. The other half is *parallelism*: how many transactions can execute concurrently against the same accounts. Solana's headline feature — the reason it can process tens of thousands of transactions per second — is the Sealevel scheduler, which runs transactions in parallel whenever their account access sets don't conflict.

Chapter 5 walks the read/write set model that Sealevel uses to decide what can run in parallel. We will see why putting all markets behind a single global "registry" account would single-thread the entire program, and why our \`CreateMarket\` PDA scheme allows arbitrarily many markets to be created concurrently. We will also add a deliberately-conflicting \`Stats\` account to \`openhl-core\` to demonstrate what serialization looks like in the scheduler's eyes — and then refactor it out, the same way you would refactor it out of any real program before it shipped.
`,
                },
                {
                  title: "Chapter 5 — Sealevel Parallelism and Account Locks",
                  slug: "solana-internals-ch05-sealevel-en",
                  type: 'CONTENT',
                  sortOrder: 4,
                  duration: 45,
                  xpReward: 100,
                  content: `# Chapter 5 — Sealevel Parallelism and Account Locks

> Status: draft (v0.1).
> Companion code: \`programs/openhl-core/src/lib.rs\` (\`process_create_stats\` at lines 442–501, \`process_bump_stats\` at lines 503–540), \`scripts/stats/src/main.rs\`, \`scripts/create-market/src/main.rs\`.
> Tested against: solana-instruction 2.3.3, solana-program 2.3.0.

---

## §5.0  Framing

Solana's headline number — tens of thousands of transactions per second — is not bought by a faster VM or a denser block layout. It is bought by *running transactions in parallel*. The scheduler responsible for that is called **Sealevel**, and what Sealevel needs from your program is one specific piece of information per transaction: which accounts it will read, and which it will write.

That information comes from the \`AccountMeta\` array on each \`Instruction\` you submit. The runtime uses it as a reader-writer lock declaration: any two transactions whose write sets are disjoint can execute concurrently. Any two transactions that share a writable account must serialize, the way two threads contending on a \`Mutex\` would.

This chapter walks the model:

1. Open \`solana-instruction\` and read the three-field \`AccountMeta\` struct. Understand that **everything** Sealevel needs to know about a transaction's data-dependency is in those three fields.
2. Understand the reader-writer semantics: multiple \`READ\` locks coexist on an account, a single \`WRITE\` lock excludes everything else on that same account.
3. Walk the \`AccountMeta\` array of \`CreateMarket\`. See that every write is to a different PDA (one per \`(base_mint, quote_mint)\` pair), which means N concurrent CreateMarkets for N different pairs can execute in N parallel slots.
4. Walk the \`AccountMeta\` array of \`BumpStats\`. See that every BumpStats writes the *same* singleton Stats PDA — so two concurrent BumpStats *must* serialize, no matter what else they do.
5. Discuss the design patterns that pull contention out of hot paths: sharding the singleton, pre-aggregating off-chain, or removing the counter entirely.
6. Enumerate what Anchor does and does not generate for you in this area.

This is the last Foundations chapter. After it you can build a Solana program from scratch that is fast on a benchmark *and* fast in production — because the two diverge only when the scheduler is the bottleneck, and now you know how to read it.

---

## §5.1  What Sealevel sees: \`AccountMeta\` as the lock declaration

Open \`solana-instruction-2.3.3/src/account_meta.rs:19–32\`:

\`\`\`rust
#[repr(C)]
// ...
pub struct AccountMeta {
    /// An account's public key.
    pub pubkey: Pubkey,
    /// True if an \`Instruction\` requires a \`Transaction\` signature matching \`pubkey\`.
    pub is_signer: bool,
    /// True if the account data or metadata may be mutated during program execution.
    pub is_writable: bool,
}
\`\`\`

Three fields. That is the entire interface between your client code and the scheduler. The pubkey identifies the account; the two booleans declare what you intend to do with it. Once the client sends the transaction, the runtime treats this declaration as a contract: if a transaction marked an account as \`READ\` and the program tries to write to it, the write fails at commit time with \`ReadonlyDataModified\`. The scheduler can therefore trust the declaration when it decides what to run in parallel.

The two constructors at lines 61–67 and 97–103 make the intent obvious in client code:

\`\`\`rust
pub fn new(pubkey: Pubkey, is_signer: bool) -> Self {
    Self { pubkey, is_signer, is_writable: true }
}

pub fn new_readonly(pubkey: Pubkey, is_signer: bool) -> Self {
    Self { pubkey, is_signer, is_writable: false }
}
\`\`\`

\`AccountMeta::new(...)\` — writable. \`AccountMeta::new_readonly(...)\` — readable only. The signer bit is orthogonal to read/write; it controls a different runtime check (Chapter 2's owner story, in essence).

There is no "intent to read only one field" or "intent to write only at this offset." The granularity is the entire account. Either you might touch any of its bytes (write) or you only inspect them (read). This coarseness is what makes scheduling cheap — the lock table is keyed on 32-byte pubkeys, not on byte ranges.

> **Exercise §5.1.** Print the \`AccountMeta\` array of a \`CreateMarket\` instruction by adding a few \`println!\` lines to \`scripts/create-market/src/main.rs\` after the instruction is built. Confirm: payer is \`WRITE + SIGNER\`, market PDA is \`WRITE\`, system_program is \`READ\`.

---

## §5.2  Reader-writer semantics in the scheduler

The Sealevel scheduler treats each account as a single reader-writer lock. The rules are exactly the textbook ones:

- **N readers** can hold the lock on the same account concurrently.
- **One writer** holds the lock exclusively — no other readers, no other writers, on that same account.
- **Disjoint accounts** are independent — locks on different pubkeys do not interact.

When a transaction enters the scheduler, the runtime collects every \`AccountMeta\` across every instruction in that transaction, deduplicates them, and forms the transaction's read set and write set. Two transactions are *runnable in parallel* if and only if:

\`\`\`
(A.write_set ∩ B.write_set) == ∅
AND (A.write_set ∩ B.read_set)  == ∅
AND (A.read_set  ∩ B.write_set) == ∅
\`\`\`

Two \`read_set ∩ read_set\` overlaps do not block — that is the whole point of distinguishing reads from writes.

What this means concretely:

1. **Two CreateMarkets for different \`(base_mint, quote_mint)\` pairs** — disjoint write sets (different market PDAs, same payer if you signed both yourself). The shared payer is the only contention point, and the runtime handles that by serializing transactions from the same fee payer (a separate constraint, not a Sealevel one). For different payers, fully parallel.

2. **Two BumpStats** — both write the singleton Stats PDA. Their write sets intersect on that one pubkey. They serialize, full stop.

3. **A CreateMarket and a BumpStats** — different write sets (one writes a market PDA, the other writes Stats). They parallelize.

4. **Two reads of the same market** (e.g., two front-ends rendering it) — overlap on a read, no conflict. Both run.

The runtime makes these decisions per slot, before any program code runs. Your program never knows about scheduling; it just runs when its turn comes.

**What the SDK hides:** Neither \`solana-sdk\` nor Anchor exposes "is this transaction parallelizable with that one?" as an API. The scheduler decides at runtime, opaquely. You reason about it by reading your own \`AccountMeta\` declarations and asking the questions above.

> **Exercise §5.2.** A \`Transfer\` from wallet A to wallet B has read/write set \`{A: W, B: W}\`. A \`Transfer\` from C to D has set \`{C: W, D: W}\`. Can they run in parallel? What about A→B and B→C?

---

## §5.3  Walking \`CreateMarket\`'s access set

From \`scripts/create-market/src/main.rs:118–125\`, the client declaration:

\`\`\`rust
let ix = Instruction {
    program_id,
    accounts: vec![
        AccountMeta::new(payer.pubkey(), true),
        AccountMeta::new(market_pda, false),
        AccountMeta::new_readonly(system_program::ID, false),
    ],
    data,
};
\`\`\`

Three accounts. Let us examine each from Sealevel's perspective.

**\`payer\` — \`WRITE + SIGNER\`.** The payer's lamport balance changes (rent goes out). For two CreateMarkets that share the same payer, this is the conflict point — the runtime cannot let both decrement the same balance in parallel without serialization. The same fee payer in two different transactions in the same slot is rejected for a *different* reason (duplicate transaction nonce in the same block), so in practice the conflict is moot. If you call CreateMarket from two different payers, you have no \`payer\`-level overlap.

**\`market_pda\` — \`WRITE\`.** This is the new account being created. The pubkey is *derived from* \`(base_mint, quote_mint)\` plus the program ID — see Chapter 3. Two CreateMarkets for different \`(base_mint, quote_mint)\` pairs will derive **different** market PDAs, so this write does not conflict between them. This is the design choice that makes openhl-core parallelism-friendly: the PDA scheme means every new market lives at its own address, never colliding with another.

**\`system_program::ID\` — \`READ\`.** System program is needed for the \`create_account\` CPI inside our handler. Marked read-only because we are not modifying the System program itself (you cannot — it is an executable account). All concurrent transactions that CPI to System can read-lock it together. Read locks on the same account do not block each other.

So two CreateMarkets for \`(SOL, USDC)\` and \`(SOL, USDT)\` from different payers have:

\`\`\`
A.writes = {payer_A, market_SOL_USDC}
A.reads  = {system_program}
B.writes = {payer_B, market_SOL_USDT}
B.reads  = {system_program}
\`\`\`

The intersections are all empty except for \`system_program ∈ A.reads ∩ B.reads\`, which is a read-on-read overlap — allowed. Both transactions schedule into the same slot. Parallel.

This is what "parallelism-friendly by design" means in practice. We did not write parallelism-friendly code by trying. We wrote it by giving each market its own address, which falls out of the PDA scheme we picked for unrelated reasons in Chapter 3. The Sealevel benefit is downstream of an architectural decision made for composability.

> **Exercise §5.3.** What is the read/write set of an \`Initialize\` (Chapter 2) instruction call? Look at \`scripts/init-market/src/main.rs\`. Note that Initialize also runs a \`System::Assign\` instruction in the same tx — count those AccountMetas too.

---

## §5.4  The Stats counter-example — singleton write contention

Now consider \`BumpStats\`, from \`scripts/stats/src/main.rs:99–104\`:

\`\`\`rust
Instruction {
    program_id,
    accounts: vec![AccountMeta::new(stats_pda, false)],
    data: vec![4u8],
}
\`\`\`

One account: \`stats_pda\`, marked \`WRITE\`. The \`stats_pda\` is derived from a fixed seed (\`[STATS_SEED]\`) with no per-call variation — it is the same pubkey for every BumpStats call against this program, forever. So the write set of any BumpStats transaction is \`{stats_pda}\`.

Two BumpStats transactions have:

\`\`\`
A.writes = {stats_pda}
B.writes = {stats_pda}
\`\`\`

\`A.writes ∩ B.writes = {stats_pda}\` — nonempty. They cannot run in parallel. The scheduler picks one, runs it, commits it, then runs the other. Throughput on BumpStats is bound by the latency of a single transaction, no matter how many cores the validator has.

This is fine for \`BumpStats\` itself — it is an explicit "tick the counter" call that nobody expects to be a hot path. The problem is *if you bolted Stats-writing onto an instruction that is supposed to run in parallel*. Imagine a \`CreateMarketAndBumpStats\` instruction that calls \`CreateStats\` logic at the end of \`CreateMarket\`. Its \`AccountMeta\` would be:

\`\`\`
[payer (W,S), market_pda (W), system_program (R), stats_pda (W)]
\`\`\`

The first three accounts are different per \`(base_mint, quote_mint)\` — fully parallelizable. The fourth — \`stats_pda\` — is *the same* across every call. Suddenly every market creation must serialize on Stats. Your beautiful PDA-per-market design now throughputs at single-transaction latency, because of one global counter.

This is the **single most common mistake** in real Solana programs: someone adds "global metrics" or "global limits" or "global rate-limit counters" to a hot-path instruction, and throughput collapses by orders of magnitude. The fix is always the same — pull the global write out — but the fix is impossible to find if you do not understand why it broke.

Run the stats client to see what the declaration looks like:

\`\`\`
stats --rpc ... --program ... --init
AccountMeta declared:
  [0] <payer pubkey>           WRITE + SIGNER
  [1] <stats PDA pubkey>       WRITE
  [2] 11111111111111111111111111111111  READ
\`\`\`

\`\`\`
stats --rpc ... --program ...
AccountMeta declared:
  [0] <stats PDA pubkey>       WRITE
\`\`\`

Two transactions, two write sets. The pubkeys are visible. The conflict is mechanical.

> **Exercise §5.4.** Send two BumpStats transactions back-to-back from the same payer. Watch their signatures and slot numbers (via \`solana confirm <sig>\`). They may land in the same slot or in adjacent slots — but they *cannot* be processed in parallel. Find any case where they truly were processed by the same validator in the same slot, and confirm via the runtime logs that they were processed sequentially.

---

## §5.5  Refactoring patterns — pull the global write out

You have three real options when a singleton write is creating contention.

**(1) Shard the singleton.** Replace one Stats PDA with N Stats PDAs, derived from \`[STATS_SEED, &[shard_index]]\`. The client picks a shard randomly (or based on some property of the call). Now the write set is \`{stats_shard_K}\` for some K in \`0..N\`, and you have N-way parallelism on the counter. To read the total, sum across shards off-chain.

This is the most common in-program fix. Costs: you give up exact "happened-before" ordering on the counter (two shards advance independently), and reading the total now requires reading N accounts.

**(2) Pre-aggregate off-chain.** Do not store the counter on-chain at all. Index the transactions that create markets via a watcher process (Geyser, RPC \`getSignaturesForAddress\`, etc.) and maintain the count in a database off-chain. On-chain remains parallel because no on-chain state changed.

This is the right choice when the counter is for *observability* (dashboards, analytics) rather than for *program logic*. Most "global stats" requirements fall into this bucket.

**(3) Remove the counter.** Ask whether the counter is actually load-bearing. Often someone added it "to know how many markets we have" — but the answer is \`getProgramAccounts(programId, filter: discriminator == MARKET_DISCRIMINATOR).len()\`, fetched on demand, no on-chain state required.

The pattern: whenever you find a writable singleton on a hot path, the question is not "how do I serialize this efficiently" but "do I actually need this account to exist on-chain at all."

For our own design, we deliberately chose to keep \`BumpStats\` as a separate, explicit instruction rather than integrating it into \`CreateMarket\`. Operators who want the counter can call it; operators who care about throughput skip it. That isolation is the point.

**What Anchor hides:** Anchor's \`#[derive(Accounts)]\` lets you declare an account with \`#[account(mut)]\` and forget about the write-set implications. Anchor never warns "you are writing a singleton in a hot-path handler." The compile-time \`Accounts\` struct shows up in the client's typed IDL, but the parallelism cost is invisible there too. Catching this is purely a code-review concern.

---

## §5.6  Recap + verify yourself

### Recap diagram

\`\`\`
Sealevel scheduler — for each pair of pending transactions A, B:

   A.writes ────┐
                ├──► intersect? ──► YES: cannot parallelize
   B.writes ────┘                   NO:  proceed

   A.writes ────┐
                ├──► intersect? ──► YES: cannot parallelize
   B.reads  ────┘                   NO:  proceed

   A.reads  ────┐
                ├──► intersect? ──► YES: cannot parallelize
   B.writes ────┘                   NO:  proceed

   (A.reads ∩ B.reads is ignored — both readers can hold the lock)


openhl-core access sets:

   CreateMarket(base, quote)
      writes = { payer, market_PDA[base, quote] }
      reads  = { system_program }
      ↑ market_PDA varies per call → parallel across distinct (base, quote)

   BumpStats
      writes = { stats_PDA }   ← singleton, same pubkey every call
      ↑ serialized regardless of caller

   CreateStats
      writes = { payer, stats_PDA }
      reads  = { system_program }
      ↑ one-shot, contention doesn't matter
\`\`\`

### Three things to verify yourself

1. **Same pubkey, every call.** Run \`stats --init\` (CreateStats), then \`stats\` (BumpStats), then \`stats\` again. The \`stats PDA\` printed should be identical across all three runs — that pubkey is the lock the scheduler keys on. It does not change.
2. **Different pubkey per CreateMarket.** Run \`create-market --base-mint <A> --quote-mint <B>\`. Note the \`market PDA\`. Re-run with \`--base-mint <C> --quote-mint <D>\`. The PDA should change. That is the parallelism. The first run's write set is disjoint from the second's, so the scheduler is free to run them in any order or concurrently (subject to other constraints).
3. **Read-on-read does not block.** \`Bench\` (Chapter 4) has an *empty* account list — no reads, no writes. Two Bench transactions could in principle run in fully parallel slots. Run two from different payers and observe their signatures land in the same or adjacent slot in \`solana confirm\`. Compare to two BumpStats from different payers, which land in strictly different slots.

---

## Hook into Chapter 6 — Phase B begins

You have finished Phase A. You can now allocate accounts, write programs without Anchor, derive predictable addresses, measure your CU envelope, and reason about whether two of your transactions can run in parallel. These are the runtime fundamentals — everything else in this track is built on them.

Phase B begins with Chapter 6: **CPI Internals — Vault Deposits**. We open SPL Token, write a deposit instruction that moves base-asset tokens from a user's token account into a vault token account owned by our market PDA, and walk what \`invoke\` and \`invoke_signed\` *actually* do under the hood — the stack-frame setup, the signer-privilege extension rules, the \`AccountInfo\` reborrowing dance. Where Chapter 3 used \`invoke_signed\` once for account creation, Chapter 6 uses it as the primary mechanism for talking to every other program on the chain.

By the end of Chapter 6 we will have a working SPL Token vault for our market. By the end of Phase B we will have an order book that lives inside it.
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
