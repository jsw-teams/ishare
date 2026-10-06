# 黑熊品牌素材

使用内置 imagegen 生成，源图在本机生成目录保留；本项目保存裁剪和压缩后的发布素材。未使用 CLI 或 API Key。

- 图标提示：友好的黑熊吉祥物，炭黑圆耳、暖白口鼻与胸前月牙纹，抱着照片卡片；正面半身、透明背景、清晰轮廓，适合 32px 图标；不含文字与水印。
- 横幅提示：以上黑熊为形象参考，在右侧分享照片，三张照片或视频卡片，奶油白背景、草木绿山景，左侧留白供 HTML 标题使用；宽幅、无文字与水印。

素材在 `content/assets/brand/`，文件名包含内容哈希。桌面横幅 1600×640，移动横幅 800×320；吉祥物 512×512，触屏图标 180×180，favicon 32×32。页面使用本地素材，不请求第三方图片。

## 图标生成提示

```text
Use case: logo-brand. Asset type: ishare website icon and mascot, square composition. Create one original friendly black bear mascot, charcoal-black rounded ears and head, small warm ivory muzzle, subtle crescent chest patch, gentle curious expression, holding a tiny simple photograph card. Polished restrained editorial illustration, crisp bold silhouette, soft minimal shading, charcoal and warm cream with a small muted green accent. Front view bust, centered, generous clear outer margin; readable at 32px. Genuine transparent background. No words, letters, watermark, badge border, extra characters, collage, or background scene. This bear will identify an image and video sharing website.
```

## 横幅生成提示

以图标生成结果作为形象参考。

```text
Use case: illustration-story. Asset type: wide website hero banner for ishare, image and video sharing. Input image is a reference for the EXACT mascot identity: same friendly charcoal black bear, rounded ears, ivory muzzle and crescent chest patch, small gentle expression. Create a polished wide editorial illustration: this black bear on the RIGHT half, sharing a small photograph card, surrounded by only three simple floating paper photo/video frames with stylized green mountains, a warm little sun, and one clean play triangle. Cream-paper backdrop, restrained sage and forest green shapes, charcoal bear, warm apricot accent, subtle soft texture, beautifully balanced quiet modern web illustration. LEFT half should be mostly clear warm cream negative space for actual HTML headline to overlay; bear and meaningful scene confined right-of-center with ample crop-safe margin at top bottom right. Panoramic landscape composition about 2.5:1. No words, logos, UI screenshot, watermark, extra characters, crowded decorative shapes. Bear illustration must feel consistent with reference.
```

英文与简繁中文字符标识使用内置 imagegen 生成，沿用黑熊吉祥物。透明 PNG 原图保存在 `content/assets/brand/sources/wordmark-imagegen.png`；三种语言仅进行裁剪、留白和尺寸优化，输出带内容哈希的透明 WebP，用于导航、页脚与帖子品牌入口。

生成提示：以既有黑熊头像为形象参考，在透明画布上生成三行横向品牌图，文字分别为 `ishare`、`爱分享`、`愛分享`，深青绿色圆润字形配浅色描边，三行保持同一黑熊形象。无额外标语、水印或背景。
