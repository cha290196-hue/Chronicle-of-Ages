# UCM-Ω · 岁月史书因果推演内核

针对 [Chronicle of Ages](https://github.com/cha290196-hue/Chronicle-of-Ages) 的独立算法实现。适用于浏览器原生 ES Modules，无运行时依赖。此目录不是新的网站，也不修改现有 UI。

## 包含内容

| 文件 | 用途 | 现阶段状态 |
| --- | --- | --- |
| `src/ucm-omega.mjs` | 时间线继承、干预约束、因果 DAG、事件校验、多情景引擎 | 可执行，已单元测试 |
| `src/causal-dynamics.mjs` | 可信结构方程求值、`do(X=x)` 干预、粒子滤波与重采样 | 可执行，待领域模型与观测数据 |
| `src/chronicle-adapter.mjs` | 对接原项目 `callChat`，将模型输出作为待校验候选 | 已用模拟模型测试，尚未接到网页按钮 |
| `tests/*.mjs` | 行为、边界与回归验证 | 20 项本地通过 |
| `docs/UCM-OMEGA-ALGORITHM.md` | 模型数学定义、实现边界、算法流程 | 已完成 |
| `docs/UCM-OMEGA-EVALUATION.md` | 证据库、检验方案、发布门槛与来源 | 已完成 |
| `examples/omega-run.mjs` | 完全离线的最小可执行示例 | 可直接运行 |

## 运行

```bash
node --test tests/*.mjs
node examples/omega-run.mjs
```

需要 Node.js 20 或更高版本，或支持 ES Modules 与 `structuredClone` 的现代浏览器。不安装第三方依赖。

## 与原网站对接

两个基础模块是可独立使用的确定性计算逻辑。适配层接受原项目已有的 `callChat(config,messages,options)`，调用方式为：

```js
import { simulateOmega } from './chronicle-adapter.mjs';
import { BASELINE } from './data.js';
import { callChat, makeId } from './core.js';

const { worldline, analysis } = await simulateOmega({
  prompt,
  branches,
  parentId,
  baseline: BASELINE,
  config,
  callChat,
  makeId,
  signal,
  lang,
  onProgress,
  scenarioCount: 2,
  maxWindows: 6
});
```

`worldline` 与原有世界线的主要字段相容；`analysis` 保留候选轨迹、约束拒绝记录、结构化干预和审计分数。**此交付未直接将 `app.js` 的现有 `simulate` 切换为 `simulateOmega`，也未修改现有存档格式、发布网站或替换既有代码。** 正式切换前必须处理 `sanitizeWorldline` 对 `omega` 字段的裁剪、跨设备存档、API 成本、取消推演和真实模型返回结构的兼容测试。

## 严谨性声明

- 该内核已真实执行的部分是时间、结构、形式化干预和概率滤波计算；不意味着已经建立了可预测数千年历史的有效社会科学模型。
- 生成式历史场景属于条件情景推演，不是发现另一条世界真实发生了什么。
- 多情景的审计分数只衡量局部约束满足程度，**不是**客观发生概率。
- SCM 的可信程度由结构方程、参数、单位与校准数据决定；SMC 的可信程度由状态转移分布与观测似然决定，不能用 LLM 自评代替。
- 新模块不会通过页面加载外部模型、不上传用户数据，也不改写现实 A 线。

完整定义见 [`docs/UCM-OMEGA-ALGORITHM.md`](docs/ALGORITHM.md)。