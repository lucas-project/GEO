# GEO 实站验收结果与下一步技术改进建议

日期：2026-09-13  
验收环境：本地 Next.js 开发服务、SQLite `local-acceptance.db`、内存队列、`GEO_RUN_MODE=free-deterministic`、`AI_PROVIDER=mock`  
结论：**核心链路可以执行，但结果可信度、模式一致性和预算控制尚未达到可交付预期。建议暂不把当前结果用于客户决策或对外宣称。**

## 1. 验收范围与限制

本次通过真实 HTTP 请求调用本地应用的 API，实际抓取公开网站，并轮询异步任务直到完成或失败。覆盖：

- GEO audit：抓取、页面发现、抽取、评分、建议、报告落库
- Site profile：实体、别名、产品/服务与角色推断
- GEO content：关键词整理、内容包和模拟问题生成
- AI simulation：批量模拟与 provider 配置
- Competitor analysis：目标站与竞品抓取、评分和差距比较

尝试使用可视浏览器做页面级验收，但当前运行环境没有可用浏览器 surface，因此没有完成 UI 视觉、交互和响应式验收。本文结论基于真实 Next.js API、队列、数据库和外站抓取链路，不等于完整 UI 验收。

## 2. 实测结果

### 2.1 网站审计

| 网站 | 请求范围 | 结果 | 用量 | 主要观察 |
| --- | ---: | --- | --- | --- |
| `https://example.com` | 最多 3 页 | 完成；overall 25；readiness 94 | HTTP 10；browser 4.25s；tokens 155 | 单页极简站也得到 94 的 readiness；抽取出 4 个与页面无关的品牌实体 |
| `https://www.python.org` | 最多 5 页 | 部分完成；overall 43；readiness 92 | HTTP 300；browser 25.86s；tokens 3048 | 触发 HTTP 预算上限；只成功审计 4 页；发现阶段探测了 `.exe`、`.pkg`、`.tar.xz`、`.msix` 等下载文件 |
| `https://www.wikipedia.org` | 最多 5 页 | 完成；overall 25；readiness 94 | HTTP 18；browser 5.51s；tokens 840 | 实际只审计首页，但 coverage 仍为 1 / ready；robots 请求失败没有显著反映到报告可信度 |

相关任务/报告 ID，便于在本地数据库复查：

- Example：job `96daf36c-b2de-4fde-9f53-980c0c8c37da`，audit `cmtzh9cif0002acls4qbdvnbq`
- Python：job `fe98082d-517b-49ba-bd2f-4e279471dbc1`，audit `cmtzhahsw000xaclsd70kfria`
- Wikipedia：job `10d8b093-8e6c-40a3-b2f0-e9b525b1e9e4`，audit `cmtzhayzn002baclsg08sffy8`

### 2.2 内容生成

对 Python.org 审计运行 GEO content，任务 `25707c25-b2f7-48aa-b17a-9c39cbec04aa` 完成，但输出明显偏离站点：

- 模拟问题出现 “Where can I buy and get installation?”、ducted vs split、outdoor unit、refrigerant 等暖通空调语义。
- 关键词出现 “Flow You’d Expect”“Started Whether you're”等由提示词结构误解析而来的片段。
- 内容把 Python.org 页面标题或导航词机械改写成产品销售文案，既不符合站点类型，也缺少证据支撑。

判定：**不符合预期**。任务状态虽为 completed，但业务结果不可用。

### 2.3 AI 模拟

对 Python.org 运行两条问题的批量模拟，任务 `a5e9d33b-4836-4b43-80c0-df3322e65e43` 失败，错误为 `fetch failed`。

配置接口同时显示：

- 默认 provider：`mock`
- simulation provider：`ollama`
- Ollama：`reachable=false`、`ready=false`
- 4 个配置模型均缺失

这说明 `free-deterministic` 没有统一覆盖 simulation 的独立 provider 配置。任务在能力不可用时仍入队、尝试 warm 和请求模型，最终以非诊断性的网络错误失败。

判定：**不符合预期**。应在提交前返回明确的 capability/unavailable 状态，或执行有明确标识的 deterministic demo，而不是启动必然失败的任务。

### 2.4 竞品分析与站点画像

