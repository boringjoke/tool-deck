# 样式维护

`main.css` 是 Nuxt 唯一全局样式入口，仅维护导入。当前导入顺序保留拆分前的层叠关系，请勿按文件名排序。

- `tokens.css`：全局设计变量。
- `base.css`：重置、字体、基础元素与焦点样式。
- `layout/`：站点骨架、页脚与基础布局响应式规则。
- `components/`：按钮、反馈提示、工具工作区及共享表单、结果样式。
- `pages/`：目录、分类、工具详情与说明区域。`*-base.css` 是先加载的基础规则，后续同类文件包含现有覆盖，两者共同决定最终样式。
- `tools/`：工具专属样式，按工具命名。

新增样式优先放入所属模块，工具的响应式规则、动画与减少动态效果适配放在同一文件。不要把工具专属规则追加到入口或公共文件。

历史混合规则暂保留原位置：`tools/shared-responsive.css` 涉及多个早期工具和公共工作区；`pages/directory-marquee-responsive.css` 同时涉及目录快捷入口和跑马灯。修改这些文件时需检查其中涉及的调用方。后续清理应单独核对层叠影响，不直接搬动导入顺序或合并重复选择器。

本次仅拆分文件，未引入 scoped、CSS layers 或按路由加载，未以拆分作为减少页面 CSS 体积的措施。

## 跨模块覆盖关系

以下为 2026-09-19 清理后的有效关系，箭头表示 `main.css` 中先后加载的方向。文件位于 `pages/` 并不代表选择器只作用于该页面，实际范围由选择器决定。

| 样式范围 | 加载关系与维护边界 |
| --- | --- |
| 站点页头、页脚 | `layout/site.css` 提供基础结构；`layout/footer.css` 补充页脚高度；`layout/responsive.css` 处理窄屏；`pages/directory.css` 中的 `.site-header__inner` 调整全站页头，并包含页头搜索和分类导航。 |
| 卡片网格 | `pages/directory-base.css` 提供 grid 布局；`layout/responsive.css` 的单列规则先加载，之后 `pages/directory.css` 的 auto-fill 列定义会覆盖它；分类页另有 `.category-page__body .tool-grid` 窄屏规则。此轮保留实际层叠行为，没有借清理改变列数。 |
| 工具卡片 | `pages/directory-base.css` 与分类卡片共享边框、背景、布局和 hover；`pages/directory.css` 提供工具卡片的紧凑尺寸、标题、描述和分类图标。共享分组的基础声明不能因工具卡片有覆盖就整组删除，否则会影响 `CategoryCard.vue`。 |
| 卡片隐私标签 | `pages/directory-base.css` → `pages/directory.css` → `pages/category.css`；最终 `.tool-card__privacy`、网络状态和圆点样式在 `pages/category.css`，作用于所有 `ToolCard.vue`，包括首页和搜索结果。不能把该文件直接改成分类页按需加载。 |
| 收藏按钮 | `components/feedback.css` 提供边框、交互和默认颜色；`pages/directory.css` 提供尺寸及 hover/active 配色；`pages/tool-detail.css` 中 `.favorite-button--labeled` 补充带文字形态。两种形态都由 `FavoriteButton.vue` 使用。 |
| 工具详情框架 | `pages/tool-detail-base.css` 保留状态标签的基础及 teal 状态；`pages/tool-detail.css` 提供详情页头、正文、状态标签尺寸和窄屏布局。原页头、正文已被覆盖的间距不再保留。 |
| 公共工具工作区及早期工具 | `components/tool-workspace.css` 与密码、进制、单位、坐标、中文数字、简繁、摩斯、JSON、JSON 转 SQL 模块提供基础；`tools/shared-responsive.css` 在窄屏调整表单、结果、编辑区和表格。涉及这些工具时应同时检查该文件。 |
| 快捷入口与跑马灯 | `pages/directory.css`、`tools/marquee.css` 提供基础；`pages/directory-marquee-responsive.css` 补充两者的窄屏规则。该文件位置虽在提词器导入之后，选择器并不属于提词器。 |
| 减少动态效果 | `pages/directory.css` 中的 `prefers-reduced-motion` 通配选择器是全局适配；各工具文件另有针对动画的适配，属于不同条件或属性的配合，不能作为重复规则删除。 |

目前仍有基础值与后续 `var(...)` 值、简写与分项属性、共享选择器分组之间的重叠。此轮保守保留未逐项证明可删除的部分，未宣称所有重复均已消除。

## 已确认无用规则的清理边界

- 已核对当前首页、站点外壳、`ToolCard.vue`、`ToolPageShell.vue`、工具路由及其异步组件映射，删除旧首页介绍和统计区（`home-hero*`、`registry-signal*`）、旧搜索区（`search-panel*`、`search-control*`）、旧分组标题（`home-block`、`section-kicker`、`section-title`、`section-count`、`category-grid`）、旧工具卡片结构（`tool-card__topline`、`tool-card__category`、`tool-card__body`）、旧详情结构（`page-heading`、`back-link`、`tool-shell__tags`、`foundation-card*`）及无调用的 `timer-tool__accessible-state`。通配记法仅用于说明已核对的类名集合，不是自动删除策略。
- 保留 `CategoryCard.vue` 对应样式和无障碍公共样式。计时器当前使用 `timer-tool__completion` 与 `aria-live`，没有删除当前播报节点。
- 动态类名不能根据完整文本搜索未命中就删除：分类导航、卡片图标、快捷入口标记、详情图标、其他分类圆点、结果面板状态、血型配色和元素周期表类别均有运行时拼接。
- 重复声明仅在相同选择器、媒体条件和 important 级别下有后续覆盖依据时删除；明确的 margin/padding 简写覆盖按四个方向核对。不同条件、选择器或潜在兼容回退不自动视为无效。
- 提词器镜像选择器原来仅有注释、没有声明，已删除空规则；镜像行为仍由组件中的内联 transform 控制。

清理后应检查首页搜索和分类切换、卡片及收藏按钮、工具详情状态标签、计时器结束提示，以及窄屏表单/表格、快捷入口和跑马灯。CSS 静态对比及构建结果不能替代浏览器体验验收。
