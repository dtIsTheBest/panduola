# 实施任务清单

> 由 spec.md 生成  
> 任务总数: 13
> 核心原则: 主题基础先行，功能视觉分域实施，最后统一集成验收；全程保持现有业务契约和 dirty-worktree 功能改动不变。

## 依赖关系总览

```text
Task 1（全局主题与页面骨架）
  ├──> Task 2（Dashboard 与 AI）
  └──> Task 3（链接库与管理弹窗）
          Task 2 ─┐
          Task 3 ─┴──> Task 4（集成、响应式与回归验证）
                          └──> Task 5（首页次级内容 Tab 整合）
                                  └──> Task 6（安全、数据与交互契约加固）
                                          └──> Task 7（维护性、测试与性能优化）
                                                  └──> Task 8（信息清晰度优化）
                                                          └──> Task 9（分类资源直达）
                                                                  └──> Task 10（疫苗接种攻略）
                                                                          └──> Task 11（生长曲线工具）
                                                                                  └──> Task 12（品牌名称与图标）
                                                                                          └──> Task 13（首页资源与工具导航）
```

## 变更影响概览

### 文件变更清单

| 文件 | 操作 | 涉及任务 | 说明 |
|------|------|---------|------|
| `src/style.css` | 修改 | Task 1、2 | 语义视觉变量、公共控件、焦点、减少动效及次级文字对比度 |
| `src/App.vue` | 修改 | Task 1 | 应用骨架、内容区、工具栏与页脚视觉 |
| `src/components/Header.vue` | 修改 | Task 1 | 品牌导航与全局操作视觉 |
| `src/components/CategoryNav.vue` | 修改 | Task 1 | 年龄侧栏与响应式视觉 |
| `src/components/Dashboard.vue` | 修改 | Task 2、5 | 首页信息层级、卡片、响应式布局及次级内容 Tab |
| `src/components/AISearch.vue` | 修改 | Task 2 | AI 卡片、状态、结果与设置弹窗视觉 |
| `src/components/SearchBar.vue` | 修改 | Task 3 | 搜索输入视觉 |
| `src/components/LinkList.vue` | 修改 | Task 3 | 链接库层级、卡片、状态与操作视觉 |
| `src/components/LinkModal.vue` | 修改 | Task 3 | 链接表单弹窗视觉 |
| `src/components/CategoryManager.vue` | 修改 | Task 3 | 分类管理弹窗视觉 |
| `src/components/CategoryModal.vue` | 修改 | Task 3 | 分类表单弹窗视觉 |
| Task 1-3 的全部表现层文件 | 只读验证/按归属修复 | Task 4 | 集成、响应式、可访问性与回归验证 |
| `index.html`、`public/favicon.svg`、`Header.vue`、`App.vue`、两份 Tauri 配置 | 修改/新增 | Task 12 | 统一用户可见品牌、标题和图标 |
| `Dashboard.vue`、`App.vue` | 修改 | Task 13 | 合并资源入口、新增全部工具并迁移分类管理入口 |

### 受影响接口

| 接口 | 变更类型 | 调用方 | 涉及任务 |
|------|---------|--------|---------|
| `Header.currentView` 与 `refresh/menu/view-change` | 保持不变 | `App.vue` | Task 1 |
| `CategoryNav.age-stage-change(Array)` | 保持不变 | `App.vue` | Task 1 |
| `Dashboard.selectedAgeStages` 与现有 emits | 保持不变 | `App.vue` | Task 2 |
| `Dashboard` 内容 Tab 状态 | 新增内部视觉状态 | 组件内部 | Task 5 |
| `SearchBar` 的 `v-model` | 保持不变 | `App.vue` | Task 3 |
| `LinkList` 的 props/emits | 保持不变 | `App.vue` | Task 3 |
| 三类管理弹窗的 props/emits | 保持不变 | `App.vue`、`CategoryManager.vue` | Task 3 |
| CSS 语义变量 | 新增内部视觉契约 | 全部 Vue 组件 scoped CSS | Task 1-3 |
| store 统一写接口与 Schema v2 | 新增内部数据契约 | `App.vue`、分类/链接组件 | Task 6 |
| 安全外链工具 | 新增内部工具接口 | Dashboard、LinkList、导入校验 | Task 6 |

### 构建系统变更

