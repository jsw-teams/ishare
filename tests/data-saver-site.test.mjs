import {fileURLToPath} from 'node:url';
import {registerDataSaverTests} from 'edgepress/tools/verification/data-saver-site.mjs';

registerDataSaverTests(fileURLToPath(new URL('../', import.meta.url)), {
  "locales": [
    "en",
    "zh-CN",
    "zh-TW"
  ],
  "paths": [
    "/",
    "/guide/",
    "/mine/",
    "/profile/",
    "/privacy/"
  ],
  "compareProse": false
});
