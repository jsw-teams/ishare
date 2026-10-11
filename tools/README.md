# Development tools

Run commands from this site's root. `npm run pages:format` previews the actual Pages source changes; `npm run pages:format -- --write` applies bracket formatting while checking field values and order.

`npm run test:data-saver` uses this site's configured pages and locales. `npm run verify:performance` measures full/text homepages with gzip, a cold browser cache, 100 KB/s and 150 ms latency. Tests remain under `tests/`; command entries live under `tools/assets/` and `tools/verification/`.

The reusable implementation comes from the pinned public EdgePress dependency. Theme developers can follow its `tools/verification/README.md` and change test paths and locales for their own site. `DATA_SAVER_SCREENSHOTS` and `PERFORMANCE_OUTPUT` can retain evidence under `tools/reports/`. All API responses are anonymous synthetic fixtures; these checks do not verify live publishing or accounts.
