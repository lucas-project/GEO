# GEO 商用重设计方案：零付费服务首发、证据驱动、可验证优化

日期：2026-09-15

适用范围：GEO 产品从当前原型走向可商用的首发版本。本文保留产品和技术设计，并记录已完成的实现与验证。

## 实施状态（2026-09-15）

已落地并通过本地验证的首轮改动：

- 完整的用户选定页面范围在 discovery 预算耗尽时仍标记为 complete；预算限制保留为元数据，不再错误降级已完成的样本。
- 新 evidence/readiness 报告和导出不再展示总体 GEO 分、引用概率、站外可见度或启发式维度分。
- 新报告的改进区域只显示 evidence-backed 检查；未知状态不被当成失败或 0 分。
- 草稿复查按 target URL 过滤前后证据，不再把另一页面上同名规则的结果当作修复成功。
- 实际生产启动拒绝内存队列；Next.js 构建阶段允许加载模块但不启动该运行时检查。
- 审计入口拒绝私网、保留、文档和基准测试地址；抓取浏览器继续在主导航和每个子资源请求前复核 URL 与 DNS 结果。
- SQLite 备份和只读校验均改为 Node 原生脚本；校验执行 `quick_check` 并确认 `GeoAudit`、`Job` 两张核心表存在。
- Site 以 `(ownerId, url)` 而非全局 URL 唯一；审计和竞品任务保存请求 owner，审计 ID、报告、页面源码、重试和竞品读取都会按 owner 过滤。
- 已实现本地 invite-only 账号、workspace membership（`owner`/`editor`/`viewer`）和数据库会话；密码使用 Node 原生 `scrypt` 及独立 salt，cookie 只保存 32-byte 随机 session token，数据库只保存 SHA-256 hash。
- `GEO_BOOTSTRAP_INVITE_CODE` 只用于创建首个 owner/workspace；创建后只能由 workspace owner 经 `/api/auth/invites` 生成限次、可过期的邀请码。生产环境默认关闭本地 `local` session。
- 已提供本地 workspace 创建和切换 API；同一用户可创建独立 workspace，并在其拥有 membership 时切换 session。该能力用于本地隔离验证，也可供后续登录界面调用。
- GEO 审计、竞品、监控、intelligence、站点资料和用户证据 API 会从有效 session 推导 workspace，缺少会话返回 401；`viewer` 对本地写操作收到 403；不会采用请求体中的 tenant/owner 值。
- 通过独立 SQLite 数据库执行全部 15 个迁移，并完成 HTTP 冒烟：匿名 GEO 请求为 401，首个 owner 创建、邀请、受邀注册和 viewer session 均成功。
- 双 workspace localhost 验证：workspace B 读取 workspace A 的 monitored site 返回 404；`viewer` 创建监控站点返回 403。

仍未落地、不可因此声明商用完成的项目：登录/IP 限速、密码修改与恢复、完整 workspace 切换与 `editor`/`viewer` 权限、端到端 IDOR 测试；DNS 所有权验证、PostgreSQL/Valkey 部署、outbox、受限爬虫网络、不可变版本化数据模型、异机备份恢复演练和冻结样本精度评测。它们必须按第 21 节的 Phase B–D 完成并验收。

## 1. 结论

当前 GEO 产品没有达到商用水准，根源不是“GEO 这个方向不可实现”，而是当前设计把不可验证的推断、外部平台的不确定性、启发式页面评分和真实商业承诺混在了一起。

可以达到商用水准的部分是：

- 对客户自己网站进行稳定抓取、取证、规则审计、结构化建议、人工确认后的优化草稿、修改后的同范围复查。
- 在不使用任何付费 API、付费 token、付费 SaaS 的前提下，基于开源可商用组件和自建逻辑完成首发。
- 给客户一个可信的结果：哪些页面被看到了，哪些事实被抽取到了，哪些规则通过或失败，哪些地方证据不足，哪些修改已被复查确认。

不能在首发中承诺的部分是：

