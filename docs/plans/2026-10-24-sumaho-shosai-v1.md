# スマホ書斎 (sumaho-shosai) v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a phone-only PWA that lets 鬼さん inventory 1,000+ paper books and manga by continuous barcode scanning, check in a bookstore (offline) whether they own a book or which manga volumes they own, and export everything as CSV.

**Architecture:** Static files (no build step, plain ES modules) served from GitHub Pages at `https://onionsaki.github.io/sumaho-shosai/`. All data lives in the phone's IndexedDB. Pure logic lives in `src/core/` (no DOM, unit-tested with `node --test`); browser glue (IndexedDB, fetch queue, camera, audio) and screens live in `src/` and `src/ui/`. Book metadata comes from the National Diet Library (NDL) OpenSearch API, with openBD as a secondary source for covers and gaps.

**Tech Stack:** Vanilla JS (ES2022 modules), IndexedDB, Service Worker, BarcodeDetector (native) with the `barcode-detector@3.2.2` polyfill vendored, Web Audio, Vibration, Screen Wake Lock. Tests: Node 24 `node --test`, dev-only `fake-indexeddb@6.2.5` and `@xmldom/xmldom@0.9.12`.

**Spec:** `C:\Users\onisa\Documents\MyVault\Knowledge\読書\蔵書アプリ_設計書.md` (Japanese). Read sections 2–7 before starting any task. Section numbers below (§) refer to it.

**Who the user is:** 鬼さん is not an engineer. Every step that needs them (phone tests, approving a public repo) must be explained in Japanese, short, with exactly what to tap. Never ask them to type commands.

## Global Constraints

- Target: Android Chrome only. No iPhone, no desktop-as-second-copy. Desktop Chrome on `localhost` is used only for development checks.
- No build step, no framework, no runtime CDN. Third-party runtime code is vendored under `vendor/` with its exact version recorded in `vendor/README.md`.
- All asset paths are relative so the app works under the `/sumaho-shosai/` base path.
- The only network hosts the app calls: `ndlsearch.ndl.go.jp`, `api.openbd.jp`, and cover image hosts returned by openBD (`cover.openbd.jp`). No analytics, ads, accounts, or servers.
- IndexedDB database name: `sumaho-shosai`. Call `navigator.storage.persist()` on first launch.
- UI language: Japanese. Visual design is our own; do not copy Yomoo's colors, icons, layout art or wording (§7 見た目).
- Three bottom tabs only: 読み取る / 本棚 / 設定 (§4).
- Ownership values: `owned`=持っている, `released`=手放した, `not_owned`=持っていない. Read values: `unread`=まだ, `reading`=読書中, `read`=読んだ. Format: `paper`=紙, `ebook`=電子.
- Seed tags, in this order: マンガ、自己啓発、時短術、参考書、投資術、キャラクターもの、TRPG、試験用、噛み砕き理解用、あとで読む、手放す候補.
- Stale rule defaults: exam tag 試験用, 2 years. Backup reminder: 30 days or 50 new books since last backup.
- Barcode acceptance: EAN-13 starting `978`/`979` with a valid check digit, confirmed by reading the same code twice. `491…` = magazine (tell the user). `19x…` second-row price code = ignore silently.
- Register-mode first-run defaults: 持っている・読んだ・タグなし; afterwards remember the last session's settings.
- CSV: UTF-8 with BOM, comma-separated, RFC 4180 quoting, header exactly: `ISBN,書名,書名の読み,著者,出版社,発行年月,ページ数,定価,作品名,巻,種類,持っているか,読んだか,タグ,メモ,登録日,読んだ日,手放した日,更新日`. Multiple authors/tags joined with `、`. Dates `YYYY-MM-DD`. File name `蔵書_YYYYMMDD.csv`.
- Dates stored as local `YYYY-MM-DD` strings; timestamps used for ordering are ISO strings.
- App name: full name 「自宅の書斎をスマホに入れよう」, short name 「スマホ書斎」 (home-screen label, page `<title>`, header).
- Code lives in `C:\Users\onisa\Documents\sumaho-shosai\` (its own git repo, GitHub `onionsaki/sumaho-shosai`, public). Creating the GitHub repo and the first push are outward-facing: ask 鬼さん in chat and wait for a yes before doing them.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test command for all unit tests: `npm test` (runs `node --test tests/`).

## Review Focus

1. **NDL returns several records for one ISBN** (ONE PIECE returns "ONE PIECE" and "Ｏｎｅ　Ｐｉｅｃｅ"): the user expects one clean book, half-width title with reading. → Task 4 test `pickBestNdlItem prefers half-width item with reading`.
2. **Books without an ISBN** (manual and Kindle entries): many must coexist; a unique `isbn` index must not reject them. → Task 5 test `stores several books without isbn`.
3. **Memo text with commas, quotes, line breaks, and tags containing spaces** must survive CSV export → import unchanged. → Task 9 test `csv round-trip keeps tricky memo`.
4. **App closed or offline in the middle of a scanning session**: scanned books are already saved; their lookups resume next launch. → Task 6 test `resumePending re-queues pending books`.
5. **Restoring a wrong or broken backup file** must not wipe the existing shelf. → Task 9 test `validateBackup rejects foreign json` and Task 14 step that validates before `replaceAll`.

---

## File Structure

```
sumaho-shosai/
  index.html                 app shell, 3 tabs, <main> mount
  manifest.webmanifest       PWA manifest (name 自宅の書斎をスマホに入れよう, short_name スマホ書斎, start_url ./, display standalone)
  sw.js                      service worker: cache-first app shell, network-only for APIs
  styles.css                 all styles
  icons/icon-192.png, icon-512.png
  src/
    app.js                   boot: open db, persist storage, register sw, tab router, resume lookups
    db.js                    IndexedDB wrapper (books, tags, settings)
    lookup.js                serial metadata fetch queue (NDL + openBD), title search
    camera.js                getUserMedia + BarcodeDetector/polyfill frame loop
    feedback.js              Web Audio beeps + vibration
    core/
      model.js               constants, labels, newBook(), todayStr()
      isbn.js                barcode classification, ISBN-10/13 conversion
      normalize.js           search normalization, author role stripping
      volume.js              volume parsing, title/volume split, workKeyOf()
      ndl.js                 NDL OpenSearch URL builders + XML parser + pickBest
      openbd.js              openBD URL builder + parser
      merge.js               merge fetched info into a book
      confirm.js             double-read confirmer with cooldown
      session.js             applyScan() register-mode rules
      check.js               check-mode result
      series.js              groupWorks(), summarizeVolumes()
      search.js              filterBooks(), sortBooks()
      stale.js               isStale()
      stats.js               ownedPriceSum(), countBy()
      csv.js                 booksToCsv(), parseCsv(), rowsToBooks()
      backup.js              makeBackup(), validateBackup(), shouldRemindBackup()
    ui/
      dom.js                 tiny h() helper, toast(), confirmDialog()
      scan.js                読み取る tab (register + check modes)
      shelf.js               本棚 tab (search, filters, book/work views)
      detail.js              book detail sheet
      add.js                 add-without-barcode sheet
      settings.js            設定 tab
  vendor/
    barcode-detector/        polyfill files (pinned 3.2.2)
    README.md                vendored versions
  dev/seed.html              localhost-only test data loader
  tools/serve.mjs            zero-dependency static server for local checks
  tests/                     node --test files, fixtures/
  package.json               "type":"module", scripts.test, exact devDependencies
  docs/plans/                this plan
```

Shared data shape (defined once in `src/core/model.js`, used everywhere):

```js
// Book
{
  id: string,            // crypto.randomUUID()
  isbn?: string,         // 13 digits; property ABSENT when unknown (never null or '')
  title: string, titleKana: string,        // kana = katakana, no spaces
  authors: string[], authorsKana: string[],
  publisher: string, issued: string,       // 'YYYY-MM' | 'YYYY' | ''
  pages: number|null, price: number|null,  // price = 税抜 yen
  workTitle: string, workKey: string,
  volume: number|null, volumeLabel: string,
  coverUrl: string,
  format: 'paper'|'ebook',
  ownership: 'owned'|'released'|'not_owned',
  readStatus: 'unread'|'reading'|'read',
  tagIds: string[], memo: string,
  createdAt: string, updatedAt: string,    // ISO timestamps
  readAt: string, releasedAt: string,      // 'YYYY-MM-DD' | ''
  lookup: 'ok'|'pending'|'not_found'|'manual'
}
// Tag { id: string, name: string, order: number }
// Settings keys: examTagId, staleYears, lastBackupAt ('' | ISO), lastSession {ownership, readStatus, tagIds}
```

---

### Task 1: Throwaway spike and hosting

Proves the three risky assumptions on 鬼さん's real phone before any product code (§9 作り始めに試すこと). The spike is deleted in Task 10.

**Files:**
- Create: `spike/index.html` (single file, inline script), `.gitignore` (`node_modules/`), `README.md` (one paragraph: what the app is, link to the spec path)
- Modify: spec `Knowledge/読書/蔵書アプリ_設計書.md` §9 — append `### 試作の結果（日付）`

