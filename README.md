# 一起盖房 · Study & Build

两个人学完打卡，攒游戏资金，选个户型一起盖房。

现在也可以在商店买东西，摆进 3D 房间里：21 套 LEGO 主街景系列、6 种原创车型、4 个盲盒系列（共 24 款）、6 款娃娃和 10 件家具装饰。LEGO 名称与参考图来自官方，房间里的模型为程序生成的简化展示；其他商品为原创设计。商店价格全部是游戏资金，不是零售价。

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

## 学习投入和收入

记录学习时，可以拉动 **投入状态** 滑块（0–100，默认 50）。时长仍是主要收入来源：以每分钟 $10 游戏资金为基准，投入状态把平均效率从 85% 调到 115%，每次再随机上下浮动最多 5 个百分点，最终金额取整。

例如记录 25 分钟，投入 50 时预计到账 $238–$263；投入 100 时为 $275–$300。提交前显示预计范围，提交后显示实际收入；记录里也能看到当次投入状态和实际效率。投入状态由自己选择，网页不会检测你是否专注。

联机奖励由服务器结算，只抽取一次并保存；刷新、同步、断线重试都不会重抽或重复加钱。撤销按照该次实际入账金额处理。旧学习记录保持原来的每分钟 $10，现有余额、物品和施工进度不重新计算。两个手机刷新网页即可使用新滑块。

`src/rewards.js` 固定保存第 1 版奖励规则；如以后调整算法，需要增加规则版本，不能重算已有记录。`npm run test:rewards` 使用隔离内存后端，检查滑块、双人同步、响应丢失后重试及重载后的金额（先运行开发前端）。检查部署页面时，同时设置 `TEST_URL=https://cskyl.github.io/together-home/` 和 `REWARDS_LIVE_API=1`，在公开后端创建独立测试房间；避免浏览器阻止 HTTPS 页面访问本机测试后端。

## 自己设计户型

在选房区域点 **自己设计户型**，可以从空白或两套起步模板开始。当前支持单层：24 × 24 米画布、每格 0.5 米、每套最多 20 个矩形房间，可以拼出不同外形；同一双人房间最多保存 8 套自定义户型。

- 选择 **画房间** 后拖出矩形，或者选择用途后点 **添加**。在 **选择 / 移动** 模式下拖动房间，右下角圆点调整大小；右侧可直接输入米制尺寸、位置和房间名称。
- 选择 **门 / 窗 / 开放通道** 后点墙壁；切回选择模式再点门窗，可以改宽度或移除。相邻房间只生成一面共用墙，门窗会在 3D 墙面留出开口。
- 每个房间可选地板、墙色，或关闭默认家具。保存之后，在商店买到的物品可以在自定义房间俯视图里点按、拖动或用滑块自由摆放，也可以旋转；车辆仍需放在车库。
- **3D 预览** 可旋转缩放、切换屋顶；**导出平面图** 下载 SVG。放大画布后可用 **移动画布** 拖动，修改支持撤销 / 重做。
- 草稿只自动保存在当前浏览器，点 **保存户型** 才同步给另一位成员。若两人修改同一版本，服务器会拒绝过期保存，保留本机草稿；可选择 **另存一份** 或 **载入最新版本**。断线重试同一次保存不会重复创建户型或增加版本。
- 修改布局和装修不花费游戏资金，已有施工进度和学习记录继续保留。删除房间、或把车库改成其他用途时，不再适合摆放的物品会收回共同仓库，购买记录保留。

自定义户型不对应真实房源或市场报价，施工目标沿用每套 $5,500 游戏资金。`src/designs.js` 包含共享的几何和校验规则，`src/designer.js` 是编辑界面；`npm run test:designer` 和 `npm run test:designer-online` 验证绘制、拖动、装修、草稿恢复、触摸操作、并发冲突和重试。默认联机测试使用隔离内存后端，`DESIGN_LIVE_API=1` 使用公开后端的独立测试房间。

## 商店和摆放

1. 点施工面板下的 **逛商店 / 摆放物品**，或者顶部的 **商店**。
2. 选择商品，在可旋转的 3D 预览中查看。车辆有车漆、轮毂、内饰、车顶和外观套件；LEGO 可加防尘罩和暖光。
3. 用共同游戏资金购买。盲盒每系列 6 款，每款概率 1/6，无隐藏款；重复款各自保留。开盒结果由服务器产生并保存，断线重试不会重复扣款或重抽。
4. 在 **我的物品** 中选择房子、房间、位置和朝向。车停在车库；收藏品放在展示位；娃娃和家具放在地面位置。可以搬到其他户型或收回仓库，摆放不收费。两位成员都能使用共同仓库。

