# 签名目录 schema 2

purpose 固定 hct-tool-index，发布者及 signingKeyId 与现有 trust/tool-trust.json 一致。有效期、revision 高水位和同 revision 内容保护均保留。签名覆盖原始 index.json 字节。

每项保留 id/name/description/category/version/minHost/architecture/protocol/url/size/sha256。新增 packageName=com.sylvlab.hyperconnect.<id>、packageSchema=2、permissions 和 icon。八个 id 保持 windows/service/status/device/camera/audio/mouse/plugin，权限必须等于宿主现有固定表，不接受新增管理员能力。minHost 至少 0.6.0，当前仅 x64。

icon={url,size,sha256}：仅允许本 Pages /v2/stable/icons/<安全名称>.png，文件至多 128 KiB，PNG IHDR 尺寸 1–256。下载后按签名长度和 SHA-256 验证，再使用本地缓存，缺失使用原生默认图标。图标不能提供可执行代码。

归档 URL 只能是固定仓库的版本化 Release，文件名 id-version.hctapp。HTTPS 重定向仅允许 GitHub 官方资源域。不能以目录中的自报字段代替实际归档 manifest、签名及内容校验。

revocations=[{id,version,sha256}] 与 packages 同属签名内容。普通下架仅为新有效目录中不再出现，不删除本地安装。撤销精确阻止受影响内容，保护状态持久保留已接受的撤销记录；后续省略记录不自动恢复信任。安全撤销的发布、通知和替代版本仍须人工评审。

旧客户端仅访问 v1，新客户端严格要求 v2，拒绝把全量旧包安装为薄包。工具包本身仍为现有 schema 2，未增加 hctprofile schema。

候选图标由 scripts/New-ToolIcons.ps1 使用 Windows 已安装的 Segoe MDL2 Assets 字形绘制，不打包字体文件。文件哈希与候选目录绑定；无外部任意图片入口。

CI 和发布脚本不持有私钥。候选夹具仅证明本地签名和文件协同，不能证明 GitHub Pages 已上线或 SCM 端到端业务已经通过。