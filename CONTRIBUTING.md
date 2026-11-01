# 参与贡献

感谢帮助改进 Postman ZH。请先阅读 [README](./README.md)、[实现结构](./docs/architecture.md)与[兼容性记录](./docs/compatibility.md)。

## 开发

需要 Node.js 22.12+。在仓库根目录运行：

```sh
npm ci --ignore-scripts
npm run verify
```

Linux 可运行自动检查，发布打包需要 macOS：

```sh
npm run package
npm run test:package
```

CI 不依赖真实 Postman。不要在普通测试中退出、签名或替换本机应用。需要原生验证时使用独立应用副本与测试数据目录，并保留恢复路径。

## 修改原则

- 保留原有请求数据、账号设置和工作内容。
- 设置开关只挂在明确识别的正文容器；未知布局不猜测插入。
- 不扩大网络拦截范围，不使用在线翻译服务处理用户内容。
- 备份、签名、替换或恢复路径变更，需要实际失败回滚证据。
- 测试关注行为和关键交互，不复制实现细节、固定样式或整页快照。
- 不提交 `.app`、`.asar`、备份、日志、工作区资料、账号信息或 `node_modules`。

翻译改进请参考[维护指南](./docs/translations.md)，并保留来源与许可声明。

## 提交与 Pull Request

使用聚焦的 Conventional Commits，例如 `fix: 修复语言控件在设置页中的位置`、`docs: 补充恢复指南`。标题与说明可使用中文或英文。

PR 说明清楚：什么场景有问题、修改后的行为、检查方式、未验证范围。涉及界面时附不包含用户资料的截图或明确标注的示意图。不要用单一 DOM 测试替代实际的原生布局验证。

## 版本发布

维护者更新 `package.json` 与锁文件版本，补齐 `CHANGELOG.md` 和 `docs/releases/v<版本>.md`。主分支检查通过后创建对应 `v<版本>` 标签。

标签触发 Release 工作流：检查、打包、核验，再发布工具 ZIP、素材 ZIP 与 `SHA256SUMS`。版本必须与标签一致；工作流不会安装真实 Postman，也不会提交构建产物回主分支。