- 预测某个 AI 搜索平台未来会不会引用客户网站。
- 精确衡量 ChatGPT、Perplexity、Google AI Overview、豆包、Kimi 等平台的真实排名或引用概率。
- 用本地模拟结果替代真实外部平台表现。
- 自动判断全网口碑、竞争对手影响力、社交媒体权威性，并把它们合成为一个精准 GEO 分数。

所以，正确方向不是继续堆模型、堆评分、堆第三方搜索接口，而是把产品重心收缩为“证据驱动的网站可读性和事实可验证性系统”。这不是降级，是把产品从玄学指标拉回到客户能相信、能复查、能交付的商业工具。

## 2. 成本和技术边界

首发版本必须满足以下约束：

- 不使用付费 LLM API。
- 不使用付费 embedding、rerank、SERP、代理、爬虫、监控、对象存储、数据库、队列、认证或邮件服务。
- 不依赖第三方免费额度作为生产能力，例如免费 token、免费搜索次数、免费云数据库额度。
- 可以使用开源可商用软件，自行部署在已有机器或低成本服务器上。
- 可以从 0 自己构建业务逻辑、规则系统、证据系统、报告系统和工作流。
- 可以保留未来替换为付费基础设施或付费 API 的接口边界，但首发不能因为缺少付费服务而失效。

这意味着首发版本不应该依赖“免费但不稳定”的外部能力。它应该默认所有外部智能服务都不可用，仍然可以完成核心商业价值。

基础设施成本不是 0。硬件、电力、带宽、域名、备份介质和人力仍然存在。但产品架构不应绑定任何按量收费 API，也不能在客户增长前就制造不可控账单。

## 3. 首发产品定位

首发产品应该定位为：

> 面向企业网站和服务型网站的 GEO 证据审计与可验证优化系统。

用户流程：

1. 用户创建 workspace。
2. 用户验证自己拥有或管理的域名。
3. 用户选择要审计的页面范围。
4. 系统抓取页面，保存可复查证据。
5. 系统基于确定性规则判断页面是否适合被 AI 和搜索系统理解。
6. 用户确认企业事实，例如公司名称、服务范围、地址、联系方式、FAQ、资质。
7. 系统生成不编造事实的优化草稿。
8. 用户人工发布到自己的网站。
9. 系统重新抓取同一范围，确认问题是否真实解决。
10. 报告展示前后证据、规则结果和仍然未知的部分。

商业承诺必须改为：

- 我们能证明你的网站中哪些信息现在可被机器稳定读取。
- 我们能证明哪些结构、事实和页面信号存在问题。
- 我们能给出不编造事实的修复建议。
- 我们能复查这些修复是否已经出现在页面上。

不能承诺：

- 我们能保证 AI 平台引用你。
- 我们能保证排名提升。
- 我们能精确预测引用概率。
- 我们能在没有平台 API 或真实观测的情况下证明外部平台表现。

## 4. 当前系统分类

### 4.1 可以保留并改进的功能

| 功能 | 当前问题 | 商用改法 |
| --- | --- | --- |
| 页面抓取 | 抓取成功、分析成功、报告成功混在一起 | 拆成 requested、attempted、observed、analyzed、unknown、notApplicable |
| HTTP + Browser 抓取 | 可以继续用，但失败原因和资源限制不够清晰 | HTTP 优先，证据不足时进入 Playwright；记录浏览器版本、viewport、locale、timezone、资源限制 |
| 页面内容抽取 | 有价值，但不能直接推出 AI 分数 | 抽取 title、meta、正文、heading、FAQ、schema、canonical、robots、links，并绑定 evidenceRef |
| FAQ 抽取 | 当前容易把空结果当成功 | 只接受页面可见问答或可验证 FAQPage；空结果是 no_visible_pairs |
| Schema 检查 | 当前容易把“存在”当“正确” | 检查语法、字段冲突、可见内容一致性、确认事实一致性 |
| 优化草稿 | 有价值，但必须防止编造 | 草稿只能来自已抽取事实或用户确认事实；缺信息时进入 needs_input |
| Recheck | 方向正确，但匹配粒度不够 | 按 site + pageKey + ruleId + ruleVersion + baselineRevision 匹配 |
| Job/Queue | 现有 BullMQ/内存队列方向可复用 | 生产必须禁用静默内存 fallback，所有任务可恢复、可取消、可追踪 |
| 报告 UI | 可以保留 | 报告要展示证据、未知、不可适用、失败原因，不展示伪精确总体分 |

