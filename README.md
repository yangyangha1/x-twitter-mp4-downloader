# X/Twitter MP4 Downloader

Tampermonkey userscript for X/Twitter posts with video. It adds a copy-link button and a download button to each post's action bar.

## Features

- Resolves the post's MP4 through the FxTwitter API and selects the highest available resolution (then bitrate).
- Copies the first video's clean `.mp4` URL. The button keeps showing `已复制` after success and remains available for another click.
- Downloads the first video as an MP4 with a readable filename instead of a generated UUID name.
- Supports `x.com` and `twitter.com` and watches for posts loaded dynamically while scrolling.
- Spreads action-bar controls across the available width.

## Install

1. Install the [Tampermonkey browser extension](https://www.tampermonkey.net/).
2. Open [`x-twitter-mp4-downloader.user.js`](x-twitter-mp4-downloader.user.js) on GitHub and choose **Raw**; Tampermonkey will offer to install it.
3. Confirm the requested permissions for `api.fxtwitter.com` and `video.twimg.com`.
4. Reload X/Twitter. Posts with video will show link and download buttons in the action bar.

## Filename

Downloads use this format:

```text
x-显示用户名@用户ID-推文正文.mp4
```

For example: `x-马斯克@elonmusk-Starship flight test.mp4`. Characters that Windows does not allow in filenames are replaced with `_`. The post text is shortened only when needed to keep the filename within 220 characters; an empty post text falls back to the post ID.

## Dependencies and permissions

- Tampermonkey (or a compatible userscript manager supporting `GM_xmlhttpRequest` and `GM_setClipboard`).
- FxTwitter's public post API at `api.fxtwitter.com` to read post and video metadata.
- `video.twimg.com` for MP4 URLs and video downloads.
- No external JavaScript libraries or build step.