**Interfaces:**
- Consumes: nothing.
- Produces: GitHub repo `onionsaki/sumaho-shosai` (public) with Pages serving `main` branch root at `https://onionsaki.github.io/sumaho-shosai/`; recorded findings that Tasks 4, 6, 11 rely on: (a) whether native `BarcodeDetector` supports `ean_13` on the phone, (b) a safe NDL request interval, (c) whether `https://ndlsearch.ndl.go.jp/thumbnail/{isbn}.jpg` displays in an `<img>`, (d) NDL API terms for personal non-commercial use.

- [ ] **Step 1: Write `spike/index.html`**

One page with: a Start button (needed for camera + audio permission), a `<video>` preview, a log list. On start: `getUserMedia({video:{facingMode:'environment'}})`; log `'BarcodeDetector' in window` and `await BarcodeDetector.getSupportedFormats()`; every 150 ms run `detect()` with `formats:['ean_13']` and log each distinct raw value with prefix classification (978/979 → ISBN, 19x → price row, 491 → magazine). For each new ISBN: fetch `https://ndlsearch.ndl.go.jp/api/opensearch?isbn=…`, log HTTP status and `dc:title` + `dcndl:volume`; fetch `https://api.openbd.jp/v1/get?isbn=…` and log `summary.title`/`summary.cover`; append `<img src="https://ndlsearch.ndl.go.jp/thumbnail/{isbn}.jpg">` and log `onload`/`onerror`. A second button "連続テスト" first calls `https://ndlsearch.ndl.go.jp/api/opensearch?title=ONE%20PIECE&cnt=10`, collects the ISBNs from the results, then requests each by ISBN sequentially at a 1000 ms interval and logs each HTTP status.

- [ ] **Step 2: Check it locally**

Run: `node -e "require('http').createServer((q,s)=>{require('fs').createReadStream('spike/index.html').pipe(s)}).listen(5173)"` in the background, open `http://localhost:5173` in the browser pane, press 連続テスト.
Expected: 10 log lines with HTTP 200 (a few 429 is a finding, not a failure). Stop the server.

- [ ] **Step 3: Ask 鬼さん before publishing**

Say in chat (Japanese): the repo `onionsaki/sumaho-shosai` will be created as **public** (program only; no book data) and published at `https://onionsaki.github.io/sumaho-shosai/`. Wait for a clear yes.

- [ ] **Step 4: Create repo, push, enable Pages**

```bash
git init -b main && git add . && git commit -m "spike: camera, barcode and NDL check"   # + Co-Authored-By line
gh repo create onionsaki/sumaho-shosai --public --source . --push
gh api -X POST repos/onionsaki/sumaho-shosai/pages -f "source[branch]=main" -f "source[path]=/"
```
Expected: `gh api repos/onionsaki/sumaho-shosai/pages --jq .status` eventually prints `built`; `curl -sI https://onionsaki.github.io/sumaho-shosai/spike/` returns 200.

- [ ] **Step 5: 鬼さん tests on the phone**

Give 鬼さん these instructions in Japanese: open `https://onionsaki.github.io/sumaho-shosai/spike/` in Chrome → 「開始」→ allow camera → scan (1) a normal book, (2) a manga, (3) the same book again → press 「連続テスト」→ screenshot the log and send it. Ask whether the cover image appeared.

- [ ] **Step 6: Check NDL terms**

Read `https://ndlsearch.ndl.go.jp/help/api` (WebFetch). Record whether personal, non-commercial use needs an application, and any stated request-rate rule.

- [ ] **Step 7: Record findings in the spec and decide**

Append `### 試作の結果（YYYY-MM-DD）` to spec §9 with (a)–(d) in plain Japanese. Decision rules: if native `ean_13` is unsupported, Task 11 must use the polyfill as primary; if 429s appeared at 1000 ms, set `minIntervalMs` in Task 6 to the smallest interval that gave none (≥1500); if the NDL thumbnail loads, Task 4's `ndlThumbnailUrl()` is used as the cover fallback, otherwise covers come from openBD only. Commit the spike repo state (`git commit --allow-empty` is not needed if nothing changed).

### Task 2: Project skeleton, model, ISBN rules

**Files:**
- Create: `package.json`, `src/core/model.js`, `src/core/isbn.js`, `tests/isbn.test.js`, `tests/model.test.js`

**Interfaces:**
- Produces (`src/core/model.js`):
  - `OWNERSHIP = ['owned','released','not_owned']`, `READ = ['unread','reading','read']`, `FORMATS = ['paper','ebook']`
  - `LABELS = { ownership:{owned:'持っている',released:'手放した',not_owned:'持っていない'}, read:{unread:'まだ',reading:'読書中',read:'読んだ'}, format:{paper:'紙',ebook:'電子'} }`
  - `SEED_TAGS: string[]` (Global Constraints order)
  - `todayStr(date = new Date()) -> 'YYYY-MM-DD'` (local time)
  - `newBook(partial = {}) -> Book` — fills every Book field with its empty value (`''`, `[]`, `null`), `format:'paper'`, `ownership:'owned'`, `readStatus:'unread'`, `lookup:'manual'`, fresh `id`, `createdAt=updatedAt=new Date().toISOString()`; deletes `isbn` when falsy.
- Produces (`src/core/isbn.js`):
  - `isValidIsbn13(s: string) -> boolean`
  - `toIsbn13(input: string) -> string|null` — accepts ISBN-10 or 13, with hyphens/spaces/full-width digits; returns 13 digits or null.
  - `classifyBarcode(raw: string) -> {kind:'isbn', isbn:string} | {kind:'price'} | {kind:'magazine'} | {kind:'other'}`

- [ ] **Step 1: Create `package.json`**

`{"name":"sumaho-shosai","private":true,"type":"module","scripts":{"test":"node --test tests/"},"devDependencies":{"fake-indexeddb":"6.2.5","@xmldom/xmldom":"0.9.12"}}`, then run `npm install`.

- [ ] **Step 2: Write failing tests**

```js
// tests/isbn.test.js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { isValidIsbn13, toIsbn13, classifyBarcode } from '../src/core/isbn.js';
test('valid isbn13', () => { assert.equal(isValidIsbn13('9784763135476'), true); assert.equal(isValidIsbn13('9784763135477'), false); });
test('toIsbn13 converts isbn10 and cleans input', () => {
  assert.equal(toIsbn13('4-7631-3547-8'), '9784763135476');
  assert.equal(toIsbn13('978-4-7631-3547-6'), '9784763135476');
  assert.equal(toIsbn13('９７８４７６３１３５４７６'), '9784763135476');
  assert.equal(toIsbn13('123'), null);
});
test('classifyBarcode', () => {
  assert.deepEqual(classifyBarcode('9784763135476'), { kind: 'isbn', isbn: '9784763135476' });
  assert.deepEqual(classifyBarcode('1920030014008'), { kind: 'price' });
  assert.deepEqual(classifyBarcode('4910123450123'), { kind: 'magazine' });
  assert.deepEqual(classifyBarcode('9784763135477'), { kind: 'other' }); // bad check digit
  assert.deepEqual(classifyBarcode('4901234567894'), { kind: 'other' });
});
```
```js
// tests/model.test.js
test('newBook omits isbn when empty and fills defaults', () => {
  const b = newBook({ isbn: '' });
  assert.equal('isbn' in b, false);
  assert.equal(b.ownership, 'owned'); assert.equal(b.format, 'paper'); assert.deepEqual(b.tagIds, []);
});
test('todayStr is local YYYY-MM-DD', () => { assert.equal(todayStr(new Date(2026, 9, 4)), '2026-10-04'); });
test('SEED_TAGS order', () => { assert.equal(SEED_TAGS[0], 'マンガ'); assert.equal(SEED_TAGS.at(-1), '手放す候補'); assert.equal(SEED_TAGS.length, 11); });
```

- [ ] **Step 3: Run** `npm test` — Expected: FAIL (modules missing).
- [ ] **Step 4: Implement `model.js` and `isbn.js`.** Price row = 13 digits starting `19`; magazine = 13 digits starting `491`; ISBN-10 check digit may be `X`.
- [ ] **Step 5: Run** `npm test` — Expected: PASS.
- [ ] **Step 6: Commit** `feat: model constants and isbn rules`

### Task 3: Normalization, volumes, work keys

**Files:**
- Create: `src/core/normalize.js`, `src/core/volume.js`, `tests/normalize.test.js`, `tests/volume.test.js`