这些功能不是要推倒重来，而是要把输出契约改掉：从“我猜测你的 GEO 表现”改成“我证明这些页面事实和结构现在是什么状态”。

### 4.2 无法控制精准度，首发应移除的功能

| 功能 | 为什么首发移除 | 后续可怎么回来 |
| --- | --- | --- |
| AI 引用概率 | 没有真实平台观测时不可验证 | 未来作为“样本观测”，不是概率承诺 |
| 全平台 AI visibility 总分 | 不同平台、时间、用户、地域结果变化大 | 未来拆成平台级采样记录 |
| 本地 LLM 模拟排名 | 本地模型不能代表商业 AI 搜索平台 | 只能作为内部实验，不对客户展示 |
| 自动全网竞品发现 | 免费稳定数据源不足，误判成本高 | 后续接入客户手动竞品或付费搜索 API |
| Offsite presence 综合影响力 | 社交、评价、新闻、目录数据不可稳定免费获取 | 首发先移除；后续作为单独观测模块 |
| 自动 ROI/流量提升归因 | 缺少搜索控制变量和客户 analytics 权限 | 后续接入客户自有 analytics 后做趋势，不做因果承诺 |
| 自动发布 CMS | 风险高，权限复杂 | 首发人工复制发布，后续按 CMS 做独立集成 |
| 长文自动生成工厂 | 容易编造，且不解决证据可信问题 | 后续只基于确认事实生成短结构化片段 |

这些功能不是技术上永远不能做，而是免费首发无法稳定、可靠、可解释地做到商用。首发应该删除入口、API 写入、调度任务、报告指标和导出字段，而不是只在 UI 隐藏。

### 4.3 设计失败，需要重建的部分

| 当前设计 | 失败原因 | 新设计 |
| --- | --- | --- |
| 总体 GEO Score | 把词数、heading、FAQ、schema 等启发式指标合成一个看似精准的分数 | 不再给总体 GEO 分，只给规则级 pass/fail/unknown/not_applicable |
| Citation Probability | 没有外部平台真实证据，数值会误导客户 | 删除首发输出；未来只记录真实采样观测 |
| 高置信 evidence | evidence 存在不等于结论被证据支持 | 每条结论必须引用具体 evidenceRef 和 reasonCode |
| 抓取完成即报告可信 | 抓取、解析、规则适用、报告生成是不同阶段 | 引入 Acquisition、Extraction、Rule、Report 四类状态 |
| 本地开发 owner stub | 多租户 SaaS 无法商用 | 实现真实账号、session、workspace、tenant 权限 |
| 内存队列 fallback | 生产丢任务却看似运行 | 生产环境无 BullMQ/Valkey 时直接启动失败 |
| Recheck 只看规则通过 | 可能不是同一页面、同一问题、同一版本 | 基于 baselineRevision 和 evidence 对比 |
| 付费模型兜底 | 与零付费首发目标冲突 | 首发禁用所有远程模型，模型只作为未来可选增强 |

## 5. 新的输出契约

报告只允许输出四类信息：

1. Acquisition Observation：页面是否被请求、是否成功访问、是否被 robots/noindex/canonical 等限制影响。
2. Extracted Facts：页面中实际抽取到的事实和结构。
3. Rule Conclusions：基于可解释规则得出的 pass/fail/unknown/not_applicable。
4. Drafts and Rechecks：基于确认事实生成的草稿，以及发布后的复查结果。

