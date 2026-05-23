// AUTO-GENERATED from drafts/solana_internals_ch*_ja.md
// by .github/scripts/build-soldojo-internals-seed.ts.
// Do not hand-edit. Re-run the build script when drafts change.

import { PrismaClient } from '@prisma/client';

export async function seedSoldojoInternalsFoundationsJA(prisma: PrismaClient) {
  const tags = ["solana","internals","native-programs","pdas","compute-budget","sealevel"];

  await prisma.course.create({
    data: {
      slug: "solana-internals-foundations-ja",
      title: "Solana 内部 — 基礎編",
      description:
        "本物の Solana を、組み立てながら学ぶ。ランタイムの基礎をすべて扱う 5 章 — アカウントモデル、Anchor なしのネイティブプログラム、Program-Derived Address、コンピュートバジェットとヒープ規律、Sealevel 並列性 — 各段に動く教材コード付き。SDK の抽象がバイトを覆い隠さない。",
      difficulty: "ADVANCED",
      duration: 225,
      xpReward: 700,
      track: "solana-internals",
      tags,
      isPublished: true,
      sortOrder: 100,
      locale: "ja",
      instructorName: "SolDojo Internals",
      modules: {
        create: [
          {
            title: "基礎編",
            sortOrder: 0,
            lessons: {
              create: [
                {
                  title: "第1章 — バイトから組み立てるアカウントモデル",
                  slug: "solana-internals-ch01-account-model-ja",
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 45,
                  xpReward: 100,
                  content: `# 第1章 — バイトから組み立てるアカウントモデル

> 状態: ドラフト (v0.1)。
> 教材コード: \`crates/state/src/lib.rs\`、\`scripts/allocate-market/src/main.rs\`。
> 検証対象バージョン: solana-sdk 2.3.1、solana-rent 2.2.1、solana-account 2.2.1、solana-system-interface 1.0.0。

---

## §1.0  はじめに

Solana のチュートリアルはたいてい Anchor から始まる。\`#[derive(Accounts)]\` の構造体を書き、\`#[account(init, payer = signer, space = 8 + ...)]\` のような属性をいくつか散りばめれば、数行のマクロで動くプログラムができあがる。マクロは魅力的だが、Solana ランタイムの全モデルを属性 1 行に畳み込んでしまう。マクロが誤った既定値を選んだとき、どこを見ればよいかわからない。マクロが裏で何をしているかを一度も見ていないからだ。

本章はその解毒剤である。次の順で進める。

1. \`solana-account\` を開き、\`Account\` の 5 つのフィールドを読む。
2. レント免除残高を手計算し、ランタイムの値と突き合わせる。
3. System プログラムを直接呼び、ローカルバリデータ上に 256 バイトのアカウントを確保する。
4. 生のバイトを 16 進ダンプし、自分たちのレイアウト定義と照らし合わせて各バイトの意味を確認する。
5. 上記すべてを \`#[account(init, ...)]\` がどう肩代わりしていたかを、行ごとに対応づけて列挙する。

終えるころには、Solana の任意のアカウントの任意のバイトを指して、それが何を表し、どこから来て、どのプログラムだけがそれを変更できるかを答えられるようになっている。本トラックのその後すべてはこの土台の上に立つ。

教材として扱う対象は、本物の成果物の最小単位 — HL 型パープ DEX の空の \`Market\` アカウントである。「空」なのは、作成後の所有者が System プログラムであり、System には「任意のバイトを書き込む」命令が存在しないからだ。この欠落こそが第 2 章への導線になる。

---

## §1.1  アカウントの 5 つのフィールド

\`solana-account-2.2.1/src/lib.rs:44–56\` を開こう。

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

定義はこれだけ。5 つのフィールド。\`slot\` も \`version\` も \`nonce\` も \`storage_root\` もない。Solana ランタイムがアカウント「について」記録するのはこれだけで、それ以外の情報はすべて \`data\` フィールド内に不透明なバイトとして格納される。

1 つずつ見ていこう。

**\`lamports: u64\`** — アカウントの残高を lamport 単位で保持する（1 SOL = 10⁹ lamport）。任意のプログラムが残高を「増やす」ことはできる（送金するだけ）。しかし、残高を「減らす」ことができるのは、そのアカウントの**所有プログラム**だけだ。これはローダが強制するランタイム不変条件で、自分のものではないアカウントから引き落とそうとすると、トランザクションは関数が返るより前に失敗する。

**\`data: Vec<u8>\`** — アカウントの記憶領域。ランタイムから見れば不透明なバイトの並びで、長さの上限は 10 MB。プログラムはこのバイト列を好きなように解釈する（Anchor なら Borsh、本コードなら \`bytemuck\`、生のシェーダなら独自形式、と何でもいい）。書き込めるのは所有プログラムだけ。他のプログラムは読めるだけだ。

**\`owner: Pubkey\`** — \`lamports\` の減算と \`data\` の書き換えを許可されたプログラムの公開鍵。ウォレットなら System プログラム、SPL Token アカウントなら SPL Token プログラム、第 2 章以降の \`Market\` アカウントなら自前のプログラムが入る。所有者は作成時（System の \`CreateAccount\` または \`Assign\`）に一度だけ設定され、それ以降は現在の所有者が明示的に \`Assign\` を発行したときだけ切り替わる。

**\`executable: bool\`** — \`data\` に BPF プログラムがロードされていれば \`true\`、そうでなければ \`false\`。一度 \`true\` になったアカウントは読み取り専用に固定され、永久に書き換えられない。Solana における不変性はこの仕組みで成立している。アカウントを executable に切り替え、以降の書き込みをランタイムが拒否する、それだけだ。

**\`rent_epoch: Epoch\`** — 歴史的遺物。Solana 初期にはランタイムがアカウントサイズに応じて定期的にレントを徴収しており、このフィールドは次回課金タイミングを記録していた。レント徴収は実質的に廃止され、厳格なレント免除（§1.2）に置き換わった。フィールドは残っているが、もはや実務的な意味はほぼない。\`solana account <pubkey>\` の出力でも、変化しない数値として目に入るだけだ。

**SDK が隠していること:** Anchor で \`pub user_data: Account<'info, UserData>\` と宣言すると、受け取れるのは \`data\` フィールドを「解析済み」の型付きビューだ。残り 4 つのフィールド — \`lamports\`、\`owner\`、\`executable\`、\`rent_epoch\` — も裏の \`AccountInfo\` 経由で参照できるが、型はそのうち 1 つにしか目を向けさせない。多くの開発者は Anchor を使い続けるあいだ、\`owner\` を明示的に触らずに終わる。所有者チェック漏れが Solana プログラムの代表的なセキュリティバグであるにもかかわらず。

> **演習 §1.1.** SPL トークンアカウントのアドレスを 1 つ選び（たとえば自分の USDC 口座）、次を実行する。
> \`\`\`
> solana account <pubkey> --output json
> \`\`\`
> JSON 出力から 5 つのフィールドそれぞれを特定せよ。\`owner\` は何か。\`data\` は base64 でどう見えるか。\`executable\` は期待どおりか。

---

## §1.2  レントとレント免除

\`solana-rent-2.2.1/src/lib.rs:32–45\` を開こう。

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

そして計算式そのもの、\`lib.rs:93–97\`。

\`\`\`rust
pub fn minimum_balance(&self, data_len: usize) -> u64 {
    let bytes = data_len as u64;
    (((ACCOUNT_STORAGE_OVERHEAD + bytes) * self.lamports_per_byte_year) as f64
        * self.exemption_threshold) as u64
}
\`\`\`

規則はこうだ。アカウントの残高が、現在のレート換算で 2 年分のレントを賄えるだけあれば、そのアカウントは**レント免除**になる。閾値未満で作成しようとすればトランザクションは失敗する。稼働中のアカウントの残高をこの閾値より下げようとしても（たとえば lamport を引き出すと）、同様に失敗する。

\`lib.rs:70\` の \`ACCOUNT_STORAGE_OVERHEAD\` 定数が肝心の落とし穴である。

\`\`\`rust
pub const ACCOUNT_STORAGE_OVERHEAD: u64 = 128;
\`\`\`

どんなに小さなアカウントでも、すべてのアカウントは「追加 128 バイト分」の課金を受ける。これはランタイム側の管理コスト — §1.1 のメタデータフィールド、インデックスのオーバーヘッドなど — を反映している。だから「ゼロバイトのアカウント」と「128 バイトのアカウント」のレントは同じだ。

\`Market\`（データ 256 バイト）の計算は次のとおり。

\`\`\`
minimum_balance = (128 + 256) × lamports_per_byte_year × 2.0
                = 384 × 3480 × 2
                = 2,672,640 lamports
                ≈ 0.00267 SOL
\`\`\`

（\`lamports_per_byte_year\` の既定値は約 3480。\`lib.rs:54\` で「1 MB あたり 1 日 $0.01」から導出されている。）

本書のスクリプトはこの値をローカル計算ではなく RPC に問い合わせる。

\`\`\`rust
// scripts/allocate-market/src/main.rs:56–58
let rent_lamports = client
    .get_minimum_balance_for_rent_exemption(Market::LEN)
    .context("fetch rent-exempt minimum")?;
\`\`\`

なぜ往復するのか。理由は、\`Rent\` が**sysvar** だからだ。値はバイナリにハードコードされておらず、オンチェーンで管理される。将来のランタイム更新で（原理的には）変更されうる。「このクラスタで実際に強制される値」を知る唯一の方法が RPC への問い合わせである。

**SDK が隠していること:** Anchor の \`#[account(init, ..., space = 8 + 248)]\` は \`space\` 引数を読み取り、**プログラム内で** \`Rent::get()?.minimum_balance(space)\` を呼ぶ（オンチェーン sysvar にアクセスできるので RPC は不要）。その値を \`create_account\` の lamport 量に渡す。\`space = 8 + ...\` の \`8\` は Anchor 自身のディスクリミネータ用オーバーヘッドだ。Anchor は型を実行時に識別するため、全アカウントの先頭に 8 バイトを必ず付ける。本書の \`Market\` はオフセット 0 に独自のディスクリミネータを持っており、同じ 8 バイトの課金を払っている — ただし、それが目に見える形で。

> **演習 §1.2.** 0 バイトのアカウント、256 バイトのアカウント、10,000 バイトのアカウント（Anchor が推奨する上限）について、\`minimum_balance\` を手計算せよ。次にクラスタで照合する。
> \`\`\`
> solana rent <bytes>
> \`\`\`
> 128 バイトのオーバーヘッドは実際にはどこに格納されているのか。（ヒント: \`lib.rs:67–70\` のフィールド名コメントを読むこと。）

---

## §1.3  System プログラムからアカウントを確保する

System プログラム（\`11111111111111111111111111111111\`）は、アカウントを存在させることができる唯一のプログラムである。System はすべてのウォレットを所有し、lamport を自由に動かせる唯一の存在であり、他のすべてのプログラムが最初のアカウントを得る出発点になる。

\`solana-system-interface-1.0.0/src/instruction.rs:80–95\` を開こう。

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

\`CreateAccount\` は 1 回のシステムコールで 3 つのことを行う。

1. 資金口座から新アカウントへ \`lamports\` を**送金**する。
2. 新アカウントの \`data\` フィールドに \`space\` バイトを**確保**する。
3. 新アカウントの所有者として \`owner\` を**割り当てる**。

\`instruction.rs:9–12\` のドキュメントコメントも同じ分解を明記している。

> Account creation typically involves three steps: \`allocate\` space, \`transfer\` lamports for rent, \`assign\` to its owning program. The \`create_account\` function does all three at once.

呼び出すコンストラクタは \`instruction.rs:406–426\` にある。

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

両方の \`AccountMeta::new\` に \`true\` が付いている点に注目。この \`true\` は**署名者の要求**を意味する。資金口座と新アカウントの両方が、このトランザクションに署名しなければならない。これは初めて見ると違和感がある。まだ存在しないアカウントが、なぜ署名する必要があるのか。

答えは「乗っ取り防止」だ。もし支払者だけが署名すればよいなら、誰かが 0.003 SOL を支払って**あなたのアドレス**にアカウントを作成し、所有者を**相手が管理するプログラム**に設定し、本来あなたが到達する前にそのアドレスをゴミに縛り付けることができてしまう。新アカウントにも署名を要求することで、ランタイムは「新アドレスの秘密鍵を本当に持っている」ことを証明させる。lamport は支払者から出る。新アカウントの署名は、そのアカウントを名乗る鍵ペアを所有する者から出る。

本書のスクリプトでは \`scripts/allocate-market/src/main.rs:79–85\` がこれを行う。

\`\`\`rust
let blockhash = client.get_latest_blockhash().context("fetch blockhash")?;
let tx = Transaction::new_signed_with_payer(
    &[create_ix],
    Some(&payer.pubkey()),
    &[&payer, &market],
    blockhash,
);
\`\`\`

\`&[&payer, &market]\` — 署名者 2 名。\`market\` は 52 行目で \`Keypair::new()\` によりローカル生成した鍵ペアだ。その秘密鍵をこのトランザクション 1 回ぶんだけ手元に置いて署名する。それ以降は二度と使わない。アカウントは公開鍵で識別され、このトランザクション以降、何かを変更できるのは**所有プログラム**（今は System）だけになる。

第 3 章では、この \`Keypair::new()\` を Program-Derived Address (PDA) に置き換える。そこでは新アカウントの署名をプログラム自身が \`invoke_signed\` 経由で供給するようになる。モデルは同じ、署名する主体だけが変わる。

**SDK が隠していること:** Anchor の \`#[account(init, payer = payer, space = ...)]\` はおよそ次のように展開される。

\`\`\`rust
// 1. レント免除残高を実行時に Rent::get() で計算する
let rent = Rent::get()?.minimum_balance(space);

// 2. System の CreateAccount 命令を組み立てる
let ix = system_instruction::create_account(
    payer.key,
    account.key,
    rent,
    space as u64,
    program_id,                   // <-- System ではなく自前のプログラム!
);

// 3. account が PDA なら invoke_signed、そうでなければ invoke で CPI 発行
invoke_signed(&ix, &[payer, account, system_program], &[seeds_with_bump])?;

// 4. Anchor の 8 バイトディスクリミネータを data[0..8] に書く
account.try_borrow_mut_data()?[..8].copy_from_slice(&MyType::DISCRIMINATOR);

// 5. data の残りをゼロ初期化する（Anchor のアカウント型は repr(C) Pod 風なので）
\`\`\`

5 ステップ。属性 1 行の裏に。どれも誤りではない — Anchor の選択は妥当な既定値だ — が、どれもあなたが下した決定ではない。

> **演習 §1.3.** 新アカウントの所有者は \`create_account\` を呼んだプログラムが指定する。本書のスクリプトでは、新アカウントの所有者は何になるか。\`main.rs:69\` と \`main.rs:71–77\` を見よ。第 1 章としてはなぜそれが正しい選択なのか。

---

## §1.4  バイトを読む

スクリプトの最後の仕事は、作成したアカウントを取得してダンプすることだ。ダンプの表は \`main.rs:113–125\` にある。

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

これらのオフセットは捏造ではない。\`crates/state/src/lib.rs:43–56\` の \`Market\` 構造体定義からそのまま導かれる。

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

2 点だけ立ち止まりたい。

**\`_pad0: [u8; 6]\` フィールドの理由。** オフセット 9 の \`bump: u8\` の次は \`authority: [u8; 32]\` だ。\`[u8; 32]\` のアラインメント要求は 1 だが、本構造体は \`#[repr(C)]\` で、後続の \`tick_size: u64\` を 8 バイト境界に置きたい — 将来のコードがアラインなしアクセスのリスクなく \`u64\` として読めるように。この 6 バイトのパディングがあることで、次の 8 バイト境界が 10 ではなく 16 に来る。コンパイラが暗黙に挿入するパディングに任せず、明示的に宣言したのには理由がある。隠れたパディングは \`bytemuck::Pod\` 要件を壊す。\`Pod\` は構造体の全バイトが初期化済みで可視であることを要求するからだ。

**\`Pubkey\` を \`[u8; 32]\` として持つ理由。** \`crates/state/src/lib.rs:8–15\` のドキュメントコメントが説明している。\`solana_program::pubkey::Pubkey\` は \`bytemuck::Pod\` を上流で実装していない。レイアウトを \`Pod\` 安全に保つには、生の 32 バイトとして保持するしかない。これは教育的にも誠実だ。\`Pubkey\` は実体としては 32 バイトの並びでしかなく、型名はその並びに名前を付けたものに過ぎない。第 2 章のプログラムは境界で型変換する。

新しい \`solana-test-validator\` 上でスクリプトを実行すると、期待される出力はおよそ次のようになる。

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
  ... (256 バイトすべてゼロ)
\`\`\`

注目したい点はいくつかある。

- \`owner: 11111111111111111111111111111111\` — base58 で 1 が並ぶアドレスは System プログラムを表す。\`main.rs:69\` で明示的にそう指定した。
- \`lamports: 2672640\` — §1.2 で計算したレント免除最低額そのもの。多くも少なくもない。
- \`executable: false\` — これはデータアカウントであってプログラムではない。
- \`rent_epoch: 18446744073709551615\` — これは \`u64::MAX\` だ。ランタイムはレント免除アカウントをこの番兵値で印付け、「このアカウントには課金しない」を実質的に表現する。これが現在のレント体系の遺物の姿だ。
- \`data: [0u8; 256]\` — 全バイトゼロ。書き込んだことがないからだ。System プログラムは自分が所有するデータフィールドへの書き込みを誰にも許可しない。アロケータがゼロ初期化するので、バイトはゼロのまま残る。

オフセット 0 のディスクリミネータは \`00 00 00 00 00 00 00 00\` だ。\`4d 41 52 4b 45 54 00 00\`（"MARKET\\0\\0"）ではない。正しいバイト数を確保したが、\`MARKET_DISCRIMINATOR\` を書き込んだ者はまだいない。それが第 2 章の仕事である。

**SDK が隠していること:** Anchor の型付き \`Account<'info, T>\` インターフェース経由でアカウントを取得すると、フレームワークは \`data[0..8]\` を読み、\`T::DISCRIMINATOR\` と**比較**する。一致しなければ、コードがアカウントに触れる前にエラーが返る。これは非常に有用な安全装置だ — 同時に、いま作成した状態（正しいサイズ、全ゼロ）のアカウントは Anchor のディスクリミネータチェックを通らず、型付きコードからは存在しないように見える。生のバイトは確かにそこにある。Anchor がただ見ないだけだ。

> **演習 §1.4.** スクリプトを \`solana-test-validator\` に対して実行せよ。別端末で、スクリプトが出力した market pubkey に対し \`solana account <market_pubkey>\` を実行し、スクリプトの出力と突き合わせよ。全フィールドで一致するはずだ。\`solana account\` が表示してスクリプトが表示しない情報を 1 つ、スクリプトが表示して \`solana account\` が表示しない情報を 1 つ、それぞれ見つけよ。

---

## §1.5  \`#[account(init, ...)]\` の中身

ここまでで、Anchor の最も典型的な属性が肩代わりしていたことをすべて見た。突き合わせて並べると次のとおりだ。

| Anchor がやること | 平文に展開すると |
|---|---|
| 属性から \`space = N\` を読む | \`let space = N;\` |
| \`Rent::get()?.minimum_balance(space)\` を呼ぶ | §1.2 — 本書のスクリプトは RPC 経由の \`get_minimum_balance_for_rent_exemption\` を使う |
| \`system_instruction::create_account\` を組み立てる | §1.3 — \`main.rs:71–77\` |
| \`invoke_signed\`（PDA シード付き）または \`invoke\` で発行する | 本書のスクリプトでは省略。クライアント側で署名している。CPI は第 2 章で導入する |
| \`T::DISCRIMINATOR\` を \`data[0..8]\` に書く | 省略。§1.4 が示すとおりバイトはゼロのまま |
| 新アカウントの所有者をプログラム ID にする | 意図的に \`system_program::ID\` を指定 |
| 型付きアカウントビューを Rust 構造体に束縛する | 生の \`account.data: Vec<u8>\` と独立した \`Market\` 構造体を使う |

マクロは本物の仕事をしている。「ただの糖衣」ではない。マクロは各ステップで既定値を選ぶ — 支払者の選定、レント計算、所有者 = プログラム ID、ディスクリミネータ = 型 ID、レイアウト = Borsh 風 — そして、**ほとんどの場合**それで正しい。誤っているとき（プログラム横断の所有権、独自ディスクリミネータ、ZK 検証器向けのバイト厳密レイアウト）には、展開のどの行を上書きすべきかを知っている必要がある。

抽象化は内側から 3 層で積まれている。

1. **\`solana-program\` のシステムコール** — ランタイム ABI。\`sol_invoke\`、\`sol_log\`、\`create_program_address\`。最も金属に近い。直接呼ぶことはまれだが、上層の抽象すべてが最終的にここを通る。
2. **\`solana-sdk\` のラッパ** — \`Transaction::new_signed_with_payer\`、\`Account\`、\`Rent\`、命令コンストラクタ群。人間工学的で、型付きで、魔法は使わない。
3. **\`anchor-lang\` のマクロ** — \`#[program]\`、\`#[derive(Accounts)]\`、\`#[account(...)]\`。人間工学を最大化し、意見の強い既定値を持ち、定型コードを生成する。最も深い抽象。

本トラックが教えるのは下 2 層だ。それを理解していれば、第 3 層の既定値があなたを裏切ったとき、デバッグできる。

---

## §1.6  まとめと自己検証

### まとめ図

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                       Solana アカウント                          │
│                                                                 │
│   lamports     : u64       ← 減算できるのは所有プログラムのみ    │
│   data         : Vec<u8>   ← 書き込めるのは所有プログラムのみ    │
│   owner        : Pubkey    ← 作成時に設定、Assign で変更         │
│   executable   : bool      ← 単方向: false → true 後は永久に RO  │
│   rent_epoch   : u64       ← 遺物。u64::MAX = レント免除         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

アカウント作成（System プログラム）:

  payer ──署名──┐
                ▼
         CreateAccount { lamports, space, owner }
                │
                ▼
  new ──署名────┤  ← 署名が鍵ペア所有の証明になる
                ▼
       ランタイム: \`space\` バイトをゼロで確保し、
                   payer から new に \`lamports\` を送金し、
                   new.owner = \`owner\` に設定する
\`\`\`

### 自分で検証する 3 項目

1. **所有者の確認。** スクリプト実行後、\`solana account <market_pubkey>\` を実行する。\`Owner\` 行が \`11111111111111111111111111111111\`（System）であることを確認せよ。本書のスクリプトはこれを \`main.rs:69\` で明示的に要求し、ランタイムはそれに従う。
2. **レント免除計算。** \`solana rent 256\` を実行する。出力はスクリプトが表示した \`rent lamports\` と一致するはずだ。両者は同じ計算式 [\`solana-rent-2.2.1/src/lib.rs:93\`](#) を出所とする — 片方はローカル計算、もう片方は RPC 経由。
3. **レイアウトのオフセット。** \`crates/state/src/lib.rs:43–56\` を開き、フィールド長を手で足し合わせよ。\`quote_mint\` がバイト 80 から始まり、\`_reserved\` がバイト 256 で終わることを確認すること。\`cargo test -p openhl-state\` を実行すれば、コンパイラもこれを保証する — \`lib.rs:67–70\` の \`market_size_is_256_bytes\` テストは、フィールドのサイズが変わった瞬間に失敗する。

---

## 第 2 章への導線

オンチェーンにアカウントを 1 つ持った。5 つのフィールドの中身を正確に把握している。データフィールドは 256 バイトのゼロで、System プログラムがその所有者であり、System には任意データを書き込む命令がないため — そのバイトは所有者が変わらない限り永久にゼロのままである。

所有者を奪い取るには、自前の Solana プログラムが要る。Anchor プログラムではない。\`entrypoint!\`、\`&[AccountInfo]\`、手書きの命令ディスパッチャから組み立てたプログラムだ。第 2 章ではこのプログラムを構築し、同じバリデータにデプロイし、これを使って (a) アカウントの所有権を取り、(b) \`MARKET_DISCRIMINATOR\` のバイトをオフセット 0 に書き込む。

第 2 章のスクリプトが終わったとき、同じ 16 進ダンプの先頭は \`00 00 00 00 00 00 00 00\` ではなく \`4d 41 52 4b 45 54 00 00\` になっている。その 8 バイトの違いが、初めて作る自前プログラムの全可視成果だ — そして不可視の成果は、これからどんな Anchor プログラムがアカウントをデシリアライズするのを見ても、その瞬間に何が起きているか理解できるようになっていることである。
`,
                },
                {
                  title: "第2章 — Anchor を使わずネイティブプログラムを書く",
                  slug: "solana-internals-ch02-native-program-ja",
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 45,
                  xpReward: 100,
                  content: `# 第2章 — Anchor を使わずネイティブプログラムを書く

> 状態: ドラフト (v0.1)。
> 教材コード: \`programs/openhl-core/src/lib.rs\`、\`scripts/init-market/src/main.rs\`。
> 検証対象バージョン: solana-program 2.3.0、solana-program-entrypoint 2.3.0、solana-account-info 2.3.0、solana-program-error 2.2.2、solana-system-interface 1.0.0。

---

## §2.0  はじめに

第 1 章の終わりに、オンチェーンアカウントを 1 つ手にした。256 バイトのゼロ、所有者は System プログラム、しかし 1 ビットも書き換える手段がない — System には「任意のデータを書き込む」命令が存在しないからだ。あのアカウントは器だった。次の段階は、その中身を満たせる唯一の存在を作ることだ。

それが Solana プログラムである。ただし Anchor プログラムではない。本章では、プログラム全体を手で書く。\`lib.rs\` が 1 つ。\`#[derive(Accounts)]\` なし。\`#[program]\` なし。Borsh なし。あるのは \`entrypoint!\`、\`&[AccountInfo]\`、手作業のバイト復号、\`bytemuck\` キャストだけだ。

次の順に進める。

1. \`solana-program-entrypoint\` を開き、\`entrypoint!(process_instruction)\` が実際に展開するものを見る。
2. \`solana-account-info\` を開き、第 1 章の \`Account\` には無く \`AccountInfo\` だけが持つものを確認する。
3. \`programs/openhl-core/src/lib.rs\` を 1 行ずつ歩く — ディスパッチャ、所有者チェック、bytemuck キャスト。
4. \`scripts/init-market/src/main.rs\` を 1 行ずつ歩く — クライアント側の単一トランザクションに 2 つの命令、\`System::Assign\` の後に \`openhl-core::Initialize\`。
5. 実行してアカウントを 16 進ダンプし、\`[0..8]\` のバイトが \`00 00 00 00 00 00 00 00\` から \`4d 41 52 4b 45 54 00 00\` に切り替わる瞬間を観察する — 初めて自前の Solana プログラムを書いた 8 バイト分の対価である。
6. これらを \`#[program]\` + \`#[derive(Accounts)]\` がどう肩代わりしていたかを、責務ごとに対応づけて列挙する。

終えるころには、任意の Anchor プログラムの \`cargo expand\` 出力を読み、生成された関数のどれが本章で自分が書いたどの行に対応するかを特定できるようになっている。コストは Rust 約 160 行に集中して向き合うこと。利益は永続する。

---

## §2.1  \`entrypoint!\` と \`process_instruction\` — プログラムの ABI

Solana プログラムはすべて \`.so\` ファイルで、唯一の C エクスポート関数 \`entrypoint\` を持つ。Solana ローダがこの関数を呼び、シリアライズされたバッファへのポインタを渡す。バッファにはプログラム ID、アカウント群、命令データが入っている。\`entrypoint!\` マクロはこの ABI を Rust 流のファサードで包む。

\`solana-program-entrypoint-2.3.0/src/lib.rs:127–142\` を開こう。

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

15 行。マクロの全体だ。やっていることは 4 つ。

1. \`no_mangle extern "C" entrypoint\` 関数をエクスポートし、ローダが名前で見つけられるようにする。
2. \`$crate::deserialize(input)\` を呼んで、ローダのバイナリ入力を \`(program_id, accounts, instruction_data)\` に分解する — それぞれ \`&Pubkey\`、\`Vec<AccountInfo>\`、\`&[u8]\`。
3. その 3 つを**あなたの**関数（マクロ引数に渡した識別子）に転送する。
4. あなたの \`Result<(), ProgramError>\` を、ローダが期待する \`u64\` 終了コードに変換する（成功なら \`0\`、失敗ならエンコードされたエラー）。

これで全部だ。ルーターもミドルウェアも拡張ポイントもない。\`entrypoint!($fn)\` に渡した Rust 関数 1 つだけが、チェーン全体と自分のプログラムが対話する唯一の地点である。

本書の呼び出しは \`programs/openhl-core/src/lib.rs:25–26\` にある。

\`\`\`rust
#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);
\`\`\`

\`cfg\` ゲートにより、ホスト側バイナリ（クライアントやテスト、要するに型は欲しいが BPF エントリポイントは要らないコード）にこのクレートをリンクするときはエントリポイントを外せる。\`init-market\` クレートは \`no-entrypoint\` 機能を有効にしているので、プログラムの型はリンクされるが BPF エントリポイントは含まれない。クライアント自身の \`main\` と名前衝突するのを防ぐためだ。

本書の \`process_instruction\` は標準的な署名に従う。\`lib.rs:33–37\`。

\`\`\`rust
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
\`\`\`

この署名は \`entrypoint!\` によって固定されている。パラメータを増やすこともできず、別の引数型を取ることもできず、別の戻り値型を返すこともできない。\`ProgramResult\` は \`Result<(), ProgramError>\` の別名にすぎない — \`solana-program-error-2.2.2/src/lib.rs:28\` を見よ。

\`\`\`rust
pub type ProgramResult = std::result::Result<(), ProgramError>;
\`\`\`

\`ProgramError\` 自体は \`src/lib.rs:33–63\` の 24 バリアントの enum で、標準的な失敗モードを網羅する。\`IncorrectProgramId\`、\`NotEnoughAccountKeys\`、\`InvalidAccountData\`、\`AccountAlreadyInitialized\` など。プログラム固有のエラーを返したい場合は \`ProgramError::Custom(u32)\` で独自の数値コードを使える。

**Anchor が隠していること:** Anchor の \`#[program]\` マクロは、まさにこの署名の関数を生成する。Anchor で書く「インストラクション」 — ハンドラ関数群 — はエントリポイントではない。Anchor が生成した独自の \`process_instruction\` が命令データを解析し、ディスクリミネータを引き、アカウントをデシリアライズし、正しいハンドラへ振り分けた**後**にディスパッチされる関数である。マクロが生成するためそのコードは目に入らない。しかし確かに存在しており、形はいま書いたものと同じだ。

> **演習 §2.1.** \`cargo build-sbf --manifest-path programs/openhl-core/Cargo.toml\` でプログラムをビルドせよ。\`target/deploy/openhl_core.so\` を \`nm\`（または \`objdump\`）で調べ、エクスポートされた \`entrypoint\` シンボルを見つけよ。外部リンケージを持つ \`T\`（テキスト/コード）シンボルがそれだけであることを確認すること。

---

## §2.2  \`AccountInfo\` — プログラムが実際に見ているもの

第 1 章では \`Account\` を扱った。\`RpcClient::get_account\` が返す型で、\`data: Vec<u8>\` を所有していた。オンチェーンでは別の型が見える — \`AccountInfo\` だ。

\`solana-account-info-2.3.0/src/lib.rs:19–39\` を開こう。

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

第 1 章の \`Account\`（\`solana-account-2.2.1/src/lib.rs:44–56\`）と並べて見よう。

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

2 つ変わり、3 つ増えた。

**変わった点**は所有権と可変性についてだ。ローダはあなたのプログラムに「ビュー」を渡す — ローダ自身が管理するバッファへの参照だ。プログラムは lamport 残高もデータバイトも所有しない。それは他人のメモリで、あなたは \`Rc<RefCell<&mut _>>\` の借用を受け取る。同一トランザクション内の複数命令から同じアカウントへ別々の \`AccountInfo\` 参照が共存できるように、かつ借用規則を実行時に強制できるようにするためだ。\`Rc\` がいるのは、同じ pubkey に対する \`AccountInfo\` をローダが複数命令にわたり同じインスタンスとして渡すから。\`RefCell\` がいるのは、この状況で Rust の借用チェッカが静的に借用規則を証明できないからである。

**増えた点**は、\`Account\` には存在しない実行時専用情報だ。

- **\`key\`** — アカウント自身の pubkey。\`Account\` は自身の pubkey を持たない。pubkey はオンチェーンのアカウントマップへのインデックスとして外側にある。\`AccountInfo\` は持っている。プログラムは pubkey から計算する場面が日常的だからだ（PDA 派生、アカウント→プログラムのマッピング）。
- **\`is_signer\`** — このアカウントが**外側のトランザクション**に署名したか。ランタイムが \`AccountInfo\` ごと、命令ごとに設定する。
- **\`is_writable\`** — トランザクションがこのアカウントを書き込み可能と宣言したか。たとえプログラム的に書ける条件が揃っていても（所有者が自分、サイズも十分）、トランザクションが書き込み可能と宣言していなければ、書き込みは確定時に失敗する。

この 3 つは、いま走っているトランザクション「について」ランタイムがプログラムに伝える手段だ。あなたが設定したのではない。ローダが設定する。

**Anchor が隠していること:** Anchor の型付きアカウントラッパ（\`Account<'info, T>\`、\`Signer<'info>\`、\`UncheckedAccount<'info>\` など）はすべて、内部に \`AccountInfo\` を持つ — \`to_account_info()\` で取り出せる。ラッパは型レベルのチェック（デシリアライズ、署名要求など）を上に重ねるが、下にある値は同じ \`AccountInfo\` だ。Anchor コードで \`let info = ctx.accounts.market.to_account_info();\` を見たら、それは抽象化を通り抜けて、いま本書が直接扱っている層に手を伸ばしている瞬間である。

> **演習 §2.2.** \`process_initialize\`（\`lib.rs:79–81\`）では \`accounts.first()\` で市場アカウントを取得しているが、\`is_writable\` をチェックしていない。なぜか。（ヒント: 書き込み不可のアカウントが渡された状態で \`try_borrow_mut_data\` を呼んだら、ランタイムはどのエラーコードを返すか。）

---

## §2.3  所有者チェック — プログラムで最も重要な 1 行

アカウントを 1 つ受け取って「これは market だ」と扱う。しかし**それが本物の自分の market であって、たとえば形だけ似たレント免除済み 256 バイトアカウントを誰かがでっち上げたものではない**と、どうやって知るのか。

答えは — 唯一の答えは — **所有者チェック**である。\`programs/openhl-core/src/lib.rs:83–94\` から。

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

第 1 章で確認したランタイム保証はこうだった。アカウントの \`data\` を書き換えられるのは所有プログラムだけ。対偶を取ると、\`owner == program_id\` なら、そのバイトを書き込めたのは**自分たち**だけになる。オフセット 0 のディスクリミネータは、ゼロ（アカウントは存在するが未初期化）か \`MARKET_DISCRIMINATOR\`（自分たちが初期化済み）のいずれかである。それ以外の値にはなりえない。なぜなら、書ける主体が他にいないからだ。

このチェックがなければ、攻撃者は次のことができてしまう。

1. **攻撃者自身**のプログラムが所有する 256 バイトアカウントを確保する。
2. \`data[0..256]\` に任意のバイトを書く。
3. それを本書の \`Initialize\` に渡す。
4. 他のチェックはすべて通る（サイズは 256、ディスクリミネータは攻撃者が設定したもの、ペイロードは正しく復号できる）。
5. プログラムは喜んでバイトを上書きする — しかし、**次回**ディスクリミネータをチェックしたとき見えるのは、自分が書いた値ではなく攻撃者が設定した値だ。さらに悪いことに、後の章で同じアカウントが \`place_order\` に渡されたとき、そのバイトを暗黙に信頼してしまう。

所有者チェックこそが「正しい形の 256 バイト」を「自分が書いた 256 バイト」に変える。これを省くことは、セキュリティモデルを省くことに等しい。

サイズチェック（\`lib.rs:99–106\`）は次に来るが、機械的だ。\`bytemuck::from_bytes_mut::<Market>(buf)\` はバッファが小さすぎるとパニックするので、明示的に拒否して綺麗なエラーコードを返す。初期化済みチェック（\`lib.rs:111–117\`）は 3 番目。ディスクリミネータが非ゼロなら、そのアカウントはすでに生きた \`Market\` なので、踏み潰してはならない。

**Anchor が隠していること:** Anchor の \`#[account(mut)]\` 制約と型付きラッパ \`Account<'info, T>\` が、所有者チェックを代行している。具体的には、Anchor が \`Account<'info, MyType>\` をデシリアライズする際、型付きビューを返す前に \`account.owner == program_id\` をアサートする。失敗すれば、自分のハンドラは呼ばれない。これは「覚えておけ」より確かに安全だ — しかし同時に、多くの Anchor 開発者が**なぜ**そのチェックが存在するかを身体化しないまま済んでしまう。自分の Anchor コードを開いて、所有者チェックを探してみよ。確かにそこにある。ただ、目に見えていないだけだ。

> **演習 §2.3.** \`process_initialize\` を編集して、所有者チェックを意図的にスキップせよ（87–94 行をコメントアウト）。ビルドし直し、第 1 章のアロケータが作った System 所有アカウント（§2.5 で追加する Assign ステップを**経ずに**）を \`Initialize\` に渡すトランザクションを組み立てよ。実行すると何が起きるか。なぜか。

---

## §2.4  データを書く — \`try_borrow_mut_data\` + \`bytemuck\` キャスト

\`AccountInfo::data\` は \`Rc<RefCell<&'a mut [u8]>>\` だ。書き込み可能なスライスを取り出すには \`try_borrow_mut_data()\` を呼ぶ。\`programs/openhl-core/src/lib.rs:147–148\`。

\`\`\`rust
let mut data = market_ai.try_borrow_mut_data()?;
let market: &mut Market = bytemuck::from_bytes_mut(&mut data[..Market::LEN]);
\`\`\`

操作は 2 つ。

1. **\`try_borrow_mut_data()\`** — 失敗しうる。\`RefCell\` がすでに借用されている可能性があるからだ。失敗ケースは \`ProgramError::AccountBorrowFailed\`。同じ \`AccountInfo\` がコールスタックのどこか別の場所で可変借用されている場合に発生する（たとえば同じアカウントで再入する CPI ハンドラなど）。本書のような末端の書き込みなら実務上失敗しない — それでも \`?\` を付けておけば、将来この箇所が二重借用される使い方をされても正しく動く。

2. **\`bytemuck::from_bytes_mut::<Market>(buf)\`** — \`&mut [u8]\` から \`&mut Market\` へのポインタキャスト。安全なのは、\`Market\` が \`Pod\` だからだ。全ビットが有効、パディングなし、\`repr(C)\`。サイズチェック（§2.3）でバッファがちょうど \`Market::LEN\` バイトであることを確認済みなので、キャストは well-defined である。\`&mut [u8]\` が同じバイト列を指す \`&mut Market\` ビューになる。コピーなし、確保なし、純粋な型再解釈である。

キャストが済んだら、フィールドごとに名前で書き込む（\`lib.rs:150–159\`）。

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

書き込みはアカウントのデータバッファ「上で」直接行われる。「保存」呼び出しはない。\`process_instruction\` が \`Ok(())\` を返した時点で、ローダは変更済みのバイトを読み取り、トランザクションの一部として元帳に確定する。

\`_pad0\` と \`_reserved\` のゼロ書き込みが明示的にあることに注意。必要はない（System のアロケータでバイトはすでにゼロ、bytemuck はパディングを追加しない — 構造体側で明示宣言したから）。しかし書いておくと、もしこのアカウントが過去の状態で非ゼロパディングを持つ形で再利用された場合に、コードがロバストになる。新規アカウントには過剰防衛だが、\`realloc\` されたアカウントなら効いてくる。

**Anchor が隠していること:** Anchor の型付きラッパは \`account.fieldname = value;\` を直接書ける。\`try_borrow_mut_data\` を呼ぶ必要はない。ラッパは内部で \`RefMut\` を保持し、\`Drop\` 時にアカウントへフラッシュする。さらに \`init\` 時には 8 バイトディスクリミネータも書き込んでくれる — その代償として、全アカウントが Anchor 独自のディスクリミネータ形式（\`sha256("account:TypeName")\` の先頭 8 バイト）を持つことになる。本書の \`MARKET\\0\\0\` のように人間が読めるものではない。

> **演習 §2.4.** \`market.discriminator = MARKET_DISCRIMINATOR;\` を、オフセット 0 に 1 バイトだけ書き込む形に変えよ（例: \`data[0] = 0x42;\`）。次に \`init-market\` を実行したとき、どのエラーコードが返るか。なぜ破損ではなくそのエラーなのか。

---

## §2.5  クライアント側 — \`Assign\` + \`Initialize\` を 1 トランザクションで

第 1 章で作ったアカウントの所有者は System だ。本書のプログラムはまだ書き込めない — 所有者チェックが落ちる。所有権を奪うには \`System::Assign\` 命令が必要で、市場アカウント自身の鍵ペアで署名する必要がある。

\`scripts/init-market/src/main.rs:117–146\` から。

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

注目したい点は 3 つ。

**\`Assign\` が market の署名を要求する理由。** \`solana-system-interface-1.0.0/src/instruction.rs:621–628\` を開こう。

\`\`\`rust
pub fn assign(pubkey: &Pubkey, owner: &Pubkey) -> Instruction {
    let account_metas = vec![AccountMeta::new(*pubkey, true)];
    // ...
}
\`\`\`

\`AccountMeta::new(*pubkey, true)\` の \`true\` は**署名者の要求**を意味する。第 1 章の \`CreateAccount\` と同じだ。ランタイムは「このアカウントを現在管理している鍵ペアの所有者が、所有権変更に同意している」という証明を要求する。そうでなければ、誰でも任意のレント免除済み System 所有アカウントを、自分が管理するプログラムへ再割り当てして「奪う」ことができてしまう。

**2 つの命令を 1 トランザクションに収めた理由。** トランザクションはアトミックだ。すべての命令が確定するか、まったく何もしないかのどちらかだ。\`[Assign, Initialize]\` を 1 トランザクションに束ねることで、「openhl-core が未初期化の 256 バイトゼロ market を所有している」状態が観測されない。外側から見ると、アカウントは「System 所有 + ゼロデータ」から「openhl-core 所有 + 初期化済みデータ」へ直接遷移する。後の章では、この原子性が「半分初期化されたアカウントを誰かが読んでしまう」種類のバグから守ってくれる。

**Init 命令で \`AccountMeta::new(market.pubkey(), false)\` としている理由。** market アカウントは確かに書き込み可能だ（データを変更する）。しかし \`Initialize\` 命令への**署名**は不要だ。署名要求は命令単位であって、トランザクション単位ではない。Assign は market 鍵ペアの署名を要求する（System プログラムが強制する）が、Initialize は要求しない（本書のプログラムは所有者チェックだけを行い、署名者チェックはしない）。異なるセキュリティモデル、異なる \`is_signer\` フラグ、ということだ。

末尾の \`&[&payer, &market]\` はトランザクション単位の署名者リストだ。トランザクションは署名者を一度だけ集める。各命令の \`AccountMeta\` がその中のどれを必要とするかを宣言する。

> **演習 §2.5.** \`solana-test-validator\` に対して \`init-market\` を実行せよ（\`openhl_core.so\` をデプロイした後で）。同じ market アカウントに対して \`init-market\` をもう一度実行する。2 回目はどのエラーが返るか。さかのぼって \`process_initialize\` のどのチェックが拒否したかを特定せよ。

---

## §2.6  \`#[program]\` と \`#[derive(Accounts)]\` が実際に生成しているもの

第 1 章 §1.5 では \`#[account(init, ...)]\` の展開を歩いた。本章での等価物はさらに大きく、\`#[program]\` + \`#[derive(Accounts)]\` のペア全体だ。突き合わせて並べると次のとおり。

| Anchor がやること | 平文に展開すると |
|---|---|
| \`entrypoint!\` の呼び出しを生成する | \`lib.rs:25–26\` |
| 8 バイトディスクリミネータを復号する \`process_instruction\` を生成する | \`lib.rs:38–48\`（本書は 1 バイトタグを使う） |
| \`#[program]\` 関数 1 つにつき 1 つの match アームを生成し、ハンドラへディスパッチする | \`lib.rs:42–48\` |
| 型付き \`Accounts\` 構造体へアカウントをデシリアライズし、各制約（\`#[account(mut)]\`、\`#[account(signer)]\` など）を強制する | \`lib.rs:79–117\`（所有者チェック、サイズチェック、初期化済みチェック） |
| 全 \`Account<'info, T>\` について \`account.owner == program_id\` をアサートする | \`lib.rs:87–94\` |
| Borsh でハンドラ引数構造体に命令データをデシリアライズする | \`lib.rs:119–135\`（手作業バイト復号） |
| 型付き引数で自分のハンドラ関数を呼ぶ | \`lib.rs:65–162\`（本書のハンドラは \`process_initialize\`） |
| 変更済み \`Account<'info, T>\` を \`Drop\` 時にアカウントデータへシリアライズして戻す | \`lib.rs:147–159\`（本書は in-place で書く） |
| 戻された \`Result<(), Error>\` をローダの \`u64\` 終了コードに変換する | \`entrypoint!\` 自身から継承 |

責務は 8 つ。Anchor はマクロ生成ですべてを処理する。本書は約 130 行の Rust で同じことをした。どちらのアプローチも間違いではない。重要なのは、**8 つの責務がすべて存在する**という事実だ — マクロが隠してくれているだけで、消えてはいない。

Anchor プログラムが期待外の挙動を示したとき — 誤ったアカウントが渡された、署名者チェックが効かない、ディスクリミネータが衝突した、シリアライズ形式が想定外 — このリストを心の中で辿り直し、どのステップで何が起きたかを問うことでデバッグできる。リストを知っていることが、Anchor を自信を持ってデバッグすることと、推測でデバッグすることの差を生む。

---

## §2.7  まとめと自己検証

### まとめ図

\`\`\`
トランザクション
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  命令[0]: System::Assign                                        │
│    accounts: [market (WRITE, SIGNER)]                          │
│    data:     SystemInstruction::Assign { owner: program_id }   │
│    effect:   market.owner: System → openhl_core                │
│                                                                │
│  命令[1]: openhl_core::Initialize                              │
│    accounts: [market (WRITE)]                                  │
│    data:     [tag=0, authority, base_mint, quote_mint,         │
│               tick_size, lot_size]                             │
│    effect:   market.data[0..256] = 初期化済み Market レイアウト│
│                                                                │
│  署名者: [payer, market]                                       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
   アトミック確定: 両方の命令が適用されるか、どちらも適用されない
\`\`\`

### 自分で検証する 3 項目

1. **ディスクリミネータが切り替わった。** \`init-market\` を実行した後、16 進ダンプの先頭は \`4d 41 52 4b 45 54 00 00\`（= "MARKET\\0\\0"）になっているはずだ。\`init-market\` を実行して確認せよ。第 1 章の全ゼロ出力と比べてみよ — この 8 バイトが、初めて Solana プログラムを書いた可視成果のすべてである。
2. **所有者が変わった。** \`init-market\` の後、\`solana account <market_pubkey>\` を実行せよ。\`Owner\` 行は、いまやデプロイ済みの \`openhl-core\` プログラム ID を示し、\`11111111111111111111111111111111\` ではないはずだ。\`Assign\` 命令がそれを行い、\`Initialize\` 命令はその結果に依存していた。
3. **再実行が拒否された。** 同じ market に対して \`init-market\` を 2 回目に実行せよ。トランザクションは失敗するはずだ。オンチェーンログ（\`solana logs --include-failed\`）を辿り、\`lib.rs:114\` からの \`initialize: market already initialized\` メッセージを見つけよ。\`lib.rs:111–117\` の初期化済みチェックが拒否したのだ。

---

## 第 3 章への導線

アカウントを作って所有することはできるようになった。しかし、まだ**プログラムからアドレスが導出されるアカウント**を作ることはできない。第 1 章と第 2 章で扱ったすべてのアカウントは、クライアント側で生成したアドホックな鍵ペアで識別されていた。1 アカウントのデモには通用するが、それ以外には通用しない。次回、特定の \`(base_mint, quote_mint)\` ペアに対する market アカウントを、鍵ペアをオフチェーンに保管せずどう見つけるのか。ユーザのポジションアカウントを、データベースでマッピングを追わずにユーザのウォレットへどう紐付けるのか。

答えは Program-Derived Address (PDA) だ。シードとプログラム ID から数学的に派生される pubkey で、対応する秘密鍵を持たない。第 3 章では派生を手で歩き、\`invoke_signed\` がどう「プログラムが所有する PDA のために」プログラム自身に署名させるかを示し、第 1 章の \`Keypair::new()\` を \`find_program_address(&[b"market", base_mint.as_ref(), quote_mint.as_ref()], program_id)\` の派生に置き換える。

第 3 章が終わったとき、同じ market は**予測可能な**アドレスに住んでいる。base mint と quote mint を知る任意のクライアントが、外部状態なしにアドレスを再計算できる — それこそが Solana プログラムをコンポーザブルにする本質である。
`,
                },
                {
                  title: "第3章 — PDA を原理から組み立てる",
                  slug: "solana-internals-ch03-pdas-ja",
                  type: 'CONTENT',
                  sortOrder: 2,
                  duration: 45,
                  xpReward: 100,
                  content: `# 第3章 — PDA を原理から組み立てる

> 状態: ドラフト (v0.1)。
> 教材コード: \`programs/openhl-core/src/lib.rs\`（\`process_create_market\` ハンドラ）、\`scripts/create-market/src/main.rs\`。
> 検証対象バージョン: solana-pubkey 2.4.0、solana-cpi 2.2.1、solana-system-interface 1.0.0、solana-program 2.3.0。

---

## §3.0  はじめに

第 1 章と第 2 章で扱ったアカウントは、すべて**アドホックな**鍵ペアで識別されていた — クライアント側で \`Keypair::new()\` を生成し、作成・割当のトランザクションに署名させ、その後は破棄する。単体デモには通用するが、それ以外には通用しない。

3 週間後にユーザが \`(SOL, USDC)\` の market アカウントを引きたいと考えた場合を想像しよう。ユーザ自身がその market を作ったわけではない。鍵ペアも持っていない。「全 market を走査する」オンチェーン台帳もない。アカウントを見つける唯一の方法は、プログラム側がその住所を**指定**することだ — \`(base_mint, quote_mint)\` とプログラム ID という識別パラメータから、誰でも再計算できる形でアドレスを導出する。対応する秘密鍵を持たない、プログラムに紐付いた公開鍵派生である。

それが Program-Derived Address (PDA) だ。本章では次の順に進める。

1. \`solana-pubkey\` を開き、PDA 派生アルゴリズムを読む — シードとプログラム ID と特別なマーカーの sha256、そして結果を ed25519 曲線から外すための 1 バイト「bump」。
2. \`find_program_address\`（およびその兄弟 \`create_program_address\`）を 1 行ずつ歩き、片方が反復し片方が反復しない理由を理解する。
3. \`solana-cpi\` を開き、\`invoke_signed\` を読む。プログラムが自分の所有する PDA に対して、シードをランタイムへ渡し直すことで「署名」する仕組みを見る。
4. 新しい \`process_create_market\` ハンドラを歩く: PDA を派生し、呼び出し元が正しいアカウントを渡したか検証し、System へ CPI でアロケート要求を出し、レイアウトを書き、bump を保存する。
5. 単一トランザクションが第 2 章の 2 段階 \`[Assign, Initialize]\` フローを置き換える瞬間を観察する。
6. 同じ \`(base_mint, quote_mint)\` でクライアントを再実行し、System プログラムが重複作成を拒否するのを見る — アドレスは固定されている。

終えるころには、任意の Anchor \`#[account(init, seeds = [...], bump)]\` 制約を見て、それが展開する派生・CPI・署名の全段取りを辿れるようになる。そして「プログラムが、渡されたアカウントが派生 PDA と一致するか検証し忘れた」から始まる PDA 系のエクスプロイトがなぜ多いのかも理解できる。

---

## §3.1  PDA アルゴリズム

通常の Solana 公開鍵は、ed25519 楕円曲線上の 32 バイトの点である。対応する秘密鍵があり、その秘密鍵がトランザクションに署名する。PDA は意図的に曲線上の**点ではない** — 32 バイトのハッシュであって、結果として曲線の**外側**に落ちる。つまり、どの ed25519 秘密鍵もその PDA に対する署名を生成できない。クライアント側からは絶対に署名できない。それを派生したプログラムだけが、\`invoke_signed\` を通じて使用を許可できる。

アルゴリズムは \`solana-pubkey-2.4.0/src/lib.rs:911–958\` にある。ハッシュ構築そのものは 928–933 行。

\`\`\`rust
let mut hasher = solana_sha256_hasher::Hasher::default();
for seed in seeds.iter() {
    hasher.hash(seed);
}
hasher.hashv(&[program_id.as_ref(), PDA_MARKER]);
let hash = hasher.result();
\`\`\`

ハッシュへの入力は 3 種類。

1. **各シード**を、連結する順に投入。
2. **プログラム ID**（32 バイト）。
3. **\`PDA_MARKER\`**、\`lib.rs:52\` に定義された 21 バイト定数。
   \`\`\`rust
   const PDA_MARKER: &[u8; 21] = b"ProgramDerivedAddress";
   \`\`\`

このマーカーがあることで、誰かが**通常の**鍵ペアを生成して PDA と衝突する公開鍵を作る、という攻撃を阻止できる。本物の ed25519 鍵はシード材料の後ろに \`b"ProgramDerivedAddress"\` を付けてハッシュして生成されることがない以上、PDA は通常鍵と取り違えられない。

ハッシュの後、32 バイトのダイジェストは曲線判定にかけられる。\`lib.rs:935–937\`。

\`\`\`rust
if bytes_are_curve_point(hash) {
    return Err(PubkeyError::InvalidSeeds);
}
\`\`\`

ハッシュがたまたま ed25519 曲線上に落ちた場合は拒否される。理由は、そのアドレスは原理的にはどこかの秘密鍵で署名されうるからだ（確率は 50%）。PDA の存在意義は、派生プログラム以外の誰も署名できないことにある。候補シードのおよそ半数が曲線上に落ち、拒否される。

ランタイムは構造的な上限も強制する。\`lib.rs:45–47\`。

\`\`\`rust
pub const MAX_SEED_LEN: usize = 32;
// ...
pub const MAX_SEEDS: usize = 16;
\`\`\`

シードは最大 16 個、それぞれ最大 32 バイト。通常の使い方ではまず到達しない。最悪のシステムコールコストを上限で抑えるためのものだ。

**SDK が隠していること:** Anchor の \`seeds = [b"market", base_mint.key().as_ref(), quote_mint.key().as_ref()]\` 制約は、コード生成時にこの同じアルゴリズムへシード配列を直接渡している。制約はあわせて構造体に \`bump\` フィールドも書き込む — §3.2 で見る同じバイトだ。Anchor はその由来を見せないだけである。

> **演習 §3.1.** \`create_program_address\` に空のシードリストを渡すと何が起きるか。関数冒頭を確認せよ。挙動は意図的だが、見落としやすい。

---

## §3.2  \`find_program_address\` vs \`create_program_address\` — bump 反復

任意のシード入力の半数は曲線上に落ち、失敗する。それなら、与えられたシードセットに対して有効な PDA をどう見つけるか。1 バイトのカウンタ（**bump**）を末尾に追加し、255 から始めて \`create_program_address(seeds || [bump])\` を試し、曲線外のハッシュが出るまで bump を 1 ずつ減らす。これが \`find_program_address\` だ。

\`solana-pubkey-2.4.0/src/lib.rs:823–862\` から（オフチェーン側のパス）。

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
    // (target_os = "solana" ブランチは sol_try_find_program_address syscall に委譲)
}
\`\`\`

関数は 255、254、253... と試し、最初に成功した値を返す。「正規 bump」は**最も大きい**有効値 — 最初に試される値だ — である。クライアントとプログラムが同じ PDA を派生する必要があり、「最大の有効 bump」は一意の決定論的答えになるからだ。

最初の有効 bump が 255 であるシード（よくある）なら、ループは 1 回で済む。運の悪いシード組み合わせだと数回回り、オンチェーンで 1 回あたり約 1,500 CU を消費する。このコストを毎 CPI で払わないために、プログラムは \`find_program_address\` が成功した最初の機会に **bump をアカウントデータに保存**する。以降は \`create_program_address(seeds || stored_bump)\` を使えば反復はゼロだ。\`process_create_market\` がまさにそれを \`lib.rs:312\` で行っている。

\`\`\`rust
market.bump = bump;
\`\`\`

対照的に \`create_program_address\` は、完全に指定されたシードリストを受け取って、成功か失敗を返すだけだ。**検証**には適している（安価で決定論的）が、**探索**には不向きだ（試すべき bump を知らない）。探索と保存は \`find_program_address\` で 1 度行い、以降の検証は \`create_program_address\` で済ませる。

**SDK が隠していること:** Anchor の \`bump\` 制約は \`init\` 時に bump を保存し、以降のアクセス時の \`bump = market.bump\` 形式は保存済みの値を使う（反復しない）。最適化は本書と同じ。隠れているのは保存場所だけだ。

> **演習 §3.2.** シード接頭辞を 3 つ選んで（例: \`b"market"\`、\`b"position"\`、\`b"vault"\`）、それぞれに \`find_program_address(&[prefix, &[0u8; 32], &[0u8; 32]], &your_keypair.pubkey())\` を小さな Rust テストで呼んでみよ。返ってきた bump を記録すること。少なくとも 2 つは 255 になるはずだ。なぜ 255 がそれほど頻繁に出るのか。

---

## §3.3  \`invoke_signed\` — プログラムが自身の PDA のために署名する仕組み

PDA には秘密鍵がない。では、新アカウントが**署名**する必要のある \`System::create_account\` のような CPI を、新アカウントが PDA であるときどうやって成立させるのか。

答え: **プログラム**が PDA のために署名する。シード（bump 含む）を CPI と一緒に渡すことで。ランタイムはそのシードとプログラム ID から PDA を再派生し、CPI が操作対象としているアカウントと一致すれば、プログラムを署名者として受け入れる。

\`solana-cpi-2.2.1/src/lib.rs:251–273\` から。

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

\`signers_seeds\` パラメータの型は \`&[&[&[u8]]]\` — シードセットのスライスで、署名対象 PDA ごとに 1 セットだ。各内側 \`&[&[u8]]\` は、\`create_program_address\` に渡すものとまったく同じ形。

本書での呼び出しは \`programs/openhl-core/src/lib.rs:297–301\`。

\`\`\`rust
invoke_signed(
    &create_ix,
    &[payer_ai.clone(), market_ai.clone(), system_ai.clone()],
    &[&[MARKET_SEED, base_mint.as_ref(), quote_mint.as_ref(), &[bump]]],
)?;
\`\`\`

\`invoke_signed\` に渡すシードは、**PDA を派生したときと同じシード**に bump を加えたものだ。ランタイムはそれをハッシュし、結果が \`market_ai.key\` と等しいことを確認し、そのアカウントの署名者としてプログラムを扱う。CPI はあたかも market PDA が本物の ed25519 署名をしたかのように進む。

決定的な不変条件: ハッシュに埋め込まれるプログラム ID は**常に呼び出し元プログラム**だ。**別の**プログラムの ID から派生した PDA に対して \`invoke_signed\` することはできない。これが、PDA の所有権をプログラムローカルに閉じ込めている仕組みだ — 派生したプログラムだけが、そのアドレスに署名できる。

**SDK が隠していること:** Anchor の \`init\` 制約は、まさにこの \`invoke_signed\` 呼び出しを生成する。シードは \`seeds = [...]\` 制約から、bump は \`bump\` ストレージから取る。マクロ生成のため CPI は目に見えないが、コードは同じだ。

> **演習 §3.3.** \`process_create_market\` を編集し、**間違った** bump（例: \`bump.wrapping_sub(1)\`）で \`invoke_signed\` を呼ぶよう書き換えよ。どのエラーが返るか。ランタイムのどのチェックで弾かれているか辿ること。

---

## §3.4  \`process_create_market\` — プログラム側

これでプログラムを歩ける。\`programs/openhl-core/src/lib.rs:196–321\` から。ハンドラ内の番号付き 6 ステップ。(1)〜(3) はペイロードサイズ、署名者チェック、System プログラム ID 一致チェック — 単純なパラメータ検証だ。面白い部分は (4) から始まる。

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

\`market_ai.key != &expected_pda\` のチェックこそが構造全体を安全にする。これがなければ、プログラムは呼び出し元がスロット 1 に入れた任意のアカウントに対して操作を始めてしまう — \`invoke_signed\` のシード対鍵チェックが後で不整合を捕捉するが、よりわかりにくいエラーで落ちる。明示的な検証なら、綺麗なメッセージで即座に失敗する。

ここに微妙な点が 1 つある。\`process_create_market\` では常に \`find_program_address\`（反復する側）を呼んでいる。安価な代替があるのになぜか。なぜ \`create_program_address(seeds || [bump])\` を、クライアント供給の bump を信じて使わないのか。アカウントがまだ存在しないから — 読み込める \`market.bump\` がオンチェーンにない。クライアントが命令データで bump を渡す手はあるが、それでもプログラムは検証し直さなければならない。\`find_program_address\` をここで使うのは、作成時 1 回だけ約 1500 CU を払うトレードだ。この market への以降の操作（後の章で扱う）はアカウントから \`market.bump\` を読み、無料の \`create_program_address\` で検証する。

ステップ (5) は §3.3 で見た CPI そのもの — bump を最後のシードに加えた \`invoke_signed\`。ステップ (6) は Market レイアウトの書き込みで、第 2 章の \`process_initialize\` とほぼ同じ。違いは \`lib.rs:312\` の 1 行だけだ。

\`\`\`rust
market.bump = bump;
\`\`\`

bump がアカウント自身に永続化される。今後この market に触れる任意の命令 — \`place_order\`、\`cancel\`、\`settle\` — は \`market.bump\` を読み、\`create_program_address\` で無料に検証する。

> **演習 §3.4.** 明示的な PDA 検証（\`if market_ai.key != &expected_pda\` ブロック）を削除せよ。ビルド・デプロイし、PDA の代わりに新しい \`Keypair::new()\` を market アカウントとして渡す \`CreateMarket\` トランザクションを組み立てよ。ランタイムはどのエラーを返すか。明示チェックを残す価値はなぜあるか。

---

## §3.5  クライアント — 1 命令、市場鍵ペア不要

クライアント側は大幅に簡略化される。\`scripts/create-market/src/main.rs\` から。

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

第 2 章の \`init-market\` と比べてみよう。あちらでは次のものが必要だった。

- クライアント側で生成した market \`Keypair::new()\`
- 2 つの命令: \`[System::Assign, openhl-core::Initialize]\`
- 2 名の署名者: \`[&payer, &market]\`

本章のバージョンには次しかない。

- シードから派生される market **PDA**（鍵ペアなし、秘密なし）
- 1 つの命令: \`openhl-core::CreateMarket\`
- 1 名の署名者: \`[&payer]\`

market アカウントは \`AccountMeta::new(market_pda, false)\` で渡される — 書き込み可能、署名者ではない。署名する鍵ペアがない。署名はプログラム内部で発生し、\`invoke_signed\` がシードを供給する。

クライアントが使う \`MARKET_SEED\` 定数はプログラムクレートから直接インポートしている。\`scripts/create-market/Cargo.toml\`。

\`\`\`toml
openhl-core = { path = "../../programs/openhl-core", features = ["no-entrypoint"] }
\`\`\`

\`no-entrypoint\` 機能を有効にすることで、プログラムの型と定数はホストバイナリから利用できるようになり、BPF エントリポイントは持ち込まれない。クライアントは \`openhl_core::MARKET_SEED\` を使う — クライアントとプログラムがシード接頭辞についてコピペなしで合意する保証になる。

> **演習 §3.5.** \`create-market\` を同じ \`--base-mint\` と \`--quote-mint\` で 2 回実行せよ。2 回目は失敗する。バリデータが返すエラーは System プログラムに言及している。System プログラムのソース（\`solana-system-interface-1.0.0/src/error.rs\`）でそれを見つけ、バリアントを特定せよ。

---

## §3.6  \`#[account(init, seeds = [...], bump)]\` が実際に生成しているもの

Anchor の PDA 版 \`init\` 制約は、本章で行った作業のすべてに、第 1 章と第 2 章で行った作業を上乗せした形に展開される。突き合わせて並べると次のとおり。

| Anchor がやること | 平文に展開すると |
|---|---|
| 属性から \`seeds = [...]\` を読む | \`process_create_market\` がペイロードから復号する（\`lib.rs:235–251\`） |
| \`find_program_address(seeds, program_id)\` で bump を取得する | \`lib.rs:268–271\` |
| bump を型付き \`Account<T>\` に保存し、以降のアクセスを安価にする | \`lib.rs:312\` の \`market.bump = bump;\` |
| \`passed_account.key == derived_pda\` をアサートする | \`lib.rs:272–279\`（明示チェック） |
| \`Rent::get()?.minimum_balance(space)\` を呼ぶ | \`lib.rs:289\` |
| \`system_instruction::create_account(payer, pda, lamports, space, program_id)\` を組み立てる | \`lib.rs:290–296\` |
| \`invoke_signed(create_ix, accounts, &[seeds || bump])\` を呼ぶ | \`lib.rs:297–301\` |
| Anchor の 8 バイトディスクリミネータを \`data[0..8]\` に書く | \`lib.rs:310\` の \`market.discriminator = MARKET_DISCRIMINATOR;\` |
| 型付き \`Account<T>\` を \`Drop\` 時にアカウントへシリアライズし戻す | \`lib.rs:310–319\` の in-place フィールド書き込み |

PDA ベースの \`init\` で責務は 9 つ。Anchor は 1 つの属性で表現し、本書は約 60 行を要した。

Anchor が行い本書が**まだ**やっていないことが 1 つある。以降のアクセスごとに**正規 bump チェック**を生成することだ。後で \`#[account(seeds = [...], bump = market.bump)]\` と書くと、Anchor は \`create_program_address(seeds || bump)\` を呼び、結果が渡されたアカウントの鍵と等しいことをアサートする。§3.2 で触れた安価な検証だ — アクセス 1 回ごとに支払い、反復はなし。今後の章では同じチェックが必要になる。本書では market に触れるたびに手で書く。

---

## §3.7  まとめと自己検証

### まとめ図

\`\`\`
クライアント                           プログラム                              ランタイム
────────                             ─────────                              ──────────
find_program_address(           ──┐
  [b"market", base, quote],       │
  program_id) → (pda, bump)       │
                                  ▼
ix を組み立てる:                       process_create_market
  accounts: [payer S+W,                  find_program_address(
            pda W,                          [b"market", base, quote],
            system r/o]                     program_id) → (pda, bump)
  data: [tag=1, ...]                     assert market_ai.key == pda
                                         Rent::get().minimum_balance(...)
[payer] で署名                          invoke_signed(
                                           create_account(payer, pda,
send_and_confirm_tx           ─────►       lamports, space, program_id),
                                           accounts,
                                           &[&[b"market", base, quote, [bump]]]
                                         )
                                                                  │
                                                                  ▼
                                                            ランタイム: シードをハッシュ、
                                                            == pda を検証、
                                                            プログラムを署名者として受理、
                                                            System::create_account を実行
                                         Market レイアウトを書く（market.bump = bump 含む）
                                         Ok を返す
\`\`\`

### 自分で検証する 3 項目

1. **決定論的アドレス。** \`create-market\` を実行し、表示された \`market PDA\` を控える。オンチェーンアカウントを削除する（または新しい \`solana-test-validator\` を使う）。同じ \`--base-mint\`、\`--quote-mint\`、\`--program\` で再実行する。表示されるアドレスはバイトレベルで同一のはずだ。次に \`--base-mint\` と \`--quote-mint\` の順序を入れ替えて実行する。アドレスは変わるはずだ — シードの順序は派生の一部だ。
2. **bump が保存されている。** \`create-market\` を実行した後、16 進ダンプはオフセット 9（\`bump\` フィールド）に非ゼロのバイトを示すはずだ。クライアントは自分が派生した bump と、プログラムが書き込んだ bump の両方を表示する。両者は一致しなければならない。\`scripts/create-market/src/main.rs:163\` で確認せよ。
3. **秘密鍵不要。** \`solana account <market_pda>\` で \`Owner\` がプログラム ID であることを確認せよ。\`~/.config/solana/\` 内に対応するエントリはなく、どこにも鍵ペアファイルはない — このアドレスには秘密鍵がない。これが PDA を永続的にする仕組みだ。盗もうにも盗む鍵が存在しない。

---

## 第 4 章への導線

プログラムがアカウントを所有でき、アドホックな鍵ペアではなく自前のシードからアドレスを派生できるようになった。しかしまだ**数えなければならない**場面には出くわしていない。これまでの命令はすべて、Solana のトランザクション単位コンピュートバジェット — 既定 200,000 コンピュートユニット (CU)、要求すれば最大 140 万 — の中に余裕で収まっていた。何かループするものを追加した瞬間 — 板マッチング、バッチ決済、ちょっと込み入った Borsh 構造体の復号でも — CU が最初の制約として効いてくる。

第 4 章ではコンピュートバジェットを実エンジニアリング上の関心事として導入する。\`Initialize\` 命令に CU 計測を追加し（\`sol_log_compute_units\` システムコール経由）、各部分のコストをベンチマークし、プログラムが \`Box\` や \`Vec\` を「無料」のように扱える錯覚を成立させているヒープアロケータを歩き、CU 上限の中に収まる必要のある \`place_order\` 命令を追加する。章末では、Phase A と Phase B の残りすべてを駆動する問いを立てる: 200,000 CU の中で動く板マッチャをどう書くか。
`,
                },
                {
                  title: "第4章 — コンピュートバジェットとヒープの規律",
                  slug: "solana-internals-ch04-compute-budget-ja",
                  type: 'CONTENT',
                  sortOrder: 3,
                  duration: 45,
                  xpReward: 100,
                  content: `# 第4章 — コンピュートバジェットとヒープの規律

> 状態: ドラフト (v0.1)。
> 教材コード: \`programs/openhl-core/src/lib.rs\`（\`process_bench\`、355–402 行）、\`scripts/bench/src/main.rs\`。
> 検証対象バージョン: solana-program 2.3.0、solana-program-entrypoint 2.3.0、solana-compute-budget-interface 2.2.2。

---

## §4.0  はじめに

ここまでに書いた命令はすべて、ほぼ同じ程度のコンピュートしか消費していなかった — 数千ユニット程度。ランタイムのトランザクション単位上限 — 既定 200,000 コンピュートユニット (CU) — は視界にすら入ってこなかった。書いた量がほんの少しだったから、何を書いても許された。

その猶予は、何かに**比例した**処理を始めた瞬間に終わる。ループ内のハッシュ。板の線形走査。非自明な構造体の Borsh 復号。どれも入力に応じて CU が増えるプロファイルを持ち、そのプロファイルが他のどの制約より先に壊れる。

本章は数を勘定することを学ぶ場所だ。次の順に進める。

1. \`solana-program::log\` を開き、\`sol_log_compute_units\` を読む — 実行時に自身を計測するためにプログラムが持つ唯一の道具。
2. \`solana-program-entrypoint\` を開き、全プログラムのヒープを支える \`BumpAllocator\` を読む。\`dealloc\` が no-op である理由と、それが \`Vec\` や \`Box\` に何を意味するかを理解する。
3. 厳格な上限 — 既定ヒープ 32 KiB、既定 CU 200,000、絶対最大 CU 1.4M — と、それらが住む定数を確認する。
4. \`solana-compute-budget-interface\` を開き、\`ComputeBudgetInstruction\` enum を読む。これがトランザクション単位で CU 上限を引き上げる。
5. 新しい \`process_bench\` ハンドラを歩く。ヒープバッファを確保し、\`sol_log_compute_units\` で挟みながら sha256 を反復することで、フェーズごとの CU コストが読める形になっている。
6. 新しい \`bench\` クライアントを歩く。任意で \`set_compute_unit_limit\` を前置でき、プログラムログとランタイムの \`units_consumed\` 数値の両方を表示する。

終えるころには、出荷前に「この命令が既定バジェットに収まるか」を予測でき、収まらないときに何をリクエストすべきかが分かるようになる。

---

## §4.1  コンピュートユニットの正体

Solana の VM はサンドボックス化された BPF インタプリタだ。VM 内で実行される全命令には固定の CU コストが付く: 単純な ALU 演算は 1、ハッシュ syscall はもっと、別プログラムへの CPI はさらに多い。ランタイムはトランザクション単位のカウンタを持ち、上限（既定 200,000）から開始し、各操作の実行に応じて減算する。ゼロに達すると、トランザクションは \`ComputationalBudgetExceeded\` で中断される。

これは現実世界のミリ秒ではない。次のことが可能になるよう、ランタイムが定義する抽象的な経済単位だ。

1. **作業に対して公正に課金する** — 優先手数料は消費 CU に比例する。
2. **トランザクション実行時間に上限をつける**。ホスト時計を使わない（バリデータ間で非決定論になるから）。
3. **スケジューリングを予測可能にする** — トランザクションがブロックに収まるかをランタイムが事前判定できる。

トランザクション単位の既定 CU 上限は 200,000。トランザクションが要求できる最大は 1,400,000。両方ともネットワーク定数で、時とともに変わってきた。単一の Rust ファイルには存在しない（ランタイムの feature gate 内に住む）。最新値の確認はバリデータの CLI（\`solana program-buffer-info\` ほか）か公式ドキュメントが正しい場所だ。

コードに**ある**のは、プログラムが自身を計測する道具 — \`sol_log_compute_units\`、\`solana-program-2.3.0/src/log.rs:92–101\`。

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

syscall が 1 つ。呼ばれた瞬間の**残り** CU を出力する。連続する 2 つの読み値を引き算すれば、その間に行った作業のコストが出る。道具はそれだけだ。

**SDK が隠していること:** Anchor はこれらの呼び出しを自動挿入しない。Anchor プログラムで CU 計測がしたければ、\`solana_program::log::sol_log_compute_units();\` を自分で書く — まさに本書と同じだ。

> **演習 §4.1.** noop 命令の中で \`sol_log_compute_units\` を 2 行連続で呼び（1 行間隔で）、1 回の呼び出し自体の CU コストを算出せよ。最初の読み値から 2 つ目を引いた差が、この呼び出し自身のコストになる。ほとんどのプログラムは会計上ゼロとして扱うが、実際には十数 CU だ。

---

## §4.2  ヒープ — 解放しない bump アロケータ

Solana プログラムは固定サイズのヒープアリーナで動く。既定サイズは \`solana-program-entrypoint-2.3.0/src/lib.rs:40–42\`。

\`\`\`rust
pub const HEAP_START_ADDRESS: u64 = 0x300000000;
// ...
pub const HEAP_LENGTH: usize = 32 * 1024;
\`\`\`

32 キビバイト。これが、命令 1 つの実行中にプログラムが確保するすべての \`Vec\`、\`Box\`、\`String\`、\`HashMap\` に使えるヒープ全体だ。使い切ると、グローバルアロケータは null ポインタを返し、Rust のアロケーション失敗ハンドラがプログラムを中断する。

ヒープを支えるアロケータは \`lib.rs:291–302\`。

\`\`\`rust
pub struct BumpAllocator {
    pub start: usize,
    pub len: usize,
}
\`\`\`

そして \`GlobalAlloc\` 実装は \`lib.rs:342–364\`。

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

吸収すべき点は 2 つ。

1 つ目、**\`dealloc\` は no-op**。\`Vec\` を drop しても、\`Box\` を drop しても、関数から return しても、確保した領域は命令の残り時間ずっと確保されたままだ。すべての確保が、プログラムが終わるまで永続する。これは意図的なトレードだ — 本物のフリーリスト型アロケータは維持に CU を食うし、命令 1 つの寿命は短いので断片化はヒープサイズで上限を取れる。

2 つ目、**bump ポインタは末尾から下方向に伸びる**（\`pos = pos.saturating_sub(layout.size())\` を見よ）。\`pos\` がヒープ基底より下に落ちると、\`alloc\` は null を返し、プログラムはパニックする。本書の \`Bench\` ではこれを意図的に発火させる — \`--heap-bytes 65536\`（ヒープサイズの 2 倍）を渡せば OOM になる。

**SDK が隠していること:** Anchor は確保を**推奨**したことは一度もないが、\`Vec\` バックドアカウント（\`Vec<Pubkey>\`、\`BTreeMap\` 等）は内部でこのヒープに依存している。10,000 エントリのベクタをアカウントからデシリアライズすると、軽快に ~80 KiB のヒープを請求してプログラムがクラッシュする — 「ヒープは 32 KiB で何も解放しない」を思い出すまで、原因がわからない。

> **演習 §4.2.** \`process_bench\` に 2 つ目の \`vec![0u8; heap_bytes]\` 確保を、1 つ目の直後に追加せよ。\`--heap-bytes 8192\` ならプログラムは成功する（8 KiB + 8 KiB ≈ 16 KiB、32 KiB 以内）。\`--heap-bytes 16384\` だと OOM になる。両方の結末を確認せよ。

---

## §4.3  上限を上げる — \`ComputeBudgetInstruction\`

短い命令なら既定の CU 上限で十分だ。それ以上 — Borsh 復号、CLOB マッチ、多段 CPI チェーン — のためには、追加を明示的に要求しなければならない。仕組みは、ユーザプログラムが走る前にランタイムが処理する、トランザクションレベルの特別な命令だ。

\`solana-compute-budget-interface-2.2.2/src/lib.rs:24–38\` から。

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

レバーは 4 つ、それぞれにコンストラクタが \`lib.rs:55–67\` にある。日常的に使うのは次の 2 つ。

- **\`set_compute_unit_limit(units)\`** — トランザクション全体の CU 上限を引き上げる。1,400,000 までの任意の値を渡せる。
- **\`request_heap_frame(bytes)\`** — プログラムあたりのヒープサイズを引き上げる。1024 の倍数でなければならない。32 KiB 以上のヒープが本当に必要なときに使う。

本書の \`bench\` クライアントは \`scripts/bench/src/main.rs:101–102\` で \`set_compute_unit_limit\` を使う。

\`\`\`rust
if let Some(limit) = cli.cu_limit {
    instructions.push(ComputeBudgetInstruction::set_compute_unit_limit(limit));
}
\`\`\`

compute-budget 命令はトランザクション内の位置に関わらずランタイムが処理するが、読みやすさのため慣例で最初に置く。アカウントリストはない — ランタイムの実行前フェーズがデータとして解釈するだけだ。

覚えておきたい性質が 3 つ。

1. **同種は 1 トランザクションに 1 つ。** 同じ tx 内の 2 つ目の \`SetComputeUnitLimit\` は \`DuplicateInstruction\` で拒否される。
2. **部分返金はない。** 1M CU を要求してプログラムが 50K しか使わなくても、優先手数料の計算では 1M 上限が基準になる（通常のトランザクション手数料には影響しない）。
3. **それ自体が CU を消費する。** compute-budget 命令の処理に約 150 CU かかり、トランザクション合計に含まれる。

**SDK が隠していること:** Anchor は compute-budget 命令を自動で前置しない。クライアント側で、Anchor が生成した命令の前に自分で追加する。これを忘れて、ハンドラが 200K CU を超えた瞬間に「transaction simulation failed」という謎エラーが出る Anchor ユーザは多い。

> **演習 §4.3.** \`--cu-limit\` なしで \`bench --rounds 200 --heap-bytes 256\` を実行せよ。\`units_consumed\` の値を控える。次に \`--cu-limit 50000\` を追加する。プログラムは成功するか失敗するか。なぜか。（ヒント: 1 回目の \`units_consumed\` と設定した上限を比べよ。）

---

## §4.4  \`process_bench\` を歩く

ハンドラは小さい — \`programs/openhl-core/src/lib.rs:355–402\` の約 50 行。構造は、\`sol_log_compute_units\` で挟まれた 3 フェーズだ。

**入口。** 8 バイトのペイロードを復号し（\`rounds: u32 LE\`、\`heap_bytes: u32 LE\`）、開始 CU を記録する。

\`\`\`rust
msg!("bench: start (rounds={}, heap_bytes={})", rounds, heap_bytes);
sol_log_compute_units();
\`\`\`

**フェーズ A — ヒープ。** バッファを確保し、もう一度記録する。

\`\`\`rust
let mut buf = vec![0u8; heap_bytes as usize];
msg!("bench: after heap alloc ({} bytes)", buf.len());
sol_log_compute_units();
\`\`\`

\`vec!\` マクロが bump アロケータを呼ぶ。最初のログ読み値からこの読み値を引いた差が、\`heap_bytes\` バイト確保の**コスト**だ。驚くほど小さい — bump アロケータはポインタ減算 1 つだけだから — が、syscall スタブのオーバーヘッドに比例する形になり、バイト数には比例しない。

**フェーズ B — ハッシュループ。** sha256 を \`rounds\` 回反復し、毎回ダイジェストをバッファに戻す。

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

ここが実際に CU を燃やす作業だ。\`sha256\` は BPF 上では syscall（\`sol_sha256_\`）で、コストは入力長に依存する。フェーズ A の読み値からフェーズ B の読み値を引いた差が、1 ラウンドあたりの CU コスト — おおよそ \`(sha256 syscall 基本コスト) + (バイトあたりコスト × heap_bytes)\` だ。

\`lib.rs:392\` のカウンタとの XOR は、オプティマイザに正直でいてもらうために存在する。これがないと、毎回同じバイトをハッシュすることになり、十分に攻撃的なオプティマイザはループを潰してしまう可能性がある。\`i\` をバッファに混ぜることで、各反復の入力が本当に異なるものになる。

最後の \`_\` 読み値は、関数 return 時に \`sol_log_compute_units\` が自動で残す（ランタイム自身が「consumed N of M compute units」というログ行をプログラム終了後に出力する形で）。

> **演習 §4.4.** \`bench --rounds 0 --heap-bytes 0\` と \`bench --rounds 0 --heap-bytes 1024\` を実行せよ。「after heap alloc」の CU 読み値を引き算する。その差が、bump ヒープから 1024 バイトを確保するコストだ。予想より大きいか小さいか。なぜか。

---

## §4.5  bench 出力を読む

典型的な実行例。

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

注目したい数値は 3 つ。入口直後の残り CU（199,772）が、プログラム起動の固定コストを示す — 命令データ復号、ディスパッチャ、ログ — このビルドでは約 230 CU。フェーズ A が消費したのは (199,772 − 199,639) = 133 CU、1 KiB の確保に対して。フェーズ B は (199,639 − 112,433) = 87,206 CU を消費、1 KiB 入力で 50 ラウンドの sha256 — 1 ラウンドあたり約 1,744 CU。

ここから外挿できる。100 ラウンド: 約 175K CU。120 ラウンド: 約 209K CU — 既定 200K 上限を超える。\`--cu-limit\` なしで実行すれば \`ComputationalBudgetExceeded\` 付きの \`ProgramFailedToComplete\` が出る。\`--cu-limit 400000\` を付ければまた成功する。

これがこの章の核心だ。1 度測り、予測し、その上で作業をバジェットに収めるか、明示的に上限を引き上げるかを決める。推測は、まだ負荷下で出荷していないプロジェクトのやり方だ。

**SDK が隠していること:** Anchor のログにも同じ「consumed N of M compute units」行が出る。プログラムからではなくランタイムから出ているからだ。しかし Anchor は \`units_consumed\` を型付きフィールドとしてどこにも公開しない — 本書と同じくバリデータログから読み取る。

> **演習 §4.5.** \`--cu-limit\` を、前回の \`units_consumed\` をわずかに下回る値に設定せよ。トランザクションは \`ComputationalBudgetExceeded\` で失敗するはずだ。次にわずかに上回る値を試す。成功するはずだ。境界は厳密で、それゆえに CU は計画ツールとして使える。

---

## §4.6  Anchor が CU について隠していること

Anchor は CU 計測を一切挿入しない。バジェットを自動で引き上げない。ハンドラが長すぎることをコンパイル時に警告しない。CU は Anchor が完全にあなたに任せている数少ない要素のひとつだ — 汎用解が存在せず、どんな既定値も間違いになるからだ。

Anchor が**やる**のは、型付きアカウントごとに概ね 2,000〜5,000 CU のオーバーヘッドを加えること — 自動で行われるデシリアライズ + ディスクリミネータチェック + 所有者チェックのために。\`Account<'info, T>\` を 5 つパラメータに取るハンドラは、自分のコードが走り始める前に、型付きアカウントラッパだけで 15,000〜25,000 CU を払うことになる。本書では同等の手作業チェックに \`process_initialize\` と \`process_create_market\` でおよそ 600〜1,000 CU しか払わない。必要なものだけを手で組み立てているからだ。

これがネイティブプログラムの CU 上の論拠そのものだ: デシリアライザ、所有者チェック、借用を自分で書くなら、コストは自分で制御できる。Anchor がやるなら、コストは Anchor の既定値のコストになる。market 作成のように 1 回しか呼ばれないハンドラなら、差は無視できる。約定ごとに呼ばれるループ内ハンドラなら、その差がビジネス全体だ。

---

## §4.7  まとめと自己検証

### まとめ図

\`\`\`
トランザクション単位の上限
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  CU         既定 200,000     最大 1,400,000                 │
│  ヒープ     既定 32 KiB      最大 256 KiB（RHF 経由）        │
│  データ量   既定 約 64 MB    tx ごとに調整可                 │
│                                                            │
└────────────────────────────────────────────────────────────┘

1 tx 内:
  ┌─────────────────────────┐     ┌──────────────────────┐
  │ ComputeBudgetInstruction│ ──► │ ランタイムが tx 内の  │
  │ (set_compute_unit_limit │     │ 全ユーザプログラムに  │
  │  / request_heap_frame)  │     │ 上限を適用する        │
  └─────────────────────────┘     └──────────────────────┘
                                            │
                                            ▼
  ┌─────────────────────────┐     ┌──────────────────────┐
  │ openhl-core::Bench      │ ──► │ 各フェーズで          │
  │   - ペイロード復号       │     │ sol_log_compute_units│
  │   - vec![0u8; n] ヒープ │     │ 成功か CU=0 まで実行  │
  │   - sha256 ループ       │     │                      │
  └─────────────────────────┘     └──────────────────────┘
\`\`\`

### 自分で検証する 3 項目

1. **既定上限は本物。** \`--cu-limit\` なしで \`bench --rounds 150 --heap-bytes 1024\` を実行せよ。\`ComputationalBudgetExceeded\` で失敗するはずだ。シミュレーションの \`units_consumed\` は 200,000 より大きな数値を示す可能性があるが、ランタイムは上限を超えた時点で計測を打ち切るので、数値が頭打ちになる場合がある。
2. **ヒープ上限は本物。** \`bench --rounds 0 --heap-bytes 65536\` を実行せよ。[\`solana-program-entrypoint-2.3.0/src/lib.rs:342\`](#) の bump アロケータが null を返し、Rust の alloc-error ハンドラがプログラムを中断する。見えるエラーは \`ComputationalBudgetExceeded\` ではなく、メモリ中断になる。
3. **compute-budget 命令は同じ tx 内に必須。** \`bench\` を編集し、\`ComputeBudgetInstruction\` を bench 命令とは**別の**トランザクションで送るようにせよ。次の bench tx は依然として既定 200,000 しか受け取らない。compute-budget 命令の効果は、それ自身のトランザクション内に閉じる — 永続しない。

---

## 第 5 章への導線

自分のコードが何を消費するかを計測し、必要なバジェットを要求できるようになった。しかし CU はスループット物語の半分でしかない。もう半分は**並列性**だ — 同じアカウントに対していくつのトランザクションを同時実行できるか。Solana の看板機能 — 1 秒あたり数万トランザクションを処理できる理由 — は Sealevel スケジューラで、アカウントアクセスセットが衝突しない限り並列にトランザクションを走らせる。

第 5 章では、Sealevel が並列実行可能性を判定する read/write セットモデルを歩く。全 market を単一の「グローバルレジストリ」アカウントの背後に置くとプログラム全体がシングルスレッドになる理由、本書の \`CreateMarket\` PDA スキームが任意数の market を並行作成できる理由を見る。意図的に衝突する \`Stats\` アカウントを \`openhl-core\` に追加してスケジューラから見た直列化の姿を実演し、そして — 本物のプログラムを出荷する前に必ずやる — その \`Stats\` をリファクタリングして外す。
`,
                },
                {
                  title: "第5章 — Sealevel 並列性とアカウントロック",
                  slug: "solana-internals-ch05-sealevel-ja",
                  type: 'CONTENT',
                  sortOrder: 4,
                  duration: 45,
                  xpReward: 100,
                  content: `# 第5章 — Sealevel 並列性とアカウントロック

> 状態: ドラフト (v0.1)。
> 教材コード: \`programs/openhl-core/src/lib.rs\`（\`process_create_stats\` 442–501 行、\`process_bump_stats\` 503–540 行）、\`scripts/stats/src/main.rs\`、\`scripts/create-market/src/main.rs\`。
> 検証対象バージョン: solana-instruction 2.3.3、solana-program 2.3.0。

---

## §5.0  はじめに

Solana の看板数値 — 1 秒あたり数万トランザクション — は、VM の速度やブロック密度で買えるものではない。**トランザクションを並列に走らせる**ことで買っている。その並列実行を担うスケジューラの名前が **Sealevel** で、Sealevel がプログラムから必要としているのはトランザクションごとに 1 つの情報だ — どのアカウントを読み、どのアカウントを書くか。

その情報は、各 \`Instruction\` に付ける \`AccountMeta\` 配列から来る。ランタイムはこれを読み取り専用 / 書き込み可のロック宣言として使う。書き込みセットが交わらないトランザクション 2 つは並行実行できる。書き込み可能アカウントを共有するトランザクション 2 つは、\`Mutex\` で奪い合うスレッドのように直列化される。

本章ではモデルを歩く。

1. \`solana-instruction\` を開き、3 フィールドの \`AccountMeta\` 構造体を読む。Sealevel がトランザクションのデータ依存性について知る必要のあるすべては、この 3 フィールドに収まっていると理解する。
2. リーダ・ライタ ロック意味論を理解する: 同一アカウントに対し複数の \`READ\` ロックは共存できる。\`WRITE\` ロックは 1 つだけで、それ以外のすべてを排除する。
3. \`CreateMarket\` の \`AccountMeta\` 配列を歩く。書き込み対象がすべて異なる PDA（\`(base_mint, quote_mint)\` ペアごとに 1 つ）であることを見る。すなわち、N 個の異なるペアに対する N 個の同時 CreateMarket は、N 個の並列スロットで実行できる。
4. \`BumpStats\` の \`AccountMeta\` 配列を歩く。すべての BumpStats が**同じ**シングルトン Stats PDA を書くことを見る。よって 2 つの同時 BumpStats は、他に何をしようとも、必ず直列化する。
5. ホットパスから競合を引き剥がす設計パターンを論じる: シングルトンをシャーディングする、オフチェーンで事前集計する、カウンタを完全に取り除く。
6. この領域で Anchor が生成するもの・しないものを列挙する。

これが Foundations の最終章だ。これを終えれば、ベンチマークで速く**かつ**本番で速い Solana プログラムをゼロから書ける — 両者が乖離するのはスケジューラがボトルネックになったときだけで、それを読む方法をいま手に入れたからだ。

---

## §5.1  Sealevel が見ているもの — \`AccountMeta\` というロック宣言

\`solana-instruction-2.3.3/src/account_meta.rs:19–32\` を開こう。

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

フィールドは 3 つ。これがクライアントコードとスケジューラの間のインターフェース全体だ。pubkey がアカウントを特定し、2 つの bool がそのアカウントに対する意図を宣言する。クライアントがトランザクションを送信した瞬間から、ランタイムはこの宣言を契約として扱う。アカウントを \`READ\` と宣言したトランザクションがプログラム内で書き込みを試みると、確定時に \`ReadonlyDataModified\` で失敗する。したがってスケジューラは、並列実行可否を判定する際にこの宣言を信用できる。

61–67 行と 97–103 行の 2 つのコンストラクタが、クライアントコード上で意図を明示する。

\`\`\`rust
pub fn new(pubkey: Pubkey, is_signer: bool) -> Self {
    Self { pubkey, is_signer, is_writable: true }
}

pub fn new_readonly(pubkey: Pubkey, is_signer: bool) -> Self {
    Self { pubkey, is_signer, is_writable: false }
}
\`\`\`

\`AccountMeta::new(...)\` — 書き込み可。\`AccountMeta::new_readonly(...)\` — 読み取りのみ。署名者ビットは read/write とは直交していて、別のランタイムチェック（要は第 2 章の所有者まわりの話）を制御する。

「特定フィールドだけ読みたい」「特定オフセットにだけ書きたい」という意図表現は存在しない。粒度はアカウント全体だ。バイトのどこかに触れる可能性がある（書き）か、あるいは閲覧するだけ（読み）か。この粗さこそがスケジューリングを安価にしている — ロックテーブルのキーは 32 バイトの pubkey であって、バイト範囲ではないからだ。

> **演習 §5.1.** \`scripts/create-market/src/main.rs\` の命令構築直後に \`println!\` を数行追加し、\`CreateMarket\` 命令の \`AccountMeta\` 配列を出力せよ。確認: payer は \`WRITE + SIGNER\`、market PDA は \`WRITE\`、system_program は \`READ\`。

---

## §5.2  スケジューラのリーダ・ライタ意味論

Sealevel スケジューラは、各アカウントを 1 つのリーダ・ライタ ロックとして扱う。規則は教科書どおりだ。

- **N 個のリーダ**が同じアカウントのロックを同時に保持できる。
- **1 つのライタ**が排他的に保持する — 同じアカウント上に他のリーダもライタも存在できない。
- **異なるアカウント**は独立 — 異なる pubkey のロックは互いに相互作用しない。

トランザクションがスケジューラに入ると、ランタイムはそのトランザクションの全命令の全 \`AccountMeta\` を収集し、重複除去し、読み取りセットと書き込みセットを形成する。トランザクション 2 つが**並列実行可能**となる必要十分条件は次のとおり。

\`\`\`
(A.write_set ∩ B.write_set) == ∅
かつ (A.write_set ∩ B.read_set)  == ∅
かつ (A.read_set  ∩ B.write_set) == ∅
\`\`\`

\`read_set ∩ read_set\` の重複はブロックしない — 読み取りと書き込みを区別する意義はそこにある。

具体的には次のようになる。

1. **異なる \`(base_mint, quote_mint)\` ペアに対する CreateMarket 2 つ** — 書き込みセットが交わらない（market PDA が異なる、payer が同じ自分なら共通だが）。共有 payer が唯一の競合点だが、ランタイムは同じ手数料支払者からのトランザクションを別経路で直列化する（Sealevel 規則ではない別制約）。異なる payer から呼べば完全並列。

2. **BumpStats 2 つ** — 両方ともシングルトン Stats PDA を書く。書き込みセットがその 1 つの pubkey で交わる。直列化、終わり。

3. **CreateMarket 1 つと BumpStats 1 つ** — 書き込みセットが異なる（一方は market PDA、他方は Stats を書く）。並列化する。

4. **同じ market を 2 回読む**（2 つのフロントエンドが描画するなど） — 読みで重なる、競合なし。両方走る。

ランタイムはこの判定をスロットごと、いかなるプログラムコードが走るより前に行う。プログラムはスケジューリングについて何も知らない。順番が来たら走るだけだ。

**SDK が隠していること:** \`solana-sdk\` も Anchor も、「このトランザクションはあのトランザクションと並列可能か」という API は公開していない。スケジューラが実行時に不透明に判定する。それを推測するには、自分の \`AccountMeta\` 宣言を読み、上の問いを当てる以外にない。

> **演習 §5.2.** ウォレット A からウォレット B への \`Transfer\` の読み/書きセットは \`{A: W, B: W}\`。C から D への \`Transfer\` の集合は \`{C: W, D: W}\`。並列実行できるか。A→B と B→C ではどうか。

---

## §5.3  \`CreateMarket\` のアクセスセットを歩く

\`scripts/create-market/src/main.rs:118–125\` のクライアント宣言。

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

アカウントは 3 つ。Sealevel の視点から 1 つずつ見ていく。

**\`payer\` — \`WRITE + SIGNER\`。** payer の lamport 残高が変わる（rent が出ていく）。同じ payer を共有する CreateMarket が 2 つあれば、ここが競合点だ — ランタイムは同じ残高を並列に減らすことを許せない。同じ手数料支払者を同じスロットの 2 つの別トランザクションで使うと、別の理由で拒否される（同一ブロック内のトランザクション nonce 重複）。よって実務上この競合は問題にならない。CreateMarket を 2 人の異なる payer から呼べば、\`payer\` レベルの重複はない。

**\`market_pda\` — \`WRITE\`。** 新しく作成されるアカウント。pubkey は \`(base_mint, quote_mint)\` とプログラム ID から**派生**される — 第 3 章を見よ。異なる \`(base_mint, quote_mint)\` ペアに対する 2 つの CreateMarket は**異なる** market PDA を派生するので、この書き込みは互いに競合しない。これが openhl-core を並列性に優しくしている設計上の選択だ — PDA スキームのおかげで新しい market はそれぞれ自分のアドレスに住み、別の market と衝突することがない。

**\`system_program::ID\` — \`READ\`。** System プログラムは、本ハンドラ内の \`create_account\` CPI のために必要だ。読み取りのみとマークされている理由は、本ハンドラが System プログラム自身を変更していないから（変更不可 — executable アカウントだ）。System に CPI する同時トランザクションすべてが System を読み取りロックして共存できる。同じアカウントへの読み取りロックは互いをブロックしない。

異なる payer からの \`(SOL, USDC)\` と \`(SOL, USDT)\` の CreateMarket 2 つを考えると、

\`\`\`
A.writes = {payer_A, market_SOL_USDC}
A.reads  = {system_program}
B.writes = {payer_B, market_SOL_USDT}
B.reads  = {system_program}
\`\`\`

交差はすべて空 — 例外は \`system_program ∈ A.reads ∩ B.reads\`、これは読み読み重複で許容される。両トランザクションは同じスロットにスケジュールされる。並列。

これが「設計上、並列性に優しい」の実態だ。並列性を狙ってコードを書いたわけではない。各 market に自分のアドレスを与えただけだ。それは第 3 章でコンポーザビリティのために選んだ PDA スキームから自然に落ちてきた結果である。Sealevel の恩恵は、別目的で下したアーキテクチャ判断の下流の利得だ。

> **演習 §5.3.** \`Initialize\`（第 2 章）命令の読み/書きセットはどうなるか。\`scripts/init-market/src/main.rs\` を見よ。Initialize は同じ tx で \`System::Assign\` 命令も走らせている点に注意し、それらの AccountMeta も数えること。

---

## §5.4  Stats 反例 — シングルトン書き込み競合

次に \`scripts/stats/src/main.rs:99–104\` の \`BumpStats\` を見よう。

\`\`\`rust
Instruction {
    program_id,
    accounts: vec![AccountMeta::new(stats_pda, false)],
    data: vec![4u8],
}
\`\`\`

アカウントは 1 つ: \`stats_pda\`、\`WRITE\` マーク。\`stats_pda\` は固定シード（\`[STATS_SEED]\`）から派生され、呼び出しごとの変化がない — このプログラムに対するすべての BumpStats 呼び出しで、永遠に同じ pubkey だ。よって BumpStats トランザクションの書き込みセットは常に \`{stats_pda}\` になる。

BumpStats 2 つは次のようになる。

\`\`\`
A.writes = {stats_pda}
B.writes = {stats_pda}
\`\`\`

\`A.writes ∩ B.writes = {stats_pda}\` — 空でない。並列実行できない。スケジューラは一方を選び、走らせ、確定させ、それから他方を走らせる。BumpStats のスループットは単一トランザクションのレイテンシで頭打ちになる。バリデータが何コア持っていようと関係ない。

これは \`BumpStats\` 自体には問題ない — 「カウンタを進める」という明示的呼び出しであり、ホットパスとして誰も期待していない。問題は、**並列に走るべき命令に Stats 書き込みを後付けで足したとき**だ。\`CreateMarket\` の末尾に \`CreateStats\` 相当のロジックを呼ぶ \`CreateMarketAndBumpStats\` 命令を想像しよう。その \`AccountMeta\` はこうなる。

\`\`\`
[payer (W,S), market_pda (W), system_program (R), stats_pda (W)]
\`\`\`

最初の 3 アカウントは \`(base_mint, quote_mint)\` ごとに異なる — 完全並列化可能だ。4 つ目 — \`stats_pda\` — はすべての呼び出しで**同じ**だ。突然、すべての market 作成が Stats で直列化する。market ごとに別 PDA という美しい設計が、1 つのグローバルカウンタの存在で、単一トランザクション レイテンシ相当のスループットに落ちる。

これが本物の Solana プログラムで起きる**最も頻出の失敗**だ — 誰かがホットパス命令に「グローバル統計」「グローバル上限」「グローバルレート制限カウンタ」を足し、スループットが桁違いに崩れる。直し方はいつも同じ — グローバル書き込みを引き剥がす — だが、なぜ壊れたかを理解していないと直しを見つけられない。

stats クライアントを動かして宣言の姿を見てみよう。

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

トランザクション 2 つ、書き込みセット 2 つ。pubkey は目に見える。競合は機械的に決まる。

> **演習 §5.4.** 同じ payer から BumpStats トランザクションを 2 つ立て続けに送れ。署名とスロット番号（\`solana confirm <sig>\` 経由）を観察せよ。同じスロットに着地するかもしれないし、隣接スロットになるかもしれないが、**並列に処理されることはない**。両方が同じバリデータの同じスロットで処理された場面を見つけ、ランタイムログから順次処理されたことを確認せよ。

---

## §5.5  リファクタリング パターン — グローバル書き込みを引き剥がす

シングルトン書き込みが競合を生んでいるとき、現実的な選択肢は 3 つある。

**(1) シングルトンをシャーディングする。** 1 つの Stats PDA を N 個に置き換える。シードは \`[STATS_SEED, &[shard_index]]\`。クライアントが（無作為に、あるいは呼び出しの何らかの性質に基づいて）シャードを選ぶ。書き込みセットは \`0..N\` のうちのある K について \`{stats_shard_K}\` になり、カウンタが N 並列を得る。総計を読むには、シャードを横断してオフチェーンで集計する。

最も一般的なオンプログラム修正だ。コスト: カウンタ上の厳密な「先に起きた」順序を諦めること（2 つのシャードが独立に進む）。総計の取得には N 個のアカウント読みが必要になる。

**(2) オフチェーンで事前集計する。** カウンタをオンチェーンに置かない。market を作るトランザクションをウォッチャープロセス（Geyser、RPC \`getSignaturesForAddress\` ほか）で索引化し、カウントをオフチェーンの DB で保持する。オンチェーン状態が変わらないので、オンチェーンは並列のまま。

カウンタが**観測性**（ダッシュボード、分析）目的でプログラム ロジックに使われないなら、これが正解だ。「グローバル統計」要件のほとんどはここに収まる。

**(3) カウンタを取り除く。** カウンタが本当に必要か問い直す。「market が何個あるか知りたい」から誰かが足した、というのがよくある経緯だ。しかし答えは \`getProgramAccounts(programId, filter: discriminator == MARKET_DISCRIMINATOR).len()\` を必要時にフェッチするだけで済み、オンチェーン状態は要らない。

パターン: ホットパスに書き込み可能シングルトンを見つけたら、問いは「これをどう効率的に直列化するか」ではなく、「このアカウントをオンチェーンに置く必要が本当にあるか」だ。

本書の設計では、\`BumpStats\` を \`CreateMarket\` に統合せず、明示的に独立した命令として保つことを意図的に選んだ。カウンタが欲しいオペレータは呼ぶ。スループットを大事にしたいオペレータはスキップする。その隔離こそが要点だ。

**Anchor が隠していること:** Anchor の \`#[derive(Accounts)]\` を使うと、\`#[account(mut)]\` でアカウントを宣言して書き込みセット上の含意を忘れることができてしまう。Anchor は「ホットパスのハンドラでシングルトンを書いていますよ」とは決して警告しない。コンパイル時の \`Accounts\` 構造体はクライアント側の型付き IDL に出てくるが、そこにも並列性コストは見えない。これを捕まえるのは純粋にコードレビューの領分だ。

---

## §5.6  まとめと自己検証

### まとめ図

\`\`\`
Sealevel スケジューラ — 保留中のトランザクション A、B の各ペアに対し:

   A.writes ────┐
                ├──► 交差? ──► YES: 並列化不可
   B.writes ────┘            NO:  続行

   A.writes ────┐
                ├──► 交差? ──► YES: 並列化不可
   B.reads  ────┘            NO:  続行

   A.reads  ────┐
                ├──► 交差? ──► YES: 並列化不可
   B.writes ────┘            NO:  続行

   （A.reads ∩ B.reads は無視 — 両リーダがロックを保持可）


openhl-core アクセスセット:

   CreateMarket(base, quote)
      writes = { payer, market_PDA[base, quote] }
      reads  = { system_program }
      ↑ market_PDA が呼び出しごとに変わる → 異なる (base, quote) で並列

   BumpStats
      writes = { stats_PDA }   ← シングルトン、毎回同じ pubkey
      ↑ 呼び出し元に関わらず直列化

   CreateStats
      writes = { payer, stats_PDA }
      reads  = { system_program }
      ↑ 一度限り、競合は問題にならない
\`\`\`

### 自分で検証する 3 項目

1. **同じ pubkey、毎回。** \`stats --init\`（CreateStats）を実行し、続けて \`stats\`（BumpStats）、もう 1 度 \`stats\` を実行せよ。表示される \`stats PDA\` は 3 回ともバイト同一のはずだ — その pubkey がスケジューラのキーになるロックだ。変化しない。
2. **CreateMarket ごとに異なる pubkey。** \`create-market --base-mint <A> --quote-mint <B>\` を実行する。\`market PDA\` を控える。\`--base-mint <C> --quote-mint <D>\` で再実行する。PDA は変わるはずだ。これが並列性だ。1 回目の書き込みセットは 2 回目と交わらないので、スケジューラは任意の順序、あるいは並行で走らせる自由を持つ（他の制約を除く）。
3. **読み読みはブロックしない。** \`Bench\`（第 4 章）はアカウントリストが**空**だ — 読みも書きも無い。Bench トランザクション 2 つは原理上、完全並列スロットで走れる。異なる payer から 2 つ送って、\`solana confirm\` で署名が同じか隣接するスロットに着地するのを観察せよ。異なる payer からの BumpStats 2 つと比較する。後者は厳密に異なるスロットに着地する。

---

## Phase B prologue — 本カリキュラムが行うアーキテクチャ選択

Phase A を終えた。Phase B にコミットする前に、何を**選ばないか**を明示しておく価値がある — これから続く章群は別のカリキュラムなら別の判断を下しえたアーキテクチャ選択を、暗黙のうちに行っているからだ。

Perp DEX は 2 通りに作れる。**既存チェーン上のプログラム** — マッチング、vault、ファンディング、清算ロジックをスマートコントラクトとして書き、コンセンサス・実行・バリデータ・ネットワーキング・ウォレットはチェーンに任せる。これが Phase B が組み立てる路線だ。**独自 L1** — 同じビジネスロジックを独自のコンセンサスエンジン・実行層・P2P ネットワーク・RPC と一緒にパッケージし、他のバリデータが走らせるバイナリを出荷する。

両者は同じビジネス問題（注文マッチ、担保保持、ファンディング支払い、水没ポジションの清算）を同じオンチェーン プリミティブで解く。それ以外のすべてが大きく分岐する。

**Solana 上のプログラム路線**（本カリキュラム）: 1 コマンドで deploy、既存流動性とウォレットを継承、既存バリデータのセキュリティに乗る。コードベースは 1 リポジトリに収まり、1 チームで出荷できる。ホストチェーンの slot 時間、コンピュートバジェット、バリデータ集中度に縛られる。値捕捉は部分的 — トランザクション価値の実質的な一部が自分の制御外のアクターに流れる。

**独自 L1 路線**: バリデータ集合の bootstrap に数ヶ月、自前のブリッジとステーブルコイン経済、自前のウォレット統合と上場交渉、自前の MEV ポリシー。コードベースは consensus + execution + networking + RPC にまたがって複数 crate に分散する。対価として、フルなランタイム制御（block time、順序、自前の負荷向け precompile）とフル値捕捉（バリデータ中間業者なし）が得られる。

L1 路線が必要になるのは、次の 3 条件が**揃って**成り立つときだ:

1. ホストチェーンが提供できないランタイム性質が必要 — sub-100ms 確認、独自マッチング precompile、決定論的な MEV-free 順序、EVM 互換でない精度での決済。
2. ビジネスモデルがトランザクション価値の完全捕捉に依存しており、ホストチェーンのバリデータ経済と分け合うわけにいかない。
3. チームと runway がチェーンを数年運営できる規模 — プログラム 1 つを deploy するのとは別次元の運用責任。

Hyperliquid は 3 条件すべてが揃った教科書的ケースだ。perp DEX プロジェクトの大半はどれも揃わない。そしてホストチェーン上のプログラム路線は、ローンチまでに掛かる時間・インフラ コスト・チーム規模のいずれにおいても、桁違いに安価だ。

本カリキュラムはプログラム路線に賭ける。L1 が絶対的に間違いだからではなく、L1 を正当化する条件が稀であり、ホストチェーン上でまだ出荷していないプロジェクトが多年がかりの L1 開発にコミットする資格をまだ得ていないからだ。Phase B は perp DEX プロジェクトの 99% が実際に取る路線を教える。

---

## 第 6 章への導線 — Phase B 開始

Phase A を終えた。アカウントを確保でき、Anchor なしでプログラムを書け、予測可能なアドレスを派生し、CU 包絡線を計測し、2 つのトランザクションが並列実行可能かを推論できるようになった。これらがランタイム基礎であり、本トラックのそれ以後すべてはこの上に立つ。

Phase B は第 6 章 — **CPI 内部 — Vault Deposits** — から始まる。SPL Token を開き、ユーザのトークンアカウントから本書の market PDA が所有する vault トークンアカウントへ base 資産トークンを移す deposit 命令を書き、\`invoke\` と \`invoke_signed\` が**実際に**フード下で何をしているかを歩く — スタックフレームのセットアップ、署名者特権の拡張規則、\`AccountInfo\` の再借用ダンス。第 3 章では \`invoke_signed\` をアカウント作成のために 1 度だけ使ったが、第 6 章ではチェーン上の他の全プログラムと話す主たる仕組みとして使う。

第 6 章が終わったとき、market のための動作する SPL Token vault を手にしている。Phase B が終わったとき、その中に住む板を手にしている。
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