**Interfaces:**
- Produces (`normalize.js`):
  - `normalizeForSearch(s: string) -> string` — NFKC, lowercase, katakana→hiragana, remove all whitespace and the characters `・,，、/／`.
  - `stripAuthorRole(name: string) -> string` — removes one trailing role word (`著|作|画|訳|編|監修|原作|漫画|作画|文|絵`) preceded by a space or `／`.
  - `cleanNdlName(raw: string) -> string` — removes `, ` and `/` separators: `'渡邊, 康弘'`→`'渡邊康弘'`, `'尾田/栄一郎'`→`'尾田栄一郎'`; also used for kana.
- Produces (`volume.js`):
  - `parseVolume(label: string) -> number|null` — handles `巻一`, `第十二巻`, `12`, `（12）`, `(12)`, `１２`, `12巻`, `第3集`, `vol.5`, `上/中/下` (→1/2/3), kanji numerals with 十/百/〇; null when no number.
  - `splitTitleVolume(title: string) -> {workTitle: string, volume: number|null}` — strips only a trailing volume that is space-separated, bracketed, or marked with 巻/集; never digits glued to text.
  - `workKeyOf(workTitle: string, authors: string[]) -> string` — `normalizeForSearch(workTitle) + '|' + normalizeForSearch(stripAuthorRole(authors[0] ?? ''))`. Decision: the spec says "著者の名字"; NDL name formats differ only in separators, which `cleanNdlName` removes, so the full normalized first-author name gives the same grouping without family-name parsing.

- [ ] **Step 1: Write failing tests**

```js
// tests/normalize.test.js
test('full-width, case and kana fold together', () => {
  assert.equal(normalizeForSearch('Ｏｎｅ　Ｐｉｅｃｅ'), 'onepiece');
  assert.equal(normalizeForSearch('ワン ピース'), normalizeForSearch('わんぴーす'));
});
test('stripAuthorRole', () => { assert.equal(stripAuthorRole('渡邊康弘 著'), '渡邊康弘'); assert.equal(stripAuthorRole('尾田栄一郎／作'), '尾田栄一郎'); assert.equal(stripAuthorRole('著者名'), '著者名'); });
test('cleanNdlName', () => { assert.equal(cleanNdlName('渡邊, 康弘'), '渡邊康弘'); assert.equal(cleanNdlName('尾田/栄一郎'), '尾田栄一郎'); });
```
```js
// tests/volume.test.js
test('parseVolume variants', () => {
  for (const [s, n] of [['巻一',1],['第十二巻',12],['12',12],['（12）',12],['(12)',12],['１２',12],['12巻',12],['第3集',3],['vol.5',5],['上',1],['中',2],['下',3],['百五',105],['',null],['特装版',null]])
    assert.equal(parseVolume(s), n, s);
});
test('splitTitleVolume strips only marked trailing volumes', () => {
  assert.deepEqual(splitTitleVolume('進撃の巨人 1'), { workTitle: '進撃の巨人', volume: 1 });
  assert.deepEqual(splitTitleVolume('ハイキュー!!（3）'), { workTitle: 'ハイキュー!!', volume: 3 });
  assert.deepEqual(splitTitleVolume('呪術廻戦 第2巻'), { workTitle: '呪術廻戦', volume: 2 });
  assert.deepEqual(splitTitleVolume('20世紀少年'), { workTitle: '20世紀少年', volume: null });
  assert.deepEqual(splitTitleVolume('1Q84'), { workTitle: '1Q84', volume: null });
});
test('workKeyOf ignores width, spacing and roles', () => {
  assert.equal(workKeyOf('ONE PIECE', ['尾田栄一郎']), workKeyOf('Ｏｎｅ　Ｐｉｅｃｅ', ['尾田栄一郎 著']));
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement both modules.**
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: search normalization and volume parsing`

### Task 4: Metadata parsers (NDL, openBD) and merge

**Files:**
- Create: `src/core/ndl.js`, `src/core/openbd.js`, `src/core/merge.js`, `tests/ndl.test.js`, `tests/openbd.test.js`, `tests/merge.test.js`; fixtures `tests/fixtures/ndl-9784763135476.xml`, `ndl-9784088725093.xml`, `ndl-title-search.xml`, `openbd-9784088725093.json`, `openbd-null.json`

**Interfaces:**
- Consumes: `cleanNdlName`, `parseVolume`, `splitTitleVolume`, `workKeyOf` (Task 3), `newBook` (Task 2).
- Produces:
  - `BookInfo` = `{isbn, title, titleKana, authors, authorsKana, publisher, issued, pages, price, volume, volumeLabel, workTitle, coverUrl}` (Book subset; missing values are empty).
  - `ndlIsbnUrl(isbn) -> string`, `ndlTitleSearchUrl(title, author = '', cnt = 20) -> string` (base `https://ndlsearch.ndl.go.jp/api/opensearch`), `ndlThumbnailUrl(isbn) -> string` (`https://ndlsearch.ndl.go.jp/thumbnail/{isbn}.jpg`; used only if Task 1 found it works)
  - `parseNdlOpenSearch(xmlText: string, DOMParserImpl) -> BookInfo[]` — one per `<item>`.
  - `pickBestNdlItem(items: BookInfo[]) -> BookInfo|null` — prefer items with `titleKana`, then `title === title.normalize('NFKC')`, then the first.
  - `openBdUrl(isbn) -> string`, `parseOpenBd(json: any) -> BookInfo|null`
  - `mergeBookInfo(book: Book, ndl: BookInfo|null, openbd: BookInfo|null, {overwrite = false} = {}) -> Book` — NDL wins over openBD; when `overwrite` is false only empty book fields are filled (protects user edits); recomputes `workKey`; sets `lookup` to `'ok'` if any source had a title, else `'not_found'`; never touches ownership, readStatus, tagIds, memo, format or dates; bumps `updatedAt`.

Field mapping, NDL `<item>`: `dc:title`→title; `dcndl:titleTranscription`→titleKana (whitespace removed); every `dc:creator`→authors via `cleanNdlName`; every `dcndl:creatorTranscription`→authorsKana via `cleanNdlName`; `dc:publisher`; `dcterms:issued` `2016.6`→`2016-06`, `2016`→`2016`; `dc:extent` first integer before `p`→pages; `dcndl:price` digits→price; `dcndl:volume`→volumeLabel and `parseVolume`→volume; `dc:identifier` with `xsi:type="dcndl:ISBN"` digits→isbn. When volume is null, apply `splitTitleVolume(title)`; workTitle is the title without the stripped volume. Use namespace-aware lookups (`getElementsByTagNameNS`). openBD `[0].summary`: `title`, `volume` (parse), `publisher`, `pubdate` (`YYYYMMDD`/`YYYYMM`/`YYYY-MM`→`YYYY-MM`), `author` (split on spaces, strip roles), `cover`→coverUrl when non-empty; `[null]`→null.

- [ ] **Step 1: Save real fixtures**

```bash
curl -s -A "Mozilla/5.0" "https://ndlsearch.ndl.go.jp/api/opensearch?isbn=9784763135476" -o tests/fixtures/ndl-9784763135476.xml
curl -s -A "Mozilla/5.0" "https://ndlsearch.ndl.go.jp/api/opensearch?isbn=9784088725093" -o tests/fixtures/ndl-9784088725093.xml
curl -s -A "Mozilla/5.0" "https://ndlsearch.ndl.go.jp/api/opensearch?title=%E3%81%99%E3%81%94%E3%81%84%E8%AA%AD%E6%9B%B8%E8%A1%93&cnt=5" -o tests/fixtures/ndl-title-search.xml
curl -s "https://api.openbd.jp/v1/get?isbn=9784088725093" -o tests/fixtures/openbd-9784088725093.json
curl -s "https://api.openbd.jp/v1/get?isbn=9784763135476" -o tests/fixtures/openbd-null.json
```
Wait 2 s between NDL calls. Expected: the XML files contain `<item>` (on a 429 body, wait 5 s and retry); `openbd-null.json` is `[null]`.

- [ ] **Step 2: Write failing tests** (`import { DOMParser } from '@xmldom/xmldom'`; `read(name)` reads a fixture as UTF-8)

