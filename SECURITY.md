# 安全反馈

请使用仓库 [Security → Report a vulnerability](https://github.com/everfu/postman-zh/security/advisories/new) 私密提交安全问题。不要在公开 Issue、PR、日志或截图中提交令牌、请求体、私有地址、账号资料或真实 Postman 数据目录。

请提供：工具版本、Postman 版本、系统/架构、最小复现步骤、预期影响和已做的缓解。可以使用构造的测试归档与数据，不需要上传整个 `.app`。

本项目会修改本机 Postman 的应用资源与签名。请了解[签名影响](./docs/installation.md#应用签名与系统保护)，并仅运行可信来源的脚本。当前维护最新发布版本；旧版本建议先在可恢复环境中升级再复现。

安装器不自行提权，不关闭系统保护，不清除隔离属性；恢复路径与原版备份是项目的重要边界。发现这些行为发生变化时，请报告。
