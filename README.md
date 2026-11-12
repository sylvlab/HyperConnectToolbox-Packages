# HyperConnect Toolbox 静态工具分发

此仓库保存签名目录、图标和来源记录；版本化 `.hctapp` 附件由 GitHub Releases 提供。Pages 只部署 `site/`，不运行数据库或动态 API。

## 阶段 5 配套协议

公开 `site/v1/stable` 保留历史客户端目录，`site/v2/stable` 为共享宿主提供已签名薄包目录。共享 ToolHost 客户端使用独立 `/v2/stable/index.json`，强制目录 schema 2 和薄包 packageSchema 2；protocol 1 仍指现有工具会话协议，不能用它辨认新旧部署包。

候选目录位于 `fixtures/shared-1.2.8/v2/stable/`，不是 Pages 的部署输入。签名使用既有 CNG 发布密钥，私钥不进入仓库或 CI。原始 tools-1.2.8 附件和维护版本 tools-1.2.9 已公开；当前版本及修订以 site/v2/stable 的有效签名目录为准。工具箱主应用仍为测试候选，正式代码签名、跨账户 UAC 与硬件验收另行记录。

本地验证：

```powershell
node scripts/verify.mjs
node scripts/verify.mjs --catalog fixtures/shared-1.2.8/v2/stable --local-assets <已验证的八个薄包目录> --previous site/v1/stable/index.json
```

在目录有效期内检查签名、递增 revision、元数据、图标和实际附件长度及 SHA-256。过期夹具应明确续签，不通过忽略有效期获得成功。CI 只验证公开目录和候选结构，不生成替代密钥。

详细约束见 [目录协议](docs/architecture/catalog-v2.md)。主应用配套分支为 feature/stage5-cloud-tools；主应用记录双方最终提交。普通下架不卸载本地工具，独立签名 revocations 精确撤销 id/version/sha256，保留用户备份。

## 发布顺序

必须另获维护者发布授权。先上传不可变的版本附件并逐个验证匿名下载长度和 SHA-256，再将签名目录及图标放入 site/v2/stable，提交后执行 main 分支 Pages 工作流。工作流验证失败不部署。不要先公开指向不存在附件的有效目录。

不更改历史 v1 附件、签名身份或客户端权限。新能力必须通过受信宿主升级，目录不能携带任意脚本、DLL 路径或管理员命令。