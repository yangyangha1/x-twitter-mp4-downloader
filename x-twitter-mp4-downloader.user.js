// ==UserScript==
// @name         X/Twitter MP4 direct links + download
// @namespace    local.codex
// @version      1.7.1
// @updateURL    https://raw.githubusercontent.com/yangyangha1/x-twitter-mp4-downloader/main/x-twitter-mp4-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/yangyangha1/x-twitter-mp4-downloader/main/x-twitter-mp4-downloader.user.js
// @description  Copy all media links or download all videos and images from X/Twitter posts.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      api.fxtwitter.com
// @connect      video.twimg.com
// @connect      pbs.twimg.com
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const postSelector = 'article[data-testid="tweet"]';
  const mp4Cache = new Map();

  const style = document.createElement('style');
  style.textContent = `
    article[data-testid="tweet"] [role="group"][data-x-mp4-group="1"] {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      width: 100% !important;
      max-width: none !important;
      gap: 0 !important;
      box-sizing: border-box !important;
    }

    article[data-testid="tweet"] [role="group"][data-x-mp4-group="1"] > * {
      flex: 0 0 auto !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
      min-width: 0 !important;
    }

    .x-mp4-action-item {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex: 0 0 auto !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    .x-mp4-button {
      appearance: none !important;
      background: transparent;
      border: 0;
      border-radius: 9999px;
      color: rgb(83, 100, 113);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 34px;
      margin: 0;
      padding: 0 4px;
      font: inherit;
      font-size: 12px;
      font-weight: 400;
      line-height: 1;
      transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
    }

    .x-mp4-button:hover {
      color: rgb(29, 155, 240);
      background: rgba(29, 155, 240, 0.1);
    }

    .x-mp4-button:disabled {
      cursor: default;
    }

    .x-mp4-button.x-mp4-copied,
    .x-mp4-button.x-mp4-copied:hover {
      color: rgb(0, 186, 124);
    }

    .x-mp4-button.x-mp4-copied:hover {
      background: rgba(0, 186, 124, 0.1);
    }
  `;
  document.head.appendChild(style);

  function getPostReference(article) {
    const links = [...article.querySelectorAll('a[href*="/status/"]')]
      .filter(link => link.closest(postSelector) === article);
    const permalink = links.find(link => link.querySelector('time')) || links[0];
    if (!permalink) return null;

    const path = new URL(permalink.href, location.origin).pathname;
    const match = path.match(/^\/([^/]+)\/(?:web\/)?status\/(\d+)(?:\/|$)/);
    const idOnly = path.match(/\/status\/(\d+)(?:\/|$)/);
    if (!match && !idOnly) return null;

    return { handle: match ? match[1] : 'i', id: match ? match[2] : idOnly[1] };
  }

  function requestPost(handle, id) {
    const url = 'https://api.fxtwitter.com/' + encodeURIComponent(handle) + '/status/' + id;
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { Accept: 'application/json' },
        anonymous: true,
        timeout: 15000,
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error('API HTTP ' + response.status));
            return;
          }
          try {
            const tweet = JSON.parse(response.responseText)?.tweet;
            if (!tweet) throw new Error('没有 tweet 数据');
            resolve(tweet);
          } catch {
            reject(new Error('API 数据解析失败'));
          }
        },
        onerror: () => reject(new Error('API 请求失败')),
        ontimeout: () => reject(new Error('API 请求超时'))
      });
    });
  }

  function isMp4Url(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:'
        && url.hostname === 'video.twimg.com'
        && /\.mp4$/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function bestMp4(video) {
    const formats = (Array.isArray(video?.formats) ? video.formats : [])
      .filter(format => isMp4Url(format?.url)
        && (!format.container || format.container === 'mp4'))
      .sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0)
        || (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));

    if (formats.length) return formats[0].url;
    return isMp4Url(video?.url) ? video.url : null;
  }

  function cleanMp4Url(value) {
    if (!isMp4Url(value)) return null;
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.href;
  }

  function cleanTweetText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function photoMedia(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'pbs.twimg.com'
      || !url.pathname.startsWith('/media/')) throw new Error('图片链接无效');
    const format = (url.searchParams.get('format')
      || url.pathname.match(/\.(jpg|jpeg|png|webp|gif)(?::\w+)?$/i)?.[1] || '').toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(format)) {
      throw new Error('不支持的图片格式');
    }
    url.pathname = url.pathname.replace(/:\w+$/, '');
    url.searchParams.set('name', 'orig');
    url.hash = '';
    return { url: url.href, extension: '.' + format };
  }

  function collectMedia(tweet) {
    const data = tweet?.media || {};
    const items = Array.isArray(data.all) && data.all.length ? data.all : [
      ...(Array.isArray(data.videos) ? data.videos : []),
      ...(Array.isArray(data.photos) ? data.photos : [])
    ];
    const media = items.map(item => {
      if (item.type === 'photo' || (!item.formats && !isMp4Url(item.url))) {
        return photoMedia(item.url);
      }
      const url = cleanMp4Url(bestMp4(item));
      if (!url) throw new Error('帖子中有视频没有可用 MP4');
      return { url, extension: '.mp4' };
    });
    const seen = new Set();
    return media.filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }

  function sanitizeFilename(value) {
    return String(value || '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/[\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .trim();
  }

  function buildFilename(ref, text, authorName, authorHandle, extension = '.mp4', index = 0, total = 1) {
    const name = sanitizeFilename(authorName || ref.handle);
    const handle = sanitizeFilename(authorHandle || ref.handle).replace(/^@+/, '');
    const prefix = name + '@' + handle + '-';
    const suffix = (total > 1 ? '-' + (index + 1) : '') + extension;
    let content = sanitizeFilename(cleanTweetText(text)) || ref.id;

    // Windows has a 255-character component limit; leave room for path/tool differences.
    const availableLength = Math.max(1, 220 - prefix.length - suffix.length);
    if (content.length > availableLength) content = content.slice(0, availableLength);
    return prefix + content + suffix;
  }

  async function resolveMedia(article) {
    const ref = getPostReference(article);
    if (!ref) throw new Error('找不到帖子 ID');

    const cacheKey = ref.handle + ':' + ref.id;
    if (mp4Cache.has(cacheKey)) return mp4Cache.get(cacheKey);

    const tweet = await requestPost(ref.handle, ref.id);
    const media = collectMedia(tweet);
    if (!media.length) throw new Error('这条帖子没有可下载的视频或图片');

    const result = {
      ref,
      media,
      text: tweet?.text || '',
      authorName: tweet?.author?.name || tweet?.author?.display_name || ref.handle,
      authorHandle: tweet?.author?.screen_name
        || tweet?.author?.screenName
        || tweet?.author?.username
        || ref.handle
    };
    mp4Cache.set(cacheKey, result);
    return result;
  }

  function createSvgIcon(pathData, size = 18) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
    return svg;
  }

  function createActionItem() {
    const wrapper = document.createElement('div');
    wrapper.className = 'x-mp4-action-item';
    wrapper.dataset.xMp4Action = '1';
    return wrapper;
  }

  function downloadMedia(url, filename) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        timeout: 120000,
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error('媒体 HTTP ' + response.status));
            return;
          }

          const blob = response.response;
          if (!blob || blob.size === 0) {
            reject(new Error('媒体数据为空'));
            return;
          }

          try {
            const blobUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = blobUrl;
            anchor.download = filename;
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            try {
              anchor.click();
            } finally {
              anchor.remove();
              setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        onerror: () => reject(new Error('媒体下载失败')),
        ontimeout: () => reject(new Error('媒体下载超时'))
      });
    });
  }

  async function downloadAllMedia(result, onProgress, download = downloadMedia) {
    const failures = [];
    for (let index = 0; index < result.media.length; index++) {
      const item = result.media[index];
      const filename = buildFilename(result.ref, result.text, result.authorName,
        result.authorHandle, item.extension, index, result.media.length);
      onProgress(index + 1, result.media.length, filename);
      try {
        await download(item.url, filename);
      } catch (error) {
        failures.push(filename + ': ' + error.message);
      }
    }
    if (failures.length) throw new Error('失败 ' + failures.length + '/' + result.media.length
      + ' 项：\n' + failures.join('\n'));
  }

  function addButtons(article) {
    const group = article.querySelector('[role="group"]');
    if (!group || group.dataset.xMp4Installed === '1') return;

    group.dataset.xMp4Installed = '1';
    group.dataset.xMp4Group = '1';

    const copyWrapper = createActionItem();
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'x-mp4-button';
    copyButton.setAttribute('aria-label', '复制全部媒体链接');
    copyButton.title = '复制全部视频和图片链接，每行一个';
    const copyIcon = createSvgIcon(
      'M15 8V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H8 M10.5 8h7A2.5 2.5 0 0 1 20 10.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 8 17.5v-7A2.5 2.5 0 0 1 10.5 8z',
      17
    );
    const copyLabel = document.createElement('span');
    copyLabel.textContent = '链接';
    copyButton.append(copyIcon, copyLabel);
    copyWrapper.appendChild(copyButton);

    let hasCopied = false;
    let copyStatusTimer;
    copyButton.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(copyStatusTimer);
      copyButton.disabled = true;
      copyButton.style.opacity = '0.55';
      copyLabel.textContent = '解析…';

      try {
        const result = await resolveMedia(article);
        const links = result.media.map(item => item.url).join('\r\n');
        GM_setClipboard(links, 'text');
        hasCopied = true;
        copyButton.classList.add('x-mp4-copied');
        copyLabel.textContent = '已复制';
        copyButton.title = links;
      } catch (error) {
        copyLabel.textContent = '重试';
        copyButton.title = error.message;
        copyStatusTimer = setTimeout(() => {
          if (!copyButton.isConnected) return;
          copyLabel.textContent = hasCopied ? '已复制' : '链接';
          copyButton.title = hasCopied ? '已复制全部媒体链接' : '复制全部媒体链接';
        }, 2500);
      } finally {
        copyButton.disabled = false;
        copyButton.style.opacity = '1';
      }
    });

    const downloadWrapper = createActionItem();
    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.className = 'x-mp4-button';
    downloadButton.setAttribute('aria-label', '下载全部媒体');
    downloadButton.title = '下载全部视频和图片';
    downloadButton.appendChild(createSvgIcon('M12 3v12 M7.5 10.5 12 15l4.5-4.5 M5 20h14'));
    downloadWrapper.appendChild(downloadButton);

    downloadButton.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      downloadButton.disabled = true;
      downloadButton.style.opacity = '0.45';

      try {
        const result = await resolveMedia(article);
        await downloadAllMedia(result, (current, total, filename) => {
          downloadButton.title = '正在下载 ' + current + '/' + total + '：' + filename;
        });
        downloadButton.style.color = '#00ba7c';
        downloadButton.title = '已提交全部 ' + result.media.length + ' 项到浏览器下载';
        setTimeout(() => {
          if (!downloadButton.isConnected) return;
          downloadButton.style.color = '';
          downloadButton.title = '下载全部视频和图片';
        }, 1800);
      } catch (error) {
        downloadButton.style.color = '#f4212e';
        downloadButton.title = '下载失败：' + error.message;
      } finally {
        downloadButton.disabled = false;
        downloadButton.style.opacity = '1';
      }
    });

    group.append(copyWrapper, downloadWrapper);
  }

  function scan(root) {
    if (root.matches?.(postSelector)) addButtons(root);
    root.querySelectorAll?.(postSelector).forEach(addButtons);
  }

  scan(document);
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE || node.hasAttribute('data-x-mp4-action')) continue;
        const article = node.closest(postSelector);
        if (article) addButtons(article);
        scan(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
