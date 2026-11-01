# 千寻助手

日常工作中，经常会有从需要各社媒平台采集数据的场景，在使用量不大的情况下，手动处理，太麻烦；用其他产品，可能很贵或需要自己配置非常复杂的开发环境。

所以，本人开发了千寻助手插件，只需在浏览器上安装此插件，即可实现数据采集的自给自足。无需进行任何额外的操作！

目前支持小红书、抖音、快手和哔哩哔哩（B站）。

## 图片反推（已整合 ImageLens）

同一个千寻助手插件现已支持网页图片反推提示词、右键识图、框选区域识图、中英文提示词、九维结构拆解及可选 AI 生图。
点击插件首页「图片反推设置」，使用 BOFT.AI 登录或配置自己的视觉模型 API，再在网页图片上点击千寻图标并选择分析，或按 `Alt+Shift+S` 框选分析。
原有小红书、抖音、快手采集功能继续保留。安装、权限、上游来源见 [图片反推说明](docs/image-lens.md)。

## 仓库与分支

千寻助手由 LIBERSEEK 维护，当前仓库：[LIBERSEEK/OpenSeek-EXTENSIONS](https://github.com/LIBERSEEK/OpenSeek-EXTENSIONS)。

- `origin`：本仓库；`develop` 用于日常开发，`master` 用于稳定版本。
- `upstream`：[iszhouhua/social-media-copilot](https://github.com/iszhouhua/social-media-copilot)，保留 `upstream/main` 用于同步原采集功能。
- 图片反推整合自 [ImageLens](https://github.com/kevinchin12/ImageLens)，保留 MIT 许可证和上游版权声明；项目原有 GPL-3.0 许可证继续适用。
- 同步上游前先提交或保存本地工作，再在 `develop` 运行 `git fetch upstream` 和 `git merge upstream/main`，处理冲突并验证后纳入稳定版本。

## 支持的采集功能

开源版目前支持的主要功能如下：

|   平台   | 无水印视频/图片下载 | 采集指定作品的数据 | 采集指定作品的评论 | 采集指定创作者的数据 | 采集指定创作者的作品 |
| :------: | :-----------------: | :----------------: | :----------------: | :------------------: | :------------------: |
|  小红书  |          ✅          |         ✅          |         ✅          |          ✅           |          ✅          |
|   抖音   |          ✅          |         ✅          |         ✅          |          ✅           |          ✅          |
|   快手   |          ✅          |         ✅          |         ✅          |           ✅          |          ✅          |
|   B站    | MP4视频（含分P）、封面、头像、评论图片 |         ✅          | ✅（含可选楼中楼） |          ✅           |          ✅          |

## 项目结构

```text
.
├── src/                    # 源代码
│   ├── assets/             # 资源目录
│   ├── components/         # 公共组件
│   ├── entrypoints/        # 插件入口
│   │   ├── background/     # 插件的background
│   │   ├── popup/          # 插件的popup
│   │   ├── xhs.content/    # 小红书平台相关脚本
│   │   └── dy.content/     # 抖音平台相关脚本
│   │   ├── ks.content/     # 快手平台相关脚本
│   │   └── bili.content/   # B站平台相关脚本
│   ├── public/             # 静态文件
│   └── utils/              # 工具函数
├── output/                 # 项目编译输出目录
├── docs/                   # 文档与截图
│   ├── images/             # 项目截图
│   ├── dy.md               # 抖音功能介绍
│   └── xhs.md              # 小红书功能介绍
│   ├── ks.md               # 快手功能介绍
├── package.json            # 项目依赖配置
├── README.md               # 项目说明
└── wxt.config.ts           # WXT配置文件

```

## 功能说明

 - [点击查看抖音功能说明](./docs/dy.md)

 - [点击查看小红书功能说明](./docs/xhs.md)

 - [点击查看B站功能说明](./docs/bilibili.md)

## 快速开始

项目运行需要`NodeJS`，请自行安装运行环境。

> 推荐使用pnpm，也可使用其他依赖管理工具，如：npm、yarn、cnpm等

```bash
# 安装依赖
pnpm install
# 运行项目
pnpm dev
```

项目运行成功后，打开自己的Chrome浏览器，进入插件管理面板（`chrome://extensions/`）->开启开发者模式->加载未打包的扩展程序->选择`output/chrome-mv3`目录

随后打开插件，并连接服务器端，连接成功后即可通过调用服务器端的 API 获取平台数据了。

项目核心框架为[WXT](https://github.com/wxt-dev/wxt)，具体可见：[WXT文档](https://wxt.dev)

## Star History

[![Star History Chart](https://star-history.dera.page/svg?repos=LIBERSEEK/OpenSeek-EXTENSIONS&type=Date)](https://star-history.dera.page/#LIBERSEEK/OpenSeek-EXTENSIONS&Date)

## ⚠️ 免责声明

本项目仅供学习和研究目的，不得用于任何商业活动，请在下载后24小时内删除。用户在使用本项目时应遵守所在地区的法律法规，对于违法使用所导致的后果，本项目及作者不承担任何责任。

本项目可能存在未知的缺陷和风险（包括但不限于设备损坏和账号封禁等），使用者应自行承担使用本项目所产生的所有风险及责任。 作者不保证本项目的准确性、完整性、及时性、可靠性，也不承担任何因使用本项目而产生的任何损失或损害责任。

使用本项目即表示您已阅读并同意本免责声明的全部内容。如果您对上述声明有任何疑问或不同意，请不要使用本项目的代码和功能。如果您使用了本项目的代码和功能，则视为您已完全理解并接受上述免责声明，并自愿承担使用本项目的一切风险和后果。

本项目的知识产权归开发者所有。本项目受到著作权法和国际著作权条约以及其他知识产权法律和条约的保护。用户在遵守本声明及相关法律法规的前提下，可以下载和使用本项目。

关于本项目的最终解释权归开发者所有。开发者保留随时更改或更新本免责声明的权利。

## BOFT.AI 统一配置

设置页点击「使用 BOFT.AI 登录」，在 BOFT 授权窗口确认后，识图与生图自动切换到 BOFT.AI，共用当前扩展的 AUTO Key。也可展开「改用 API Key 配置」手动填写密钥，然后分别选择 BOFT.AI。

「读取可用模型」会读取当前账号的 `/v1/models`；可用列表不保证每个模型都有视觉输入或图片输出能力。识图默认 `gemini-3.8-flash`，生图默认 `gemini-nano-banana-2.1`，请按账号权限选择。Gemini 生图走 `/v1beta/models/...:generateContent`，其他图片模型走 `/v1/images/generations`。

「断开连接」删除本机授权凭据。需要撤销服务端 AUTO Key 时，请到 BOFT.AI 管理；账号重新连接且本机密钥丢失时，会恢复当前扩展客户端绑定的密钥。

验证命令：`node --test tests/boft.test.mjs`、`pnpm compile`、`pnpm build`。
