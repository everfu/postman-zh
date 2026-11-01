# 第三方资料与翻译数据

`locales/zh-CN.json`、`locales/scratchpad.json`、`locales/menu.json` 来自：

- 项目：hlmd/postman-chinese-injector
- 地址：https://github.com/hlmd/postman-chinese-injector
- 项目版本：1.8.3（该快照的 package.json）
- 获取日期：2026-11-01
- 获取方式：GitHub codeload 的 main 分支源码快照；未执行其安装器或运行时代码。
- 下载快照 SHA-256：`ebdba93e9f53c467dcf02338bd416a2ef0ba7ece46a9b6020ca43df84ff541c2`。
- 本地处理：把 `locales/zh-CN/*.json` 合并为以模块名为键的 JSON；另两个词典按原文件保留。
- 1.0.1 本地修订：统一设置页的快捷键、主题、请求头、密钥库等术语，区分官方语言设置与本机界面开关。`src/runtime/chrome.cjs` 是本项目独立维护的固定控件补译表。

上游 [LICENSE](https://github.com/hlmd/postman-chinese-injector/blob/main/LICENSE) 为 MIT，全文保留于 [vendor/hlmd-LICENSE](./vendor/hlmd-LICENSE)，版权归 hlmd。上游 [运行时文件声明](https://github.com/hlmd/postman-chinese-injector/blob/main/pm-chinese.js) 指出其 MIT 许可覆盖项目自身代码，不包含派生自 Postman 文案的译文数据。

本仓库及下载包保留该区别：第三方翻译快照沿用上游声明，用于个人本地汉化；本项目不对其重新授予 MIT 许可，不主张 Postman 原文、译文原作者或商标权利。根目录 LICENSE 适用于本项目原创代码、文档与视觉素材，不替代第三方内容的声明。

本工具与 Postman, Inc. 无关联、未获其背书。Postman 是其商标。本仓库及交付压缩包不包含 Postman 的应用程序、原始语言包或其他原厂源码。

开发依赖 `@electron/asar`（MIT）和 `jsdom`（MIT）的许可见各 npm 包及锁文件；它们不随运行脚本加载或注入应用。项目封面、标识、设置示意与介绍文案独立制作，没有沿用其他项目的品牌素材或用户工作区截图。

开发依赖通过 `overrides` 固定 `glob` 与 `minimatch` 到已修复的版本，避免 ASAR 验证工具的传递依赖引入已知的资源消耗问题。相关行为经过官方 ASAR 互读测试；该依赖树不参与最终用户安装过程。
