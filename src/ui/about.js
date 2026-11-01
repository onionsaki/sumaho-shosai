// このアプリについて: privacy policy, disclaimer and credits (鬼さん 2026-11-01). Kept inside the app so it can be
// read offline. NDL asks every app using its API to say so; Rakuten asks for its credit snippet unchanged
// (https://webservice.rakuten.co.jp/guide/credit), so the text link below is copied as given.

import { h, sheet } from './dom.js';

const ESTABLISHED = '2026年11月1日';

const section = (title, ...body) => h('section', { class: 'about-section' }, h('h3', {}, title), ...body);
const p = text => h('p', {}, text);
const list = items => h('ul', { class: 'about-list' }, items.map(t => h('li', {}, t)));
const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

// The Rakuten credit, exactly as Rakuten supplies it (text version).
export const rakutenCredit = () => link('https://developers.rakuten.com/', 'Supported by Rakuten Developers');

export function openAbout() {
  sheet(h('div', { class: 'about' },
    p('「自宅の書斎をスマホに入れよう」（スマホ書斎）は、持っている本・漫画・雑誌を家の外でも確かめるための、個人が作って運営しているアプリです。楽天グループや国立国会図書館などが提供しているものではありません。'),

    section('プライバシーポリシー',
      p('このアプリは、利用する人の情報を作者のところへ集めません。'),
      list([
        'データの置き場所：登録した本・メモ・写真・設定は、使っているスマホのブラウザ（Chrome）の中だけに保存します。作者のサーバーはなく、作者がデータを見ることはできません',
        '外へ送るもの：本の情報を調べるとき、ISBN・書名・著者名を、国立国会図書館サーチ・openBD・楽天ブックスと Google Books（それぞれ鍵を入れた場合）に送ります。メモや写真は送りません',
        '写真の文字読み取り：数字の読み取りは、スマホの中で行います。写真は外へ送りません',
        '楽天と Google Books の鍵：入れた鍵はスマホの中だけに保存し、バックアップのファイルにも含めません',
        '広告・アクセス解析：使っていません',
        'データを消すには：Chromeの設定で、このサイトのデータを削除すると、すべて消えます。消したデータは、バックアップがなければ元に戻せません',
      ])),

    section('免責',
      list([
        '本の情報（書名・発行年月・ページ数・表紙など）は外部のサービスから取得しているため、誤りや抜けがあることがあります',
        '「古いかも」「新しい版」は目安です。実際の改訂や内容の新しさを保証するものではありません',
        'データはスマホの中だけにあるため、機種変更・故障・ブラウザのデータ削除で失われることがあります。大切なデータは「バックアップを作る」で保存してください。データが失われたことによる損害について、作者は責任を負いかねます',
        'このアプリは、予告なく内容を変えたり、提供をやめたりすることがあります',
      ])),

    section('クレジット',
      list([
        h('span', {}, '本の情報は、', link('https://ndlsearch.ndl.go.jp/', '国立国会図書館サーチ'), 'のAPIを利用して取得しています'),
        h('span', {}, '本の情報と表紙の一部は、', link('https://openbd.jp/', 'openBD'), 'を利用しています'),
        h('span', {}, '表紙の一部は楽天ブックスから取得しています（鍵を入れた場合）：', rakutenCredit()),
        h('span', {}, '表紙の一部は ', link('https://books.google.com/', 'Google Books'), ' から取得しています（鍵を入れた場合）'),
        'バーコードの読み取り：zxing-wasm（MIT License）、barcode-detector（MIT License）',
        '写真の文字の読み取り：Tesseract.js（Apache License 2.0）',
        'アイコン：Lucide（ISC License）',
      ])),

    h('p', { class: 'muted small' }, `制定：${ESTABLISHED}`)),
  { title: 'このアプリについて', thumbClose: true });
}
