# ALPS構造の取得ガイド

このドキュメントでは、`koriym/app-state-diagram` ライブラリの `Koriym\AppStateDiagram\Profile` クラスを使用して、ALPS (Application-Level Profile Semantics) ドキュメントの構造的な情報をプログラムから取得する方法について解説します。

## 1. `Profile` クラスの概要

`Profile` クラスは、指定されたALPSファイル（JSONまたはXML形式）を読み込み、解析し、その内容をPHPオブジェクトとして保持する中心的な役割を担います。これにより、ALPSドキュメント内のディスクリプタ、状態遷移（リンク）、メタ情報などにプログラムからアクセスできるようになります。

### 1.1. コンストラクタ

```php
public function __construct(
    string $alpsFile,
    LabelNameInterface $labelName,
    bool $doFinalize = true
)
```

*   `$alpsFile` (string): 解析対象のALPSファイルのパス。
*   `$labelName` (LabelNameInterface): ダイアグラム生成時のラベル名取得戦略を定義するインターフェースの実装（例: `new LabelName()` や `new LabelNameTitle()`）。構造取得が目的の場合でも必須の引数ですが、ラベル文字列の具体的な内容は構造取得には直接影響しません。
*   `$doFinalize` (bool): `true` (デフォルト) の場合、読み込んだディスクリプタ間のリンク関係を解決し、`$links` プロパティなどを構築します。構造全体を把握するためには `true` のまま使用することを推奨します。

### 1.2. 主要なパブリックプロパティ

`Profile` オブジェクトをインスタンス化すると、以下の主要なプロパティを通じてALPSドキュメントの情報にアクセスできます。

*   `public string $alpsFile`
    *   **説明**: 解析されたALPSファイルのフルパス。
*   `public string $title`
    *   **説明**: ALPSドキュメントのルートレベルで定義されたタイトル（例: `<alps><title>...</title>` や `"alps": {"title": "..."}`）。
    *   **ALPS仕様**: `alps` 要素直下の `title` 要素/プロパティに対応。
*   `public string $doc`
    *   **説明**: ALPSドキュメントのルートレベルで定義されたドキュメンテーション（例: `<alps><doc>...</doc>` や `"alps": {"doc": {"value": "..."}}`）。
    *   **ALPS仕様**: `alps` 要素直下の `doc` 要素/プロパティに対応。
*   `public array $descriptors`
    *   **型**: `array<string, AbstractDescriptor>`
    *   **説明**: ALPSドキュメント内で定義されている全てのディスクリプタを格納する連想配列。
        *   キー: ディスクリプタの `id` 属性値 (string)。
        *   値: `Koriym\AppStateDiagram\AbstractDescriptor` のサブクラス（`SemanticDescriptor` または `TransDescriptor`）のインスタンス。
    *   **ALPS仕様**: `alps` 要素内の全ての `descriptor` 要素に対応。
*   `public array $links`
    *   **型**: `array<Link>`
    *   **説明**: 解析されたディスクリプタ間の状態遷移（リンク）を表す `Koriym\AppStateDiagram\Link` オブジェクトの配列。`$doFinalize` が `true` の場合に構築されます。
    *   **ALPS仕様**: `semantic` ディスクリプタ内にネストされた遷移 (`safe`, `unsafe`, `idempotent`) ディスクリプタや、それらの `rt` 属性に基づいて生成されます。
*   `public LinkRelations $linkRelations`
    *   **説明**: ALPSドキュメントのルートレベルで定義された `<link>` 要素（外部リソースへの関連リンク）のコレクションを表す `Koriym\AppStateDiagram\LinkRelations` オブジェクト。
    *   **ALPS仕様**: `alps` 要素直下の `link` 要素群に対応。