购买与施工共用一个余额，已用于购买的学习资金也不能通过撤销打卡拿回来。余额、选配、开盒结果和摆放约每 4 秒同步。旧版存档可以直接继续使用，不会重置学习和建设；导出的 JSON 也包含购买和摆放记录。更新上线后，两台设备刷新网页即可看到商店。仓库当前上限为 300 件。

商品清单在 `src/items.js`，官方图片来源记录在 `research/shop-sources.json`。已保存的购买单固定保留成交价格和选配；调整既有商品价格时需要同时设计存档迁移，不应直接改价导致旧存档验证失败。

商店验证：`npm test` 检查金额、权限、并发购买、盲盒去重和重启持久化；`npm run test:shop` 检查本机浏览器完整购买与摆放；`npm run test:shop-online` 使用隔离的内存后端检查双人同步与丢失响应重试（需先运行 `npm run dev`）。设置 `SHOP_LIVE_API=1` 可对公开后端创建独立测试房间，设置 `TEST_URL` 可测试 Pages 部署。

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

更新后端或户型目录前，可运行 `node scripts/backup-host.mjs` 在线备份 SQLite；备份位于 `data/backups/`，不会上传 GitHub。备份使用 SQLite 备份接口，包含已提交的 WAL 数据，并执行完整性检查。

这次配置没有更改电脑休眠设置，也没有安装开机自启服务。电脑重启后，请重新运行启动脚本。查看 `runtime/api.err.log` 和 `runtime/tunnel.err.log` 排查主机或隧道问题。

开发前端：`npm run dev`，然后打开 http://localhost:4178/ 。单独启动后端：`npm run host`（默认仅监听 `127.0.0.1:4180`）。

## 功能与数据规则

- Columbus 的 Riverside / Fremont / Naperville / Ashland / Grandview / Anthem 六套公开户型参考，3D 旋转缩放、剖切室内、外观、房间选取、原始平面图。
- 官方户型起价、查询日期与原网页；按价格、面积排序，按起价预算筛选。真实价格仅用于参考，不改变游戏目标或旧进度。
- 每次可记录 1–480 分钟；以每分钟 $10 游戏资金为基准，按投入状态和小幅随机效率结算实际收入。
- 共同资金，每个户型独立保存施工进度。地基 → 框架 → 墙体 → 屋顶 → 室内。
- 服务器根据成员凭证决定贡献者，客户端不能冒充另一人或自定入账金额。
- SQLite 事务串行核算共同资金；请求去重避免重试重复记账。
- 只能撤销自己的、尚未用于建设或购买物品的学习记录。名字由本人修改。
- 不同浏览器默认进入不同身份，只有邀请或自己的恢复码能连接到既有房间。
- 尚未联机时也可本机体验；本机体验存档与共享空间独立，联机时禁止覆盖式导入。

这是游戏资金，和真实存款、房价或建造报价无关。

## 户型来源

2026-09-20 直接读取官方网页核对价格。以下金额为 Columbus 户型页的美元起价，非指定现房挂牌价；社区、地块及选配可能改变最终报价，页面不会自动刷新市场价格。模型和官方外观图可能含不同选配，不能据此判断选配已包含在起价内。

3D 依照公开户型手工简化重建，仅展示一层；地下室未建模，层高、门窗、外观、屋顶、家具和部分尺寸为示意。面积为官方不同选配范围，不是简化模型的精确测量值。每个模型将一间次卧用作共同书房。

| 模板 | 官方起价（USD） | 原始一层图 |
| --- | ---: | --- |
| [Fremont](https://www.mihomes.com/new-homes/ohio/columbus/fremont-plan) | $400,900 起 | [原图](https://dam.mihomes.com/media/508112/50421.jpeg) |
| [Riverside](https://www.mihomes.com/new-homes/ohio/columbus/riverside-plan) | $456,900 起 | [原图](https://dam.mihomes.com/media/71266/50421.jpeg) |
| [Naperville](https://www.mihomes.com/new-homes/ohio/columbus/naperville-plan) | $400,900 起 | [原图](https://dam.mihomes.com/media/123850/50421.jpeg) |
| [Ashland](https://www.mihomes.com/new-homes/ohio/columbus/ashland-plan) | $390,900 起 | [原图](https://dam.mihomes.com/media/71225/50421.jpeg) |
| [Grandview](https://www.mihomes.com/new-homes/ohio/columbus/grandview-plan) | $441,900 起 | [原图](https://dam.mihomes.com/media/117616/50421.jpeg) |
| [Anthem](https://www.mihomes.com/new-homes/ohio/columbus/anthem-plan) | $473,900 起 | [原图](https://argo.ml3ds-stage.com/productdata/MI%20Homes_8/Premier%20Collection_138233/Premier%20Collection_163116/Anthem-Smart%20Series_500998/First%20Floor_634876.svg) |

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
