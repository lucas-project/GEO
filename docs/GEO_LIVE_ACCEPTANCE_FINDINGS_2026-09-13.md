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

## 9. 2026-09-13 重新功能验收

环境：`free-deterministic`、`AI_PROVIDER=mock`、内存队列、SQLite。

| 功能 | 结果 | 证据 / 结论 |
| --- | --- | --- |
| 单页抓取 | 通过 | `https://example.com`、`maxPages=1` 异步任务完成，返回 1 页。 |
| 页面发现 | 通过 | 返回根页作为唯一候选；未发现非 HTML URL。 |
| GEO 审计 | 基础链路通过 | 任务完成；sample coverage 为 1/1，completion 为 complete，实体为 Example Domain 且 offerings 为空，未注入 mock 品牌。 |
| 内容生成 | 未通过质量验收 | 不再出现 HVAC 模板，但把正文句子片段（例如 `documentation examples without`）当关键词，生成问题不可直接使用。 |
| 竞品比较 | 基础链路通过 | Example Domain 与 IANA 的比较任务完成并返回维度差距；结论仅适合作为 crawl-only 的方向性比较。 |
| 站外存在 | 部分通过 | crawl-only 任务完成并明确 source 为 crawl；但同样继承了低质量关键词，不能据此给出可信的站外策略。 |
| AI 模拟 | 通过预期降级 | 配置返回 `mode_disabled`，调用返回 HTTP 409 和可解释信息，没有伪造模型结果。 |
| partial API 贯通 | 未通过 | `getAudit()` 未从数据库 select / 返回 `GeoAudit.status`；报告可依赖 `scoringMeta.completion` 显示部分状态，但 API 四层一致性尚未达标。 |

本次重新验收结论：异步任务、抓取、审计、发现、竞品比较和受控降级均能运行；内容关键词提纯，以及 `GeoAudit.status` 的 API 映射仍是阻止“结果可依赖”发布的两个明确缺口。

## 10. 下一步详细修复计划（以达到可交付预期为目标）

### 阻塞项 A：关键词必须代表主题，而不是正文偶然三元组

当前问题：`example.com` 产生了 `documentation examples without`、`examples without needing` 等跨句或导航语义片段。它们虽然来自页面正文，但不能作为主题关键词，也会污染内容包、站外搜索计划和推荐。

根因判断：当前候选词流程主要依赖 n-gram/频次和少量停用词；缺少句法边界、词组质量、页面信号权重、重复短语压缩和“主题不足时返回空结果”的安全阀。

实施步骤：

1. 在 `src/modules/geo-content/keywords.ts` 增加统一候选词管线：先按 HTML/句子边界切分，再生成词组；禁止跨句、跨标签、跨导航项拼接。候选词必须由 2–5 个词组成，且不能以介词、连词、冠词、代词或动词残片开头/结尾。
2. 扩展质量规则：拒绝包含 `without/with/and/or/the/for/to/of/is/are/you/your` 等功能词的低信息短语；拒绝 CSS、HTML、导航、cookie、权限说明、下载说明、模板文本和完整问句；拒绝只由通用词组成的候选词。
3. 引入来源权重：`title`、`h1`、JSON-LD、meta description 的权重高于正文；正文候选词必须在至少两个独立上下文出现，或同时出现在标题/heading 中才可进入最终关键词集合。
4. 增加实体/主题置信度门槛：当页面只有通用占位内容（如 Example Domain）或有效候选词不足 3 个时，返回空或“insufficient topic evidence”，不得用低质量短语填满 5 个关键词。内容生成应使用中性主题提示，而不是生成看似确定的行业问题。
5. 在 `src/modules/geo-content/mock-pack.ts`、站外 presence 规划和其他关键词消费者中统一读取清洗后的关键词，并保留每个词的 `source`、`evidence`、`confidence`；低置信度词不得进入搜索查询或推荐。
6. 增加固定 fixture：Example Domain、Python.org、带 JSON-LD 产品页、包含导航/下载链接的文档页。每个 fixture 都验证关键词不能跨句、不能包含 HVAC/其他领域模板、不能包含 CSS/导航片段，并验证低证据页面会返回 insufficient 状态。

完成标准：

