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
      duration: 405,
      xpReward: 1100,
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
> 教材コード: \`programs/openhl-core/src/lib.rs\`（\`process_create_vault\` 615–728 行、\`process_deposit\` 731–800 行）、\`scripts/create-vault/src/main.rs\`、\`scripts/deposit/src/main.rs\`。
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

CreateVault は、両方の CPI 形式が同じハンドラに現れる場所だ。\`programs/openhl-core/src/lib.rs:680–720\` から。

**PDA 派生**（668–678 行）が 2 つの pubkey を準備する: \`[VAULT_SEED, market.key, mint.key]\` の \`vault_token_account\` と、\`[VAULT_AUTH_SEED, market.key]\` の \`vault_authority\`。第 3 章と同じ find_program_address 機構。bump が返り、vault bump は下で使う。authority bump はまだ不要だ（出金を追加する後の章で、プログラムが vault authority として署名する必要が出てきたときに重要になる）。

**CPI 1 — System::create_account**、689–700 行。

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

**CPI 2 — SPL Token InitializeAccount3**、707–720 行。

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

Deposit はより単純なケースだ。\`programs/openhl-core/src/lib.rs:771–800\` から。

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

\`spl-token\` クレートは**意図的に**インポートしなかった。代わりに 2 命令分のバイトを手で組み立てた。\`lib.rs\` の 594–598 行。

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
2. **被呼び出しプログラムの AccountInfo。** CreateVault の両 CPI で、\`invoke[_signed]\` に渡される \`accounts\` スライスは被呼び出しプログラムの AccountInfo を含む — CPI 1 では \`system_ai\`、CPI 2 では \`token_ai\`。これを忘れるのは初期 Solana で最も頻出のミスの 1 つで、ランタイムは紛らわしい \`AccountNotFound\` 風味のエラーを返す。\`lib.rs:691, 720\` を読んで確認せよ。
3. **ユーザは一度署名し、SPL Token がそれを使う。** バリデータに対して \`deposit\` を実行せよ。ユーザ鍵ペアが外側トランザクションに署名する。SPL Token は \`is_signer = true\`（ユーザについて）の \`Transfer\` 命令を受け取る。トランスファが確定する。どこにも 2 度目の署名はない。1 署名、伝播。

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
> 教材コード: \`crates/state/src/lib.rs\`（\`Order\` + \`OrderBook\`）、\`programs/openhl-core/src/lib.rs\`（\`process_create_order_book\` 833–891 行、\`process_place_order\` 904–1000 行、\`process_cancel_order\` 1002–1064 行）、\`scripts/book/src/main.rs\`。

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

- **コストが見える。** CU ログに線形走査が現れる。学生は \`book --place\` を実行し、板が満ちるにつれて CU が下がっていく様子を観察できる。
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

コストは、プログラムが守るべき不変条件 1 行だ: \`size == 0\` の \`Order\` を絶対に書かない。両ハンドラとも、ペイロード中の \`size == 0\` を最初のガードで明示的に拒否する。\`process_place_order\`（lib.rs:929–932）から。

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

\`programs/openhl-core/src/lib.rs:904–1000\` から。ハンドラは 3 部分に分解できる。

**検証**（911–950 行）: ペイロードサイズ、side バイト（0 か 1）、price と size 非ゼロ、user は署名者、book の所有者が本書のプログラムと一致、book サイズが \`OrderBook::LEN\` と一致、book のディスクリミネータが一致。

**線形走査**、958–965 行。

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

CU コストの形:

- **空の book**（active_count = 0、slot 0 が空）: 1 反復。走査に約 50 CU。
- **半分埋まった book**（active_count = 16、slots 0–15 占有）: 16 反復。約 800 CU。
- **満杯 -1**（active_count = 31、slot 31 だけが空）: 31 反復。約 1550 CU。
- **満杯**（active_count = 32、全スロット占有）: 32 反復 + エラーパス。約 1700 CU + エラーオーバーヘッド。

絶対値としてはどれも小さい — 最悪ケースでも既定 200 KCU バジェットの 1% 未満だ。しかし**形**こそが教えだ: O(N) はコストがデータとともに成長することを意味し、本物の板ではその成長がバジェットを超え得る。slab なら配置が O(log N) に留まり、1024 注文でも本書の配列の N = 32 時の 16 反復より少ない CU で済む。

**書き込み**（970–987 行）: \`next_order_id\` をインクリメント、\`active_count\` をインクリメント、user の pubkey を \`owner\` にコピー、\`Order\` リテラルを構築、選んだスロットに投入。スロットが決まれば全部 O(1)。

952 行（走査前）と 988 行（書き込み後）の CU ブラケットがあれば、バリデータログからコストを読める。2 つの \`sol_log_compute_units\` を呼んで差を取れば、この命令の「走査 + 書き込み」が実際に消費した CU が出る。

> **演習 §7.3.** book にいろんな N（たとえば 0、8、16、24、31）の注文を事前投入し、その後新しい注文を 1 つ置け。各 N について 2 つのログ呼び出しの間で消費された CU を記録せよ。プロットせよ。N に対しておおむね線形なはずだ。

---

## §7.4  \`cancel_order\` を歩く

\`process_cancel_order\`（1002–1064 行）は構造的には \`place_order\` と同じだ — 線形走査、次に変更 — がマッチキーと変更内容が異なる。

**走査**、1037–1043 行。

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

**認可チェック**、1050–1053 行。

\`\`\`rust
if book.slots[slot_idx].owner != *user_ai.key.as_ref() {
    msg!("cancel_order: caller is not the order owner");
    return Err(ProgramError::IllegalOwner);
}
\`\`\`

注文を置いた本人だけがキャンセルできる。スロットの \`owner\` フィールドがキャンセル認可の仕組みだ。これはスロット単位のチェックで、book 単位ではない — 「オペレータが何でもキャンセルできる」パスは存在しない。これはオープン CLOB として適切だが、vault 管理戦略では別になる。

**ゼロ化**、1057 行。

\`\`\`rust
book.slots[slot_idx] = <Order as bytemuck::Zeroable>::zeroed();
\`\`\`

\`Order::zeroed()\` は全ゼロの \`Order\` を返す。\`<Order as bytemuck::Zeroable>::zeroed()\` の修飾構文が必要なのは、\`Order::zeroed\` が固有メソッドとしてスコープに入っていないからだ — \`bytemuck::Zeroable\` トレイトから来る。書き込まれた後、スロットの \`size\` は 0、次の \`place_order\` が空スロット走査でこの位置を見つけて利用可能だと認識する。

CU コストは \`place_order\` と対称: 最良ケースは「スロット 0 で一致」（1 反復）、最悪ケースは「見つからない」（N 反復 + エラー）。1029 行と 1059 行のブラケットで計測できる。

> **演習 §7.4.** 注文を 10 個置き、order_id 5 をキャンセルせよ。その後さらに 1 個置け。新しい注文はどのスロットに着地するか。各操作の前後で \`book\`（フラグなし）のダンプ出力からスロット配分を辿れ。

---

## §7.5  この設計が第 8 章を生き残れない理由

第 8 章ではマッチングを実装する。マッチング ループの中核は「入ってくる taker 注文ごとに、反対側で最良の resting maker を見つけ、taker が尽きるまで交差する」だ。O(log N) データ構造ならツリー検索 1 回ずつでこのループが終わる。本書のフラット配列では、ループは次のことをしなければならない。

1. taker ごとに線形走査 → taker あたり O(N)
2. マッチ試行ごとに、すべての maker を線形走査 → maker チェックあたり O(N)
3. M 個の taker が K 個の maker と交差するとき、正しいスロットを見つけるためだけのコストは O(M × N) で、トークン移動の前段階だ

ORDER_CAPACITY = 32、M = 10、K = 5 で、マッチ命令あたり約 1600 配列走査になる。純粋な走査だけで約 80,000 CU。既定バジェットは 200,000。

第 8 章で実際にトークンを動かす必要があるとき（SPL Token への CPI、それ自体がトランスファあたり約 3,000 CU）、既定バジェットに収まらない。次のいずれかが必要になる。

- slab にリファクタリングする — 本番向け答え
- \`ComputeBudgetInstruction::set_compute_unit_limit\` で CU 上限を上げる — 絆創膏
- 命令あたりのマッチを N 交差に制限し、マッチャを複数回呼ぶようにする — 回避策

第 8 章ではこの 3 つを探索し、実際にスケールするのは slab だけだと説明する。今のところ、フラット配列は正しく、遅く、その遅さが目に見える。その可視性こそが、リファクタリングが何を買うかを理解する前提条件だ。

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
> 教材コード: \`programs/openhl-core/src/lib.rs\`（\`process_match\` 1116–1228 行）、\`scripts/match/src/main.rs\`。
> 第 7 章の \`OrderBook\` データ構造の上に立つ。

---

## §8.0  はじめに — スコープに関する正直なメモ

第 7 章の導線では、フラット配列ベースラインに対して計測する形で本章に動作する slab 実装を約束していた。実装と数週間付き合った結果、別のスコープ判断を下した: 本章はフラット book 上のマッチャを歩き、その CU コスト形状を正確に計測し、CU 枯渇に対する 3 つの現実的対応（バジェット引き上げ、\`max_fills\` でのページング、slab へのリファクタ）を列挙し、slab を**徹底的に擬似コード化した**設計として提示する — ただし slab は実装しない。理由は次のとおり。

1. **本章の教育上の仕事はコスト形状だ。** 「fill ループ内の線形走査は O(K × N) で、それが問題」を、教材例は証明する必要がある。動く slab を加えると、その焦点が 2 つの並行実装の間に薄まり、読者は両方を同時に頭に保持しなければならなくなる。
2. **本物の slab 実装は独自の章に値する。** ノードプールとフリーリスト、価格レベルの上の critbit ツリー、レベルごとの FIFO キュー。どれも使い捨てではなく — それらを 1 章の半分に押し込めば、3 つすべてを下手に教えることになる。
3. **\`max_fills\` ページング付きのフラットマッチャは真に有用だ**、低スループット / 教育用デプロイなら。ページング対応を組み込んだ形できれいに出荷するのは、誠実な工学だ。

そこで本章では次を行う。

1. フラット book 上の \`Match\` アルゴリズムを歩く。
2. 実ログから CU コスト形状を読み、O(fills × N) であることを示す。
3. CU 圧への 3 つの対応（バジェット引き上げ、ページング、slab リファクタ）を実演し、それぞれのコストを説明する。
4. 自分で実装したくなったら書ける詳細水準で、slab の擬似コード + 図を提供する。

完全な slab 実装は将来の章（あるいはあなた自身の宿題）に移す。導線は縮小される、工学的内容は縮小されない。

---

## §8.1  フラット book 上の Match アルゴリズム

\`programs/openhl-core/src/lib.rs:1116–1228\` から。ハンドラはペイロードの 4 フィールドを取る。

\`\`\`text
[side u8][limit_price u64 LE][size u64 LE][max_fills u8]
\`\`\`

\`side\` は**taker** 側だ（bid の taker は ask に対して買う、ask の taker は bid に対して売る）。\`limit_price\` は taker が受け入れる最悪価格。\`size\` は取りたい総 base 単位。\`max_fills\` は 1 命令あたりに交差する resting maker 注文数の上限 — ページングつまみだ。

マッチングループ、1175–1217 行。

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

| max_fills | sim units_consumed | fill あたり限界 |
|-----------|--------------------|-----------------|
|   1       |    約 5,000        |   約 3,500     |
|   2       |    約 8,500        |   約 3,500     |
|   4       |    約16,000        |   約 3,750     |
|   8       |    約30,500        |   約 3,600     |
|  16       |    約58,500        |   約 3,500     |

fill あたりの限界コストは 16 maker book でほぼ一定、約 3.5 KCU。内訳:

- fill あたり約 1,000 CU — 線形走査（16 スロット × 約 60 CU）
- fill あたり約 1,200 CU — maker 変更 + スロットゼロ化
- fill あたり約 1,000 CU — fill を記録する \`msg!\` ログ行
- fill あたり約 300 CU — ループ家事と \`Order\` 書き込み

book サイズを倍にすれば走査部分が倍になり、残りは定数のまま。ORDER_CAPACITY = 32 で全スロット活性なら fill あたり限界は約 5 KCU。256 スロット（より現実的な book）では約 20 KCU になり、10 fill 交差は走査だけで 200 KCU 消費して既定バジェットを使い切ってしまう。

これが本章が可視化するためにある CU コスト形状だ。フラットマッチャの fill あたりコストは book サイズに比例して成長する。命令あたり総コストは \`O(fills × N)\`。両因子とも押し上げたくなるつまみだ（呼び出しあたり fill 数を増やす、book を大きくする）。十分に押し上げればバジェットが壊れる。

**SDK が隠していること:** Anchor のプログラムログにも同じ「consumed N of M compute units」行が含まれる。ユーザコードからではなくランタイムから来るからだ。しかし Anchor は \`units_consumed\` を型付きフィールドとしてどこにも公開しない — 本書のようにシミュレーション結果から \`sim.value.units_consumed\` で読む。

> **演習 §8.2.** book を 30/32 容量にし、\`--max-fills 30\` でマッチャを実行せよ。シミュレーションは 200,000 近辺かそれ以上の units_consumed を報告するはずだ。次に \`--cu-limit 400000\` を加えて再実行する。オンチェーン確定は成功するか。\`--cu-limit 1400000\`（ネットワーク最大）でも成功しなくなるのはどの \`max_fills\` か。

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

fill あたりコストは \`O(log N)\`、\`O(N)\` ではない。N = 1024 なら fill あたり約 10 vs 約 1000 検査。現実的な book でマッチャがバジェットに収まる。

**コスト:** 大きな実装労力。正しい critbit + ノードプール + FIFO は約 1,500 行の慎重な Rust で、強い不変条件を伴う（各ノードはツリー+キューに住むかフリーリストにあるかのいずれか、各レベルは ≥1 注文を持つかツリーから消えているかのいずれか）。監査コストはそれに比例して高い。全体が \`bytemuck::Pod\` 適合だが慎重さを要する: ツリーノードはポインタではなくプール内のインデックスを持つ。

**これが正解になるとき:** 非自明な流動性を持つ本番 CLOB。Phoenix と Serum はどちらも理由あってこの設計を使う。

slab 実装は将来の章（あるいは独自実装）に残す。下記の擬似コードがあれば書ける。

---

## §8.4  Slab 擬似コード

最小 slab 構造、擬似 Rust で。

\`\`\`rust
const POOL_CAPACITY: usize = 1024;
const TREE_CAPACITY: usize = 256;   // 一意な価格レベル数

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

slab 実装は、初めてなら 3-4 日の演習だ。1 日目はプール + フリーリスト。2 日目は critbit の insert/remove。3 日目はマッチャへの配線。4 日目はエッジケース（book 満杯、レベル満杯、all-or-nothing fill）のテスト。

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

そのためには slab を実装する。§8.4 の擬似コードが設計仕様だ。

---

## §8.6  まとめと自己検証

### まとめ図

\`\`\`
フラット book 上の Match（本章）:

  fill ごと:    O(N) 走査 + O(1) 書き込み     → O(K × N) 総計
  ORDER_CAPACITY=32 book で K=16:           約 60 KCU
  失敗モード:    約 30 fill を超えると CU 枯渇


Slab 上の Match（将来の章、上で擬似コード化）:

  fill ごと:    O(log N) ツリーウォーク + O(1) FIFO 進行  →  O(K × log N) 総計
  約 1024 注文の book で K=16:              約 30 KCU
  失敗モード:    プール枯渇（別 place_order 拒否で扱う）


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

1. **コストは乗算的に成長する。** book に 8、16、24 の活性 maker を事前投入せよ。それぞれに対し \`match-cli\` を \`--max-fills 4\`（定数）で実行する。\`units_consumed\` を記録する。数値はおおよそ 4 × N に追随し、N だけや 4 だけにはならないはずだ。
2. **ページングは正しい小計を持つ。** 満杯 32 maker book と 10 単位 taker に対し \`--max-fills 16\` でマッチャを実行する。\`units_consumed\` と post-state の \`active_count\` を記録する。次に同じマッチング作業を \`--max-fills 8\` の 2 呼び出しに分けて行う。両呼び出しの \`units_consumed\` 合計は 1 回の 16 呼び出しの数値に非常に近いはずだ（2 つの \`process_match\` セットアップオーバーヘッドのぶんだけわずかに高い）。
3. **バジェット引き上げは本物。** 詰め込まれた 32 maker book に対し意図的に大きすぎるマッチ（例: 25 fills）を \`--cu-limit\` なしで実行する。失敗するはずだ。\`--cu-limit 500000\` を加える。成功するはずだ。\`sim.value.units_consumed\` が既定 200,000 と 500,000 の間にあることを確認せよ。

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
> 教材コード: \`crates/state/src/lib.rs\`（\`Oracle\`）、\`programs/openhl-core/src/lib.rs\`（\`process_create_oracle\` 1302–1373 行、\`process_set_oracle_price\` 1375–1427 行、\`process_place_order_checked\` 1429–1535 行）、\`scripts/oracle/src/main.rs\`。
> 参照対象: Pyth Network mainnet プログラム（\`FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH\`）、Switchboard On-Demand。

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

章で staleness シナリオを試すには、既知の瞬間にオラクルを書く手段が要る。\`programs/openhl-core/src/lib.rs:1375–1427\` から。

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

読み手パターンは \`process_place_order_checked\`（1429–1535 行）にある。中核ブロックは 1473–1490 行。

\`\`\`rust
let mark: u64;
{
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
        msg!(
            "place_order_checked: oracle stale ({} slots, max {})",
            age,
            MAX_ORACLE_STALENESS_SLOTS
        );
        return Err(ProgramError::InvalidAccountData);
    }

    mark = oracle.price as u64;
}
\`\`\`

価格を信用する前に 4 つのチェック。

1. **Discriminator チェック**（\`oracle.discriminator != ORACLE_DISCRIMINATOR\`）: 初期化されていないオラクルアカウントを拒否する。本物の Pyth では magic 定数 + version 一致がこれにあたる。
2. **価格正値チェック**（\`oracle.price <= 0\`）: 非正価格のオラクル状態を拒否する。本物の Pyth は時折 \`0\` を「今は良い価格がない」シグナルとして publish する — 読み手はそれを扱わねばならない。
3. **Staleness チェック**（\`age > MAX_ORACLE_STALENESS_SLOTS\`）: 25 slot（約 10 秒）より古い価格を拒否する。これが本章の中心だ。鮮度をチェックできない価格は信用できない価格だ — publisher を止められる攻撃者（あるいは単にネットワーク障害を利用する者）が、それを盲信するプログラムを古い価格でゲームできるからだ。
4. **所有者チェック**（1463 行、\`oracle_ai.owner != program_id\`）: 異なるプログラム由来のアカウントを拒否する。本物の Pyth では \`oracle_ai.owner == &pyth_program::ID\`。

\`lib.rs:153\` の \`MAX_ORACLE_STALENESS_SLOTS = 25\`。選び方はワークロードによる: 25 slot は現行ターゲットスロット時間で約 10 秒。高ボラペア（BTC、ETH の荒れた日）なら、もっと tight に — おそらく 10〜15 slot。ステーブルコインペアならもっと wide で許せる。定数は理想的には market ごとに調整できるよう \`Market\` 構造体に持つべきだが、本書は簡潔さのためグローバルに置く。

借用はサブブロック（\`{ ... }\`）でスコープし、book を変更する前にドロップする。これが重要なのは、オラクルと book の両方が \`AccountInfo\` として渡され、ランタイムは同じアカウントメモリの 2 つの可変借用が共存しないことを要求するからだ。本書のオラクルと book は別アカウントだとしても、借用をタイトにスコープするパターンは良い衛生だ — ハンドラが大きくなったときの微妙な aliasing バグを防ぐ。

**SDK が隠していること:** \`pyth-sdk-solana::load_price_feed_from_account_info\` は discriminator チェック、所有者チェック、型付き \`PriceFeed\` へのデシリアライズを行う。staleness チェックは**行わない** — それは常にあなたの仕事だ。明示的な staleness ゲートなしに Pyth を使うプログラムは、DeFi における最大のオラクルバグ群の 1 つに属して出荷される。

> **演習 §9.3.** スロット N でオラクル価格を設定せよ（\`oracle --set --price 100 ...\` を実行し、出力からスロットを控える）。30 slot 待つ（約 12 秒、\`solana confirm\` を適当な tx に当てればスロットがわかる）。フラグなしで \`oracle\` を実行する。\`age (slots)\` が 25 を超えるはずだ。\`place-order-checked\` を実行する（配線しているとして）— \`oracle stale\` で失敗するはずだ。

---

## §9.4  オラクルを使う — サニティバンド

staleness チェック済みの価格はもう安全に読める。最初のリスク制御として使うこと: オラクル mark から大きく外れる limit 価格の \`place_order\` 呼び出しを拒否する。

\`process_place_order_checked\` 1493–1506 行。

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

\`SANITY_BAND_BPS = 2000\`（lib.rs:159）で ±20%。\`mark = 100\` なら、価格 50 の注文は拒否される（\`low = 80\` 未満）、95 の注文は受け入れ、121 の注文は拒否。意図的に wide なバンド: tight なバンドは通常ボラの間に正当ユーザを失敗させる頻度を上げるし、章は**パターン**についての章であって calibration ではない。

本番バンドは market ごとに調整される。

- **高ボラ perp（荒れた日の BTC、ETH）:** 5〜10% が受け入れ可能かも。これより wide だと正当な fat-finger 隣接注文を拒否しすぎる。
- **中ボラ perp（SOL、AVAX）:** 3〜5% 典型。
- **低ボラペア（ステーブルコイン perp、FX）:** 1〜2%、ときにそれよりも tight。

バンドが最初のリスク制御である理由は、外部真実に依存する最も単純なものだから。ファンディングレート（第 10 章）と清算（第 11 章）は同じオラクル読み取りの上に立ち、より難しい数学に適用する。

**Saturating 算術。** \`saturating_mul\` と \`saturating_sub\` は意図的だ。\`mark = u64::MAX\`（実務上不可能だが理論上）だと乗算は wrap する。Saturating はそれを \`[u64::MAX - band, u64::MAX]\` のバンドに縮め、wraparound で 0..何かのバンドが生まれる代わりに、すべての合理的注文を優雅に失敗させる。Solana のプログラム ランタイムは整数オーバーフローでパニックする（\`release\` ビルドでは静かに wrap、\`debug\` ではパニック）— 明示的な saturating 演算は監査で報われる小さな習慣だ。

> **演習 §9.4.** オラクル価格を 100 に設定。価格 90（バンド内）、75（バンド外 — low 80 未満）、120（ぎりぎり内 — mark*0.2=20 なので high は 120）で注文を試す。各々を辿る。次に \`SANITY_BAND_BPS\` を 500（5%）に変えて同じ価格で再テスト。

---

## §9.5  本番 Pyth — 本物の形、1 ページで

本書の \`Oracle\` を本物の Pyth 価格アカウントに置き換えるなら、変更は局所的で小さい。

\`\`\`rust
// 1. 所有者チェックが変わる
// 前:  if oracle_ai.owner != program_id { ... }
// 後:  if oracle_ai.owner != &pyth_program::ID { ... }

// 2. レイアウトが変わる
// 前:  let oracle: &Oracle = bytemuck::from_bytes(&oracle_data[..Oracle::LEN]);
// 後:  let price_feed = pyth_sdk_solana::load_price_feed_from_account_info(oracle_ai)?;

// 3. フィールドアクセスが変わる
// 前:  oracle.price, oracle.conf, oracle.publish_slot
// 後:  price_feed.get_price_no_older_than(&clock, MAX_ORACLE_STALENESS_SLOTS)?
//         .price    (i64)
//         .conf     (u64)
//         .expo     (i32)
// 注: pyth_sdk_solana::PriceFeed::get_price_no_older_than は本書が手で
// やっている staleness チェックをすでに行う。SDK をインポートするなら
// 使うこと。どちらにせよ何をしているかは理解すること。

// 4. フォールバックパターン — Switchboard または副 Pyth フィード
// 通常 2 つのオラクルアカウントを配線し、staleness + conf 境界を通る
// 最初のものを優先する:
//
//   let primary = try_read(&primary_oracle_ai);
//   let secondary = try_read(&secondary_oracle_ai);
//   let mark = match (primary, secondary) {
//       (Ok(p), _) => p,
//       (Err(_), Ok(s)) => s,
//       (Err(_), Err(_)) => return Err(NoFreshPrice),
//   };
\`\`\`

構造的パターンは本書のものと同一だ。パースするバイトが違う。auth モデル（オラクルを誰が書けるか）は完全に反転する: Pyth の場合、あなたは何も書かない — 読むだけだ。

**Switchboard フォールバック**は章の最後のリスクエンジニアリングポイントが着地する場所だ。単一オラクルは単一障害点。Pyth は停止したことがある。Switchboard も停止したことがある。両方同時に（稀に）起きたこともある。下方を守るプログラムは**両方**を信頼し、どちらも fresh でなければ動作を拒否する。配線は機械的だ。

1. トランザクションの \`AccountMeta\` 配列に両オラクルアカウントを含める。
2. ハンドラがそれぞれを読み、完全な検証パターン（discriminator + 所有者 + 価格正値 + staleness）を行う。
3. どちらかが通れば使う。両方失敗なら呼び出し拒否。

これを行うプログラムは典型的に、両方が fresh のときは 2 つを**比較**もする — ある許容（例: 50 bp）を超えて不一致なら呼び出し拒否。Pyth と Switchboard の 50 bp 不一致は通常どちらかが誤っており、ユーザに安い方を選ぶだけのプログラムはゲームされてきた。

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

1. **Discriminator チェックは重要。** market PDA を作り、\`place_order_checked\` のオラクルスロットに market PDA を渡すトランザクションを組み立てよ。\`lib.rs:1477\` の discriminator チェックが \`UninitializedAccount\` で失敗するはずだ。このチェックがないと、コードは \`bytemuck::from_bytes\` でゴミデータに当てて意味のない \`price\` を使う。
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
> 教材コード: \`crates/state/src/lib.rs\`（\`FundingState\`）、\`programs/openhl-core/src/lib.rs\`（\`process_create_funding_state\` 1605–1680 行、\`process_update_funding\` 1682–1758 行）、\`scripts/funding/src/main.rs\`。

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

\`programs/openhl-core/src/lib.rs:1682–1758\` の \`process_update_funding\` が唯一の変更子。検証を除いた本体:

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
2. **クランプが強制される。** \`--rate 5000000\`（キャップを大きく超える）を試せ。\`lib.rs:1703–1705\` のクランプが \`MAX_FUNDING_RATE_PER_SEC_ABS = 1_000_000\` に縮め、\`clamped to\` ログ行が見えるはずだ。
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
> 教材コード: \`crates/state/src/lib.rs\`（\`Position\`）、\`programs/openhl-core/src/lib.rs\`（ヘルパ + \`process_open_position\` 1881–1993 行、\`process_close_position\` 1995–2061 行、\`process_liquidate\` 2063–2152 行）、\`scripts/position/src/main.rs\`。

---

## §11.0  はじめに — そして欠けた CPI

これが収束の章だ。他のすべての Phase A と Phase B のプリミティブ — オラクル、ファンディング、vault、マッチャ、並列性 — はこの章が書けるために存在する。\`OpenPosition\` / \`ClosePosition\` / \`Liquidate\` のない perp DEX は piece の寄せ集めで、それらを持つ perp DEX は perp DEX だ。

本章は 3 つの命令を出荷する。

1. **\`OpenPosition\`** — (user, market) ごとの Position PDA を作成し、entry 価格をオラクルから読み、後の決済のために累積ファンディング指数をスナップショットし、初期証拠金要件を満たす担保がユーザから掛けられているか検証する。
2. **\`ClosePosition\`** — 所有者の退出。第 10 章のスナップショット パターンでファンディングを決済し、実現 PnL = \`size × (mark - entry)\` を計算し、担保に適用し、ポジションをゼロ化する。
3. **\`Liquidate\`** — 誰でも他者の水没ポジションに対して行える退出。equity を計算し、維持証拠金と比較し、ポジションが下回っていれば現行マークで強制クローズし、（残担保から）ペナルティを清算者に支払う。

先にスコープに関する正直なメモを 1 つ: **担保はここでは追跡されるが、エスクローはされない**。本番では第 6 章の vault を統合する — \`OpenPosition\` はユーザの quote トークンアカウントから market vault へ SPL Token Transfer の CPI、close/liquidate では逆方向。本章の数学はトークンがどこに住んでいようと走らせるべき数学そのものだ。欠けているのは SPL Token CPI の配線。追加は機械的（第 6 章の \`Deposit\` のパターンが直接持ち越せる）だが、各ハンドラの AccountMeta 数が倍になり、本章が中心としているライフサイクル/数学の焦点を覆い隠す。

本番ではさらにクローズした担保を清算者と**保険基金 (insurance fund)** アカウントの間で分割する — ポジションが水没でクローズし、相手方を満足させる担保が不足するときに基金が不足分をカバーする。§11.6 で保険基金の役割を論じるが実装はしない。それ自体が小さな後続章のテーマだ。

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

**\`collateral: u64\`** は quote 通貨の証拠金額。ポジション オープン中は厳密に正、水没クローズや清算でゼロまで減少しうる。負にはなれない — 担保を超える損失は保険基金（あるいはスコープ繰り延べ版では単に失われる）に社会化される。

**\`funding_snapshot_index: i64\`** は最終タッチ（open、close、liquidate）時の累積ファンディング指数。第 10 章のポジションごとの決済パターンが、これをファンディング会計に必要な唯一のフィールドにする — \`funding_now\` と \`funding_snapshot_index\` の差にサイズを掛けたものが、スナップショット以降に蓄積したファンディング PnL だ。

PDA 派生は \`user\` と \`market\` の両方をシードに使う: \`[b"position", user.key, market.key]\`。だから (user, market) ペアごとに、誰もがマッピングを保存せず計算できるポジション アドレスが正確に 1 つ存在する。pubkey は資産ペアとトレーダにシード スキームだけで束縛される。

> **演習 §11.1.** ポジションが \`user\` と \`market\` の両方をアカウント**内部**にも保存する理由は何か。両方とも PDA 派生のシードであるにもかかわらず。（ヒント: アカウントを読む第三者が知っていることと派生しなければならないことを考えよ。）

---

## §11.2  equity、notional、証拠金式

ハンドラを歩く前に式を固定する。\`programs/openhl-core/src/lib.rs:1814–1834\` から。

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

\`programs/openhl-core/src/lib.rs:1881–1993\` の \`process_open_position\`。ハンドラは 5 部分に分解できる。

**検証**（1894–1916 行）: ペイロード サイズ、非ゼロ size と担保、user は signer、market は本書のプログラム所有、system プログラムは System プログラム。PDA 派生:

\`\`\`rust
let (expected, bump) = Pubkey::find_program_address(
    &[POSITION_SEED, user_ai.key.as_ref(), market_ai.key.as_ref()],
    program_id,
);
if position_ai.key != &expected {
    return Err(ProgramError::InvalidSeeds);
}
\`\`\`

**外部入力を読む**（1922–1923 行）:

\`\`\`rust
let mark = read_fresh_oracle(oracle_ai, program_id)?;
let funding_snapshot = read_funding_index(funding_ai, program_id)?;
\`\`\`

\`read_fresh_oracle\`（1838–1858 行）は第 9 章の staleness ガントレットをヘルパに分離した — 同じチェック（owner + discriminator + price>0 + Clock に対する age）、3 つのポジション ハンドラで再利用。\`read_funding_index\`（1860–1869 行）はファンディング指数をスナップショットする簡単な読み。

**初期証拠金チェック**（1932–1942 行）:

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

**PDA を確保**（1946–1960 行）: ポジション PDA のシードで署名する \`System::create_account\` への標準的な \`invoke_signed\`。\`CreateMarket\`、\`CreateVault\` などと同じパターン — 第 3 章で導入、以降のすべての章で再利用。

**レイアウトを書く**（1962–1978 行）:

\`\`\`rust
position.size = size;
position.entry_price = mark;
position.collateral = collateral;
position.funding_snapshot_index = funding_snapshot;
\`\`\`

データ書き込み 4 つ。\`entry_price = mark\` がオラクル価格をポジションの参照点として刻印する。\`funding_snapshot_index = funding_snapshot\` がこの瞬間のファンディング指数を捕捉する — 将来のすべての close/liquidate がこのスナップショットからの差分としてファンディング PnL を計算する。

> **演習 §11.3.** stale なオラクル（最後の \`SetOraclePrice\` から 25 slot 以上）に対して \`OpenPosition\` を試すと何が起きるか。\`read_fresh_oracle\` を通って失敗パスを辿れ。次に \`funding --update --rate 0\` と \`oracle --set --price ...\` を走らせてオープンを再試行せよ。

---

## §11.4  \`ClosePosition\` を歩く

1995–2061 行の \`process_close_position\`。オープンより単純 — PDA 作成なし、決済とゼロ化だけ。

**検証 + 所有者チェック**（2007–2024 行）:

\`\`\`rust
if position.user != *user_ai.key.as_ref() {
    msg!("close_position: caller is not the position owner");
    return Err(ProgramError::IllegalOwner);
}
\`\`\`

ポジションの所有者だけが自発的にクローズできる。Liquidate（§11.5）が他の誰でも通れる経路。user チェックは PDA 派生ではなくポジション内に保存した \`user\` フィールドを使う — 同じ情報、読みやすい。

**外部入力を読み equity を計算**（2026–2040 行）:

\`\`\`rust
let mark = read_fresh_oracle(oracle_ai, program_id)?;
let funding_now = read_funding_index(funding_ai, program_id)?;
// ...
let equity = compute_equity(position, mark, funding_now);
\`\`\`

オープンと同じオラクル + ファンディングの読みパターン。クローズで重要な計算は equity だけ — ポジションが今 quote 通貨換算で何の価値があるかを教える。

**PnL を実現**（2046–2058 行）:

\`\`\`rust
let new_collateral = if equity < 0 { 0 } else { equity as u64 };
position.collateral = new_collateral;
position.size = 0;
position.entry_price = 0;
position.funding_snapshot_index = funding_now;
\`\`\`

書き込み 4 つ:

1. **担保が equity になる**（水没ならゼロ）。利益のクローズは担保を増やし、損失のクローズは縮め、水没のクローズはゼロにする。本番ではこの担保が SPL Token CPI で vault から ユーザに戻る。ここではポジション アカウントに座ったまま、まだ実装されていない後続「withdraw」命令が返すのを待つ。
2. **Size = 0** がポジションをクローズ済みとマークする。PDA は確保されたまま、再オープンが同じ PDA を派生して休眠状態を上書きする。
3. **Entry price = 0** は家事 — 休眠状態を認識可能に保つ（ゼロ化された \`entry_price\` はオープン ポジションでは不可能）。
4. **ファンディング スナップショット = 現行** で、次回再オープンが古い差分を再適用するのではなく新鮮なスナップショットから始まる。

**水没クローズは担保を失うが、損失を回さない。** equity = -50（損失が担保を超える）でクローズするポジションは担保を 0 にしてそこで止まる。相手方（元のトレードの反対側にいた誰か — 暗黙にはマッチャ / 板）は通知も補填も受けない。これが本物の perp DEX が保険基金を tap する場所だ: 「ポジションが 50 単位の不足でクローズした、保険基金がカバーする、相手側は全額支払われる」。§11.6 を見よ。

> **演習 §11.4.** entry = 100、サイズ = 5、担保 = 100 でポジションをオープンする。オラクルをマーク = 80 に動かす。クローズ。期待される equity は \`100 + 5 × (80 - 100) = 0\`。ポジション ポスト状態で \`collateral = 0\` を確認せよ。

---

## §11.5  \`Liquidate\` を歩く

2063–2152 行の \`process_liquidate\`。クローズとの重要な違い: **誰でも呼べる**。

**検証**（2076–2091 行）: **清算者**は signer でなければならないが、プログラムは清算者がポジションの user と一致するかをチェック**しない**。誰でも誰のポジションに対しても liquidate を呼べる。

\`\`\`rust
let liquidator_ai = accounts.first().ok_or(...)?;
// ...
if !liquidator_ai.is_signer { return Err(...); }
\`\`\`

この無許可性が清算エンジンの中心。システムは小さな bounty（清算ペナルティ）を、最初に水没ポジションに気づいて清算 tx を提出した誰かに支払う。これなしには、清算はプロトコル チームが集中清算 bot を走らせることに依存する — 動くがアップタイム リスクが入る。

**ヘルス チェック**（2098–2111 行）:

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

**ペナルティを適用し強制クローズ**（2117–2147 行）:

\`\`\`rust
let liquidation_penalty = ((notional_val * (LIQUIDATION_PENALTY_BPS as u128) / 10_000)
    .min(i64::MAX as u128)) as i128;

let mut realized = if equity < 0 { 0 } else { equity };
realized = (realized - liquidation_penalty).max(0);
let new_collateral = realized as u64;

position.collateral = new_collateral;
position.size = 0;
position.entry_price = 0;
position.funding_snapshot_index = funding_now;
\`\`\`

ペナルティはポジションの残った equity から取る。\`LIQUIDATION_PENALTY_BPS = 100\` = notional の 1%。残担保（ペナルティ後）はポジション アカウントに残る。本番ではペナルティ額が SPL Token CPI で vault から清算者のトークン アカウントへ転送される。

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

## §11.6  欠けたピース — 保険基金と SPL Token 配線

本章が明示的に実装しないこと 2 つ、本番での役割を明示しておく。

**保険基金。** market ごとの別 \`InsuranceFund\` アカウントが、水没クローズの不足分をカバーする quote 通貨プールを持つ。パターン:

\`\`\`text
ClosePosition / Liquidate が equity < 0 を計算したとき:
    shortfall = -equity
    if insurance_fund.balance >= shortfall:
        insurance_fund.balance -= shortfall
        # 相手方は補填され、人生は続く
    else:
        # 自動レバ削減か社会化損失 — より大きなアーキテクチャ問題
\`\`\`

保険基金は清算ペナルティの一部（例: 50% 清算者、50% 保険基金）、取引手数料、ときに立ち上げ時の取引所エクイティで資金供給される。保険基金なしには、担保不足のすべての損失ポジションが、相手方 — 通常 LP プールか板の残り — に隠れた損失を課す。

**SPL Token エスクロー。** 本章で「担保」と言及するすべての操作は今のところ簿記のみ。本番では:

- \`OpenPosition\` は \`collateral\` 額分のユーザの quote トークン アカウントから market vault へ SPL Token Transfer を CPI。
- \`ClosePosition\` は逆方向を CPI、\`new_collateral\` をユーザに返す。
- \`Liquidate\` はペナルティを清算者に、残りをユーザ（あるいは保険基金）に CPI。

追加は機械的: 第 6 章の \`Deposit\` パターンがそのまま持ち越せる。ここにない理由は、追加が各ハンドラの AccountMeta 数を 3 倍にし（user_token_account、vault_token_account、token_program がそれぞれに必要）、本章が中心としているライフサイクル/数学の焦点を覆い隠すからだ。繰り延べ章（Ch.11b と呼ぼう）は数学に一切触れずに vault CPI を追加する。

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
> 教材コード: \`crates/state/src/lib.rs\`（\`TradingVault\`、\`VaultShare\`）、\`programs/openhl-core/src/lib.rs\`（\`process_create_trading_vault\` 2195–2280 行、\`process_vault_deposit\` 2282–2413 行、\`process_vault_withdraw\` 2415–2500 行、\`process_vault_update_nav\` 2502–2544 行）、\`scripts/vault/src/main.rs\`。

---

## §12.0  はじめに — 名前についての明確化

「vault」という単語はこのコードベースに 2 回登場する。

- **第 6 章の \`Vault\`** は SPL Token アカウントだった — 単一ユーザの担保が住む単一ユーザ用カストディ アカウント。所有者: SPL Token プログラム。純粋な配管。
- **第 12 章の \`TradingVault\`** はまったく別物 — 複数ユーザが資産を預け、shares 経由でマネージャの PnL を pro-rata で共有するプール基金。所有者: openhl-core。shares、NAV、deposit/withdraw 経済を持つ。

両方とも「vault」の合理的な使い方だ。型名で曖昧さを解消した（\`TradingVault\` は明確、第 6 章の \`Vault\` は専用 state 構造体を持たず — 単なる SPL Token アカウントだ）。命令は \`CreateVault\`（トークン アカウント）vs \`CreateTradingVault\`（本章）の分離で衝突しない。

trading vault は perp DEX を、ユーザが直接取引する venue から、**基金**もホストする venue に変える概念的プリミティブだ。ポジションを自分で管理したくないユーザは vault に預金できる。vault のマネージャが戦略を走らせる。預金者はリターンを共有する。これは Solana 上のすべての yield vault の構造 — Drift の spot vault、Kamino の leveraged vault、Jupiter の perps vault、その他もろもろ。

本章は vault の会計半分を組み立てる — shares、deposits、withdrawals、NAV 更新。マネージャの取引半分は組み立てない（第 11 章の \`OpenPosition\` を vault の PDA をポジション所有者として呼ぶ薄いラッパ命令になる）。share 会計が整えば追加は機械的だ。本章は設計を説明し、実装を宿題ピースとして残す。第 11 章が SPL Token エスクローを後送りしたのと同じやり方だ。

本章が実際に扱うこと:

1. **share/asset 数学** — NAV が変わるとき deposit と withdrawal が pro-rata 不変条件をどう保つか。
2. **シングルトン書き込みの再起** — すべての deposit と withdrawal が同じ \`TradingVault\` アカウントを変更するので、vault 操作はスケジューラで直列化する。第 5 章のアンチパターンを**意図的に**導入したので、緩和策が実務でどう見えるかが見える。
3. **マネージャ信用モデル** — \`VaultUpdateNAV\` が肝心の信用前提。それがどう構造化されるかが、vault が「マネージャが嘘をつかないと信じる」か「NAV をオンチェーン状態に対して検証する」かを決める。

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

**Deposit。** \`programs/openhl-core/src/lib.rs:2327–2335\` の \`process_vault_deposit\` から:

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

**Withdrawal。** \`lib.rs:2452–2459\` の \`process_vault_withdraw\` から:

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

**NAV 更新。** \`lib.rs:2535–2536\` の \`process_vault_update_nav\` から:

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

2282–2413 行の \`process_vault_deposit\` は 4 つのハンドラの中で最も複雑だ、最初の deposit で VaultShare PDA を条件付きで作成するからだ。構造を分解:

**検証**（2293–2318 行）: ペイロード サイズ、非ゼロ deposit、預金者は signer、vault は正しい所有者 + サイズ、system プログラムは正しい、share PDA は派生と一致する。

**vault 状態を読み mint する shares を計算**（2320–2342 行）: vault データを借用、最初の deposit（1:1）vs 以降（pro-rata）で分岐。

**vault 集約を更新**（2344–2353 行）:

\`\`\`rust
vault.total_shares = vault.total_shares.checked_add(shares_to_mint)?;
vault.total_assets = vault.total_assets.checked_add(assets)?;
drop(vault_data);
\`\`\`

\`checked_add\`（\`saturating_add\` ではない）: 加算がオーバーフローしうるなら、静かにキャップする代わりに deposit を拒否する。\`u64::MAX\` shares を超えて deposit を受け入れる vault は別の問題を抱えている。明示的な \`drop(vault_data)\` が share アカウントに触れる前に可変借用を解放する — share 作成が vault アカウント チェックパスを CPI で逆戻りしうるので必要だ。

**share アカウントの条件付き create-or-update**（2355–2403 行）:

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

ハンドラはどちらの分岐が走ったとしても最終的に share アカウントを所有しなければならない。両分岐とも最終状態は \`share.shares\` が預金者の総保有を反映し、\`share.cost_basis\` が累積預金を反映する。deposit は外から見えなくなる — 結果として残る share 状態だけが重要だ。

> **演習 §12.3.** ユーザが 100、50、25 を 3 つの別トランザクションで預金する。間に UpdateNAV なしで vault の NAV は一定。各ステップでユーザの share アカウントをダンプせよ。shares 数は線形に成長し、cost_basis は累計和になるはず。

---

## §12.4  \`VaultWithdraw\` を歩く

deposit より単純、作成するものがないから。2415–2500 行の \`process_vault_withdraw\`:

**返す assets を計算**、2452–2459 行 — §12.2 で扱った deposit 式の逆。

**認可**、2470–2473 行:

\`\`\`rust
if share.owner != *owner_ai.key.as_ref() {
    msg!("vault_withdraw: caller is not the share owner");
    return Err(ProgramError::IllegalOwner);
}
\`\`\`

share の記録された所有者だけが burn できる。これは share **単位**の認可で、vault 全体ではない — UpdateNAV のマネージャ チェックと異なる。この設計には「vault 管理者が任意の share を強制清算できる」経路はない（本物の本番 vault はコンプライアンス上の理由で追加するかもしれない）。

**残高十分性チェック**、2474–2480 行:

\`\`\`rust
if share.shares < shares_to_burn {
    return Err(ProgramError::InsufficientFunds);
}
\`\`\`

保有以上の shares は burn できない。

**Cost basis 削減**、2484–2489 行:

\`\`\`rust
let basis_reduction = (((shares_to_burn as u128) * (share.cost_basis as u128))
    / (share.shares as u128 + shares_to_burn as u128)) as u64;
share.cost_basis = share.cost_basis.saturating_sub(basis_reduction);
\`\`\`

比例削減。100 shares、cost_basis 1000 のユーザが 25 shares を burn すると、cost_basis は \`25 × 1000 / 100 = 250\` 減り、残り 75 shares の cost_basis は 750 になる。これが share あたり cost_basis を部分 withdrawal を通じて一定に保ち、P&L 報告が欲しい形になる。

分母の \`as u128 + shares_to_burn as u128\` は \`share.shares\` を**減算前**で使う（まだ減算していないから）。\`share.shares -= shares_to_burn\` の後の単純な \`share.shares as u128\` は誤った basis を計算する。

**集約を更新**、2491–2493 行 — \`total_shares -= shares_to_burn\`、\`total_assets -= assets_to_return\`。両方とも防御的に \`saturating_sub\`、事前チェックを考えれば underflow するはずがないが。

> **演習 §12.4.** §12.2 の演習の vault で、預金者 A に全 shares を引き出させる。A は何 assets 受け取るか。結果の vault 状態は（total_shares、total_assets）? 預金者 B の主張可能価値は変わっていないことを確認せよ。

---

## §12.5  マネージャ信用問題 — \`VaultUpdateNAV\`

2502–2544 行の \`process_vault_update_nav\` は短いが、ここに vault モデル全体の信用前提が住む:

\`\`\`rust
if vault.manager != *manager_ai.key.as_ref() {
    msg!("vault_update_nav: caller is not the vault manager");
    return Err(ProgramError::IllegalOwner);
}

let prev = vault.total_assets;
vault.total_assets = new_total_assets;
\`\`\`

マネージャは \`total_assets\` を任意の数値に更新するトランザクションに署名する。この数値がマネージャの実際の取引 PnL を反映していることをオンチェーンで検証する仕組みはない。**預金者はマネージャを信用する**。

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
> 教材コード: \`crates/state/src/lib.rs\`（\`BuilderProfile\`）、\`programs/openhl-core/src/lib.rs\`（\`process_register_builder\` 2604–2670 行、\`process_place_order_with_builder\` 2680–2817 行、\`process_claim_builder_fees\` 2819–2860 行）、\`scripts/builder/src/main.rs\`。

---

## §13.0  はじめに — builder code とは何で、何でないか

**Builder code** は取引に付与されるフロントエンド単位の識別子だ。ユーザがフロントエンド経由で注文を開くと、フロントエンドは builder code をトランザクションに含める。プログラムは取引のプロトコル手数料の設定可能な一部を、その builder のオンチェーン アカウントに credit する。

Hyperliquid が現行の意味でこの語を造った。フロントエンドが自分で板を運営せずに注文フローをマネタイズできるようにする、プロトコル ネイティブの仕組みだ。「ルータ手数料」（Uniswap）、「ホワイトラベル ルーティング」（CEX）、「紹介ブローカー」（TradFi）と同じ系譜 — 長く存在する分配インセンティブの Solana 版だ。

builder code は次のものでは**ない**:

- **紹介コード (Referral codes)。** 紹介コードは新規ユーザを紹介した人に報酬を与える。通常、サインアップごとに 1 回、あるいは紹介相手の手数料の長い尾を比率で永遠に支払う。Builder codes は**取引**ごとに支払い、誰が誰を紹介したかは追跡しない — ルーティングに報い、紹介に報いるのではない。
- **メーカー/テイカー リベート。** メーカー リベートはユーザ（指値注文を出した人）に自分の手数料の一部を戻す。Builder codes はユーザの手数料の一部を**第三者**（フロントエンド）に支払う。ユーザはどちらにせよ同じ総手数料を払う。違うのは分配を誰が受け取るかだ。

本章は 3 つの命令を出荷する。

1. **\`RegisterBuilder\`** — 各 builder が、累積手数料と自己宣言した最大シェアを保持する builder ごとの \`BuilderProfile\` PDA を作る。プログラムが credit するアカウントが必要なので登録が必要。アカウントなし、手数料なし。
2. **\`PlaceOrderWithBuilder\`** — 4 つ目のアカウントとして builder profile を取る取引命令バリアント。プロトコル手数料を計算し、builder のシェアを profile の \`accumulated_fees\` に分割し、\`PlaceOrderChecked\` と同じ place-order パスを走らせる。
3. **\`ClaimBuilderFees\`** — builder の引き出し呼び出し。\`accumulated_fees\` をゼロ化する。本番ではここで SPL Token Transfer CPI がプロトコル手数料 vault から builder のウォレットへ実際の quote トークンを動かす。

本章の知的内容は §13.4 のアトミシティ論（なぜ手数料分割は取引命令の中で起き、別の「取引ごとに claim」呼び出しではないか）と §13.2 のキャップ積み重ねパターン（自己宣言キャップとプロトコル レベル キャップがどう相互作用し、builder が侵害されても手数料漏れを境界付けるか）だ。

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
    pub _reserved: [u8; 32],
}
\`\`\`

104 バイト。意味のあるフィールド 4 つ:

**\`builder\`** はフロントエンド / アグリゲータの pubkey。PDA 派生での唯一のシードに使う: \`[BUILDER_PROFILE_SEED, builder.key]\`。これですべての Solana pubkey は高々 1 つの builder profile を持ち、pubkey を知っている誰もが派生できる。Profile は openhl-core 所有（本プログラムだけが \`accumulated_fees\` を変更できる）だが、誰でも公開フィールド（\`builder\`、\`total_volume\`）を**読み**、builder の主張するルーティング量を検証できる。

**\`max_fee_share_bps\`** は builder の自己宣言した、プロトコル手数料のどの fraction を取るかの上限。\`max_fee_share_bps = 2000\` で登録した builder は、ルートされる任意の注文でプロトコル手数料の最大 20% を取ると公にコミットしている。これは信用シグナル — 「20% は我々、80% はプロトコル」と「50/50」を宣伝する builder は、ユーザにフロントエンドがどうマネタイズするかを伝える。自己キャップが低いほど → ユーザに優しい手数料分割 → 潜在的に多いフロー。

**\`accumulated_fees\`** は builder に credit され claim を待つ手数料の走行合計。このプロファイル経由でルートする \`PlaceOrderWithBuilder\` ごとにインクリメント。\`ClaimBuilderFees\` でゼロにリセット。Builder はプログラム アカウント内に蓄積しバッチで引き出す — 取引ごとに claim するよりはるかに安価だ。

**\`total_volume\`** は観測性 — builder 経由でルートされた base size。Builder が潜在パートナーに自分のフローを証明するため（あるいはユーザが builder の実績を吟味するため）使う。プログラム ロジックには使わない。

注目すべき設計制約 2 つ:

- **Builder あたり 1 profile。** PDA 派生が (builder pubkey) → (profile pubkey) マッピングを全単射にする。Builder は market ごとに異なる手数料分割の 2 profile を持てない。A/B テストしたいなら 2 つの異なる builder ウォレットを使う。
- **Quote 単位での手数料蓄積。** \`accumulated_fees\` はプロトコル手数料が取られる quote 通貨で計上される。複数 quote 通貨（USDC と USDT）なら、設計は (builder, mint) ごとの profile が必要、builder ごとだけではなく。ここは意図的に単一 quote に保つ、プログラムの残りも単一 quote なので。

> **演習 §13.1.** あるフロントエンドが \`max_fee_share_bps = 3000\` で登録する。3 つの取引が経由する: notional 1000、2500、700。\`PROTOCOL_FEE_BPS = 10\`（0.1%）で、3 取引すべての後の \`accumulated_fees\` 合計は?

---

## §13.2  キャップ 2 つ、積み重ね

Builder code は 2 つの手数料シェア キャップが要る、1 つではなく、2 つの当事者が異なるインセンティブを持つから:

**プロトコル キャップ (\`PROTOCOL_BUILDER_SHARE_CAP_BPS = 5000\`)** — **任意の** builder が任意のプロトコル手数料の留保できる最大 fraction。プログラムにハードコード。本書の値 5000 bps だと、プロトコルはすべてのプロトコル手数料の少なくとも 50% が builder 設定に関わらずプロトコルに残ることを保証する。

**Builder 自己キャップ (\`BuilderProfile.max_fee_share_bps\`)** — この**特定の** builder が留保する最大 fraction。登録時に自己宣言、ユーザに見える。

任意の取引での実効シェアは \`min(builder.max_fee_share_bps, PROTOCOL_BUILDER_SHARE_CAP_BPS)\`。\`programs/openhl-core/src/lib.rs:2742–2748\` から:

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

\`programs/openhl-core/src/lib.rs:2680–2817\` の \`process_place_order_with_builder\`。ハンドラは \`PlaceOrderChecked\` の厳格な上位集合 — 同じチェック、同じ place ロジック — に手数料分割ブロックを検証と注文書き込みの間に挿入。

**検証 + サニティ バンド**（2693–2724 行）: \`PlaceOrderChecked\` と同一、\`accounts\` に追加の \`builder_profile_ai\` スロットを除いて。オラクル staleness チェック、オラクル マークに対する価格サニティ バンド — すべてそのまま持ち越し。

**手数料計算 + builder credit**（2726–2775 行）:

\`\`\`rust
let notional_val = (price as u128) * (size as u128);
let protocol_fee = (notional_val * (PROTOCOL_FEE_BPS as u128) / 10_000) as u64;

// ... builder profile を読み、share_bps をキャップでクランプ ...

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

残りの \`protocol_fee - builder_share\` はプロトコルが留保する。スコープ繰り延べ版ではこれは暗黙のまま（どこにも追跡しない）。本番では SPL Token CPI でプロトコル手数料 vault アカウントに転送される。本章の教育的論点はどちらにせよ着地する: 分割は取引とアトミックに起きる。

**注文配置**（2780–2811 行）: §9.4 の \`PlaceOrderChecked\` と同一。空スロットを線形走査、注文を書く、カウンタをインクリメント。\`PlaceOrderWithBuilder\` の CU コストは \`PlaceOrderChecked + 約 600 CU\`、手数料計算と builder profile 借用のため。

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

## §13.5  \`RegisterBuilder\` と \`ClaimBuilderFees\`

両方とも短い。\`RegisterBuilder\`（2604–2670 行）は第 3 章の標準 PDA 作成パターン、1 つのひねり付き: 要求された \`max_fee_share_bps\` は登録時にクランプされる:

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

\`ClaimBuilderFees\`（2819–2860 行）はさらに単純:

\`\`\`rust
if profile.builder != *builder_ai.key.as_ref() {
    return Err(ProgramError::IllegalOwner);
}

let claimed = profile.accumulated_fees;
profile.accumulated_fees = 0;

msg!(
    "claim_builder_fees: builder {} claimed {} units ...",
    builder_ai.key,
    claimed
);
\`\`\`

認可（builder だけが自分の手数料を claim できる）、蓄積子をゼロ化、ログ。本番ではここも SPL Token Transfer CPI がプロトコル手数料 vault から builder のトークン アカウントへ \`claimed\` quote トークンを動かす場所だ。これを省略する理由は第 11 章と第 12 章で省略した理由と同じ — 章は**仕組み**についての章で、SPL Token 配線は本番化時に追加する機械的拡張だ。

本物の本番 claim は通常、部分引き出し（\`claim --amount N\` でなく常に全部）、蓄積子タイムアウト（>N 日アイドルな手数料はプロトコルに没収）、プロトコルが複数 quote 通貨をサポートするときの per-token claim もサポートする。どれも根本的な形を変えない。上に乗るポリシー判断だ。

> **演習 §13.5.** \`process_claim_builder_fees\` を編集して、ペイロードに \`partial_amount: Option<u64>\` を受け入れるようにせよ。\`Some(n)\` なら \`min(n, accumulated_fees)\` を claim。\`None\` ならすべて claim。引き出せる総額が同じでも、部分引き出しパターンが builder に有用な理由は?

---

## §13.6  まとめと自己検証

### まとめ図

\`\`\`
Builder ライフサイクル:

  1) Builder 登録
     RegisterBuilder(max_fee_share_bps=2000)
     ──► BuilderProfile{ builder, max_share=2000, fees=0, vol=0 }


  2) ユーザが builder 経由で取引
     PlaceOrderWithBuilder(side, price, size)
     accounts: [user(S), book(W), oracle(R), builder_profile(W)]

       notional       = price × size
       protocol_fee   = notional × 10 / 10000    (PROTOCOL_FEE_BPS)
       share_bps      = min(profile.max, 5000)    (PROTOCOL キャップ)
       builder_share  = protocol_fee × share_bps / 10000

     アトミック:
       book に注文配置                            ─┐
       profile.accumulated_fees += builder_share   ├─ 同じ tx、同じ slot
       profile.total_volume     += size            ─┘


  3) Builder が定期的に claim
     ClaimBuilderFees(empty)
     ──► profile.accumulated_fees = 0
     ──► (本番: SPL Token CPI が claim された額を動かす)


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

1. **キャップが正しく積み重なる。** \`--max-share-bps 9999\` で builder を登録する。ハンドラはクランプをログし、ダンプは \`max_fee_share_bps = 5000\`（本書の \`PROTOCOL_BUILDER_SHARE_CAP_BPS\`）を示すはずだ。次に取引をその builder 経由でルートする — builder のシェアはちょうどプロトコル手数料の 50% のはずだ。
2. **失敗下でアトミシティが保たれる。** シミュレートされた失敗を使う: stale なオラクルで \`PlaceOrderWithBuilder\` を試す（注文配置が失敗する）。シミュレーションは \`oracle stale\` で失敗し、**かつ**失敗 sim 後 builder profile の \`accumulated_fees\` は不変のはずだ（トランザクション全体が revert するので）。取引が起きない限り分割は起きない。
3. **取引ごとに volume が蓄積する。** 同じ builder 経由で 5 つの注文をサイズ 10、20、30、40、50 で配置する。\`total_volume\` はちょうど 150 （10+20+30+40+50）のはずだ。\`accumulated_fees\` が \`(notional_total × PROTOCOL_FEE_BPS × share_bps / 10000 / 10000)\` に加算されないなら、数学に off-by-one がある — それを追いかけよ。

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

本章は Phase B とトラックを閉じる。§14.7 の振り返り後はチャプターは存在しない。第 0 章でカリキュラムがコミットした意味でプログラムを feature-complete にする前に追加するオンチェーン機能はない。その後どこに行くかはあなた自身の選択だ — 本番デプロイ、監査準備、スケーリング実験、独自 perp DEX。ピースはあなたの手にある。

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

**Phase B (HL プリミティブ、ch.6–14):** CPI 経由の SPL Token vault、オンチェーン板、マッチング エンジン、オラクル統合、ファンディング レート蓄積子、清算付きポジション ライフサイクル、プール取引 vault、builder code、結果を走らせるオフチェーン インフラ。動く — スコープが繰り延べられているが — perp DEX、すべての設計選択が注釈付きで、何が繰り延べされたかについての正直なメモが章に書き込まれている。

明示的に繰り延べたもの（だから後で見つけやすい）:

- 担保（ch.11）、vault 資産（ch.12）、builder 手数料（ch.13）の **SPL Token エスクロー**。数学は本番として正しい。トークン配管だけが欠けている。
- **Slab ベース板。** Ch.8 はページング付きフラット配列マッチャを出荷し §8.4 で slab を擬似コード化する。実装はよく scoped された宿題。
- **保険基金。** Ch.11 が議論する（§11.6）。コードにはない。水没クローズを正しく社会化する前に必要。
- **本物の Pyth 統合。** Ch.9 はモックを使う。§9.5 の移行表が本物の Pyth に切り替える 1 ページ diff。

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
              ],
            },
          },
        ],
      },
    },
  });
}
