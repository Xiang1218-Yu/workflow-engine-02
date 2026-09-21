# API 请求录制与 Mock 回放平台

一个基础但可扩展的 API 请求录制与 Mock 回放平台，包含：

- React + Vite + TypeScript 管理前端
- Node.js 原生 HTTP + TypeScript 后端（无运行时后端依赖）
- 内存存储，重启后恢复为内置示例数据
- Mock 路由的创建、编辑、删除和列表查看
- HTTP 方法与路径匹配，支持精确路径、`:param` 参数段和 `*` 通配尾段
- 状态码、响应头、响应体配置
- 前端回放请求测试
- 简化录制接口：把请求与响应保存成 Mock 路由
- 基础 Node 测试，覆盖路由匹配和录制逻辑

## 目录结构

```text
api-mock/
├── client/                 # React + Vite 前端
│   └── src/
├── server/                 # Node 原生 HTTP 后端
│   ├── src/
│   └── test/
├── shared/                 # 预留跨端共享类型/契约目录
├── package.json
└── README.md
```

## 本地运行

需要 Node.js 18+ 和 npm 9+。

```bash
npm install
npm run dev
```

- 前端：<http://localhost:5173>
- 后端：<http://localhost:4000>
- Vite 会把 `/api` 和 `/mock` 请求代理到后端。

## 构建与测试

```bash
npm run build
npm test
```

`npm test` 会先编译服务端，再运行 `node:test` 测试。

## API 概览

### Mock 管理

- `GET /api/mocks`：查询全部 Mock 路由
- `GET /api/mocks/:id`：查询单条 Mock 路由
- `POST /api/mocks`：创建 Mock 路由
- `PUT /api/mocks/:id`：更新 Mock 路由
- `DELETE /api/mocks/:id`：删除 Mock 路由

创建/更新请求示例：

```json
{
  "name": "用户详情",
  "method": "GET",
  "path": "/users/:id",
  "statusCode": 200,
  "responseHeaders": {
    "content-type": "application/json"
  },
  "responseBody": "{\"id\":\"demo\",\"name\":\"Ada\"}",
  "description": "用户详情 Mock"
}
```

### 回放测试

`POST /api/replay` 接受：

```json
{
  "method": "GET",
  "path": "/users/42",
  "headers": {},
  "body": ""
}
```

返回匹配结果及 Mock 响应，不会改变存储。

### 实际 Mock 访问

请求 `/mock/...` 会根据请求方法和路径寻找路由。例如：

```bash
curl -i http://localhost:4000/mock/health
curl -i -X POST http://localhost:4000/mock/orders -d '{"sku":"demo"}'
```

### 简化录制

`POST /api/recordings` 会用传入的请求和响应自动创建一个 Mock 路由：

```json
{
  "name": "录制的订单请求",
  "request": {
    "method": "POST",
    "path": "/orders",
    "headers": { "content-type": "application/json" },
    "body": "{\"sku\":\"demo\"}"
  },
  "response": {
    "statusCode": 201,
    "headers": { "content-type": "application/json" },
    "body": "{\"id\":\"order-1\"}"
  }
}
```

## 后续 GSB 题目拆分建议

- 将内存仓储替换为 SQLite/PostgreSQL，并增加迁移层。
- 增加路由优先级、环境/项目隔离和持久化导入导出。
- 为路径模板和请求体增加 JSON Schema / 条件匹配。
- 增加真实代理录制、请求历史、响应延迟和错误注入。
- 将 `server/src/router.ts`、`server/src/store.ts` 和前端表单作为独立题目边界。
