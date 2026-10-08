const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const saved = [];

function element() {
  return {
    dataset: {}, style: {}, children: [], events: {}, isConnected: true,
    classList: { add() {} }, setAttribute() {},
    append(...items) { this.children.push(...items); },
    appendChild(item) { this.append(item); },
    addEventListener(name, callback) { this.events[name] = callback; },
    click() { saved.push(this.download); }, remove() {}
  };
}

const video = { type: 'video', url: 'https://video.twimg.com/a.mp4?tag=1', formats: [
  { url: 'https://video.twimg.com/low.mp4', height: 360 },
  { url: 'https://video.twimg.com/high.mp4?tag=29', height: 1080 }
] };
const tweet = { text: '正文', author: { name: '用户', screen_name: 'user' }, media: { all: [
  video,
  { type: 'photo', url: 'https://pbs.twimg.com/media/a.jpg' },
  { type: 'video', url: 'https://video.twimg.com/b.mp4', formats: [] },
  { type: 'photo', url: 'https://pbs.twimg.com/media/b?format=png&name=small' }
] } };
let clipboard;
const context = vm.createContext({
  URL: class extends URL {
    static createObjectURL() { return 'blob:mock'; }
    static revokeObjectURL() {}
  }, console, setTimeout() {}, clearTimeout() {},
  document: { createElement: element, createElementNS: element, head: element(), body: element() },
  location: { origin: 'https://x.com' },
  GM_setClipboard(value) { clipboard = value; },
  GM_xmlhttpRequest(request) {
    request.onload({ status: 200, responseText: JSON.stringify({ tweet }), response: { size: 1 } });
  }
});
const source = fs.readFileSync(__dirname + '/x-twitter-mp4-downloader.user.js', 'utf8');
vm.runInContext(source.replace('  scan(document);',
  '  globalThis.api = { collectMedia, buildFilename, downloadAllMedia, addButtons }; return;'), context);
const { collectMedia, buildFilename, downloadAllMedia, addButtons } = context.api;

(async () => {
  const media = collectMedia(tweet);
  assert.equal(media.length, 4);
  assert.equal(media[0].url, 'https://video.twimg.com/high.mp4');
  assert.equal(media[1].url, 'https://pbs.twimg.com/media/a.jpg?name=orig');
  assert.equal(media[3].extension, '.png');
  assert.equal(collectMedia({ media: { videos: [video], photos: [tweet.media.all[1]] } }).length, 2);
  assert.equal(collectMedia({ media: { all: [video, video] } }).length, 1);
  assert.equal(collectMedia({ media: { photos: [tweet.media.all[1], tweet.media.all[3]] } }).length, 2);
  assert.throws(() => collectMedia({ media: { photos: [{ type: 'photo', url: 'https://evil.test/a.jpg' }] } }));
  assert.throws(() => collectMedia({ media: { videos: [{ type: 'video', url: 'https://video.twimg.com/a.m3u8' }] } }));
  const ref = { handle: 'user', id: '123' };
  assert.equal(buildFilename(ref, '正文', '用户', '@user'), '用户@user-正文.mp4');
  assert.equal(buildFilename(ref, '正文', '用户', 'user', '.jpg', 1, 4), '用户@user-正文-2.jpg');
  assert.equal(buildFilename(ref, '', '用户', 'user'), '用户@user-123.mp4');
  assert.ok(buildFilename(ref, '长'.repeat(400), '用户', 'user', '.png', 1, 4).length <= 220);

  const attempted = [];
  const result = { ref, text: '正文', authorName: '用户', authorHandle: 'user', media };
  await assert.rejects(downloadAllMedia(result, () => {}, async (url, filename) => {
    attempted.push(filename);
    if (attempted.length === 2) throw new Error('模拟下载失败');
  }), /失败 1\/4/);
  assert.equal(attempted.length, 4);
  assert.equal(new Set(attempted).size, 4);

  const group = element();
  const article = { querySelector: () => group };
  const link = { href: 'https://x.com/user/status/123', closest: () => article, querySelector: () => ({}) };
  article.querySelectorAll = () => [link];
  addButtons(article);
  const copy = group.children[0].children[0];
  const click = { preventDefault() {}, stopPropagation() {} };
  await copy.events.click(click);
  assert.equal(clipboard, media.map(item => item.url).join('\r\n'));
  assert.equal(copy.children[1].textContent, '已复制');
  const download = group.children[1].children[0];
  await download.events.click(click);
  assert.equal(saved.length, 4);
  assert.equal(saved[0], '用户@user-正文-1.mp4');
  assert.equal(saved[3], '用户@user-正文-4.png');
  assert.equal(download.disabled, false);
  assert.equal(copy.disabled, false);
  clipboard = '';
  await copy.events.click(click);
  assert.equal(clipboard.split('\r\n').length, 4);
  assert.equal(copy.children[1].textContent, '已复制');
  console.log('PASS: all media, filenames, clipboard, and batch failure handling');
})().catch(error => { console.error(error); process.exitCode = 1; });
