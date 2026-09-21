# Feature Flag 与灰度发布服务

一个基础但可扩展的 Feature Flag 服务示例，包含：

- **Node.js + TypeScript API**：内存存储、清晰 REST API、确定性的百分比灰度评估。
- **React + Vite + TypeScript 管理台**：查看/创建开关、配置默认值和规则、用测试用户评估。
- **可拆分的领域层**：规则模型、评估服务、存储、HTTP 路由各自独立，适合后续拆解成 GSB 题目。
- **基础测试**：覆盖 equals 规则、百分比灰度稳定性、规则顺序和 API 流程。

> 当前版本使用内存存储，服务重启后数据会恢复为示例数据。后续可将 `apps/api/src/domain/store.ts` 替换成数据库实现，而不改变评估逻辑。

## 目录结构

```text
feature-flags/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── domain/       # 类型、内存仓储、评估服务
│   │   │   ├── http/         # Express 路由与错误处理
│   │   │   └── server.ts
│   │   └── test/
│   └── web/
│       └── src/              # React 管理台
├── package.json
└── README.md
```

## 快速开始

需要 Node.js 20+。

```bash
npm install
npm run dev
```

- 管理台：<http://localhost:5173>
- API：<http://localhost:4000>
- 健康检查：<http://localhost:4000/api/health>

也可以分别启动：

```bash
npm run dev --workspace @feature-flags/api
npm run dev --workspace @feature-flags/web
```

## API

### `GET /api/flags`

返回全部 Feature Flag。

### `POST /api/flags`

创建一个开关：

```json
{
  "key": "checkout-v2",
  "name": "Checkout V2",
  "description": "逐步开放新的结账流程",
  "defaultValue": false,
  "rules": [
    {
      "type": "attribute_equals",
      "attribute": "plan",
      "value": "pro",
      "serve": true
    },
    {
      "type": "percentage",
      "percentage": 25,
      "serve": true
    }
  ]
}
```

### `GET /api/flags/:key`

返回单个开关。

### `PUT /api/flags/:key`

按创建接口的结构更新开关。

### `DELETE /api/flags/:key`

删除开关。

### `POST /api/flags/:key/evaluate`

按用户上下文评估开关：

```json
{
  "userId": "user-123",
  "attributes": {
    "plan": "pro",
    "country": "US"
  }
}
```

返回示例：

```json
{
  "flagKey": "checkout-v2",
  "value": true,
  "matchedRule": {
    "type": "attribute_equals",
    "attribute": "plan",
    "value": "pro",
    "serve": true
  },
  "reason": "attribute_equals",
  "bucket": null
}
```

`percentage` 规则基于 `flagKey + userId` 做确定性 hash：同一个开关和用户每次都会得到相同结果。百分比规则需要提供 `userId`（也支持 `attributes.userId`）；没有用户标识时会跳过该规则并继续评估后续规则/默认值。

## 可用脚本

```bash
npm run dev       # 同时启动 API 和前端
npm run build     # 构建 API 与前端
npm test          # 运行后端 node:test 测试
npm run typecheck # 检查前后端 TypeScript
npm start         # 启动已构建的 API
```

## 后续扩展建议

1. 将内存仓储替换为 SQLite/PostgreSQL，并增加版本号或审计日志。
2. 把布尔值扩展为 string/JSON variations，并增加环境（development/staging/production）。
3. 增加规则组合（AND/OR）、日期窗口、组织/租户约束和 Segment。
4. 加入鉴权、操作权限、变更审批和 OpenTelemetry。