禁止输出：

- 未经观测的 AI 平台结论。
- 没有证据链的“Verified”。
- 把 unavailable 显示成 0 分。
- 把本地模拟结果显示成真实平台表现。
- 不可复查的综合权重分。

规则字段：

```ts
type RuleResult = {
  ruleId: string;
  ruleVersion: string;
  supportedPageTypes: string[];
  requiredInputs: string[];
  applicability: "applicable" | "not_applicable" | "unknown";
  outcome: "pass" | "fail" | "unknown" | "not_applicable";
  reasonCode: string;
  evidenceRefs: string[];
  recommendationTemplate?: string;
};
```

商用报告中最重要的不是“分数更好看”，而是客户能理解每一条结论为什么成立。

## 6. 规则系统重设计

### 6.1 首发规则范围

首发只做可确定规则：

- 页面是否可访问。
- 最终 URL、状态码、重定向链是否稳定。
- robots、noindex、canonical、hreflang 是否影响可读性。
- title、meta description 是否存在且与页面主题一致。
- 页面是否有可抽取的主要内容。
- heading 层级是否严重混乱。
- FAQ 是否真实可见，且可与 FAQPage schema 对应。
- JSON-LD 是否可解析。
- Organization、LocalBusiness、Service、Product、FAQPage schema 是否与确认事实冲突。
- 内链是否存在明显 broken link。
- 联系方式、地址、服务范围等关键事实是否存在且一致。

首发不做：

- “AI 会不会引用”。
- “平台偏好评分”。
- “权威性百分比”。
- “外部声量强弱”。
- “竞品全网覆盖率”。

### 6.2 规则结果语义

每条规则只能有四种结果：

- pass：证据显示规则通过。
- fail：证据显示规则失败。
- unknown：证据不足，不能判断。
- not_applicable：此页面类型或用户目标不适用。

unknown 不能参与失败率，not_applicable 不能参与通过率。报告必须分开显示：

- requested pages
- attempted pages
- observed pages
- analyzed pages
- unknown pages
- applicable rules
- passed rules
- failed rules
- unknown rules
- not applicable rules

### 6.3 示例修正

旧设计：

- FAQ 不存在，扣 GEO 分。
- 多个 H1，扣 AI 理解分。
- schema 不存在，扣总体分。
- 页面词数少，降低 citation probability。

新设计：

- FAQ 只在用户声明该页面应有 FAQ 或页面类型需要 FAQ 时检查。
- 多个 H1 只报告结构问题，不声称 AI 一定无法理解。
- schema 不存在只报告 schema.present=false，不自动等于低质量。
- 词数只用于“内容可抽取性”辅助判断，不参与引用概率。

## 7. 证据采集设计

每次审计生成不可变 ScopeManifest：

```ts
type ScopeManifest = {
  tenantId: string;
  siteId: string;
  requestedUrls: string[];
  canonicalizationVersion: string;
  captureProfileVersion: string;
  ruleSetVersion: string;
  referenceTime: string;
  resourceLimits: {
    maxPages: number;
    maxDepth: number;
    maxHtmlBytes: number;
    maxBrowserRequestsPerPage: number;
    maxNetworkBytesPerTask: number;
    httpTimeoutMs: number;
    browserTimeoutMs: number;
  };
};
```

抓取策略：

- HTTP 抓取优先。
- HTTP 证据不足时才进入 Playwright。
- 页面稳定不使用无限等待的 networkidle，使用 DOMContentLoaded + 有界文本稳定检测。
- 记录 browser version、viewport、locale、timezone、userAgent、blocked resource types。
- 对动态页面记录 capture_incomplete，而不是假装完整。
- 对 FAQ 只做安全展开，例如 details/summary、aria-controls accordion；不点击购买、提交、登录、删除、发送类动作。

每个 PageObservation 至少包含：