```js
test('parses business book', () => {
  const [b] = parseNdlOpenSearch(read('ndl-9784763135476.xml'), DOMParser);
  assert.equal(b.title, '1冊20分、読まずに「わかる!」すごい読書術');
  assert.equal(b.titleKana, 'イッサツニジップンヨマズニワカルスゴイドクショジュツ');
  assert.deepEqual(b.authors, ['渡邊康弘']); assert.deepEqual(b.authorsKana, ['ワタナベヤスヒロ']);
  assert.equal(b.publisher, 'サンマーク出版'); assert.equal(b.issued, '2016-06');
  assert.equal(b.pages, 254); assert.equal(b.price, 1400); assert.equal(b.isbn, '9784763135476'); assert.equal(b.volume, null);
});
test('pickBestNdlItem prefers half-width item with reading', () => {
  const items = parseNdlOpenSearch(read('ndl-9784088725093.xml'), DOMParser);
  assert.ok(items.length >= 2);
  const b = pickBestNdlItem(items);
  assert.equal(b.title, 'ONE PIECE'); assert.equal(b.volume, 1); assert.equal(b.volumeLabel, '巻一'); assert.equal(b.workTitle, 'ONE PIECE');
});
test('title search returns several items', () => { assert.ok(parseNdlOpenSearch(read('ndl-title-search.xml'), DOMParser).length >= 2); });
test('openBD null and hit', () => {
  assert.equal(parseOpenBd(JSON.parse(read('openbd-null.json'))), null);
  assert.ok(parseOpenBd(JSON.parse(read('openbd-9784088725093.json'))).title);
});
test('merge fills empties, keeps user edits, sets lookup', () => {
  const book = newBook({ isbn: '9784763135476', title: '自分で直した書名', lookup: 'pending', memo: 'm' });
  const ndl = { title: 'NDL書名', authors: ['A'], pages: 254 };
  const m = mergeBookInfo(book, ndl, { coverUrl: 'https://cover.openbd.jp/x.jpg', pages: 999 });
  assert.equal(m.title, '自分で直した書名'); assert.equal(m.pages, 254); assert.equal(m.coverUrl, 'https://cover.openbd.jp/x.jpg');
  assert.equal(m.memo, 'm'); assert.equal(m.lookup, 'ok');
  assert.equal(mergeBookInfo(book, ndl, null, { overwrite: true }).title, 'NDL書名');
  assert.equal(mergeBookInfo(newBook({ isbn: '9784763135476' }), null, null).lookup, 'not_found');
});
```

- [ ] **Step 3: Run** `npm test` — Expected: FAIL.
- [ ] **Step 4: Implement `ndl.js`, `openbd.js`, `merge.js`.**
- [ ] **Step 5: Run** `npm test` — Expected: PASS.
- [ ] **Step 6: Commit** `feat: NDL and openBD parsers, metadata merge`

### Task 5: IndexedDB store

**Files:**
- Create: `src/db.js`, `tests/db.test.js`

**Interfaces:**
- Consumes: `newBook`, `SEED_TAGS` (Task 2), `normalizeForSearch` (Task 3).
- Produces: `openDb(name = 'sumaho-shosai') -> Promise<Db>` where `Db` has:
  - `getBook(id)`, `getBookByIsbn(isbn) -> Book|undefined`, `putBook(book) -> Book` (strips falsy `isbn`, sets `updatedAt`), `deleteBook(id)`, `allBooks() -> Book[]`, `booksByWorkKey(key) -> Book[]`, `booksByLookup(state) -> Book[]`
  - `allTags() -> Tag[]` (sorted by `order`), `putTag(tag)`, `createTag(name) -> Tag` (returns the existing tag if the name already exists, compared with `normalizeForSearch`), `deleteTag(id)` (also removes the id from every book), `mergeTags(fromId, intoId)`
  - `getSetting(key)`, `setSetting(key, value)`
  - `replaceAll({books, tags, settings})` (one transaction: clear all stores, then write)
  - `addBooksSkippingDuplicates(books) -> {added: number, skipped: number}` (skips when the isbn already exists)
- Schema v1: stores `books` (keyPath `id`; indexes `isbn` unique, `workKey`, `lookup`), `tags` (keyPath `id`), `settings` (keyPath `key`). On upgrade: seed `SEED_TAGS` with `order` 0..10, set `examTagId` to the 試験用 tag id, `staleYears` 2, `lastBackupAt` `''`, `lastSession` `{ownership:'owned', readStatus:'read', tagIds:[]}`.

- [ ] **Step 1: Write failing tests** (`import 'fake-indexeddb/auto'`; each test opens a fresh db name)

```js
test('seeds tags and settings', async () => {
  const db = await openDb('t1');
  const tags = await db.allTags();
  assert.deepEqual(tags.map(t => t.name), SEED_TAGS);
  assert.equal(await db.getSetting('examTagId'), tags.find(t => t.name === '試験用').id);
  assert.equal(await db.getSetting('staleYears'), 2);
  assert.deepEqual(await db.getSetting('lastSession'), { ownership: 'owned', readStatus: 'read', tagIds: [] });
});
test('stores several books without isbn', async () => {
  const db = await openDb('t2');
  await db.putBook(newBook({ title: 'A' })); await db.putBook(newBook({ title: 'B', isbn: '' }));
  assert.equal((await db.allBooks()).length, 2);
});
test('isbn unique and lookup by isbn', async () => {
  const db = await openDb('t3');
  await db.putBook(newBook({ isbn: '9784763135476' }));
  assert.ok(await db.getBookByIsbn('9784763135476'));
  assert.deepEqual(await db.addBooksSkippingDuplicates([newBook({ isbn: '9784763135476' }), newBook({ title: 'x' })]), { added: 1, skipped: 1 });
});
test('deleteTag removes it from books; createTag dedupes', async () => {
  const db = await openDb('t4');
  const t = await db.createTag('保留'); assert.equal((await db.createTag('保留')).id, t.id);
  const b = await db.putBook(newBook({ tagIds: [t.id] }));
  await db.deleteTag(t.id);
  assert.deepEqual((await db.getBook(b.id)).tagIds, []);
});
test('mergeTags moves books without duplicates', async () => { /* book has both tags → ends with only intoId once */ });
test('replaceAll swaps everything', async () => { /* after replaceAll with 1 book, allBooks().length === 1 and tags equal the given list */ });
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement `db.js`** with a small `req(idbRequest) -> Promise` helper; no library.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: IndexedDB store with seed tags and settings`

### Task 6: Lookup queue

**Files:**
- Create: `src/lookup.js`, `tests/lookup.test.js`

**Interfaces:**
- Consumes: `Db` (Task 5); `ndlIsbnUrl`, `ndlTitleSearchUrl`, `parseNdlOpenSearch`, `pickBestNdlItem`, `openBdUrl`, `parseOpenBd`, `mergeBookInfo` (Task 4).
- Produces: `createLookupQueue({db, fetchImpl = fetch, DOMParserImpl = DOMParser, minIntervalMs = 1000, retryDelaysMs = [2000, 4000, 8000], sleep = ms => new Promise(r => setTimeout(r, ms)), isOnline = () => navigator.onLine})` returning:
  - `enqueue(bookId)` — de-duplicated; processing is strictly serial.
  - `resumePending() -> Promise<number>` — enqueues every book with `lookup === 'pending'`, returns the count.
  - `refetch(bookId)` — like enqueue but merges with `{overwrite: true}`.
  - `searchByTitle(title, author) -> Promise<BookInfo[]>` — shares the same throttle.
  - `fetchInfo(isbn) -> Promise<BookInfo|null>` — NDL + openBD for one ISBN without saving anything (check mode, ISBN entry); shares the throttle; returns null when offline or not found.
  - `onUpdate(cb: (book: Book) => void)` — called after each book is saved.
  - `idle() -> Promise<void>` — resolves when the queue is empty (for tests and the session summary).
- Behavior: each NDL request waits until `minIntervalMs` has passed since the previous one. HTTP 429/5xx or a network `TypeError` retries after each delay in `retryDelaysMs`; when retries run out, or `isOnline()` is false, the book stays `'pending'` and the queue moves on. A NDL 200 with zero items is not an error. openBD is requested after NDL for every book (for the cover); openBD failures are ignored. Set `minIntervalMs` from Task 1's finding.

- [ ] **Step 1: Write failing tests** (fake `fetchImpl` returning fixture bodies by URL; `sleep` records delays and resolves at once; fake-indexeddb)

```js
test('fills a pending book from NDL + openBD', async () => { /* enqueue → idle → book.title set, lookup 'ok' */ });
test('not found when NDL has 0 items and openBD null', async () => { /* lookup 'not_found' */ });
test('retries on 429 then succeeds', async () => { /* first NDL call 429, second 200; sleep calls include 2000 */ });
test('stays pending after retries run out', async () => { /* always 503 → lookup 'pending' */ });
test('offline leaves pending without fetching', async () => { /* isOnline false → fetchImpl not called */ });
test('requests are serial and spaced', async () => { /* two books → recorded sleeps include a wait of minIntervalMs - elapsed (>0) before the 2nd NDL call */ });
test('resumePending re-queues pending books', async () => { /* 2 pending + 1 ok in db → resolves 2 */ });
test('refetch overwrites metadata but keeps memo and tags', async () => {});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement `lookup.js`.**
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: serial metadata lookup queue with retry and resume`

### Task 7: Scan rules (confirmer, register session, check result, series)