以 Example 为目标站、Wikipedia 为竞品运行比较，任务 `f751df22-53e4-4ee6-8eb1-0af38ec4ee61` 完成，comparison `8f3168b5-2397-497e-b8cb-53faefe90861`。

但结果包含明显虚构或串域实体：

- Example 被识别出 Mitsubishi Electric、Fujitsu、OpenAI 等实体。
- Wikipedia 被识别出 SurferSEO、Daikin 等实体。
- Python.org 的画像被推断为 `product`，offerings 包含 Microsoft。
- 页面标题被直接当成 aliases，进一步污染画像和后续建议。

代码根因不是缓存 key 串站；结构化输出缓存已经包含 provider、model、schema、system 和 prompt。直接原因是 mock provider 的通用 schema 合成器会从内置品牌样本生成 `name`/`brand` 字段，而实体抽取、画像和竞品链路把这些 synthetic 值当成真实事实持久化和消费。

判定：**严重不符合预期**。这是数据可信度 P0 问题。

## 3. 主要根因

### 3.1 能力开关不是全局执行边界

`src/shared/ai/capabilities.ts` 在 `free-deterministic` 下会禁止 AI 能力，但调用方执行不一致：

- `src/modules/extraction/extractors/entities.ts` 直接调用结构化 AI 抽取。
- `src/modules/geo-content/service.ts` 和 `refine-keywords.ts` 直接调用 AI。
- `src/modules/ai-simulation/batch.ts` 直接 warm/run simulation。
- `src/shared/config/index.ts` 允许 `SIMULATION_AI_PROVIDER` 独立覆盖主 provider。

因此“运行模式”只是部分模块的约定，而不是不可绕过的系统约束。

### 3.2 mock 数据进入事实链路

`src/shared/ai/providers/mock.ts` 的通用 schema 合成会从 `SAMPLE_BRANDS` 产生品牌/名称。`src/modules/extraction/site-profile.ts` 又将 product/concept 实体并入 offerings，并据此推断站点角色。结果是 synthetic 数据经过“抽取 → 画像 → 竞品 → intelligence ingest”成为看起来可信的持久化事实。

### 3.3 评分衡量“字段存在”，没有充分衡量内容质量

`src/modules/geo-audit/criteria.ts` 的 readiness 规则较宽松：有 chunk、有 title、一个 H1、有任意较长 chunk 就能拿到大部分分数。它无法区分高质量可引用内容和 Example Domain 这样的极简占位页。

`src/modules/geo-audit/scoring-v3.ts` 的 coverage 主要表示“已观察规则的适用权重覆盖”，并不表达“计划抽样页完成率”。于是 Python 任务因 HTTP 预算部分完成时，报告仍显示 coverage 1 / ready。

此外 overall score 与 readiness score 同屏时语义差异过大但标签不足，25 与 94 会让用户误以为评分互相矛盾。

### 3.4 页面发现与审计预算没有按目标页数收敛

`src/modules/crawling/service.ts` 先读取 sitemap、渲染根页面，再调用完整 `discoverGeoPages`；后者再次获取 robots、渲染首页、读取 sitemap/llms.txt、探索导航 hub 和 probe 候选。默认 discovery 上限可达 25 个 sitemap 文件、10,000 个 URL、30 个 probe，与本次 `maxPages=5` 不成比例。

Python.org 实测还将安装包、压缩包等非 HTML URL 送入 Playwright，重复产生 Download is starting 错误并消耗预算。最终 5 页请求消耗 300 次 HTTP，任务只部分完成。

### 3.5 partial 状态只存在于 job 返回值，没有进入报告语义

`src/shared/queue/execution.ts` 在预算超限后给 job result 追加 `completion=partial` 和 `stopReason`，但 `src/modules/geo-audit/service.ts` 已经以 `status=completed`、`coverage=readiness.coverage` 保存报告。两层状态没有统一，导致 job 和 audit report 对同一次执行给出不同结论。

### 3.6 内容模板和解析器存在领域污染

`src/modules/geo-content/mock-pack.ts` 从整个 prompt 中用宽泛的项目符号正则提取关键词，提示词说明也可能被当成关键词。相关 prompt/template 还包含 HVAC 专用示例和默认语句，最终污染所有非 HVAC 站点。

