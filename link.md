part 1：
GEO外站影响力探测系统技术规划（Playwright CLI v1.0）
一、商业定位与闭环逻辑
本系统面向GEO SaaS产品提供"外站影响力评分"能力，解决核心商业问题：品牌在被AI引擎引用时，第三方平台的讨论质量和覆盖度如何量化。闭环逻辑为：用户输入域名→系统自动识别品牌实体→多平台探测足迹→计算参与度→输出影响力评分与优化建议→用户按建议运营外站→下次扫描评分提升→形成持续优化的价值循环。产品按扫描次数或域名数订阅收费，评分报告作为核心交付物驱动用户留存。
二、实体识别层（探测前提）
系统必须以"探测谁"为首要问题。Playwright爬取目标域名首页与关于页，提取og:site_name、schema.org/Organization的name属性、页脚版权信息中的品牌声明，交叉验证得出主品牌名，置信度低于0.8时标记人工复核。针对卖场模式（如Amazon、京东），检测首页主导航或品牌聚合页中是否出现3个以上不同品牌名，若触发则进入卖场分支：优先读取URL参数中的brand字段，若缺失则提取页面出现频率最高的前3个品牌供用户选择，或默认探测卖场自身品牌影响力。针对子品牌复杂场景（如Nike旗下Jordan、Converse），主品牌探测完成后在报告中提示"检测到关联子品牌，是否纳入扫描"。针对通用词品牌（如Apple），结合页面上下文关键词（technology、product、iPhone）与sameAs链接中的社交档案进行消歧，确保探测的是科技公司而非水果社区。
三、外站信号发现层（Playwright探测引擎）
引擎采用"本地爬取+分布式外站探测"架构，单CLI实例内通过Playwright管理多个浏览器上下文，每个平台独立一个上下文以隔离Cookie与缓存，全局并发限制为3，单平台请求间隔2-5秒随机抖动，超时15秒，失败重试2次。
Reddit探测执行三路径并行：路径一访问https://www.reddit.com/r/{brandName}检测子版块存在性与订阅数；路径二访问搜索页https://www.reddit.com/search/?q={brandName}&type=posts&sort=top&t=year提取帖子标题、subreddit、upvotes、评论数、发布时间；路径三访问 communities 搜索提取相关子版块列表。品牌名含空格时同时搜索"Air+Jordan"与"AirJordan"两种变体，结果合并去重。
Quora探测执行双路径：路径一访问https://www.quora.com/topic/{brandName}检测话题页存在性；路径二访问搜索页https://www.quora.com/search?q={brandName}&type=question提取问题标题、回答数、关注数。Quora反爬严格，单独设置5秒请求间隔，启用更真实的User-Agent，若遇登录墙则标记limited_data不阻塞流程。
G2/Capterra探测执行搜索页访问，提取产品档案存在性、评分、评论数、类别排名。G2部署Cloudflare防护，若直接访问失败则降级为检测目标网站sameAs Schema中是否包含g2.com链接，若存在则给予部分分数并标注"档案存在但数据受限"。
Trustpilot探测访问https://www.trustpilot.com/review/{domain}，提取总评分、评论数、评分分布、最近评论时间。子域名统一归一化（www.nike.com与nike.com视为同一实体），无结果时标记"未认领"并建议用户主动认领。
通用搜索探测作为兜底层，通过Google/Bing站点搜索执行"{brandName} site:reddit.com"、"{brandName} review site:reddit.com OR site:quora.com"等查询，提取搜索结果数估算提及量、前10条结果域名分布、结果时间分布判断近期活跃度。搜索层采用无痕模式与固定地理位置，控制频率避免触发限制。
四、参与度评估层（高价值帖子识别）
Reddit高参与度帖子采用加权评分公式：engagementScore = (upvotes × 0.4) + (comments × 10 × 0.35) + (awards × 50 × 0.15) + (recencyBoost × 0.1)。其中评论权重设为10倍upvotes，因评论代表深度参与；awards权重50倍，代表社区认可；recencyBoost为时间衰减因子，7天内1.5倍、7-30天1.2倍、30-90天1.0倍、90-365天0.7倍、超1年0.4倍。过滤门槛为upvotes>10且comments>5，排除纯促销帖（标题含deal/sale/coupon）、排除品牌官方账号发帖（用户名含品牌名），优先标记对比帖（标题含vs/compared/better than）。帖子按engagementScore降序排列，取Top 10纳入报告，同时按内容分类为产品讨论、品牌情感、购买决策、行业话题四类并标注情感倾向。
跨平台影响力综合评分映射到GEO评分体系D维度：D3第三方平台存在（35分）按G2/Capterra/Trustpilot档案存在性分别计10/8/10/7分；D4社区讨论活跃度（25分）按Reddit高参与度帖子数≥10得10分、3-9得6分、1-2得3分，Quora回答数≥50得8分、10-49得5分、<<10得2分；D5权威媒体引用（20分）按TechCrunch/Forbes/Wired等引用得15分、行业垂直媒体得10分。总分60分以上为合格线，80分以上为优秀。
五、反爬与稳定性策略
全局速率限制最大10请求/分钟，单平台3请求/分钟，User-Agent轮换池维护20个常见桌面浏览器标识。IP封禁时标记失败并记录日志，不阻塞其他平台继续探测。JavaScript渲染默认启用，但检测纯静态页面时自动降级为直接HTTP请求提升速度。CAPTCHA触发后标记captcha_blocked，提示用户"该平台数据受限，建议配置代理后重试"。页面结构变化采用多选择器策略，主选择器失效时自动尝试备选选择器。各平台探测失败时的降级链路：Reddit失败时尝试old.reddit.com与i.reddit.com，最终降级为Google站点搜索；G2失败时降级为sameAs链接检测；Quora失败时增加间隔至10秒重试，最终标记unreachable。
六、输出与商业价值交付
CLI输出结构化JSON报告，包含meta探测元信息、entity实体识别结果、platforms各平台原始数据、scores评分汇总、recommendations优化建议。优化建议按优先级排序，例如"Reddit r/Sneakers讨论活跃，建议品牌官方发起AMA"、"G2档案存在但数据受限，建议手动完善产品页"、"Quora近30天无新活动，存在内容空白机会"。报告同时输出Markdown格式供直接阅读，HTML格式供产品内嵌展示。用户按建议执行外站运营后，下次扫描评分提升形成正向反馈，驱动订阅续费。
七、边界情况处理
卖场多品牌场景检测首页品牌导航超3个时进入分支处理；通用词品牌通过上下文消歧；子品牌复杂场景主品牌探测后提示关联品牌；无品牌官网的纯内容站标记为"内容站模式"探测作者影响力；地域性品牌探测时加入地域限定；新品牌无讨论标记为"新兴品牌"建议先建基础内容；负面舆情爆发时触发reputation_risk预警。所有边界情况均有明确处理路径，确保任何输入域名都能输出有意义的评分而非报错终止。
八、v1功能边界与演进路线
v1仅依赖Playwright爬取能力，不引入外部搜索API，零配置即可运行。覆盖Reddit/Quora/G2/Capterra/Trustpilot五大平台，对强反爬平台做优雅降级。v2阶段引入可选Serper/Tavily搜索API配置，解锁G2完整数据、全文情感分析、自动竞品发现。v3阶段接入运营执行层，实现"探测-建议-执行-再探测"的完整闭环自动化。当前v1架构已为后续扩展预留接口，平台探测模块采用插件化设计，新增平台只需实现统一接口即可接入评分体系。