*   `public array $tags`
    *   **型**: `array<string, list<string>>`
    *   **説明**: ALPSドキュメント全体で使用されているタグと、そのタグが付与されたディスクリプタIDのリストを格納する連想配列。
        *   キー: タグ名 (string)。
        *   値: そのタグを持つディスクリプタの `id` のリスト (list<string>)。
    *   **ALPS仕様**: 各 `descriptor` 要素の `tag` 属性に基づいて集約されます。

## 2. `AbstractDescriptor` クラス (およびサブクラス)

`Profile::$descriptors` プロパティから取得できる各ディスクリプタは、`AbstractDescriptor` クラスまたはそのサブクラス（`SemanticDescriptor`, `TransDescriptor`）のインスタンスです。これらは個々のALPS `descriptor` 要素の詳細情報を保持します。

### 2.1. `AbstractDescriptor` の主要なパブリックプロパティ

*   `public string $id`
    *   **説明**: ディスクリプタの一意な識別子。
    *   **ALPS仕様**: `descriptor` 要素の `id` 属性。
*   `public string $type`
    *   **説明**: ディスクリプタの種類 (`semantic`, `safe`, `unsafe`, `idempotent`)。
    *   **ALPS仕様**: `descriptor` 要素の `type` 属性。
*   `public string $title`
    *   **説明**: ディスクリプタの人間可読なタイトル。
    *   **ALPS仕様**: `descriptor` 要素の `title` 属性。
*   `public stdClass|null|string $doc`
    *   **説明**: ディスクリプタのドキュメンテーション。JSONでは `{"value": "...", "format": "..."}` のような `stdClass`、XMLで単純なテキストの場合は文字列になることがあります。値を取得するには、`is_string($descriptor->doc) ? $descriptor->doc : ($descriptor->doc->value ?? '')` のようにアクセスします。
    *   **ALPS仕様**: `descriptor` 要素内の `doc` 要素/プロパティ。
*   `public ?string $def`
    *   **説明**: ディスクリプタのセマンティクスを定義する外部リソースへのURI（例: Schema.orgのURI）。
    *   **ALPS仕様**: `descriptor` 要素の `def` 属性。
*   `public array|stdClass $descriptor`
    *   **説明**: このディスクリプタ内にネストされている子ディスクリプタの定義や参照のコレクション。
        *   通常、これは子ディスクリプタへの参照（例: `(object)["href" => "#childId"]`）や、インラインで定義された子ディスクリプタの元データ (`stdClass`) の配列です。
        *   参照されている子ディスクリプタの完全なオブジェクトを取得するには、`href` の値 (例: `#childId`) から `#` を取り除いたIDを使い、再度 `$profile->descriptors` から検索します。
    *   **ALPS仕様**: `descriptor` 要素内にネストされた `descriptor` 要素群。
*   `public array $tags`
    *   **型**: `list<string>`
    *   **説明**: このディスクリプタに付けられたタグのリスト。
    *   **ALPS仕様**: `descriptor` 要素の `tag` 属性（スペース区切りの場合、配列に分割されます）。
*   `public LinkRelations $linkRelations`
    *   **説明**: このディスクリプタに直接関連付けられた `<link>` 要素（外部リソースへの関連リンク）のコレクションを表す `LinkRelations` オブジェクト。
    *   **ALPS仕様**: `descriptor` 要素内にネストされた `link` 要素群。

### 2.2. `TransDescriptor` の追加プロパティ

`TransDescriptor` (遷移を表すディスクリプタ) は `AbstractDescriptor` を継承し、以下のプロパティを追加で持ちます。

*   `public string $rt`
    *   **説明**: 遷移後のターゲットとなるセマンティックディスクリプタのID（`#` 記号は含まれません）。
    *   **ALPS仕様**: `descriptor` 要素の `rt` 属性（例: `rt="#TargetState"` の場合、`$rt` は `"TargetState"` となります）。
*   `public stdClass|SemanticDescriptor|null $parent`
    *   **説明**: この遷移ディスクリプタがインラインで定義されている場合、その親となるセマンティックディスクリプタの情報。