**Files:**
- Create: `src/core/confirm.js`, `src/core/session.js`, `src/core/check.js`, `src/core/series.js`, `tests/confirm.test.js`, `tests/session.test.js`, `tests/check.test.js`, `tests/series.test.js`

**Interfaces:**
- Consumes: `newBook` (Task 2).
- Produces:
  - `createConfirmer({required = 2, windowMs = 1500, cooldownMs = 3000} = {}) -> {push(code: string, nowMs: number) -> string|null}` — returns the code once it has been read `required` times in a row (each read within `windowMs` of the previous read of the same code; a different code resets the count). After emitting, the same code is ignored for `cooldownMs`.
  - `applyScan(existing: Book|undefined, session: {ownership, readStatus, tagIds}, isbn: string, today: string) -> {action: 'created'|'duplicate', book: Book, before: Book|null, changed: boolean}` — §4-1 rules. Created: `newBook({isbn, ownership, readStatus, tagIds, lookup:'pending'})` with `readAt = today` when read and `releasedAt = today` when released. Duplicate: ownership set to the session's value (`releasedAt = today` when it becomes released); session tags added, existing tags kept; readStatus and format unchanged; `before` is the unmodified existing book (used for undo).
  - `summarizeVolumes(volumes: number[]) -> {text: string, missing: number[]}` — `[1..12, 14]` → `{text: '1〜12, 14', missing: [13]}`; duplicates ignored.
  - `groupWorks(books: Book[]) -> Work[]` where `Work = {workKey, workTitle, books, ownedVolumes, summary}` — only books with `volume !== null`, grouped by `workKey`, books sorted by volume; `ownedVolumes` counts `ownership === 'owned'` in any format.
  - `checkResult(book: Book|undefined, workBooks: Book[]) -> {status: 'owned'|'owned_ebook'|'released'|'not_owned'|'unregistered', book, work: Work|null}` — `work` is set when `book.volume !== null` and `workBooks` is non-empty.

- [ ] **Step 1: Write failing tests**

```js
test('confirmer needs two reads and then cools down', () => {
  const c = createConfirmer();
  assert.equal(c.push('A', 0), null); assert.equal(c.push('A', 100), 'A');
  assert.equal(c.push('A', 200), null); assert.equal(c.push('A', 2000), null);   // cooldown
  assert.equal(c.push('A', 3200), null); assert.equal(c.push('A', 3300), 'A');   // after cooldown, two reads again
});
test('confirmer resets on a different code or a slow second read', () => {
  const c = createConfirmer();
  c.push('A', 0); assert.equal(c.push('B', 50), null); assert.equal(c.push('A', 100), null);
  const d = createConfirmer(); d.push('A', 0); assert.equal(d.push('A', 1600), null);
});
test('applyScan creates with session values', () => {
  const r = applyScan(undefined, { ownership: 'owned', readStatus: 'read', tagIds: ['t1'] }, '9784763135476', '2026-10-24');
  assert.equal(r.action, 'created'); assert.equal(r.book.lookup, 'pending'); assert.equal(r.book.readAt, '2026-10-24'); assert.deepEqual(r.book.tagIds, ['t1']); assert.equal(r.before, null);
});
test('applyScan duplicate: ownership from session, tags merged, read kept', () => {
  const ex = newBook({ isbn: '9784763135476', ownership: 'not_owned', readStatus: 'unread', tagIds: ['t0'] });
  const r = applyScan(ex, { ownership: 'owned', readStatus: 'read', tagIds: ['t1'] }, ex.isbn, '2026-10-24');
  assert.equal(r.action, 'duplicate'); assert.equal(r.changed, true);
  assert.equal(r.book.ownership, 'owned'); assert.equal(r.book.readStatus, 'unread'); assert.deepEqual(r.book.tagIds, ['t0', 't1']); assert.equal(r.before, ex);
});
test('applyScan release session records releasedAt', () => {
  const r = applyScan(newBook({ isbn: '9784763135476' }), { ownership: 'released', readStatus: 'read', tagIds: [] }, '9784763135476', '2026-10-24');
  assert.equal(r.book.ownership, 'released'); assert.equal(r.book.releasedAt, '2026-10-24');
});
test('applyScan duplicate with nothing new is unchanged', () => { /* owned book, owned session, no tags → changed === false */ });
test('summarizeVolumes', () => {
  assert.deepEqual(summarizeVolumes([1,2,3,4,5,6,7,8,9,10,11,12,14]), { text: '1〜12, 14', missing: [13] });
  assert.deepEqual(summarizeVolumes([3, 1, 2, 2]), { text: '1〜3', missing: [] });
  assert.deepEqual(summarizeVolumes([5]), { text: '5', missing: [] });
});
test('checkResult statuses', () => {
  assert.equal(checkResult(undefined, []).status, 'unregistered');
  assert.equal(checkResult(newBook({ format: 'ebook' }), []).status, 'owned_ebook');
  assert.equal(checkResult(newBook({ ownership: 'released' }), []).status, 'released');
  assert.equal(checkResult(newBook({ ownership: 'not_owned' }), []).status, 'not_owned');
});
test('checkResult includes the work for a volume', () => { /* book vol 13 not_owned + owned vols 1..12 → work.summary.text '1〜12' */ });
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement the four modules.**
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: scan confirmation, register rules, check result, series summary`

### Task 8: Shelf rules (search, filter, sort, stale, stats)

**Files:**
- Create: `src/core/search.js`, `src/core/stale.js`, `src/core/stats.js`, `tests/search.test.js`, `tests/stale.test.js`, `tests/stats.test.js`

**Interfaces:**
- Consumes: `normalizeForSearch` (Task 3).
- Produces:
  - `isStale(book: Book, examTagId: string, years: number, today: string) -> boolean` — true when the book is owned, has `examTagId`, and `issued` (`YYYY-MM`, or `YYYY` read as January) plus `years` is on or before `today`; false when `issued` is empty.
  - `filterBooks(books: Book[], f: Filter, ctx: {examTagId, staleYears, today}) -> Book[]` where `Filter = {query = '', ownership = [], readStatus = [], tagIds = [], staleOnly = false, needsReviewOnly = false}`. Query: split on whitespace; every term must be a substring of `normalizeForSearch` of title + titleKana + authors + authorsKana + workTitle + memo. Empty arrays mean "any". Tags: the book must have all of them. `needsReviewOnly` keeps `lookup === 'not_found'`.
  - `sortBooks(books: Book[], order: 'kana'|'recent') -> Book[]` — kana: `normalizeForSearch(titleKana || title)` compared with `localeCompare(…, 'ja')`, ties by `volume` ascending; recent: `createdAt` descending. Returns a new array.
  - `ownedPriceSum(books) -> number` (owned books with a price, any format), `countOwned(books) -> number`.

- [ ] **Step 1: Write failing tests**

```js
const ctx = { examTagId: 'exam', staleYears: 2, today: '2026-10-24' };
test('search by reading in hiragana finds katakana reading', () => {
  const b = newBook({ title: 'ONE PIECE', titleKana: 'ワンピース' });
  assert.deepEqual(filterBooks([b], { query: 'わんぴーす' }, ctx), [b]);
});
test('terms are ANDed and memo is searched', () => {
  const b = newBook({ title: '簿記の教科書', memo: '試験直前に使う' });
  assert.equal(filterBooks([b], { query: '簿記 直前' }, ctx).length, 1);
  assert.equal(filterBooks([b], { query: '簿記 税法' }, ctx).length, 0);
});
test('tag filter requires all tags', () => {
  const b = newBook({ tagIds: ['a', 'b'] }), c = newBook({ tagIds: ['a'] });
  assert.deepEqual(filterBooks([b, c], { tagIds: ['a', 'b'] }, ctx), [b]);
});
test('ownership and needsReview filters', () => { /* ownership:['owned'] drops released; needsReviewOnly keeps lookup not_found only */ });
test('kana sort orders volumes', () => {
  const v = n => newBook({ titleKana: 'ワンピース', volume: n });
  assert.deepEqual(sortBooks([v(10), v(2), v(1)], 'kana').map(b => b.volume), [1, 2, 10]);
});
test('isStale', () => {
  const exam = issued => newBook({ tagIds: ['exam'], issued });
  assert.equal(isStale(exam('2023-09'), 'exam', 2, '2026-10-24'), true);
  assert.equal(isStale(exam('2025-04'), 'exam', 2, '2026-10-24'), false);
  assert.equal(isStale(exam('2024-10'), 'exam', 2, '2026-10-24'), true);   // exactly 2 years
  assert.equal(isStale(exam(''), 'exam', 2, '2026-10-24'), false);
  assert.equal(isStale(newBook({ issued: '2010' }), 'exam', 2, '2026-10-24'), false); // no exam tag
});
test('ownedPriceSum', () => {
  assert.equal(ownedPriceSum([newBook({ price: 1400 }), newBook({ price: 500, ownership: 'released' }), newBook({ price: null })]), 1400);
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement the three modules.**
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: shelf search, filters, sort, stale rule, stats`

