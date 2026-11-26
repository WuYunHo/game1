# WeChat mini-game build templates

Cocos Creator merges this folder into `build/wechatgame` on each WeChat build.

## Splash (`splash.png`)

Replaces the default Cocos first-frame image with the Deepsea loading poster
(same layout as the in-game `LoadingUi`: title + banner + chunky bar).

Source of truth for the art: `assets/resources/art/loading-splash.png`.
If you regenerate the splash, copy it here as `splash.png` as well.

Engine splash settings also live in `settings/v2/packages/builder.json`
(`splash-setting`). They take effect on **build**, not editor preview.