- requestedUrl
- finalUrl
- statusCode
- redirectChain
- fetchMode: http 或 browser
- rawHash
- semanticHash
- capturedAt
- captureProfileVersion
- parserVersion
- failureReason
- evidenceItems

rawHash 用于证明原始内容变化。semanticHash 用于证明可见核心内容变化。价格、日期、库存、地址、电话等商业事实不能被 semanticHash 忽略。

## 8. 优化草稿设计

首发不需要 LLM。优化草稿用确定性模板生成，来源只允许三类：

- extracted：页面中已经抽取到的事实。
- user_asserted：用户手动确认的事实。
- derived_safe：从 URL、title、页面结构中安全推导出的低风险字段。

禁止生成：

- 未确认奖项。
- 未确认认证。
- 未确认价格。
- 未确认服务城市。
- 未确认客户案例。
- 未确认营业时间。
- 未确认公司历史。
- 未确认对比竞品内容。

草稿状态：

- needs_input：缺少必要事实。
- ready：可供用户复制发布。
- dismissed：用户忽略。
- applied_declared：用户声明已发布。
- verification_pending：等待复查。
- verified：复查确认目标内容出现。
- still_present：复查确认问题仍存在。
- cannot_determine：复查证据不足。

草稿类型：

- title 建议。
- meta description 建议。
- Organization schema。
- LocalBusiness schema。
- Service schema。
- FAQPage schema。
- 页面结构 checklist。
- canonical/noindex/hreflang 检查建议。

ready 状态必须满足：

- 没有 placeholder。
- 所有字段都有 sourceType 和 evidenceRef。
- schema 可解析。
- 与用户确认事实不冲突。
- 不包含系统无法证明的新事实。

## 9. Recheck 设计

Recheck 不是“重新跑一遍分数”，而是验证某个基线问题是否在同一范围内被解决。

匹配键：

```ts
type VerificationTarget = {
  siteId: string;
  pageKey: string;
  ruleId: string;
  ruleVersion: string;
  baselineReportRevisionId: string;
  draftRevisionId?: string;
};
```

复查必须回答：

- 当前页面是否仍可访问？
- 当前页面是否与 baseline 可比较？
- 原问题是否仍存在？
- 草稿中的目标内容是否出现？
- 出现的内容是否与确认事实一致？
- 是否因为抓取失败、页面变更、规则升级导致不能判断？

复查输出：

- verified：问题已解决，证据充分。
- still_present：问题仍存在。
- changed_unrelated：页面变化了，但目标问题没有被证据证明解决。
- cannot_determine：无法判断。
- not_comparable：当前页面和 baseline 不可比较。

## 10. 多租户和安全设计

当前开发 owner stub 不能用于商用。首发必须实现真实账号和租户隔离。

账号系统：

- 本地账号邀请制。
- 密码使用 Node 原生 crypto.scrypt。
- 每个密码独立 salt。
- 保存算法参数，便于未来升级。
- 登录按账号和 IP 限速。
- session token 使用 32 字节随机值。
- 数据库只保存 session token hash。
- Cookie 使用 HttpOnly、Secure、SameSite=Lax。
- 修改密码后撤销其他 session。
- 首发不用付费邮件服务；账号邀请和恢复可以使用一次性恢复码。

租户权限：

- Owner
- Editor
- Viewer

所有 Site、AuditRun、ReportRevision、Draft、Verification、Snapshot、Job 都必须绑定 tenantId。API 不能信任 body 中传来的 tenantId，只能从 session 和 workspace membership 推导。

站点验证：

- DNS TXT 验证，或
- 指定路径文件验证。

没有验证所有权的域名不能进入自动审计队列。验证过期后必须重新确认。

SSRF 防护：

- 禁止访问 localhost、private IP、link-local、metadata IP。
- 同时拒绝保留、文档和基准测试地址段；不能将其当作可抓取公网地址。
- 重定向后重新验证 IP。
- 浏览器子资源也要执行网络限制。
- 应用层在主导航和每个子资源请求前校验 URL 与 DNS 结果；生产部署还必须用容器/防火墙的出站规则强制阻断私网、metadata 和本机地址。应用层 DNS 预检不能单独消除 DNS 重绑定窗口。
- 抓取浏览器不能挂载应用密钥、数据库文件或敏感目录。