- Task 1-5 不修改构建系统；Task 6 仅在 `package.json` 增加基于 Node 内置测试运行器的 `test` 脚本，不新增依赖、不修改锁文件、Vite 或 Tauri 配置。

## 风险与假设

| # | 描述 | 影响任务 | 假设/处理 |
|---|------|---------|----------|
| 1 | `src/data/store.js` 已有用户改动但不属于本次视觉修改 | Task 1-4 | 作为只读基线，不修改、不回退 |
| 2 | 移动侧栏父子状态存在分裂 | Task 1 | 优先使用现有 DOM 与 CSS 修正视觉呈现；不得改变公开事件契约 |
| 3 | 项目未配置测试框架 | Task 1-4 | 使用生产构建、浏览器 DOM 断言、截图和核心流程冒烟验证，不新增测试依赖 |
| 4 | `Dashboard.vue` 存在遗留死样式和断点规则 | Task 2 | 仅清理可明确证明未引用的视觉规则，不拆分组件或重构业务脚本 |
| 5 | 当前工作区存在未提交功能代码 | Task 1-4 | 全部修改基于当前文件增量实施，禁止以 HEAD 版本覆盖 |
| 6 | 五类内容高度差异可能造成切换跳动 | Task 5 | 桌面端保持稳定面板最小高度，移动端按内容自然展开 |
| 7 | 当前持久化数据可能来自无版本旧格式 | Task 6 | 读取时迁移，保留用户数据并补充稳定默认标识 |
| 8 | Web 环境没有安全凭据存储 | Task 6 | API Key 仅保存在内存，不继续持久化；清理旧 Key |

## 任务列表

### 任务 1: [x] 建立全局主题系统并焕新应用骨架
- 文件: `src/style.css`（修改）、`src/App.vue`（修改）、`src/components/Header.vue`（修改）、`src/components/CategoryNav.vue`（修改）
- 依赖: 无
- spec 映射: 3.1、3.2、4.1、4.2.1、4.2.2、4.3、6.1、6.2
- 说明: 建立清新亲和的全局视觉原语，统一公共控件，并调整应用外壳、品牌导航和年龄侧栏的层级与响应式表现。
- context:
  - `src/main.js:createApp()` — 上游入口，负责加载全局样式并挂载 App
  - `src/style.css` — 直接修改目标，向所有组件提供视觉变量与公共类
  - `src/App.vue` — 直接修改目标及页面骨架上游，向 Header、CategoryNav、Dashboard、LinkList 传递状态
  - `src/components/Header.vue:defineProps()/defineEmits()` — 直接修改目标，公开导航契约必须保持
  - `src/components/CategoryNav.vue:selectAgeStage()` — 直接修改目标，年龄数据向 App 输出
  - `src/components/Dashboard.vue`、`src/components/LinkList.vue` — 下游消费者，依赖 App 布局和全局视觉变量
- 验收标准:
  - [x] `npm run build` 返回 0
  - [x] `rg -n "@media \\(prefers-reduced-motion: reduce\\)" src/style.css` 有匹配
  - [x] `rg -n "@import|url\\([^)]*https?://" src index.html` 无新增匹配
  - [x] `git diff --exit-code -- package.json package-lock.json vite.config.js src-tauri/` 返回 0
  - [x] Header 与 CategoryNav 的现有 props/emits 文本仍可由 `rg` 检出
  - [x] Code Review PASS
- 子任务:
  - [x] 1.1: 扩充主题 token、公共按钮/表单/卡片/弹窗、焦点与减少动效规则
  - [x] 1.2: 调整 App 页面背景、内容宽度、工具栏与 Footer
  - [x] 1.3: 调整 Header 品牌导航与全局操作视觉
  - [x] 1.4: 调整年龄侧栏、选中态及 1200/768/480 响应式表现

### 任务 2: [x] 焕新 Dashboard 与 AI 主要体验
- 文件: `src/components/Dashboard.vue`（修改）、`src/components/AISearch.vue`（修改）、`src/style.css`（修改）
- 依赖: Task 1
- spec 映射: 3.1、3.2、4.2.1、4.2.2、4.3、4.4、6.1、6.2
- 说明: 建立首页一级、二级、三级信息层级，统一 AI 卡片及设置弹窗视觉，并修正默认桌面和窄屏布局风险。
- 计划偏差说明: Code Review 发现全局 `--text-secondary` 在柔和表面上对比度不足，因此 Task 2 增量修改 `src/style.css` 调深该语义色。
- context:
  - `src/App.vue` — 上游调用方，传入 `selectedAgeStages` 并监听 Dashboard 事件
  - `src/style.css` — Task 1 产出的主题视觉依赖
  - `src/components/Dashboard.vue` — 直接修改目标，消费 store 派生内容并发出页面跳转事件
  - `src/components/AISearch.vue` — 直接修改目标，内部管理 AI provider、历史、结果与设置
  - `src/data/store.js` — 下游只读数据源，不得修改