## 3. `Link` クラス

`Profile::$links` プロパティから取得できる `Link` オブジェクトは、ALPSドキュメント内の状態遷移を表します。

### 3.1. 主要なパブリックプロパティ

*   `public string $from`
    *   **説明**: 遷移元のセマンティックディスクリプタの `id`。
*   `public string $to`
    *   **説明**: 遷移先のセマンティックディスクリプタの `id`。これは関連する `TransDescriptor` の `rt` プロパティから導出されます。
*   `public string $label`
    *   **説明**: この遷移のラベル。`Profile` 作成時に指定した `LabelNameInterface` の実装によって生成されます。
*   `public TransDescriptor $transDescriptor`
    *   **説明**: この状態遷移を定義している `TransDescriptor` オブジェクトへの参照。

## 4. `LinkRelations` および `LinkRelation` クラス

これらのクラスは、ALPSドキュメントのルートレベルまたは各ディスクリプタレベルで定義される外部リソースへのリンク (`<link>` 要素) を扱います。

### 4.1. `LinkRelations` クラス

*   **説明**: 複数の `LinkRelation` オブジェクトのコレクションを管理します。`$profile->linkRelations` や `$descriptor->linkRelations` から取得できます。
*   **主な機能**: `__toString()` メソッドでMarkdown形式のリンク一覧を生成します。個々の `LinkRelation` に直接アクセスするためのパブリックなゲッターは現在のところ限定的です。

### 4.2. `LinkRelation` クラス

*   **説明**: 個々の `<link>` 要素を表します。
*   **主要なパブリックプロパティ**:
    *   `public string $href`: リンク先のURL。
    *   `public string $rel`: リンクの関係性を示す `rel` 属性値。
    *   `public string $title`: リンクの人間可読な `title` 属性値。

## 5. ALPS構造の取得コード例

以下に、`Profile` クラスを使ってALPSドキュメントの構造情報を取得し、表示する基本的なPHPコード例を示します。