## 11. 队列和任务可靠性

首发生产环境推荐：

- Next.js 应用。
- PostgreSQL 自托管。
- BullMQ。
- Valkey 或 Redis 兼容服务。
- 独立 worker 进程。
- 私有文件系统保存压缩 snapshot。

关键规则：

- 生产环境禁止静默退回内存队列。
- Job 创建、quota 预留、outbox 记录必须在数据库事务中完成。
- Worker 使用 DB lease 和 fencing token。
- 心跳不能只依赖 progress 更新。
- 完成、失败、取消都必须落库。
- 任务可以 at-least-once 执行，但写入必须幂等。
- 取消任务必须中止 HTTP、browser、后续写入，并保留已消耗资源记录。

任务状态：

- queued
- running
- completed
- partial
- failed
- cancelled

partial 不是失败的美化。它表示部分页面或规则完成，但仍有明确未完成原因。

## 12. 资源限制和免费首发配额

为了保证零付费服务下稳定运行，首发必须限制规模。

建议默认配额：

| 项目 | 默认值 |
| --- | --- |
| 每个租户验证站点数 | 1 |
| 每次审计页面数 | 10 |
| 每月 page checks | 100 |
| 每租户同时任务 | 1 |
| 全局浏览器并发 | 1 |
| HTTP timeout | 20s |
| Browser timeout | 45s |
| 单任务上限 | 10min |
| HTML 解压上限 | 5MiB |
| 单任务网络上限 | 100MiB |
| 单页面 browser request 上限 | 200 |
| raw snapshot 保存 | 30 天 |
| 报告和必要证据保存 | 180 天 |

这些配额不是产品弱，而是免费自建阶段保持稳定的前提。后续用户增加后，可以优先扩展 worker、浏览器池、数据库和存储，再考虑付费外部服务。

## 13. 数据模型建议

核心实体：

- Tenant
- Membership
- Site
- SiteVerification
- AuditRun
- ScopeManifest
- PageObservation
- EvidenceItem
- ExtractedFact
- RuleResult
- ReportRevision
- Draft
- Verification
- Job
- OutboxEvent
- ResourceUsage

重要原则：

- ReportRevision 不可变。
- EvidenceItem 不可变。
- RuleResult 引用 EvidenceItem。
- Draft 引用 ExtractedFact 或 UserConfirmedFact。
- Verification 引用 baseline report 和当前 observation。
- 旧报告不因规则升级被静默改写。

## 14. API 设计

首发 API：

- POST /api/sites
- POST /api/sites/{siteId}/verify
- POST /api/audits
- GET /api/jobs/{jobId}
- POST /api/jobs/{jobId}/cancel
- GET /api/audits/{auditId}/report
- POST /api/audits/{auditId}/drafts
- PATCH /api/drafts/{draftId}
- POST /api/drafts/{draftId}/applied
- POST /api/drafts/{draftId}/rechecks
- GET /api/usage

错误语义：

- 202：任务已排队。
- 400：请求结构错误。
- 401：未登录。
- 403：无权限或站点未验证。
- 404：资源不存在或跨租户资源不可见。
- 409：idempotency key 冲突、旧 revision、状态冲突。
- 429：配额或并发限制。
- 503：依赖不可用，例如队列不可用。

idempotency：

- 同 tenant + operation + idempotencyKey + same body 返回同一任务。
- 同 key 不同 body 返回 409。

## 15. 零付费服务技术栈

首发推荐：

