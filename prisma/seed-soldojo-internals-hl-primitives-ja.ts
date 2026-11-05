// AUTO-GENERATED from drafts/solana_internals_ch*_ja.md
// by .github/scripts/build-soldojo-internals-seed.ts.
// Do not hand-edit. Re-run the build script when drafts change.

import { PrismaClient } from '@prisma/client';

export async function seedSoldojoInternalsHlPrimitivesJA(prisma: PrismaClient) {
  const tags = ["solana","internals","perpetuals","clob","oracle","funding","liquidation","vault","builder-codes"];

  await prisma.course.create({
    data: {
      slug: "solana-internals-hl-primitives-ja",
      title: "Solana 内部 — HL プリミティブ編",
      description:
        "Foundations トラックの上に Hyperliquid 風パープ取引所を組み立てる。9 章: SPL Token CPI、オンチェーン CLOB、CU 圧下のマッチングエンジン、オラクル取り込み、ファンディングレート、清算、ネイティブ取引 vault、builder codes、すべてを走らせるオフチェーン keeper 層。",
      difficulty: "ADVANCED",
      duration: 450,
      xpReward: 1200,
      track: "solana-internals",
      tags,
      isPublished: true,
      sortOrder: 101,
      locale: "ja",
      instructorName: "SolDojo Internals",
      modules: {
        create: [
          {
            title: "HL プリミティブ編",
            sortOrder: 0,
            lessons: {
              create: [
                {
                  title: "第6章 — Vault Deposits で歩く CPI 内部",
                  slug: "solana-internals-ch06-cpi-ja",
                  type: 'CONTENT',
                  sortOrder: 0,
                  duration: 45,
                  xpReward: 100,
                  content: `# 第6章 — Vault Deposits で歩く CPI 内部

> 状態: ドラフト (v0.1)。
> 教材コード: [\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs)（\`process_create_vault\` 892–1001 行、\`process_deposit\` 1008–1076 行）、[\`scripts/create-vault/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/create-vault/src/main.rs)、[\`scripts/deposit/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/deposit/src/main.rs)、[\`fuzz/basics/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/basics/src/main.rs)（§6.6 の solinv ハーネス）。
> 検証対象バージョン: solana-cpi 2.2.1、solana-program 2.3.0、SPL Token プログラム（TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA）。

---

## §6.0  はじめに

Phase A はランタイム基礎を組み立てた。Phase B は HL プリミティブを組み立てる — そしてそれらはすべて他のプログラム、主に SPL Token と話す。注文配置のたびにトークンが動く。決済のたびにトークンが動く。出金のたびにトークンが動く。これらはどれも「本書のプログラム内で何かをする」ではなく、「SPL Token に何かを本書のプログラムの代わりにやらせる」だ。プログラム間のこの対話を **cross-program invocation (CPI)** と呼ぶ。所有者チェックの次に、本書のプログラムが行う最も結果の大きな振る舞いである。

本章では、必要な最も基本的な CPI を構築する: market のための SPL Token vault と、ユーザのトークンを vault に移す \`Deposit\` 命令。両者あわせて CPI 機構全体を実演する。

- **CreateVault** は 2 連続の CPI を行う — \`System::create_account\`（vault PDA が \`invoke_signed\` で署名）と \`SPL Token InitializeAccount3\`（誰の署名も要らない、ただの \`invoke\`）。
- **Deposit** は 1 つの CPI を行う — \`SPL Token Transfer\`。署名はユーザだが、PDA 経由ではなく、外側トランザクションからの**署名者特権の延長**で渡る。

終えるころには次のものを手にしている。

1. \`invoke\` と \`invoke_signed\` を並べて読み、両者が文字どおり「シード引数があるか」だけが異なる同じ呼び出しであると理解する。
2. ランタイムの署名者特権規則を歩く: 外側トランザクションの \`AccountMeta\` に現れた署名者が CPI の \`AccountInfo\` に再放出されると、被呼び出し側は署名者として扱う。
3. SPL Token 命令を 2 つ手で組み立て — \`INITIALIZE_ACCOUNT_3\`（tag 18）と \`TRANSFER\`（tag 3） — ワイヤ上に乗るバイトを正確に把握する。
4. なぜ vault 作成には \`invoke_signed\` を使い、入金には \`invoke\` を使うのかを理解する。両者は**入れ替え不可**だ — その選択は、その操作のために誰が署名しなければならないかが決める。

これが、プログラムを「自分のアカウントを所有する」段階から「チェーン上の他のすべてと話す」段階に進める章だ。Phase B のすべてはこの上に立つ。

---

## §6.1  \`invoke\` と \`invoke_signed\` は同じ呼び出し

\`solana-cpi-2.2.1/src/lib.rs:137–139\` を開こう。

\`\`\`rust
pub fn invoke(instruction: &Instruction, account_infos: &[AccountInfo]) -> ProgramResult {
    invoke_signed(instruction, account_infos, &[])
}
\`\`\`

これが \`invoke\` の本体すべて。\`invoke_signed\` を空のシードスライスで呼ぶだけだ。両者は内部で同じシステムコールで、唯一変わるのは PDA シードを供給するかどうか。

意味論上の区別は次のとおり。

- **\`invoke_signed(ix, accounts, signers_seeds)\`** — 「この命令を実行せよ。これらのシードから派生する PDA を追加の署名者として扱え」。第 3 章で \`create_account\` 時に market PDA のためにプログラムが署名できるようにするのに使った。
- **\`invoke(ix, accounts)\`** — 「この命令を実行せよ。本書から新たに署名者を追加しない。\`accounts\` 内にすでに存在する署名者（外側トランザクションに署名済み）は引き続き署名者として扱われる」。元のトランザクションの署名者がすでに必要な権限を持っているときに使う。

どちらを使うかは、CPI の操作のために**誰が署名しなければならないか**で完全に決まる。

- \`create_account\` の新アカウント? 自前で所有する PDA。本書しか署名できない。→ \`invoke_signed\`。
- SPL Token Transfer の transfer authority? **ユーザ**のウォレット鍵ペア。外側トランザクションに署名済み。→ \`invoke\`。
- \`SPL Token MintTo\` の mint authority? 場合による。本書のプログラムが mint authority なら（例: 自前で制御する PDA）、→ \`invoke_signed\`。ユーザが mint authority で外側 tx に署名しているなら、→ \`invoke\`。

第三の選択肢はない。すべての CPI は、外側トランザクションから署名者を継承するか、PDA シードで拡張するかのどちらかだ。ランタイムの仕事は、CPI が要求するすべての署名者が、どちらかの仕組みで説明できることを検証することだ。

**SDK が隠していること:** Anchor の \`CpiContext::new(...)\` と \`CpiContext::new_with_signer(...)\` は、それぞれ \`invoke\` と \`invoke_signed\` の直接ラッパだ。選択はあなたに委ねられる。Anchor が代わりに選ぶことはない。間違ったほうを選ぶと、ランタイムは署名エラーで CPI を失敗させる。

> **演習 §6.1.** CPI が PDA 署名者を必要としないときに、空でないシードスライスで \`invoke_signed\` を呼ぶと何が起きるか。（ヒント: エラーにはならない。ランタイムは、内側命令の必要署名者リストに現れない PDA 署名者を単に無視する。）

---

## §6.2  署名者特権の延長

\`Deposit\` を PDA 署名なしで成立させている規則は短い: **本書のプログラムの外側トランザクションの \`AccountMeta\` に署名者が現れ、CPI の \`AccountInfo\` でそれを再放出すると、被呼び出し側はそのアカウントを署名者として認識する**。

これがランタイムの「署名者特権の延長」だ。ユーザは外側トランザクションで**一度**署名する。\`process_deposit\` 内では、\`user\` アカウントの \`AccountInfo\` の \`is_signer = true\` だ（外側 tx で署名されているから）。本書が SPL Token Transfer 命令を \`AccountMeta::new_readonly(*user_ai.key, true)\`（signer = true）で組み立て、\`invoke\` の \`account_infos\` に \`user_ai.clone()\` を渡すと、ランタイムは確認する: 「このアカウントは自分のレベルで署名者とマークされているか? はい。CPI のアカウントリストでも署名者とマークされているか? はい。両者は一致するか?」 — 一致すれば、被呼び出しプログラム（SPL Token）は、\`is_signer = true\` の \`AccountInfo\` をユーザについて受け取る。

この規則が防いでいること: CPI を通じて非署名者を署名者に**昇格**させることはできない。ユーザが外側トランザクションに署名していなければ、CPI 内で \`AccountMeta::new(*user.key, true)\` を何度書こうと署名は生まれない。ランタイムは食い違いを見つけ、\`MissingRequiredSignature\` で CPI を拒否する。

この規則が許していること: 署名を再度頼まずに署名者を**伝播**できる。ユーザは一度署名する。その署名は、CPI 宣言でユーザを署名者として再放出する以降の連鎖上のすべてのプログラムに対して有効だ。これがあって、1 つのユーザ署名で SPL Token トランスファ、スワップ、プログラム呼び出しの任意の連鎖を 1 トランザクションで認可できる。

もう 1 つある。\`invoke_signed\` の \`signers_seeds\` パラメータから来る PDA 署名者は、CPI の間だけ外側署名者集合に**追加**される。ランタイムはシード + 呼び出し元プログラム ID をハッシュし、結果が署名対象アカウントと一致することを確認し、そのアカウントを CPI の署名者として扱う。これが PDA に署名する唯一の仕組みだ — 秘密鍵はないのだから。

両方の機構 — 外側 tx 伝播と PDA シード — は同じ \`invoke_signed\` 本体に住んでいる。ランタイムは内側命令の署名者を判定するときに 2 つの和集合を取る。

> **演習 §6.2.** \`process_deposit\` で、SPL Token Transfer 命令を \`AccountMeta::new_readonly(*user_ai.key, false)\`（signer = false）で組み立てると何が起きるか。トランスファは成功するか。なぜか。

---

## §6.3  CreateVault を歩く — 2 連続 CPI

CreateVault は、両方の CPI 形式が同じハンドラに現れる場所だ。\`programs/openhl-core/src/lib.rs:892–1001\` から。

**PDA 派生**（932–954 行）が 2 つの pubkey を準備する: \`[VAULT_SEED, market.key, mint.key]\` の \`vault_token_account\` と、\`[VAULT_AUTH_SEED, market.key]\` の \`vault_authority\`。第 3 章と同じ find_program_address 機構。bump が返り、vault bump は下で使う。authority bump はまだ不要だ（出金を追加する後の章で、プログラムが vault authority として署名する必要が出てきたときに重要になる）。

**CPI 1 — System::create_account**、956–975 行。

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

ここが \`invoke_signed\` なのは、新アカウントが自前所有の PDA であり、System が新アカウントの署名を要求するからだ。シード + bump は \`find_program_address\` 呼び出しで使ったものと同じ。\`create_account\` の第 3 引数は新アカウントの**所有プログラム** — \`SPL_TOKEN_PROGRAM_ID\` を渡し、自前プログラムは渡さない。この瞬間から vault token account は SPL Token が所有することになり（Solana ランタイムレベルで）、データを書けるのは SPL Token だけになる。

AccountInfo 配列に注目: \`[payer_ai, vault_ai, system_ai]\`。System プログラムが \`create_account\` で必要とするのはこの 3 つだけ（ハンドラの他のアカウント — market、mint、vault_authority、token_program — は System が必要としないので渡さない）。

**CPI 2 — SPL Token InitializeAccount3**、977–997 行。

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

これがプレーン \`invoke\` なのは、誰も署名する必要がないからだ。vault アカウントはすでに SPL Token 所有だ（CPI 1 でそうした）。InitializeAccount3 はただのデータ書き込み — 空のトークンアカウントに mint と owner フィールドを設定する。SPL Token に所有されているという事実自体が SPL Token によるデータ書き込みを認可するので、署名は要らない。

\`invoke\` に渡される *AccountInfo* 配列は \`[vault_ai, mint_ai, token_ai]\` だが、命令の *AccountMeta* に挙がっているのは \`vault_ai\` と \`mint_ai\` だけ — なぜ追加の \`token_ai\` が要るのか。ランタイムは、**呼び出し先プログラム**自身の AccountInfo も渡すことを要求する。これが「AccountInfo 再借用」規則だ: ランタイムが呼び出しを準備するために必要となる AccountInfo はすべて渡さなければならず、それには被呼び出しプログラム自身が含まれる。

CPI 2 つ、ハンドラ 1 つ、両方の署名形式。このパターンは Phase B 全体にわたって繰り返される。

> **演習 §6.3.** \`invoke\` 呼び出しから \`token_ai.clone()\` を削除せよ。ランタイムが返すエラーは何か。初期 Solana コードで最も頻繁に起きる CPI バグの 1 つで、最も Google しにくいエラーメッセージの 1 つだ。

---

## §6.4  Deposit を歩く — ユーザは外側で署名

Deposit はより単純なケースだ。\`programs/openhl-core/src/lib.rs:1008–1076\` から。

命令データ。

\`\`\`rust
let mut transfer_data = Vec::with_capacity(1 + 8);
transfer_data.push(spl_token_ix::TRANSFER);
transfer_data.extend_from_slice(&amount.to_le_bytes());
\`\`\`

合計 9 バイト: 1 バイトのタグ（Transfer は 3）と、リトルエンディアン 8 バイトの amount。これが SPL Token Transfer のワイヤフォーマット全体だ。

アカウント。

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

3 アカウント: source トークンアカウント（書き込み可）、destination トークンアカウント（書き込み可）、authority（署名者、読み取り専用）。authority はユーザのウォレットで、署名者としてマークされている。ここではユーザのウォレットに**書き込まない** — トークンの移動はソーストークンアカウントの残高フィールドに反映され、ウォレットの lamports には反映されない — のでウォレット自身は read-only-but-signing になる。

CPI。

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

プレーン \`invoke\`。シードなし。ユーザは外側トランザクションに署名した。その署名が \`user_ai\` \`AccountInfo\` の \`is_signer = true\` フラグ経由で SPL Token に流れる。SPL Token は authority として受け入れる署名者を見て、トランスファが確定する。

これが「プログラム媒介ユーザトランスファ」の正典パターンだ: ユーザは外側トランザクションに署名して操作を認可する、プログラムは必要な CPI を組織化する、ユーザの署名者特権が流れていく。

> **演習 §6.4.** \`user_token_account\` と \`vault_token_account\` が異なる mint に属する Deposit トランザクションを組み立てよ。どのエラーが、どの層 — 本書のプログラムか SPL Token か — で表面化するか。

---

## §6.5  SPL Token 命令データを手で組み立てる

\`spl-token\` クレートは**意図的に**インポートしなかった。代わりに 2 命令分のバイトを手で組み立てた。\`lib.rs\` の 861–864 行。

\`\`\`rust
mod spl_token_ix {
    pub const TRANSFER: u8 = 3;
    pub const INITIALIZE_ACCOUNT_3: u8 = 18;
}
\`\`\`

これが必要な語彙のすべて。タグ値 2 つ。それ以外のすべて — フィールドエンコード、アカウント順 — は SPL Token プログラムのソース（あるいは \`spl-token\` クレートの \`Instruction\` enum、ただし意図的に依存していない）を読んで得る。

理由は 2 つ。

1. **教育。** 本章は CPI バイトについての章だ。正確なバイトを生成するビルダをインポートすれば、バイトを一度も見ずに章を終えられてしまう。一度手で組み立てればフォーマットを永続的に学べる — 将来出会うあらゆる SPL Token 命令で、ドキュメントを引かずにタグとデータが読める。
2. **バイナリサイズ。** \`spl-token\` クレートの最近のバージョンは、BPF コンパイル時に約 25 KB の依存関係（Token enum、エラー型、ヘルパビルダ）を引き連れてくる。2 命令しか必要としないプログラムにとっては純粋なオーバーヘッドだ。手で組み立てる方式はおそらく 200 バイト程度の追加で済む。

このトレードオフは大多数の本番プログラムは**しない** — 型安全性と保守ストーリーのために \`spl-token\` をインポートする。本書ではここでこのトレードを行う、章が要求するからだ。バイトを理解した後はトレードが逆向きになる: 25 KB を払い、型付きビルダにタグミスを捕捉させる。

この一般的な技法は、CPI する任意のプログラムに適用できる。

1. 被呼び出し側のソースで命令タグを見つける。
2. データフィールドを見つける（Borsh エンコード、または手作業詰め、プログラムによる）。
3. 被呼び出し側プロセッサのアカウントリストを見つける — 通常はバリアントのドキュメントコメントに \`[WRITE, SIGNER]\` のようなアカウント参照として書かれている。
4. \`Instruction\` 構造体を手で組み立てる。
5. \`invoke\` または \`invoke_signed\` する。

この 5 ステップのレシピは SPL Token、Address Lookup Table プログラム、Compute Budget プログラム、BPF Loader プログラム、誰かが作った任意の独自プログラムに通用する。機構は変わらない。

**Anchor が隠していること:** Anchor は SPL Token のための型付き CPI ラッパ（\`anchor_spl::token::{Transfer, MintTo, ...}\`）を持ち、バイトレイアウトを完全に隠す。動くが、本章があなたに見せたいまさにそれを覆い隠す。CPI を手で組み立て明示的に晒すネイティブプログラムは、\`anchor_spl::token::transfer(ctx, amount)\` を呼んでマクロを信用するプログラムより、はるかに優れたセキュリティ監査ストーリーを持つ。

---

## §6.6  まとめと自己検証

### まとめ図

\`\`\`
                  invoke                            invoke_signed
                  ──────                            ─────────────
   実体:          invoke_signed(ix, accs, &[])      invoke_signed(ix, accs, seeds)
   PDA 署名:      なし                              あり（プログラムが派生 PDA に署名）
   外側署名者:    自動で伝播                        自動で伝播
   使い分け:      ユーザ / 外側 tx が操作に署名     自前所有の PDA が署名する必要


CPI ごとの特権解決:
    内側命令の各 AccountMeta（is_signer = true）について:
       同じ pubkey が**外側** AccountMeta で is_signer マーク?         ──► YES → 署名者 OK
       または、PDA としてこの pubkey を派生するシードを渡した?          ──► YES → 署名者 OK
       それ以外                                                          ──► CPI 拒否


openhl-core CPI マップ:

    CreateVault
       CPI 1: System::create_account
          invoke_signed、vault PDA シード
       CPI 2: SPL Token InitializeAccount3
          invoke（署名不要 — SPL Token が新アカウントを所有）

    Deposit
       CPI 1: SPL Token Transfer
          invoke（ユーザが外側 tx で署名、特権が流れる）
\`\`\`

### 自分で検証する 3 項目

1. **\`invoke\` はシードなしの \`invoke_signed\`。** \`solana-cpi-2.2.1/src/lib.rs:137\` を開き、3 行の本体を読め。両者の違いは「PDA シードを渡したか」だけだと身体化せよ。それ以外のすべては同じシステムコール。
2. **被呼び出しプログラムの AccountInfo。** CreateVault の両 CPI で、\`invoke[_signed]\` に渡される \`accounts\` スライスは被呼び出しプログラムの AccountInfo を含む — CPI 1 では \`system_ai\`、CPI 2 では \`token_ai\`。これを忘れるのは初期 Solana で最も頻出のミスの 1 つで、ランタイムは紛らわしい \`AccountNotFound\` 風味のエラーを返す。[\`lib.rs:966, 997\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs#L966) を読んで確認せよ。
3. **ユーザは一度署名し、SPL Token がそれを使う。** バリデータに対して \`deposit\` を実行せよ。ユーザ鍵ペアが外側トランザクションに署名する。SPL Token は \`is_signer = true\`（ユーザについて）の \`Transfer\` 命令を受け取る。トランスファが確定する。どこにも 2 度目の署名はない。1 署名、伝播。


### 検査を道具に試させる

\`CreateVault\` には検査が 7 つ、\`Deposit\` には 4 つある。第 3 章 §3.7 では [solinv](https://github.com/psyto/solinv) を \`CreateMarket\` に走らせ、消した検査はどれもランタイムが支えていた。この 2 つのハンドラは別のプログラムに CPI するので、検査を支えるものの候補が増え、支えるもののない検査も 1 つある。同じハーネス [\`fuzz/basics/\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/basics) に両方の仕様がある。payer や user の署名フラグを外すことと、各 slot を攻撃者が渡せる物に差し替えることだ(このプログラムが所有しない「market」、「mint」としてのトークン口座、PDA ではない vault のアドレス、vault の authority としての呼び出し側自身、各プログラムの slot に別のプログラム、A の払い出し元として B のトークン口座)。第 3 章 §3.7 のとおり準備してから:

\`\`\`bash
cd fuzz/basics
cargo build --release --features invariant_ch6
cargo test --release --features invariant_ch6      # A は B のトークンを使えない
timeout -s INT 60 crucible run openhl_basics_fuzz invariant_ch6 \\
    --binary-in target/release/invariant_test --timeout 45
\`\`\`

今のプログラムでは \`[FUZZ_FINDING]\` の行は出ない。

> **演習 §6.6.** 検査を 1 つずつ消し、作り直して走らせよ。走らせる前に予想すること。私たちが各 45 秒で測った結果を示す。最後の列は、差し替えた呼び出しを代わりに拒否したもので、ログから読んだ:
>
> | 消した検査 | 捕まったか | 代わりに呼び出しを拒否したもの |
> |---|---|---|
> | CreateVault: \`payer_ai.is_signer\` | いいえ | ランタイム: 権限のない署名者 |
> | CreateVault: \`market_ai.owner == program_id\` | いいえ | 自前の vault の PDA の検査 |
> | CreateVault: \`mint_ai.owner == SPL Token\` | いいえ | 自前の vault の PDA の検査 |
> | CreateVault: \`system_ai.key == System\` | いいえ | ランタイム: 命令に要るアカウントがない |
> | CreateVault: \`token_ai.key == SPL Token\` | いいえ | ランタイム: 命令に要るアカウントがない |
> | CreateVault: \`vault_ai.key == expected_vault\` | いいえ | ランタイム: 権限のない署名者 |
> | CreateVault: \`vault_auth_ai.key == expected_auth\` | **はい**、account-swap、slot 4 | — |
> | Deposit: \`user_ai.is_signer\` | いいえ | ランタイム: 権限のない署名者 |
> | Deposit: \`user_token_ai.owner == SPL Token\` | いいえ | ランタイム: 所有していないアカウントのデータを命令が変えた |
> | Deposit: \`vault_token_ai.owner == SPL Token\` | いいえ | ランタイム: 所有していないアカウントのデータを命令が変えた |
> | Deposit: \`token_ai.key == SPL Token\` | いいえ | ランタイム: 命令に要るアカウントがない |
>
> 先を読む前に、ほかに何も支えていない行を 1 つ見つけよ。
>
> ほとんどの行は §6.2 と §6.1 の繰り返しだ。プログラムは自分が受け取った署名しか渡せないので、payer や user の署名がなければ CPI で落ちる(§6.2)。ハンドラは内側の命令に呼び先の ID を書き込んで組む(\`SPL_TOKEN_PROGRAM_ID\`、\`system_program::ID\`)ので、slot に別のプログラムを入れても CPI の行き先は変わらず、ランタイムが本物の呼び先のアカウントを見つけられないだけだ(§6.1)。PDA ではないアドレスへの \`create_account\` には、そのアドレス自身の署名が要る。中身が同じで別のプログラムが所有するトークン口座は SPL Token を通り抜け、\`Transfer\` まで実行される。そのあとランタイムが拒否する。SPL Token が自分の所有していないアカウントを変えたからだ(第 1 章)。B の本物のトークン口座は SPL Token 自身が拒否する。A がその authority ではないからだ(\`owner does not match\`。テストで押さえてある)。
>
> 2 つの行は自前のコードが支えているが、それは fuzzer の差し替え方のせいでしかない。vault の PDA は market と mint から導くので、どちらか一方だけを差し替えると slot 3 が違うアドレスになる。それらから導くアカウントと一緒に組で差し替えると(\`account_swap::check_sets\`。第 12 章 §12.7 でも使う)、2 行は分かれる。mint の所有者検査を消しても、SPL Token がトークン口座を mint として認めない(\`Invalid Mint\`)。market の所有者検査を消すと呼び出しは通り、実は誰かのトークン口座である「market」のためのトークン口座が作られた。この検査は本当に仕事をしている。
>
> 覚えておくべきは**はい**の行だ。\`vault_authority\` は作られることがない。ただのアドレスで、\`InitializeAccount3\` が新しいトークン口座の持ち主として書き込む。CPI のどこも、それが PDA であることに頼っていない。だからプログラムが確かめなければ、呼び出し側は自分を指定でき、以後その市場の vault に入る預け入れはすべて呼び出し側が動かせるものになる。ランタイムにとってそのアドレスはただのデータなので、ランタイムの規則では捕まえられない。
>
> もう 2 つ試せる。1 つ目、\`fuzz/basics/src/main.rs\` で \`Deposit\` の slot 2(送り先)の差し替え候補に \`self.b_ata\` を足して、もう一度走らせよ。A はどのトークン口座にも預け入れられるので、実行のたびに報告される。これは穴か。ここではそうではない。\`Deposit\` は何も記録しないので、A が B の口座に払うのは贈り物でしかない。送り先が意味を持つ帳簿づけは第 11・12 章で加わり、そこで送り先を縛る。検出とは、プログラムが許した呼び出しのことだ。それが問題かどうかは、プログラムが何を約束したかの問いである。
>
> 2 つ目は、第 3 章から持ち越した、読むときの問いだ。\`CreateVault\` は market の所有者を確かめるが、アドレスは確かめない。第 2 章の \`Initialize\` は今も、呼び出し側が作った任意のアカウントに \`Market\` を作れるので、同じ組に PDA ではない 2 つ目の市場がありうる。\`--features invariant_ch3_reader\` で作って走らせよ。このハーネスはそういう市場を作り、\`CreateVault\` にそれを読ませる(3 つの slot を一緒に差し替える。market と、そこから導く 2 つのアドレス)。今のプログラムで報告が出る。テスト \`create_vault_accepts_a_market_not_at_its_pda\` でも直接確かめられる。**これは**穴か。先を読む前に考えよ。
>
> PDA が約束したのは、\`(base, quote)\` ごとにアドレスが 1 つ、ということだった。プログラムのほとんどはそれに頼っていない。市場に結びつくアカウント(トークン口座とその authority、板、オラクル、資金調達の状態、ポジション、trading vault、保険基金)はどれも市場自身のアドレスを seed にしているので、2 つ目の市場は別の島になる。それに \`CreateMarket\` でも、市場の authority は誰でも選べる。例外はどれも第 13 章にある。手数料の vault とその authority(quote の mint ごとに 1 つ、全市場で共有)と、builder の profile(builder ごとに 1 つ)だ。第 6〜12 章の範囲では、2 つ目の市場が別の市場のトークンに届く道は見つからなかった。手数料の vault から利用者の払った以上を取り出せるかどうかは、第 13 章 §13.6 で同じ道具を使って確かめる。答えは「できない」で、どの加算も同じトランザクションの中で払われているからだ。「その」市場を PDA を導いて見つけるクライアントは大丈夫だ。市場の形をしたアカウントなら何でも信じるクライアントは大丈夫ではない。組ごとに市場を 1 つに限りたいなら、\`CreateVault\` が市場自身の \`base_mint\`・\`quote_mint\` と保存された \`bump\` からアドレスを導き直せばよい(第 3 章の「bump の保存」)。試したところ、その検査を足すと組は拒否され(\`InvalidSeeds\`)、fuzzer は 45 秒で何も見つけなかった。

---

## 第 7 章への導線

これで他のプログラムと話せるようになった。しかし、Phase B で最も話す相手になるプログラムは**自分自身** — オンチェーン板だ。CLOB は market アカウントの中に bids と asks のスラブとして住み、すべての place/cancel 命令はその大部分を読み書きする。そのデータ構造が次に組み立てるものだ。

第 7 章ではオンチェーン CLOB 設計を歩く: critbit vs heap vs slab、\`bytemuck\` 経由のゼロコピーアカウントアクセス、メモリ局所性とアカウントサイズのトレードオフ、本番プログラムがほぼ常に slab を選ぶ理由。\`Market\` 構造体を固定容量の板を埋め込むよう拡張し、そこへ書き込む \`place_order\` 命令を追加し、板が満ちていくにつれて CU 包絡線が締まる様子を観察する。終わるころには market が初めての注文を受け取り、Phase A のコンピュートバジェット章を駆動した問い —「200K CU でマッチャをどう収めるか」— が初めて切迫したものになる。
`,
                },
                {
                  title: "第7章 — オンチェーン CLOB データ構造",
                  slug: "solana-internals-ch07-clob-ja",
                  type: 'CONTENT',
                  sortOrder: 1,
                  duration: 45,
                  xpReward: 100,
                  content: `# 第7章 — オンチェーン CLOB データ構造

> 状態: ドラフト (v0.1)。
> 教材コード: [\`crates/state/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/state/src/lib.rs)（\`Order\` + \`OrderBook\`）、[\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs)（\`process_create_order_book\` 1091–1155 行、\`process_place_order\` 1162–1253 行、\`process_cancel_order\` 1260–1327 行）、[\`scripts/book/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/book/src/main.rs)。

---

## §7.0  はじめに

板のない perp DEX は、データベース付きの価格フィードでしかない。板は価格発見が起きる場所、部分約定が流動性を帰属させる場所、そしてコンピュートバジェットのほぼ全てを使い切る場所だ。「この取引所はどう儲けるか」から派生するビジネス上の問いはすべて、最終的に「resting オーダーを保持するデータ構造」に行き着く。

Solana 上で課される制約は独特だ。トランザクションごとに動的に確保できない（ヒープは 32 KiB、bump アロケータは解放しない）。アカウントを任意に拡張できない（データ長は作成時固定、\`realloc\` は MAX_PERMITTED_DATA_INCREASE 以内のみ）。無制限ループは持てない（既定 200 KCU、最大 1.4 M）。そして組み立てたものはチェーン上の他の全プログラムから \`bytemuck\` キャストで読み書きできなければならない — 向こう側に何か気の利いたことをしてくれる Rust ランタイムはないからだ。

本章は Phase A の CU レクチャがいよいよ効いてくる場所だ。次の順に進める。

1. レイアウトを選ぶ — \`Order\` のスロット、固定容量配列を持つ \`OrderBook\` — そしてそれが**正しい最小の選択**であり、本番向けの選択ではないことを説明する。
2. それを 2 つの本番向け選択（slab と critbit）と明示的に比較し、本書が何をトレードしているかを特定する。
3. \`place_order\` と \`cancel_order\` を線形走査として歩き、CU ログを読んで「線形」が実際に何 CU かを確認する。
4. 板が満ちていき、命令ごとの CU がそれにつれて上がっていく様子を観察し、マッチャ章の直前で止まる — そこで問いは「この成長をどう完全に避けるか」に変わる。

本章では**マッチング**を実装しない。板は**受動的**だ — 注文が入り、order_id で注文が出る。bid と ask の交差は第 8 章。

---

## §7.1  なぜ配列、しかも正解ではない選択を

Solana 上の本物の CLOB は次の 2 つのどちらかになる。

1. **Slab** — ノードの連続アリーナ、価格レベルごとに双方向リンクの FIFO キュー、価格レベル自体は ソート済み critbit ツリーに格納（Serum、Phoenix）。place/cancel が O(log N)、ベスト bid/ask 検索が O(1)、キャンセル時にコンパクション不要。
2. **Critbit-of-orders** — 各注文が critbit ツリーの葉、キーは価格（同価格内の FIFO 順序のために副キーにタイムスタンプ）。すべてが O(log N)、slab より推論しやすい、メモリ局所性はやや劣る。

本書が組み立てるのはそのどちらでもない。**固定容量のフラット配列、線形走査**だ。\`crates/state/src/lib.rs\` から。

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

market あたり 2112 バイト。bid と ask は同じスロットプールを共有し、各 \`Order\` の \`side\` バイトで区別する。\`size == 0\` は「空スロット」を意味する。ソート順はない — スロット位置は線形走査順で「最初に見つけた空スロットが勝つ」で決まる。

これが本番向けに**誤った**選択である理由は 1 点に集約される: **ベスト bid / ベスト ask の検索が O(N)** だ。マッチングエンジンはどれも「最も高い bid は何か」「最も低い ask は何か」から始まる。本書の配列は両方の問いに答えるために 32 スロット全部の走査を強いる。slab や critbit なら O(1) か O(log N) で答える。

ではなぜこれを選ぶか。

- **コストが見える。** CU ログに線形走査が現れる。学生は \`book --place\` を実行し、板が満ちるにつれて CU が上がっていく様子を観察できる(1 注文あたり数 CU。§7.3)。
- **検証が易しい。** 配列上の \`for\` ループ 2 つ。崩しうる不変条件もない。ツリーの再バランスでの微妙な off-by-one もない。
- **第 7 章にはこれで十分。** 本章はデータレイアウトとコストの形についての章だ。マッチングは第 8 章で導入し、**そこで**この誤った選択が本物の問題になる — その時点で slab へのリファクタリングが許される。

正しくない選択をまず正しく組み立て、何が正しい選択になるかを理解した上でリファクタリングする、というのは妥当な教育上の順序だ。何が正しいかを理解する前に正しい選択を組み立てるのは、この授業を飛ばすことに等しい。

> **演習 §7.1.** \`solana-program-2.3.0/src/system_instruction.rs:9\`（廃止ノート）を見て考えよ: もし本書の \`_reserved\` が固定配列ではなく \`Vec<u8>\` だったら? なぜそれは Pod を壊すのか。（ヒント: 第 1 章のレイアウト議論を読み返せ。）

---

## §7.2  \`Order\` スロットと空スロット規約

\`Order\` は 64 バイト、Pod、repr(C)。\`crates/state/src/lib.rs\` から。

\`\`\`rust
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct Order {
    pub order_id: u64,    // 0..8
    pub price: u64,       // 8..16
    pub size: u64,        // 16..24  (size == 0 ⇒ 空スロット)
    pub owner: [u8; 32],  // 24..56
    pub side: u8,         // 56
    pub _pad: [u8; 7],    // 57..64
}
\`\`\`

64 バイトは 2 の冪で、まともなアーキテクチャすべてでキャッシュラインとよく整合する。\`_pad\` は構造体が 8 バイト境界で終わり、\`[Order; N]\` が隙間なくパックされるために存在する。

**空スロット規約**は \`size == 0\`。新しい \`OrderBook\` のスロットはすべてゼロだ（System の \`create_account\` は常にゼロ初期化する）。\`place_order\` は \`size == 0\` の最初のスロットを探し、新しい注文をそこに書き、\`active_count\` を増やす。\`cancel_order\` は一致したスロットを \`Order::zeroed()\` で上書きし、\`active_count\` を減らす。コンパクションはしない。

なぜ別途 \`is_active: bool\` ではなく \`size == 0\` か。

- bool フィールドは 1 バイト + アラインメント維持のパディングのコストがかかる。\`size\` フィールドはすでに存在し、本物の注文は常に \`size > 0\` だ。アクティブ判定の番兵としてこのフィールドを再利用すれば、追加フィールドのコストを省ける。
- アカウント作成時のゼロ初期化により、規約は無料で機能する: 新規確保された \`OrderBook\` のスロットはすべて、明示的なセットアップなしに「空」になる。

コストは、プログラムが守るべき不変条件 1 行だ: \`size == 0\` の \`Order\` を絶対に書かない。\`place_order\` はペイロード中の \`size == 0\` を最初のガードで拒否する(\`cancel_order\` が取るのは注文の id だけで、スロットを空けるために全ゼロの \`Order\` をわざと書く)。\`process_place_order\`（lib.rs:1183–1186）から。

\`\`\`rust
if price == 0 || size == 0 {
    msg!("place_order: price and size must be > 0");
    return Err(ProgramError::InvalidInstructionData);
}
\`\`\`

これがフィールド再利用の代償だ。Anchor の \`#[derive(BorshSerialize)]\` アカウントには、フィールド意味論を独立させるために明示的な \`is_active: bool\` を持つことが多い — book あたり N スロット、M books の追加 1 バイトを払う代償で。本書ではトレードオフは再利用に有利に着地する。

> **演習 §7.2.** \`Order\` に \`_pad2: [u8; 16]\` フィールドを追加し、\`cargo test -p openhl-state\` を再実行せよ。\`order_size_is_64_bytes\` テストが失敗するはずだ。次に \`pub const LEN: usize = 80;\` を追加して残りのコードを型整合させ、サイズテストで \`OrderBook::LEN\` がどうなるか観察せよ。関係性は?

---

## §7.3  \`place_order\` を歩く

\`programs/openhl-core/src/lib.rs:1162–1253\` から。ハンドラは 3 部分に分解できる。

**検証**（1167–1210 行）: ペイロードサイズ、side バイト（0 か 1）、price と size 非ゼロ、user は署名者、book の所有者が本書のプログラムと一致、book サイズが \`OrderBook::LEN\` と一致、book のディスクリミネータが一致。

**線形走査**、1216–1222 行。

\`\`\`rust
let mut chosen_slot: Option<usize> = None;
for (i, slot) in book.slots.iter().enumerate() {
    if slot.size == 0 {
        chosen_slot = Some(i);
        break;
    }
}
\`\`\`

インデックス 0 から走査、\`size == 0\` の最初のスロットを取り、break。最悪ケース: book が満杯。ループは 32 反復全部を回り \`None\` を返し、「book 満杯」分岐に入って \`AccountDataTooSmall\` を返す。最良ケース: スロット 0 が空（book が新規）。1 反復。

CU コストの形を測った(命令全体、LiteSVM、\`fuzz/matching\` の \`ch7_grid\` テスト。LiteSVM が \`solana-test-validator\` と同じに数えることは第 4 章 §4.5 で確かめた):

| place の前の book | 反復 | CU |
|---|---|---|
| 空 | 1 | 2,357 |
| 8 注文 | 9 | 2,374 |
| 16 注文 | 17 | 2,417 |
| 24 注文 | 25 | 2,433 |
| 31 注文 | 32 | 2,446 |
| 32 注文(満杯) | 32 + エラー | 失敗(失敗した呼び出しは測っていない) |

走査は線形で、しかも安い。空の book から 31 注文までで 89 CU、見るスロット 1 つあたり約 3 CU だ。(以前の版は 1 スロットあたり約 50 CU、31 注文で 1,550 CU と見積もっていた。10 倍以上高すぎた。)2,357 のほとんどは命令の固定費で、入口、検証、2 つの \`sol_log_compute_units\`、\`msg!\` の行だ。だからここでの教訓は大きさより**形**だ。O(N) はコストがデータとともに増えることを意味するが、32 スロットで 1 スロット数 CU ではほとんど見えない。見えてくるのは、fill ごとに走査する第 8 章と、もっと大きな book だ。比べると、第 15 章の slab は 1,023 の注文があるところへ 1,954 CU で置ける。この配列が 16 で取る値段より安い。

**書き込み**（1228–1242 行）: \`next_order_id\` をインクリメント、\`active_count\` をインクリメント、user の pubkey を \`owner\` にコピー、\`Order\` リテラルを構築、選んだスロットに投入。スロットが決まれば全部 O(1)。

1203 行（走査前）と 1250 行（書き込み後）の CU ブラケットがあれば、バリデータログからコストを読める。2 つの \`sol_log_compute_units\` を呼んで差を取れば、その間で消費された CU が出る。走査と書き込みに加え、その範囲のデータ借用、ディスクリミネータの検査、ログも含む。

> **演習 §7.3.** book にいろんな N（たとえば 0、8、16、24、31）の注文を事前投入し、その後新しい注文を 1 つ置け。各 N について 2 つのログ呼び出しの間で消費された CU を記録せよ。プロットせよ。N に対して線形で、傾きは 1 注文あたり数 CU のはずだ。上の表と比べよ。

---

## §7.4  \`cancel_order\` を歩く

\`process_cancel_order\`（1260–1327 行）は構造的には \`place_order\` と同じだ — 線形走査、次に変更 — がマッチキーと変更内容が異なる。

**走査**、1295–1301 行。

\`\`\`rust
let mut found: Option<usize> = None;
for (i, slot) in book.slots.iter().enumerate() {
    if slot.size != 0 && slot.order_id == order_id {
        found = Some(i);
        break;
    }
}
\`\`\`

\`slot.size != 0\` で空スロットを飛ばす、\`slot.order_id == order_id\` で ID 選択。最悪ケースは「注文が最後のスロットにある」または「見つからない」 — どちらも O(N) を払う。

**認可チェック**、1307–1311 行。

\`\`\`rust
if book.slots[slot_idx].owner != *user_ai.key.as_ref() {
    msg!("cancel_order: caller is not the order owner");
    return Err(ProgramError::IllegalOwner);
}
\`\`\`

注文を置いた本人だけがキャンセルできる。スロットの \`owner\` フィールドがキャンセル認可の仕組みだ。これはスロット単位のチェックで、book 単位ではない — 「オペレータが何でもキャンセルできる」パスは存在しない。これはオープン CLOB として適切だが、vault 管理戦略では別になる。

**ゼロ化**、1315 行。

\`\`\`rust
book.slots[slot_idx] = <Order as bytemuck::Zeroable>::zeroed();
\`\`\`

\`Order::zeroed()\` は全ゼロの \`Order\` を返す。\`<Order as bytemuck::Zeroable>::zeroed()\` の修飾構文が必要なのは、\`Order::zeroed\` が固有メソッドとしてスコープに入っていないからだ — \`bytemuck::Zeroable\` トレイトから来る。書き込まれた後、スロットの \`size\` は 0、次の \`place_order\` が空スロット走査でこの位置を見つけて利用可能だと認識する。

CU コストは \`place_order\` と対称: 最良ケースは「スロット 0 で一致」（1 反復）、最悪ケースは「見つからない」（N 反復 + エラー）。満杯の book で、最初のスロットの注文は 1,994 CU、最後のスロットの注文は 2,177 で、見るスロット 1 つあたり約 6 CU だった(「見つからない」経路は失敗し、失敗した呼び出しは測っていない)。1284 行と 1324 行のブラケットで計測できる。

> **演習 §7.4.** 注文を 10 個置き、order_id 5 をキャンセルせよ。その後さらに 1 個置け。新しい注文はどのスロットに着地するか。各操作の前後で \`book\`（フラグなし）のダンプ出力からスロット配分を辿れ。

---

## §7.5  この設計が第 8 章を生き残れない理由

第 8 章ではマッチングを実装する。マッチング ループの中核は「入ってくる taker 注文ごとに、反対側で最良の resting maker を見つけ、taker が尽きるまで交差する」だ。O(log N) データ構造ならツリー検索 1 回ずつでこのループが終わる。本書のフラット配列では、ループは次のことをしなければならない。

1. taker ごとに線形走査 → taker あたり O(N)
2. マッチ試行ごとに、すべての maker を線形走査 → maker チェックあたり O(N)
3. M 個の taker が K 個の maker と交差するとき、正しいスロットを見つけるためだけのコストは O(M × K × N) で、トークン移動の前段階だ

ORDER_CAPACITY = 32、M = 10、K = 5 で、マッチ命令あたり約 1600 配列走査になる。以前の版は、上の 1 スロット 50 CU を使って、純粋な走査だけで約 80,000 CU と見積もっていた。測った 1 スロット数 CU なら数千だ。fill ごとに book を走査する第 8 章のマッチャは、満杯の book に対して 5 fill で 12,662 CU、10 fill で 22,250 CU だった(すべて込み)。既定バジェットは 200,000。

だから 32 スロットでのフラットな book の問題は、この命令のバジェットではない。book が大きくなるとどうなるかだ。fill ごとに全スロットを走査するのでコストは O(fills × N) で、第 8 章 §8.2 は 128 スロットの book でバジェットが尽きるのを示す。fill ごとにトークンを動かす(トランスファごとに SPL Token への CPI)と、それはもっと早く来る。次のいずれかが必要になる。

- slab にリファクタリングする — 本番向け答え
- \`ComputeBudgetInstruction::set_compute_unit_limit\` で CU 上限を上げる — 絆創膏
- 命令あたりのマッチを N 交差に制限し、マッチャを複数回呼ぶようにする — 回避策

第 8 章ではこの 3 つを探索し、実際にスケールするのは slab だけだと説明する; 第 15 章が slab の実装を出荷する。今のところ、フラット配列は正しく、遅く、その遅さが目に見える。その可視性こそが、リファクタリングが何を買うかを理解する前提条件だ。

**Anchor が隠していること:** Anchor の \`#[account(zero_copy)]\` 属性は型付きフィールドアクセスで bytemuck キャストアカウントを利用可能にする。正しいデータ構造を選ぶことについては何もしない — その判断はフレームワークに関わらず常にあなたのものだ。素朴な \`Vec<Order>\` book レイアウトの Anchor プログラムは、本書のものと同じ速さで CU バジェットを溶かす。

---

## §7.6  まとめと自己検証

### まとめ図

\`\`\`
OrderBook アカウント（2112 バイト、openhl-core 所有）:

  ┌──────── ヘッダ（64 バイト） ────────────────────────────────┐
  │ discriminator   bump  _pad0  market  next_order_id  active │
  │                                       (u64)         (u32)  │
  └────────────────────────────────────────────────────────────┘
  ┌──────── slots [Order; 32]（2048 バイト） ─────────────────┐
  │ [0]  Order or 空                                            │
  │ [1]  Order or 空                                            │
  │ ...                                                         │
  │ [31] Order or 空                                            │
  └────────────────────────────────────────────────────────────┘

  各 Order（64 バイト）:
    order_id (u64) | price (u64) | size (u64, 0 = 空)
    owner ([u8;32]) | side (u8, 0=bid 1=ask) | _pad ([u8;7])

place_order(side, price, size):
  検証 → slots[0..32] を size==0 で走査 → 書き込み → 完了
  コスト: O(active_count + 1)

cancel_order(order_id):
  検証 → slots[0..32] を order_id で走査 → 所有者チェック → ゼロ化
  コスト: 最悪 O(N)、最良 O(matched_position)
\`\`\`

### 自分で検証する 3 項目

1. **線形コスト。** \`book --init\` を実行し、30 注文置き、31 番目を置け。ハンドラ開始時の読み値と書き込み後の読み値の間の \`sol_log_compute_units\` 差分を比較せよ。31 番目の配置の走査部分は、1 番目の配置の約 30 倍のコストになるはずだ。一定値（検証 / CPI / ログのオーバーヘッド）を引いて走査コスト自体を分離せよ。
2. **空スロット規約。** 5 注文置き、order 3 をキャンセルし、6 つ目を置け。6 つ目の注文はスロット index 5 ではなく、スロット index 2（キャンセルで空いた）に着地するはずだ。「最初の空スロットが勝つ」規則がキャンセルで開いた穴を埋める。
3. **Pod レイアウト不変条件は強制される。** \`cargo test -p openhl-state\` は 3 つの Order/OrderBook レイアウトテストを走らせる。\`ORDER_CAPACITY\` を 33 に変更し再コンパイルせよ。\`order_book_size_matches_layout\` テストは \`2112 → 2176\` を示すはずだ。安定した予測可能なバイト数こそ、bytemuck がこの構造体で機能する理由だ。


### fuzzer に確かめられること、確かめられないこと

\`place_order\` と \`cancel_order\` の検査は、2 つのアカウント(署名者と book)と 1 つの規則についてのものだ。注文を取り消せるのはその注文の持ち主だけ(§7.4)。この規則は [solinv](https://github.com/psyto/solinv) 風のアカウントの差し替えでは届かない。取り消す注文はアカウントではなく、命令データの中の id で指定されるからだ。そこでテストで押さえる。[\`fuzz/matching/\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/matching) の \`cancel_refuses_another_users_order\` は、別の人に maker の注文を取り消させ、\`caller is not the order owner\` を期待する。持ち主の検査を消して作り直すと、このテストが落ちる(確かめた)。fuzzer が見つけるもの、つまりアカウントどうしの結びつけは第 3・6・12 章が示す。値がアカウントのフィールドにあるとき、こういう規則をガードとして書く方法は第 13 章 §13.6 が示す。

§7.3 と §7.4 の数値も同じハーネスから出ている。第 3 章 §3.7 のとおりプログラムを作ってから、\`fuzz/matching\` で \`cargo test --release --features invariant_ch8 -- --ignored --nocapture ch7_grid\`。

---

## 第 8 章への導線

板を持った。それを満たせる。order_id で注文を取り出せる。**まだできない**のは、bid を ask に対して**交差**させることだ。taker 注文が到着し、反対側で最良価格を走査し、maker に対して約定し、どちらかが尽きるまで繰り返す。これがマッチングであり、perp DEX における単一の最も CU を食う操作だ。

第 8 章では \`Match\`（または \`Take\`、流儀次第）を実装する — taker 注文を取り、resting book を歩き、約定を生む命令だ。本章のフラット配列レイアウトが本物の負荷に耐えられない理由を正確に確認し、置き換えとして動作する slab 実装を書き、CU 差を計測する。マッチャは、Phase A のすべての制約 — CU バジェット、ヒープ規律、並列性 — が単一の設計問題に収束する場所だ。
`,
                },
                {
                  title: "第8章 — CU 圧の下のマッチングエンジン",
                  slug: "solana-internals-ch08-matching-ja",
                  type: 'CONTENT',
                  sortOrder: 2,
                  duration: 45,
                  xpReward: 100,
                  content: `# 第8章 — CU 圧の下のマッチングエンジン

> 状態: ドラフト (v0.1)。
> 教材コード: [\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs)（\`process_match\` 1365–1493 行）、[\`scripts/match/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/match/src/main.rs)、[\`fuzz/matching/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/matching/src/main.rs)（§8.6 の solinv ハーネス）。
> 第 7 章の \`OrderBook\` データ構造の上に立つ。

---

## §8.0  はじめに — 本章が教えるもの

第 7 章は slab 実装をここに hook していた; その約束は独自の章（第 15 章）に移った、slab がそれに値するほど大きく育ったからだ。本章は第 7 章が出荷したフラット配列 book に対するマッチングの **CU コスト形状**についての章だ — 正確に計測され、CU 枯渇への 3 つの対応（バジェット引き上げ、\`max_fills\` でのページング、slab へのリファクタ）が命名され、コスト付けられる。§8.4 の slab 擬似コードは第 15 章のコードが実装する設計仕様だ。

そこで本章では次を行う。

1. フラット book 上の \`Match\` アルゴリズムを歩く。
2. 実ログから CU コスト形状を読み、O(fills × N) であることを示す。
3. CU 圧への 3 つの対応（バジェット引き上げ、ページング、slab リファクタ）を実演し、それぞれのコストを説明する。
4. slab の擬似コード + 図を設計仕様として提供する; 第 15 章が実装を出荷する。

---

## §8.1  フラット book 上の Match アルゴリズム

\`programs/openhl-core/src/lib.rs:1365–1493\` から。ハンドラはペイロードの 4 フィールドを取る。

\`\`\`text
[side u8][limit_price u64 LE][size u64 LE][max_fills u8]
\`\`\`

\`side\` は**taker** 側だ（bid の taker は ask に対して買う、ask の taker は bid に対して売る）。\`limit_price\` は taker が受け入れる最悪価格。\`size\` は取りたい総 base 単位。\`max_fills\` は 1 命令あたりに交差する resting maker 注文数の上限 — ページングつまみだ。

マッチングループ、1424–1483 行。

\`\`\`rust
let mut fills_done: u8 = 0;
while remaining > 0 && fills_done < max_fills {
    // (a) 取りに行ける限界価格内の最良の反対側 resting 注文を線形走査で探す
    let mut best: Option<(usize, u64)> = None;
    for (i, slot) in book.slots.iter().enumerate() {
        if slot.size == 0 || slot.side != maker_side { continue; }
        let price_acceptable = match taker_side {
            side::BID => slot.price <= limit_price,
            side::ASK => slot.price >= limit_price,
            _ => unreachable!(),
        };
        if !price_acceptable { continue; }
        // ... 「現在のベストより良いか」のチェック ...
    }

    // (b) 受け入れ可能な maker がなければ停止
    let (maker_idx, fill_price) = match best { Some(b) => b, None => break };

    // (c) 交差: min(taker 残, maker 残)
    let maker = &mut book.slots[maker_idx];
    let fill_size = remaining.min(maker.size);
    maker.size -= fill_size;
    remaining -= fill_size;
    fills_done += 1;

    // (d) maker が全約定したらスロットを空ける
    if maker.size == 0 {
        *maker = <Order as bytemuck::Zeroable>::zeroed();
        book.active_count = book.active_count.saturating_sub(1);
    }
}
\`\`\`

fill ごとに 5 ステップ。吸収すべき点は 2 つ。

**各 fill が完全な O(N) 走査のコストを払う。** ステップ (a) は最良の反対側注文を見つけるために book の全スロットを歩く。これは第 7 章で \`OrderBook\` で下した設計判断だ — bid と ask は未ソートのスロットプールを共有する。近道はない。最低 ask を見つけるには全スロットを見なければならない。

**作業は乗算的に増える。** 1 命令で \`fills_done\` 回の fill を行うと、総走査作業は \`fills_done × ORDER_CAPACITY\` になる。ORDER_CAPACITY = 32 で 10 fill 交差なら、320 スロット検査に加えて検査ごとの比較オーバーヘッド。各検査は安価（約 30 CU）なので、320 検査で走査だけで約 10 KCU。実際の書き込み作業は定数。

ハンドラは**決済**ステップを意図的に省いている。本物の取引所は各 fill に対し taker から maker へ quote トークンも動かす（SPL Token CPI 経由）。そのような CPI 1 回が約 3,000 CU。10 fill のマッチ内側で走査作業の上に 30,000 CU 載り、ログとプログラム諸経費の前にすでに約 40 KCU 最小だ。既定 200 KCU バジェットならまだ入る — しかし余裕は縮んでいるし、N = 32 は語る価値のある**最小**の book だ。

> **演習 §8.1.** book に増加価格（例: 100、101、102, ...）の ask を 10 個事前投入せよ。\`match-cli --side bid --limit-price 110 --size 50 --max-fills 5\` を実行する。プログラムログを辿れ: マッチャが交差する 5 つの maker はどれか、どの順序か、結果の \`taker_remaining\` はいくつか。

---

## §8.2  CU コスト形状を読む

半分埋まった book（resting maker 16、すべて bid、taker は ask でそれに対してマッチ）に対して、\`--max-fills\` を 1 から 16 まで変化させてマッチャを実行する。

| max_fills | units consumed | fill あたり限界 |
|-----------|----------------|----------------|
|   1       |    4,254       |   —            |
|   2       |    5,950       |   1,696        |
|   4       |    9,276       |   1,663        |
|   8       |   15,637       |   1,590        |
|  16       |   27,220       |   1,448        |

(\`fuzz/matching\` の \`grid\` テストで測った。実際のプログラムを LiteSVM で走らせる。LiteSVM と \`solana-test-validator\` 4.1.2 が同じ数を数えることは第 4 章 §4.5 で確かめた。この表の以前の版は古いツールチェーンのもので、fill あたり約 3,500 CU だった。自分で測ること。)

fill あたりの限界コストはほぼ一定で、16 maker の book で約 1.5 KCU。一部は線形走査で、fill ごとに空でも埋まっていても 32 スロットすべてを見る。一部は maker の書き込みと、fill ごとに出す \`msg!\` の行だ。それ以上は分けて測っていない。大事なのは、それがどう増えるかだ。

book とともに増えるが、この大きさではゆっくりだ。8、16、24、32 maker に対する 4 fill は 8,500、9,276、9,980、10,680 CU で、maker が 1 増えるごとに fill あたり約 22 CU。32 スロットの book には 32 maker までしか入らないので、ここで 1 回の \`Match\` がする fill は最大 32 で、\`max_fills = 32\` なら 57,696 CU。それより多く求めると、何も見つからない走査がもう 1 回加わり、それが最悪の場合になる。\`max_fills = 255\` で 58,148 CU、既定の 200K に十分収まる。バジェットが壊れるのを見るには book を大きくする。\`ORDER_CAPACITY = 128\`(\`crates/state\` にある)では、128 maker に対する 1 fill が 7,565 CU、16 fill が 80,533 なので、最初の 1 fill のあとは 1 fill ごとに約 4,900 増える。64 maker に対する 64 fill は 194,916、128 maker に対する 64 fill はもう収まらない。

これが本章が可視化するためにある CU コスト形状だ。フラットマッチャの fill あたりコストは book サイズに比例して成長する。命令あたり総コストは \`O(fills × N)\`。両因子とも押し上げたくなるつまみだ（呼び出しあたり fill 数を増やす、book を大きくする）。十分に押し上げればバジェットが壊れる。32 スロットでは、その「十分」は book が行ける先より遠い。

**SDK が隠していること:** Anchor のプログラムログにも同じ「consumed N of M compute units」行が含まれる。ユーザコードからではなくランタイムから来るからだ。しかし Anchor は \`units_consumed\` を型付きフィールドとしてどこにも公開しない — 本書のようにシミュレーション結果から \`sim.value.units_consumed\` で読む。

> **演習 §8.2.** book を 30/32 容量にし、\`--max-fills 30\` でマッチャを実行せよ。満杯の book で測ると 54,935 CU で、既定に余裕で収まる。次に \`crates/state/src/lib.rs\` で \`ORDER_CAPACITY = 128\` にしてプログラムを作り直し、book を 128 maker で満たして \`--max-fills 64\` で実行する。\`ComputationalBudgetExceeded\` で失敗するはずだ。\`--cu-limit 400000\` を加えて再実行する。オンチェーン確定は成功するか。\`--cu-limit 1400000\`（ネットワーク最大）でも成功しなくなるのは \`max_fills\` がいくつのときか。

---

## §8.3  CU 圧への 3 つの対応

マッチャ（あるいは任意のハンドラ）がバジェットを押し始めたとき、現実的な選択肢は 3 つある。それぞれにコストがある。

### (1) tx あたりコンピュートユニット上限を上げる

最も簡単な修正、長期的には最悪の答え。トランザクションに \`ComputeBudgetInstruction::set_compute_unit_limit(N)\` を前置する。N は最大 1,400,000。第 4 章から、これが単一トランザクションに対して効くことを知っている。\`scripts/match/src/main.rs\` から。

\`\`\`rust
if let Some(limit) = cli.cu_limit {
    instructions.push(ComputeBudgetInstruction::set_compute_unit_limit(limit));
}
instructions.push(match_ix);
\`\`\`

**コスト:** 優先手数料は要求上限に比例し、実消費には比例しない。1.4M CU を要求して 100K しか使わないトランザクションも、優先手数料計算では 1.4M 上限に対して支払う。ネットワーク容量（高競合時のスロットあたり約 50 K-CU）では、大きな要求が同じスロットの他のトランザクションを締め出すこともある。

**これが正解になるとき:** 呼び出しあたり真に > 200K CU を要する命令（初期セットアップ、たまのバルク操作）で、優先手数料の希釈が許容できる場合。

### (2) \`max_fills\` でページングする

マッチャはすでにこれをサポートする。呼び出しあたりの作業に上限をつけ、上限を呼び出し側に晒し、クライアントに完了まで反復させる。

\`\`\`text
match --max-fills 8
match --max-fills 8     # 次ページ
match --max-fills 8     # 次ページ
...
\`\`\`

各呼び出しはバジェットに余裕で収まる。ネットワーク総コストは同じ（マッチング作業はどちらにせよ同じ量）だが、1 トランザクションではなく複数に分散される。

**コスト:** 複数往復。マッチャのページ間で別トランザクションが book を変更するリスク（ページ全体のアトミック性を失う — book 状態がページ N とページ N+1 の間で変わりうるし、マッチャはそれを優雅に扱う必要がある）。tx あたり手数料オーバーヘッドがページ数倍になる。

**これが正解になるとき:** クロス全体のアトミック性が要らないマッチャ（どうせスライスする HFT 風 taker）、あるいは slab リファクタ前の応急処置として。

### (3) slab にリファクタリングする

本番向け答え。フラット \`[Order; N]\` slots 配列を次に置き換える。

- **ノードプール**: 固定サイズのノードアリーナ、空きスロットインデックスの別フリーリスト付き。正しいスロットが見つかれば、挿入とキャンセルは O(1)。
- **価格レベルごとの FIFO**: 各価格に、FIFO 順序の注文ノード双方向リンクリスト。マッチング中のベスト価格進行は \`head.next\` だけ。
- **価格レベルの critbit ツリー**: 価格でキー化、ソート済み、「ベスト価格」と「新価格レベル挿入」が O(log N)。

マッチャはこうなる。

\`\`\`text
remaining > 0 かつ fills_done < max_fills の間:
    level = tree.find_best_acceptable(taker_side, limit_price)   # O(log N)
    if level is None: break
    fill_size = min(remaining, level.head.size)
    level.head と交差
    if level.head.size == 0:
        level.pop_head()        # O(1)
        if level.is_empty():
            tree.remove(level)  # O(log N)
    fills_done += 1
\`\`\`

価格がばらけていれば、fill あたりコストは \`O(N)\` ではなく \`O(log N)\`。N = 1024 なら fill あたり約 10 vs 約 1000 検査。ただし critbit は自己平衡しない。深さは価格のビットに従い、キーの 64 ビットまで深くなりうるので、価格を選べる maker はそこまで深くできる(第 15 章 §15.7 で測る)。現実的な book ならマッチャはバジェットに収まり、敵対的な book でも \`max_fills\` の上限がそこに留める。

**コスト:** 大きな実装労力。正しい critbit + ノードプール + FIFO は約 1,500 行の慎重な Rust で、強い不変条件を伴う（各ノードはツリー+キューに住むかフリーリストにあるかのいずれか、各レベルは ≥1 注文を持つかツリーから消えているかのいずれか）。監査コストはそれに比例して高い。全体が \`bytemuck::Pod\` 適合だが慎重さを要する: ツリーノードはポインタではなくプール内のインデックスを持つ。

**これが正解になるとき:** 非自明な流動性を持つ本番 CLOB。Phoenix と Serum はどちらも理由あってこの設計を使う。

slab 実装は第 15 章に住み、下記の設計仕様から生まれたコードを歩く。

---

## §8.4  Slab 擬似コード

最小 slab 構造、擬似 Rust で。

\`\`\`rust
const POOL_CAPACITY: usize = 1024;
const TREE_CAPACITY: usize = 256;   // 木のノード数: 片側の価格水準は約 128(葉 + 内部ノード)

#[repr(C, Pod)]
struct Slab {
    discriminator: [u8; 8],
    bump: u8,
    _pad: [u8; 7],

    // ノードプール — 各スロットは生 OrderNode かフリーリストの一部
    nodes: [OrderNode; POOL_CAPACITY],
    free_head: u16,         // 最初の空ノードのインデックス、または NONE_INDEX

    // 価格レベル critbit ツリー — bid ツリーと ask ツリーは別
    bid_tree: CritbitTree,
    ask_tree: CritbitTree,
}

#[repr(C, Pod)]
struct OrderNode {
    order_id: u64,
    owner: [u8; 32],
    size: u64,
    next: u16,              // この価格レベル FIFO 内の次の OrderNode
    prev: u16,              // この価格レベル FIFO 内の前の OrderNode
    _pad: [u8; 4],
}
// ノードあたり 64 バイト、[OrderNode; 1024] = 64 KiB。他をあまり詰めなければ 64 KiB アカウントに収まる。

#[repr(C, Pod)]
struct CritbitTree {
    nodes: [TreeNode; TREE_CAPACITY],
    root: u16,
    free_head: u16,
}

#[repr(C, Pod)]
struct TreeNode {
    // critbit 風: INNER ノード（分割ビット + 2 子インデックス）か
    // LEAF ノード（価格 + FIFO キューの head/tail）のいずれか。
    tag: u8,                // 0 = leaf, 1 = inner
    // ... レイアウトは tag に依存
}
\`\`\`

主要操作とコスト:

- **insert(order)**: 価格レベルを見つける critbit ウォーク（O(log N)、N = 一意価格レベル数）、レベルがなければ作る（ツリーノード 1 個確保）、\`free_head\` からノードを取り出す、埋める、レベルの末尾にプッシュ。総計: O(log N) ツリー作業 + O(1) プール作業。
- **best_price(side)**: 最左（ask）または最右（bid）の葉までの critbit ウォーク。O(log N)。
- **match_top(side, max_size)**: best_price → FIFO の head → 交差 → head が全約定したら head を pop してノードを \`free_head\` に返し、レベルが空ならツリーから削除。fill あたり O(log N)。

実装するなら吸収すべき教育上の論点。

1. **インデックスを使う、ポインタではなく。** \`bytemuck::Pod\` はポインタフィールドを許さない。プール配列とツリー配列への \`u16\` インデックスを使う。\`u16\` は 65k エントリで足りる — ほとんどの book には十分。
2. **\`NONE_INDEX = u16::MAX\` の番兵。** \`Option<u16>\` はだめ — 構造体を Pod 安全から外す。番兵を使う。
3. **片方向リンクスタックとしてのフリーリスト。** 空ノードの \`next\` フィールドが次の空ノードを指す。確保は \`free_head\` を pop、解放は \`free_head\` に push。両方とも O(1)。
4. **critbit、red-black ではない。** critbit ツリーは再バランス規則がより単純で、回転ロジックが要らない。Serum は critbit、Phoenix も critbit。パターンは踏み固められている。
5. **side ごとに 1 ツリー。** bid と ask は「ベスト」の意味論が異なる（max vs min）。2 ツリーにすれば比較子をツリーコードに通す必要がない。

slab 実装は、初めてなら 3-4 日の演習だ。1 日目はプール + フリーリスト。2 日目は critbit の insert/remove。3 日目はマッチャへの配線。4 日目はエッジケース（book 満杯、レベル満杯、all-or-nothing fill）のテスト。第 15 章がその結果の実装を歩く。

> **演習 §8.4.** プール + フリーリスト部分を組み立てよ。\`Pool<OrderNode, 1024>\` を書け、\`alloc() -> Option<u16>\` と \`free(idx: u16)\` メソッド付きで。10,000 個のランダムな alloc/free ペアで、プールが常に正しい \`available_count\` を持つことを検証せよ。これが最も正しく書きにくい単一部分だ — \`free_head\` の不変条件は崩しやすい。

---

## §8.5  出荷したものと十分なもの

本章はフラット book 上の動作するマッチャをページング付きで出荷した。これは次に十分だ。

- 学習用成果物: マッチャは監査可能、約 110 行の Rust、CU コスト形状が観測可能。
- 低スループット本番デプロイ: \`<= 32\` resting 注文と \`<= 16\` fill / 呼び出しの market は 200 KCU バジェットに余裕で収まる。
- 教育研究: マッチング規則を試す（本書がやったのは価格時間優先。pro-rata、時間加重 pro-rata、last-look — どれも同じハンドラ形に差し込める）。

次には十分でない。

- 数百〜数千の resting 注文を持つ book。
- 大きな taker をアトミックに処理するマッチャ。
- fill あたりレイテンシが効く HFT 風ユースケース。

そのためには slab を出荷する。§8.4 の擬似コードが設計仕様で、第 15 章がその実装だ。

---

## §8.6  まとめと自己検証

### まとめ図

\`\`\`
フラット book 上の Match（本章）:

  fill ごと:    O(N) 走査 + O(1) 書き込み     → O(K × N) 総計
  ORDER_CAPACITY=32 book で K=16:           約 27 KCU(16 maker)、33 KCU(32)
  失敗モード:    32 スロットではなし(最悪の 32 fill + 空振りの走査 1 回で約 58 KCU)。
                 128 スロットでは約 40 fill を超えると CU 枯渇


Slab 上の Match（第 15 章、上で擬似コード化）:

  fill ごと:    O(log N) ツリーウォーク + O(1) FIFO 進行  →  O(K × log N) 総計
  1,024 注文の slab で K=16:               22 KCU(実測、§15.6)
  失敗モード:    プール枯渇（別 place_order 拒否で扱う）。
                 深い価格キーの上での長いマッチの CU(§15.7)


CU 圧への 3 つの対応:

  1. ComputeBudgetInstruction::set_compute_unit_limit(N)
     - 1.4M CU まで上限拡張。
     - コスト: 優先手数料は要求上限に対して、実消費に対してではない。

  2. max_fills ページング
     - 呼び出しあたり作業に上限、複数往復。
     - コスト: ページ間アトミック性喪失、ページあたり手数料。

  3. slab リファクタ
     - fill あたり O(log N)、O(N) ではない。
     - コスト: 実装 + 監査作業。
\`\`\`

### 自分で検証する 3 項目

1. **コストは乗算的に成長する。** book に 8、16、24 の活性 maker を事前投入せよ。それぞれに対し \`match-cli\` を \`--max-fills 4\`（定数）で実行する。\`units_consumed\` を記録する。N とともに増えるが、この大きさでは fill ごとの固定部分が支配的だ。私たちの測定では 8,500、9,276、9,980。\`O(K × N)\` の項はある(maker が 1 増えるごとに fill あたり約 22 CU)が、効いてくるにはもっと大きな N が要る(§8.2)。
2. **ページングは正しい小計を持つ。** 満杯 32 maker book と 10 単位 taker に対し \`--max-fills 16\` でマッチャを実行する。\`units_consumed\` と post-state の \`active_count\` を記録する。次に同じマッチング作業を \`--max-fills 8\` の 2 呼び出しに分けて行う。両呼び出しの \`units_consumed\` 合計は 1 回の 16 呼び出しの数値に非常に近いはずだ（2 つの \`process_match\` セットアップオーバーヘッドのぶんだけわずかに高い）。taker を 16 すべてを取れる大きさにすると、1 呼び出しで 33,020、2 呼び出しで 18,476 + 17,072 だった。
3. **バジェット引き上げは本物。** 32 スロットの book には、既定のバジェットに収まらないほど大きなマッチが入らない。詰め込まれた 32 maker book に対する 25 fill は 47,645 だった。\`ORDER_CAPACITY\` を 128 に上げ(演習 §8.2 のとおり)、book を満たし、64 fill を \`--cu-limit\` なしで実行する。失敗するはずだ。\`--cu-limit 500000\` を加える。成功するはずだ。\`sim.value.units_consumed\` が既定 200,000 と 500,000 の間にあることを確認せよ。


### 高くつくマッチを道具に探させる

第 4 章 §4.7 では、呼び出し側がわざと値段を選ぶ \`Bench\` に [solinv](https://github.com/psyto/solinv) の cu-dos を走らせた。\`Match\` は他の人が頼る命令で、その値段を選ぶのは 2 者だ。taker が \`max_fills\` を選び、maker が book をどれだけ埋めるかを選ぶ。[\`fuzz/matching/\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/matching) は book を 32 の買い注文で満たし(入る最大数。cu-dos は試すたびに book を元に戻す)、taker が 1〜255 の任意の \`max_fills\` を選べるようにして、1 回の \`Match\` に 50,000 CU の上限(\`MATCH_CU_CAP\`)を宣言する。第 3 章 §3.7 のとおり準備してから:

\`\`\`bash
cargo build-sbf --manifest-path programs/openhl-core/Cargo.toml
cd fuzz/matching
cargo build --release --features invariant_ch8
cargo test --release --features invariant_ch8      # コストは book とともに増える
timeout -s INT 60 crucible run openhl_matching_fuzz invariant_ch8 \\
    --binary-in target/release/invariant_test --timeout 45
\`\`\`

> **演習 §8.6.** 走らせよ。数秒で次のような行が出るはずだ:
>
> \`\`\`
> [FUZZ_FINDING] [cu-dos:…] ix match consumed 58148 CU (cap 50000)
> \`\`\`
>
> taker が、満杯の book で上限が許す以上の fill を求めた。58,148 は §8.2 の満杯の book での最悪の場合だ。第 4 章の教訓は、上限をランタイムの限界まで上げても何も直らない、だった。ここには本当の直し方がある。最悪の場合に上限があるからだ。book は 32 スロットで、1 回の呼び出しがどれだけ働くかはプログラムが決める。§8.2 の数値から、満杯の book で 50,000 に収まる \`max_fills\` はいくつまでか。その答えで \`process_match\` に \`if max_fills > N { return Err(...) }\` を足し、作り直してもう一度走らせよ。
>
> 答えは測定にある。満杯の book で 26 fill は 49,147、27 fill は 50,627 なので、収まる最大は 26 だ。一部だけ埋まった book では同じ上限でもコストが低い(27 maker に 28 を求めて 48,011)。maker がなくなれば fill が止まるからで、どの上限でも満杯の book が最悪の場合になる。私たちは次のツールチェーンの値段に備えて余裕をとり 24 を使った。fuzzer は 45 秒で何も見つけず、上限から予想したとおりだった。これは §8.3 の選択肢 (2)、ページングを必須にしたものだ。もっと fill がほしい taker は呼び出しを増やす。これが成り立つのは book が 32 スロットのままの間だけだ。128 スロットでは最初の 1 fill が 7,565 CU、以後 1 fill ごとに約 4,900 なので、同じ上限で 1 呼び出しが約 119,000 になりうる。\`ORDER_CAPACITY\` を上げるたびに上限を下げなければならない。この結びつきが、選択肢 (3)、slab(第 15 章)を選ぶ理由だ。slab の fill あたりコストは N ではなく log N で増える(§8.4)。

---

## 第 9 章への導線

market、vault、マッチャを手にした。**まだ持っていない**のは**マーク価格**だ。マッチャは注文を互いに交差させるが、perp DEX における**価格**には真実の源が 2 つある: トレードテープ（最終約定価格、本書のマッチャが暗黙に作る）と、外部オラクル（Pyth、Switchboard）で mark を spot に固定するもの。ファンディングレート、清算トリガ、リスク数学はすべて、最終約定ではなくオラクル mark に依存する。

第 9 章では Pyth 統合を歩く: 価格アカウント レイアウト、命令ハンドラ内部で自前のデシリアライズを信頼せず読む方法、スタール価格の扱い（\`slots_since_published\`）、Pyth が利用不可なら Switchboard 副を使うフォールバック。章は、プログラムが外部 mark 価格を読み、それを使って \`place_order\` の価格が健全帯内であることを検証するところに着地する — プログラム内の最初の本物のリスク制御だ。
`,
                },
                {
                  title: "第9章 — オラクル取り込み: Pyth 内部",
                  slug: "solana-internals-ch09-oracle-ja",
                  type: 'CONTENT',
                  sortOrder: 3,
                  duration: 45,
                  xpReward: 100,
                  content: `# 第9章 — オラクル取り込み: Pyth 内部

> 状態: ドラフト (v0.1)。
> 教材コード: [\`crates/state/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/state/src/lib.rs)（\`Oracle\`、加えて §9.5 のための Pyth v1 と v2 のレイアウト定数）、[\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs)（\`process_create_oracle\`、\`process_set_oracle_price\`、\`process_place_order_checked\`、\`process_place_order_checked_pyth\`、\`process_place_order_checked_pyth_v2\`、ヘルパ \`read_fresh_oracle\` / \`read_fresh_pyth_v1_oracle\` / \`read_fresh_pyth_v2_oracle\`）、[\`scripts/oracle/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/oracle/src/main.rs)、[\`programs/openhl-core/tests/pyth_binding.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/tests/pyth_binding.rs)（§9.5 のフィード固定のテスト）。
> 参照対象: Pyth Network mainnet プログラム（\`FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH\`）、Switchboard On-Demand。
>
> 部品化に伴い、この章で読むロジックは [\`crates/oracle/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/oracle/src/lib.rs)(\`openhl-oracle\`)に移り、プログラムはそれを呼び出す。以下に引用するコードは分割前の \`programs/openhl-core/src/lib.rs\` の版で、行番号は追従していない。

---

## §9.0  はじめに — 意図的なモック

外部価格オラクルのない perp DEX とは、「最後の取引が起きたところ」がそのままマーク価格になるデリバティブ市場のことだ。古びた板や薄い瞬間が最終取引を spot 市場から引き離すまで、それで動く — その時点で清算エンジンが現実と無関係な価格でトリガし始め、保険基金がそれを払う。マーク価格はファンディングレート、清算、必要証拠金、その他あらゆるリスク側計算の load-bearing な入力だ。プログラム自身のトレードテープから来てはならない。外部から来なければならない。

Solana 上の標準的な答えは **Pyth Network**（よく副として **Switchboard**）。両方とも資産ごとの価格アカウントを公開しており、任意のプログラムが読める。アカウントは publisher のプログラム所有で、あなたの所有ではない — あなたは厳密に読み手だ。

本章は、読み手がオラクル入力を安全に扱う方法についての章だ。仕事は 3 つに分かれる。

1. 価格アカウントを見つけ、レイアウトを検証し、price + confidence + exponent を読む。
2. Clock sysvar で鮮度をチェックし、古い価格での操作を拒否する。
3. 価格を意味あるプログラムチェックに適用する — ここでは \`place_order\` のサニティバンド。

教材例として、Pyth 価格フィードと同じ形をした独自の \`Oracle\` アカウント型を組み立て、それを自前のプログラムが所有する。これは意図的なスコープ判断だ。真の Pyth 統合なら \`pyth-sdk-solana\` をインポートし、価格更新アカウントの所有者チェックを \`pyth_program_id\` から取り、自明でない v2 形式の価格更新メッセージをパースすることになる。それをここでやれば、**読み取りパターン**ではなく SDK 呼び出しを教えることになる。オラクルをローカル所有にすることで publish 瞬間を制御でき、staleness 実験が容易になる — そして手法（staleness チェック、サニティバンド、防御的パース）はそのまま転用できる。本章は本番との差を慎重に明示する。

---

## §9.1  形だけの Pyth、要約

本物の Pyth v1 価格アカウントは約 3 KiB の構造体で、小さなヘッダ（magic + version + type + size）、製品紐付け、最近の価格観測の配列を含む。実際に必要なフィールドは 24 バイトに収まる。

\`\`\`text
price:        i64    // 符号付きマンティッサ
conf:         u64    // 1σ confidence interval、同単位
expo:         i32    // 10 進指数（通常負、例 -8 → 8 桁小数）
publish_slot: u64    // この価格が最後に更新されたスロット
\`\`\`

本物のマーク価格は \`price × 10^expo\`。confidence interval \`conf × 10^expo\` は価格がどれだけ tight かを表す — conf が広ければ publisher が不確かを意味し、多くのプログラムは \`conf > tolerance × price\` の価格を拒否する。

\`crates/state/src/lib.rs\` の本書の \`Oracle\` 構造体はちょうどこの形に、discriminator、bump、価格対象 market を加えたものだ。

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

合計 112 バイト、Pod、repr(C)。第 7 章の OrderBook と同じ手で、生のアカウントデータから bytemuck キャストで割り当てなしに取れる。

本物の Pyth 統合との違い、驚かないように明示しておく。

| 観点 | 本書の \`Oracle\` | 本物の Pyth |
|---|---|---|
| アカウント所有者 | openhl-core（本書のプログラム） | Pyth プログラム（mainnet では \`FsJ3...epH\`） |
| 所有者チェック対象 | \`program_id\`（自前） | \`&pyth_program::ID\` |
| アカウントレイアウト | この 112 バイト構造体 | Pyth v1 PriceAccount（約 3 KiB）または v2 更新メッセージ |
| 更新の仕組み | \`SetOraclePrice\` 命令（本書の publisher） | Pyth publisher が Pyth プログラムを呼ぶ |
| Discriminator | \`ORACLE\\0\\0\`（本書の慣習） | Pyth の magic 定数 + version フィールド |
| 古さの時計 | Clock sysvar \`slot\`（本書の publish_slot） | Pyth の \`publish_time\` + \`prev_publish_time\` |

右列のすべての項目に、左列の直接対応物がある。本書の \`Oracle\` でやることはすべて、本物の Pyth アカウントでもやる。magic 定数と所有者チェックが違うだけだ。

> **演習 §9.1.** mainnet の Pyth SOL/USD 価格アカウントを引け。そのサイズ（バイト）、所有プログラム、data の最初の 4 バイト（Pyth magic 定数）を確認せよ。本書の \`Oracle\` のサイズ、所有者、最初の 8 バイトと比較せよ。

---

## §9.2  オラクルを書く — \`SetOraclePrice\`

章で staleness シナリオを試すには、既知の瞬間にオラクルを書く手段が要る。\`programs/openhl-core/src/lib.rs:1513–1571\` から。

\`\`\`rust
fn process_set_oracle_price(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    payload: &[u8],
) -> ProgramResult {
    // ... ペイロード + アカウント検証 ...
    msg!("set_oracle_price: open-auth publisher = {}", publisher_ai.key);

    let clock = Clock::get()?;
    let mut data = oracle_ai.try_borrow_mut_data()?;
    let oracle: &mut Oracle = bytemuck::from_bytes_mut(&mut data[..Oracle::LEN]);
    // ... discriminator チェック ...

    oracle.price = price;
    oracle.conf = conf;
    oracle.expo = expo;
    oracle.publish_slot = clock.slot;
    // ...
}
\`\`\`

吸収すべき点は 2 つ。

**\`Clock::get()?\` は syscall だ。** Clock sysvar は \`slot\`、\`epoch\`、\`unix_timestamp\`、その他いくつかのフィールドを持つ。プログラムが現在実行中のスロットを知る**唯一の**手段だ。プログラムは壁掛け時計を読めず、ユーザが供給する現在時刻も信用できない。書き込み時に \`publish_slot = clock.slot\` を刻むのが、読み取り時の staleness チェックの基盤になる。

**publisher チェックは意図的に欠落している。** 命令は signer を受け入れるが、**どの**signer かは検証しない。本番ではこれは誤りだ — プログラム ID を持つ誰もが任意の価格を書け、サニティバンドに任意の limit を受け入れさせられる。修正は次のとおり。

1. **既知の publisher pubkey にピン留め。** \`pub const ORACLE_PUBLISHER: Pubkey = ...;\` を読み、\`publisher_ai.key == &ORACLE_PUBLISHER\` をチェックする。単純、pubkey が変わるなら rotation 手続きが必要。
2. **マルチ publisher 署名。** 受け入れ可能な publisher 集合をオラクルアカウント自身に格納。いずれの signer が一致すれば良い。
3. **アカウントを Pyth に渡す。** オラクルアカウントを Pyth プログラム所有にして、\`SetOraclePrice\` を完全に取り除く。これでオラクルは自前で書けなくなる、本番として正しいアーキテクチャだ。

章は (1) と (2) を演習として、(3) を散文で歩く。意図的な auth ギャップは、読者が §9.3 の staleness シナリオで既知のスロットで価格を止められるようにするためだ。

> **演習 §9.2.** \`programs/openhl-core/src/lib.rs\` に \`ORACLE_PUBLISHER: Pubkey\` 定数と、\`process_set_oracle_price\` に明示的な \`publisher_ai.key == &ORACLE_PUBLISHER\` チェックを追加せよ。定数は自分のウォレット pubkey に。\`oracle --set ...\` が自分のウォレットから動くが、新規鍵ペアから失敗することを確認せよ。

---

## §9.3  オラクルを読む — 基礎チェックとしての staleness

読み手パターンは小さなヘルパ \`read_fresh_oracle\`（lib.rs:1965–1987）に住み、\`process_place_order_checked\` から呼ばれる。第 11 章で追加する 3 つのポジションハンドラからも再利用するため、ガントレットは 4 度コピーされる代わりに 1 箇所に保たれる:

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

\`process_place_order_checked\` はこれを \`let mark = read_fresh_oracle(oracle_ai, program_id)?;\` として呼び、\`mark\` に対してサニティバンドを走らせる。

価格を信用する前に 4 つのチェック。

1. **Discriminator チェック**（\`oracle.discriminator != ORACLE_DISCRIMINATOR\`）: 初期化されていないオラクルアカウントを拒否する。本物の Pyth では magic 定数 + version 一致がこれにあたる。
2. **価格正値チェック**（\`oracle.price <= 0\`）: 非正価格のオラクル状態を拒否する。本物の Pyth は時折 \`0\` を「今は良い価格がない」シグナルとして publish する — 読み手はそれを扱わねばならない。
3. **Staleness チェック**（\`age > MAX_ORACLE_STALENESS_SLOTS\`）: 25 slot（約 10 秒）より古い価格を拒否する。これが本章の中心だ。鮮度をチェックできない価格は信用できない価格だ — publisher を止められる攻撃者（あるいは単にネットワーク障害を利用する者）が、それを盲信するプログラムを古い価格でゲームできるからだ。
4. **所有者チェック**（1969 行、\`oracle_ai.owner != program_id\`）: 異なるプログラム由来のアカウントを拒否する。本物の Pyth では \`oracle_ai.owner == &pyth_program::ID\`。

\`lib.rs:205\` の \`MAX_ORACLE_STALENESS_SLOTS = 25\`。選び方はワークロードによる: 25 slot は現行ターゲットスロット時間で約 10 秒。高ボラペア（BTC、ETH の荒れた日）なら、もっと tight に — おそらく 10〜15 slot。ステーブルコインペアならもっと wide で許せる。定数は理想的には market ごとに調整できるよう \`Market\` 構造体に持つべきだが、本書は簡潔さのためグローバルに置く。

\`read_fresh_oracle\` 内の借用は自然にヘルパ本体にスコープされる — 関数が返ったときにドロップし、呼び出し側が book を変更する前に解放される。これが重要なのは、オラクルと book の両方が \`AccountInfo\` として渡され、ランタイムは同じアカウントメモリの 2 つの可変借用が共存しないことを要求するからだ。本書のオラクルと book は別アカウントだとしても、借用をタイトにスコープするパターンは良い衛生だ — ハンドラが大きくなったときの微妙な aliasing バグを防ぐ。

**SDK が隠していること:** \`pyth-sdk-solana::load_price_feed_from_account_info\` は discriminator チェック、所有者チェック、型付き \`PriceFeed\` へのデシリアライズを行う。staleness チェックは**行わない** — それは常にあなたの仕事だ。明示的な staleness ゲートなしに Pyth を使うプログラムは、DeFi における最大のオラクルバグ群の 1 つに属して出荷される。

> **演習 §9.3.** スロット N でオラクル価格を設定せよ（\`oracle --set --price 100 ...\` を実行し、出力からスロットを控える）。30 slot 待つ（約 12 秒、\`solana confirm\` を適当な tx に当てればスロットがわかる）。フラグなしで \`oracle\` を実行する。\`age (slots)\` が 25 を超えるはずだ。\`place-order-checked\` を実行する（配線しているとして）— \`oracle stale\` で失敗するはずだ。

---

## §9.4  オラクルを使う — サニティバンド

staleness チェック済みの価格はもう安全に読める。最初のリスク制御として使うこと: オラクル mark から大きく外れる limit 価格の \`place_order\` 呼び出しを拒否する。

\`process_place_order_checked\` 1658–1671 行。

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

\`SANITY_BAND_BPS = 2000\`（lib.rs:211）で ±20%。\`mark = 100\` なら、価格 50 の注文は拒否される（\`low = 80\` 未満）、95 の注文は受け入れ、121 の注文は拒否。意図的に wide なバンド: tight なバンドは通常ボラの間に正当ユーザを失敗させる頻度を上げるし、章は**パターン**についての章であって calibration ではない。

本番バンドは market ごとに調整される。

- **高ボラ perp（荒れた日の BTC、ETH）:** 5〜10% が受け入れ可能かも。これより wide だと正当な fat-finger 隣接注文を拒否しすぎる。
- **中ボラ perp（SOL、AVAX）:** 3〜5% 典型。
- **低ボラペア（ステーブルコイン perp、FX）:** 1〜2%、ときにそれよりも tight。

バンドが最初のリスク制御である理由は、外部真実に依存する最も単純なものだから。ファンディングレート（第 10 章）と清算（第 11 章）は同じオラクル読み取りの上に立ち、より難しい数学に適用する。

**Saturating 算術。** \`saturating_mul\` と \`saturating_sub\` は意図的だ。\`mark = u64::MAX\`（実務上不可能だが理論上）だと乗算は wrap する。Saturating はそれを \`[u64::MAX - band, u64::MAX]\` のバンドに縮め、wraparound で 0..何かのバンドが生まれる代わりに、すべての合理的注文を優雅に失敗させる。Solana のプログラム ランタイムは整数オーバーフローでパニックする（\`release\` ビルドでは静かに wrap、\`debug\` ではパニック）— 明示的な saturating 演算は監査で報われる小さな習慣だ。

> **演習 §9.4.** オラクル価格を 100 に設定。価格 90（バンド内）、75（バンド外 — low 80 未満）、120（ぎりぎり内 — mark*0.2=20 なので high は 120）で注文を試す。各々を辿る。次に \`SANITY_BAND_BPS\` を 500（5%）に変えて同じ価格で再テスト。

---

## §9.5  本番 Pyth v1 — bytes-up で実装

モック \`Oracle\` は章が既知のスロットでパブリッシュを止められるように作られている。本番では、パブリッシャが独立に populate する Pyth アカウントから読む。マイグレーションは局所的 — 同じ staleness ガントレット、同じサニティバンド、違うパーサ — で、本章はそれを peer 命令 \`PlaceOrderCheckedPyth\`（タグ 32）として出荷し、2 つのパスを並べて比較できるようにする。Pyth v1 のレイアウトは bytes-up でパースできるほどよく定義されている — \`pyth-sdk-solana\` 依存なし。第 1 章の bytes-up 姿勢がそのまま通る。

### Pyth v1 PriceAccount のレイアウト

すべての Pyth v1 price アカウントはマジック定数 + バージョン + アカウント型識別子で始まり、EMA 簿記のヘッダ、最後に本当に信用する集約 \`agg\` ブロックがある。本書が読む 6 フィールド:

\`\`\`text
offset | size | field                       | チェックする内容
-------+------+-----------------------------+---------------------------------
   0   |  4   | magic (u32)                 | == 0xa1b2c3d4
   4   |  4   | ver   (u32)                 | == 2 (Pyth v1)
   8   |  4   | atype (u32)                 | == 3 (PriceAccount)
  20   |  4   | expo  (i32)                 | ログのみ; 適用しない（下記参照）
 208   |  8   | agg.price (i64)             | > 0
 216   |  8   | agg.conf  (u64)             | ログ
 224   |  4   | agg.status (u32)            | == 1 (Trading)
 232   |  8   | agg.pub_slot (u64)          | clock.slot - pub_slot <= MAX_ORACLE_STALENESS_SLOTS
\`\`\`

（\`agg\` はそのスロットでのパブリッシャネットワークの集約価格。Pyth は最大 32 パブリッシャを持ち、オンチェーン集約は毎スロット走る; \`agg.status\` がそれらが同意したかを反映する。）

オフセットは \`crates/state/src/lib.rs\` から \`PYTH_V1_OFFSET_*\` 定数としてエクスポートされる。完全な ~3 KiB の \`PriceAccount\` を Pod 構造体としてミラーするのは意図的に避ける — バイトの大半は本書が読まない publisher ごとの \`comp[]\` エントリだ。6 オフセットをハードコードするのはコードバイトが少なく、監査しやすく、本章の「バイトレイアウトが**契約**」のスタンスに一致する。

### \`read_fresh_pyth_v1_oracle\`

ヘルパ、骨格で:

\`\`\`rust
fn read_fresh_pyth_v1_oracle(oracle_ai: &AccountInfo) -> Result<u64, ProgramError> {
    let data = oracle_ai.try_borrow_data()?;
    if data.len() < PYTH_V1_MIN_LEN { return Err(InvalidAccountData); }

    // (1) ヘッダ ガントレット。
    if u32::from_le_bytes(data[0..4]) != PYTH_V1_MAGIC      { return Err(...); }
    if u32::from_le_bytes(data[4..8]) != PYTH_V1_VERSION    { return Err(...); }
    if u32::from_le_bytes(data[8..12]) != PYTH_V1_ACCOUNT_TYPE_PRICE { return Err(...); }

    // (2) 集約ステータス。
    let status = u32::from_le_bytes(data[PYTH_V1_OFFSET_AGG_STATUS..]);
    if status != PYTH_V1_STATUS_TRADING { return Err(InvalidAccountData); }

    // (3) Staleness — agg.pub_slot vs Clock.slot。
    let pub_slot = u64::from_le_bytes(data[PYTH_V1_OFFSET_AGG_PUB_SLOT..]);
    let age = Clock::get()?.slot.saturating_sub(pub_slot);
    if age > MAX_ORACLE_STALENESS_SLOTS { return Err(InvalidAccountData); }

    // (4) 価格を読み、観測性のため expo/conf をログ。
    let price_i = i64::from_le_bytes(data[PYTH_V1_OFFSET_AGG_PRICE..]);
    if price_i <= 0 { return Err(InvalidAccountData); }
    Ok(price_i as u64)
}
\`\`\`

チェック順序はモックパスをミラーする: 構造検証が先（magic / version / atype）、次にステータスチェック（本書モックの discriminator+initialization チェックの Pyth 類似）、次に staleness、最後に価格サニティ。どの失敗も \`InvalidAccountData\` を返すので、呼び出し側は stale なまたは非 Trading な Pyth フィードをモックの stale 処理と同じように扱える。

フラグすべき設計判断 4 つ:

**1. リーダーはバイトを確かめ、ハンドラはどのアカウントかを確かめる。** モックパスは \`oracle_ai.owner == program_id\` を要求するが、ここのリーダーには所有者の検査がない。この章の最初の版は、検査は要らないと書いていた。「magic+version+atype ガントレットがすでにアカウントが Pyth v1 PriceAccount であることを構造的に保証する」からだ、と。保証しない。誰でも自分が所有するアカウントを作り、magic、version、account type、Trading の status、好きな価格を書き込んで渡せる。\`programs/openhl-core/tests/pyth_binding.rs\` のテスト \`pyth_v1_reads_only_the_pinned_price_account\` はまさにそれをやり、呼び出し側が選んだ価格に対して注文が通った。Pyth プログラム ID をハードコードすると mainnet 対 devnet の選択を最初から強いる(mainnet は \`FsJ3...epH\`、devnet は \`gSbE...92s\`)ので、代わりに市場が両方を保存する。市場の authority が \`SetPythFeeds\`(タグ 34)で設定する、期待する Pyth アカウントの**pubkey**(\`Market.pyth_v1_price_account\`)と、それを所有しなければならないプログラム(\`Market.pyth_v1_program\`)だ。\`PlaceOrderCheckedPyth\` は呼び出しのたびに両方を確かめ、何も固定されていない間は無条件に拒否する。アドレスだけでは足りない。そのアドレスのアカウントが閉じられ、別の誰かに作り直されることがありうる。テストの \`recreated\` の場合が、所有者の検査がそれを拒否するのを示す。アドレスを固定すれば、資産を取り違える問題も片づく。別の組の本物のフィードは別のアドレスだからだ。それでもプログラムが信じているのは authority の設定だ。間違ったアカウントと所有者を固定すれば、それを読む。

**2. \`expo\` は読みログするが適用しない。** Pyth 価格は \`(mantissa, expo)\` ペアで来る — 本物の価格は \`mantissa × 10^expo\`。USD ペアでは \`expo\` は典型的に \`-8\`。モック側に expo はない（本書 \`Oracle.price\` は market が使うスケールでの u64）ので、本章で 2 パスを相互運用可能に保つため、mantissa を価格として扱い \`expo\` を観測性のためにログする。本番デプロイは正規化する: 単一サポート \`expo\` を固定し他を拒否するか、その場でプログラムの固定小数点規約に翻訳するか。これがマイグレーションで本物のバグを書く可能性が最も高い場所; 本章はそれを呼び出して TODO を自分で置けるようにする。

**3. status == Trading でも \`price <= 0\` は拒否する。** Pyth は時々 0 を publish する — 集約が非負だが degenerate な publisher ネットワークのコーナーケース。モックパスも同じく拒否する; Pyth パスも合わせる。

**4. \`agg.status != Trading\` はハード拒否、フォールバックではない。** Switchboard フォールバック付きの本物の本番リーダーは、ここでエラーを返さずに他のオラクルを試すだろう。本章はフォールバックを出荷しない、教材例が v1 単一オラクルマイグレーションだからだ; フォールバックパターン（try-A-then-B 不一致許容付き）は上に乗せるのは簡単 — §9.5 の closing ノートが配置する。

### \`PlaceOrderCheckedPyth\`（タグ 32）

ピア命令。\`PlaceOrderChecked\` と同じペイロード（\`[side u8][price u64 LE][size u64 LE]\`）、同じ 8 先頭アカウント、2 変更を除く:

- スロット 2 は Pyth v1 PriceAccount、モック \`Oracle\` ではない（market から oracle PDA クロスチェックはドロップ; Pyth アカウントは PDA 導出対象ではない）。
- オラクル側ガントレットは \`read_fresh_oracle\` ではなく \`read_fresh_pyth_v1_oracle\` を呼び、その前にハンドラは、スロット 2 が市場の固定した \`pyth_v1_price_account\` であることを求める(上の設計判断 1)。

下流すべて — サニティバンド、手数料エスクロー、book write — はモックパスと同一。両ハンドラは同じ \`SANITY_BAND_BPS\`、\`PROTOCOL_FEE_BPS\`、末尾の同じ \`spl_token_transfer_user_signed\` Transfer を共有する。マイグレーションの surface は §9.5 が約束したとおり: 局所的。

### Pyth v2 — 同じ章、違うアーキテクチャ

\`read_fresh_pyth_v1_oracle\` の「v1」が重要。Pyth の v1 モデル — パブリッシャが毎スロット静的 PriceAccount に書き、リーダーがそれをパース — は廃止されつつあり、v2 の **プルオラクル** アーキテクチャに置き換わる。Perp DEX にとって重要な洞察は、v2 アーキテクチャが 2 つの層にきれいに分かれることだ:

1. **Pyth の \`pyth-solana-receiver\` プログラム**が暗号作業をする。Wormhole VAA（Verified Action Approval — Wormhole の guardian set の 2/3 以上が署名したペイロード）に包まれた Pyth update メッセージを受け取り、Solana の secp256k1 precompile で guardian 署名を検証し、bundled update の Merkle proof があれば検証し、検証済み価格を \`PriceUpdateV2\` アカウントに書く。
2. **コンシューマ**（あなた、perp DEX）がその \`PriceUpdateV2\` アカウントを読む。VAA 検証なし。Guardian set 管理なし。あなたのホット パスに暗号なし。

その 2 層を混同したら（本セクションの初期ドラフトはした）、v2 はあなたの側に ~2000 行の暗号コードが必要だと結論するだろう。そうではない。Wormhole 作業は Pyth のプログラムに住み、それは共有インフラだ; perp DEX で出荷するのは構造的に v1 リーダーと同じ、ただし異なるアカウント レイアウトに対するもの。

\`PlaceOrderCheckedPythV2\`（タグ 33）がコンシューマ側を出荷する。リーダーの前に、ハンドラが 2 つの検査をする。リーダーにはできない検査だ。アカウントは市場が固定した receiver プログラムが所有していなければならず(\`Market.pyth_v2_receiver\`。その ID はクラスタごとに違うので、定数ではなくデータにする)、その \`feed_id\` は \`Market.pyth_v2_feed_id\` と等しくなければならない。1 つ目がなければ、誰でも自分のプログラムから、discriminator まで含めて \`PriceUpdateV2\` の形のアカウントを書ける。2 つ目がなければ、別の資産の本物の更新が通る。ハンドラはさらに、更新が完全に検証されていること(\`VerificationLevel::Full\`)を求める。Partial の更新は Wormhole の定足数より少ない guardian の署名で確かめられたもので、Pyth 自身の SDK も価格としては拒否する。\`pyth_v2_reads_only_the_pinned_receiver_and_feed\` は 3 つすべてを試し、署名 0 と 13 の Partial の更新も含む。リーダー:

\`\`\`rust
fn read_fresh_pyth_v2_oracle(oracle_ai: &AccountInfo) -> Result<u64, ProgramError> {
    let data = oracle_ai.try_borrow_data()?;
    if data.len() < PYTH_V2_MIN_LEN { return Err(InvalidAccountData); }

    // (1) Anchor account discriminator。PriceUpdateV2 は Anchor の
    // sha256("account:PriceUpdateV2")[..8] 規約を使う。
    if data[0..8] != PYTH_V2_PRICE_UPDATE_DISCRIMINATOR { return Err(...); }

    // (2) VerificationLevel — ログのみ。本番は Full を要求するかも。
    let level_tag = data[PYTH_V2_OFFSET_VERIFICATION_LEVEL];
    // Partial { num_signatures }  | Full

    // (3) Staleness — posted_slot に対して、receiver が update を書いた
    // Solana slot。
    let posted_slot = u64::from_le_bytes(data[PYTH_V2_OFFSET_POSTED_SLOT..]);
    if Clock::get()?.slot.saturating_sub(posted_slot) > MAX_ORACLE_STALENESS_SLOTS {
        return Err(InvalidAccountData);
    }

    // (4) 価格 + exponent / conf / publish_time をログ。
    let price_i = i64::from_le_bytes(data[PYTH_V2_OFFSET_PRICE..]);
    if price_i <= 0 { return Err(InvalidAccountData); }
    Ok(price_i as u64)
}
\`\`\`

PriceUpdateV2 のオンチェーン レイアウト、オフセットでパース（Anchor が Pyth の構造体を borsh シリアライズする）:

\`\`\`text
offset | size | field                            | 何に使うか
-------+------+----------------------------------+---------------------------------------
   0   |  8   | anchor_discriminator             | == [34,241,35,99,157,126,244,205]
   8   | 32   | write_authority (Pubkey)         | （確かめない — このアカウントを更新・クローズできる者）
  40   |  1   | verification_level tag           | ログ; 0=Partial、1=Full
  41   |  1   | verification_level.num_signatures| ログ（tag==Partial のときのみ）
  42   | 32   | price_message.feed_id            | == \`Market.pyth_v2_feed_id\`(ハンドラが確かめる)
  74   |  8   | price_message.price (i64)        | > 0; u64 mark として返す
  82   |  8   | price_message.conf  (u64)        | ログ
  90   |  4   | price_message.exponent (i32)     | ログ; 本番は 10^expo で正規化
  94   |  8   | price_message.publish_time (i64) | ログ; 情報用（Pyth の Unix timestamp）
 102   |  8   | price_message.prev_publish_time  | 未使用
 110   |  8   | price_message.ema_price          | 未使用（章は spot 価格を使う）
 118   |  8   | price_message.ema_conf           | 未使用
 126   |  8   | posted_slot (u64)                | Staleness ガントレット
 134                                                — 終わり
\`\`\`

オフセットは \`crates/state/src/lib.rs\` から \`PYTH_V2_OFFSET_*\` としてエクスポートされる。これは **Partial** の更新のオフセットだ。Borsh は \`VerificationLevel::Full\` を 2 バイトでなく 1 バイトで書くため、Full の更新では \`price_message\` 以降の全フィールドが 1 バイト前にずれる。上に引用した分割前の読み手は固定オフセットを使っており Full を誤読していた。現在は \`openhl_oracle::pyth_v2::parse\` が両方を扱う。v1 と同様、完全な Pod 構造体をミラーしない — 6 フィールド読み込み、Anchor 依存なし、バイト レイアウトが**契約**だ。

### 2 命令 トランザクション パターン

v2 リーダーが前提とするアーキテクチャの一片: トレード命令が走るとき \`PriceUpdateV2\` アカウントが*fresh*でなければならない。実際にはコンシューマ トランザクションは receiver の \`post_update_v2\` 命令を最初の命令として、トレード命令を 2 番目として含めることでこれを行う:

\`\`\`text
tx = [
  pyth-solana-receiver::post_update_v2(vaa_data, update_data, …),  // VAA 検証、アカウント書き込み
  openhl::place_order_checked_pyth_v2(side, price, size),          // 今書かれたアカウントを読む
]
\`\`\`

\`post_update_v2\` は per-(feed_id, write_authority) \`PriceUpdateV2\` PDA を書き、\`place_order_checked_pyth_v2\` がそれを読む。クライアントは Pyth の price-update service（パブリッシャ署名を VAA に集約する HTTP エンドポイント）から最新 VAA を fetch し、最初の命令にバンドルし、staleness ガントレットがすべてを同期させる。本書のハンドラから receiver へのオンチェーン CPI はない: アカウント経由で通信し、直接ではない。

これはまた、本書の v2 ハンドラが「post」命令や Wormhole アカウントを取らない理由でもある: コンシューマ トランザクションが配線、プログラムは単に読む。

### 真に繰り延べられているもの

コンシューマ側が出荷された今、残るのは**自前の Wormhole スタイル receiver を走らせること**だ。Wormhole チェーンに公式 Pyth receiver がないところから Pyth updates を読みたい場合、あるいは receiver が公開しない追加メッセージ型（ガバナンス updates、mapping changes）を検証したい場合に有用だ。それ自体が独自章だ — 保存された guardian set に対する secp256k1 署名復元、リプレイ保護、bundled updates の Merkle proof 検証。ここの perp DEX コンシューマ パスはそのどれも必要としない。

### Switchboard フォールバック

単一オラクルは単一障害点。Pyth は停止したことがある。Switchboard も停止したことがある。両方同時に（稀に）起きたこともある。下方を守るプログラムは**両方**を信頼し、どちらも fresh でなければ動作を拒否する。配線は機械的だ:

1. トランザクションの \`AccountMeta\` 配列に両オラクルアカウントを含める。
2. ハンドラがそれぞれを読み、完全な検証パターン（discriminator/magic + status + 価格正値 + staleness）を行う。
3. どちらかが通れば使う。両方失敗なら呼び出し拒否。

これを行うプログラムは典型的に、両方が fresh のときは 2 つを**比較**もする — ある許容（例: 50 bp）を超えて不一致なら呼び出し拒否。Pyth と Switchboard の 50 bp 不一致は通常どちらかが誤っており、ユーザに安い方を選ぶだけのプログラムはゲームされてきた。

> **演習 §9.5.** 本物の Pyth v1 mainnet PriceAccount を選べ（SOL/USD は執筆時点で \`H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG\` — Pyth の price-feed-ids ページで検証せよ）。ローカル validator の \`clone\` 機能を使ってそのアカウントをテストクラスタにミラーし、市場の authority の署名で \`SetPythFeeds\` によりそれを市場に固定してから、それに対して \`PlaceOrderCheckedPyth\` を invoke せよ。次に、設計判断 1 が述べる攻撃を試せ。アカウントのバイトを自分が所有するアカウントに写して、そちらを渡す。\`oracle is not the market's pinned Pyth v1 feed\` で失敗するはずだ。ログされた \`expo\` を SOL/USD product と比較せよ（\`-8\` のはず）。Staleness ガントレットをアカウントの古いスロットをアーカイブから再生して確認せよ。

---

## §9.6  まとめと自己検証

### まとめ図

\`\`\`
外部真実 → プログラム安全:

  Pyth/Switchboard publisher          本書の Oracle アカウント
   ┌──────────────────┐                ┌───────────────────────┐
   │ 数 slot ごとに    │ ── 所有 ────► │  Pyth プログラム (mainnet) │
   │ price+conf を書く │                │  openhl-core (本書)    │
   └──────────────────┘                └───────────────────────┘
                                                │  読む
                                                ▼
                                   ┌─────────────────────────────┐
                                   │ place_order_checked         │
                                   │  - オラクル アカウント ロード │
                                   │  - 所有者チェック             │
                                   │  - discriminator チェック    │
                                   │  - price > 0                │
                                   │  - Clock 経由の staleness   │
                                   │  - ±X bps のサニティバンド   │
                                   │  - 通常の place を走らせる    │
                                   └─────────────────────────────┘

価格を信用する前に必要なチェック:

  ┌────────────────────────┬──────────────────────────────────┐
  │ チェック               │ どこで                            │
  ├────────────────────────┼──────────────────────────────────┤
  │ owner == オラクル プログラム │ どのデータ読みより先          │
  │ discriminator 一致      │ data の最初の 8 バイト           │
  │ price > 0              │ 「価格なし」シグナルを拒否        │
  │ slot age <= MAX        │ Clock sysvar を要する             │
  │ （任意）conf 小         │ 広い / 不確かな価格を拒否        │
  │ サニティバンド          │ 価格をユーザ入力に適用            │
  └────────────────────────┴──────────────────────────────────┘
\`\`\`

### 自分で検証する 3 項目

1. **Discriminator チェックは重要。** market PDA を作り、\`place_order_checked\` のオラクルスロットに market PDA を渡すトランザクションを組み立てよ。\`read_fresh_oracle\` の [\`lib.rs:1974\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs#L1974) の discriminator チェックが \`UninitializedAccount\` で失敗するはずだ。このチェックがないと、コードは \`bytemuck::from_bytes\` でゴミデータに当てて意味のない \`price\` を使う。
2. **Staleness はセキュリティゲート。** オラクルを設定し、30+ slot 待ち、バンド内の任意の価格で注文を試みよ。\`oracle stale\` で失敗するはずだ。これが最も忘れられがちなチェックで、実戦で最多のオラクル exploit を生んできたチェックでもある。
3. **バンドの境界は厳密。** \`SANITY_BAND_BPS = 2000\`、\`mark = 100\` で、ちょうど 80 の注文は**受け入れ**られるはずだ（チェックは \`< low\`、\`<= low\` ではない）。ちょうど 79 の注文は拒否されるはずだ。両方を実行して確認せよ。\`<=\` と \`<\` の slip エッジケースは 1 bp、tight なバンドや高価格では差のドル額が無視できなくなる。

---

## 第 10 章への導線

マーク価格を手にした。perp DEX がそのマークでやる次のことは**ファンディングレート**だ。ファンディングは、ロングとショートのポジションが perp の価格を spot に係留するために定期的に支払いを交換する仕組み — 形式的には \`funding_rate ≈ k × (perp_premium_index - mark_price) / mark_price\`、\`perp_premium_index\` は最近の約定価格に対する何らかの蓄積、\`mark_price\` はちょうどいま読み方を学んだもの。レートはファンディング窓口ごとに支払う（多くの取引所で 1 時間、一部で 8 時間）、プログラムは無制限ループなしにポジションごとの決済を継続的に蓄積しなければならない。

第 10 章では、時間窓蓄積パターン、ファンディング期限のための Clock sysvar の \`unix_timestamp\` フィールド、すべてのポジションに「このスロットでファンディング支払い」を単一トランザクションが全ポジションに触れずに行わせるためのクランク/keeper パターンを歩く。ここが、Phase A の並列性レッスン（第 5 章）がデータレイアウトを支配し始める場所だ: ファンディング決済はシングルトンの「合計」アカウントがボトルネックになる典型ケースで、§5.5 のシャーディングパターンを使ってそれを避ける。
`,
                },
                {
                  title: "第10章 — ファンディングレートの仕組み",
                  slug: "solana-internals-ch10-funding-ja",
                  type: 'CONTENT',
                  sortOrder: 4,
                  duration: 45,
                  xpReward: 100,
                  content: `# 第10章 — ファンディングレートの仕組み

> 状態: ドラフト (v0.1)。
> 教材コード: [\`crates/state/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/state/src/lib.rs)（\`FundingState\`）、[\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs)（\`process_create_funding_state\` 2162–2232 行、\`process_update_funding\` 2239–2317 行）、[\`scripts/funding/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/funding/src/main.rs)。
>
> 部品化に伴い、この章で読むロジックは [\`crates/funding/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/funding/src/lib.rs)(\`openhl-funding\`)に移り、プログラムはそれを呼び出す。以下に引用するコードは分割前の \`programs/openhl-core/src/lib.rs\` の版で、行番号は追従していない。

---

## §10.0  はじめに

無期限先物契約には満期がない。満期がなければ、契約の価格を原資産の spot 価格に引き戻す構造的な力もない。ファンディングはそれをやる仕組みだ: ロングとショートが定期的に、perp のマーク価格が原資産からどれだけ乖離しているかに比例する少額を互いに支払う。perp が spot より高いとき、ロングがショートに支払う（ショートの参入とロングの退出を促す）。低いときは逆。

経済は単純。エンジニアリングはそうでもない。

Solana プログラムは market 内のすべてのポジションを単一トランザクションで反復できない — 数が多すぎ、tx あたり CU バジェットが最初の数百で尽きる。壁掛け時計には頼れない（Clock sysvar の \`unix_timestamp\` が唯一の合法的な時間信号）。レートを正直に更新するオフチェーンプロセスは信用できない（keeper はすべて最小化すべき信用前提）。そしてポジションごとの決済額は、ファンディング間隔の間に何度ポジションが触れられようと、グローバル蓄積子と正確に一致しなければならない。

4 つの制約を同時に解くパターンは、**時間窓累積指数 (time-windowed cumulative index)** だ。本章ではこれを歩く。次の順で進める。

1. ファンディングが形式的に何を意味するか、そして累積パターンが制約からどう導かれるかを読む。
2. \`FundingState\` アカウントレイアウトを歩く — market ごとに 1 つの固定サイズ PDA、累積指数と現行レートを持つ。
3. \`UpdateFunding\` を歩く — 区分線形セグメントで指数を進める keeper クランク。
4. ポジションごとの \`SettleFunding\` 半分を擬似コード化する（Position は第 11 章。読み手パターンは完全に後送りするには重要すぎる）。
5. 設計を第 5 章の並列性議論に結びつける: タッチ時ファンディング決済は、**誤った**設計（シングルトン「合計」アカウント）がスループットを潰す典型ケースだ。

本章は新規 syscall は少なく、アーキテクチャの趣味は長い。コードは小さい。パターンが教えだ。

---

## §10.1  ファンディングとは形式的に何か

2 つの量が計算の錨になる。

- **マーク価格** — プログラム（あるいはチェーン全体）が原資産の現在価格と見なすもの。第 9 章のオラクル。staleness チェック付きで読む。
- **プレミアム指数 (premium index)** — perp 価格が直近の過去でマークからどれだけ乖離したかを平滑化した尺度。実務上、取引所は \`(perp_mid - mark) / mark\` をファンディング窓口で平均し、なんらかのクランプを加える。

ファンディングレートはおおよそプレミアム指数に比例する。

\`\`\`
funding_rate ≈ k × clamp(premium_index, -max_rate, +max_rate)
\`\`\`

符号規約: 正のレートはロングがショートに支払う、負はショートがロングに支払う。

長さ \`T\` 秒の窓に対し、サイズ \`s\`（ロング正、ショート負）のポジションが蓄積するファンディングは:

\`\`\`
funding_owed(s, T) = funding_rate × T × s
\`\`\`

quote 通貨（通常 USDC）で支払われる。ロングとショートは市場全体でゼロサム — ファンディングは**再分配**であって手数料ではない。

ここから設計上の観察が 2 つ落ちる。

1. **重要なのは積分であって瞬間レートではない。** ファンディング窓口の半分だけ存在したポジションは、半窓ぶんのファンディングを支払う。決済額はポジションの寿命にわたるレートの時間積分に依存し、ある特定瞬間のレートには依存しない。
2. **積分は market 内のすべてのポジションで同じ。** 窓の始めに開かれたか中央で開かれたかに関わらず、**レート**は market のレートで、ポジションごとのレートではない。だからポジションごとに再計算する代わりに、market 全体の単一の走行合計 — **累積ファンディング指数 (cumulative funding index)** — を保持し、各ポジションに open 時の指数スナップショットを引かせる。

これがパターンだ。本章の残りはこれを実装する。

> **演習 §10.1.** \`funding_rate = 0.0001 / hour\`（10 bps/hour）が 24 時間一定で、ロングサイズ 100 のポジションを全期間持っていたとする。いくらファンディングを支払った（または受け取った）か。次に最初の 12 時間が +0.0001/hour、後半 12 時間が -0.0001/hour だったとする。答えは同じか。なぜか。

---

## §10.2  \`FundingState\` アカウント

market あたり PDA 1 つ、120 バイト。\`crates/state/src/lib.rs\` から。

\`\`\`rust
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct FundingState {
    pub discriminator: [u8; 8],          // 0..8
    pub bump: u8,                         // 8
    pub _pad0: [u8; 7],                   // 9..16
    pub market: [u8; 32],                 // 16..48
    pub cumulative_funding_index: i64,    // 48..56  — 1e9 でスケール
    pub last_update_ts: i64,              // 56..64  — Clock.unix_timestamp
    pub last_update_slot: u64,            // 64..72
    pub current_rate_per_sec: i64,        // 72..80  — 1e9 でスケール
    pub window_seconds: u64,              // 80..88
    pub _reserved: [u8; 32],              // 88..120
}
\`\`\`

load-bearing なフィールドは 3 つ。

**\`cumulative_funding_index: i64\`** が走行合計。\`UpdateFunding\` が走るたびに \`current_rate_per_sec × seconds_elapsed\` だけ進む。レートが負（ショートがロングに支払う）にもなれるので符号付き。\`1e9\` でスケールしているので、表現可能な最小レートは base 名目 1 単位あたり 1 ナノ秒ぶん — 典型 perp 経済に十分な精度。

**\`last_update_ts: i64\`** は指数が最後に進められた Clock unix_timestamp。次の更新が \`elapsed = clock.unix_timestamp - last_update_ts\` を計算し、それを積分間隔として使う。Solana プログラムが 2 つのオンチェーン イベントの間にどれだけ時間が経過したかを知る唯一の方法だ。

**\`current_rate_per_sec: i64\`** は \`last_update_ts\` **以降**有効だったレート。\`UpdateFunding\` が走ると、まずこの先行レートを経過した窓に適用し、それから次の窓のための新レートをインストールする。これが「step 関数」の半分 — 指数は区分線形セグメントで進み、keeper 呼び出しごとに 1 セグメントだ。

他のフィールドは機械的: 標準チェックのための discriminator、PDA のための bump、追跡可能性のための market pubkey、設定されたファンディング窓口を知りたい呼び出し側のための window_seconds、forward-compat のための 32 バイト。

> **演習 §10.2.** 「0.01% per 8 hours」（Binance perp の既定）のファンディングレートを、ここで使う scaled-1e9 \`current_rate_per_sec\` 形式に変換せよ。算術を示せ。

---

## §10.3  \`UpdateFunding\` を歩く

\`programs/openhl-core/src/lib.rs:2239–2317\` の \`process_update_funding\` が唯一の変更子。検証を除いた本体:

\`\`\`rust
let new_rate = new_rate_raw
    .max(-MAX_FUNDING_RATE_PER_SEC_ABS)
    .min(MAX_FUNDING_RATE_PER_SEC_ABS);

let clock = Clock::get()?;
let elapsed = clock.unix_timestamp.saturating_sub(funding.last_update_ts);
let elapsed_u = elapsed as u64;

let delta = (funding.current_rate_per_sec as i128) * (elapsed_u as i128);
let new_cumulative = (funding.cumulative_funding_index as i128).saturating_add(delta);
// ... i64 飽和クランプ ...

funding.cumulative_funding_index = new_cumulative_clamped;
funding.current_rate_per_sec = new_rate;
funding.last_update_ts = clock.unix_timestamp;
funding.last_update_slot = clock.slot;
\`\`\`

操作は 4 つ。

**keeper レートをクランプ。** \`MAX_FUNDING_RATE_PER_SEC_ABS = 1_000_000\` scaled-1e9 単位 = 0.001 / sec ≒ 86.4% / 日。教育用に loose。本番キャップはもっと tight（おそらく 0.05% / 時、約 1.5% / 日最大）。クランプは侵害された、あるいはバグった keeper への防御 — 最悪でもレートをキャップに押し上げるだけ。

**Clock から経過時間を計算。** \`Clock::get()?\` がオンチェーンで何時か知る唯一の合法的方法。\`unix_timestamp\` は Unix epoch からの秒数を表す \`i64\`。ランタイムが slot ごとに更新するので、前の \`UpdateFunding\` と同じ slot で走る tx は \`elapsed = 0\` を見る — ファンディングは蓄積せず、レートが再設定されるだけだ。それで構わない。keeper スケジュールはポリシーであって不変条件ではない。

**経過窓に**先行**レートを適用。** これがパターンの中心。\`elapsed_u\` に掛けるレートは \`funding.current_rate_per_sec\` — **前の** \`UpdateFunding\` 呼び出しで設定されたレート。それから新レートをインストールする。これが指数を時間の区分線形関数にする: \`t₀\` から \`t₁\` までレート \`r₀\` で成長、\`t₁\` から \`t₂\` まで \`r₁\` で成長、以下同様。

**計算中のオーバーフローを避けるため \`i128\` に昇格。** 中間値 \`delta = rate × elapsed\` は長い間隔や大きなレートで \`i64\` を超えうる。\`i128\` で計算し、保存時に \`i64\` に飽和する。ポジション累積 \`i64\` は約 9 × 10^18 scaled-1e9 単位を保持できる — 通常レートで何世紀ぶんも入る。パニックではなく飽和することで、オーバーフローが優雅に劣化する（レート計算がキャップし、プログラムがクラッシュしない）。

**SDK が隠していること:** Anchor アカウントの \`Time::now()\` 風ヘルパは、**すべての**時間読み取りが Clock syscall であるという事実を覆い隠しがちだ。無料で読める「壁掛け時計」はない。\`Clock::get()\` 1 回が CU コスト。2 回読むハンドラ（一度 staleness 検証、一度 elapsed 計算）では、2 回呼ぶ代わりに最初の読み値をローカル変数にキャッシュできる。

> **演習 §10.3.** \`UpdateFunding\` を数秒間隔で 3 回連続で呼べ:
>   1. \`--rate 100\`（非ゼロレート）
>   2. 約 5 秒待ち、\`--rate 200\`
>   3. 約 5 秒待ち、\`--rate 0\`
>
> 各呼び出し後にファンディング状態をダンプせよ。\`cumulative_funding_index\` は次のようになるはず:
>   - 呼び出し 1 後: まだ 0（蓄積する先行レートがない）。
>   - 呼び出し 2 後: 約 \`100 × 5 = 500\`（レート 100 が約 5 秒）。
>   - 呼び出し 3 後: 約 \`500 + 200 × 5 = 1500\`。
>
> 正確な数値は実際の経過秒数に依る。形が教えだ。

---

## §10.4  もう半分 — ポジションごとの決済（擬似コード）

\`FundingState\` がグローバル指数を持つ。ポジションごとの半分は読み手側。ポジションが open されるとき、現在の指数をスナップショットする:

\`\`\`rust
// open_position 時:
position.funding_snapshot_index = funding.cumulative_funding_index;
\`\`\`

ポジションが後で触れられたとき（close、変更、清算、close なし決済）、差分を計算して PnL として適用する:

\`\`\`rust
// 任意のポジション タッチ時:
let index_delta = funding.cumulative_funding_index - position.funding_snapshot_index;
let funding_pnl_scaled = (index_delta as i128) * (position.size as i128);
let funding_pnl = (funding_pnl_scaled / 1_000_000_000) as i64; // 1e9 スケールを戻す
position.realized_pnl += funding_pnl;
position.funding_snapshot_index = funding.cumulative_funding_index;
\`\`\`

これがパターン全体。注目すべき性質は 3 つ。

1. **タッチごとに定数時間。** 反復なし。open とタッチの間に UpdateFunding 呼び出しが何回起きようと、ポジションごとの settle は固定コストの引き算と掛け算だ。
2. **ポジション間の調整なし。** ポジション A とポジション B は並列に決済できる — 別々のポジション アカウントに触れ、（単一の）\`FundingState\` を**読む**だけだ。第 5 章から: これは共有アカウント上の読み読みパターンで、Sealevel スケジューラは完全並列を許可する。
3. **決済は正確であって近似ではない。** 指数はレートの単調な積分なので、任意の 2 つのスナップショット間の差分は、その間隔の間に一定サイズのポジションに**正確に**蓄積したファンディングだ。ドリフトなし、1e9 スケーリングが強制するもの以外の丸め誤差なし。

実装は \`process_settle_position\`（第 11 章以降）に住み、ポジションに触れる他のあらゆる命令から呼ばれる。第 11 章で Position を正式に導入し、この半分を直接接続する。今のところ、擬似コードは正しく完全だ — Position が存在すれば実装は機械的になる。

> **演習 §10.4.** \`cumulative_funding_index = 1500\` でポジションが open される、サイズ = 100。3 更新後、指数は 1800 を読む。ファンディング PnL は? 次にもう 1 更新で指数が 1750 に進む（つまりスナップショット以降 50 **下がった**）。新しい PnL は?

---

## §10.5  クランク / keeper — UpdateFunding を何が、いつ走らせるか

\`UpdateFunding\` はトレーダが呼ぶものではない。keeper が呼ぶ — 唯一の仕事がスケジュールに従って \`UpdateFunding\` トランザクションを送って指数を前進させるオフチェーン プロセスだ。

最小限の keeper ループ、擬似 Python で:

\`\`\`python
import time
while True:
    mark = read_oracle_mark(market)            # 第 9 章
    perp_mid = read_book_mid(market)           # 第 7 章
    premium = clamp((perp_mid - mark) / mark, -MAX, +MAX)
    new_rate_per_sec = premium * RATE_SCALAR
    send_tx(UpdateFunding(new_rate_per_sec), market)
    time.sleep(60)  # market ごとに調整
\`\`\`

本物の keeper が答えなければならない設計上の問いは 3 つ。

**1. どのくらいの頻度で?** 頻繁すぎると tx 手数料を浪費し指数にジッタが加わる。頻繁でなさすぎるとレートが古くなる。長い間隔の終わり近くで open されたポジションは誤ったレートを支払う。一般的な選択: 流動的市場で 60 秒ごと、低流動性で 5 分ごと。オンチェーンの \`window_seconds\` は**広告**窓口（手数料開示や外部ドキュメントで使われる）。**実際**の keeper cadence はポリシー。

**2. 誰が走らせるか?** パターンは 3 つ:
   - **取引所自身** — 最も単純、単一の信用前提、しかし単一障害点。
   - **許可された keeper 集合** — 複数オペレータが交代で責任を持ち、プログラムは signer をホワイトリストに対してチェックする。
   - **無許可クランク** — 誰でも呼べ、プログラムが受け入れるレートをクランプする。検閲耐性があるが、非常に慎重な境界が要る（悪意ある keeper でもレートをキャップに繰り返し押し上げられる）。
   
   本書の \`process_update_funding\` は教育のために任意の signer を受け入れる。本番は上記 3 つから 1 つを選ぶ。

**3. keeper が停止したら?** 停止した keeper は古いレートが長期間適用され続けることを意味する。停止中に open されたポジションは最後に公開されたレートでファンディングを支払い、それは実際のプレミアムから大きくずれる可能性がある。緩和策: 更新ごとの最大経過時間に上限を付ける（\`elapsed > N 秒\`の呼び出しを拒否）、手動介入で再起動する。あるいはレートのドリフトを既知の degraded モードとして受け入れる。

**Anchor が隠していること:** ここでは何も。keeper パターンは完全にプログラム作成者の選択。Anchor も他のフレームワークも「ファンディングレート」抽象を提供しない、ポリシーが domain-specific すぎて既定が決まらないからだ。

> **演習 §10.5.** 上のループをローカルバリデータに対して走らせる 30 行 Python スクリプトを書け。レートは定数（例: 100）にハードコードせよ。30 秒ごとにファンディング状態をダンプして、\`cumulative_funding_index\` が毎回約 3000 ずつ（100 × 30s）増えることを確認せよ。

---

## §10.6  並列性再訪 — 決済を典型ケースとして

第 5 章はシングルトン書き込み共有アンチパターンを導入した。ファンディング決済はそれが操作的になる場所だ。

1,000 個の活性ポジションを持つ perp DEX を考える。各ファンディング決済の瞬間に、2 つの設計が可能だ。

**設計 A — シングルトン「合計」アカウント。** 単一の \`MarketAggregates\` アカウントが \`total_long_size\`、\`total_short_size\`、走行 PnL を持つ。すべての決済がこれを増減する。すべてのポジション タッチがこのシングルトンを読み書きする。

結果: ポジションに触れるすべてのトランザクションが \`MarketAggregates\` 上の書き込みを共有する。そのような 2 つのトランザクションは同じ slot で走れない。スループットは単一トランザクション レイテンシに崩壊する。1,000 ポジションが 1 時間に 1 回ずつタッチされるなら、slot あたり約 1 tx = 最大 2.5 tx/sec で直列化する。プログラムはシングルスレッドのキューだ。

**設計 B — ポジションごとの決済（本章）。** シングルトンの合計アカウントはない。決済時の \`FundingState\` は読み取り専用 — 書き込みは \`UpdateFunding\` 呼び出しごとに 1 回、ポジション タッチのホットパスを外れる。ポジション A とポジション B は並列に決済する、書き込みセットが \`{position_A}\` と \`{position_B}\` で、交わらないからだ。

結果: ポジション決済はバリデータが持つコア数までスケールする。1,000 ポジションが少数の slot で決済できる。プログラムは構造的に並列に優しい。

これが報われる第 5 章の教訓だ。設計 B を選ぶことは選択の瞬間には**最適化のように感じない** — ただ「グローバル合計を必要としないなら保存するな」と感じるだけだ。スループットで報われる理由は Sealevel の読み書きセット スケジューリングであり、データレイアウトを設計するときに直接見えないからだ。

「グローバルカウンタ」を誘惑する場面ならどこでも同じパターンが当てはまる:
- 取引総ボリューム? 保存するな。オフチェーンでトランザクションを索引化する。
- 徴収手数料総額? 手数料をカウンタではなく手数料受信トークンアカウントに蓄積させる。
- ポジション総数? \`getProgramAccounts(programId, filter: discriminator == POSITION).len()\`、オフチェーン。

ルールを証明する例外: **プログラム ロジックに load-bearing なもの**（ファンディング指数自体、保険基金残高、オラクル staleness チェック）は真に書き込み共有アカウントを要する。それらには直列化を受け入れ、その周りを設計する（keeper のみが書く、短いクリティカル セクション、可能なところでシャーディング）。それ以外すべてには、グローバル カウンタを拒否する。

---

## §10.7  まとめと自己検証

### まとめ図

\`\`\`
時間:           t0 ───────── t1 ───────── t2 ───────── t3 ──── 今
keeper 呼び出し: UpdateFunding   UpdateFunding   UpdateFunding
設定レート:      r0              r1              r2
経過:           Δ0              Δ1              Δ2

時間に対する cumulative_funding_index:

  idx(t1) = idx(t0) + r0 × (t1 - t0)
  idx(t2) = idx(t1) + r1 × (t2 - t1)
  idx(t3) = idx(t2) + r2 × (t3 - t2)

ポジションごとの settle（第 11 章で実装）:

  position.funding_pnl_delta
    = (idx_now - position.funding_snapshot_index) × position.size / 1e9
  position.funding_snapshot_index = idx_now


Sealevel スケジューリングへの影響:

  UpdateFunding はシングルトン FundingState を書く — keeper 間で直列。
  SettleFunding はポジションごとのアカウントを書く — ポジション間で並列。
  結果: 決済は N コアまでスケール、レート更新は market ごとに分に 1 回、
  何もゲートしない。
\`\`\`

### 自分で検証する 3 項目

1. **蓄積子は区分線形。** UpdateFunding 呼び出しを既知の秒数間隔で異なるレートで 3 回走らせよ。各呼び出し後の累積指数は \`prior_index + prior_rate × elapsed_seconds\` と正確に一致するはずだ（1e9 スケーリングの整数除算内で）。
2. **クランプが強制される。** \`--rate 5000000\`（キャップを大きく超える）を試せ。[\`lib.rs:2260–2262\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs#L2260) のクランプが \`MAX_FUNDING_RATE_PER_SEC_ABS = 1_000_000\` に縮め、\`clamped to\` ログ行が見えるはずだ。
3. **slot vs 時間の区別が重要。** \`UpdateFunding --rate 100\` を走らせ、即座に別の \`UpdateFunding --rate 200\`（同じ slot）を走らせよ。2 回目は \`elapsed=0s\` を報告し、指数は進まないはずだ。10 秒待って 3 回目を \`--rate 0\` で走らせる — 今度は \`elapsed≈10\` が見え、指数は \`200 × 10\` だけ進むはずだ。

---

## 第 11 章への導線

market、vault、マッチャ、オラクル、ファンディング蓄積子を持つようになった。**まだ持っていない**のは**ポジション**だ。プログラム内の他のすべてのプリミティブは、ポジションでないアカウントに対して動作する（板、ファンディング状態）か、ポジションがどこかに存在することを仮定する（第 6 章の deposit は資金を vault に移すがポジションを open しない。第 10 章のタッチ時決済パターンは決済するものがまだないので不完全）。

第 11 章は \`Position\` アカウントを導入する: ユーザ×market ごと、サイズ + entry 価格 + ファンディング スナップショット + 証拠金残高を持つ。\`OpenPosition\`、\`ClosePosition\`、\`Liquidate\` を追加する — 清算エンジンが、他のすべての Phase A と Phase B プリミティブが収束する典型ユースケースだ。清算はオラクルを読み（staleness チェック付き）、ファンディング指数を読み（決済する）、証拠金をポジションサイズに対してチェックし、マッチャ（あるいはその slab 親戚）を呼んでポジションを close し、ユーザの vault を掃き出す。第 11 章はプログラムが完全な意味で perp DEX になる場所だ、プリミティブの寄せ集めではなく。
`,
                },
                {
                  title: "第11章 — ポジション ライフサイクルと清算エンジン",
                  slug: "solana-internals-ch11-liquidation-ja",
                  type: 'CONTENT',
                  sortOrder: 5,
                  duration: 45,
                  xpReward: 100,
                  content: `# 第11章 — ポジション ライフサイクルと清算エンジン

> 状態: ドラフト (v0.1)。
> 教材コード: [\`crates/state/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/state/src/lib.rs)（\`Position\`、\`InsuranceFund\`）、[\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs)（ヘルパ + \`process_open_position\`、\`process_close_position\`、\`process_liquidate\`、\`process_create_insurance_fund\`、\`process_insurance_fund_deposit\`）、[\`scripts/position/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/position/src/main.rs)、[\`fuzz/positions/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/positions/src/main.rs)（§11.7 の solinv ハーネス）。
>
> 部品化に伴い、この章で読むロジックは [\`crates/margin/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/margin/src/lib.rs)(\`openhl-margin\`)に移り、プログラムはそれを呼び出す。以下に引用するコードは分割前の \`programs/openhl-core/src/lib.rs\` の版で、行番号は追従していない。

---

## §11.0  はじめに

これが収束の章だ。他のすべての Phase A と Phase B のプリミティブ — オラクル、ファンディング、vault、マッチャ、並列性 — はこの章が書けるために存在する。\`OpenPosition\` / \`ClosePosition\` / \`Liquidate\` のない perp DEX は piece の寄せ集めで、それらを持つ perp DEX は perp DEX だ。

本章は 3 つの命令を出荷し、いずれも第 6 章の SPL Token エスクロー パスをポジション ライフサイクルに直接統合する。

1. **\`OpenPosition\`** — (user, market) ごとの Position PDA を作成し、entry 価格をオラクルから読み、後の決済のために累積ファンディング指数をスナップショットし、初期証拠金要件を検証し、**担保をエスクロー**する。ユーザの quote トークンアカウントから market vault（第 6 章で組み立てた (market, mint) ごとの vault）へ SPL Token Transfer を CPI する。
2. **\`ClosePosition\`** — 所有者の退出。第 10 章のスナップショット パターンでファンディングを決済し、実現 PnL = \`size × (mark - entry)\` を計算し、**実現額を vault からユーザに戻す** — vault authority PDA が署名する SPL Token CPI（\`invoke_signed\` を \`[b"vault_auth", market]\` シードで）— その上で position をゼロ化する。
3. **\`Liquidate\`** — 誰でも他者の水没ポジションに対して行える退出。equity を計算し、維持証拠金と比較し、ポジションが下回っていれば現行マークで強制クローズする。**ハンドラ内で 4 つの SPL Token CPI を走らせる**: vault → 清算者（ペナルティの清算者側スライス）、vault → 保険基金（基金側スライス）、vault → ポジション所有者（残額）、そして水没時の fund → vault（不足分の drain）。すべて vault authority PDA が署名する。

担保は本物の perp DEX が置く場所 — プログラムの vault トークンアカウント、SPL Token 所有、\`invoke_signed\` 経由でしか動かせない PDA が制御 — に住む。ポジション レコードは**簿記**（size、entry 価格、snapshot index）を持つ。vault は**お金**を持つ。両者は同期を保つ、すべての状態遷移が簿記と CPI を同じハンドラ内でアトミックに更新するからだ。

本章は §11.6 の **保険基金** も出荷する: market ごとの \`InsuranceFund\` PDA + 専用トークン アカウント。各清算ペナルティの設定可能な一部（\`INSURANCE_FUND_PENALTY_SHARE_BPS = 5000\`、すなわち半分）を受け取り、水没クローズの不足分をカバーするために drain する。基金のトークン アカウントはポジション vault と authority 共有（\`[b"vault_auth", market]\`）なので、新たな signer PDA は導入されない。\`CreateInsuranceFund\` で market ごとに 1 回ブートストラップし、\`InsuranceFundDeposit\` で誰でも上乗せできる。

---

## §11.1  \`Position\` アカウント

(user, market) ペアあたり PDA 1 つ。144 バイト。\`crates/state/src/lib.rs\` から。

\`\`\`rust
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct Position {
    pub discriminator: [u8; 8],
    pub bump: u8,
    pub _pad0: [u8; 7],
    pub user: [u8; 32],
    pub market: [u8; 32],
    pub size: i64,                    // base 単位; 符号付き: ロング > 0、ショート < 0
    pub entry_price: u64,             // open 時に刻印された base あたり quote
    pub collateral: u64,              // 証拠金として掛けられた quote 単位
    pub funding_snapshot_index: i64,  // 最終タッチ時の FundingState.cumulative
    pub _reserved: [u8; 32],
}
\`\`\`

load-bearing なフィールド 6 つ、加えて discriminator + bump + padding。

**\`size: i64\`** は符号付き。ロング ポジションは正のサイズ、ショートは負。\`size == 0\` は「ポジション クローズ済み」の番兵 — 第 7 章の空スロット規約と同じ。クローズや liquidate の後、アカウントは \`size = 0\` で残り、新たな \`OpenPosition\` で再オープン可能（同じ PDA を派生し、休眠状態を上書きする）。アカウントを文字通り close（rent 返金）しないことを選んだのは、(user, market) ごとの PDA 派生が「ポジションがあるかないか」の関係を保証し、スロットを残しておけば再オープン時の再作成 CPI が省けるからだ。

**\`entry_price: u64\`** は \`OpenPosition\` 時にオラクルから刻印したマーク価格。価格 PnL の参照点: \`(mark - entry) × size\`。部分クローズのための走行 entry 価格は維持しない。本章の \`ClosePosition\` は all-or-nothing。部分クローズには各部分での \`entry_price\` をサイズ加重平均にリセットする必要がある — 有用な拡張だがスコープ外。

**\`collateral: u64\`** は quote 通貨の証拠金額。ポジション オープン中は厳密に正、水没クローズや清算でゼロまで減少しうる。負にはなれない — 担保を超える損失は market ごとの保険基金が（残高の範囲で）吸収する（§11.6）。基金が空になった後の残りの不足分は取引の相手方が被る — autodeleverage はこの章では実装しない（それ自体がアーキテクチャ問題で、§11.6 が今も延期する唯一の保険基金パートだ）。

**\`funding_snapshot_index: i64\`** は最終タッチ（open、close、liquidate）時の累積ファンディング指数。第 10 章のポジションごとの決済パターンが、これをファンディング会計に必要な唯一のフィールドにする — \`funding_now\` と \`funding_snapshot_index\` の差にサイズを掛けたものが、スナップショット以降に蓄積したファンディング PnL だ。

PDA 派生は \`user\` と \`market\` の両方をシードに使う: \`[b"position", user.key, market.key]\`。だから (user, market) ペアごとに、誰もがマッピングを保存せず計算できるポジション アドレスが正確に 1 つ存在する。pubkey は資産ペアとトレーダにシード スキームだけで束縛される。

> **演習 §11.1.** ポジションが \`user\` と \`market\` の両方をアカウント**内部**にも保存する理由は何か。両方とも PDA 派生のシードであるにもかかわらず。（ヒント: アカウントを読む第三者が知っていることと派生しなければならないことを考えよ。）

---

## §11.2  equity、notional、証拠金式

ハンドラを歩く前に式を固定する。\`programs/openhl-core/src/lib.rs:2329–2342\` から。

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

本章が気にする量は 3 つ。

**Notional** = \`|size| × mark\`。現行価格でのポジションのドル（quote 通貨）価値。マーク 100 で base 5 単位のロングは notional 500 quote 単位。ロングもショートも notional は正 — 方向は PnL にとって重要、notional にとっては重要ではない。

**価格 PnL** = \`size × (mark - entry)\`。符号付き。ロング ポジションはマークが上がると利益（正のサイズ × 正のデルタ = 正の PnL）、ショート ポジションはマークが下がると利益（負のサイズ × 負のデルタ = 正の PnL）。算術は方向の特別扱いなしで動く、\`size\` が符号を運ぶからだ。

**ファンディング PnL** = \`(index_now - index_snapshot) × size / 1e9\`。価格 PnL と同じ形だがファンディング指数が価格の役を果たす。\`/1e9\` が第 10 章の \`FundingState\` が指数に使う 1e9 スケーリングを戻す。正のサイズのロングなら、ファンディング指数の上昇（ロングがショートに支払う）が \`funding_delta × size\` を正にし、式の符号が出揃うとファンディング PnL が負になる — まさに正しい意味論。

**Equity** = \`collateral + price_pnl + funding_pnl\`。今ポジションが指揮する quote 通貨総価値。深く水没したポジションでは equity が負になりうる。プログラムは close/liquidate でゼロにクランプする（損失は相手方に渡すのではなく社会化される）。

**維持証拠金 (Maintenance margin)** = \`notional × MAINT_MARGIN_BPS / 10000\`。ポジションをオープン状態に保つために必要な最小 equity。\`MAINT_MARGIN_BPS = 500\`（5%）で、notional 500 のポジションは清算を避けるために equity ≥ 25 quote が必要。

**初期証拠金 (Initial margin)** = \`notional × INITIAL_MARGIN_BPS / 10000\`。オープン時に必要な最小担保。\`INITIAL_MARGIN_BPS = 1000\`（10%）で、同じ notional 500 ポジションをオープンするには ≥ 50 quote の担保が必要。

IM（10%）と MM（5%）のギャップが**維持バッファ**だ — 清算される前にポジションが逆行できる距離。IM でオープンしたポジションが notional の 50% 不利に動けば equity ゼロ（担保使い切り）に達してから清算がトリガする。IM でオープンしたポジションが 5% 不利な動きでもまだ健全。IM↔MM ギャップが狭いほど資本効率は良いが清算されやすい。

> **演習 §11.2.** サイズ = 10 base 単位、entry = 100、担保 = 200（10% IM）でロング ポジションをオープンする。マーク 90、95、100、105、110 で equity を計算せよ。どのマークでポジションは清算可能か。（ファンディングは今のところ無視する。）

---

## §11.3  \`OpenPosition\` を歩く

\`programs/openhl-core/src/lib.rs\` の \`process_open_position\`。ハンドラは 6 部分に分解できる: 検証、オラクル/ファンディング読み、初期証拠金チェック、ポジション PDA 確保、**担保エスクロー CPI**、ポジション状態書き込み。

**検証**: ペイロード サイズ、非ゼロ size と担保、user は signer、market は本書のプログラムが所有する Market アカウントで、**その \`quote_mint\` が渡された mint と一致**(ポジションは mint を記録せず、ClosePosition と Liquidate は quote mint の vault から払うので、これがないと価値のない mint を担保に入れて本物の quote トークンで清算できてしまう)、system プログラムは System プログラム、**token プログラムは SPL Token、user_token_account は SPL Token 所有、vault_token_account は \`[VAULT_SEED, market, mint]\` の派生 PDA と一致**（escrow 側の新しいチェック）。ポジション PDA 派生:

\`\`\`rust
let (expected, bump) = Pubkey::find_program_address(
    &[POSITION_SEED, user_ai.key.as_ref(), market_ai.key.as_ref()],
    program_id,
);
if position_ai.key != &expected {
    return Err(ProgramError::InvalidSeeds);
}
\`\`\`

**外部入力を読む**（2911–2912 行）:

\`\`\`rust
verify_market_oracle_and_funding(oracle_ai, funding_ai, market_ai.key, program_id)?;
let mark = read_fresh_oracle(oracle_ai, program_id)?;
let funding_snapshot = read_funding_index(funding_ai, program_id)?;
\`\`\`

\`read_fresh_oracle\`（2353–2372 行）は第 9 章の staleness ガントレットをヘルパに分離した — 同じチェック（owner + discriminator + price>0 + Clock に対する age）、3 つのポジション ハンドラで再利用。\`read_funding_index\`（2597–2607 行）はファンディング指数をスナップショットする簡単な読み。

どちらのヘルパも、渡されたオラクルやファンディング状態が**誰の**ものかを問わない。どの市場のオラクルもこのプログラムが所有し、同じ discriminator を持つからだ。そこで 3 つのポジション ハンドラはどれも、まず \`verify_market_oracle_and_funding\` を呼ぶ。2 つのアカウントがこの市場の PDA、つまり \`[ORACLE_SEED, market]\` と \`[FUNDING_SEED, market]\` であることを求める。\`PlaceOrderChecked\` がオラクルについてすでに使っていた導き方と同じだ(第 9 章)。この章の最初の版は、3 つのハンドラすべてでこれを書き忘れていた。同じ quote の mint に市場が 2 つあり、一方が 100、もう一方が 200 のとき、利用者は 1 つ目でロングを開き、2 つ目の市場のオラクルを指定して閉じた。200 を入れて、1 つ目の市場のトークン口座(全員の担保が入っている)から 1,200 を持ち出した。清算者も同じやり方で健全なショートを清算できた。第 9 章の publisher の検査(演習 §9.2)は役に立たない。どちらの価格も正直で、ただ市場が違うだけだからだ。fuzzer がこれをどう見つけたかは §11.7 で示す。(第 9 章の Pyth を使う 2 つの注文の命令は \`[ORACLE_SEED, market]\` を使えない。Pyth のアカウントはこのプログラムの PDA ではないからだ。代わりに、市場が \`SetPythFeeds\` で固定したフィードを確かめる。§9.5。)

**初期証拠金チェック**（2915–2926 行）:

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

担保は少なくとも notional の 10% をカバーしなければならない。価格 100 でサイズ 10 のポジション（notional = 1000）を担保 50 で要求すると、チェックは拒否する: 50 < 100（IM）。担保 100 ならちょうど IM で受理。担保 200 なら IM の上に 100 のバッファ付きで受理。

**ポジション PDA を確保**: \`[POSITION_SEED, user.key, market.key, bump]\` で署名する \`System::create_account\` への標準的な \`invoke_signed\`。\`CreateMarket\`、\`CreateVault\` などと同じパターン — 第 3 章で導入、以降のすべての章で再利用。

**SPL Token Transfer 経由で担保をエスクロー**:

\`\`\`rust
spl_token_transfer_user_signed(
    user_token_ai,    // source — ユーザの quote アカウント
    vault_token_ai,   // destination — (market, mint) ごとの vault PDA
    user_ai,          // authority — ユーザ、外側 tx 署名者
    token_ai,         // SPL Token プログラム
    collateral,       // 量、quote base 単位
)?;
\`\`\`

\`spl_token_transfer_user_signed\` は position セクション冒頭で抽出した 4 つの escrow ヘルパの 1 つ。第 6 章の bytes-up パターンで SPL Token Transfer 命令を手で組み立て（\`[tag=3, amount_le]\` データ + \`[source, dest, authority]\` アカウント）、プレーン \`invoke\` を呼ぶ。ユーザの外側トランザクション署名が、第 6 章 §6.2 の署名者特権延長を経由して SPL Token に流れる。この CPI が確定すれば、ユーザの quote 残高は \`collateral\` 単位減り、vault は同額増える。

順序が重要だ: ポジション PDA は転送の**前**に確保する。転送が失敗（残高不足）した場合、トランザクション全体を revert させたい — そして実際にそうなる、孤児 Position アカウントは残らない。順序を逆にすると、InsufficientFunds で半初期化 Position（rent 支払い済み、escrow なし）が残る。tx 全体のアトミシティが、自然なエラー処理を正しくする。

**ポジション状態を書く**:

\`\`\`rust
position.size = size;
position.entry_price = mark;
position.collateral = collateral;
position.funding_snapshot_index = funding_snapshot;
\`\`\`

データ書き込み 4 つ。\`entry_price = mark\` がオラクル価格をポジションの参照点として刻印する。\`funding_snapshot_index = funding_snapshot\` がこの瞬間のファンディング指数を捕捉する — 将来のすべての close/liquidate がこのスナップショットからの差分としてファンディング PnL を計算する。\`collateral\` は vault にエスクローされたものを写す。簿記と vault 残高は、同じハンドラが両方をアトミックに更新するので同期を保つ。

> **演習 §11.3.** stale なオラクル（最後の \`SetOraclePrice\` から 25 slot 以上）に対して \`OpenPosition\` を試すと何が起きるか。\`read_fresh_oracle\` を通って失敗パスを辿れ。次に \`funding --update --rate 0\` と \`oracle --set --price ...\` を走らせてオープンを再試行せよ。

---

## §11.4  \`ClosePosition\` を歩く

\`process_close_position\`。オープンより単純な部分（PDA 作成なし）と複雑な部分が両方ある: vault authority PDA が \`invoke_signed\` で署名する outbound SPL Token CPI が 2 つ — ユーザへのペイアウトと（水没クローズ時の）保険基金からの不足分 drain — 加わる。ハンドラは 12 アカウントを取り、最後の 2 つは保険基金の state とトークン アカウント（§11.6）。

**検証 + 所有者チェック**（3052–3062 行）:

\`\`\`rust
if position.user != *user_ai.key.as_ref() {
    msg!("close_position: caller is not the position owner");
    return Err(ProgramError::IllegalOwner);
}
\`\`\`

ポジションの所有者だけが自発的にクローズできる。Liquidate（§11.5）が他の誰でも通れる経路。user チェックは PDA 派生ではなくポジション内に保存した \`user\` フィールドを使う — 同じ情報、読みやすい。

**外部入力を読み equity を計算**（3040–3072 行）:

\`\`\`rust
let mark = read_fresh_oracle(oracle_ai, program_id)?;
let funding_now = read_funding_index(funding_ai, program_id)?;
// ...
let equity = compute_equity(position, mark, funding_now);
\`\`\`

オープンと同じオラクル + ファンディングの読みパターン。クローズで重要な計算は equity だけ — ポジションが今 quote 通貨換算で何の価値があるかを教える。

**payout を計算してポジション レコードをゼロ化**（\`try_borrow_mut_data\` スコープ内で、借用が CPI 前にドロップするように）:

\`\`\`rust
let payout: u64;
{
    let mut data = position_ai.try_borrow_mut_data()?;
    let position: &mut Position = bytemuck::from_bytes_mut(...);
    // ... 所有者チェック、size != 0 チェック ...
    let equity = compute_equity(position, mark, funding_now);
    payout = if equity < 0 { 0 } else { equity as u64 };

    position.collateral = 0;
    position.size = 0;
    position.entry_price = 0;
    position.funding_snapshot_index = funding_now;
}
\`\`\`

\`position.collateral = 0\` に注目 — その価値はもうポジション アカウントに保持されない。これから vault から支払われる。ポジションは純粋に「閉じた」番兵になる: size 0、entry 0、collateral 0。

**vault からユーザに支払う**、\`invoke_signed\` 経由:

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

vault authority は \`[VAULT_AUTH_SEED, market]\` の PDA なので、プログラムが署名する: \`invoke_signed\` を \`[VAULT_AUTH_SEED, market_key, &[bump]]\` で。vault トークン アカウントが \`payout\` 単位を失い、ユーザのトークン アカウントが受け取る。\`payout == 0\`（水没クローズ）ならヘルパは CPI をスキップ — ゼロ転送に CU を燃やす意味がない。

**水没クローズは保険基金を drain する。** equity = -50 でクローズするポジションは \`payout = 0\` をユーザに送り、加えてハンドラは \`min(50, fund.balance)\` を保険基金のトークン アカウントから vault へ drain する。drain は「残余が暗黙のうちに相手方にサブシディする代わりに、プロトコルが不足分をカバーした」の簿記側だ — 基金が枯渇したときの cap 動作も含めた完全な設計は §11.6 を見よ。

> **演習 §11.4.** entry = 100、サイズ = 5、担保 = 100 でポジションをオープンする。オラクルをマーク = 80 に動かす。クローズ。期待される equity は \`100 + 5 × (80 - 100) = 0\`。クローズ後のユーザの quote トークン残高は、オープン前と変わらないことを確認せよ（payout = 0 — 預けた 100 は vault に入ってそこに留まる）。

---

## §11.5  \`Liquidate\` を歩く

\`process_liquidate\`。クローズとの重要な違い: **誰でも呼べる**。ハンドラは**4 つの** outbound SPL Token CPI を走らせる — vault → 清算者（ペナルティの清算者側スライス）、vault → 保険基金（基金側スライス）、vault → ポジション所有者（残額）、そして equity < 0 のときの fund → vault（不足分の drain） — すべて同じ vault authority PDA が署名する。ハンドラは 13 アカウントを取り、最後の 2 つは保険基金の state とトークン アカウント（§11.6）。

**検証**: **清算者**は signer でなければならないが、プログラムは清算者がポジションの user と一致するかをチェック**しない**。誰でも誰のポジションに対しても liquidate を呼べる。escrow 側の追加チェック: token_program は SPL Token、\`owner_token\` と \`liquidator_token\` は両方とも SPL Token 所有、vault_token は派生 PDA と一致、vault_authority は派生 PDA と一致（bump は下の 2 つの invoke_signed 呼び出しのために捕捉）。

\`\`\`rust
let liquidator_ai = accounts.first().ok_or(...)?;
// ...
if !liquidator_ai.is_signer { return Err(...); }
\`\`\`

この無許可性が清算エンジンの中心。システムは小さな bounty（清算ペナルティ）を、最初に水没ポジションに気づいて清算 tx を提出した誰かに支払う。これなしには、清算はプロトコル チームが集中清算 bot を走らせることに依存する — 動くがアップタイム リスクが入る。

**ヘルス チェック**（3233–3253 行）:

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

\`equity >= maintenance_margin\` ならポジションは健全で呼び出しは拒否される。清算者は無意味に tx 手数料を払った — 健全ポジションに対する liquidate のスパム呼び出しを小さく抑制する。（本番プロトコルは時にこういうとき tx 手数料を返金するか、清算者が提出前にオフチェーン ヘルス チェックをやることを期待する。）

**ペナルティ適用（清算者と基金で分割）+ 強制クローズ + 4 つの CPI**:

\`\`\`rust
// 借用スコープ内（ポジション データ参照が CPI 前にドロップするように）:
let equity = compute_equity(position, mark, funding_now);
let raw_penalty = (notional_val * LIQUIDATION_PENALTY_BPS as u128 / 10_000) as i128;
let equity_positive = if equity < 0 { 0 } else { equity };
let penalty = raw_penalty.min(equity_positive);           // 利用可能 equity で上限
let owner_remainder = (equity_positive - penalty).max(0);

// INSURANCE_FUND_PENALTY_SHARE_BPS でペナルティを分割（= 5000 → 50/50）。
let fund_slice = penalty * INSURANCE_FUND_PENALTY_SHARE_BPS / 10_000;
let liquidator_slice = penalty - fund_slice;

position.collateral = 0;
position.size = 0;
position.entry_price = 0;
position.funding_snapshot_index = funding_now;
// ─── 借用終了 ───

// 基金 state の更新（独自の借用スコープ）:
//   fund.balance         += fund_slice;
//   fund.total_deposits  += fund_slice;
//   shortfall_drain      = if equity < 0 { min(-equity, fund.balance) } else { 0 };
//   fund.balance         -= shortfall_drain;
//   fund.total_drawdowns += shortfall_drain;

// その後 4 つの Token Transfer、すべて vault_authority シードで invoke_signed:
spl_token_transfer_vault_signed(vault_token_ai, liquidator_token_ai, ..., liquidator_slice)?;
spl_token_transfer_vault_signed(vault_token_ai, fund_token_ai,       ..., fund_slice)?;
spl_token_transfer_vault_signed(vault_token_ai, owner_token_ai,      ..., owner_remainder)?;
spl_token_transfer_vault_signed(fund_token_ai,  vault_token_ai,      ..., shortfall_drain)?;
\`\`\`

ペナルティは生き残った equity で上限を取る（残 equity が 10 単位のポジションから 50 単位の bounty を払うことはできない）。4 つの CPI は順次、すべて同じ vault-authority シードで \`invoke_signed\`。すべてが成功してポジションと基金 state が完全に巻き戻るか、トランザクション全体が revert する。不足分の drain は equity < 0 のパスでのみ非ゼロで発火する。健全な清算ではゼロ額 Transfer をヘルパが短絡する。

ペナルティは 2 つの目的を持つ。

1. **清算者インセンティブ。** 清算 bot の運営にはコストがある（RPC 帯域、gas、監視インフラ）。ペナルティが作業を経済的に成立させる bounty。
2. **ユーザ ディスインセンティブ。** 清算閾値に近づくのは、最終的に生き残るとしても（例: 清算直後に価格が反転）コストになる。ユーザは IM↔MM ギャップが示唆する以上のバッファを MM の上に維持するよう押される。

Liquidate ハンドラはポジションが**なぜ**水没したかを検証**しない**。価格の動き（マークが逆行）、ファンディング蓄積（時間とともに複利化したレート）、あるいは両方でありうる。equity 計算は両方の寄与を含み、維持チェックは原因に関わらず equity vs notional だ。これが正しい: 清算は資不足でトリガするのであって、根本原因でトリガするのではない。

> **演習 §11.5.** 教科書的な「death spiral」シナリオを組み立てよ:
>   1. サイズ = 10、entry = 100、担保 = 100（IM ちょうど）でロングをオープン。
>   2. オラクル マークを 95 に動かす（価格下落）。\`equity\` と \`maint_required\` をチェック — ポジションは清算可能か。下落のコストは 10 × (95 − 100) = -50、なので equity = 50、maint = 10×95×0.05 = 47.5。まだ健全。
>   3. 94 に動かす。equity = 40、maint = 47。**今度は**清算可能。
>   4. **別の**鍵ペアから Liquidate を提出する。ポジションがクローズしペナルティが適用されることを確認。

---

## §11.6  保険基金 — ペナルティ分割と不足分 drain

素のエスクロー パスには 1 つの正直性問題が残る: ポジションが水没（\`equity < 0\`）でクローズすると、ユーザの預けた担保はすでに vault にあり、ユーザは 0 を受け取り、残余が暗黙のうちに相手方にサブシディする。「プロトコルがこの損失を吸収した」の会計はどこにもなく、vault がいつもより静かなだけだ。保険基金がこの簿記を直すピースだ。

### State

market ごとに 2 つの PDA:

\`\`\`rust
// crates/state/src/lib.rs
pub struct InsuranceFund {
    pub discriminator: [u8; 8],   // INSFUND\\0
    pub bump: u8,
    pub _pad0: [u8; 7],
    pub market: [u8; 32],
    pub mint: [u8; 32],           // quote_mint（market.quote_mint と一致）
    pub balance: u64,             // トークン アカウント残高をミラー
    pub total_deposits: u64,      // 観測性
    pub total_drawdowns: u64,     // 観測性
    pub _reserved: [u8; 32],
}
\`\`\`

\`\`\`text
fund state PDA  : [b"insurance_fund",       market]       — プログラム所有
fund token PDA  : [b"insurance_fund_token", market, mint] — SPL Token 所有、
                                                            authority = vault_authority
                                                            （Liquidate がすでに
                                                             署名している PDA と同じ）
\`\`\`

\`vault_authority\` を再利用する判断が実装を小さく保つ。ポジション vault と基金 vault は別のトークン アカウントだが、1 つの signer PDA を共有する — \`Liquidate\` は新たな authority surface を導入せずに \`vault → fund\` や \`fund → vault\` Transfer に署名する方法をすでに知っている。オンチェーン \`balance\` カウンタは SPL Token アカウントの lamport 側残高と冗長だが、スクリプトと indexer に SPL Token バイトをパースせず安価に走行合計へアクセスさせ、章の「自分で検証」テストがそれに直接 assert することを許す。

### ペナルティ分割

\`Liquidate\` はペナルティを清算者と基金で分割するようになった:

\`\`\`rust
let fund_slice = penalty * INSURANCE_FUND_PENALTY_SHARE_BPS / 10_000;  // = penalty / 2
let liquidator_slice = penalty - fund_slice;
\`\`\`

\`INSURANCE_FUND_PENALTY_SHARE_BPS = 5000\` で、ペナルティの半分が基金への入金として、残りが清算者の bounty として行く。Liquidate ごとに Token Transfer が 2 つから 3 つに増える — vault → 清算者（清算者スライス）、vault → 基金（基金スライス）、vault → 所有者（残額）。

健全な清算（equity > 0、マージン だけ水没のポジション）では、清算者は CU と tx 手数料コストに見合う額を依然受け取る。\`LIQUIDATION_PENALTY_BPS = 100\` と 50/50 分割で、清算者の実効 bounty は notional の 1% から 0.5% に下がる。本章の値ではこれで構わない。本番チューニングは典型的ポジション サイズ、清算者インフラ コスト、プロトコルが基金をどれだけ積極的に成長させたいかの関数だ。

### 不足分 drain

\`ClosePosition\` と \`Liquidate\` の両方が、ハンドラ末尾で同じ drain ロジックを走らせる:

\`\`\`rust
let shortfall_drain = if equity < 0 {
    let shortfall = (-equity).min(u64::MAX as i128) as u64;
    shortfall.min(fund.balance)        // 基金残高以上の drain はしない
} else {
    0
};
fund.balance -= shortfall_drain;
fund.total_drawdowns += shortfall_drain;
// ... その後: SPL Token Transfer fund_token → vault_token (shortfall_drain)
\`\`\`

Transfer は vault へ行き、ユーザには行かない。ユーザは依然として \`payout = if equity < 0 { 0 } else { equity }\` を受け取る。drain はプロトコルの簿記用だ — vault が黙って吸収するはずの損失を基金がカバーしたことを表す。Transfer は \`vault_authority\` が署名するので、同じ \`invoke_signed\` 呼び出しパスが両方に再利用される。

\`fund.balance < shortfall\` のとき drain は \`fund.balance\` で頭打ちになる。カバーされなかった残りは**社会化損失**だ: 残余として vault に留まり、暗黙のうちに取引の相手方に落ちる。本番取引所はこれを **autodeleverage**（最も収益性の高い相手方ポジションを損失が完全に吸収されるまで強制クローズする）か **明示的社会化**（同方向のすべてのオープン ポジションを mark down する）で解く。本章は「残余として留まることを許し、cap を文書化する」というシンプルなパスを出荷する — autodeleverage はそれ自体がアーキテクチャ問題だ。

### CreateInsuranceFund + InsuranceFundDeposit

\`CreateInsuranceFund\` は 1 回限りのブートストラップ、market ごとに 1 回走らせる。第 6 章の \`CreateVault\` をミラーする — state アカウントとトークン アカウント両方に PDA 署名付き System \`create_account\`、加えて fund-token の所有者を \`vault_authority\` に設定する \`InitializeAccount3\` CPI。

\`InsuranceFundDeposit\` は permissionless。quote トークンを持つ誰もが基金に credit できる — 最も一般的にはプロトコル チームの初期 seed だが、実際には寄付や管理者のトップアップも有効な用途だ。ハンドラは標準の「借用スコープ内でカウンタ更新、借用解放、末尾で Transfer」パターンで走り、\`total_deposits\` が \`balance\` と並んで進む。

### ClosePosition / Liquidate への 2 アカウント追加

両ハンドラのアカウント リストの末尾に 2 つ加わった:

\`\`\`
N-2.  [WRITE]  insurance_fund        — InsuranceFund state PDA
N-1.  [WRITE]  insurance_fund_token  — 基金の SPL トークン アカウント
\`\`\`

\`ClosePosition\` は今や 12 アカウント、\`Liquidate\` は 13 アカウント。fund-state の書き込み可は カウンタ更新用、fund-token の書き込み可はペナルティ credit Transfer と（水没クローズ時の）不足分 drain 用。

> **演習 §11.6.** ポジションをオープンし、equity が \`maint\` を割るまでオラクルを逆方向に押す、ただし equity が負になる**前**に止める。Liquidate。ダンプで観察: 基金の \`total_deposits\` が \`fund_slice\` ぶん増えるはずだ。次に、同じ market で fresh なポジションをオープンし、オラクルをさらに押して equity をゼロ未満にする。再び Liquidate — \`total_drawdowns\` が \`min(-equity, fund.balance)\` ぶん増えるはずだ。基金が不足分を吸収できなくなるのはいつで、そのとき何を出荷するか?

---

## §11.7  まとめと自己検証

### まとめ図

\`\`\`
ポジション ライフサイクル:

  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │            ┌────────────────┐                                    │
  │   user ──► │ OpenPosition   │   読み: oracle(mark) + funding      │
  │            │                │   書き: position (size, entry,      │
  │            └───────┬────────┘            collateral, snapshot)   │
  │                    │                                             │
  │                    ▼                                             │
  │            ┌────────────────┐                                    │
  │            │   live state   │   (マーク動く、ファンディング蓄積)   │
  │            └───┬────────┬───┘                                    │
  │                │        │                                        │
  │   所有者のみ    │        │   無許可                                │
  │                ▼        ▼                                        │
  │     ┌──────────────┐  ┌──────────────┐                           │
  │     │ ClosePosition│  │  Liquidate   │   読み: oracle + funding   │
  │     │ (PnL 決済)    │  │ (ペナルティ + │   書き: position           │
  │     │              │  │  強制クローズ)│       (collateral, size=0) │
  │     └──────────────┘  └──────────────┘                           │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘


数学:
  notional       = |size| × mark
  initial_margin = notional × INITIAL_MARGIN_BPS / 10000   (10%)
  maint_margin   = notional × MAINT_MARGIN_BPS / 10000     (5%)
  price_pnl      = size × (mark − entry_price)
  funding_pnl    = (index_now − snapshot_index) × size / 1e9
  equity         = collateral + price_pnl + funding_pnl
  liquidatable   = equity < maint_margin
\`\`\`

### 自分で検証する 3 項目

1. **IM↔MM ギャップがバッファ。** IM ちょうど（担保 = notional の 10%）でポジションをオープン。オラクルを動かさずに、ダンプ出力からポジションが健全（equity ≈ collateral、MM をしっかり上回る）であることを確認。IM ギャップが消費される程度（5% 逆行）にオラクルを動かす。これで equity ≈ MM — まだ清算可能ではない。さらに 1 bp の逆行で \`Liquidate\` が成功する。
2. **ファンディング蓄積で答えが反転しうる。** 担保ちょうど MM でポジションをオープン。オラクルに触れない。\`funding --update --rate 100\` で逆方向にファンディングを蓄積させ、1 分待ち、\`funding --update --rate 100\`。ダンプでポジションの計算済み equity をチェック — 価格は動いていなくてもファンディング PnL が equity を MM 以下に引きずる。\`Liquidate\` が成功する。
3. **クローズは担保を返すが、清算は返さない。** IM でオープン、即座にクローズ（価格動かず、ファンディングなし）。\`position.collateral\` ≈ オリジナル。再び IM でオープン、MM まで落ちて別の鍵ペアに清算される。清算後の \`position.collateral\` = equity − ペナルティ ≈ かなり少ない。ペナルティが「綺麗に退出する」vs「清算される」の差。


### 書き忘れた検査を道具に探させる

[\`fuzz/positions/\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/positions) は、3 つのポジション ハンドラのための [solinv](https://github.com/psyto/solinv) のハーネスである。2 つの市場が quote の mint Q を共有し、それぞれにオラクル、ファンディング状態、トークン口座、保険基金がある。\`m\` は 100、\`n\` は 200。\`m\` では A がロング、B がショートを持ち、どちらも健全だ。E は 110 で開いたロングを持ち、100 では維持証拠金を下回るが、まだ残りを受け取る権利がある。C はまだポジションを持たない。\`n\` では D がロングを持つので、\`n\` のトークン口座にはトークンがある。仕様は C のポジションを開き、A のを閉じ、B と E のを清算し、\`n\` のオラクルとファンディング状態、別の利用者のポジション、\`n\` のトークン口座と保険基金、呼び出し側が持たないトークン口座を差し替える。2 つの組は \`n\` のアカウントを全部一緒に差し替える。第 3 章 §3.7 のとおり準備してから:

\`\`\`bash
cargo build-sbf --manifest-path programs/openhl-core/Cargo.toml
cd fuzz/positions
cargo build --release --features invariant_ch11
cargo test --release --features invariant_ch11
timeout -s INT 60 crucible run openhl_positions_fuzz invariant_ch11 \\
    --binary-in target/release/invariant_test --timeout 45
\`\`\`

今のプログラムでは \`[FUZZ_FINDING]\` の行は出ない。\`verify_market_oracle_and_funding\` を入れる前のプログラムでは、最初の実行で数秒のうちにこう報告された:

\`\`\`
[FUZZ_FINDING] [account-swap:…] ix open_position succeeded with account 3 swapped … (different context, same shape)
\`\`\`

slot 3 はオラクルだ。Crucible は最初の検出で 1 回の実行を止めるので、Close と Liquidate には順番が回ってこなかった。その 2 つはテスト \`close_refuses_another_markets_oracle\` と \`liquidate_refuses_another_markets_oracle\` で押さえてある。

> **演習 §11.7.** 検査を 1 つずつ消し、作り直して走らせよ。先に予想すること。私たちが各 45 秒で測った結果を示す。「いいえ」の行の最後の列は、差し替えた呼び出しを代わりに拒否したもので、ログから読んだ(\`probe\` テストが出力する):
>
> | 消した検査 | 捕まったか | どう捕まったか、または代わりに拒否したもの |
> |---|---|---|
> | Open: \`user_ai.is_signer\` | いいえ | ランタイム: 権限のない署名者(担保の転送に利用者の署名が要る) |
> | Open: \`market_ai.owner == program_id\` | いいえ | 次の自前の検査: \`market is not a Market account\` |
> | Open: \`verify_vault_token_account\` | **はい**、account-swap、slot 7 | 担保が \`n\` の口座に預けられ、\`m\` に記録された |
> | Open: ポジションの PDA | いいえ | ランタイム: 権限のない署名者(別のアドレスへの \`create_account\` にはそのアドレスの署名が要る) |
> | Open: \`verify_market_oracle_and_funding\` | **はい**、account-swap、slot 3 | 建値が \`n\` のオラクルから来た |
> | Open: 初期証拠金の検査 | いいえ | ハーネスのどこにも証拠金の規則がない。\`open_below_initial_margin_is_refused\` が落ちる |
> | Close: \`user_ai.is_signer\` | **はい**、signer-skip | 誰でも A のポジションを閉じられた |
> | Close: \`position.user == user\` | **はい**、account-swap、slot 1 | A が B のポジションを閉じた |
> | Close: \`position.market == market\` | **はい**(組で) | \`m\` のポジションが \`n\` のアカウント一式に対して閉じられた |
> | Close: \`verify_vault_token_account\` | いいえ | SPL Token: \`owner does not match\`(\`m\` の authority は \`n\` の口座に署名できない) |
> | Close: \`verify_market_oracle_and_funding\` | **はい**、account-swap、slot 2 | \`n\` の価格で閉じた。\`close_refuses_another_markets_oracle\` が落ちる |
> | Close: \`fund.market == market\` | **はい**、account-swap、slot 10 | \`m\` のポジションに \`n\` の保険基金が受け入れられた(A の決済は利益だったので基金からは引き出されていない。検出は受け入れたこと) |
> | Liquidate: \`liquidator_ai.is_signer\` | **はい**、signer-skip | — ただし下を見よ |
> | Liquidate: \`position.market == market\` | **はい**(組で) | Close と同じ |
> | Liquidate: 所有者のトークン口座 | **はい**、account-swap、slot 6 | E の残りが清算者に払われた |
> | Liquidate: \`is_liquidatable\` | いいえ | ハーネスのどこにも、清算してよい条件がない。\`healthy_position_is_not_liquidatable\` が落ちる |
> | Liquidate: \`verify_market_oracle_and_funding\` | **はい**、account-swap、slot 2 | B の健全なショートが \`n\` の価格で清算された。\`liquidate_refuses_another_markets_oracle\` が落ちる |
>
> 3 つの行は見直す価値がある。清算者の署名の行は、穴ではない検出だ。清算は誰でもでき(§11.5)、ペナルティは呼び出し側が指定したトークン口座に入り、誰が署名したかに頼るものはほかにない。だからこの検査を外しても、もともと許されていなかった人は誰も入ってこない。証拠金の 2 行は、fuzzer には見えない穴だ。担保の足りないポジションを開くことも、健全なポジションを清算することも、アカウントはすべて正しい呼び出しである。それを捕まえるのは、規則を書いたテストだけだ。アカウントを差し替える fuzzer が見つけるのは**結びつけ**の抜けで、数についての規則は誰かが書き下す必要がある(第 13 章 §13.6 が手数料についてそれをする)。
>
> ハーネスを書く途中の罠が 2 つあり、どちらも行を間違った理由で「いいえ」にした。最初の清算の対象は B で、\`m\` の価格では健全だったので、B の清算の差し替えはどれも、確かめたいアカウントにたどり着く前に健全性の検査で落ちた。100 で清算できる E でそれは直ったが、今度は E のペナルティ後の残りが 0 で、それを清算者に回しても何も動かなかった。今の E の担保は 130 だ。もう 1 つ、所有者の口座についての最初の変異は、\`||\` でつながった条件の頭に \`false &&\` を付けたので、優先順位のせいで検査の残りがそのまま残った。どの場合も、実際にどの検査が呼び出しを拒否したかは、probe のログの行が示していた。

---

## 第 12 章への導線

ポジションがオープン、クローズ、強制清算できる perp DEX を持つようになった。スループットの単位はこれで大きくなる: 単一の \`OpenPosition\` は 6 アカウントを巻き込み、\`Liquidate\` は 4、補助の読み（オラクル + ファンディング）がさらにいくつか加わる。触れるアカウントは書き込みセット グラフを形成し — そのグラフがどう配置されるかが Sealevel が並列に走らせられるものと直列化するものを決定する。

第 12 章では**ネイティブ vault プログラム**を組み立てる — ユーザ担保を全体として取引される基金に集約する専用ラッパ アカウント。Vault 預金者は PnL を共有する。vault 管理者は本書の Phase B プリミティブを使って彼らのために取引する。Vault アカウントはポジションごとの取引とは異なる書き込みセット グラフを形成する: すべての deposit が vault 合計に触れ、すべての取引が vault が所有するポジションに触れる。第 5 章のシングルトン書き込み共有アンチパターンが再び立ち上がる（vault 合計は**まさに**シングルトン）のを見て、アーキテクチャがスループットを正気に保つために打つべき設計手を見る。
`,
                },
                {
                  title: "第12章 — ネイティブ Vault プログラム（プール取引）",
                  slug: "solana-internals-ch12-vault-ja",
                  type: 'CONTENT',
                  sortOrder: 6,
                  duration: 45,
                  xpReward: 100,
                  content: `# 第12章 — ネイティブ Vault プログラム（プール取引）

> 状態: ドラフト (v0.1)。
> 教材コード: [\`crates/state/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/state/src/lib.rs)（\`TradingVault\`、\`VaultShare\`）、[\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs)（\`process_create_trading_vault\` 3444–3563 行、\`process_vault_deposit\` 3578–3737 行、\`process_vault_withdraw\` 3751–3902 行、\`process_vault_update_nav\` 3909–3949 行）、[\`scripts/vault/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/vault/src/main.rs)、[\`fuzz/vault/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/vault/src/main.rs)（§12.7 の solinv ハーネス）。
>
> 部品化に伴い、この章で読むロジックは [\`crates/vault/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/vault/src/lib.rs)(\`openhl-vault\`)に移り、プログラムはそれを呼び出す。以下に引用するコードは分割前の \`programs/openhl-core/src/lib.rs\` の版で、行番号は追従していない。

---

## §12.0  はじめに — 名前についての明確化

「vault」という単語はこのコードベースに 2 回登場する。

- **第 6 章の \`Vault\`** は SPL Token アカウントだった — 単一ユーザの担保が住む単一ユーザ用カストディ アカウント。所有者: SPL Token プログラム。純粋な配管。
- **第 12 章の \`TradingVault\`** はまったく別物 — 複数ユーザが資産を預け、shares 経由でマネージャの PnL を pro-rata で共有するプール基金。所有者: openhl-core。shares、NAV、deposit/withdraw 経済を持つ。

両方とも「vault」の合理的な使い方だ。型名で曖昧さを解消した（\`TradingVault\` は明確、第 6 章の \`Vault\` は専用 state 構造体を持たず — 単なる SPL Token アカウントだ）。命令は \`CreateVault\`（トークン アカウント）vs \`CreateTradingVault\`（本章）の分離で衝突しない。

trading vault は perp DEX を、ユーザが直接取引する venue から、**基金**もホストする venue に変える概念的プリミティブだ。ポジションを自分で管理したくないユーザは vault に預金できる。vault のマネージャが戦略を走らせる。預金者はリターンを共有する。これは Solana 上のすべての yield vault の構造 — Drift の spot vault、Kamino の leveraged vault、Jupiter の perps vault、その他もろもろ。

本章は vault の会計半分を組み立てる — shares、deposits、withdrawals、NAV 更新。トークンは実際に動く。deposit は預金者の口座から、trading vault 専用のトークン口座へ移す。この口座は \`[TRADING_VAULT_TOKEN_SEED, vault]\` の PDA で、\`CreateTradingVault\` が vault と一緒に作る。withdraw は trading vault の PDA 自身が \`invoke_signed\` で署名して戻す。(この章の最初の版は、第 6 章が作り第 11 章がポジションの証拠金に使う (market, mint) ごとの口座を、市場の全 vault で共有していた。その代償は §12.5 で示す。)マネージャの取引半分は組み立てない（第 11 章の \`OpenPosition\` を vault の PDA をポジション所有者として呼び、vault の口座から市場の口座へ証拠金を移す薄いラッパ命令になる）。share 会計が整えば追加は機械的だ。本章は設計を説明し、実装を宿題ピースとして残す。

本章が実際に扱うこと:

1. **share/asset 数学** — NAV が変わるとき deposit と withdrawal が pro-rata 不変条件をどう保つか。
2. **帳簿 ↔ エスクローの原子性** — deposit と withdrawal の両方が \`TradingVault\` 集計を更新し、*かつ* SPL Token CPI で実トークンをエスクローする。両者が同じ命令内、tx 全体のリバート意味論の下で実行されるので、片方が失敗すればもう片方もロールバックする。
3. **シングルトン書き込みの再起** — すべての deposit と withdrawal が同じ \`TradingVault\` アカウントを変更するので、vault 操作はスケジューラで直列化する。第 5 章のアンチパターンを**意図的に**導入したので、緩和策が実務でどう見えるかが見える。
4. **マネージャ信用モデル** — \`VaultUpdateNAV\` が肝心の信用前提。それがどう構造化されるかが、vault が「マネージャが嘘をつかないと信じる」か「NAV をオンチェーン状態に対して検証する」かを決める。

---

## §12.1  2 つのアカウント型

\`crates/state/src/lib.rs\` から。新規構造体 2 つ、両方 Pod、repr(C)。

**\`TradingVault\`**（160 バイト）: (market, manager) ペアあたり 1 つ。

\`\`\`rust
pub struct TradingVault {
    pub discriminator: [u8; 8],
    pub bump: u8,
    pub _pad0: [u8; 7],
    pub market: [u8; 32],
    pub manager: [u8; 32],   // トレーダ; UpdateNAV に署名する
    pub mint: [u8; 32],      // 資産 mint（例: USDC）
    pub total_shares: u64,
    pub total_assets: u64,   // NAV — マネージャ報告値
    pub _reserved: [u8; 32],
}
\`\`\`

load-bearing なフィールドは \`total_shares\` と \`total_assets\` の 2 つ。その比が share あたり NAV。すべての deposit と withdrawal で**一緒に**更新（比例的に、share あたり値を保つ）、マネージャからの NAV 更新では**独立に**更新される。

\`market\` と \`mint\` は非正規化 — (market, manager) ペアはすでに PDA のシード スキームでこれらを含意するが、アカウント内に保存することで読み手が外部コンテキストから再派生せずに vault を識別できる。\`manager\` は \`VaultUpdateNAV\` が signer と照合するものだ。

**\`VaultShare\`**（128 バイト）: (vault, depositor) ペアあたり 1 つ。

\`\`\`rust
pub struct VaultShare {
    pub discriminator: [u8; 8],
    pub bump: u8,
    pub _pad0: [u8; 7],
    pub vault: [u8; 32],
    pub owner: [u8; 32],
    pub shares: u64,
    pub cost_basis: u64,     // 累積預金額（報告用）
    pub _reserved: [u8; 32],
}
\`\`\`

\`shares\` は預金者の share 数。\`cost_basis\` は彼らが預けた quote 資産の累積額 — P&L 報告に使う（gain = \`withdraw_assets - cost_basis_share\`）、プログラム内ロジックには使わない。預金者は所有を証明するため \`VaultWithdraw\` に署名する。

PDA 派生:

- TradingVault: \`[b"trading_vault", market.key, manager.key]\`
- VaultShare: \`[b"vault_share", vault.key, owner.key]\`

> **演習 §12.1.** あるユーザが vault の 200 shares を保有、\`total_shares = 1000\`、\`total_assets = 1500\`。vault のどれだけを所有しているか、share あたり NAV は? マネージャが成功取引を走らせ \`total_assets\` を（\`total_shares\` は変えずに）1800 に押し上げたとき、新しい share あたり NAV は?

---

## §12.2  share/asset 数学

操作 3 つ、不変条件 1 つ。

**不変条件。** 任意の預金者について、ある瞬間に引き出せる価値は:

\`\`\`
their_value = their_shares × total_assets / total_shares
\`\`\`

deposit は**すべての既存預金者**についてこの不変条件を保たねばならない: deposit 前の価値 = deposit 後の価値。withdrawal も同じ: 残りの預金者の価値は不変。NAV 更新は全員の価値を同じ比率で変える。

**Deposit。** \`programs/openhl-core/src/lib.rs:3564–3572\` の \`process_vault_deposit\` から:

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

分岐 2 つ。最初の deposit（\`total_shares == 0\`）は assets と shares を 1:1 で mint する — 補間する NAV 履歴がない。以降の deposit は:

\`\`\`
shares_minted = assets_in × total_shares / total_assets
\`\`\`

代数的に: これは \`assets_in\` を現行 share あたり NAV で**shares で表現**した値。deposit 後:

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

share あたり NAV は不変。不変条件は保たれる。

**Withdrawal。** \`lib.rs:3729–3736\` の \`process_vault_withdraw\` から:

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

同じ数学を逆向きに:

\`\`\`
assets_returned = shares_burned × total_assets / total_shares
\`\`\`

withdrawal 後:

\`\`\`
new_total_shares = total_shares - shares_burned
new_total_assets = total_assets - assets_returned
new_NAV_per_share = (total_assets - shares_burned × total_assets / total_shares)
                  / (total_shares - shares_burned)
                  = ... （同じ代数を逆向きに） ...
                  = total_assets / total_shares
                  = old_NAV_per_share
\`\`\`

withdrawal も不変条件を保つ。

**NAV 更新。** \`lib.rs:3830–3831\` の \`process_vault_update_nav\` から:

\`\`\`rust
let prev = vault.total_assets;
vault.total_assets = new_total_assets;
\`\`\`

マネージャが新しい \`total_assets\` を書く。\`total_shares\` は不変。だから share あたり NAV は \`prev / total_shares\` から \`new_total_assets / total_shares\` に動く。すべての預金者の価値が同じ因子で動く。これが PnL の共有のされ方だ。

この 3 つ — deposit、withdraw、NAV 更新 — が vault 会計モデル全体。それ以外（gates、fees、vesting、制限）はその上のポリシーだ。

**整数除算と dust。** \`/\` 演算は整数除算。\`total_assets = 1000\`、\`total_shares = 1000\` の vault に 7 assets を預けるユーザは \`7 × 1000 / 1000 = 7\` shares を mint する — 綺麗。\`total_assets = 1000\`、\`total_shares = 999\` の vault に 7 assets を預けるユーザは \`7 × 999 / 1000 = 6\` shares を mint する（\`6993 / 1000\`、整数切り捨て）。その余分な 1/1000 share が dust — ユーザは 7 assets を払ったが deposit 時点の NAV 価値で 6.993 shares 分相当を受け取った。dust は実質的に 0.007 shares 分を残りの預金者に寄付する（彼らの share あたり価値がわずかに上がる）。

これは vault では一般的に許容される、(1) dust が丸め誤差スケール、(2) 新規預金者より既存預金者に有利で、保守的な方向だから。正確な保存が必要なプログラム（他で担保として使う yield-bearing トークンなど）には、スケールされた u128 share 表現や固定小数点算術による追加精度が要る。本書では意図的にそれを追加しない — コードが増えるだけで教育的価値が加わらない。

> **演習 §12.2.** 空の vault から始める。100 assets を預ける（預金者 A）。NAV を 200 に設定する（価格が倍）。預金者 B が 100 assets を預ける。B は何 shares 受け取るか。B は今 vault のどの割合を所有するか。

---

## §12.3  \`VaultDeposit\` を歩く

\`process_vault_deposit\` は 4 つのハンドラの中で最も複雑だ、最初の deposit で VaultShare PDA を条件付きで作成し、*かつ*末尾で SPL Token Transfer CPI を走らせるからだ。5 フェーズで分解:

**検証**: ペイロード サイズ、非ゼロ deposit、預金者は signer、vault は正しい所有者 + サイズ、system プログラムは正しい、**token プログラムは SPL Token、預金者のトークン アカウントは SPL Token 所有、vault_token はこの vault 自身の口座、つまり \`[TRADING_VAULT_TOKEN_SEED, vault]\` の PDA である**。渡される mint と market アカウントは vault に保存されたものと一致しなければならない — 下の借用スコープ内で \`vault.mint != mint_ai.key\` / \`vault.market != market_ai.key\` チェックが捕捉する。share PDA 派生は以前と変わらず。

**vault 状態を読み mint する shares を計算**: vault データを借用、渡された market/mint を vault.market/vault.mint と相互チェック、最初の deposit（1:1）vs 以降（pro-rata）で分岐。

**vault 集約を更新**（3580–3587 行）:

\`\`\`rust
vault.total_shares = vault.total_shares.checked_add(shares_to_mint)?;
vault.total_assets = vault.total_assets.checked_add(assets)?;
drop(vault_data);
\`\`\`

\`checked_add\`（\`saturating_add\` ではない）: 加算がオーバーフローしうるなら、静かにキャップする代わりに deposit を拒否する。\`u64::MAX\` shares を超えて deposit を受け入れる vault は別の問題を抱えている。明示的な \`drop(vault_data)\` が share アカウントに触れる前に可変借用を解放する — share 作成が vault アカウント チェックパスを CPI で逆戻りしうるので必要だ。

**share アカウントの条件付き create-or-update**（3591–3636 行）:

\`\`\`rust
let share_exists = share_ai.owner == program_id && share_ai.data_len() == VaultShare::LEN;
if !share_exists {
    let rent = Rent::get()?.minimum_balance(VaultShare::LEN);
    let create_ix = system_instruction::create_account(...);
    invoke_signed(...)?;
    // ... VaultShare フィールドを書く ...
} else {
    // ... 既存 shares + cost_basis に足す ...
}
\`\`\`

「存在?」チェックは所有者 + data_len で — アカウントが本書の所有で正しいサイズなら、以前作成した VaultShare と仮定する。（discriminator チェックは \`else\` 分岐内でデータをキャストするときに起きる。）本書のものでなければ、標準 \`invoke_signed\` + \`create_account\` パターンで作る。

ユーザの最初の deposit が VaultShare アカウントの rent を払う（小さな一度限りのコスト）。以降の deposit はフィールドをインクリメントするだけ。これが慣例的なパターン — 代替は別の \`CreateVaultShare\` 命令を最初に呼ぶよう要求することだが、利益なしに摩擦が加わる。

ハンドラはどちらの分岐が走ったとしても最終的に share アカウントを所有しなければならない。両分岐とも最終状態は \`share.shares\` が預金者の総保有を反映し、\`share.cost_basis\` が累積預金を反映する。

**預金者のトークンをエスクローする**、最後のステップ:

\`\`\`rust
spl_token_transfer_user_signed(
    depositor_token_ai,
    vault_token_ai,
    depositor_ai,
    token_ai,
    assets,
)?;
\`\`\`

第 11 章と同じヘルパ。預金者が外側トランザクションに署名する。署名は標準の signer 特権延長パターン（第 6 章 §6.2）で SPL Token に流れる。\`assets\` 単位が \`depositor_token\` から \`vault_token\`、つまりこの vault 専用のトークン口座へ移る。中には他の vault の預け入れもポジションの証拠金も入っていない。

**順序が肝心。** CPI は share + 集約更新の*後*に置かれる。転送が失敗（\`InsufficientFunds\`、アカウント凍結等）すれば、Solana はトランザクション全体をリバートする — share 作成、share フィールド更新、vault 集約インクリメントを含めて。だから失敗したエスクローは預金者に mint された share を残さず、vault 状態変更も残さない。原子性保証が、明示的なロールバックコードなしで自然なエラー処理を正しくする。

> **演習 §12.3.** ユーザが 100、50、25 を 3 つの別トランザクションで預金する。間に UpdateNAV なしで vault の NAV は一定。各ステップでユーザの share アカウント*と* vault トークン アカウント残高をダンプせよ。shares 数は線形成長（100 / 150 / 175）、cost_basis は累計和、vault トークン残高は cost_basis ちょうどに等しいはず。

---

## §12.4  \`VaultWithdraw\` を歩く

deposit より単純、作成するものがないから — ただし vault からトークンを払い出す、つまり trading vault の PDA で署名される \`invoke_signed\` CPI が発生する。\`process_vault_withdraw\`:

**返す assets を計算** — §12.2 で扱った deposit 式の逆。

**認可**:

\`\`\`rust
if share.owner != *owner_ai.key.as_ref() {
    msg!("vault_withdraw: caller is not the share owner");
    return Err(ProgramError::IllegalOwner);
}
\`\`\`

share の記録された所有者だけが burn できる。これは share **単位**の認可で、vault 全体ではない — UpdateNAV のマネージャ チェックと異なる。この設計には「vault 管理者が任意の share を強制清算できる」経路はない（本物の本番 vault はコンプライアンス上の理由で追加するかもしれない）。

**share をこの vault に結びつける**（所有者チェックの直前）:

\`\`\`rust
if share.vault != *vault_ai.key.as_ref() {
    msg!("vault_withdraw: share belongs to another vault");
    return Err(ProgramError::InvalidAccountData);
}
\`\`\`

deposit にはこの行は要らない。share の PDA を \`[VAULT_SHARE_SEED, vault, depositor]\` から導き直すので、別の vault の share は seed の照合で落ちる。withdraw は導き直さない。この章の最初の版はこの比較を書き忘れていた。害がなさそうに見えるが、vault ごとに share の値段は違う。誰も嘘をつかなくても違う。好調な月のあと vault X の share が 1、vault Y の share が 2 なら、X の share を Y に対して burn した人は、入れた額の 2 倍を Y のトークン口座、つまり Y の預金者のお金から受け取る。マネージャが嘘をつけば、さらに悪くなる。再現テストでは、自分の vault を 100,000 トークンで開いて NAV を 1 と申告し、さらに 2 トークン入れて新しい share を 200,000 受け取り、それを別の vault に対して burn した。検査がないと、相手の vault の 200,000 トークン全部を持ち出せた。この穴を見つけたのはレビュアーではなく solinv である。§12.7 では同じやり方で見つけてもらう。

**残高十分性チェック**:

\`\`\`rust
if share.shares < shares_to_burn {
    return Err(ProgramError::InsufficientFunds);
}
\`\`\`

保有以上の shares は burn できない。

**Cost basis 削減**:

\`\`\`rust
let basis_reduction = (((shares_to_burn as u128) * (share.cost_basis as u128))
    / (share.shares as u128 + shares_to_burn as u128)) as u64;
share.cost_basis = share.cost_basis.saturating_sub(basis_reduction);
\`\`\`

比例削減。100 shares、cost_basis 1000 のユーザが 25 shares を burn すると、cost_basis は \`25 × 1000 / 100 = 250\` 減り、残り 75 shares の cost_basis は 750 になる。これが share あたり cost_basis を部分 withdrawal を通じて一定に保ち、P&L 報告が欲しい形になる。

分母の \`as u128 + shares_to_burn as u128\` は \`share.shares\` を**減算前**で使う（まだ減算していないから）。\`share.shares -= shares_to_burn\` の後の単純な \`share.shares as u128\` は誤った basis を計算する。

**集約を更新** — \`total_shares -= shares_to_burn\`、\`total_assets -= assets_to_return\`。両方とも防御的に \`saturating_sub\`、事前チェックを考えれば underflow するはずがないが。

**vault から assets を払い出す**、最後のステップ — これがエスクロー CPI:

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
// (\`if assets_to_return > 0\` の中: 払い出しが 0 なら CPI を飛ばす)
invoke_signed(
    &ix,
    &[vault_token_ai.clone(), owner_token_ai.clone(), vault_ai.clone(), token_ai.clone()],
    &[&[TRADING_VAULT_SEED, vault_market.as_ref(), vault_manager.as_ref(), &[vault_bump]]],
)?;
\`\`\`

deposit 側との力学的な違いがひとつ、肝心:**authority がユーザではなく PDA**だ。預金者の外側トランザクション署名は SPL Token にとって意味がない、なぜなら debit されるトークン アカウント（\`vault_token\`）が従うのは trading vault の PDA だから。これを整えたのは \`CreateTradingVault\` である。\`vault_token\` を \`[TRADING_VAULT_TOKEN_SEED, vault]\` に作り、vault のアドレスを持ち主として \`InitializeAccount3\` を実行した。だからプログラムは vault として、vault 自身の seed で内側 CPI に署名する。seed は \`[TRADING_VAULT_SEED, market, manager, bump]\` で、どれも \`CreateTradingVault\` が \`TradingVault\` アカウントに保存したものを読む。

細かい点が 2 つある。1 つ目、\`vault_market\`・\`vault_manager\`・\`vault_bump\` は借用スコープの中で写し取り、借用は CPI の前に終わる。vault のアカウントは署名者として SPL Token に渡され、呼び出し側がまだデータを借用しているアカウントの CPI をランタイムは拒否する。2 つ目、vault が署名できるのは自分のトークン口座だけだ。呼び出し側が \`vault_token\` に別の vault のトークン口座を渡すと、まずプログラムが拒否する(\`[TRADING_VAULT_TOKEN_SEED, vault]\` の照合)。仮にそれがなくても SPL Token が拒否する。この vault はその口座の authority ではないからだ。

さらに SPL Token は残高を確かめる。\`assets_to_return\` が \`vault_token\` の残高より多ければ転送は失敗し、withdraw 全体が戻る。\`total_assets\` が何と言っていようと、vault は持っていないトークンを払い出せない。

**ここでも順序が肝心。** CPI は最後。トークン転送が失敗（vault_token 凍結、dest クローズ等）すれば、share-burn と集約-デクリメントもリバートする。だから失敗した払い出しは預金者の shares を無傷で残し、vault も変更しない。

> **演習 §12.4.** §12.2 の演習の vault で、預金者 A に全 shares を引き出させる。3 つを前後でダンプせよ: (1) 預金者 A の share アカウント、(2) vault 集約状態、(3) vault トークン アカウント残高。A が受け取るトークンが、預金者 B の主張可能価値が残り shares に対して含意するものと一致する（つまり B の価値が変わっていない）ことを確認せよ。そのあと (3) をもう一度見よ。A は 200 を受け取り、口座には 200 あった。B はまだ 100 を受け取れるはずなのに、口座は空だ。NAV が 100 から 200 になったのはマネージャの申告によるもので、トークンが入ってきたからではない。§12.5 はこの差の話である。

---

## §12.5  マネージャ信用問題 — \`VaultUpdateNAV\`

3800–3840 行の \`process_vault_update_nav\` は短いが、ここに vault モデル全体の信用前提が住む:

\`\`\`rust
if vault.manager != *manager_ai.key.as_ref() {
    msg!("vault_update_nav: caller is not the vault manager");
    return Err(ProgramError::IllegalOwner);
}

let prev = vault.total_assets;
vault.total_assets = new_total_assets;
\`\`\`

マネージャは \`total_assets\` を任意の数値に更新するトランザクションに署名する。この数値がマネージャの実際の取引 PnL を反映していることをオンチェーンで検証する仕組みはない。**預金者はマネージャを信用する**。

この章の最初の版は、それより悪かった。**市場の全員が、全部のマネージャを**信用していた。しかも \`CreateTradingVault\` を使えば誰でもマネージャになれる。withdraw は (market, mint) ごとのトークン口座から払い出し、その口座には他の vault の預け入れも、全ポジションの証拠金も入っていたので、vault の払い出しを、その vault が持っている額で止めるものは何もなかった。自分の vault に 100,000 入れ、NAV を 300,000 と申告して withdraw すると、他人の 200,000 を含む 300,000 が出てきた。抜けていた検査はない。渡したアカウントはどれも正しいものだった。直したのは設計である。今は vault ごとに自分のトークン口座があり(§12.0)、withdraw はそこからしか払わない。\`fuzz/vault\` のテスト \`manager_cannot_withdraw_more_than_its_vault_holds\` は同じ手順を今のコードで実行する。300,000 の withdraw は SPL Token で失敗する。vault の口座には 100,000 しかないからだ。もう一方の vault の 200,000 には手がつかない。

だから信用の範囲は上の段落が言うとおりに戻り、それより広くはない。vault の預金者は、その vault のマネージャを信用する。マネージャは今も嘘の NAV を申告でき、それはその vault の預金者どうしの間でお金を動かす(水増しされた NAV で先に引き出した人が、他の人の当てにしていたトークンを持っていく。演習 §12.4 のとおり)。下の 3 パターンはその話である。

本番でこれを硬化する 3 つのパターン:

**(1) オンチェーンで参照状態から NAV を計算する。** \`new_total_assets\` をペイロードで受け入れる代わりに、ハンドラが vault のオープン Position アカウントを読み、（第 11 章と同じ \`compute_equity\` を使って）その equity を合計し、結果を書く。これでマネージャは嘘をつけない — \`total_assets\` は機械的に導出される。コスト: UpdateNAV 呼び出しごとに参照されるアカウントが大幅に増え（ポジションあたり 1 つ）、CU とアカウントリスト上限を押す。

**(2) withdrawal を stated NAV ではなくオラクル価格で許す。** withdrawal は透明なオンチェーン規則（例: 公式による NAV、マネージャ報告による NAV ではなく）に基づいて受け取る assets を計算する。マネージャの NAV 報告は redemption の基礎ではなく advisory メタデータになる。

**(3) 遅延付き 2 段階 NAV 更新。** マネージャが新 NAV を提案、変更はある遅延後に適用（例: 1 時間）、遅延中、マネージャが嘘を報告していると思う預金者は**古い** NAV で引き出せる。これは一部の Curve/Yearn vault が使う trust-but-verify パターン。

本章はパターン (0) を出荷する — 検証なし、マネージャは信用される。教育用と小規模デプロイ vault には十分だが、本番化時のセキュリティ監査を始める正しい場所だ。

パターン (1) が理論的にこれほど魅力的なのに実務で稀な理由: N 個のポジションにわたって equity を合計するには N アカウントをロードする必要があり、N は本物の vault で数百になりうる。1 トランザクションでの約 64 アカウント上限と CU バジェットが、1 トランザクションでまとめられるポジション数に厳格な上限を置く。本番 vault は同時ポジション数を小さく制限するか、NAV 更新を複数トランザクションに分けるかのどちらかだ。

> **演習 §12.5.** マネージャが \`total_assets\` を \`u64::MAX\`（悪意ある更新）に設定したら何が起きるかを辿れ。既存預金者への即時効果は? 新規預金者への効果は? 誰かが引き出そうとしたときの最終結果は?

---

## §12.6  シングルトン書き込みの再起 — 第 5 章アンチパターン再び

\`TradingVault\` は本コードベースが第 5 章の \`Stats\` 警告以来持っている典型的なシングルトン書き込み共有アカウントだ。すべての deposit、withdrawal、NAV 更新が同じ \`(total_shares, total_assets)\` ペアを書く。異なるユーザからの 2 つの同時 deposit は並列に走れない — 両方とも vault 集約を書き、Sealevel が直列化する。

どれほど悪いか? 1 秒の deposit レイテンシで、vault は slot あたり 1 deposit、最大約 2.5 deposit/秒を受け入れる。戦略間で資本を動かす数千の預金者を持つ vault には、これがユーザ体験の binding 制約。

3 つの緩和策、すべて本物、すべて本番で異なる vault が使う:

**(1) オフチェーン deposit キュー。** deposit はオフチェーン キュー（Redis、データベース）に書かれる。定期的なオンチェーン「batch settle」命令が N deposit を 1 トランザクションで処理し、多くのユーザに対してシングルトン書き込みコストを 1 回払う。トレードオフ: deposit はもうアトミックでなく — ユーザは「pending」ステータスを見て、数分後に「confirmed」を見る。ほとんどの機関 vault はこう動く。「待つけど ET の午後 4 時に戦略に入る」パターン。

**(2) vault をシャーディングする。** N 個の独立 \`TradingVault\` アカウントを持ち、それぞれが自分の (total_shares, total_assets) を持つ。deposit は預金者の pubkey ハッシュに基づいてシャードにルートする。読み取りは全シャードで集約する。これがシングルトンを破る — N シャードは N 並列 deposit を意味する。トレードオフ: NAV 更新が今や N トランザクションを要し、シャード間のリバランスが事になる。実世界例: 大きな Curve/Yearn vault はまさにこの理由でシャーディングすることがある。

**(3) deposit ごとの蓄積子。** deposit ごとにシングルトンを更新する代わりに、個別 deposit「チケット」がユーザごとのアカウントに書かれ、定期的な「checkpoint」呼び出しがそれらをシングルトンにロールする。オプション 1 と似て見えるがオンチェーンに留まる — キューは未決済チケット アカウントの集合だ。トレードオフ: 決済の複雑さ、deposit と share 発行の間のわずかな遅延。

本章はオプション (0) を出荷する — 標準的な同期 deposit。低スループット vault（< 10 deposit/秒）には十分で、教育的に最も明快だ。(1) や (3) を通る本番経路は踏み固められており、本章のスコープ外だ。フレーミングは「なぜ欲しいかが今わかる」。

より深いレッスン、第 5 章の言い直し: **すべてのシングルトン書き込みは将来のスケーリング ボトルネック**。「totals」や「aggregate」アカウントに手を伸ばしている自分を見つけたら、同じ意味論を持たずに表現できるか問え。時に答えは yes（第 10 章のポジションごとの決済 — 集約不要）、時に答えは no で上の緩和パターンが要る。要点は、負荷下で発見するのではなく意識的にトレードを行うこと。

---

## §12.7  まとめと自己検証

### まとめ図

\`\`\`
Vault ライフサイクル:

  manager ──► CreateTradingVault ──► TradingVault{shares=0, assets=0}
                                            │
   user A が 100 deposit ──► VaultDeposit ──► │
                                            ▼
                          TradingVault{shares=100, assets=100} (最初は 1:1)
                          VaultShare_A{shares=100, basis=100}
                                            │
   manager が取引 ──► UpdateNAV(200) ────►   │
                                            ▼
                          TradingVault{shares=100, assets=200} (NAV ×2)
                                            │
   user B が 100 deposit ──► VaultDeposit ──► │  shares = 100 × 100 / 200 = 50
                                            ▼
                          TradingVault{shares=150, assets=300}
                          VaultShare_B{shares=50, basis=100}

   A が全 withdraw ──► VaultWithdraw(100) ──► assets_out = 100 × 300 / 150 = 200
                                            ▼
                          TradingVault{shares=50, assets=100}
                          VaultShare_A{shares=0, basis=0}
                          VaultShare_B{shares=50, basis=100} (不変)


シングルトン書き込み再起（第 5 章再び）:

  4 つの命令すべてが TradingVault アカウントを WRITE する:
    deposit / withdraw / update_nav / create

  ⇒ Sealevel がすべての vault 操作を他のすべてに対して直列化する。
  ⇒ スループット上限: vault あたり slot あたり約 1 op。

  緩和策（ここでは実装しない）:
    - オフチェーン deposit キュー → batch settle
    - vault を N 個の独立集約にシャーディング
    - deposit ごとの蓄積子 + 定期的 checkpoint
\`\`\`

### 自分で検証する 3 項目

1. **deposit を通じての NAV 保存。** 空の vault から始めよ。A に 100 deposit させる。即座に B に 100 deposit させる（間に UpdateNAV なし）。vault は \`total_shares = 200, total_assets = 200\` のはず、A と B の share あたり NAV は両方とも 1.0 でなければならない。次に C に 100 deposit させる。同じ share あたり NAV: 1.0。
2. **NAV 更新が全員の価値を一律に変える。** 上の状態から \`vault --update-nav --total-assets 600\`（3× 価値）を走らせる。A の \`claimable_assets = A.shares × total_assets / total_shares = 100 × 600 / 300 = 200\`。B と C も同じ。3 預金者全員が 3× ゲインを比例的に共有する。
3. **非 1:1 NAV での withdrawal。** 上から（各預金者が各々 200 assets 価値の 100 shares を持つ）、A に全 100 shares を withdraw させる。200 assets を受け取る。vault は今 \`total_shares = 200, total_assets = 400\`。B と C はそれぞれまだ 100 shares 所有（vault の 50%）、各々 200 assets 価値 — A の退出で不変。

### 書き忘れた検査を道具に探させる

上の 3 項目は計算を確かめる。アカウントの検査、つまり §12.3 と §12.4 にある、呼び出し側が**どの**アカウントを渡してよいかを決める \`if ... { return Err(...) }\` の行は、どれも確かめない。§12.4 の \`share.vault\` の行のように、そういう検査を 1 つ忘れても、書こうと思いつくテストはどれも落ちない。[solinv](https://github.com/psyto/solinv) は、ネイティブのプログラムに対してまさにこれを fuzz する。攻撃者が代わりに渡せるアカウント(他の預金者の share、別の vault、vault が持っていないトークン口座)を教えると、各命令でそのうち 1 つを差し替えて送る(組を宣言すれば、複数を一緒に差し替える)。差し替えた呼び出しが成功して状態が変われば、それが検出である。

\`fuzz/vault/\` がこの章のためのハーネスである。1 つの市場に vault を 3 つ用意し、それぞれが自分のトークン口座を持つ。A と B が shares を持つ K の vault、A 自身の vault、屑の mint で作った C の vault だ。solinv は、README が誰にでも勧めている入れ方(git の rev)で入れてある。Solana のツールチェーンと Crucible CLI(\`cargo install --locked --git https://github.com/asymmetric-research/crucible --tag v0.1.0 crucible-fuzz-cli\`)が要る:

\`\`\`bash
cargo build-sbf --manifest-path programs/openhl-core/Cargo.toml
cd fuzz/vault
cargo build --release --features invariant_vault
cargo test --release --features invariant_vault        # §12.4 の攻撃が拒否される
timeout -s INT 90 crucible run openhl_vault_fuzz invariant_vault \\
    --binary-in target/release/invariant_test --timeout 90
\`\`\`

今のプログラムでは \`[FUZZ_FINDING]\` の行は出ない。(Crucible は \`--timeout\` を 1000 回に 1 度しか見ないので、外側に \`timeout\` をつけている。macOS では coreutils の \`gtimeout\`。)

> **演習 §12.7.** \`process_vault_withdraw\` から \`share.vault\` の検査を消し、プログラムを作り直して(最初のコマンド)、fuzzer をもう一度走らせよ。数秒で次が出るはずだ:
>
> \`\`\`
> [FUZZ_FINDING] [account-swap:…] ix vault_withdraw succeeded with account 1 swapped from <K's vault> to <A's vault> (different context, same shape)
> \`\`\`
>
> \`cargo test\` も落ち、A がいくら持ち出したかが出る。検査を戻したら、ほかの検査も 1 つずつ消し、走らせる前に結果を予想せよ。私たちが各 60 秒で測った結果:
>
> | 消した検査 | 捕まったか |
> |---|---|
> | withdraw: \`owner.is_signer\` | はい、signer-skip、slot 0 |
> | withdraw: \`share.vault == vault\` | はい、account-swap、slot 1 |
> | withdraw: \`share.owner == owner\` | はい、account-swap、slot 2 |
> | deposit: share の PDA の導き直し | はい、account-swap、slot 1 |
> | deposit: \`verify_trading_vault_token\` | はい、account-swap、slot 7 |
> | deposit: \`depositor.is_signer\` | いいえ |
> | withdraw: \`vault.owner == program_id\` | いいえ |
> | withdraw: \`share.owner == program_id\` | いいえ |
> | withdraw: \`verify_trading_vault_token\` | いいえ。下の 2 つの slot の組でも出ない |
>
> 先を読む前に、「いいえ」の 4 行がなぜ「いいえ」なのかを考えよ。
>
> 4 つとも、別の仕組みが裏で支えている。これらは攻撃を試しておらず、通り道が見つからなかっただけだ。2 つの所有者チェックは、ランタイム自身が支えている(第 1 章)。withdraw は両方のアカウントに書き込み、プログラムは自分が所有していないアカウントを変えられないので、すり替えたアカウントは次の CPI か命令の最後で落ちる。deposit の署名チェックは、ランタイムの署名の規則が支えている(第 6 章 §6.2)。deposit が呼ぶ SPL Token の \`Transfer\` は預金者を署名者として扱うが、プログラムは自分が受け取った署名しか渡せないので、SPL Token が動く前に CPI が落ちる(\`Cross-program invocation with unauthorized signer\`)。この 3 つも、早く、分かりやすいエラーで落ちるので、検査として残す価値はある。
>
> 4 つ目は SPL Token の authority の照合が支えている。vault は自分としてしか署名せず、各 vault のトークン口座はその vault にしか従わないので、払い出し元に別の vault のトークン口座を指定すると \`OwnerMismatch\` で落ちる。最初からそうだったわけではない。この章の最初の版では、市場のトークン口座はすべて 1 つの \`vault_authority\` の PDA(\`[VAULT_AUTH_SEED, market]\`)に従っており、この行は本物の穴だった。C は屑の mint で vault を開き、屑を 300,000 入れ、払い出し元に本物の mint のトークン口座を、送り先に C 自身の本物の mint の口座を指定して引き出し、屑 300,000 を本物 300,000 に換えた。これは**2 つ**のアカウントを同時に変える必要がある。solinv のふつうの account-swap は 1 度に 1 つの slot しか変えないので、最初の表はこの行を「いいえ」とし、害はないと書いていた。攻撃を見つけたのはレビュアーである。ハーネスは今もこの組を宣言しており(\`check_sets\`: C の屑の引き出しで、送り先と払い出し元を一緒に差し替える。払い出し元は今は K のトークン口座)、テスト \`withdraw_refuses_the_token_account_of_another_vault\` でも押さえてある。このテストがわざと K の残高より少ない 100,000 を求めているのには理由がある。K の口座の残高より多い 300,000 を求めると、SPL Token は authority を見る前に残高で拒否する。するとプログラムの照合を消しても出るのは「insufficient funds」で、この行を SPL Token が支えているかどうかは分からない。100,000 なら \`OwnerMismatch\` が出る。拒否から何かを結論するときは、**どの**拒否なのかを確かめよ。そして fuzzer の「いいえ」は、あなたが書いた差し替えでは通り道が見つからなかったという意味でしかない。通り道がないという意味ではない。
>
> このハーネスが扱わないもの: §12.5 のマネージャが申告する NAV。嘘の NAV を申告するマネージャは、自分が渡してよいアカウントしか渡さないので、アカウントを差し替える fuzzer には差し替える物がない。市場全体に及ぶ形のこの穴は、9 つの検査がすべてそろっていても開いていた。塞いだのは 1 行ではなく設計の変更(vault ごとのトークン口座)である。残っているもの、つまりマネージャが自分の vault の預金者に嘘をつくことも、fuzzer からは同じく見えない。こういう穴を見つけるには、行を消すのではなく設計を読む必要がある。

---

## 第 13 章への導線

預金者資本をプールし pro-rata で PnL を分配する vault を持つようになった。**まだ持っていない**のは**vault が実際に取引する仕組み**だ。§12.5 のマネージャ NAV 更新は主張であって検証された行動ではない — 「vault マネージャが vault の資産を使ってポジションをオープンする」命令はない。それを追加するのが Phase B 統合弧の自然な次ステップだ: vault の PDA が所有する Position を作る（vault のシードで \`invoke_signed\`）マネージャ署名の \`VaultOpenPosition\`、vault の追跡された assets から担保を引く。

第 13 章は builder codes を組み立てる — それを通じてユーザがルートされたトレーディング フロントエンドが手数料の一部を集められる、プロトコル ネイティブの紹介 / 手数料分配仕組みだ。Builder codes はプログラム内のすべての手数料を持つ命令（place_order、本番エスクロー パスの deposits、liquidations）に触れ、各トランザクションの AccountMeta に fee_recipient アカウントを加える。本章では手数料分割がどう基礎アクションとアトミックに起きるか（別の「claim fees」呼び出しが不要）と、Solana DEX フロントエンドを独立したビジネスとして成立させる分配インセンティブを builder-code 構造がどうエンコードするかを探る。
`,
                },
                {
                  title: "第13章 — プロトコル プリミティブとしての Builder Codes",
                  slug: "solana-internals-ch13-builder-codes-ja",
                  type: 'CONTENT',
                  sortOrder: 7,
                  duration: 45,
                  xpReward: 100,
                  content: `# 第13章 — プロトコル プリミティブとしての Builder Codes

> 状態: ドラフト (v0.1)。
> 教材コード: [\`crates/state/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/state/src/lib.rs)（\`BuilderProfile\`）、[\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs)（\`process_register_builder\`、\`process_place_order_with_builder\`、\`process_claim_builder_fees\`、\`process_create_fee_vault\`）、[\`scripts/builder/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/builder/src/main.rs)、[\`fuzz/fees/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/fees/src/main.rs)（§13.6 の solinv ハーネス）。
>
> 部品化に伴い、この章で読むロジックは [\`crates/fees/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/fees/src/lib.rs)(\`openhl-fees\`)に移り、プログラムはそれを呼び出す。以下に引用するコードは分割前の \`programs/openhl-core/src/lib.rs\` の版で、行番号は追従していない。

---

## §13.0  はじめに — builder code とは何で、何でないか

**Builder code** は取引に付与されるフロントエンド単位の識別子だ。ユーザがフロントエンド経由で注文を開くと、フロントエンドは builder code をトランザクションに含める。プログラムは取引のプロトコル手数料の設定可能な一部を、その builder のオンチェーン アカウントに credit する。

Hyperliquid が現行の意味でこの語を造った。フロントエンドが自分で板を運営せずに注文フローをマネタイズできるようにする、プロトコル ネイティブの仕組みだ。「ルータ手数料」（Uniswap）、「ホワイトラベル ルーティング」（CEX）、「紹介ブローカー」（TradFi）と同じ系譜 — 長く存在する分配インセンティブの Solana 版だ。

builder code は次のものでは**ない**:

- **紹介コード (Referral codes)。** 紹介コードは新規ユーザを紹介した人に報酬を与える。通常、サインアップごとに 1 回、あるいは紹介相手の手数料の長い尾を比率で永遠に支払う。Builder codes は**取引**ごとに支払い、誰が誰を紹介したかは追跡しない — ルーティングに報い、紹介に報いるのではない。
- **メーカー/テイカー リベート。** メーカー リベートはユーザ（指値注文を出した人）に自分の手数料の一部を戻す。Builder codes はユーザの手数料の一部を**第三者**（フロントエンド）に支払う。ユーザはどちらにせよ同じ総手数料を払う。違うのは分配を誰が受け取るかだ。

本章は 3 つの取引命令と 1 つのブートストラップを出荷する。

1. **\`RegisterBuilder\`** — 各 builder が、累積手数料と自己宣言した最大シェアを保持する builder ごとの \`BuilderProfile\` PDA を作る。プログラムが credit するアカウントが必要なので登録が必要。アカウントなし、手数料なし。
2. **\`PlaceOrderWithBuilder\`** — 最後のアカウントとして builder profile を取る取引命令バリアント。プロトコル手数料を計算して per-(quote_mint) fee vault にエスクローし、builder のシェアを profile の \`accumulated_fees\` に分割し、\`PlaceOrderChecked\` と同じ place-order パスを走らせる。
3. **\`ClaimBuilderFees\`** — builder の引き出し呼び出し。アキュムレータをゼロ化し、PDA 署名付きで fee vault から builder のトークン アカウントへ claim 額の SPL Token Transfer を行う。
4. **\`CreateFeeVault\`** — quote mint ごとの 1 回限りのブートストラップ。place-order バリアント実行前にクラスタごと 1 回走らせる。per-(quote_mint) fee_vault トークン アカウントを \`[b"fee_vault_auth", quote_mint]\` PDA が所有する形で確保する。第 6 章の \`CreateVault\` のミラー。

本章は \`PlaceOrderChecked\` も拡張して同じプロトコル手数料をエスクローする。理由は §13.5b の設計選択 #2 — 対称性だ。builder パスだけが手数料をエスクローすると、builder 経由の取引が経由なし取引より実質的に高くつく。本番デプロイは最初からこれを両方のバリアントで普遍的なプロトコル手数料として扱って解決する。

本章の知的内容は 3 部構成だ。§13.4 のアトミシティ論（なぜ手数料分割は取引命令の中で起き、別の「取引ごとに claim」呼び出しではないか）、§13.2 のキャップ積み重ねパターン（自己宣言キャップとプロトコル レベル キャップがどう相互作用し、builder が侵害されても手数料漏れを境界付けるか）、そして §13.5b の本番エスクロー設計議論（なぜ builder 手数料は第 11 章・第 12 章の二者間移動と構造的に異なるか — fee-vault 実装の背後にある 4 つの設計選択）。

---

## §13.1  \`BuilderProfile\` アカウント

\`crates/state/src/lib.rs\` から:

\`\`\`rust
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
pub struct BuilderProfile {
    pub discriminator: [u8; 8],
    pub bump: u8,
    pub _pad0: [u8; 7],
    pub builder: [u8; 32],          // builder の pubkey
    pub max_fee_share_bps: u64,     // 自己キャップ、登録時にクランプ
    pub accumulated_fees: u64,      // claim 対象
    pub total_volume: u64,          // 統計: この builder 経由でルートされた base size
    pub fee_mint: [u8; 32],         // set at registration; fees are earned and claimed only in it
}
\`\`\`

104 バイト。設計を担うフィールド 4 つ(\`fee_mint\` は下の制約で扱う):

**\`builder\`** はフロントエンド / アグリゲータの pubkey。PDA 派生での唯一のシードに使う: \`[BUILDER_PROFILE_SEED, builder.key]\`。これですべての Solana pubkey は高々 1 つの builder profile を持ち、pubkey を知っている誰もが派生できる。Profile は openhl-core 所有（本プログラムだけが \`accumulated_fees\` を変更できる）だが、誰でも公開フィールド（\`builder\`、\`total_volume\`）を**読み**、builder の主張するルーティング量を検証できる。

**\`max_fee_share_bps\`** は builder の自己宣言した、プロトコル手数料のどの fraction を取るかの上限。\`max_fee_share_bps = 2000\` で登録した builder は、ルートされる任意の注文でプロトコル手数料の最大 20% を取ると公にコミットしている。これは信用シグナル — 「20% は我々、80% はプロトコル」と「50/50」を宣伝する builder は、ユーザにフロントエンドがどうマネタイズするかを伝える。自己キャップが低いほど → ユーザに優しい手数料分割 → 潜在的に多いフロー。

**\`accumulated_fees\`** は builder に credit され claim を待つ手数料の走行合計。このプロファイル経由でルートする \`PlaceOrderWithBuilder\` ごとにインクリメント。\`ClaimBuilderFees\` でゼロにリセット。Builder はプログラム アカウント内に蓄積しバッチで引き出す — 取引ごとに claim するよりはるかに安価だ。

**\`total_volume\`** は観測性 — builder 経由でルートされた base size。Builder が潜在パートナーに自分のフローを証明するため（あるいはユーザが builder の実績を吟味するため）使う。プログラム ロジックには使わない。

注目すべき設計制約 2 つ:

- **Builder あたり 1 profile。** PDA 派生が (builder pubkey) → (profile pubkey) マッピングを全単射にする。Builder は market ごとに異なる手数料分割の 2 profile を持てない。A/B テストしたいなら 2 つの異なる builder ウォレットを使う。
- **Quote 単位での手数料蓄積。** \`accumulated_fees\` はプロトコル手数料が取られる quote 通貨で計上される。複数 quote 通貨（USDC と USDT）なら、設計は (builder, mint) ごとの profile が必要、builder ごとだけではなく。ここは意図的に単一 quote に保つ、プログラムの残りも単一 quote なので。プログラムはこれを強制する。誰でも任意の quote mint で market を作れるので、builder が \`RegisterBuilder\`(アカウント 3、builder が署名)で \`fee_mint\` を決め、別の mint で quote された market での \`PlaceOrderWithBuilder\` は拒否し、\`ClaimBuilderFees\` は \`fee_mint\` の fee vault からしか払わない。この固定がないと、価値のない mint で quote された market で稼いだ手数料を、同じ数量だけ USDC の fee vault から claim できてしまう(\`tests/builder_fee_mint.rs\`)。最初の credit ではなく登録時に決めるのは、\`PlaceOrderWithBuilder\` に署名するのはトレーダーで builder ではないからだ。最初の credit で固定すると、誰でも他人の profile を価値のない mint に固定できてしまう。

> **演習 §13.1.** あるフロントエンドが \`max_fee_share_bps = 3000\` で登録する。3 つの取引が経由する: notional 1000、2500、700。\`PROTOCOL_FEE_BPS = 10\`（0.1%）で、3 取引すべての後の \`accumulated_fees\` 合計は?

---

## §13.2  キャップ 2 つ、積み重ね

Builder code は 2 つの手数料シェア キャップが要る、1 つではなく、2 つの当事者が異なるインセンティブを持つから:

**プロトコル キャップ (\`PROTOCOL_BUILDER_SHARE_CAP_BPS = 5000\`)** — **任意の** builder が任意のプロトコル手数料の留保できる最大 fraction。プログラムにハードコード。本書の値 5000 bps だと、プロトコルはすべてのプロトコル手数料の少なくとも 50% が builder 設定に関わらずプロトコルに残ることを保証する。

**Builder 自己キャップ (\`BuilderProfile.max_fee_share_bps\`)** — この**特定の** builder が留保する最大 fraction。登録時に自己宣言、ユーザに見える。

任意の取引での実効シェアは \`min(builder.max_fee_share_bps, PROTOCOL_BUILDER_SHARE_CAP_BPS)\`。\`programs/openhl-core/src/lib.rs:4044–4049\` から:

\`\`\`rust
share_bps = profile.max_fee_share_bps;
if share_bps > PROTOCOL_BUILDER_SHARE_CAP_BPS {
    // 防御的: 登録済み profile はキャップを超えるべきではないが、
    // builder 登録以降にキャップが下げられた可能性がある。
    share_bps = PROTOCOL_BUILDER_SHARE_CAP_BPS;
}
\`\`\`

プロトコル キャップは登録時にクランプする（ユーザはキャップ以上を要求できない）が、取引時にも再クランプする — 登録と取引の間にキャップが下げられうるからだ。（本章は定数を出荷する。本物のプログラムは \`PROTOCOL_BUILDER_SHARE_CAP_BPS\` を config アカウント上に住むガバナンス調整可能値にするかもしれない。まさにそこで防御的再クランプが重要になる。）

2 キャップ構造はコアな安全性プロパティだ。扱う 3 つの失敗モード:

1. **悪意ある builder。** 何らかの形で登録時に \`max_fee_share_bps = 10000\`（手数料の 100%）を宣言する builder は即座に \`PROTOCOL_BUILDER_SHARE_CAP_BPS\` にクランプされる。プロトコルは常にフロアを保つ。
2. **ユーザのミス。** 馴染みのない builder にルートするユーザでも、取引前に**最大**の手数料漏れを知っている — 両キャップをオンチェーン状態から読める。手数料の驚きはない。
3. **侵害された builder。** Builder のウォレットが侵害され、攻撃者がシェアを膨らませようとしても、登録キャップ（登録後は不変）を超えられない — 再登録すれば新しい PDA が異なるアドレスに生まれ、既存のフローが壊れる。

本番 builder プログラムはしばしば**第 3 の**キャップを追加する — プロトコルが異なる market で異なる手数料分割を charge できる、market ごとや資産ごとのキャップ。本章は明快さのために省略するが、パターンは自然に拡張する。

> **演習 §13.2.** Builder が \`max_fee_share_bps = 8000\` で登録される。キャップ積み重ねを通れ: 本書の \`PROTOCOL_BUILDER_SHARE_CAP_BPS = 5000\` で、実効シェアは? Builder 登録後にガバナンス投票がプロトコル キャップを 3000 に下げた**ら** — 次の取引でその profile を通したら何が起きるか?

---

## §13.3  \`PlaceOrderWithBuilder\` を歩く

\`programs/openhl-core/src/lib.rs\` の \`process_place_order_with_builder\`。ハンドラは \`PlaceOrderChecked\` の厳格な上位集合 — 同じ 8 つの先頭アカウント（\`user\`、\`book\`、\`oracle\`、\`market\`、\`mint\`、\`user_token\`、\`fee_vault_token\`、\`token_program\`）、末尾に追加の \`builder_profile\` アカウント 1 つ、同じ手数料計算、同じ place ロジックに、builder credit ステップを加える。

**検証 + サニティ バンド**: \`PlaceOrderChecked\` と同一。両ハンドラは渡された market に対して (book, oracle, mint) チェインをクロス検証し、オラクル staleness のガントレットを走らせ、価格サニティ バンドを適用する。

**手数料計算 + builder credit**:

\`\`\`rust
let notional_val = (price as u128) * (size as u128);
let protocol_fee = (notional_val * (PROTOCOL_FEE_BPS as u128) / 10_000) as u64;

// ... builder profile を読み、share_bps をキャップでクランプ ...
if profile.fee_mint != *mint_ai.key.as_ref() {
    return Err(ProgramError::InvalidAccountData); // profile earns fees in another mint
}

let builder_share = ((protocol_fee as u128) * (share_bps as u128) / 10_000) as u64;
profile.accumulated_fees = profile.accumulated_fees.checked_add(builder_share)?;
new_volume = profile.total_volume.checked_add(size)?;
profile.total_volume = new_volume;
\`\`\`

3 つの数値が落ちる:

- \`notional_val = price × size\` — 取引の総価値、quote-unit-scaled 形式で。
- \`protocol_fee = notional × 10 / 10_000\` — notional の 0.1%、quote 単位。
- \`builder_share = protocol_fee × share_bps / 10_000\` — プロトコル手数料の fraction、quote 単位。

\`builder_share\` は \`checked_add\` で \`profile.accumulated_fees\` に追加（オーバーフローは静かにキャップする代わりに取引を拒否 — builder は走行合計を u64::MAX 以下に保つため定期的に claim できる）。\`total_volume\` は観測性のため取引サイズ分進む。

**注文配置**: §9.4 の \`PlaceOrderChecked\` と同一。空スロットを線形走査、注文を書く、カウンタをインクリメント。

**手数料エスクロー**: ハンドラは SPL Token Transfer の CPI（\`spl_token_transfer_user_signed\`）で終わり、ユーザの quote-token アカウントから per-(quote_mint) fee vault に**全額**の \`protocol_fee\` を移動する。\`(protocol_fee - builder_share)\` 残余は fee vault にプロトコルの取り分として残る。\`ClaimBuilderFees\` が後で各 builder への \`accumulated_fees\` を同じ vault から release する。最後に置くのは、Transfer 失敗（InsufficientFunds、凍結アカウント）が注文書き込みと builder credit の両方をアトミックに revert するようにするため — 第 11 章の担保エスクローと同じ順序重要性の論である。

\`PlaceOrderWithBuilder\` の CU コストは \`PlaceOrderChecked + 約 600 CU\`、builder profile 借用のため。手数料計算と手数料エスクロー Transfer は既に \`PlaceOrderChecked\` にある。builder なしパスに対する限界コストは builder credit だけだ。

> **演習 §13.3.** \`price × size\` が大きすぎて \`notional × PROTOCOL_FEE_BPS\` が \`u128\` をオーバーフローする \`PlaceOrderWithBuilder\` が呼ばれたら何が起きるか。失敗パスを辿れ。なぜこの計算に \`u64\` ではなく \`u128\` 精度が正しいか?

---

## §13.4  アトミシティ論

\`PlaceOrderWithBuilder\` は手数料分割を**注文配置と同じ命令内**で行う。「各取引の後、builder が別の \`RecordFee(trade_id, amount)\` 命令を呼ぶ」パターンはない。アトミシティが肝心な理由は 3 つ:

**1. 決済の誠実性。** 手数料分割が別トランザクションで起きるなら、ユーザは slot N で取引手数料を支払い、builder は slot N+1 でシェアを受け取れない可能性がある（アカウントがクローズされた、キャップが変わった、等）。アトミシティは: 取引が分割適用で commit するか、どちらも起きないかのいずれか、を意味する。「手数料は払ったが builder は credit を受け取らなかった」失敗モードはない。

**2. CU 効率。** 別の「record fee」命令はもう 1 トランザクションぶんの手数料、ネットワーク往復、CU オーバーヘッドを毎単一取引でかかる。1 日あたり数千取引 × builder ごとで、相当のコストになる。インライン蓄積は取引ごとに 1 回、claim は N 取引ごとに 1 回、総コストは償却される。

**3. スケジューリング。** 別の手数料記録命令は builder profile をすべての取引トランザクションで書き込み可能アカウントとして要求する、分割 == 0 でも。Sealevel はその後、同じ builder の profile 上のすべての取引を直列化する（第 5 章のアンチパターン）。分割が取引内なら、**その builder にルートされた取引のみ**が profile に触れる — だから 2 builder のフローは同じ market を含んでも並列に処理できる。

**蓄積**（取引とアトミック、\`PlaceOrderWithBuilder\` 内）と **claim**（バッチ、別の \`ClaimBuilderFees\` 呼び出し）の分割も肝心だ。Claim は高価な操作: 実際のトークンを動かす必要があり（本番）、それは SPL Token CPI、それは signer セットアップとアカウント検証を意味する。それを取引ごとに行うのは無駄だ。Profile に蓄積させ builder に定期的に（時間ごと、日ごと、何でも）claim させることで、取引ごとのコストは最小限に保たれる。

この蓄積 - バッチ - claim パターンは Ethereum の ERC-20 配当分配と同一 — 同じ問題、同じ解、異なるランタイム。

> **演習 §13.4.** 各取引が別の \`RecordFee\` 命令を発行し builder が処理しなければならない代替設計を草案せよ。負荷下（1 builder 経由で 10 取引/秒など）での BuilderProfile アカウントへの秒あたり書き込み数を数えよ。本書の設計と比較せよ。どちらが Sealevel をより積極的に直列化するか?

---

## §13.5  \`RegisterBuilder\`、\`ClaimBuilderFees\`、\`CreateFeeVault\`

\`RegisterBuilder\` は第 3 章の標準 PDA 作成パターン、1 つのひねり付き: 要求された \`max_fee_share_bps\` は登録時にクランプされる:

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

クランプは静か — 登録は成功する、シェアが下げられただけだ。クランプをログすると、builder はプログラム ログから実効キャップを検証できる。

\`ClaimBuilderFees\` は 2 ステップ — 借用スコープ内でアキュムレータをゼロ化、その後 fee vault からの PDA 署名 Transfer:

\`\`\`rust
if profile.builder != *builder_ai.key.as_ref() {
    return Err(ProgramError::IllegalOwner);
}
if profile.fee_mint != *mint_ai.key.as_ref() {
    return Err(ProgramError::InvalidAccountData); // fees were earned in another mint
}
let claimed = profile.accumulated_fees;
profile.accumulated_fees = 0;
// ... 借用スコープ終了 ...

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

認可（builder だけが自分の手数料を、\`fee_mint\` の vault からだけ claim できる）、アキュムレータをゼロ化、借用を解放、PDA 署名 Transfer。Transfer ヘルパは、第 11 章のポジションの払い出し(close と liquidate)に使う \`spl_token_transfer_vault_signed\` と構造的に同一 — 同じ \`invoke_signed\` パターン、同じ \`InvalidSeeds\` 保護 — 違いは seeds が per-(market) \`[VAULT_AUTH_SEED, market]\` ではなく per-(quote_mint) \`[FEE_VAULT_AUTH_SEED, quote_mint]\` という点だけ。順序が重要: Transfer **の前に** アキュムレータをゼロ化することで、(a) Transfer 失敗時の tx revert がアキュムレータを復元（アトミック）、(b) Transfer 成功時はまだ funded なアキュムレータに対するリプレイ攻撃を防ぐ。

本物の本番 claim は通常、部分引き出し（\`claim --amount N\`、常に全部ではなく）、蓄積子タイムアウト（>N 日アイドルな手数料はプロトコルに没収）、プロトコルが複数 quote 通貨をサポートするときの per-token claim もサポートする。どれも根本的な形を変えない。上に乗るポリシー判断だ。

\`CreateFeeVault\` は 1 回限りのブートストラップ。第 6 章の \`process_create_vault\` をそのままミラーする、2 つの違い: seeds が \`[b"vault", market, mint]\` / \`[b"vault_auth", market]\` ではなく \`[b"fee_vault", quote_mint]\` / \`[b"fee_vault_auth", quote_mint]\`、そして market ごとではなく quote 通貨ごとに 1 つだけ必要。ハンドラは標準的な 2-CPI ダンス — PDA 署名付き System \`create_account\`、その後 authority PDA を所有者に設定する SPL Token \`InitializeAccount3\` — を行い、place-order バリアント実行前に一度走らせる。

> **演習 §13.5.** \`process_claim_builder_fees\` を編集して、ペイロードに \`partial_amount: Option<u64>\` を受け入れるようにせよ。\`Some(n)\` なら \`min(n, accumulated_fees)\` を claim。\`None\` ならすべて claim。引き出せる総額が同じでも、部分引き出しパターンが builder に有用な理由は?

### §13.5b  本番エスクロー設計ノート — 実装の背後にある 4 つの選択

第 11 章と第 12 章はポジション担保と vault deposit に実際の SPL Token エスクローを 1 つずつのマッチング ヘルパで追加した。本章のエスクローは代わりに 4 つの設計選択を必要とした。なぜなら builder 手数料は、それらの章が必要とした二者間トークン移動とは**構造的に違う**エスクロー問題だからだ。\`process_place_order_checked\`、\`process_place_order_with_builder\`、\`process_claim_builder_fees\` の実装は 4 つすべてに形作られる。これらを理解することが、コードを恣意的な選択ではなく強制的な手筋の系列として読ませる鍵だ。

**1. 二者 vs 三者。** ポジション担保と vault deposit は二者間移動だ: ユーザ ↔ vault、片方が署名し、経済判断（いくら、誰の署名で）はすべて命令にエンコードされている。Builder 手数料は**三者分割**だ: ユーザは単一のプロトコル手数料を払い、そのうち一部がプロトコルへ、別の一部が builder へ行く。1 つのユーザ支払いを 2 つの受取人にアトミックに分割し、各々に正しい比率を credit するのは \`spl_token_transfer_user_signed\` と \`spl_token_transfer_vault_signed\` だけでは収まらない。実装は **fee-vault** トークン アカウント（quote mint ごとに 1 つ）を導入し、\`[b"fee_vault_auth", quote_mint]\` の PDA が所有する。すべての place-order バリアントが (a) ユーザのトークン アカウントから fee vault へ**全額**の \`protocol_fee\` を Transfer し、(b) （builder バリアントでは）builder のアキュムレータに \`builder_share\` を credit する。\`(protocol_fee - builder_share)\` 残余は fee vault にプロトコルの取り分として残る。

**2. \`PlaceOrderChecked\` 非対称性。** 手数料エスクローを \`PlaceOrderWithBuilder\` だけに追加するとねじれたインセンティブが生まれる: builder なしパスはトークン建て手数料を取らないので、builder 経由の取引は同じ取引より実質コストが高くなる。本章は *すべての* place-order バリアントにプロトコル手数料エスクローを入れて解決する — だから \`process_place_order_checked\` も \`PlaceOrderWithBuilder\` と同じ \`(market, mint, user_token, fee_vault_token, token_program)\` プレフィックスに育った。両バリアントが同じ手数料をエスクローし、builder バリアントは追加で builder share を credit する。本番デプロイがこの選択を初日にやるのは、非対称設計が一方向の移行罠だからだ — ユーザが特定のアカウント形に依存するトランザクションに署名し始めた後で、静かにスロットを追加することはできない。

**3. 複数 quote 対応。** 単一 quote 通貨（本章のケース）なら fee vault はクラスタごとに 1 アカウント、builder ごとのアキュムレータは単一 u64。複数 quote 通貨では、(quote_mint) ごとの fee vault *かつ* (builder, quote_mint) ごとのアキュムレータが必要 — \`BuilderProfile\` はマップ フィールドを持つ（Pod 適合しない）か、quote ごとに別 profile PDA に分かれる。§13.1 で単一 quote 制約を意図的だと述べた。ここがアーキテクチャ的に報酬を払う場所だ。注意: 選んだ PDA seeds（\`[b"fee_vault"]\` ではなく \`[b"fee_vault", quote_mint]\`）は既に per-mint vault をサポートしている。複数 quote 化で再構造化が必要なのは (builder, quote_mint) アキュムレータ側だけだ。

**4. Claim 側の authority。** Fee vault が揃えば、\`ClaimBuilderFees\` は fee vault authority PDA で署名された \`fee_vault\` → \`builder_token\` の PDA 署名 Transfer になる — §12.4 の \`VaultWithdraw\` と構造的に同一、同じ \`invoke_signed\` パターン、同じ \`InvalidSeeds\` 保護、違う seeds。これは常に、先行章がすでにやった作業の「機械的拡張」と呼べる部分だった。新しい \`spl_token_transfer_fee_vault_signed\` ヘルパとして per-(market) のいとこと隣接して着地する。

本章が教える仕組み — 取引とアトミックな accrual、別バッチ操作としての claim、二段キャップ安全性 — は 4 つの設計判断すべてを通じて変わらない。選択 1 と 2 が Transfer がどこに落ちるかを決め、選択 4 が claim がどう署名するかを決める。選択 3 は seeds を mint-scoped に保ったことで無料で得られる。

> **演習 §13.5b（設計）.** \`scripts/builder/src/main.rs\` の \`--place-with-builder\`、\`--claim\`、および第 12 章の元の \`--withdraw\`（\`scripts/vault/src/main.rs\`）の \`accounts: vec![...]\` 宣言を比較せよ。3 つの構造的類似と 3 つの構造的相違を識別せよ。各相違を上の 4 つの設計判断のどれかに紐付けよ。ヒント: seed-derivation パターンは同一、authority 側は同一、非対称性はアカウント数、signer の役割、PDA-derivation seeds にある。

---

## §13.6  まとめと自己検証

### まとめ図

\`\`\`
Builder ライフサイクル:

  0) クラスタ ブートストラップ（quote mint ごとに 1 回）
     CreateFeeVault(quote_mint)
     ──► [b"fee_vault", quote_mint] の fee_vault トークン アカウント
         [b"fee_vault_auth", quote_mint] PDA が所有


  1) Builder 登録
     RegisterBuilder(max_fee_share_bps=2000)
     accounts: [payer/builder(S,W), builder_profile(W), system_program(R),
                mint(R)]
     ──► BuilderProfile{ builder, max_share=2000, fees=0, vol=0,
                         fee_mint=mint }


  2) ユーザが builder 経由で取引
     PlaceOrderWithBuilder(side, price, size)
     accounts: [user(S,W), book(W), oracle(R), market(R), mint(R),
                user_token(W), fee_vault(W), token_program(R),
                builder_profile(W)]

       notional       = price × size
       protocol_fee   = notional × 10 / 10000    (PROTOCOL_FEE_BPS)
       share_bps      = min(profile.max, 5000)    (PROTOCOL キャップ)
       builder_share  = protocol_fee × share_bps / 10000

     アトミック:
       book に注文配置                            ─┐
       profile.accumulated_fees += builder_share   ├─ 同じ tx、同じ slot
       profile.total_volume     += size            │
       SPL Token Transfer:                         │
         user_token → fee_vault   protocol_fee     ─┘


  3) Builder が定期的に claim
     ClaimBuilderFees(empty)
     accounts: [builder(S), profile(W), mint(R), fee_vault(W),
                fee_vault_auth(R), builder_token(W), token_program(R)]
     ──► profile.accumulated_fees = 0
     ──► invoke_signed SPL Token Transfer:
           fee_vault → builder_token  (claim 額)
           signer seeds: [b"fee_vault_auth", quote_mint, &[bump]]


2 キャップ安全性:

  effective_share = min( builder.max_fee_share_bps
                       , PROTOCOL_BUILDER_SHARE_CAP_BPS
                       )

  ↑ builder が最大自己キャップにコミット（ユーザに見える）
  ↑ プロトコルがキャップのキャップにコミット（ハードコード / ガバナンス）

  プロトコル取り分のフロア = (10000 - 5000) × PROTOCOL_FEE_BPS / 10000
                          = notional の 5 bps、常に留保
\`\`\`

### 自分で検証する 3 項目

前提: quote mint の fee vault をブートストラップ（\`builder --create-fee-vault --mint <quote_mint>\`）し、トレーダが funded な quote-token アカウントを持つことを確認すること。さもなくば手数料 Transfer が revert する。

1. **キャップが正しく積み重なる。** \`--max-share-bps 9999 --mint <quote_mint>\` で builder を登録する。ハンドラはクランプをログし、ダンプは \`max_fee_share_bps = 5000\`（本書の \`PROTOCOL_BUILDER_SHARE_CAP_BPS\`）を示すはずだ。次に取引をその builder 経由でルートする — builder のシェアはちょうどプロトコル手数料の 50% のはずだ。
2. **失敗下でアトミシティが保たれる。** シミュレートされた失敗を使う: stale なオラクルで \`PlaceOrderWithBuilder\` を試す（注文配置が失敗する）。シミュレーションは \`oracle stale\` で失敗し、**かつ**失敗 sim 後、builder profile の \`accumulated_fees\` は不変、fee vault の残高は不変、トレーダの quote-token アカウントも不変のはずだ（トランザクション全体が revert するので）。取引が起きない限り分割は起きない。
3. **取引ごとに volume が蓄積する。** 同じ builder 経由で 5 つの注文をサイズ 10、20、30、40、50 で配置する。\`total_volume\` はちょうど 150 （10+20+30+40+50）のはずだ。\`accumulated_fees\` が \`(notional_total × PROTOCOL_FEE_BPS × share_bps / 10000 / 10000)\` に加算されないなら、数学に off-by-one がある — それを追いかけよ。その後 \`--claim --mint <fee_mint> --builder-token-account <pubkey>\` を走らせる(ダンプが \`fee_mint\` を表示する)。Builder の quote-token アカウント残高は \`accumulated_fees\` ぶんちょうど増え、ダンプは \`accumulated_fees = 0\` を示すはずだ。


### アカウントだけでなく、お金を道具に確かめさせる

第 3・6・12 章は、[solinv](https://github.com/psyto/solinv) にアカウントを差し替えさせて終わった。ここでの問いは違う。手数料の vault は、builder に払うべき額をいつも持っているか。第 6 章 §6.6 はこれを持ち越した。手数料の vault は全市場が共有する唯一のアカウントで、組には PDA ではない 2 つ目の市場がありうるからだ。

[\`fuzz/fees/\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/fees) がそのハーネスである。builder B と B2 は quote の mint Q で登録し、利用者 U はどちらかを通して取引する。市場は 3 つあり、それぞれに板と新しいオラクルがある。PDA にある \`(base, Q)\`、第 2 章の \`Initialize\` で PDA ではないアドレスに作った 2 つ目の \`(base, Q)\`、誰でも作れる mint J の \`(base, J)\` だ。いつもの signer-skip と account-swap に加えて、仕様は 2 つの規則を宣言する:

- **関係**(solinv の \`Relation\`。\`unchecked_math\` が確かめる): \`PlaceOrderWithBuilder\` と \`ClaimBuilderFees\` の両方で、B と B2 の profile の \`accumulated_fees\` の合計が Q の手数料の vault の残高以下。(関係が読めるよう、B2 の profile を各命令のアカウントの末尾に足してある。ハンドラはその余分なアカウントを読まない。)命令の前に成り立っていて、後で崩れたときだけ報告する。
- **ガード**(\`precondition_skip\` が確かめる): \`PlaceOrderWithBuilder\` が成功してよいのは \`profile.fee_mint == market.quote_mint\` のときだけ。solinv が比べるフィールドは 16 バイトまでなので、32 バイトの mint にはガードが 2 つ要る。

第 3 章 §3.7 のとおり準備してから:

\`\`\`bash
cargo build-sbf --manifest-path programs/openhl-core/Cargo.toml
cd fuzz/fees
cargo build --release --features invariant_ch13
cargo test --release --features invariant_ch13
timeout -s INT 60 crucible run openhl_fees_fuzz invariant_ch13 \\
    --binary-in target/release/invariant_test --timeout 45
\`\`\`

今のプログラムでは、3 つの市場のどれでも \`[FUZZ_FINDING]\` の行は出ない。これが、この章についての §6.6 の答えになる。\`accumulated_fees\` への加算はどれも、同じトランザクションが同じ mint で手数料の vault に移す \`protocol_fee\` の半分以下なので、2 つ目の市場でも(どの市場でも)、利用者が払った以上を builder に借りることはできない。テスト \`credit_never_exceeds_payment\` が両方の Q の市場でこれを確かめる。

> **演習 §13.6.** 下の検査を 1 つずつ消し(最後の 2 行はその変更を加え)、作り直して走らせよ。先に予想すること。私たちが各 45 秒で測った結果を示す。「いいえ」の行の最後の列は、差し替えた呼び出しを代わりに拒否したもので、ログから読んだ(\`probe\` テストが出力する):
>
> | 変更 | 捕まったか | どう捕まったか、または代わりに拒否したもの |
> |---|---|---|
> | Place: \`profile.fee_mint == mint\` | **はい** | precondition-skip: J の市場でガードが偽のまま注文が通った。\`junk_mint_order_does_not_credit_a_q_builder\` が落ちる |
> | Place: \`market.quote_mint == mint\` | いいえ | \`fee_mint\` の検査: Q の市場で J で払っても、指定する builder は Q で払われる B のまま |
> | Place: \`verify_fee_vault_token_account\` | いいえ | SPL Token: \`Account not associated with this Mint\` |
> | Place: \`user_ai.is_signer\` | いいえ | ランタイム: 権限のない署名者 |
> | Place: 板の PDA | **はい** | account-swap: 注文が別の市場の板に入った |
> | Place: オラクルの PDA | **はい** | account-swap: 価格の帯が別の市場のオラクルから来た |
> | Claim: \`profile.builder == builder\` | **はい** | account-swap: B が B2 の手数料を受け取った |
> | Claim: \`builder_ai.is_signer\` | **はい** | signer-skip: 誰でも B の手数料を、自分の指定する口座に受け取れた |
> | Claim: \`profile.fee_mint == mint\` | **はい**(組で) | account-swap \`check_sets\`: B の Q の手数料が J の vault から B の J の口座へ払われた(4 つの slot を一緒に) |
> | Claim: \`verify_fee_vault_token_account\` | いいえ | SPL Token: \`owner does not match\`(Q の vault の authority は J の vault に署名できない) |
> | Claim: \`accumulated_fees = 0\` を消す | **はい** | 関係、最初の claim で: 前は vault の 12,266 に対して借り 12,262、後は 6 に対して 12,262。\`claim_pays_once\` が落ちる |
> | Place: builder の取り分を \`protocol_fee\` でなく \`notional\` から計算 | **はい** | 関係: 最初の注文の前は借り 0 対 vault 0、後は 10 に対して 5,000 |
>
> 3 つのことを見直す価値がある。最後の 2 行は、検査の抜けではまったくない。どのアカウントも正しく、どの検査も通るのに、プログラムは持っている以上を約束する。それが見えるのは数についての規則だけで、それはこの章の原子性の議論(§13.4)が扱っている規則でもある。もう 1 つ、これは私たちのハーネスの罠だ。最初の版では B2 が \`setup()\` の中で手数料を得ていた。取り分を \`notional\` から計算すると、その準備の注文の時点で関係がもう崩れており、solinv は命令の前から偽の関係を検出ではなく宣言の問題として報告するので、この行は「いいえ」になっていた。今は fuzzer 自身の注文だけが builder に加算する。最後に、claim 側の \`fee_mint\` の行には、4 つのアカウントを一緒に差し替える必要があった。私たちの最初の組は 3 つを差し替え、送り先を B の Q の口座のままにしていたので、SPL Token が mint の不一致で拒否した。それは消した検査について何も語っていなかった。攻撃者は J の送り先を指定する。第 12 章と同じく、拒否は、どの検査が拒否したかが分かって初めて証拠になる。
>
> 1 つの差し替えはわざと外してある。\`PlaceOrderWithBuilder\` の slot 8 を別の builder の profile にすると通る。U が B ではなく B2 に加算する。それが設計だ。どのフロントエンドに加算するかは利用者が選び、どちらでも手数料は払う。

---

## 第 14 章への導線

本番デプロイが必要とするすべてのプリミティブを扱う perp DEX プログラムを持つようになった: アカウント、プログラム、PDA、CPI、コンピュート、並列性、vault、板、マッチャ、オラクル リーダ、ファンディング、ポジション、清算、プール取引 vault、builder code。**まだ持っていない**のは、それを走らせ続けるオフチェーン配管だ。

第 14 章 — Cranks、Keepers、オフチェーン グルー — が Phase B とトラックを閉じる。本プログラムが暗黙に要求するすべての keeper を歩く: ファンディング レート keeper（第 10 章の hook）、清算 bot（第 11 章の無許可 \`Liquidate\`）、vault NAV reporter（第 12 章の \`UpdateNAV\` cadence）、builder claim cron（第 13 章の蓄積子）、オラクル publisher（Pyth を使わず自前で走らせるなら第 9 章の \`SetOraclePrice\`）、マッチング エンジン cranker（非同期マッチングを組み立てていたら）、フロントエンドにフィードするオフチェーン インデクサ。章は新しいオンチェーン コードがゼロ — その内容はオフチェーン プロセスの設計パターン、手数料経済、冗長性とフェイルオーバー、「Solana DEX」がオンチェーン プログラム半分とコーディネートされたオフチェーン インフラ半分であるというアーキテクチャ上の現実だ。
`,
                },
                {
                  title: "第14章 — Cranks、Keepers、オフチェーン グルー",
                  slug: "solana-internals-ch14-cranks-keepers-ja",
                  type: 'CONTENT',
                  sortOrder: 8,
                  duration: 45,
                  xpReward: 100,
                  content: `# 第14章 — Cranks、Keepers、オフチェーン グルー

> 状態: ドラフト (v0.1)。
> 教材コード: なし。本章にオンチェーン追加はゼロ。内容は、13 章かけて組み立てたプログラムを取り囲むオフチェーン運用設計だ。

---

## §14.0  はじめに

Solana DEX プログラムは Solana DEX の半分だ。残りの半分は、オンチェーン プリミティブを正しい cadence で駆動し、結果の状態をユーザに浮かび上がらせる、調整されたオフチェーン プロセス群 — keeper、crank、indexer、監視 — だ。それなしには、美しく監査されたオンチェーン プログラムはユーザがトランザクションを起動するときに 1 回走り、その後アイドルに座る。ファンディングは蓄積しない。水没ポジションは清算されない。NAV は古びる。フロントエンドは数分前の最終既知状態を表示する。

本章では運用層を歩く。本プログラムが暗黙に要求するすべての keeper と crank を、それぞれ実装できるだけの詳細で。本章は意図的にオンチェーン コードが少なく（追加しない）、本番設計パターン — 失敗モード、冗長性、手数料経済、cadence 選択 — が長い。これらを怒りの中で走らせて初めて学べるパターンだ。

Keeper 6 つ、indexer 1 つ:

1. **ファンディング レート keeper** — 各 market で定期的に \`UpdateFunding\` を呼ぶ。レートを book mid + オラクル マークから計算する。
2. **清算 bot** — ポジションをスキャンし、水没ポジションを特定し、無許可 \`Liquidate\` 呼び出しを提出する。
3. **Vault NAV reporter** — 各 vault について、マネージャ（あるいはその代理）が定期的に \`UpdateNAV\` を呼ぶ。
4. **Builder claim cron** — 各 builder が定期的に \`ClaimBuilderFees\` で \`accumulated_fees\` を排出する。
5. **オラクル publisher** — Pyth ではなく自前オラクルを走らせるなら、これが \`SetOraclePrice\` で新鮮な価格を push するプロセス。
6. **メンテナンス keeper** — 細々と: 休眠アカウントの close、約定済み注文のアーカイブ、空板スロットのガベージ コレクト。
7. **Indexer** — keeper ではないが必須の読み手側サービス: チェーン状態を購読し、フロントエンド、分析、アラートに供給する。

本章は Phase B の主アークを閉じる。§14.7 の振り返りが 14 章で組み立てたものを総括する。第 15 章は別の付録スタイル章として続き、§8.4 が設計した slab 板を出荷する — Phase B プログラムはそれの有無に関わらず feature-complete だが、slab は本番グレード板で、直接比較のため第 7 章のフラット配列板の隣に住む。その後どこに行くかはあなた自身の選択だ — 本番デプロイ、監査準備、スケーリング実験、独自 perp DEX。ピースはあなたの手にある。

---

## §14.1  Keeper インベントリ

| Keeper | トリガ | Cadence | 認可 | ないと壊れること |
|---|---|---|---|---|
| ファンディング レート keeper | Market ごと | 1〜5 分 | 許可制 or クランプ付き無許可 | ファンディング蓄積が止まる。ロング/ショートが互いに支払わなくなる。マークが spot から漂流する |
| 清算 bot | ポジションごと | Slot ごと（sub-second スキャン） | 無許可 | 水没ポジションがオープンのまま。保険基金が最終的に枯渇する |
| Vault NAV reporter | Vault ごと | 1 分〜1 時間 | Vault マネージャのみ | Vault NAV が古びる。deposit/withdraw が誤った NAV で値付けされる |
| Builder claim cron | Builder ごと | 1 時間〜1 日 | Builder のみ | \`accumulated_fees\` が増える。u64 オーバーフロー（極めて稀）まで機能的影響なし |
| オラクル publisher | オラクルごと | Slot ごと | 許可された publisher リスト | オラクルが staleness 窓口を超えて老いる。\`PlaceOrderChecked\` / \`OpenPosition\` / \`Liquidate\` がすべて拒否し始める |
| メンテナンス keeper | プログラムごと | 日次か週次 | プログラム管理者 or 無許可 | 休眠データが蓄積する。スキップしても安いが、最終的にゴミの rent を払う |
| Indexer | プログラムごと | リアルタイム | なし（読み取り専用） | フロントエンドが古い状態を表示する。分析が壊れる。ユーザが盲目になる |

表から見えるパターン 2 つ:

**許可制 vs 無許可。** 清算者とオラクル publisher（時に）は無許可 — 誰でも呼べ、任意の単一 keeper の停止に対してプロトコルが頑健。Vault NAV reporter と builder claim cron は定義上許可制 — 特定のエンティティだけが自分の状態に対して行動できる。ファンディング keeper は厳格さの度合いに応じて間に落ちる。

**Cadence vs レイテンシ許容度。** 清算者は sub-second でスキャンしなければならない、清算競争が速度に報いるから。25 slot（10 秒）古いオラクルは許容できる。Vault NAV は戦略のボラティリティに応じて分か時間の範囲。Builder claim は日待てる。誤った cadence を選ぶのが最も頻出の運用ミスの 1 つ — 攻撃的すぎれば手数料を浪費、怠慢すぎれば価値を出血させる。

---

## §14.2  ファンディング レート keeper

第 10 章 §10.5 はファンディング keeper を疑似 Python でスケッチした。本物のバージョンは 3 次元でより複雑だ: レートをどう計算するか、自身のダウンタイムをどう扱うか、複数 keeper をどう調整するか。

**レート計算。** 素朴な keeper は単に book mid とオラクル マークをサンプリングする:

\`\`\`python
def compute_rate(market):
    mark = read_oracle_mark(market)         # ch.9
    bid, ask = read_top_of_book(market)     # ch.7
    mid = (bid + ask) / 2
    premium = (mid - mark) / mark
    return clamp(premium * K, -MAX_RATE, +MAX_RATE)
\`\`\`

形は正しいが実務上 fragile。改善 2 つ:

1. **直近数分の book mid を TWAP する**、瞬時のスプレッドではなく。単一の transient な quote-stuffing 幅広スプレッドに基づいて funding を提出する keeper は、ユーザの equity を意味あるように動かすナンセンス レートを生みうる。本番 keeper は数秒ごとにサンプリングし 1〜5 分にわたって TWAP する。

2. **更新ごとの変化に上限。** 前のレートが 0.0001/sec で現行プレミアムが 0.001/sec を含意しても、1 更新で跳ねさせない — レート変化を更新あたり（例えば）50% にクランプする。これは制御系の意味でのレート制限。単一 keeper 呼び出しの暴走フィードバック ループ災害から守る。

本物の keeper 構造:

\`\`\`python
class FundingKeeper:
    def __init__(self, market, program, signer):
        self.market = market
        self.program = program
        self.signer = signer
        self.history = collections.deque(maxlen=300)  # 1Hz で 5 min

    def tick(self):
        # 1. サンプル
        mark = read_oracle_mark(self.market)
        if mark is None:                # オラクル stale; この tick をスキップ
            return
        bid, ask = read_top_of_book(self.market)
        if bid is None or ask is None:  # 空板; スキップ
            return
        self.history.append((time.time(), mark, bid, ask))

        # 2. 計算 (history で TWAP)
        if len(self.history) < 60:      # 最低 1 min 必要
            return
        avg_mid = mean((b+a)/2 for _, _, b, a in self.history)
        avg_mark = mean(m for _, m, _, _ in self.history)
        premium = (avg_mid - avg_mark) / avg_mark
        target_rate = clamp(premium * K, -MAX, +MAX)

        # 3. 更新ごとの delta をクランプ
        last_rate = read_current_funding_rate(self.market)
        delta_cap = abs(last_rate) * 0.5 + MIN_DELTA
        new_rate = clamp(target_rate, last_rate - delta_cap, last_rate + delta_cap)

        # 4. 提出
        send_tx(UpdateFunding(new_rate), self.market, self.signer)

    def run(self):
        while True:
            self.tick()
            time.sleep(1)
\`\`\`

**Keeper のダウンタイム。** Keeper がクラッシュしたら何が起きるか。オラクルの \`MAX_ORACLE_STALENESS_SLOTS\` が 25 slot（約 10 秒）でも、ファンディング keeper が 1 時間ダウンすれば、60 分前に設定されたファンディング レートが 60 分間適用され続ける。ロング/ショートはもう存在しない条件で設定されたレートでファンディングを支払う。

防御 2 つ:

- **Keeper にハートビート。** 運用監視（Grafana、PagerDuty）が N 分提出がなければ数分以内にアラートする。
- **オンチェーン ハンドラで最大経過時間を境界付ける。** \`clock.unix_timestamp - last_update_ts > MAX_FUNDING_ELAPSED_SECONDS\` なら \`UpdateFunding\` を拒否するチェックを加える。そういう場合、keeper か multisig が「reset」命令を先に呼ぶ。これは「静かに失敗するより大声で失敗する」パターン — keeper が回復した後に 1 年前のファンディングを適用するより、market を短時間壊すほうがましだ。

**複数 keeper。** ファンディング レート更新は**最後の**呼び出しのレートが適用されるという意味で冪等だが、同じ分内の複数呼び出しが大丈夫という意味では冪等ではない — それぞれが CU コストを加え、異なるレートを生む可能性がある。調整パターン:

- **単一 keeper、単一真理源。** 最も単純。1 プロセス、1 VPS、1 アラート。
- **Hot-standby。** Keeper 2 つ、1 つアクティブ。スタンバイは primary が N 分提出していないことを検出したら自分を昇格させる。Lock アカウント or オフチェーン リーダー選出で調整する。
- **クランプ付き無許可。** 誰でも \`UpdateFunding\` を呼べる。プログラムのクランプが griefing を防ぐ。複数 keeper が競争し、最初の 1 つが勝ち、2 つ目の tx は無害に失敗する（提出時にはレート読みがすでに古い）。一部の perp DEX が使う。

本章は permission を完全にオープンで出荷する（§10.3 — open-auth \`process_update_funding\` はテスタビリティのため意図的）。本番はオペレータの好みに基づいて上の 3 パターンから選ぶ。

---

## §14.3  清算 bot

第 11 章の \`Liquidate\` は無許可: 誰でも任意の水没ポジションに対して清算 tx を提出できる。経済が速度に報いる — 最初の清算者がペナルティを獲得するので、清算 bot はスキャン レイテンシと tx 提出速度で激しく競う。

清算者のループは構造的に単純だが運用上厳しい:

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

この innocent なループに隠れた運用問題 3 つ:

**スキャン レイテンシ。** 数千のポジション アカウントにわたる \`scan_all_positions()\` は安くない。RPC ベース \`getProgramAccounts(programId, filter: discriminator)\` は遅く（数百 ms から秒）、リアルタイムではない。本番清算者は Geyser プラグインや RPC pubsub を使ってリアルタイムでポジション アカウント更新を受け取り、各オラクル/ファンディング tick で health を再計算する全ポジションのインメモリ ミラーを保つ。

**競合条件。** 複数の bot が同じ清算可能ポジションを見る。最初に tx をランディングした 1 つが勝つ。残りは失敗 tx の手数料を払う（オンチェーン \`Liquidate\` はすでにクローズされたポジションを拒否する）。Bot が競う方法:

- **事前構築 tx。** ポジションが閾値を割った瞬間に \`Liquidate\` tx を構築する。提出時に新鮮な blockhash と署名だけを取る。ミリ秒節約。
- **Jito 経由か直接リーダー RPC への提出。** Public RPC には計測可能な遅延がある。専門インフラがそれを削る。
- **Priority fee。** 競合 slot で最初にランドするため追加で支払う。利益を残したまま最高 priority fee を払う清算者が勝つ。

**収益性。** 清算は \`notional × LIQUIDATION_PENALTY_BPS / 10000 = notional × 0.01\`（第 11 章の値）を支払う。清算者は収益 > (tx コスト + RPC コスト + インフラ コスト + bot 運営に縛られる資本の機会コスト) を必要とする。$0.001 / Solana tx で、$1000 notional ポジションの清算成功は $10 を支払う — 楽に収益性。$10 notional ポジションは $0.10 を支払い、ほとんどの運用閾値以下 — 小さな水没ポジションは競争が少なくなり、水没のままより長く座り、（担保がすでにゼロなら）清算するのは正味マイナスだ。本番設計は時にこれを避けるためポジションあたり最小サイズを加える。

現代の Solana 清算者アーキテクチャ:

\`\`\`
   バリデータ Geyser プラグイン / RPC pubsub
              │
              ▼
   ローカル ポジション ミラー (インメモリ)
              │
              ▼
   Health コンピューター (オラクル/ファンディング更新でトリガ)
              │
              ▼
   清算候補キュー (期待収益でソート)
              │
              ▼
   Tx ビルダ + 提出者 (Jito MEV searcher か直接リーダー RPC)
\`\`\`

複数の競合清算者が本質的に同一のスタックを走らせる。差別化はレイテンシ、priority fee チューニング、小さなアルゴリズム的優位性（例: 次のオラクル tick でどのポジションが清算可能になるかを予測し、それらの tx を事前構築する）にある。

---

## §14.4  Vault NAV reporter

第 12 章の \`UpdateNAV\` はマネージャのみで信用される。Keeper はだからマネージャが走らせるプロセス、正しくすべき点が 2 つ: cadence と精度。

**Cadence。** 頻繁すぎると預金者が noise で跳ねる NAV を見る（マネージャは実際にはポジションを変えていないが、根底のオラクルが動いたから keeper が更新する）。怠慢すぎると deposit/withdraw が数分古い NAV で値付けされ、遅いムーバーに価格変動の無料オプションを与える。

典型的パターン:

- **高頻度 vault (HFT、market making):** 毎分。Cadence が deposit/withdraw タイミング arbitrage を無視できる程度にリアルタイム近似する。
- **中頻度 vault (トレンド フォロー、モメンタム):** 5〜15 分ごと。マネージャのポジションが実際に変わるのに十分。
- **低速 vault (yield アグリゲータ、basis 取引):** 1 時間ごと or epoch 境界ごと。

微妙な設計選択: keeper は**意味ある変化があるときだけ** NAV を更新すべきか、常に更新すべきか。「常に」は預金者に予測可能な cadence と「はい、マネージャはまだ報告している」の可視性を与える。「意味あるときだけ」は tx 手数料を節約する。ほとんどの本番 vault はハイブリッドを選ぶ: 少なくとも N 時間に 1 回は更新する（heartbeat）、変化が閾値を超えたらより早く更新する。

**精度。** マネージャはオフチェーンで NAV を計算する — vault のオープン ポジション equity の合計（第 11 章の \`compute_equity\` を使う）、加に現金担保、減に保留中の手数料。この計算は、同じ入力を与えられたときオンチェーン ハンドラが計算するものと一致しなければならない。さもなければ預金者は報告された NAV と実際に受け取るものの間にドリフトを見る。

リスク領域 3 つ:

- **ファンディング蓄積ドリフト。** 最後の NAV レポート以降 \`UpdateFunding\` が呼ばれていないなら、ポジションのファンディング PnL は古い指数に対して計算される。本番 keeper は \`UpdateNAV\` を呼ぶ**前に**該当 market の \`UpdateFunding\` を呼び、NAV が蓄積ファンディングを正確に反映するようにする。
- **オラクル staleness ドリフト。** オラクルが更新されていないなら、\`compute_equity\` で使うマークが古い。同じ修正: NAV 更新前にオラクルを refresh する。
- **未実現 vs 実現。** オープン ポジションを持つ vault には未実現 PnL があり、マーク価格に依存する。大部分をクローズした vault には現金に座る実現 PnL がある。Keeper は両方を正しく計算し、部分クローズを二重カウントしてはならない。

ここが本番でしばしばマネージャが keeper を**外注**する部分（Squads マルチシグ + 自動 NAV スクリプト、あるいは Lulo や Kamino の vault SDK のような vault 管理プラットフォーム）。自分でやるには運用信頼性問題を所有することが必要だ — keeper 停止 = 古い NAV = 不幸な預金者。

---

## §14.5  Builder claim cron

最も単純な keeper。Builder の \`accumulated_fees\` は \`ClaimBuilderFees\` を呼ぶまで単調増加する。Keeper は cron ジョブだ:

\`\`\`python
def claim_loop():
    while True:
        profile = read_builder_profile(my_pubkey)
        if profile.accumulated_fees >= CLAIM_THRESHOLD:
            send_tx(ClaimBuilderFees(), my_pubkey)
        time.sleep(CLAIM_CHECK_INTERVAL)
\`\`\`

パラメータ 2 つとボイラープレート 1 つ。

**\`CLAIM_THRESHOLD\`。** 各手数料が小さくても、すべての手数料を claim するな。Claim tx は Solana 手数料で約 $0.001 かかる。蓄積手数料が $0.005 なら、20% を claim に吹き飛ばしたことになる。閾値を claim コストが claim 額の数 % 未満になるよう十分高く設定 — 通常、数ドル相当の蓄積手数料。

**\`CLAIM_CHECK_INTERVAL\`。** 毎時で寛大。Claim に緊急性はない — 手数料は盗まれず、インフレで蝕まれず（インフレなし。すべて u64 quote 単位）、ただ座る。一部の builder は毎日 claim、他は毎週、他は毎月。

**ボイラープレート。** 詰まった claim ジョブ（例: ウォレットが tx 手数料用 SOL を切らした）が黙って手数料を永遠に蓄積させないよう監視を設定する。運用上は些細だが忘れやすい。

これがシステムで最も低リスクな keeper。完全性のため言及するのが第一だが、操作上の運用が新しいなら最初に書く良い keeper でもある、失敗モード（claim されない数ドル）が穏やかだから。

---

## §14.6  オフチェーン indexer

厳密には keeper ではないが必須。Indexer はチェーン状態を購読し、処理し、結果をフロントエンド、分析ツール、アラートに公開する。

アーキテクチャ選択 3 つ。

**(1) Geyser プラグイン。** Geyser は Solana のバリデータ側ストリーミング インターフェース。Geyser プラグインはバリデータ内部で走り、すべてのアカウント変更、トランザクション、slot イベントをリアルタイム、チェーン commit から sub-millisecond レイテンシで受け取る。利点: 最低レイテンシ、完全なデータ。欠点: 自前バリデータを走らせる必要（あるいはプラグインを走らせるノード オペレータと提携する）、運用の複雑さ、ハードウェア コスト。

大型 DEX の本番 indexer はほぼ常に Geyser を使う。Helius、Triton、その他 Solana-RPC プロバイダがバリデータ運用負担を避けるため Geyser-as-a-service を提供している。

**(2) RPC pubsub。** WebSocket ベース RPC pubsub インターフェース（\`accountSubscribe\`、\`programSubscribe\`、\`logsSubscribe\`）でアカウント変更を購読する。利点: セットアップ簡単、WebSocket クライアント以外のインフラ不要。欠点: レイテンシが高い（数百 ms）、接続が落ちる、再接続中に一部のイベントが取り逃される可能性がある。

中リスク ユース ケースには良い: 数秒ごとにユーザ向け状態を更新するフロントエンド、日次ボリュームを計算する分析サービス。高頻度用途（清算 bot、市場メイク bot）には不十分。

**(3) RPC polling。** ループ内の \`getProgramAccounts\` + \`getTransaction\`。Pubsub が選択肢でないときのフォールバック（開発、デバッグ、単純な bot）。利点: 最大限単純。欠点: 高レイテンシ、RPC 呼び出しコスト高、多くのアカウントで悪くスケールする。

このプログラム向けの典型的本番アーキテクチャ:

\`\`\`
   Geyser ストリーム (アカウント変更 + tx ログ)
        │
        ▼
   イベント ディスパッチャ (プログラム ID、アカウント discriminator で ルート)
        │
        ├─► ポジション ミラー (清算 bot 用)
        │
        ├─► Vault NAV キャッシュ (フロントエンド用)
        │
        ├─► 取引履歴 DB (分析用)
        │
        ├─► アラート エンジン (オラクル staleness、vault NAV staleness、
        │                       builder 手数料蓄積、...)
        │
        └─► WebSocket fan-out (ユーザ イベントを購読するフロントエンド用)
\`\`\`

Indexer はオフチェーン スタックの肝心なピースだ — 上記のすべての keeper が暗黙にチェーンに対する高速で正しい状態クエリを持つことに依存し、indexer がそれを提供する。

オンチェーンではなくオフチェーンで計算すべきもの（第 5 章のレッスン、indexer 特化で言い直し）:

- **market ごとの取引総ボリューム。** オフチェーン。tx ログから計算が安い。
- **総建玉 (open interest)。** オフチェーン。すべての Position アカウントの notional の合計。
- **market ごとの活動、top-of-book 履歴、約定価格テープ。** オフチェーン。
- **share あたり NAV、vault の歴史的 PnL。** オフチェーン。\`UpdateNAV\` ログ イベントから計算。
- **Builder ボリューム ランキング。** オフチェーン。BuilderProfile 読みから。

オンチェーン プログラムは自分の不変条件を強制するために必要なものだけを保持する。あるとよいが信用境界の一部でないものはすべて indexer に住む。

---

## §14.7  まとめ — 組み立てたもの、それで何をするか

14 章をかけて組み立てたもの:

**Phase A (基礎、ch.1–5):** アカウント モデル、ネイティブ プログラム、PDA、コンピュート バジェット、Sealevel 並列性。それ自体で立つ完全な「Solana from scratch、Anchor なし」カリキュラム — Phase A を終えた学習者は、フレームワークに一度も触れずに本物の Solana プログラムを書き、本物の Solana プログラムをデバッグできる。

**Phase B (HL プリミティブ、ch.6–14、加えて ch.15 付録):** CPI 経由の SPL Token vault、オンチェーン板（ch.7 のフラット配列 + ch.15 の slab）、マッチング エンジン、オラクル統合、ファンディング レート蓄積子、清算付きポジション ライフサイクル、プール取引 vault、builder code、保険基金、結果を走らせるオフチェーン インフラ。動く — スコープが繰り延べられているが — perp DEX、すべての設計選択が注釈付きで、何が繰り延べされたかについての正直なメモが章に書き込まれている。

明示的に繰り延べたもの（だから後で見つけやすい）:

- **自前ホスト型 Wormhole スタイル オラクル receiver。** Ch.9 §9.5 は Pyth v1（\`PlaceOrderCheckedPyth\`）と Pyth v2（\`PlaceOrderCheckedPythV2\`、Pyth の receiver プログラムが生成する \`PriceUpdateV2\` アカウントを読む）両方のコンシューマ リーダーを出荷する。真に未解決なのは receiver*である*こと — 保存された guardian set に対する Wormhole VAA 署名検証、bundled updates の Merkle proof 検証、自前の price-cache PDA への書き込み。Pyth receiver がデプロイされていないチェーンから updates を消費したい場合、または追加メッセージ型を検証したい場合にのみ必要。独自章。

本物の本番デプロイのために追加するもの:

- 監査。最低 3 ヶ月のセキュリティ レビュー。
- 本章が参照したすべての定数（margin BPS、fee BPS、cap）に multisig 管理者権限。
- 現在プログラム全体でグローバルな定数に market ごとの設定。
- プロジェクトが管理者制御ではなくコミュニティ制御を意図しているならガバナンス プログラム。
- 監視、アラート、ランブック付きの本章の完全 keeper スタック。
- フロントエンドと indexer。
- 法務レビュー（どの管轄が運営、上場、ユーザになれるか）。

カリキュラムで何をするか:

- **使う。** 教材コードは MIT ライセンス。Fork し、デプロイし、拡張する。教育的バリアント（Bench、Stats）を落として実際のプリミティブを出荷する。
- **教える。** 章は SolDojo internals トラックのために設計された。ワークショップを走らせ、コースを組み立て、後続を書く。教育的フレームワーク（検証済み章フォーマット、明示的な正直なメモ付き意図的スコープ繰り延べ、2 言語カバレッジ）は他の Solana 主題にも一般化する。
- **批判する。** どの章も別の設計者なら違うように作る設計選択を持つ。独自バージョンを組み立て、自分の divergence を反カリキュラムとして書き上げる。

ピースはあなたの手にある。

---

## ここにないもの（意図的に）

これは閉じる章であって、ロードマップではない。書かなかったもの:

- 「次に読むもの」リーディング リスト。Phase A と Phase B の章は関連する場所で Solana ドキュメント、Pyth ドキュメント、ソース コードを引用する。それが正典的な追加リーディングだ。
- 特定の Solana エコシステム方向への売り込み。チェーンがここからどこに行くかは、そこに組み立てている人々が決めること。本トラックは strategy ではなく substrate を教える。
- 「ありがとう」や「また次回」。カリキュラムの終わりは読み手のもので、書き手のものではない。この 14 章から何かを得たなら、次にあなたがやる価値あることは何かを出荷することだ。行け。
`,
                },
                {
                  title: "第15章 — Slab 板",
                  slug: "solana-internals-ch15-slab-ja",
                  type: 'CONTENT',
                  sortOrder: 9,
                  duration: 45,
                  xpReward: 100,
                  content: `# 第15章 — Slab 板

> 状態: ドラフト (v0.1)。
> 教材コード: [\`crates/state/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/state/src/lib.rs)（\`Slab\`、\`OrderNode\`、\`CritbitTree\`、\`TreeNode\`）、[\`programs/openhl-core/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/programs/openhl-core/src/lib.rs)（slab ヘルパ + \`process_create_slab\`、\`process_slab_place_order\`、\`process_slab_match\`）、[\`scripts/slab/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/scripts/slab/src/main.rs)、[\`fuzz/slab/src/main.rs\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/slab/src/main.rs)（§15.6〜15.7 の solinv ハーネス）。
>
> 部品化に伴い、この章で読むロジックは [\`crates/slab/src/lib.rs\`](https://github.com/psyto/openhl-solana/blob/main/crates/slab/src/lib.rs)(\`openhl-slab\`)に移り、プログラムはそれを呼び出す。以下に引用するコードは分割前の \`programs/openhl-core/src/lib.rs\` の版で、行番号は追従していない。

---

## §15.0  はじめに — slab が何を買い、なぜ独立章に値するか

第 7 章はフラット配列の \`OrderBook\` を出荷した — 32 スロット、insert で空きスロットを線形スキャン、\`Match\` で価格マッチを線形スキャン。第 8 章はコストを測った: \`K = 10\` の fill ループで \`N = 32\` の板に対して概ね \`O(K × N)\` を走り、settlement の前に板の簿記だけで約 22 KCU を費やす(測り直した値。§8.2)。これは**教育用のベースラインとして**機能する。本番の板としては機能しない — どんな現実的な深さでもスキャンが支配する。

Hyperliquid と Serum / Phoenix の答えは **slab** だ: 価格水準の上の木で(ここでは critbit。自己平衡はしない。深さは価格のビットに従い、価格がばらけていれば約 log₂ N、maker が敵対的に選べば 64 まで。§15.7)、各葉がその価格水準のオーダの FIFO を持つ。Insert は価格水準ごとに O(log N)。Best-price は O(log N) — 求める側に向かって root から歩く。Best を pop するのは最悪 O(log N)（水準が空になり葉を木から削除する必要がある場合。葉の上の inner が冗長になり、葉と一緒に折りたたまれる）。§8.4 の擬似コードがこの章を約束した。これがそれだ。

本章は第 7 章の \`CreateOrderBook\` / \`PlaceOrder\` / \`Match\` に並列な、3 つの新しい命令を出荷する:

1. **\`CreateSlab\`**（タグ 29）— クライアントが同じトランザクションで作った \`Slab\` アカウントを初期化し、OrderNode プールの free list と両 critbit 木の free list を初期化する。
2. **\`SlabPlaceOrder\`**（タグ 30）— \`PlaceOrder\` と同じペイロード。critbit insert を走らせ、プールから OrderNode をアロケートし、その価格水準の FIFO につなげる。
3. **\`SlabMatch\`**（タグ 31）— \`Match\` と同じペイロード（taker side + limit price + size + max_fills cap）。maker 側の best 葉を歩き、その FIFO 先頭に当てて埋め、空になった水準を取り除き、§8.3 のページング cap を適用する。

フラット配列の \`OrderBook\` と slab の \`Slab\` はプログラム内で共存する。異なる market が異なる板を選べる; 既存の market は乱されない。本章は**新しい**パスについての章だ。

本章が**ない**もの 3 つ:

- **Match エンジン外科手術の章ではない。** slab の \`SlabMatch\` は第 8 章と同じ fill-loop の形を走る — 変わったのは maker 側にどう到達するか（O(N) でなく O(log N)）だけで、fill がどう会計されるかは変わらない。Settlement、手数料、builder split — どれもここには住まない。
- **すべての critbit バリアントのガイドではない。** Serum の slab は葉と inner を識別子ビット付きで同じノードプールにパックする; Phoenix はわずかに違うレイアウトを per-level FIFO 会計構造で使う。本章は §8.4 の分割 — OrderNode プール 1 つ、TreeNode プール side ごとに 1 つ — に従う。それが教育的議論を最もクリーンに保つからだ。他のレイアウトはヘッダの数百バイトとアクセスのわずかな高速化を取引する。
- **完全なベンチマークではない。** §15.6 に、このプログラムで許される大きさでの両方の板の実測値を載せた。本番の深さや settlement の CPI を含めた調査はフォローアップに属する。

---

## §15.1  4 つのアカウント型

\`crates/state/src/lib.rs\` から:

\`\`\`rust
pub struct OrderNode {                          // 64 バイト
    pub order_id: u64,
    pub owner: [u8; 32],
    pub size: u64,
    pub next: u16,        // FIFO 内次（または free list 内次）
    pub prev: u16,
    pub _pad: [u8; 12],
}

pub struct TreeNode {                           // 32 バイト — タグ付き union
    pub tag: u8,          // 0 FREE、1 INNER、2 LEAF
    pub split_bit: u8,    // INNER のみ
    pub next_free: u16,   // FREE のみ
    pub left_child: u16,  // INNER のみ
    pub right_child: u16, // INNER のみ
    pub head_node: u16,   // LEAF のみ（FIFO 先頭 order_node idx）
    pub tail_node: u16,   // LEAF のみ
    pub order_count: u32, // LEAF のみ（観測性）
    pub price: u64,       // LEAF のみ
    pub _pad: [u8; 8],
}

pub struct CritbitTree {                        // 8 + 256 × 32 = 8208 バイト
    pub root: u16,                              // 空なら SLAB_NONE_INDEX
    pub free_head: u16,
    pub _pad: [u8; 4],
    pub nodes: [TreeNode; SLAB_TREE_CAPACITY],  // SLAB_TREE_CAPACITY = 256
}

pub struct Slab {                               // 計 ~82 KiB
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

吸収すべき設計選択 5 つ:

**1. すべて \`u16\`、\`Option<u16>\` は使わない。** Pod 安全性のため。Sentinel \`SLAB_NONE_INDEX = u16::MAX\` が「インデックスなし」の代わりに立つ。Free-list 終端、空木の root、宙ぶらりんの FIFO 端、すべてこれを使う。\`u16\` で 65,535 エントリまでアドレス可能 — \`SLAB_POOL_CAPACITY = 1024\` は十分その範囲内。

**2. \`tag\` バイトでタグ付き union、enum は使わない。** \`TreeNode\` は原理的には Rust の enum（\`Free\`、\`Inner { ... }\`、\`Leaf { ... }\`）にできる。できない理由は enum が \`Pod\` でないからだ。だからどのバリアントが必要としうるすべてのフィールドを並べ、\`tag\` バイトがどのフィールドを読むかを消費者に告げる。使われないフィールドはゼロまたは \`SLAB_NONE_INDEX\` を保持する。規律のトレードは本物だ — 新たに free された node に古い \`head_node\` が残っているのは潜在バグ — だが zero-copy bytemuck アクセスでレイアウトは報われる。

**3. slab ごとに 2 つの木、1 つではなく。** Bid と ask の木は構造的に同一; 違いは「best price」歩行方向（max vs min）だけ。分けて保つことで、bid 側 insert が ask 状態を辿ることはなく、逆もない。これは Sealevel スタイルの並列性で効く: bid だけ動く market が共通 root を持つなら ask 木も書き、独立でありえたものを直列化してしまう。

**4. 共有 OrderNode プール 1 つ。** \`Slab.nodes\` は単一配列。両方の木が同じプールから FIFO を引く。代替（side ごとプール）なら同じトータルフットプリントで side ごと OrderNode 容量が倍だが、片側だけの板（片方向の動きで bids ほぼ全部のとき）が片方のプールを枯渇させ他方が空のまま、ということになる。共有することで非対称フローでも slab を使えるように保つ。

**5. アカウントサイズ = ~82 KiB。** 計算: \`64 (ヘッダ) + 2 × 8208 (木) + 1024 × 64 (プール) = 82_064\` バイト。これはプログラムの中からアカウントに与えられる 10 KiB(\`MAX_PERMITTED_DATA_INCREASE\`)を大きく超える。CPI で出した \`create_account\` はこの上限に縛られ、\`MAX_PERMITTED_DATA_LENGTH = 10 MiB\` まで確保できるのはトップレベルの命令だけ。だからプログラムは slab を自分で確保できない。クライアントがトランザクションの 1 つ目の命令で \`SystemProgram::CreateAccount\`(space \`Slab::LEN\`、owner は openhl-core)を送り、2 つ目の \`CreateSlab\` は初期化だけを行う。OpenBook や Phoenix と同じ分け方。このため slab は PDA ではなく keypair のアカウントになる。その結果、1 つの market に slab をいくつでも作れ、\`SlabPlaceOrder\` と \`SlabMatch\` は market を受け取らず \`slab.market\` も確かめない。slab には決済の経路がないので、今は「クライアントがどの板を読むか」だけの問題だが、本番では market の状態に公式の slab のアドレスを記録して照合する。Rent は作る人がブートストラップで払う 1 回限りのコスト。

> **演習 §15.1.** 構造体レイアウトから正確な \`Slab::LEN\` を計算せよ（コメントを信用するな）。\`bytemuck::bytes_of(&Slab::zeroed()).len()\` で検証せよ。次に、\`lamports_per_byte_year = 3_480\` と \`years = 2\`（Solana の 2 年 rent 免除）で rent をランポートで計算せよ。それが概ね \`CreateSlab\` が請求するもの。

---

## §15.2  プールと free list

\`Slab.nodes\` は 1024 OrderNode のフラット配列。任意の瞬間、ある node は「ライブ」（ある価格水準の FIFO の一部）、ある node は「free」（アロケーション待ち）。Free node は \`next\` フィールド経由で片方向リンクのスタックを成し、\`Slab.pool_free_head\` がスタックの先頭。アロケーションは \`pool_free_head\` を pop、デアロケーションは push する。

\`programs/openhl-core/src/lib.rs\` から:

\`\`\`rust
fn slab_init_pool(slab: &mut Slab) {
    for i in 0..SLAB_POOL_CAPACITY {
        slab.nodes[i].next = if i + 1 < SLAB_POOL_CAPACITY {
            (i as u16) + 1
        } else {
            SLAB_NONE_INDEX
        };
        // ... 他のフィールドをゼロに ...
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
    // ... 他のフィールドをゼロに ...
    slab.pool_free_head = idx;
}
\`\`\`

3 つフラグすべき細部。

**Init は配列を 1 度歩く。** ブートストラップで \`O(N)\`（~1k イテレーション）。そのコストは slab ごとに 1 回走る \`CreateSlab\` で払う。以後すべての op は O(log N) か O(1)。

**Free 時にフィールドをゼロに保つ。** Node を free する際、リストに push するだけでなく \`size\`、\`order_id\`、\`owner\` をクリアする。コストは小さい（数個のストア）が、古い \`owner\` フィールドが将来のアロケーションに誤って漏れることを防げる。同じメモリを多くのオーダ寿命で再利用するから重要。

**失敗は \`AccountDataTooSmall\`。** プール枯渇時はエラーを返し、既存 node を上書きしない。\`1024 nodes\` は単一 market に大きい数だ。当たったら答えは (a) 古いオーダを batch cancel してノードを free するか、(b) より大きな \`Slab\` バリアントを出荷するかだ。本章は保守的な答えを出荷する。

2 つの per-tree プール（\`bid_tree.nodes\` と \`ask_tree.nodes\`、両方とも \`[TreeNode; 256]\`）は同じく動く。\`tree_init\` は各々を 1 度歩く; \`tree_alloc\` と \`tree_free\` は同じ pop/push パターンを \`next_free\` フィールド経由で従う。

> **演習 §15.2.** Free list を歩いてカウントする \`available_count(slab) -> u32\` ヘルパを実装せよ。Insert + cancel のシーケンスの前後でそれを走らせる; 不変条件 \`live + free == SLAB_POOL_CAPACITY\` が成立すべし。Free-list 破損（同じ node が 2 度リストに現れる、あるいはサイクル）は slab バグの最も難しい 1 クラス — \`available_count\` の instrumentation はそれを捕捉する最も安い方法だ。

---

## §15.3  Critbit insert

Critbit アルゴリズムは、各 inner node がキーの 1 つの特定のビットをテストする木を歩く。深い inner node でテストされるビットはより**下位**のもの — より上位のビットは root に近いところで決められる。

**\`price\` のための葉を見つけるか作る。** \`critbit_find_or_create_leaf\` から:

\`\`\`rust
// (1) 空木 → root 葉を作る。
if tree.root == SLAB_NONE_INDEX {
    let leaf_idx = tree_alloc(tree)?;
    tree.nodes[leaf_idx] = TreeNode { tag: LEAF, price, ... };
    tree.root = leaf_idx;
    return Ok((leaf_idx, true));
}

// (2) 価格を比較するためどれか葉まで歩く。
let found_leaf = critbit_walk_to_leaf(tree, price);  // (price >> split_bit) & 1 で降りる
let found_price = tree.nodes[found_leaf].price;
if found_price == price {
    return Ok((found_leaf, false));  // 既存水準
}

// (3) 新価格 — 新 inner + 新葉を継ぎ込む。
let diff = price ^ found_price;
let shared_bit = 63 - diff.leading_zeros() as u8;  // 価格が違う最上位ビット

// Root から再び歩き、継ぎ込みポイントを探す。
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

// (4) 新葉 + 新 inner をアロケート; 新 inner は \`shared_bit\` で分割。
let new_leaf_idx = tree_alloc(tree)?;
tree.nodes[new_leaf_idx] = TreeNode { tag: LEAF, price, ... };
let new_inner_idx = tree_alloc(tree)?;
let price_bit = ((price >> shared_bit) & 1) as u8;
let (left, right) = if price_bit == 1 { (cur, new_leaf_idx) } else { (new_leaf_idx, cur) };
tree.nodes[new_inner_idx] = TreeNode { tag: INNER, split_bit: shared_bit, left_child: left, right_child: right, ... };

// (5) 親に配線する。
if parent == SLAB_NONE_INDEX {
    tree.root = new_inner_idx;
} else if parent_side == 1 {
    tree.nodes[parent].right_child = new_inner_idx;
} else {
    tree.nodes[parent].left_child = new_inner_idx;
}
\`\`\`

吸収すべきもの 5 つ。

**ステップ 2 は「*どれか*葉まで歩く」。正しい葉ではない。** Critbit の優雅さは、root から \`(price >> split_bit) & 1\` で歩くと**ある**葉 — \`price\` と最長の critical-bit prefix を共有する葉 — で終わることだ。それが \`shared_bit\` を見つけるために比較すべき唯一の葉。列挙不要、複数葉と比較する必要なし。

**\`shared_bit = 63 - diff.leading_zeros()\`。** 標準トリック: \`diff\` の最上位セットビットは \`63 - leading_zeros\` の位置（\`u64\` で）。\`diff != 0\`（等価価格ケースを除外済み）なので、\`leading_zeros\` は \`0..=63\` の範囲。

**ステップ 3 の歩きは正しい不変条件で止まる。** (a) 葉に当たるか、(b) \`split_bit < shared_bit\` の inner node に当たるとき継ぎ込む。両方とも意味は: 既存木はこのパス上に \`shared_bit\` で識別する inner を持たない、だから新 inner はここに来るべき。不変条件は維持される: \`split_bit >= shared_bit\` の inner では \`price\` と \`found_price\` がそのビットで一致するので、降下を続けられる。

**ステップ 4 の \`price_bit\` が新葉のどちら側を決める。** \`price\` がビット \`shared_bit\` をセットしているなら右へ、そうでなければ左へ。既存サブツリー（\`cur\`）は逆側を取る。なぜか? \`shared_bit\` で \`price\` と \`found_price\` が違うから — だから新 inner の反対側に属する。

**ステップ 5 は唯一の「配線」ステップ。** その前のすべてはノードをアロケートして埋めただけ。実際の木接続は親の \`left_child\` か \`right_child\` ポインタ 1 つ（または \`tree.root\`）。間違えやすい; テストもしやすい。

ハンドラ \`process_slab_place_order\` はその後、（既にアロケート & 初期化済みの）新 OrderNode を葉の FIFO に追加する。葉が新品なら（\`head_node == SLAB_NONE_INDEX\`）、新オーダが先頭と末尾の両方になる。既存なら、新オーダが新末尾になり、旧末尾の \`next\` と新ノードの \`prev\` がリンクされる。

> **演習 §15.3.** 価格を 3 つの異なる順序で insert せよ: \`[100, 200, 150]\`、\`[200, 100, 150]\`、\`[150, 100, 200]\`。出来上がる木を手で歩け（または debug print で）。3 つすべてが昇順で iterate すると \`[100, 150, 200]\` を生む木を作るはずだ — だが内部構造（どの inner が root か、葉がどちら側にあるか）は異なる。それでよい: critbit はその葉について順序非依存だが、内部形状については違う。

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

アルゴリズム全体は「自分の側に向かって root から歩く」。Bid は最高価格を望むので常に右へ。Ask は最低を望むので常に左へ。木の不変条件 — 右側葉は \`split_bit\` で 1、左側葉は 0 — と、最高 split_bit から最低へ降下することの組み合わせが、これを単調に極値に到達することを保証する。

\`SlabMatch\` はその後走る:

\`\`\`rust
while fills < max_fills && remaining > 0 {
    let (leaf_idx, head_idx, level_price) = slab_peek_best(slab, want_max)?;
    if !crosses(level_price, limit_price) { break; }

    let maker_size = slab.nodes[head_idx].size;
    let fill = remaining.min(maker_size);

    if fill == maker_size {
        slab_pop_head_of_leaf(slab, maker_side, leaf_idx)?;  // 葉を落とすかも
    } else {
        slab.nodes[head_idx].size = maker_size - fill;
    }

    remaining -= fill;
    fills += 1;
}
\`\`\`

これは構造的に第 8 章のフラット板 \`Match\` と同じ fill-loop 形状 — taker は \`remaining\` を持ち、maker 側を best から歩き、\`remaining == 0\`、次の maker が limit を超えない、\`max_fills\` ページング cap が効くのいずれかまで埋める。違うのは、maker を見つけるのが O(N) でなく O(log N) で、maker を pop するのが O(1) でなく O(log N)（水準が枯れたときのトレードオフが \`slab_pop_head_of_leaf\` に住む）。

\`crosses\` 述語（上にインライン）は limit-price gate:

- **BID taker:** 高々 \`limit_price\` で買いたい → \`level_price <= limit_price\` の asks を cross。
- **ASK taker:** 少なくとも \`limit_price\` で売りたい → \`level_price >= limit_price\` の bids を cross。

Gate が cross をやめると（maker 価格が taker に有利でなくなった）、match は \`remaining > 0\` で戻る。Taker は望めば未充足部分を maker として post できる — それは同じ caller からの別の \`SlabPlaceOrder\` 呼び出し。

> **演習 §15.4.** 10 個の asks を価格 100, 101, 102, ..., 109 で insert せよ。\`limit_price = 105\`、\`size = 25\`、\`max_fills = 10\` で BID taker を送れ。Fills を追え: どの価格にどの順序で当たるか、taker は何回 fill した後 limit gate に当たるか、match が戻った後 \`remaining\` に何が残るか?

---

## §15.5  Critbit remove — 難しいやつ

水準の FIFO が空になると（\`slab_pop_head_of_leaf\` が最後のオーダを歩き出した）、葉は木から取り除かれねばならない。それは単に葉を free するだけではない — 直上の inner node は今や有効な子が 1 つしかなく、冗長になる。冗長な inner を超えて兄弟サブツリーを継ぎ上げる。

\`\`\`rust
fn critbit_remove_leaf(tree: &mut CritbitTree, leaf_idx: u16) -> ProgramResult {
    // (1) エッジケース: 葉が root。
    if tree.root == leaf_idx {
        tree_free(tree, leaf_idx);
        tree.root = SLAB_NONE_INDEX;
        return Ok(());
    }

    // (2) 価格で歩き、親 + 祖父母を追跡する。
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

    // (3) \`parent\` での兄弟は \`parent_side\` が取らなかった方。
    let parent_node = tree.nodes[parent];
    let sibling = if parent_side == 1 { parent_node.left_child } else { parent_node.right_child };

    // (4) \`sibling\` を \`parent\` がいた場所（祖父母の下、または root として）に配線。
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

これが機能する 4 つの不変条件。

**歩きは価格で、インデックスではない。** 取り除く葉は \`tree.nodes\` で安定したインデックスを持つが、root からそこへの**パス**はビットテストルーチンで降る。インデックスで歩くなら insert 時に親を覚える必要があり、状態が倍になる。価格で歩けば毎回 O(log N)、追加簿記なし。

**祖先 2 つが重要。** \`parent\` は葉の直上の inner; これが葉と一緒に削除される。\`grandparent\` は親の上の inner; **これ**の子ポインタが削除された親をバイパスするよう更新される必要がある。親が ROOT なら（祖父母なし）、\`tree.root\` を直接更新する。

**兄弟のサブツリーは保たれる。** そこに再帰せず、そのノードに触れず — 親の祖父母でのスロットを兄弟へ指すよう 1 つのポインタを書き換えるだけ。それが何だったか — 葉、inner、サブツリー全体 — そのまま 1 階層上がる。

**\`tree_free\` 呼び出し 2 つ。** 葉 AND 親。両方が木の free list に戻る。Remove の後の最初のアロケーションはどちらかを再利用する（おそらく親、free-list pop が LIFO だから）。

ステップ 1 の単葉 root ケースは唯一の「形が違う」分岐。それ以外は常に親がある（葉が root でないのは、最小限、この葉と少なくとも他の 1 つを識別する inner があるから）。

> **演習 §15.5.** Slab を作り、10 水準を価格 \`[100, 200, 50, 150, 250, 75, 125, 175, 225, 275]\` で insert せよ。木がどうなるか歩け（root、splits、葉）。次に 150 の水準をキャンセルせよ — どの inner が free され、どのサブツリーが上がるか追え。次に 250 を、次に 100 をキャンセル。3 つの remove の後、「無駄な」inner ノードはあるか?（ヒント: ないはず — remove は構築上常に親を畳む。）

---

## §15.6  3 つのハンドラ

\`process_create_slab\`（タグ 29）はブートストラップ。アカウントは \`slab (WRITE, SIGNER)\`、\`market\`。Market を検証したうえで、slab が署名していない(keypair の持ち主だけが market を決められる)、書き込み可でない、owner が openhl-core でない、ちょうど \`Slab::LEN\` バイトでない、rent 免除でない、すでに識別子がある(稼働中の板を初期化し直させない)、のどれかなら拒否する。そのあと識別子 + market を書き(PDA ではないので \`bump\` は 0 のまま)、両方の木で \`tree_init\` と OrderNode プールで \`slab_init_pool\` を走らせる。Init 歩きは命令の最重部分（~1k プールエントリ + 256 木エントリ × 2 side = ~1.5k イテレーション）; 以後の op は sub-log-N。

\`process_slab_place_order\`（タグ 30）は \`[side u8][price u64 LE][size u64 LE]\` を読む — \`PlaceOrder\` のペイロードと同一。Slab 識別子を検証し、ユーザの pubkey をコピーし、\`slab_insert_order\` を呼ぶ。アカウント 2 つ: \`user (SIGNER)、slab (WRITE)\`。第 7 章のフラット板 \`process_place_order\` と比較する価値がある: 同じペイロード、+0 アカウント。Slab の追加複雑性は完全にプログラム内にある; on-the-wire 命令形状は不変。これはクライアント側マイグレーションに効く: 既存のトレーディングクライアントはタグバイトと渡すアカウントを変えるだけで \`PlaceOrder\` を \`SlabPlaceOrder\` に swap できる。

\`process_slab_match\`（タグ 31）は \`[taker_side u8][price u64 LE][size u64 LE][max_fills u8]\` を読む — 第 8 章の \`Match\` と同一。検証、上の fill ループ実行、\`fills\` + \`remaining\` をログしてページング cap を可視にする。第 8 章が導入した同じ \`max_fills\` セマンティクスがここでもそのまま適用される: slab は依然として CU で境界される、はるかに高い実効 N で。

CU 形状(実測):

| op | フラット (ch.7/8) | slab (ch.15) |
|---|---|---|
| place、空の板 | 2,357 | 1,788 |
| place、ほぼ満杯の板 | 2,446(31 注文) | 1,954(1,023 注文、128 水準)。2,008(126 水準のあとに新しい水準を足す) |
| match、10 fill | 22,250(32 注文) | 14,553(10 注文)〜15,818(128 注文、1 水準に 1 つ)。14,284(128 水準に 1,024 注文)、13,921(8 水準に 1,024 注文) |
| match、4 fill | 8,147(4 注文)、8,500(8)、9,276(16) | 6,597(4)、6,784(8)、6,793(16) |
| cancel | 1,994(最初のスロット)〜2,174(32 個中の最後) | 未実装(演習 §15.6) |

(\`fuzz/slab\` の \`grid\` テストで、LiteSVM 上で測った。注文はサイズ 1 の買い。LiteSVM が \`solana-test-validator\` と同じに数えることは第 4 章 §4.5 で確かめた。)

この表の以前の版は測る前に書かれていて、slab は place あたり高い(1 KCU に対して約 3〜4 KCU)、\`Match\` は約 8 注文未満ならフラット板が勝つ、と書いていた。どちらも成り立たなかった。slab は place あたり安かった。差の内訳は分けていないが、フラット板の insert は空きスロットを探してスロットを走査する。\`Match\` でも、試したどの大きさでも、4 注文まで下げても slab が安かった。成り立つのは形のほうだ。10 fill は 10 注文でも 1,024 注文でもほぼ同じ値段で、各 fill がたどるのは全注文ではなく、価格水準の木の 1 本の道だからだ。こういう価格(連続した整数)ではその道は短い。どこまで長くできるかは §15.7 で示す。

ただし深さからは見えないことが 2 つ値段を左右する。1 つは価格のビット(§15.7)。もう 1 つは、1 つの水準にいくつの注文があるかだ。fill のたびに水準が空になると、葉の削除(§15.5)が毎回走る。64 fill は、128 価格に 128 注文で 92,122 CU、128 価格に 1,024 注文(1 水準に 8 つ)で 83,871 だった。

> **演習 §15.6.** \`SlabCancelOrder\` 命令を追加せよ。\`(order_id, side, price)\` を取り、特定の価格水準から特定のオーダを取り除く。ヒント: 構築したままの slab は \`order_id\` でオーダをインデックスしないので、正しいものを見つけるには水準の FIFO を歩く必要がある。\`price\` 引数が重要な理由は何か — それは木全体を歩くことに対して何を節約するか?

---

## §15.7  まとめと自己検証

### まとめ図

\`\`\`
Slab 一瞥:

  Slab {
    discriminator: "SLAB\\0\\0\\0\\0"
    market: <market pubkey>
    next_order_id: u64
    active_count: u32
    pool_free_head: u16 ──┐
                          │
    bid_tree: CritbitTree {
      root: u16 ──────────┼─── nodes[] へのポインタ（または NONE_INDEX）
      free_head: u16 ─────┼─── free TreeNode スロットのスタック
      nodes: [TreeNode; 256]
              ┌──────────────────────────────┐
              │ INNER: split_bit, l_idx, r_idx
              │ LEAF:  price, head_node, tail_node, order_count
              │ FREE:  next_free
              └──────────────────────────────┘
    }
    ask_tree: CritbitTree { … 同じ形状 … }

    nodes: [OrderNode; 1024]  ◄── 共有 OrderNode プール
            ┌─────────────────────────┐
            │ order_id, owner, size,  │
            │ next, prev              │  (FIFO リンクまたは free-list リンク)
            └─────────────────────────┘
  }


価格 117、サイズ 5、BID を Insert:
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


BID-taker、limit=110、size=25、max_fills=3 を Match:
  critbit_find_best(ask_tree, want_max=false) 経由で best ask 葉
  FIFO 先頭を pop:
    head.size <= remaining なら: pop_head_of_leaf()（葉を取り除くかも）
    そうでないなら:               head.size を in-place で縮める
  !crosses または remaining=0 または fills==3 まで繰り返す
\`\`\`

### 自分で検証する 3 項目

1. **プールが優雅に枯渇する。** 1024 オーダを insert せよ(片側の木が持てる異なる価格は最大 128 なので、128 以下の水準に分ける)。1025 番目を試せ — \`pool_alloc_node\` が \`AccountDataTooSmall\`（プールスロットなし）で失敗し、place が失敗し、\`active_count\` が 1024 に留まるはず。
2. **枯れた水準がその葉を綺麗に取り除く。** 価格 100 で 2 オーダを insert（同じ水準）。\`SlabMatch\` で両方 cross-match。Slab dump はアクティブオーダ 0 を、bid 100 の葉はなくなったことを示すはず（\`describe_best\` は \`(empty)\` を返す）。木の \`free_head\` は進んでいるはず（葉とその親 inner が free list に戻った — 100 が唯一の水準だった場合を除く。その場合は葉だけが戻り親は存在しなかった）。
3. **\`active_count\` 不変条件。** Place + match + cancel の任意のシーケンス後、\`active_count\` は \`nodes[i].size > 0\` の実際の count（ライブオーダ）に等しいはず。Slab dump が \`active_count\` を直接 print する; プール歩きでカウントするのは追加スクリプトパス 1 つ。ここで乖離を見つけることはどこかでカウンタが更新されなかったことを意味する — 潜在バグ。


### 高くつくマッチを道具に探させる

第 8 章 §8.6 では、満杯の板が CU の上限に収まるようフラットなマッチャの \`max_fills\` を制限し、その上限は板が大きくなるほど下げなければならない理由を示した。[\`fuzz/slab/\`](https://github.com/psyto/openhl-solana/blob/main/fuzz/slab) は \`SlabMatch\` に同じ問いを投げる。上限は 100,000 CU(\`SLAB_MATCH_CU_CAP\`)で、私たちが作れた最も高くつく形を使う。128 価格に 128 の買い注文(片側の木が持てる水準は最大 128)、1 水準に 1 注文なので fill のたびに水準も消える。そして最良の買いが critbit の深いところに来るよう価格を選ぶ。価格は \`u64::MAX\` と、k < 63 について \`u64::MAX - 2^k\`、その下に普通の 64 個だ。critbit の分岐は 64 ビットのキーのそれぞれ異なるビットで起きるので、道の長さは最大 64 ノード。これらの価格はそういう道を 1 本作り、最良の買い(\`u64::MAX\` と \`u64::MAX - 1\`)をその底に置き、以後の買いはその道から少しずつ上にぶら下がる。だから最初の fill ほど、キーが許す最も長い道をたどる。第 3 章 §3.7 のとおり準備してから:

\`\`\`bash
cargo build-sbf --manifest-path programs/openhl-core/Cargo.toml
cd fuzz/slab
cargo build --release --features invariant_ch15
cargo test --release --features invariant_ch15      # 10 fill は 32 注文でも 1,024 注文でも同じ値段
timeout -s INT 60 crucible run openhl_slab_fuzz invariant_ch15 \\
    --binary-in target/release/invariant_test --timeout 45
\`\`\`

> **演習 §15.7.** 走らせよ。\`[FUZZ_FINDING] [cu-dos:…] ix slab_match consumed … CU (cap 100000)\` の行が出るはずだ。第 8 章と同じく、上限を決めるのはプログラムだ。\`grid\` の数値から、思いつくどの形でも 100,000 に収まる \`max_fills\` の最大はいくつか。その検査を \`process_slab_match\` に足し、作り直してもう一度走らせよ。(出荷したプログラムには上限がないので、上の実行で報告が出る。以下の上限は、検査を足した複製で測った。)
>
> 私たちの最初の答えは間違っていて、その間違い方が教訓だ。連続した価格(100、101、…)に 1 水準 1 注文で測ると 69 fill で 99,037 CU だったので、69 を上限にした。レビュアーが、critbit は自己平衡しないと指摘した。深さは水準の数ではなく価格のビットに従う。上の深い価格では、10 fill が 35,819 CU(連続した価格では約 14,500)、32 fill が 100,222 で、上限 69 のまま走らせると fuzzer は 157,245 を報告した。その価格を選ぶのは maker なので、taker のマッチの値段を決めるのも maker だ。深い形に収まる最大の上限は 31(97,678 CU)で、\`if max_fills > 31\` を入れると fuzzer は 45 秒で何も見つけなかった。
>
> 31 は、私たちが見つけた最も深い形の上での測定値で、証明ではない。その下にある上限は本物だ(道の長さはキーのビット数を超えない)。そして上限は、プールが何注文を持つかには依存しない。第 8 章の上限が言えなかったのはこの点だ。依存するのは最悪の道の長さと、水準を消す値段である。上限がなければ、既定のバジェットを超えるマッチは今もありうる。深い形で 128 fill は 200,000 に収まらなかった。

---

## ここにない（意図的に）

これは実装章であり比較章ではない。書かなかったもの:

- \`fuzz/slab\` の \`grid\` テスト(§15.6)を超えるベンチマーク: 本番の深さ、settlement の CPI、slab での cancel。
- Serum の slab vs Phoenix の slab vs 本書のサイドバイサイド。両方の本番 slab は本書が持たない機能を持つ（Serum のオーダブックは cancel-on-disconnect タグを保存する; Phoenix は独自の market-maker reservation スロットを持つ）、公平な比較はそれ自体の章になる。
- フラット板から slab 板への移行ガイド。2 つのアカウント型は独立 — オンチェーン変換はない。\`OrderBook\`（第 7 章）の上に建てた market と \`Slab\`（本章）の上に建てた market は同じプログラムで共存できる。

ここまで来てもっと欲しいなら、§8.4 の擬似コードの「3-4 日の練習」フレーミングは正確だった: 日々を使い、バリアントを書き、結果を測れ。
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
