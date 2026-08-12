---
name: aws-diagram
description: Terraform から AWS インフラ構成図 (.drawio) を作る・更新する。IaC を解析して structure.yaml (構造) と conventions.md (規約) を書き、決定論レンダラで .drawio に変換し、draw.io MCP でプレビューする。ユーザーが「構成図を作って」「アーキテクチャ図を描いて」「構成図を最新化して」「drawio で図にして」と言ったとき、または Terraform の変更に追従して図を更新したいときに使う。
---

# AWS 構成図の生成・更新

## この仕組みの前提

図の情報は 3 層に分かれている。層をまたいで手を出さないこと。

| 層 | ファイル | 誰が管理するか |
|---|---|---|
| 構造 | `structure.yaml` | 人間がレビューする。AI は IaC から抽出して提案する |
| 規約 | `conventions.md` | 人間が決める。AI は決定を追記して蓄積する |
| 見た目・座標 | `*.drawio` | スクリプトが生成する。手書きしない |

座標を AI が書かないので、同じ `structure.yaml` からは必ず同じ `.drawio` が出る。
つまり図の diff が「構成が変わったぶんだけ」になり、PR でレビューできる。

`.drawio` を直接編集して構造を変えないこと。構造を変えるなら `structure.yaml` を変えて再生成する。

## ワークフロー

### Step 1: 対象と範囲を確認する

ユーザーに確認する (推測で進めない)。

- 対象の Terraform のパス
- ビュー名 (`orders-api` など。1 ビュー = 1 枚の図 = 1 ディレクトリ)
- 図に載せる範囲。全リソースを載せると読めない図になるので、「何を伝える図か」を先に決める
- 出力先 (既定: `<repo>/diagrams/<view>/`)

既存の `structure.yaml` がある場合は更新モード。Step 2 の前にそれを読み、差分だけを当てる。

### Step 2: Terraform を解析して structure.yaml を書く

`references/structure-spec.md` にスキーマと Terraform リソース型 → CloudFormation 型の対応表がある。必ず読んでから書く。

やること。

1. `*.tf` を読み、リソースと参照関係 (`aws_x.y.arn` のような相互参照、`depends_on`、環境変数、IAM ポリシー) を拾う
2. ネットワーク境界 (VPC / サブネット / AZ) を `containers` に、リソースを `nodes` に、関係を `edges` に落とす
3. `source` フィールドに `main.tf:aws_lambda_function.foo` のような出所を書く。後で追跡できるようにするため
4. 書けたらユーザーに structure.yaml を見せてレビューを受ける。図を出すのはその後

やってはいけないこと。

- コードに書かれていないリソースを足さない。「CloudFront があるから Lambda@Edge もあるはず」は捏造
- 関係が読み取れないものを線でつながない。不確かなら `description` に書いてユーザーに聞く
- IAM ロールやログ設定など、伝えたいことに関係しないリソースを全部載せない

### Step 3: 規約を conventions.md に記録する

`references/conventions-base.md` が既定の規約。ビュー固有の決定 (この図では ALB を省略する、この trigger は破線、など) は
出力先の `conventions.md` に追記して蓄積する。同じ指摘を繰り返させないための資産。

規約のうち機械が読む必要があるもの (trigger の色・線種、グリッド間隔) は `layout.yaml` に書く。
`conventions.md` は人間と AI が読む文書、`layout.yaml` はレンダラが読む設定。両方を書いたら内容を一致させる。

### Step 4: 生成して検証する

```bash
# 1. 構造の検証 (存在しない id 参照、未知の trigger、未マップのリソース型)
node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-structure.mjs <dir>/structure.yaml

# 2. .drawio 生成 (--route で障害物を避ける経路をエッジに焼き込む)
node ${CLAUDE_PLUGIN_ROOT}/scripts/render-drawio.mjs <dir>/structure.yaml --route

# 3. 幾何の検証 (枠のはみ出し・重なり・負座標)
node ${CLAUDE_PLUGIN_ROOT}/scripts/check-geometry.mjs <dir>/structure.yaml

# 4. PNG に書き出して目で確認する
bash ${CLAUDE_PLUGIN_ROOT}/scripts/export-drawio.sh <dir>/<view>.drawio
```

4 の PNG は Read ツールで必ず自分で見ること。ビルドが通っただけでは「できた」ではない。
見て直すべき点があれば `structure.yaml` か `layout.yaml` を直して再生成する。`.drawio` を直接いじらない。

検証で警告が出たら潰してから報告する。`type` が未マップという警告が出た場合は下の「未対応のリソース型」を参照。

## リソース型とアイコン

`scripts/shape-map.json` が CloudFormation 型 → draw.io の AWS アイコン style の対応表。
draw.io 公式の shape インデックスから機械生成しているので、アイコン名を手で書かない。

### 未対応のリソース型が出たとき

1. draw.io MCP の `search_shapes` で探す (例: `search_shapes({query: "aws opensearch"})`)
2. 返ってきた `style` を、その node の `style:` にそのまま貼る (一時対応)
3. 恒久対応にするなら `scripts/gen-shape-map.mjs` の `QUERIES` に型を足して `npm run gen:shape-map` を実行し、
   出力された shape のタイトルが意図どおりか確認する

## draw.io MCP の使い分け

このプラグインは `@drawio/mcp` (draw.io 公式) を `drawio` という名前で登録している。

| ツール | 使いどころ |
|---|---|
| `search_shapes` | 未対応のリソース型のアイコンを探す |
| `open_drawio_xml` | 生成した図をエディタで開いて見せる。`routing: "libavoid"` を付けると経路が整う |
| `list_pages` / `get_page` | 人が手で編集した `.drawio` の中身を読む |
| `set_page` | 既存ファイルの 1 ページだけ差し替える。手編集した注釈ページを残したいときに使う |

`open_drawio_xml` はブラウザを開く。ローカル完結の構成では `DRAWIO_BASE_URL` がセルフホストの draw.io を指しているので、
先にそれが起動しているか確認する (`bash ${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh --status`)。起動していなければ PNG 書き出しで代替する。

## 更新モード (Terraform の変更に追従する)

1. `structure.yaml` の `metadata.repos` から対象リポジトリを特定する
2. Terraform の差分 (`git diff <前のタグ>..<今のタグ> -- <path>`) を読む
3. 差分に対応する `nodes` / `edges` だけを足す・消す・直す。無関係な箇所を触らない
4. Step 4 の検証を回し、PNG を見て報告する

削除されたリソースは黙って消さず、「消えたので図から外した」と報告に明記する。

## 落とし穴

- ラベルに `<br>` などの HTML を書かない。draw.io では文字列としてそのまま出る
- ノードの `name` は Terraform の識別子ではなく、実際のリソース名 (`orders-api-handler`) を使う
- 1 枚に詰め込みすぎない。20 ノードを超えたらビューを分ける
- `structure.yaml` に座標を書かない。並びを変えたいときは `column` (列の固定) と宣言順で調整する