- 验收标准:
  - [x] `npm run build` 返回 0
  - [x] Dashboard 的 `category-select/view-all-links/clear-age-stage/stat-click` 事件契约保持
  - [x] `rg -n "searchWithDoubao|searchWithOpenAI|openai-api-key|search-history" src/components/AISearch.vue` 均有匹配
  - [x] `rg -n "dashboard-center" src/components/Dashboard.vue` 无匹配
  - [x] 1200 × 800、992 × 768、390 × 844 下页面无横向溢出，窄屏顶部横幅为单列
  - [x] Code Review PASS
- 子任务:
  - [x] 2.1: 调整年龄横幅、贴士、统计、快捷入口与内容列表的视觉权重
  - [x] 2.2: 修正 Dashboard 的 1200/992/768/480 响应式规则和内容边界
  - [x] 2.3: 统一 AI 卡片、输入、提示、结果、错误、iframe 与设置弹窗视觉
  - [x] 2.4: 核对 Dashboard 与 AI 业务契约并完成构建验证

### 任务 3: [x] 统一链接库与管理弹窗视觉
- 文件: `src/components/SearchBar.vue`（修改）、`src/components/LinkList.vue`（修改）、`src/components/LinkModal.vue`（修改）、`src/components/CategoryManager.vue`（修改）、`src/components/CategoryModal.vue`（修改）
- 依赖: Task 1
- spec 映射: 3.1、3.2、4.2.1、4.2.2、4.3、4.4、6.1、6.2
- 说明: 统一搜索、筛选、链接卡片、状态、空态和三类管理弹窗，并改善键盘、触屏和窄屏操作可见性。
- context:
  - `src/App.vue` — 上游调用方，传入链接筛选与弹窗状态并监听事件
  - `src/style.css` — Task 1 产出的公共按钮、表单、标签和弹窗视觉
  - `src/components/SearchBar.vue`、`src/components/LinkList.vue` — 直接修改目标，负责查询与资源浏览
  - `src/components/LinkModal.vue` — 直接修改目标，调用 store 新增/更新链接
  - `src/components/CategoryManager.vue` — 直接修改目标并调用 CategoryModal
  - `src/components/CategoryModal.vue` — 直接修改目标，输出分类编辑结果
  - `src/data/store.js` — 下游业务数据源，不得修改
- 验收标准:
  - [x] `npm run build` 返回 0
  - [x] `LinkList` 的 `filterMode`、`back`、`add/edit/delete` 事件契约保持
  - [x] `LinkModal` 保存对象仍保留 `isDefault`
  - [x] `rg -n "animation:\\s*glow[^;]*infinite" src/components/LinkList.vue` 无匹配
  - [x] 390 × 844 下搜索栏、工具栏、链接卡片和两类尺寸弹窗无横向溢出
  - [x] 主要操作具有可见 `:focus-visible` 状态，触屏条件下管理操作不依赖 hover
  - [x] Code Review PASS
- 子任务:
  - [x] 3.1: 调整搜索框、筛选标题、链接卡片与状态标签
  - [x] 3.2: 调整空状态、收藏及操作按钮的焦点与触屏表现
  - [x] 3.3: 统一链接、分类管理和分类编辑弹窗视觉
  - [x] 3.4: 核对公开契约、`isDefault` 透传及构建结果

### 任务 4: [x] 完成集成、响应式与回归验证
- 文件: Task 1-3 的全部表现层文件（只读验证；发现问题时回到归属文件修复）
- 依赖: Task 2、Task 3
- spec 映射: 3.2、4.2.2、4.2.3、4.2.4、4.2.5、4.3、4.4、5、6、7.2、7.3、8.4
- 说明: 对完整视觉产出执行生产构建、五个关键视口、核心流程、内容边界、可访问性、性能与 dirty-worktree 保留检查。
- context:
  - Task 1-3 的全部表现层文件 — 直接验证对象
  - `package.json`、`vite.config.js`、`src-tauri/tauri.conf.json` — 构建与运行环境约束
  - `src/data/store.js` — 用户既有数据改动基线，只读核对
  - Vite 生产构建、Web 浏览器、Tauri WebView — 下游运行环境
