# 官方小工具发布与静态目录服务

分发目标为 `sylvlab/HyperConnectToolbox-Packages`。当前工程保存工具源码；独立仓库保存签名目录、来源清单和发布记录，版本化 `.hctapp` 放在 GitHub Releases 附件。Pages 仅发布 `site/` 中的静态目录，不运行动态服务，不要求最终用户登录 GitHub，不在应用界面展示托管地址。

## 本地制作

1. 从根目录用锁定 SDK 发布 `src/ToolApp/ToolApp.csproj`（Release、Platform=x64）到新的 `artifacts/build/<批次>/publish`。
2. 运行 `profiles/Import-ComponentLibrary.ps1` 建立长期组件库，运行 `profiles/New-InstallationProfile.ps1` 制作独立 schema 6 安装配置。
3. `Build-OfficialTools.ps1 -ToolPublishDirectory <发布目录> -ComponentLibrary <组件库> -RuntimeSourceProfile <现存受信schema5归档> -OutputDirectory <新目录>` 迁移既有三条运行规则，签署八个独立工具包。历史规则归档仅是工具包内部向现有受限 Worker 过渡的执行凭据，应用不再从安装描述文件发现工具。
4. 构建 `src/PackageTool/PackageTool.csproj`；运行 `Verify-OfficialTools.ps1 -Directory <包目录> -OutputDirectory <新证据目录>` 验证依赖、签名、载荷和规则覆盖。
5. `New-OfficialIndex.ps1 -PackagesDirectory <包目录> -OutputDirectory <新目录> -Revision <递增整数> -ReleaseTag tools-1.1.0` 生成有效期默认 30 天的索引。到期前提升修订重新签发，即使工具版本不变。
6. `New-DistributionRepository.ps1 -IndexDirectory <索引目录> -OutputDirectory <新目录>` 准备可审查的分发仓库工作目录。它不创建远端、不推送、不上传、不启用 Pages。

所有签名使用原有不可导出 CNG 发布密钥，且必须与应用内置信任公钥匹配；缺失即失败。私钥不进入 Actions Secrets、环境变量、脚本或发布附件。信任目录的 `purposes` 分别限制 `hct-tool` 与 `hct-tool-index`。仅持有包内公钥不能取得信任。

## 部署顺序

实际发布需维护者授权。在独立分发仓库上传不可变版本附件，核对来源提交与本地制作记录，再提交预签名索引、公开信任目录和来源清单。仓库必须允许最终用户匿名读取 Pages 与 Release 附件；保持当前源码仓库的原有可见性。

将 Pages 来源设为 GitHub Actions，手动运行工作流。工作流验证签名、有效期以及每个已发布附件的实际大小和 SHA-256，成功后只上传 `site/`。它没有签名密钥，不能自行重签内容；失败保持旧部署。首次上线前通过测试环境验证完整下载和安装链，不能将本地模拟测试记为在线部署成功。

客户端只使用内置的 HTTPS Pages 地址和指定仓库的 Release 下载路径。目录签名通过后才显示可安装工具；下载逐跳检查来源，按签名大小流式计算 SHA-256，再验证包签名与全部文件。启动及每六小时检查更新，正在运行的工具延后，用户移除的工具不会被更新机制恢复。

协议、包生命周期和权限详见 `docs/architecture/tool-packages.md`。设计参考 Scoop 的 JSON 清单（https://github.com/ScoopInstaller/Scoop/wiki/App-Manifests）与 PortableApps 的独立入口和元数据（https://portableapps.com/manuals/PortableApps.comLauncher/ref/paf/appinfo.html）。Pages 与 Releases 行为依照 GitHub 官方文档；工作流参考官方静态 Pages 模板（https://github.com/actions/starter-workflows/blob/main/pages/static.yml）。

## 本机组件候选 0.4.1

安装器默认选中八项和桌面快捷方式。程序存于应用安装目录，状态位于受保护的 ProgramData，数据与备份仍属于原用户。原生维护、商店与更新器共用组件存储和跨进程运行锁。使用 Publish-Distribution.ps1 仅向固定的公开分发仓库提交材料、上传版本附件并触发 Pages；运行前必须取得维护者的实际发布授权及 GitHub CLI 登录。它不提交当前源码仓库。

目录有效期默认 30 天。expiry 工作流每日验证，少于 7 天报错；维护者本机提升修订，使用原有 CNG 密钥重签并按发布流程部署，不能在 Actions 自动创建替代密钥或把密钥上传。