### Task 9: CSV and backup

**Files:**
- Create: `src/core/csv.js`, `src/core/backup.js`, `tests/csv.test.js`, `tests/backup.test.js`

**Interfaces:**
- Consumes: `LABELS`, `newBook` (Task 2), `toIsbn13` (Task 2).
- Produces:
  - `CSV_HEADER: string[]` (the 19 columns from Global Constraints, in order)
  - `booksToCsv(books: Book[], tags: Tag[]) -> string` — BOM + CRLF rows; values as in §6 (Japanese labels, `、` joins, tag names not ids, numbers blank when null, dates from `createdAt`/`updatedAt` cut to `YYYY-MM-DD`).
  - `parseCsv(text: string) -> string[][]` — strips BOM; RFC 4180 quotes, embedded commas/newlines, CRLF or LF.
  - `rowsToBooks(rows: string[][]) -> Array<{book: Book, tagNames: string[]}>` — throws `Error('CSVの見出しがスマホ書斎の形と違います')` unless `rows[0]` equals `CSV_HEADER`; skips empty lines; unknown labels fall back to model defaults; `lookup` = `'pending'` when isbn present and title empty, `'ok'` when isbn and title present, `'manual'` otherwise; `workKey` recomputed.
  - `csvFileName(today) -> '蔵書_YYYYMMDD.csv'`
  - `makeBackup({books, tags, settings}, nowIso) -> {app: 'sumaho-shosai', version: 1, exportedAt, books, tags, settings}` (`settings` is an array of `{key, value}`)
  - `validateBackup(obj) -> {ok: true} | {ok: false, reason: string}` — requires `app === 'sumaho-shosai'`, `version === 1`, arrays for books/tags/settings, and every book to have `id` and `title` strings.
  - `shouldRemindBackup({lastBackupAt, books, today}) -> boolean` — reference = `lastBackupAt` or the earliest `createdAt`; false when there are no books; true when 30+ days have passed since the reference or 50+ books were created after `lastBackupAt` (all books count when never backed up).
  - `backupFileName(today) -> 'スマホ書斎_バックアップ_YYYYMMDD.json'`

- [ ] **Step 1: Write failing tests**

```js
test('csv starts with BOM and exact header', () => {
  const csv = booksToCsv([], []);
  assert.ok(csv.startsWith('﻿ISBN,書名,書名の読み,著者,出版社,発行年月,ページ数,定価,作品名,巻,種類,持っているか,読んだか,タグ,メモ,登録日,読んだ日,手放した日,更新日'));
});
test('csv round-trip keeps tricky memo', () => {
  const tags = [{ id: 't1', name: 'TRPG', order: 0 }, { id: 't2', name: 'あとで 読む', order: 1 }];
  const b = newBook({ isbn: '9784763135476', title: '本', authors: ['A', 'B'], memo: '一行目, "引用"\n二行目', tagIds: ['t1', 't2'], ownership: 'released', readStatus: 'reading', format: 'ebook', price: 1400 });
  const [{ book, tagNames }] = rowsToBooks(parseCsv(booksToCsv([b], tags)));
  assert.equal(book.memo, b.memo); assert.deepEqual(book.authors, ['A', 'B']); assert.deepEqual(tagNames, ['TRPG', 'あとで 読む']);
  assert.equal(book.ownership, 'released'); assert.equal(book.readStatus, 'reading'); assert.equal(book.format, 'ebook'); assert.equal(book.price, 1400); assert.equal(book.isbn, '9784763135476');
});
test('rowsToBooks rejects a foreign header', () => { assert.throws(() => rowsToBooks([['title', 'author']]), /見出し/); });
test('isbn-only row is pending', () => {
  const rows = [CSV_HEADER, ['9784763135476', ...Array(18).fill('')]];
  assert.equal(rowsToBooks(rows)[0].book.lookup, 'pending');
});
test('validateBackup rejects foreign json', () => {
  assert.equal(validateBackup({ books: [] }).ok, false);
  assert.equal(validateBackup({ app: 'sumaho-shosai', version: 1, books: [{ id: 1 }], tags: [], settings: [] }).ok, false);
  assert.equal(validateBackup(makeBackup({ books: [newBook({ title: 'x' })], tags: [], settings: [] }, '2026-10-24T00:00:00Z')).ok, true);
});
test('shouldRemindBackup', () => {
  const old = newBook({ createdAt: '2026-09-01T00:00:00Z' });
  assert.equal(shouldRemindBackup({ lastBackupAt: '', books: [], today: '2026-10-24' }), false);
  assert.equal(shouldRemindBackup({ lastBackupAt: '', books: [old], today: '2026-10-24' }), true);         // 53 days
  assert.equal(shouldRemindBackup({ lastBackupAt: '2026-10-20T00:00:00Z', books: [old], today: '2026-10-24' }), false);
  const many = Array.from({ length: 50 }, () => newBook({ createdAt: '2026-10-22T00:00:00Z' }));
  assert.equal(shouldRemindBackup({ lastBackupAt: '2026-10-20T00:00:00Z', books: many, today: '2026-10-24' }), true);
});
test('file names', () => { assert.equal(csvFileName('2026-10-24'), '蔵書_20261024.csv'); assert.equal(backupFileName('2026-10-24'), 'スマホ書斎_バックアップ_20261024.json'); });
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement `csv.js` and `backup.js`.**
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: CSV export/import and backup rules`

### Task 10: App shell, PWA, local tooling, first real deploy

**Files:**
- Create: `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js`, `src/app.js`, `src/ui/dom.js`, `tools/serve.mjs`, `tools/make-icons.mjs`, `icons/icon-192.png`, `icons/icon-512.png`, `dev/seed.html`, `tests/fixtures/sample-books.csv`
- Delete: `spike/`
- Modify: `C:\Users\onisa\Documents\MyVault\.claude\launch.json` — add (or create the file with) a configuration `{"name":"sumaho-shosai","runtimeExecutable":"node","runtimeArgs":["C:/Users/onisa/Documents/sumaho-shosai/tools/serve.mjs"],"port":5173}`

**Interfaces:**
- Consumes: `openDb` (Task 5), `createLookupQueue` (Task 6), `parseCsv`, `rowsToBooks` (Task 9).
- Produces:
  - `src/ui/dom.js`: `h(tag, props = {}, ...children) -> HTMLElement`, `toast(message, {action?: {label, onClick}} = {})`, `confirmDialog(message, okLabel = 'OK') -> Promise<boolean>`, `sheet(contentEl) -> {close()}` (bottom sheet).
  - `src/app.js`: `Ctx = {db, lookup, feedback, navigate(tab), openDetail(bookId), openAdd(), refresh()}`; every screen module exports `mount(container: HTMLElement, ctx: Ctx) -> () => void` (the unmount function). Tabs via `location.hash`: `#scan` (default), `#shelf`, `#settings`. `openDetail`/`openAdd` are wired in Tasks 13 (until then they toast 「準備中」).
  - Boot order: `openDb()` → `navigator.storage.persist()` → `createLookupQueue` → `resumePending()` → listen to `online` → `resumePending()` → register `./sw.js` → mount the tab.
  - `sw.js`: `const VERSION = '1'`; cache name `sumaho-shosai-v${VERSION}`; precache `APP_FILES` (every file the app loads, including vendor files once Task 11 adds them); same-origin GET → cache first, then network; cross-origin requests are not intercepted; `skipWaiting()` on install, delete old caches and `clients.claim()` on activate. The app shows `toast('新しい版になりました', {action: {label: '再読み込み', onClick: () => location.reload()}})` on `controllerchange`. **Every later task that adds or renames a loaded file updates `APP_FILES` and bumps `VERSION`.**
  - `tools/serve.mjs`: zero-dependency static server for the repo root on port 5173 with correct MIME types (`.js`, `.mjs`, `.wasm`, `.webmanifest`, `.csv`, `.png`, `.svg`) and `Cache-Control: no-store`.
  - `dev/seed.html`: refuses to run unless `location.hostname === 'localhost'`; buttons 「サンプル30冊を入れる」 (imports `tests/fixtures/sample-books.csv` via `parseCsv`/`rowsToBooks`, creating tags), 「3000冊を入れる」 (synthetic books: 300 works × 10 volumes with kana titles), 「全部消す」.
  - `tests/fixtures/sample-books.csv`: app-format CSV with 30 books, every one with a valid ISBN (take real ISBNs from NDL title searches; ONE PIECE ISBNs from `opensearch?title=ONE%20PIECE`): ONE PIECE vols 1–12 and 14 (owned, tag マンガ), 3 exam books tagged 試験用 issued 2021-04, 2023-09 and 2026-03, 2 released books, 2 not_owned, 1 ebook, 1 with an empty title (lookup pending), the rest ordinary business books with real ISBNs from the NDL title-search fixture.