## 4. 分级改进计划

## P0：先恢复事实可信度和模式一致性

### P0-1 建立不可绕过的 AI capability gateway

目标：`free-deterministic` 下任何业务模块都不能意外调用 mock、Ollama 或远程模型。

实施建议：

1. 在 `@shared/ai` 出口统一要求 capability，而不是依赖每个模块手写 `allowsCapability()`。
2. 将调用接口改成显式语义，例如 `generateStructuredOutput({ capability: 'entity_extraction', ... })`；gateway 在调用、缓存和 telemetry 之前拒绝不允许的能力。
3. simulation 的 effective provider 必须先受 `GEO_RUN_MODE` 约束，再读取模块级 provider；禁止环境变量绕过运行模式。
4. 对“不可用”返回类型化结果：`available=false`、`reason=mode_disabled|provider_unreachable|model_missing`，不要用 `fetch failed` 作为产品错误。
5. 启动时打印 resolved capability matrix，并在配置 API 暴露同一份解析结果，避免 UI 与 worker 各自解释环境变量。

验收标准：

- free-deterministic 全流程 provider 调用计数为 0。
- 即使 `.env` 设置 `SIMULATION_AI_PROVIDER=ollama`，free 模式也不会连接 Ollama。
- UI 在入队前即可显示准确不可用原因和修复步骤。

### P0-2 隔离 mock/synthetic 数据，禁止写入事实表

目标：mock 只用于契约测试和 UI 演示，不能被解释为对真实网站的观察。

实施建议：

1. 为 AI 输出增加 provenance：`source=observed|derived|model|synthetic`、provider、model、evidence URLs、confidence。
2. mock provider 的所有输出强制标记 `synthetic`；持久化层拒绝把 synthetic entity 写入真实 audit/profile/comparison/intelligence 数据。
3. 删除通用 schema 合成器对真实业务 schema 的随机品牌填充。为测试提供固定 fixture，且名称必须明显标记为 `Synthetic Example`。
4. entity 抽取在 deterministic 模式只保留 DOM/JSON-LD/元数据中可定位的实体；每个实体至少附带原文片段和页面 URL。
5. 对现有本地测试数据增加清理/重建脚本，但不要自动清除用户数据库；由操作者显式选择目标 DB。

验收标准：

- Example、Python、Wikipedia 的结果中不再出现页面证据之外的品牌。
- 所有 profile offering、alias 和竞品差距都能回溯到 URL + evidence span。
- synthetic 数据不能进入 cohort、calibration 或 intelligence ingest。

### P0-3 修复 GEO content 的跨领域污染

目标：非商业、非 HVAC 站点不会生成安装、空调或购买类内容。

实施建议：

1. prompt 使用结构化 JSON 输入，不再从整段 Markdown 中用 `/^- (.+)$/gm` 猜关键词。
2. 删除共享模板中的 HVAC 默认值；领域示例移到显式 `vertical=hvac` 的专用策略。
3. 生成前先确定 site archetype：product、service、publisher、community、documentation、nonprofit、unknown。
4. 对输出做 evidence grounding：关键实体、产品、数字和声明必须存在于审计证据或用户输入中；否则删除或标为“证据不足”。
5. 加 lexical contamination 检查：输出中出现站点语料之外的高置信领域词时拒绝保存并回退到确定性摘要。
6. 低证据场景应返回 `insufficient_evidence`，不能用流畅但虚构的模板填满结果。

验收标准：

- Python.org fixture 输出不含 HVAC、安装、购买、制冷剂等概念。
- 生成关键词全部能映射到站点 evidence 或用户明确输入。
- unknown archetype 不生成商业 CTA。

### P0-4 统一 partial、failed、completed 和 coverage

目标：job、audit、报告页对执行完整性的描述一致。

实施建议：

1. 将 execution outcome 设计为共享结构：`completion`、`stopReason`、`requestedPages`、`attemptedPages`、`auditedPages`、各阶段预算。
2. handler 在 commit report 前读取 budget 状态；预算已触发时保存 `status=partial`，并写入 scoringMeta。
3. 将“规则证据覆盖率”和“页面样本完成率”拆成两个字段，例如 `evidenceCoverage` 与 `sampleCoverage`。
4. partial 报告不得显示 `coverageStatus=ready`；UI 顶部应展示醒目的不完整原因。
5. 不成功的页面不能被 methodology 计入 audited page count。