| 层 | 技术 | 原因 |
| --- | --- | --- |
| Web | Next.js | 当前项目已有 |
| DB | PostgreSQL 自托管 | 成熟、开源、商用友好 |
| ORM | Prisma | 当前项目已有 |
| Queue | BullMQ | 当前项目已有，MIT license |
| Queue backend | Valkey 或 Redis 兼容服务 | Valkey 是开源 Redis 分支，许可证更适合自托管审查 |
| Browser | Playwright | 当前项目已有，适合稳定抓取 |
| HTML parsing | Cheerio | 当前项目已有 |
| Validation | Zod | 当前项目已有 |
| Logging | Pino | 当前项目已有 |
| Reverse proxy | Caddy 或 Nginx | 自托管 HTTPS |
| Storage | 本地私有文件系统 | 首发避免对象存储成本 |
| Backup | 本地压缩备份 + 异机介质 | 不依赖付费云备份 |

已核对的公开许可来源：

- BullMQ license: https://github.com/taskforcesh/bullmq/blob/master/LICENSE
- Valkey copying/license file: https://github.com/valkey-io/valkey/blob/unstable/COPYING
- PostgreSQL license: https://www.postgresql.org/about/licence/
- Playwright license: https://github.com/microsoft/playwright/blob/main/LICENSE
- BullMQ Redis compatibility note: https://docs.bullmq.io/guide/redis-tm-compatibility/

注意：这不是完整 license clearance。真正上线前还要对 package-lock、浏览器二进制、字体、容器镜像、transitive dependencies 做精确版本级清单。

## 16. 评测和验收标准

商用验收不能只看 typecheck、lint、test、build。它们只能证明工程没有明显坏掉，不能证明 GEO 输出可靠。

必须建立冻结样本集：

- 至少 240 个真实网页样本。
- 覆盖中文和英文。
- 覆盖 home、service、product、case study、article、FAQ、contact。
- 覆盖静态站、JS 渲染站、blocked 页面、bad JSON-LD、事实冲突页面。
- 每条核心规则至少 50 个相关 heldout 样本。

规则验收目标：

- 每条核心规则 precision >= 95%。
- 每条核心规则 recall >= 90%。
- unknown 率单独报告。
- 不足 50 个相关样本的规则不能标记为 stable，只能标记 experimental。

稳定性验收：

- 同一 frozen snapshot 重跑 20 次，逻辑输出必须一致。
- 输出比较不能只比较非空字段，要比较 rule outcome、reasonCode、evidenceRefs、draft content。
- 页面顺序打乱后，报告不应串页。
- HTML 空白、class 顺序、无关属性变化不应改变结论。
- 商业事实变化必须被检测到。

故障验收：

- Worker crash 后任务可恢复。
- 重复 delivery 不产生重复报告。
- Cancel 后不继续写成功结果。
- Queue 暂停时 API 明确返回 queued 或 503。
- Snapshot 丢失时报告不能假装可复查。
- Disk full 有明确失败原因。
- SSRF 测试必须通过。
- 跨租户 IDOR 测试必须通过。
- 禁用所有外部模型和搜索服务后，全流程仍可完成。

Playwright 验收：

- 从登录到站点验证。
- 创建审计。
- 等待任务。
- 查看报告。
- 生成草稿。
- 标记已应用。
- 发起 recheck。
- 查看前后证据。
- 桌面和移动视口都可用。

这类 Playwright 验收关注的是产品语义是否可靠，不是 UI 响应速度。

## 17. 运维设计

首发可以不接付费监控，但不能没有观测。

本地观测：

- structured logs。
- job 状态统计。
- task duration。
- failure reason。
- unknown rate。
- rule failure rate。
- browser crash count。
- CPU、memory、disk、network。
- queue length。
- per-tenant resource usage。

备份目标：

- 每日完整备份。
- 每小时增量或 WAL 归档。
- 备份必须离开主数据盘。
- 每次备份后先做 SQLite integrity 和核心表验证；至少每周恢复演练一次。

内部目标：

- RPO <= 1h。
- RTO <= 4h。
- 14 天 invite-only 试运行不丢任务、不串租户、不编造事实。

如果没有独立备份，只能称为内部试用，不能称为商用可恢复服务。