- Example Domain 不再产生上述两个错误短语，也不再产生 `body{background`、`vh auto;font-family` 等代码片段。
- Python.org 关键词只来自页面真实主题或明确结构化数据，不出现 HVAC、模板行业词或导航句子。
- 关键词进入内容包和站外搜索计划前均有可追溯 evidence；证据不足时显示不足，而不是填充猜测。
- 新增单元测试、API 集成测试和两次真实 HTTP 回归均通过。

### 阻塞项 B：GeoAudit.status 必须贯通数据库、服务、API、队列和 UI

当前问题：数据库已写入 `partial`，但 `getAudit()` 的 select 和返回对象没有包含 `status`，因此 `/api/geo-audit/:id` 返回中缺少状态字段。UI 目前只能依赖 `scoringMeta.completion`，四层状态并不一致。

实施步骤：

1. 在 `src/modules/geo-audit/service.ts` 的 `getAudit()` 查询中选择 `status`，并将其映射到 `GeoAuditResult`；同时检查列表接口、报告导出接口和 recompute/extend 路径，确保都使用同一状态值。
2. 统一状态枚举：数据库/API/UI 使用 `completed | partial | failed`；队列的 `cancelled` 保留为 job 状态，不伪装成审计报告 completed。任务取消或预算耗尽时，报告必须是 partial 或 failed，并保留 `stopReason`。
3. 把 `completion`、`stopReason`、`requestedPages`、`auditedPages`、`sampleCoverage` 作为同一份派生状态写入 `scoringMeta`，避免 UI 通过多个不一致字段自行推断。
4. 为 `getAudit()`、`/api/geo-audit/:id`、报告导出和审计列表增加契约测试：普通任务返回 completed；预算耗尽返回 partial + stopReason；异常失败返回 failed；旧报告缺少 status 时按兼容规则推导并明确标记。
5. 在报告 UI、最近审计列表、导出摘要和 job 完成通知中显示同一状态文案；partial 必须明确说明“结果方向性、证据不完整、建议重新运行”。

完成标准：

- 数据库中的 status、API JSON、导出报告和 UI 文案完全一致。
- 人为触发预算停止后，用户不会看到“任务完成”与“审计完整”混淆的结果。
- 旧数据仍可读取，且不会被静默标为完整可信。

### 实施顺序与发布门槛

1. 先完成阻塞项 A 的清洗管线和 fixtures；在关键词质量测试通过前，不开放内容包和站外搜索建议作为可信结果。
2. 完成阻塞项 B 的状态映射和契约测试；在 API/UI 四层一致前，不宣称 partial 语义已经交付。
3. 运行质量门禁：`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd test`、`npm.cmd run build`。
4. 使用隔离 SQLite + memory queue 进行真实 HTTP 回归：审计、发现、抓取、内容、竞品、站外 presence、模拟不可用分支各至少一次；保存 job ID、HTTP 状态、completion、coverage、provenance 和关键输出摘要。
5. 最终发布条件：107+ 现有测试全部通过；新增 fixture/API 测试全部通过；Example Domain 与 Python.org 回归不再出现低质量关键词；partial 状态在 DB/API/UI/export 全链路一致；证据不足显示 insufficient，而不是生成伪确定性结论。

在以上条件全部满足前，产品可以演示流程，但不应把内容建议、站外策略或部分审计分数标记为可直接用于客户决策的可信结果。

## 11. 2026-09-13 计划执行后的复验结果

- 静态质量门禁通过：109 个测试文件、339 个测试通过；typecheck、lint、production build 全部通过，生产构建生成 38 个静态页面。
- `GeoAudit.status` 已贯通：真实 HTTP 审计返回 `status=completed`，同时返回 `completion=complete`、`sampleCoverage=1`、`sampleCoverageStatus=ready`；报告导出 HTTP 200 且包含状态/coverage 信息。
- partial 状态已有专门解析函数和契约测试，数据库状态与旧报告的 `scoringMeta` 可兼容映射；本次真实回归未触发预算耗尽场景，因此 partial 的真实运行回写仍应在部署前用受控低预算再验证一次。
- Example Domain 内容任务现在拒绝占位站点并返回明确错误 `Page looks like placeholder or generic example content.`，不再生成错误关键词；这符合“不猜测主题”的安全预期，但 UI 应将该错误呈现为 `insufficient_topic_evidence`，而不是普通失败，作为后续体验优化项。
- Python.org 内容任务成功完成，输出关键词包括 `Compound Data Types`、`Python Software Foundation`、`Python Programming Language` 等真实主题词；未出现此前的 `documentation examples without`、CSS 片段或 HVAC 模板污染。
- free-deterministic 模式下内容任务使用确定性 fallback pack，模型不可用仅记录 warning，不伪造模型调用成功。