```php
<?php

require 'vendor/autoload.php'; // Composerのオートローダーを使用

use Koriym\AppStateDiagram\Profile;
use Koriym\AppStateDiagram\LabelName;
use Koriym\AppStateDiagram\SemanticDescriptor;
use Koriym\AppStateDiagram\TransDescriptor;

// ALPSファイルへのパス
$alpsFile = 'path/to/your/alps-profile.json'; // または .xml

try {
    // 1. Profileオブジェクトを作成
    $labelName = new LabelName(); // ラベル戦略は任意
    $profile = new Profile($alpsFile, $labelName);

    // 2. ALPSドキュメント全体の情報を表示
    echo "========================================\n";
    echo "ALPS Document Information\n";
    echo "========================================\n";
    echo "Profile File: " . $profile->alpsFile . PHP_EOL;
    echo "Title: " . $profile->title . PHP_EOL;
    echo "Documentation: " . $profile->doc . PHP_EOL;

    // ルートレベルのLink Relations
    if ((string)$profile->linkRelations !== '') {
        echo "\nRoot Link Relations:\n";
        echo $profile->linkRelations . PHP_EOL; // Markdown形式で出力
    }

    // タグ情報
    if (!empty($profile->tags)) {
        echo "\nTags Found:\n";
        foreach ($profile->tags as $tag => $ids) {
            echo "  - Tag '{$tag}': used in descriptors [ " . implode(', ', $ids) . " ]\n";
        }
    }

    // 3. 全てのディスクリプタをループして情報を表示
    echo "\n========================================\n";
    echo "Descriptors (" . count($profile->descriptors) . " found)\n";
    echo "========================================\n";
    foreach ($profile->descriptors as $id => $descriptor) {
        echo "\nDescriptor ID: " . $descriptor->id . PHP_EOL;
        echo "  Type: " . $descriptor->type . PHP_EOL;
        echo "  Title: " . $descriptor->title . PHP_EOL;

        $docValue = $descriptor->doc;
        if ($docValue) {
            $docText = is_string($docValue) ? $docValue : ($docValue->value ?? 'N/A');
            $docFormat = is_object($docValue) && isset($docValue->format) ? " (Format: {$docValue->format})" : "";
            echo "  Doc: " . $docText . $docFormat . PHP_EOL;
        }

        if ($descriptor->def) {
            echo "  Def (External Definition): " . $descriptor->def . PHP_EOL;
        }
        if (!empty($descriptor->tags)) {
            echo "  Tags: " . implode(', ', $descriptor->tags) . PHP_EOL;
        }

        // 遷移ディスクリプタ特有の情報
        if ($descriptor instanceof TransDescriptor) {
            echo "  Rt (Return Type): #" . $descriptor->rt . PHP_EOL;
            if ($descriptor->parent && isset($descriptor->parent->id)) {
                 echo "  Parent ID (if inline): " . $descriptor->parent->id . PHP_EOL;
            }
        }

        // ネストされたディスクリプタ (参照)
        if (!empty($descriptor->descriptor)) {
            echo "  Nested Descriptors/References:\n";
            foreach ((array)$descriptor->descriptor as $childDescRaw) {
                if (is_object($childDescRaw)) {
                    if (isset($childDescRaw->href)) {
                        echo "    - Reference (href): " . $childDescRaw->href . PHP_EOL;
                        // 参照先の詳細: $profile->descriptors[substr($childDescRaw->href, 1)] で取得可能
                    } elseif (isset($childDescRaw->id)) {
                        // これはインライン定義のディスクリプタのID (ただし、Profile構築時に正規化される)
                        // 通常は $profile->descriptors[$childDescRaw->id] で詳細が取れる
                        echo "    - Inline (id found in raw): " . $childDescRaw->id . PHP_EOL;
                    }
                }
            }
        }
        // ディスクリプタレベルのLink Relations
        if ((string)$descriptor->linkRelations !== '') {
            echo "  Link Relations for this descriptor:\n";
            echo $descriptor->linkRelations . PHP_EOL; // Markdown形式で出力
        }
    }

    // 4. 全てのリンク（状態遷移）情報を表示
    echo "\n========================================\n";
    echo "Links (Transitions) (" . count($profile->links) . " found)\n";
    echo "========================================\n";
    foreach ($profile->links as $linkKey => $link) {
        echo "\nTransition Key: {$linkKey}\n";
        echo "  From (Semantic ID): " . $link->from . PHP_EOL;
        echo "  To (Semantic ID via Rt): " . $link->to . PHP_EOL;
        echo "  Transition Descriptor ID: " . $link->transDescriptor->id . PHP_EOL;
        echo "  Label: " . $link->label . PHP_EOL;
    }

} catch (\Exception $e) {
    echo "Error: " . $e->getMessage() . PHP_EOL;
}

?>
```

**コード例の注意点:**

*   上記コードを実行する前に、`composer require koriym/app-state-diagram` でライブラリをインストールし、オートローダー (`vendor/autoload.php`) を適切にインクルードしてください。
*   `path/to/your/alps-profile.json` (または `.xml`) を実際のALPSファイルへのパスに置き換えてください。
*   ネストされたディスクリプタが参照 (`href`) の場合、その参照先のディスクリプタオブジェクトは `$profile->descriptors[substr($childDescRaw->href, 1)]` のようにして `$profile->descriptors` 配列から取得できます（`#` を取り除くため `substr` を使用）。

## 6. まとめ

`Koriym\AppStateDiagram\Profile` クラスおよび関連クラス群は、ALPSドキュメントの構造をPHPオブジェクトとして詳細に表現します。これにより、ALPSドキュメントの内容をプログラムで解析、検証、変換、またはその他の方法で活用するための強力な基盤が提供されます。