## 18. 未来付费服务如何接入

后期付费服务可以改善体验，但不能改变核心可信契约。

可以接入：

- Managed PostgreSQL：提升运维和备份。
- 对象存储：提升 snapshot 保存和下载。
- 更大的 worker/浏览器池：提升并发。
- 真实 SERP 或平台 API：增加外部观测样本。
- LLM API：生成更自然的文案候选。
- 邮件服务：邀请、登录恢复、通知。
- APM：更好的告警和性能追踪。

不能接入后就改变为：

- LLM 生成事实。
- API 采样结果变成未来概率承诺。
- 付费搜索结果变成全网事实。
- 外部平台不可用时继续展示旧结论为当前结论。

未来模型只负责候选表达，不负责事实真相。事实真相仍来自页面证据、用户确认和真实观测。

## 19. 与旧设计的差异

| 维度 | 旧设计 | 新设计 |
| --- | --- | --- |
| 核心承诺 | GEO 分数和引用概率 | 可验证的网站证据和修复闭环 |
| AI 依赖 | 可接入远程模型 | 首发零远程模型 |
| 搜索依赖 | 可接入搜索 API | 首发不依赖搜索 API |
| 结果形态 | 综合分、概率、层级分 | 规则级结论、证据、未知状态 |
| 事实来源 | 页面、推断、模型混合 | 页面证据和用户确认 |
| 失败处理 | 可能显示 0 或 partial score | 明确 unknown、not_applicable、failureReason |
| 租户模型 | 开发 stub | 真实账号、workspace、权限、站点验证 |
| 队列模型 | 可 fallback 内存 | 生产必须 durable queue |
| 商业验收 | 测试通过和页面可用 | 冻结样本、规则精度、故障恢复、Playwright 语义流程 |

## 20. 迁移方案

不要直接在旧报告上修补分数语义。建议迁移：

1. 冻结旧报告为 legacy revision。
2. 给旧字段加 legacy 标记。
3. 停止写入 citationProbability、overallGeoScore、visibilityScore。
4. 对可复用 PageObservation 重新生成新 RuleResult。
5. 如果缺少 snapshot 或 evidenceRef，则要求重新审计。
6. 新报告只从完整证据链生成。
7. 前端保留一个版本读取期，但新任务只写新格式。

旧数据不能被静默改造成新语义，否则会污染商业可信度。

## 21. 实施阶段

### Phase A：产品契约收缩

- 删除首发不可承诺指标。
- 定义 RuleResult、EvidenceItem、ReportRevision。
- 报告 UI 改成证据和规则结论。
- 禁用外部 AI 和搜索依赖。

### Phase B：商用基础设施

- 实现真实账号和租户权限。
- 实现站点验证。
- 禁用生产内存队列 fallback。
- 加入 durable queue、worker lease、cancel、resource usage。
- 加入 SSRF 防护。
- 加入备份和恢复流程。

### Phase C：证据和优化闭环

- 重建抓取 manifest。
- 重建抽取和规则系统。
- 重建 deterministic draft。
- 重建 recheck。
- 建立 frozen fixture 评测。

### Phase D：受控试运行

- invite-only。
- 每租户低配额。
- 手动客服和日志巡检。
- 14 天稳定性观察。
- 达到规则精度和故障恢复目标后再扩大。

## 22. 最终判断

这个产品可以做成商用，但必须接受一个清晰事实：首发的核心不是“证明客户已经被 AI 喜欢”，而是“证明客户网站的事实、结构和机器可读性已经达到可被可靠理解的状态”。

旧设计失败的地方，是把不可控外部 AI 平台的结果包装成可控指标。新设计的核心，是把所有结果绑定到可复查证据，把未知明确显示为未知，把首发能力压到免费自建也能稳定完成的范围。

如果按本文重建，免费成本阶段可以稳定交付一个可信产品。付费服务阶段可以提升覆盖、速度和体验，但不应该改变产品的真实性边界。