part 2：
| 工具                              | 原理                                                                     | 对Reddit有效？               | 维护成本     |
| ------------------------------- | ---------------------------------------------------------------------- | ------------------------ | -------- |
| **Playwright + Firefox**        | Reddit的检测对Chromium指纹（WebGL、Canvas、navigator.webdriver）很强，但对Firefox明显更弱 | ✅ 有效                     | 低        |
| **playwright-stealth (Python)** | 修补navigator.webdriver、插件列表、WebGL等指纹泄漏                                  | ⚠️ 部分有效                  | 中        |
| **Nodriver**                    | 从底层重建的undetected Chrome，无WebDriver痕迹                                   | ✅ 对Cloudflare有效，Reddit次之 | 中        |
| **Camoufox**                    | 修改版Firefox，使用真实用户指纹                                                    | ✅ 有效                     | 中        |
| **rebrower-playwright**         | 修补版Playwright，修复已知指纹泄漏                                                 | ⚠️ 部分有效                  | 高（需跟进补丁） |

纯开源组合的技术架构建议
┌─────────────────────────────────────────────┐
│         纯开源外站探测引擎 v1.0              │
├─────────────────────────────────────────────┤
│                                             │
│  浏览器层: Playwright + Firefox (非Chromium)   │
│  ├── 原因: Reddit对Firefox指纹检测显著更弱      │
│  ├── headless模式可用，但首次建议headful验证     │
│  └── 禁用webdriver标志: addInitScript覆盖      │
│                                             │
│  指纹修补层: playwright-stealth (Python)      │
│  ├── 覆盖navigator.webdriver                   │
│  ├── 补全插件列表、mimeTypes                   │
│  ├── 修复WebGL/Canvas指纹一致性                │
│  └── 注意: 仅解决指纹层，不解决IP/行为层        │
│                                             │
│  行为模拟层: 自定义实现                         │
│  ├── 随机延迟: 2-5秒页面间，5-10秒同页操作      │
│  ├── 鼠标轨迹: 非直线路径，带随机停顿            │
│  ├── 滚动行为: 模拟人类阅读节奏                 │
│  └── 资源加载: 确保CSS/字体/图片完整加载        │
│                                             │
│  会话管理层: Playwright storage_state          │
│  ├── 首次手动登录/通过CF挑战后保存会话            │
│  ├── 后续复用会话Cookie绕过重复验证             │
│  └── 会话失效时自动标记需人工干预               │
│                                             │
│  降级层: 多路径容错                             │
│  ├── Reddit主站失败 → 尝试old.reddit.com       │
│  ├── 新UI失败 → 尝试i.reddit.com移动端          │
│  ├── 全部失败 → Google site:reddit.com搜索兜底  │
│  └── 仍失败 → 标记unreachable，不阻塞流程       │
│                                             │
└─────────────────────────────────────────────┘