- 验收标准:
  - [x] `npm run build` 返回 0
  - [x] `git diff --check` 返回 0
  - [x] `git diff --exit-code -- package.json package-lock.json vite.config.js src-tauri/` 返回 0
  - [x] 1440 × 900、1200 × 800、992 × 768、768 × 1024、390 × 844 均满足 `scrollWidth <= innerWidth`
  - [x] 首页、链接库、管理弹窗及 AI 设置完成截图核对
  - [x] 首页/链接库切换、年龄选择与清除、统计跳转、搜索/收藏和弹窗打开关闭冒烟通过
  - [x] 焦点、触屏操作、减少动效、空状态和长内容边界检查通过
  - [x] 用户已有 `src/data/store.js` 及页面功能 diff 未被回退
  - [x] Code Review PASS
  - [x] 测试通过
- 子任务:
  - [x] 4.1: 执行 build、diff、依赖与外部资源检查
  - [x] 4.2: 执行五视口 DOM 溢出断言并保存关键页面截图
  - [x] 4.3: 执行核心流程、内容边界与可访问性冒烟
  - [x] 4.4: 核对构建产物、动画成本及用户未提交功能改动保留情况

### 任务 5: [x] 将首页次级内容整合为单行 Tab
- 文件: `src/components/Dashboard.vue`（修改）
- 依赖: Task 4
- spec 映射: 3.1、3.2、4.2.1、4.2.2、4.3、7.2
- 说明: 将 AI 助手下方的快捷入口、最近添加、热门分类、系统推荐和收藏链接合并为单一响应式 Tab 内容区，保持原有数据、跳转和链接打开行为。
- context:
  - `src/App.vue` — 上游调用方，继续监听 Dashboard 原有事件
  - `src/components/Dashboard.vue` — 唯一代码修改目标，管理内部活动 Tab 并复用现有计算数据
  - `src/data/store.js` — 下游只读数据源，不修改
- 验收标准:
  - [x] `npm run build` 返回 0
  - [x] 五个 Tab 按用户指定顺序在同一行展示，390px 下可横向滚动且页面无横向溢出
  - [x] Tab 具备 `tablist/tab/tabpanel` 语义、可见焦点及方向键、Home/End 操作
  - [x] 快捷入口、分类选择、链接打开、最近添加/收藏“查看全部”行为保持
  - [x] 1200 × 800、992 × 768、390 × 844 下内容区无横向溢出
  - [x] Code Review PASS
  - [x] 测试通过
- 子任务:
  - [x] 5.1: 合并五个区块模板并增加内部 Tab 状态
  - [x] 5.2: 设计单行 Tab、内容面板和各类卡片的响应式布局
  - [x] 5.3: 补齐键盘语义并核对原有事件与数据行为
  - [x] 5.4: 执行构建、审查和关键视口回归

### 任务 6: [x] 加固安全、数据可靠性与交互契约
- 文件: `src/utils/externalLinks.js`（新增）、`src/data/store.js`（修改）、`src/App.vue`（修改）、`src/components/Header.vue`（修改）、`src/components/AISearch.vue`（修改）、`src/components/CategoryManager.vue`（修改）、`src/components/CategoryModal.vue`（修改）、`src/components/CategoryNav.vue`（修改）、`src/components/Dashboard.vue`（修改）、`src/components/LinkList.vue`（修改）、`src/components/LinkModal.vue`（修改）、`tests/system-hardening.test.js`（新增）、`package.json`（修改）
- 计划偏差说明: Round 1 Code Review 发现分类弹窗会在异步持久化完成前关闭，因此补充修改 `CategoryModal.vue`，由父组件仅在保存成功后关闭。
- 依赖: Task 5
- spec 映射: 2、3.1、3.2、4.2.1、4.2.2、4.2.3、4.2.5、7.1、7.2
- 说明: 修复当前评估中的发布阻塞项，统一数据写入与迁移，消除 AI HTML 注入和不安全外链，统一年龄/查看全部语义，并补齐移动侧栏关闭态。
- context:
  - `src/data/store.js` — 数据唯一写入口，负责 Schema v2 迁移、导入替换、分类/子分类与链接持久化
  - `src/App.vue`、`CategoryManager.vue`、`LinkModal.vue` — store 写接口调用方
  - `src/utils/externalLinks.js` — URL 校验和安全打开工具
  - `AISearch.vue` — AI 远程响应与凭据边界
  - `Dashboard.vue`、`LinkList.vue` — 筛选、查看全部和外链调用方
  - `CategoryNav.vue` — 移动侧栏可访问性状态
