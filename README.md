# X/Twitter MP4 Downloader

Tampermonkey userscript for X/Twitter posts with videos or images. It adds a copy-link button and a download button to each post's action bar. Current version: **1.7.1**.

## Features

- Resolves the post's MP4 through the FxTwitter API and selects the highest available resolution (then bitrate).
- Copies **all video and image links**, one link per line (CRLF). The button keeps showing `已复制` after success and remains available for another click.
- Downloads **all videos and images** in a post. Videos use the highest available MP4 quality; images request their original size.
- Multiple files receive numbered suffixes (`-1`, `-2`, etc.). If a download fails, the script continues with the remaining files and reports the failures in the button tooltip.
- Supports `x.com` and `twitter.com` and watches for posts loaded dynamically while scrolling.
- Spreads action-bar controls across the available width.

## Install

1. Install the [Tampermonkey browser extension](https://www.tampermonkey.net/).
2. Open [`x-twitter-mp4-downloader.user.js`](x-twitter-mp4-downloader.user.js) on GitHub and choose **Raw**; Tampermonkey will offer to install it.
3. Confirm the requested permissions for `api.fxtwitter.com`, `video.twimg.com`, and `pbs.twimg.com`.
4. Reload X/Twitter. Use the link button to copy all media URLs, or the download arrow to save all media files. If the browser asks, allow multiple downloads for X/Twitter.

The script includes explicit `@updateURL` and `@downloadURL` links to the GitHub Raw file. Update checks follow your userscript manager's settings.

## Filename

Downloads use this format:

```text
显示用户名@用户ID-推文正文.mp4
```

For example: `马斯克@elonmusk-Starship flight test.mp4`. A post with multiple media files uses names such as `马斯克@elonmusk-Starship flight test-1.mp4` and `马斯克@elonmusk-Starship flight test-2.jpg`. Images retain their image format. Characters that Windows does not allow in filenames are replaced with `_`. The post text is shortened only when needed to keep the filename within 220 characters; an empty post text falls back to the post ID.

## Dependencies and permissions

- Tampermonkey (or a compatible userscript manager supporting `GM_xmlhttpRequest` and `GM_setClipboard`).
- FxTwitter's public post API at `api.fxtwitter.com` to read post and video metadata.
- `video.twimg.com` for MP4 URLs and video downloads.
- `pbs.twimg.com` for original-size images.
- No external JavaScript libraries or build step.

## Check

Run `node test-media.cjs` to check mixed media, quality selection, filename numbering, repeated copying, and continuing a batch after a download failure.