必须面对的硬边界（纯开源无法解决的问题）
| 防线层级                  | Reddit/Cloudflare检测手段 | 纯开源能否绕过？ | 现实方案                    |
| --------------------- | --------------------- | -------- | ----------------------- |
| **TLS指纹**             | JA3/JA4哈希识别自动化工具TLS握手 | ❌ 不能     | 使用curl-impersonate或接受限制 |
| **IP声誉**              | 数据中心IP段预标记，住宅IP信任度高   | ❌ 不能     | 必须使用住宅代理（Bright Data等）  |
| **行为ML模型**            | 每个域名的定制化机器学习评分        | ⚠️ 部分能   | 模拟人类浏览序列，但无法保证长期稳定      |
| **Turnstile CAPTCHA** | 隐形挑战，需生成有效token       | ❌ 不能     | 人工介入或付费API              |
| **高级JavaScript挑战**    | 动态代码执行验证浏览器真实性        | ⚠️ 部分能   | 真浏览器执行，但延迟高             |

对GEO产品的实际建议
成本: $0（除服务器外）
覆盖: Reddit(70%成功率) + Quora(50%) + Trustpilot(90%) + G2(30%降级)
策略:
├── Reddit: Playwright+Firefox+stealth，失败时切old.reddit.com
├── Quora: 延长间隔至5-8秒，接受limited_data
├── G2: 直接降级为sameAs链接检测，不硬爬
├── Trustpilot: 通常可直接访问
└── 兜底: Google site:搜索验证提及量
关键设计：对G2/Quora等强反爬平台，不追求完整数据提取，而是降级为"信号检测"（档案是否存在、sameAs链接是否存在），这足以支撑v1的评分逻辑，同时避免陷入反爬军备竞赛。

纯开源工具（Playwright+Firefox+stealth）足以支撑GEO v1的MVP，能获取Reddit 70%以上的有效数据、Trustpilot 90%的数据，但对G2/Quora需接受降级策略。不要试图用开源方案"完美绕过"所有反爬机制——这会导致你陷入持续的补丁维护泥潭。正确的商业策略是：用开源方案覆盖80%的价值场景，对剩余20%的强防护平台使用降级逻辑或后续引入付费API，这才是可持续的GEO产品架构。