验收标准：

- Python 同类场景的 job 与 report 都显示 partial/httpRequests。
- `auditedPages=4` 时，报告文案不会写成扫描 5 个 audited pages。
- 页面样本未完成时不会显示 ready。

## P1：提高评分有效性、抓取效率和建议质量

### P1-1 重构 readiness 评分

将二元“存在性”升级为可解释的质量评分：

- chunk：覆盖核心问题、段落自包含、实体明确、答案密度、重复率、可定位引用，而不只是 `length >= 40`。
- title/H1：唯一性、描述性、与主体一致性，而不只是存在。
- structured data：类型是否适配页面、字段是否完整、是否与可见内容一致。
- accessibility：区分 HTTP 可达、浏览器可渲染、内容有效、疑似拦截。
- site score：按页面类型和样本权重聚合，提供置信区间或至少 high/medium/low confidence。

同时明确命名两套分数，例如“AI visibility evidence score”和“content readiness score”，展示各自输入范围，避免 25 vs 94 的语义冲突。

### P1-2 让 discovery 预算与 `maxPages` 成比例

实施建议：

1. 抓取服务与 discovery 共享一次 robots、root HTML、sitemap 结果，避免重复获取和重复渲染。
2. 在任何 browser probe 前过滤不可审计资源：扩展名、Content-Disposition、Content-Type、已知 download 路径。
3. 按目标页数制定阶段预算，例如 `maxPages=5` 时：sitemap files ≤ 3、candidate probe ≤ 10、hub pages ≤ 3，并为最终审计页面预留预算。
4. 候选排序先用 URL、anchor text、sitemap metadata 等廉价特征；只有接近入选阈值的候选才启用浏览器。
5. 增加 phase usage：robots、sitemap、hub、probe、audit-render、offsite，报告预算消耗最大的阶段。
6. 达到 discovery 子预算时停止发现但继续审计已选页面，不让探索耗尽整个 job 预算。

验收标准建议：Python.org、`maxPages=5` 的 smoke test 总 HTTP 请求不超过 40，二进制 URL browser probe 为 0，并完成 5 个有效 HTML 页或清楚说明站点侧失败。

### P1-3 收紧 site profile 推断

实施建议：

- alias 只接受明确的 Organization alternateName、品牌声明或多页一致名称；页面标题不能直接作为 alias。
- offering 优先来自 Product/Service JSON-LD 或明确页面区块；单个模型实体不得改变站点角色。
- role 推断至少结合 schema、站点描述、导航结构和多页证据；证据冲突时返回 unknown/needs_review。
- 将 confidence 与 evidence count、来源独立性、页面覆盖率绑定，而不是固定 0.7。

### P1-4 提升建议与改写质量

当前确定性建议会生成如 “PyCon US are defined by...” 一类语法和语义都不自然的句子。建议：

- 先按 page archetype 选择建议模板，再填充证据。
- 对实体单复数、专有名词、页面类型做语法处理。
- 建议必须包含“问题证据 → 为什么影响 GEO → 可执行修改 → 验证方法”。
- 对没有可靠内容语义的页面，仅给结构性建议，不自动编造改写文案。
- 对规范归属、平台支持等容易变化的说法附来源或使用中性表述，避免无证据的权威归因。

### P1-5 增加竞品可比性门槛

实施建议：

- 比较前验证 target 与 competitor 是否属于可比类别；Example 与 Wikipedia 这类组合应提示低可比性。
- 只比较相同 scoreVersion、采样策略和 completion 状态的数据。
- 竞品优势必须来自 observed evidence；无证据时返回 `insufficient_evidence`。
- 报告展示每条 gap 的双方证据、采样页和置信度。

## P2：回归测试与可观测性

### P2-1 建立 golden fixtures

保存经脱敏、许可合适的 HTML fixtures，用固定输入覆盖：