- Look: own design. Neutral warm paper-like background, one accent color, system Japanese font, minimum touch target 48 px, bottom tab bar with text labels (読み取る / 本棚 / 設定), header shows 「スマホ書斎」. Light theme only in v1 (the builder may add dark mode if it costs little).

- [ ] **Step 1: Write the shell, dom helpers, service worker, manifest, serve tool and icons.** Icons: `tools/make-icons.mjs` writes simple PNGs (accent background, a white book-spine motif) using only `node:zlib`; manifest `{"name":"自宅の書斎をスマホに入れよう","short_name":"スマホ書斎","start_url":"./","scope":"./","display":"standalone","lang":"ja", icons 192/512 with "purpose":"any maskable"}`.
- [ ] **Step 2: Write `dev/seed.html` and the sample CSV fixture.**
- [ ] **Step 3: Run** `npm test` — Expected: PASS (no regressions).
- [ ] **Step 4: Check in the browser pane.** `preview_start` with name `sumaho-shosai`; open `/`; switch the three tabs; run JS `(await navigator.serviceWorker.ready).active.state` → `"activated"`; reload and confirm `navigator.serviceWorker.controller !== null`; `read_console_messages` → no errors. Open `/dev/seed.html` → 「サンプル30冊を入れる」 → JS check `indexedDB` count 30 via `openDb().then(d => d.allBooks()).then(b => b.length)`.
- [ ] **Step 5: Delete `spike/`, commit** `feat: app shell, PWA and dev tooling`, **push** (already approved repo), and wait for Pages to rebuild.
- [ ] **Step 6: Phone check by 鬼さん** (Japanese instructions): open `https://onionsaki.github.io/sumaho-shosai/` in Chrome → ⋮ → 「ホーム画面に追加」 → open from the icon and confirm the name shows 「スマホ書斎」 → turn on airplane mode → reopen → the app still opens. Ask for a screenshot.

### Task 11: 読み取る tab (register and check modes)

**Files:**
- Create: `src/camera.js`, `src/feedback.js`, `src/ui/scan.js`, `vendor/barcode-detector/…`, `vendor/README.md`
- Modify: `sw.js` (`APP_FILES`, `VERSION`), `src/app.js` (mount scan tab)

**Interfaces:**
- Consumes: `classifyBarcode` (Task 2); `createConfirmer`, `applyScan`, `checkResult` (Task 7); `Db` (Task 5); lookup `enqueue`, `onUpdate`, `fetchInfo` (Task 6); `todayStr`, `newBook` (Task 2); dom helpers (Task 10).
- Produces:
  - `startCamera(video: HTMLVideoElement, {onCode(raw: string), onError(err)}) -> Promise<() => void>` — rear camera; native `BarcodeDetector` when `getSupportedFormats()` includes `ean_13`, otherwise the vendored polyfill; detects `['ean_13']` every 150 ms. On `localhost` only, also sets `window.__fakeScan = raw => onCode(raw)` for desktop checks.
  - `createFeedback() -> {unlock(), success(), duplicate(), error()}` — Web Audio sine beeps + `navigator.vibrate`: success 1320 Hz 80 ms + vibrate 40; duplicate 880 Hz 70 ms twice with a 60 ms gap + vibrate [40, 60, 40]; error 330 Hz 400 ms + vibrate 300. `unlock()` is called from the Start button tap. Silent no-ops when unsupported.
  - Settings keys added: `lastScanMode` (`'register'|'check'`).
- Vendoring: `npm pack barcode-detector@3.2.2`, copy its ES module build and the zxing `.wasm` into `vendor/barcode-detector/`, and configure the polyfill (its `prepareZXingModule`/override option) so the `.wasm` loads from `./vendor/barcode-detector/` — **it must never fetch from a CDN**. Record version, source and license in `vendor/README.md`.

Screen behavior (§4-1, §4-2):
- Top segmented control 登録 / 確認, remembered in `lastScanMode`.
- **Register:** a "before you start" panel with 持っているか (3 choices), 読んだか (3 choices), タグ (multi-select chips + create), prefilled from `lastSession`; 「始める」 saves `lastSession`, calls `feedback.unlock()`, requests a screen wake lock (re-acquired on `visibilitychange`), starts the camera. Each confirmed code: `classifyBarcode` → `isbn`: `db.getBookByIsbn` → `applyScan` → `db.putBook` → `lookup.enqueue` when created → `success()` for created / `duplicate()` for duplicate; `magazine` → `error()` + toast 「雑誌のバーコードです。手で登録してください」; `price`/`other` → nothing. The lower half shows 「今回 N冊」 and the last 5 results with a state label that updates via `lookup.onUpdate` (登録・情報を取得中 / 登録しました：書名 / 登録済み：書名 / 見つかりませんでした（あとで確認）/ 電波待ち). 「取り消し」 undoes only the latest result (`before === null` → delete; else put `before`). 「終える」 stops camera and wake lock and shows 「登録 N冊・登録済み N冊・見つからなかった N冊」 with a link to the shelf's あとで確認 filter.
- **Check:** camera starts on tap 「確認を始める」; nothing is written unless the user taps 「読みたいに追加」. Big result card from `checkResult`: owned → 「持っている」 + 「YYYY/MM/DD に登録」; owned_ebook → 「電子で持っている」; released → 「手放した（YYYY/MM/DD）」; not_owned → 「持っていない（読みたいに登録済み）」; unregistered → 「持っていない」 plus the title from `lookup.fetchInfo` when online, else 「登録なし」. When `work` exists: 「この作品：{summary.text}巻を持っている」 and, if `missing` is non-empty, 「{missing}巻は持っていない」. Each new result plays `success()` for owned/owned_ebook, `duplicate()` for released/not_owned, `error()` for unregistered (so the answer is audible). The check must not wait for the network for registered books.

- [ ] **Step 1: Vendor the polyfill and write `camera.js`, `feedback.js`, `scan.js`.**
- [ ] **Step 2: Run** `npm test` — Expected: PASS.
- [ ] **Step 3: Desktop check in the browser pane** (`/dev/seed.html` → サンプル30冊 first). Register mode: Start, then JS `__fakeScan('9784763135476')` twice → 「登録済み」 (sample has it); `__fakeScan(<an ISBN from tests/fixtures/ndl-title-search.xml that is not in the sample>)` twice → 「今回 1冊」 and, after the queue runs, a title; `__fakeScan('1920030014008')` twice → no change; `__fakeScan('4910123450123')` twice → toast 雑誌; 取り消し removes the last new book. Check mode: ONE PIECE vol 13 ISBN from the sample → card 「この作品：1〜12, 14巻を持っている」 and 「13巻は持っていない」. `read_network_requests` → no request to any CDN; `read_console_messages` → no errors.
- [ ] **Step 4: Commit** `feat: scan tab with register and check modes`, bump `VERSION`, push.
- [ ] **Step 5: Phone check by 鬼さん** (Japanese, exact taps): register 5 books including a manga and one book scanned twice; confirm sounds/vibration and that the screen stays on; switch to 確認 and scan a registered book and an unregistered one; turn on airplane mode and confirm 確認 still answers for the registered book. Ask how fast it felt and whether any book was misread.

### Task 12: 本棚 tab

**Files:**
- Create: `src/ui/shelf.js`
- Modify: `src/app.js`, `sw.js`

**Interfaces:**
- Consumes: `filterBooks`, `sortBooks`, `isStale` (Task 8); `groupWorks`, `summarizeVolumes` (Task 7); `booksToCsv`, `csvFileName`, `shouldRemindBackup` (Task 9); `Db.allBooks/allTags/getSetting`; `ctx.openDetail`, `ctx.openAdd`.
- Produces: `downloadText(fileName, text, mime)` in `src/ui/dom.js` (Blob + temporary `<a download>`), reused by Task 14.

Screen behavior (§4-3): search box (input debounced 150 ms); filter row: 持っているか, 読んだか, タグ (sheet with multi-select), 古いかも, あとで確認 (shows its count, hidden when 0); view toggle 本 / 作品; sort toggle 五十音 / 新しい順; list rows show cover (`loading="lazy"`, placeholder with the first characters of the title when empty or on error), title, author, a clear mark for anything other than 持っている, and 「古いかも」 when `isStale`. Work rows show `workTitle` and 「{text}（{missing}が抜け）」. Render the first 200 rows and append more on scroll. Banners at the top: backup reminder (when `shouldRemindBackup`) linking to 設定, あとで確認 count. 「＋」 button → `ctx.openAdd()`. Row → `ctx.openDetail(id)`. 「表示中の本をCSVで書き出す」 → `downloadText(csvFileName(today), booksToCsv(filtered, tags), 'text/csv')`. The shelf re-reads data on mount and on `ctx.refresh()`.