复验结论：本轮计划的两个主要阻塞项已达到预期核心行为，尤其是关键词质量和审计状态 API 已通过真实 HTTP 验证。剩余工作是把“占位内容被安全拒绝”从 job failed 提升为产品级 `insufficient_topic_evidence` 展示，并补做一次人为预算耗尽的端到端 partial 回归；完成这两项后，才可将本地验收结论升级为完整发布门槛通过。
## 12. 抓取错误提示可理解性改进计划

### 目标

用户看到页面列表中的红色或黄色信息后，应能立即回答三个问题：

1. 这是网站本身有问题，还是 GEO 抓取器没有拿到页面？
2. GEO 实际尝试了什么，失败发生在哪一步？
3. 用户现在应该重试、选择其他页面，还是检查网站/CDN 配置？

内部状态名（例如 `legacy_unknown`、`parse_error`、`domcontentloaded`）只能作为“技术详情”展开内容，不能直接作为主要提示文案。

### 用户可读的状态模型

将 `CrawledPage.fetchStatus` 映射为稳定的用户状态和行动建议：

| 内部状态 | 用户主提示 | 白话解释 | 下一步建议 | 是否计入评分 |
| --- | --- | --- | --- | --- |
| `observed` | 页面已成功读取 | GEO 已取得页面内容，可以分析标题、正文和结构化数据。 | 无需操作 | 可以 |
| `timeout` | 页面响应太慢 | 页面在规定时间内没有完成加载；这不等于页面不存在。 | 重试；若持续发生，检查 CDN、脚本和首屏加载时间 | 不计入本页证据 |
| `blocked` | 网站拒绝了自动读取 | 网站/WAF 允许普通浏览器访问，但拒绝或挑战了自动化请求。 | 检查 WAF、Bot 管理、CloakBrowser/白名单；用户也可手动提供页面证据 | 不计入本页证据 |
| `rate_limited` | 网站暂时限制访问 | 请求频率或来源触发了站点限流。 | 等待后重试，减少页面数量或降低并发 | 不计入本页证据 |
| `unreachable` | 暂时无法连接网站 | DNS、TLS、连接重置或网络路径没有建立成功。 | 从服务器环境检查 DNS/TLS/代理；稍后重试 | 不计入本页证据 |
| `parse_error` | 页面打开了，但内容无法识别 | 收到了响应，但 HTML/编码/渲染结果无法安全解析。 | 检查页面响应类型、编码和 JS 渲染；重试 | 不计入本页证据 |
| `legacy_unknown` | 旧记录缺少读取结果 | 这是历史数据，系统没有保存足够信息判断当时发生了什么。 | 重新抓取该页面以获得新证据 | 不计入本页证据 |
| `not_run` | 尚未读取此页面 | 页面只是从 sitemap 或链接中发现，尚未进入实际抓取。 | 选择页面并运行审计 | 不计入本页证据 |

### 详细技术设计

