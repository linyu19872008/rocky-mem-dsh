# rocky-mem

面向 DeepSeek Harness 的工程经验台账。

## 你会得到什么

- **会话启动时的常驻上下文。** 每个新会话在第一轮对话前，都会收到当前工作目录的偏好与置顶经验，包在 `<rockymem-context>` 块里。
- **六个工具**，命名空间 `mcp__rockymem__*`：`mem_context`、`mem_search`、`mem_get`、`mem_record`、`mem_remember`、`mem_feedback`。
- **`rocky-mem` 技能**：让 agent 知道什么时候该查台账，以及某条经验在什么条件下不该用。
- **台账，不是日志。** 条目带证据、置信度和 `invalid_when` 边界；矛盾会以"有争议"成对保留，直到人来裁定。

## 装了哪些东西

| 条目 | 类型 | 作用 |
|---|---|---|
| `rockymem-runtime` | Host 插件 | 在 `agent/created` 注入上下文；可选地在 `agent/pre-step` 检索；提供技能与 `/rockymem` 命令 |
| `mcp-rockymem` | MCP 客户端 | 用 stdio 暴露六个 `mem_*` 工具 |

插件通过守护进程的公开 REST 契约通信（`GET /api/v1/doctor`、`POST /api/v1/context`、`POST /api/v1/search`）。它不读数据库、不调用 shell、没有运行时依赖。

## 配置

| 键 | 默认 | 含义 |
|---|---|---|
| `endpoint` | `http://127.0.0.1:7432` | 守护进程地址（`ROCKYMEM_URL` 优先） |
| `tokenFile` | `~/.local/share/rocky-mem/rocky-mem.token` | bearer token（`ROCKYMEM_TOKEN` 优先） |
| `inject.enabled` | `true` | 会话启动注入 |
| `inject.budgetTokens` | `500` | 单个上下文包上限 |
| `inject.timeoutMs` | `150` | 单次调用硬超时 |
| `preStep.enabled` | `false` | 首步之前的任务检索 |

覆盖项写在 profile 的 `cordis.patch.yml` 里，按条目 id 定位。

## 失败行为

记忆服务挂掉，绝不能把会话拖垮。

- 守护进程连不上：不注入，加载时一条警告；
- 调用超预算：丢弃这次注入；
- 连续三次失败：熔断 60 秒；
- 服务端没有 `context` 特性：跳过注入；
- 子 agent 会话：永不注入。

## 如何验证

在任意会话里执行 `/rockymem status`：它会打印地址、契约与服务端版本、注入次数，以及跳过原因。`/rockymem on`、`/rockymem off`、`/rockymem prestep` 只影响当前进程。

## 已知限制

- 任务检索默认关闭；需要你自己在宿主机上看过日志、确认 token 成本可接受后再打开。
- 插件只降级不补发：守护进程不可用期间错过的上下文，恢复后不会补上。
- 检索质量由服务端负责，插件只决定"什么时候问"。

## 链接

- 服务端与契约：https://github.com/linyu19872008/rocky-mem
- 仓库：https://github.com/linyu19872008/rocky-mem-dsh