- [ ] **Step 1: Write `shelf.js` and `downloadText`.**
- [ ] **Step 2: Run** `npm test` — Expected: PASS.
- [ ] **Step 3: Browser pane check** with the 30-book seed: query 「わんぴーす」 → 13 rows; 作品 view → ONE PIECE row 「1〜12, 14（13が抜け）」; filter 試験用 + 古いかも → the 2021 and 2023 books only; あとで確認 shows the pending/not-found book; CSV export downloads a file whose first line is the exact header. Then 「全部消す」 → 「3000冊を入れる」 → JS-measure time from mount to first rows (`performance.now()` around `ctx.refresh()`): under 1000 ms; typing a query updates within 300 ms.
- [ ] **Step 4: Commit** `feat: shelf tab with search, filters and works view`, bump `VERSION`, push.

### Task 13: Book detail and add-without-barcode

**Files:**
- Create: `src/ui/detail.js`, `src/ui/add.js`
- Modify: `src/app.js` (wire `openDetail`, `openAdd`), `sw.js`

**Interfaces:**
- Consumes: `Db`; lookup `refetch`, `searchByTitle`, `fetchInfo`, `enqueue`; `toIsbn13`, `newBook`, `todayStr`, `LABELS`; `workKeyOf` (Task 3); dom helpers.
- Produces: `openDetail(bookId)` and `openAdd()` as bottom sheets; both call `ctx.refresh()` after saving.

Detail (§4-4): cover, title, authors, publisher, issued, pages, price, 作品名・巻, 種類; segmented controls for 持っているか and 読んだか (setting `read` fills `readAt` with today when empty; setting `released` fills `releasedAt` when empty; both dates are editable); tag chips with 「＋」 opening a tag sheet that filters existing tags as you type and offers 「『…』を作る」 when no exact match (`db.createTag`); memo textarea saved 500 ms after typing stops and on blur (no save button); 「情報を直す」 form for title, 読み, authors (separated by 、), publisher, issued, pages, price, 作品名, 巻, 種類, ISBN (validated with `toIsbn13`; reject a duplicate ISBN with a message); 「本の情報を取り直す」 (`lookup.refetch`; disabled without ISBN); 「この作品の次の巻を追加」 on books with `lookup === 'manual'` (copies workTitle, workKey, authors, tagIds, format, ownership, readStatus; volume + 1; title `${workTitle} ${volume}`; opens the new book); 「削除」 behind `confirmDialog`.

Add (§4-5), three sections in one sheet:
1. 書名で探す: title (required) + author → `searchByTitle` → result list (title, author, issued, volume) → choose → choose 紙/電子, 持っているか, 読んだか → save as `lookup:'ok'`. If the ISBN already exists, open that book instead with toast 「登録済みです」.
2. ISBNで登録: `toIsbn13` → existing? open it : `fetchInfo` → save (`lookup` `'ok'`, or `'pending'` when offline/null).
3. 手で入れる: 書名 (required), 著者, 作品名, 巻, 紙/電子 → `lookup:'manual'`; warn 「同じ本かもしれません」 when a book with the same normalized title and volume exists, but still allow saving.

- [ ] **Step 1: Write `detail.js` and `add.js`, wire them in `app.js`.**
- [ ] **Step 2: Run** `npm test` — Expected: PASS.
- [ ] **Step 3: Browser pane check:** open a book, change 読んだか → 読んだ and confirm `readAt` is set; add tag 「保留」 (new) and confirm it appears in the tag filter; type a memo with line breaks, close and reopen → kept; 書名で探す 「すごい読書術」 → pick a result → registered; ISBN entry `4-7631-3547-8` → 登録済み toast; 手で入れる a manga vol 1 → 「次の巻を追加」 → vol 2 exists; 作品 view groups them.
- [ ] **Step 4: Commit** `feat: book detail and add-without-barcode`, bump `VERSION`, push.

### Task 14: 設定 tab

**Files:**
- Create: `src/ui/settings.js`
- Modify: `src/app.js`, `sw.js`

**Interfaces:**
- Consumes: `Db` (tags, settings, `replaceAll`, `addBooksSkippingDuplicates`); `booksToCsv`, `csvFileName`, `parseCsv`, `rowsToBooks`, `makeBackup`, `validateBackup`, `backupFileName` (Task 9); `ownedPriceSum`, `countOwned` (Task 8); lookup `enqueue`; `downloadText` (Task 12).

Screen behavior (§4-6, §6):
- タグ: list in order with rename, move up/down, 「まとめる」 (merge into another tag), delete (confirm shows how many books use it).
- 古い参考書の判定: tag select (default 試験用), years 1–10 (default 2).
- 書き出し: 「全部をCSVで書き出す」.
- 取り込み: file input (`.csv`) → `parseCsv` → `rowsToBooks` (show the error message and stop on a bad header) → create missing tags by name → `addBooksSkippingDuplicates` → `enqueue` pending ones → toast 「追加 N冊、重複で飛ばした N冊」.
- バックアップ: 「バックアップを作る」 → `downloadText(backupFileName(today), JSON.stringify(makeBackup(…)), 'application/json')` → `setSetting('lastBackupAt', now)`; shows 「前回：YYYY/MM/DD」 or 「まだありません」. 「バックアップから戻す」 → file → `JSON.parse` (catch) → `validateBackup` → on failure show the reason and change nothing → `confirmDialog('今のデータを全部、このバックアップの中身に置き換えます。よろしいですか？', '置き換える')` → `replaceAll` → reload.
- 情報: 持っている本 N冊 (`countOwned`), 定価の合計 ¥N (`ownedPriceSum`, comma-grouped), 登録の合計 N冊, データの保護 有効/無効 (`navigator.storage.persisted()`).

- [ ] **Step 1: Write `settings.js`.**
- [ ] **Step 2: Run** `npm test` — Expected: PASS.
- [ ] **Step 3: Browser pane check:** rename a tag and see it on a book; merge two tags; backup → 全部消す (seed page) → restore → 30 books back; restore a hand-made `{"foo":1}` file → error shown and data unchanged; import the sample CSV twice → second time 「追加 0冊、重複で飛ばした 30冊」 (every sample book has an ISBN); totals show the sum of owned prices.
- [ ] **Step 4: Commit** `feat: settings tab with tags, CSV, backup and stats`, bump `VERSION`, push.

### Task 15: 積読リスト migration and acceptance on the phone

**Files:**
- Create: `G:\マイドライブ\スマホ書斎\積読リスト_取り込み.csv` (app-format CSV)
- Modify (only after 鬼さん approves each change): `MyVault\Business-Ideas\積読リスト.md`, `MyVault\Library\●使い方.md`, spec §9 (results)

**Interfaces:**
- Consumes: the app's CSV format (Task 9), the deployed app.

- [ ] **Step 1: Convert the table.** Read the 一覧 table in `積読リスト.md`. For each row build an app-format CSV row: title, author, state mapped 未読→まだ / 読書中→読書中 / 読了→読んだ / 保留→まだ + tag 保留; memo = `なぜ買ったか：…` and `学び：…` lines (omit empty); tags = the row's `#tags` without `#`; ISBN from `searchByTitle`-equivalent NDL title search when exactly one confident match, else blank.
- [ ] **Step 2: Ask 鬼さん about ownership and uncertain ISBNs** in one message, using the code-block list format (`題材 / 推測： / →`), one entry per book: 推測 = 持っている or 持っていない（気になっているだけ）. Apply the answers.
- [ ] **Step 3: Write the CSV** to `G:\マイドライブ\スマホ書斎\` and tell 鬼さん how to import it: 設定 → 取り込み → ファイルを選ぶ → Googleドライブ → スマホ書斎 → the file. Confirm the toast numbers match.
- [ ] **Step 4: Acceptance with 鬼さん** — walk through the spec's 出来栄えの基準 and 成功の姿 in Japanese, one at a time: sound within a second of scanning; no taps needed per book; no misread book after 20 scans; check mode answers offline within a second; closing the app mid-session loses nothing; a manga's missing volume is shown in the bookstore check; an old exam book shows 古いかも. Record each result in spec §9 under `### v1 の受け入れ確認（日付）`.
- [ ] **Step 5: Retire the old flow, with approval.** Ask 鬼さん how to retire the 積読リスト table (delete the table, or replace it with a one-line note 「2026-10-xx にスマホ書斎へ移した」) and whether to remove the QuickAdd/スマホ共有 sections from `Library/●使い方.md`. Make only the approved edits.
- [ ] **Step 6: Tag the release** `git tag v1.0.0 && git push --tags` and offer a Session-Log of the build (session-log skill).