- 验收标准:
  - [x] `npm run build` 与 `npm test` 返回 0
  - [x] `rg -n "v-html|localStorage\\.setItem\\('openai-api-key'" src/components/AISearch.vue` 无匹配
  - [x] 导入、主/子分类增删改均通过 store 统一接口持久化
  - [x] 无版本旧数据迁移后保留用户数据并补充系统推荐标识
  - [x] Dashboard 与链接库年龄筛选一致，“最近添加/收藏”查看全部行为正确
  - [x] 外链只允许 HTTP(S) 且使用 `noopener,noreferrer`
  - [x] 390px 关闭侧栏不可聚焦，打开与关闭后焦点闭环
  - [x] Code Review PASS
  - [x] 测试通过
- 子任务:
  - [x] 6.1: 实现 Schema v2、导入校验和统一持久化接口
  - [x] 6.2: 加固 AI 结果、API Key 与外链安全边界
  - [x] 6.3: 修复年龄、最近添加、收藏筛选和移动侧栏契约
  - [x] 6.4: 增加自动测试、构建和浏览器回归

### 任务 7: [x] 优化维护性与热点性能
- 文件: `src/components/Dashboard.vue`、`src/components/AISearch.vue`、`src/components/LinkModal.vue`、`src/components/CategoryManager.vue`、`src/components/CategoryModal.vue`、`src/data/store.js`（修改），`src/composables/useDialogFocus.js`、`src/composables/useCategoryLinkCounts.js`（新增），`tests/system-hardening.test.js`（修改）
- 计划偏差说明: 分类计数同时被 Dashboard 与分类管理弹窗消费，因此除原计划的焦点 composable 外，新增轻量的 `useCategoryLinkCounts.js`，通过一次链接扫描复用直接与汇总计数。
- 依赖: Task 6
- spec 映射: 4.2.1、4.3、4.4、7
- 说明: 清理 Dashboard 失效 CSS、复用弹窗焦点逻辑、复用分类计数并合并非关键访问统计写盘。
- 验收标准:
  - [x] Dashboard 无已证明失效的旧布局选择器
  - [x] 四类弹窗共享焦点管理实现
  - [x] 分类计数不重复扫描，访问统计写入可合并
  - [x] Code Review PASS
  - [x] 测试通过
- 子任务:
  - [x] 7.1: 清理 Dashboard 失效样式并降低组件复杂度
  - [x] 7.2: 抽取弹窗焦点 composable
  - [x] 7.3: 优化分类计数与访问统计写入
  - [x] 7.4: 执行回归、审查和性能核对

### 任务 8: [x] 提升导航站的信息清晰度与浏览效率
- 文件: `src/style.css`、`src/App.vue`、`src/components/Header.vue`、`src/components/CategoryNav.vue`、`src/components/Dashboard.vue`、`src/components/AISearch.vue`、`src/components/LinkList.vue`、`src/components/SearchBar.vue`、`src/data/store.js`（修改）
- 依赖: Task 7
- spec 映射: 2、3.1、3.2、4.2.1、4.3
- 说明: 在现有视觉主题上统一用户视角文案，强化成长阶段、首页入口和资源库的层级，并提高资源卡片在桌面端的空间利用率。
- 验收标准:
  - [x] 成长阶段采用清晰、无歧义的名称与说明
  - [x] 首页与资源库的主标题、引导语和操作文案能直接说明用途
  - [x] 桌面端资源卡片减少无效留白，窄屏保持单列且无横向溢出
  - [x] `npm run build` 返回 0
  - [x] 用户明确跳过正式 Code Review 与全量测试