1. 在 `CrawledPage` 增加结构化 `acquisitionDetail`，至少包含 `stage`（robots/sitemap/navigation/render/parse）、`reasonCode`、`technicalMessage`、`elapsedMs`、`httpStatus`、`finalUrl`、`fetchChannel`、`retryCount`、`attemptedAt` 和 `nextAction`。原始 Playwright 错误保留在详情中，不直接作为主文案。
2. 在 `src/modules/crawling/browser/pool.ts` 将 `page.goto` 异常分类：超时、连接重置、DNS/TLS、响应被取消、HTTP 阻断、浏览器渲染异常。`ERR_FAILED` 只能作为底层 `technicalMessage`，必须同时产出稳定 `reasonCode`。
3. 对 `page.goto` 导航失败执行受控恢复：先记录失败阶段，再尝试一次 HTTP HEAD/GET 元数据探测；若页面可通过 HTTP 读取，标记为 `http_observed` 并明确“未完成浏览器渲染，动态内容可能缺失”，不能冒充完整 rendered evidence。
4. 对可重试错误使用有限重试策略：最多一次 headed/CloakBrowser retry + 一次短 HTTP fallback；每次尝试都记录耗时和结果，避免同一个页面消耗完整预算多次。重试失败后停止，不让单页卡住整批审计。
5. 在 `src/modules/geo-audit/evidence.ts` 中把“页面未取得证据”和“页面内容存在但发现问题”明确区分：前者显示 `unknown / insufficient evidence`，后者才产生可评分的 fail。评分页面不得把采集失败解释成网站质量差。
6. 在 `src/features/audit/audit-pages-panel.tsx` 替换当前 `Acquisition: legacy unknown; evidence excluded from score` 单行文本：主行显示白话提示；增加“查看详情”展开区域，显示“我们尝试了什么 / 失败原因 / 是否重试 / 对评分影响 / 建议操作”。
7. 页面列表增加可读的状态徽章：`已读取`、`读取超时`、`被网站拦截`、`暂时不可连接`、`等待审计`。`GEO priority`、`Probed`、`Sitemap` 保留为次要元数据并提供 tooltip，不能和失败原因混在同一视觉层级。
8. 审计顶部增加汇总说明，例如：“12 个发现页面中 8 个已读取，3 个读取超时，1 个尚未审计。以下评分只使用 8 个已读取页面。” 点击汇总可过滤失败原因。
9. 对旧记录显示迁移提示：“这是旧审计，缺少详细读取记录；重新运行即可获得可解释的采集状态。” 不再把 `legacy_unknown` 暴露给普通用户。
10. API 和导出报告同时返回 `userMessage`、`reasonCode`、`technicalMessage`、`nextAction`，前端只用 `userMessage` 做主展示；日志和诊断页面使用完整技术详情。

### Daikin 场景的预期展示

对于当前三个 Daikin URL，用户不应看到一串难以理解的红字，而应看到类似：

> 页面本身可能正常，但 GEO 的自动浏览器在 2 分钟内没有完成页面加载。我们尝试了无头浏览器读取，未取得可验证的页面正文，因此没有把这页算进评分。建议先重试一次；如果仍失败，请检查 CDN/WAF 是否拦截自动化访问，或使用“查看技术详情”把诊断信息交给管理员。

展开详情后再显示：

> 阶段：页面导航；等待条件：domcontentloaded；耗时：120 秒；底层错误：`net::ERR_FAILED`；已尝试：stealth Chromium；重试：未执行/已执行；HTTP fallback：成功/失败；最终 URL 和 HTTP 状态。

### 测试与验收标准

- 单元测试覆盖所有 `reasonCode` 到用户文案的映射，禁止任何主要 UI 文案直接输出 `legacy_unknown`、`domcontentloaded` 或原始 `ERR_FAILED`。
- 使用模拟错误测试 timeout、WAF block、rate limit、DNS/TLS、parse error 和 legacy 数据；每种状态都验证 `userMessage`、`nextAction` 和评分是否正确排除。
- 使用 Daikin 三个 URL 做真实回归，记录每次尝试的阶段、耗时、重试路径和最终分类；即使仍然失败，用户也必须能理解“页面正常但自动采集失败”的区别。
- 测试一个正常可读页面，确认显示“已读取”，并且证据继续进入评分。
- 测试一个 sitemap 发现但未审计页面，确认显示“尚未读取此页面”，而不是“抓取失败”。
- 测试旧数据库记录，确认 UI 显示迁移提示而不是 `legacy unknown`。
- 完整门禁继续通过：`npm.cmd run typecheck`、`npm.cmd run lint`、`npm.cmd test`、`npm.cmd run build`。

完成标准：普通用户只看主提示就能判断页面问题属于“网站内容问题”还是“GEO 读取问题”，知道下一步该重试还是联系站点管理员；技术人员展开详情后能复现和定位问题；任何采集失败都不会被误算为网站质量失败。
