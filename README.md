# 一起盖房 · Study & Build

两个人学完打卡，攒游戏资金，选个户型一起盖房。

- 网页：https://cskyl.github.io/together-home/
- 仓库：https://github.com/cskyl/together-home
- 部署结构：GitHub Pages 静态前端 + Windows 本机 Node.js / SQLite 后端 + Cloudflare HTTPS 临时通道。

## 两个人怎么开始

1. 打开网页，填自己的称呼，点击 **创建房间**。
2. 点击 **生成邀请链接**，把链接私下发给对方。
3. 对方在自己的手机打开链接，填自己的称呼，点击 **加入房间**。
4. 各自打卡，资金和户型建设进度约每 4 秒自动同步。双方不必同时在线。
5. 各自在右上角的联机窗口点 **复制我的恢复码**，妥善保管。换手机或清除浏览器数据后，用各自的恢复码登录。恢复码不要互相分享，对方应通过邀请链接获得独立身份。

每个房间仅有两个身份；邀请一次有效，7 天过期。普通网页地址不能读取任何人的学习数据。自己的访问凭证只保存在浏览器，服务器保存凭证哈希。进度 JSON 导出不包含访问凭证。

## 本机后端的运行条件

**保存数据的电脑需要保持开机、联网、不休眠。** 电脑离线时网页仍可打开，但暂停同步；未确认的操作不会显示为已成功，连接恢复后可点击「刷新 / 重试未确认操作」。后端会按操作编号去重，避免重试导致重复入账。

Cloudflare Quick Tunnel 是临时通道，没有持续可用性承诺，重启后域名可能变化。重启脚本会把新地址提交到 GitHub，自动触发 Pages 更新；这个过程通常需要几分钟。网页会定期重新读取联机地址。若用于长期稳定运行，建议之后改为固定域名的命名隧道或云托管后端。

本机数据库为 `data/home.sqlite`，目录不会提交到 GitHub。请保留该文件及 SQLite 的 WAL 文件；不要在服务器运行时仅复制主文件作为数据库备份。

## 启动、停止

需要 Node.js 24+。从 [Cloudflare 官方发行页](https://github.com/cloudflare/cloudflared/releases) 下载 Windows amd64 可执行文件到 `tools/cloudflared.exe`。

```powershell
cd <项目目录>
npm ci
# 在后台启动 API 与隧道，并将新联机地址提交到 GitHub：
.\scripts\start-host.ps1 -Publish
# 停止本项目的 API 与隧道；保留全部数据库记录：
.\scripts\stop-host.ps1
```

也可以双击项目中的 `Start Together Home.cmd`。需要此电脑已有仓库推送权限。脚本仅提交 `public/cloud-config.json`，不会提交数据、日志或凭证。

这次配置没有更改电脑休眠设置，也没有安装开机自启服务。电脑重启后，请重新运行启动脚本。查看 `runtime/api.err.log` 和 `runtime/tunnel.err.log` 排查主机或隧道问题。

开发前端：`npm run dev`，然后打开 http://localhost:4178/ 。单独启动后端：`npm run host`（默认仅监听 `127.0.0.1:4180`）。

## 功能与数据规则

- Columbus 的 Riverside / Fremont / Naperville 公开户型参考，3D 旋转缩放、剖切室内、外观、房间选取、原始平面图。
- 1 分钟学习 = 10 美元虚拟资金；每次可记录 1–480 分钟。
- 共同资金，三个项目独立施工进度。地基 → 框架 → 墙体 → 屋顶 → 室内。
- 服务器根据成员凭证决定贡献者，客户端不能冒充另一人或自定入账金额。
- SQLite 事务串行核算共同资金；请求去重避免重试重复记账。
- 只能撤销自己的、尚未用于建设的学习记录。名字由本人修改。
- 不同浏览器默认进入不同身份，只有邀请或自己的恢复码能连接到既有房间。
- 尚未联机时也可本机体验；本机体验存档与共享空间独立，联机时禁止覆盖式导入。

这是游戏资金，和真实存款、房价或建造报价无关。

## 户型来源

2026-09-20 核对。3D 依照公开户型手工简化重建，仅展示一层；地下室未建模，层高、门窗、外观、屋顶、家具和部分尺寸为示意。面积为官方不同选配范围，不是简化模型的精确测量值。每个模型将一间次卧用作共同书房。

| 模板 | 官方页面 | 原始一层图 |
| --- | --- | --- |
| Riverside | https://www.mihomes.com/new-homes/ohio/columbus/riverside-plan | https://dam.mihomes.com/media/71266/50421.jpeg |
| Fremont | https://www.mihomes.com/new-homes/ohio/columbus/fremont-plan | https://dam.mihomes.com/media/508112/50421.jpeg |
| Naperville | https://www.mihomes.com/new-homes/ohio/columbus/naperville-plan | https://dam.mihomes.com/media/123850/50421.jpeg |

原始图像版权归相应权利人所有；引用来源保留于网页和 `research/sources.json`。

## 验证与部署

```powershell
npm test               # 数据校验、身份权限、资金事务、并发、重启持久化
npm run test:browser   # 本机模式 / 3D / 手机布局回归
npm run test:online    # 两个独立浏览器，通过真实 API 测试联机
npm run build
# 在线部署后测试真实 Pages：
$env:TEST_URL='https://cskyl.github.io/together-home/'
npm run test:online
```

浏览器测试使用已安装的 Microsoft Edge，测试房间与正常用户空间隔离。

推送 `main` 后，`.github/workflows/pages.yml` 执行检查和构建，再部署到 GitHub Pages。仓库 Pages Source 设为 GitHub Actions。

参考：[GitHub Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)。