- 子任务:
  - [x] 8.1: 统一品牌、成长阶段、首页和 AI 区域文案
  - [x] 8.2: 优化顶部导航、年龄侧栏和首页信息层级
  - [x] 8.3: 优化资源库工具栏、筛选反馈与卡片网格
  - [x] 8.4: 执行生产构建和桌面/手机关键页面轻量检查

### 任务 9: [x] 支持从分类管理直达子分类资源
- 文件: `src/App.vue`、`src/components/CategoryManager.vue`（修改）
- 依赖: Task 8
- spec 映射: 2、3.1、4.2.1、4.2.2
- 说明: 为子分类卡片增加明确的资源浏览入口，点击后关闭分类管理弹窗并进入对应子分类的资源列表。
- 验收标准:
  - [x] 子分类内容区域可通过鼠标和键盘触发
  - [x] 点击后关闭分类管理弹窗，并按当前子分类展示资源
  - [x] 编辑、删除子分类操作保持独立
  - [x] `npm run build` 返回 0
  - [x] 用户明确跳过正式 Code Review 与全量测试
- 子任务:
  - [x] 9.1: 增加子分类资源跳转事件和可访问操作入口
  - [x] 9.2: 在 App 中承接事件并切换资源库筛选状态
  - [x] 9.3: 执行构建与点击链路轻量冒烟

### 任务 10: [x] 补充 2026 年版疫苗接种攻略
- 文件: `src/components/Dashboard.vue`（修改）、`src/components/VaccineGuide.vue`、`src/data/vaccineGuide.js`（新增）
- 依赖: Task 9
- spec 映射: 3.1、3.2、4.2.1、4.2.2、4.2.5
- 说明: 将疫苗接种实用工具从占位提示升级为可查阅的官方规范攻略，并结合当前成长阶段突出相关节点。
- 验收标准:
  - [x] 完整覆盖 2026 年版国家免疫规划的出生至 13 岁接种节点
  - [x] 明确百白破新程序、13 岁女孩 HPV 两剂程序及通用补种原则
  - [x] 包含接种前告知、接种后留观与异常就医提醒
  - [x] 展示更新时间、适用边界和官方来源链接
  - [x] 当前成长阶段具有明确提示，桌面与窄屏可正常浏览
  - [x] `npm run build` 返回 0
  - [x] 用户明确跳过正式 Code Review 与全量测试
- 子任务:
  - [x] 10.1: 整理 2026 版免疫规划数据与官方来源
  - [x] 10.2: 实现疫苗攻略弹窗、时间表和安全提示
  - [x] 10.3: 接入 Dashboard 疫苗工具及成长阶段上下文
  - [x] 10.4: 执行生产构建和桌面/手机轻量冒烟

### 任务 11: [x] 开发生长记录与趋势图工具
- 文件: `src/data/store.js`、`src/components/Dashboard.vue`（修改），`src/components/GrowthTracker.vue`、`src/utils/growthChart.js`（新增）
- 依赖: Task 10
- spec 映射: 3.1、3.2、4.2.1、4.2.2、4.2.3、4.2.5
- 说明: 将生长曲线入口升级为可持久化的成长记录工具，通过身高、体重和头围趋势图展示个人变化。
- 验收标准:
  - [x] 支持新增、编辑和删除测量记录，字段包含日期、身高、体重、可选头围和备注
  - [x] 身高、体重和头围可独立切换查看趋势，图表日期与数值轴清晰
  - [x] 展示最新测量值、相对上次变化、总记录数和历史列表
  - [x] 记录通过 store 统一持久化，旧快照自动补充空数组，并参与同步与导入导出
  - [x] 重复日期、非法范围和保存失败具有明确反馈
  - [x] 空状态、单条记录、多条记录和 390px 窄屏均可正常使用
  - [x] `npm run build` 返回 0
  - [x] 用户明确跳过正式 Code Review 与全量测试
- 子任务:
  - [x] 11.1: 扩展快照标准化与成长记录写接口
  - [x] 11.2: 实现趋势图坐标计算与指标摘要
  - [x] 11.3: 实现成长记录弹窗、表单、图表和历史管理
  - [x] 11.4: 接入 Dashboard 生长曲线入口
  - [x] 11.5: 执行构建和桌面/手机轻量冒烟

