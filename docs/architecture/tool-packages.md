# 官方便携小工具包

主程序保留安装向导、基础只读体检、包管理和备份应急恢复。小工具界面和编排代码由 `src/ToolApp` 编译为独立 WinUI 进程，程序及其运行依赖随 `.hctapp` 发布。工具可独立更新，不写 Windows 卸载注册表，不依赖安装描述文件发现卡片。

## 包结构与接口

`.hctapp` 是 ZIP：根 `manifest.json` 和 `manifest.sig`，`app/` 程序与依赖，`assets/` 图标，`rules/` 适配规则，`components/` 组件。MiShareExtension 的 bundle 与证书保存在 `components/mishareextension/1.0.11.0/`。

清单 schema 为 1，purpose 为 `hct-tool`。字段包括 id、version、name、description、category、icon、minHost、protocol、architecture、entry、feature、permissions、runtimeProfile、files、publisher 和 signingKeyId。每个 files 项精确声明 path、size、sha256；清单不含用户数据。入口只能位于 app/ 且为 EXE，权限只接受宿主认识的动作。

拒绝路径穿越、Windows 保留名、ADS、重复及大小写冲突路径、符号链接、未声明文件和不匹配的入口。最多 8192 条、展开总量 2 GiB、单文件 512 MiB，清单最大 2 MiB。签名与安装描述文件同算法，可信公钥来自宿主 `tool-trust.json`，并显式限制 hct-tool 与 hct-tool-index 用途；归档内公钥不授信。

## 本机组件、原用户数据与事务

```text
<应用安装目录>/
  Tools/<工具ID>/<版本>/package.hctapp
  Tools/<工具ID>/<版本>/content/
  Tools/pending/<工具ID>.hctapp
  Maintenance/Setup.exe
ProgramData/HyperConnectToolbox/Components/<安装目录哈希>/
  installed.json
  store.lock
  running-<工具ID>.lock
  maintenance.json
LocalAppData/HyperConnectToolbox/
  ToolData/<工具ID>/
  Profiles/
  ProfileHistory/
```

管理员执行端管理程序与状态，普通用户只读执行；配置、日志和恢复备份始终归原用户。状态和组件目录的父目录同样受保护，不依赖管理员账户的 LocalAppData。第一次迁移只向已经认证的原用户代理读取其旧组件，重新验签、核对哈希后提交，不扫描其他用户目录；源数据保留。安装器的显式组件选择优先于旧数据迁移。

安装先复制到随机暂存目录，再验签、展开，最后原子激活状态。失败保留旧版本；同版本不同内容不覆盖。状态保存最高版本、目录最高修订和移除记录。跨进程文件锁串行化每次状态提交；原生维护预先验证完整选择并保留可重试的事务记录。

跨进程运行 lease 阻止替换活跃组件。已下载且验证通过的更新保存到 pending，宿主每分钟在空闲后重试；联网检查仍为启动及每六小时。移除立即记录 tombstone、撤下入口并拒绝新任务；程序退出后清理，用户数据与系统备份保留。只有用户显式安装能恢复已移除工具。

安装器首次默认选择桌面快捷方式和八个独立组件。后续维护读取实际本机状态，包括商店安装的附加组件；取消选择即移除，保留商店更新后的更高版本。AppModifyPath 指向受保护的维护安装器，Windows 决定显示按钮文字。应用“小工具”页只展示、启动和进入维护，不提供离线导入管理页面；“小工具商店”浏览和安装官方包。

## 进程与权限

宿主验证已安装包及展开文件，再通过原用户代理启动包内入口。新 ToolSessionChannel 使用独立命名管道，绑定随机会话、实际 PID、入口路径、交互会话和原用户 SID；不放宽既有 SessionChannel 的同 EXE 限制。

工具 Hello 后接收 ToolLaunchContext，包含经验证的清单、独立数据目录、安装配置目录和包目录。协议 1 提供 Execute、PickFile、PickFolder、PluginVersion、Ping；Execute 使用 OperationRequest，结果为 ToolOperationReply（操作目录与最终状态）。客户端使用 PROCESS_QUERY_LIMITED_INFORMATION 查询宿主身份，通过已认证管道的心跳与关闭检测宿主生命周期，不申请管理员进程的等待或全部访问权限。管道断开后退出，不能再提交任务。

宿主将每个 Execute 与包声明 permissions 比较，自行确定权限级别，固定安装配置或包内运行规则目录，不接受工具提供的 ComponentDirectory 或任意描述文件路径。实际修改由宿主再次确认，并复用现有管理员会话；安装描述文件与运行期规则均保留哈希绑定。Worker 对签名规则再次校验并将修改请求放入受保护目录，RuntimeHost 保留目标身份复核、备份事务和取消协议。

现有三个运行期规则各自迁入对应包的 `rules/runtime.hctprofile`。它是包内签名执行凭据，用于复用当前 Worker 的 schema 4 受限操作，不再作为安装配置或工具库注册表。MiShareExtension 同样使用包内签名执行凭据，保留既有组件与证书身份校验。新管理员底层能力需要宿主协议升级，包不能要求任意管理员脚本。

工具通过原用户数据目录的 cancel.request 请求取消，宿主在当前任务期间监测并转交既有取消机制。主程序日志保存完整操作输出；工具结束时显示该操作的日志与结果，不能把启动成功视为功能验收成功。

## 目录服务与自动更新

默认目录为 `https://sylvlab.github.io/HyperConnectToolbox-Packages/v1/stable/index.json`，同目录独立 index.sig。schema 1、purpose hct-tool-index，包含 revision、expires、publisher、signingKeyId 和 packages。每个包项提供展示信息、兼容要求、指定 Release 附件地址、大小和 SHA-256。

客户端先验证目录签名和有效期，再持久记录最高修订。HTTPS 下载只允许指定仓库版本附件及 GitHub 官方资产跳转域名，逐跳检查并流式验证大小和哈希；随后再次校验工具包签名及完整文件集合。正常界面展示名称、描述和状态，不展示 GitHub 地址；诊断日志可保留实际网络错误。

启动及每六小时检查更新，只更新已安装工具；运行中延后，进程退出后再次尝试已获知的更新。过期或无法获取目录不影响已安装工具离线启动，但不能凭过期目录安装或更新。新工具需要用户选择安装。离线入门组件在首次安装时默认全选，由原生组件树逐项管理；便携版通过商店显式安装。

分发仓库模板、签名与部署命令见 `../../eng/packages/README.md`。源码仓库不改可见性，不放发布私钥。Pages 工作流只验证和部署已签名材料。

## 体检边界

基础体检不依赖描述文件或小工具包，继续读取硬件和官方客户端身份。增强适配规则仅来自已安装并重新验证的工具包；没有匹配规则只报告无适配方案，不擅自补 DLL 或扩大兼容范围。建议入口定位已安装的工具包；缺少工具时进入小工具商店。原安装支持矩阵与运行期适配范围独立。

## 参考

- Scoop JSON 清单：https://github.com/ScoopInstaller/Scoop/wiki/App-Manifests
- PortableApps 的应用信息与独立启动入口：https://portableapps.com/manuals/PortableApps.comLauncher/ref/paf/appinfo.html
- GitHub Pages 静态托管：https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- GitHub Releases 附件：https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