- 极简站：防止 presence-only 规则得到过高 readiness。
- 文档/社区站：防止被误判为商品站。
- 商业服务站：验证 service/offering 与 CTA。
- 大型 sitemap：验证预算和优先级。
- 二进制下载链接：验证预过滤。
- blocked/timeout/robots：验证 unavailable 与 partial。

核心断言：

- free 模式 provider 调用数为 0。
- synthetic entity 持久化数为 0。
- 输出中的实体都有 evidence URL/span。
- partial 不会显示 ready。
- 请求数随 maxPages 有明确上界。
- 非 HVAC fixture 不出现 HVAC 词汇。

### P2-2 分层测试策略

- 单元测试：capability gateway、URL/content-type filter、keyword parser、role inference、score criteria。
- 集成测试：queue → handler → DB → report，重点验证 partial 状态贯穿。
- 契约测试：mock provider 只验证 schema，不验证事实质量，并强制 synthetic 标签。
- 夜间外站 smoke：选择稳定、允许抓取的站点，限制频率；不把实时网页快照作为普通 CI 的精确断言。
- UI 验收：补做浏览器流程，包括提交、进度、取消、失败提示、partial banner、证据展开和移动端布局。

### P2-3 统一运行诊断

为每个任务记录并展示：

- resolved run mode、provider、model、capability decision
- 每阶段 duration、HTTP/browser/search/token 用量
- requested/discovered/probed/attempted/audited/failed page counts
- completion、stopReason、unavailableReason
- 输出 provenance 分布：observed/derived/model/synthetic

## 5. 推荐实施顺序

1. 先完成 P0-1 与 P0-2，阻止不可信数据继续产生和进入 intelligence 数据链。
2. 同一批次完成 P0-3，修复内容输出的领域污染；在修复前可临时隐藏 free/mock 模式下的内容生成入口。
3. 完成 P0-4，使报告明确暴露 partial，避免“任务完成”与“审计完整”混为一谈。
4. 实施 P1-2 降低抓取成本，再做 P1-1 的评分校准；否则评分实验会受到采样不稳定影响。
5. 修复 profile、建议和竞品可比性，然后用 P2 fixtures 固化行为。
6. 最后补完整 UI 浏览器验收，确认错误、证据、置信度和 incomplete 状态能够被用户正确理解。

## 6. 建议的发布门槛

满足以下条件前，不建议把当前版本标记为“结果可信”的 beta：

- 三个固定 fixture 连续运行不出现无证据实体或跨领域术语。
- free-deterministic 模式保证 0 次模型/provider 调用。
- 所有模型生成字段可见标注 provenance；synthetic 数据永不进入真实报告。
- partial/failed/unavailable 在 job、数据库、API 和 UI 四层完全一致。
- 5 页审计不会因 discovery 消耗完整 300 HTTP 预算。
- overall、readiness、coverage 的名称、计算范围和置信度对用户清晰可解释。

## 7. 总体评价

当前系统的工程骨架是成立的：路由、异步队列、抓取、抽取、评分、报告和竞品流程都能贯通，真实站点也能得到可查看的结果。但产品最核心的承诺不是“任务能完成”，而是“结果可信、可追溯、可行动”。本次实测暴露的 synthetic 实体污染、领域模板污染、partial 被展示为 ready，以及 free 模式仍调用独立 provider，都会直接破坏这一承诺。

因此当前评价是：**流程可演示，结论不可依赖；优先完成 P0 后再做下一轮验收。**
## 8. 2026-09-13 修复后验收记录

- CodeGraph 已安装并完成项目索引。
- 全量测试：107 个测试文件、319 个测试通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过。
- `npm.cmd run build`：通过，38 个静态页面生成完成。
- 审计报告已支持 partial 状态、停止原因、页面采样 coverage 和 UI 提示。
- 发现阶段已按 `maxPages` 收敛 sitemap/candidate 预算，并过滤明显非 HTML 下载链接。
- free-deterministic + mock 运行回归已验证：无模型 token 消耗，Python.org 内容关键词不再出现 HVAC 领域污染模板。

结论：本轮 P0/P1 修复和构建级验收通过；真实站点的长期稳定性、浏览器 UI 交互和外部搜索供应商效果仍需在部署环境持续观察，不能仅凭本地 mock 结果宣称全部生产场景通过。