### 任务 12: [x] 统一“岁序成章”品牌名称与图标
- 文件: `index.html`、`public/favicon.svg`（新增）、`src/components/Header.vue`、`src/App.vue`、`src-tauri/tauri.conf.json`、`tauri.config.json`（修改）
- 依赖: Task 11
- spec 映射: 3.1、3.2、4.2.1、4.3、7.2
- 说明: 将用户可见名称统一为“岁序成章｜全龄家庭成长指南”，以嫩芽和年轮意象同步更新浏览器与页面品牌图标，保留仓库名和应用标识不变。
- 验收标准:
  - [x] 浏览器标题、Header 品牌、页脚和两份 Tauri 窗口标题均使用新名称
  - [x] 浏览器 favicon 不再引用 Vite 默认图标，Header 使用同源嫩芽图标
  - [x] 桌面和 390px 手机宽度下品牌区域无溢出
  - [x] `npm run build` 与 `npm test` 返回 0
  - [x] Code Review PASS
- 子任务:
  - [x] 12.1: 更新网页、Header、页脚和桌面窗口用户可见名称
  - [x] 12.2: 新增嫩芽年轮 favicon 并同步 Header 图标与配色
  - [x] 12.3: 执行代码审查、构建、全量测试与响应式冒烟

### 任务 13: [x] 合并资源导航并补充全部工具入口
- 文件: `src/components/Dashboard.vue`、`src/App.vue`（修改）
- 依赖: Task 12
- spec 映射: 3.1、3.2、4.2.1、4.3、7.2
- 说明: 将首页“资源分类”和“全部资源”合并为“资源库”，新增可直达完整实用工具集合的“全部工具”，分类管理入口迁移到资源库操作区。
- 验收标准:
  - [x] 首页只保留一个资源库一级入口，并同时展示资源数与分类数
  - [x] 全部工具入口可切换到完整四项已实现工具，不受当前年龄阶段限制
  - [x] 资源库操作区可继续打开分类管理，导入、导出和新增资源保持可用
  - [x] 1200px 与 390px 页面无横向溢出，全部工具导航后焦点落入内容面板
  - [x] `npm run build` 与 `npm test` 返回 0
  - [x] Code Review PASS
- 子任务:
  - [x] 13.1: 合并资源分类与全部资源统计卡片
  - [x] 13.2: 增加全部工具导航和完整工具展示状态
  - [x] 13.3: 将分类管理入口迁移到资源库操作区
  - [x] 13.4: 执行代码审查、构建、全量测试与响应式冒烟

## Spec 覆盖映射

| Spec 章节 | 任务 | 说明 |
|-----------|------|------|
| 3.1 功能性需求 | Task 1、2、3、5、6、12、13 | 覆盖全局、骨架、首页、AI、链接库、管理弹窗、内容 Tab、系统加固、品牌统一与导航整合 |
| 3.2 非功能性需求 | Task 1、2、3、4、5、6、7 | 覆盖兼容、响应式、离线、性能、动效、安全和可访问性 |
| 4.1 方案概览 | Task 1、2、3 | 落实全局视觉、页面骨架与组件局部焕新 |
| 4.2.1 核心模块 | Task 1、2、3、5、7 | 按现有模块边界实施并复用弹窗与计数逻辑 |
| 4.2.2 接口设计 | Task 1、2、3、4、5 | 保持 props、events、v-model 与 store 数据流 |
| 4.2.3-4.2.5 | Task 4 | 验证无数据、并发和业务错误处理变更 |
| 4.3 核心逻辑 | Task 1、2、3、4、5、7 | 落实语义变量、层级、断点、交互和性能约束 |
| 4.4 方案评估 | Task 4、7 | 验证硬编码、响应式、dirty worktree 和性能风险控制 |
| 5 备选方案 | Task 1-4 | 作为不引入依赖、不扩大重构的实施约束 |
| 6 业界调研 | Task 1-4 | 落实对比度、焦点、目标尺寸、减少动效与响应式骨架 |
| 7.1 单元测试 | Task 6 | 使用 Node 内置测试运行器覆盖安全 URL、迁移、导入、Tauri 识别和并发写入 |
| 7.2-7.3 测试计划 | Task 4、5、7、12、13 | 构建、浏览器冒烟、内容边界、Tab 键盘、品牌及导航响应式与性能检查 |
| 8.1-8.3 | N/A | 不新增可观测性、配置或运维接口 |
| 8.4 运维注意事项 | Task 4 | 验证构建兼容、独立回滚和资源影响 |
