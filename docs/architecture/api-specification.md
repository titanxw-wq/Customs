# 海关案件数据分析平台 - API 接口规范

## 1. API 概述

### 1.1 基本信息

- **Base URL**: `https://api.customs-analysis.example.com/v1`
- **协议**: HTTPS
- **数据格式**: JSON
- **字符编码**: UTF-8
- **版本控制**: URL Path Versioning (v1, v2, ...)

### 1.2 认证方式

```http
Authorization: Bearer <access_token>
X-Request-ID: <uuid>
```

### 1.3 统一响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": { ... },
  "request_id": "uuid",
  "timestamp": "2026-02-15T12:00:00Z"
}
```

### 1.4 错误码定义

| 错误码 | HTTP 状态码 | 说明 |
|-------|------------|------|
| 0 | 200 | 成功 |
| 1001 | 400 | 参数错误 |
| 1002 | 401 | 未授权 |
| 1003 | 403 | 权限不足 |
| 1004 | 404 | 资源不存在 |
| 2001 | 500 | 服务器内部错误 |
| 2002 | 503 | 服务不可用 |
| 3001 | 422 | 业务逻辑错误 |

---

## 2. 案件管理 API

### 2.1 创建案件

**POST** `/cases`

**请求体**:
```json
{
  "case_number": "CASE-2026-001",
  "case_type": "smuggling",
  "case_name": "某某走私案",
  "priority": 3,
  "tags": ["跨境", "电商"],
  "metadata": {
    "source": "tip-off",
    "department": "缉私局"
  }
}
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "id": "uuid",
    "case_number": "CASE-2026-001",
    "case_type": "smuggling",
    "status": "draft",
    "created_at": "2026-02-15T12:00:00Z"
  }
}
```

### 2.2 获取案件详情

**GET** `/cases/{case_id}`

**响应**:
```json
{
  "code": 0,
  "data": {
    "id": "uuid",
    "case_number": "CASE-2026-001",
    "case_type": "smuggling",
    "case_name": "某某走私案",
    "status": "active",
    "priority": 3,
    "risk_level": "high",
    "tags": ["跨境", "电商"],
    "file_count": 156,
    "entity_count": 45,
    "evidence_count": 230,
    "created_at": "2026-02-15T12:00:00Z",
    "updated_at": "2026-02-15T14:30:00Z",
    "assigned_to": [
      {"id": "uuid1", "name": "张三"},
      {"id": "uuid2", "name": "李四"}
    ]
  }
}
```

### 2.3 列出案件

**GET** `/cases`

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 否 | 案件状态 |
| case_type | string | 否 | 案型代码 |
| priority | integer | 否 | 优先级 |
| search | string | 否 | 搜索关键词 |
| page | integer | 否 | 页码 (默认 1) |
| page_size | integer | 否 | 每页数量 (默认 20) |

**响应**:
```json
{
  "code": 0,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total": 156,
      "total_pages": 8
    }
  }
}
```

### 2.4 更新案件

**PATCH** `/cases/{case_id}`

**请求体**:
```json
{
  "status": "active",
  "priority": 4,
  "assigned_to": ["uuid1", "uuid2"]
}
```

---

## 3. 文件管理 API

### 3.1 上传文件

**POST** `/cases/{case_id}/files`

**Content-Type**: `multipart/form-data`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | file | 是 | 文件内容 |
| batch_id | string | 否 | 批次 ID |
| file_type | string | 否 | 文件类型 |
| metadata | json | 否 | 元数据 |

**响应**:
```json
{
  "code": 0,
  "data": {
    "id": "uuid",
    "original_name": "订单列表.xlsx",
    "file_type": "excel",
    "file_size": 102400,
    "file_hash": "sha256...",
    "parse_status": "pending",
    "upload_url": "https://storage.../..."
  }
}
```

### 3.2 批量上传

**POST** `/cases/{case_id}/files/batch`

**请求体**:
```json
{
  "batch_number": "BATCH-001",
  "source_type": "im_export",
  "files": [
    {
      "file_name": "微信导出.zip",
      "file_size": 52428800,
      "file_hash": "sha256..."
    }
  ]
}
```

### 3.3 获取文件列表

**GET** `/cases/{case_id}/files`

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| batch_id | string | 批次 ID |
| file_type | string | 文件类型 |
| parse_status | string | 解析状态 |
| page | integer | 页码 |
| page_size | integer | 每页数量 |

### 3.4 获取解析结果

**GET** `/files/{file_id}/parse-results`

**响应**:
```json
{
  "code": 0,
  "data": {
    "file_id": "uuid",
    "parse_status": "completed",
    "results": [
      {
        "id": "uuid",
        "service_type": "S5",
        "result_type": "table",
        "result_data": {
          "headers": ["订单号", "商品名称", "金额"],
          "rows": [...]
        },
        "confidence": 0.95
      }
    ]
  }
}
```

---

## 4. 解析服务 API

### 4.1 触发解析

**POST** `/cases/{case_id}/parse`

**请求体**:
```json
{
  "file_ids": ["uuid1", "uuid2"],
  "services": ["S1", "S5", "S8"],
  "options": {
    "force_reparse": false,
    "ocr_language": "chi_sim+eng"
  }
}
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "task_id": "uuid",
    "status": "processing",
    "estimated_time": 300
  }
}
```

### 4.2 查询解析状态

**GET** `/parse-tasks/{task_id}`

**响应**:
```json
{
  "code": 0,
  "data": {
    "task_id": "uuid",
    "status": "processing",
    "progress": 45,
    "total_files": 20,
    "completed_files": 9,
    "failed_files": 0,
    "started_at": "2026-02-15T12:00:00Z",
    "estimated_completion": "2026-02-15T12:05:00Z"
  }
}
```

### 4.3 单服务解析

**POST** `/parse/{service_type}`

**路径参数**:
- `service_type`: S1-S12

**请求体**:
```json
{
  "file_id": "uuid",
  "options": {
    "language": "zh",
    "extract_tables": true
  }
}
```

---

## 5. 实体管理 API

### 5.1 获取实体列表

**GET** `/cases/{case_id}/entities`

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| entity_type | string | 实体类型 |
| search | string | 搜索关键词 |
| page | integer | 页码 |
| page_size | integer | 每页数量 |

### 5.2 获取实体详情

**GET** `/entities/{entity_id}`

**响应**:
```json
{
  "code": 0,
  "data": {
    "id": "uuid",
    "entity_type": "person",
    "primary_name": "张三",
    "aliases": ["小张", "Zhang San"],
    "id_number": "310...",
    "phone_numbers": ["138****1234"],
    "attributes": {
      "gender": "male",
      "occupation": "商人"
    },
    "relations": [
      {
        "target_id": "uuid2",
        "target_name": "李四",
        "relation_type": "KNOWS",
        "confidence": 0.85
      }
    ],
    "source_evidence_ids": ["uuid1", "uuid2"],
    "confidence": 0.92
  }
}
```

### 5.3 合并实体

**POST** `/entities/merge`

**请求体**:
```json
{
  "source_ids": ["uuid1", "uuid2"],
  "target_id": "uuid3",
  "merge_strategy": {
    "name": "keep_most_common",
    "attributes": "merge_all"
  }
}
```

---

## 6. 图谱查询 API

### 6.1 获取关系网络

**GET** `/cases/{case_id}/graph`

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| entity_id | string | 中心实体 ID |
| depth | integer | 关系深度 (1-5) |
| relation_types | string[] | 关系类型过滤 |
| min_confidence | float | 最小置信度 |

**响应**:
```json
{
  "code": 0,
  "data": {
    "nodes": [
      {
        "id": "uuid",
        "type": "Person",
        "label": "张三",
        "attributes": {...}
      }
    ],
    "edges": [
      {
        "source": "uuid1",
        "target": "uuid2",
        "type": "KNOWS",
        "confidence": 0.85,
        "evidence_ids": ["uuid3"]
      }
    ]
  }
}
```

### 6.2 路径分析

**GET** `/cases/{case_id}/graph/path`

**查询参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| source_id | string | 是 | 起始实体 ID |
| target_id | string | 是 | 目标实体 ID |
| max_depth | integer | 否 | 最大深度 (默认 5) |

**响应**:
```json
{
  "code": 0,
  "data": {
    "paths": [
      {
        "nodes": ["uuid1", "uuid3", "uuid2"],
        "edges": ["KNOWS", "WORKS_FOR"],
        "length": 2,
        "confidence": 0.78
      }
    ]
  }
}
```

### 6.3 团伙识别

**POST** `/cases/{case_id}/graph/communities`

**请求体**:
```json
{
  "algorithm": "louvain",
  "node_types": ["Person"],
  "relation_types": ["KNOWS", "COMMUNICATED_WITH", "WORKS_FOR"],
  "min_community_size": 3
}
```

---

## 7. 证据挖掘 API

### 7.1 获取字段候选池

**GET** `/cases/{case_id}/evidence-pool`

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| field_name | string | 字段名过滤 |
| source_type | string | 来源类型 |
| min_confidence | float | 最小置信度 |

### 7.2 生成证据草表

**POST** `/cases/{case_id}/evidence-draft`

**请求体**:
```json
{
  "template_id": "smuggling_v1",
  "field_mappings": {
    "buyer_name": "primary_name",
    "transaction_amount": "total_amount"
  },
  "conflict_resolution": "highest_confidence"
}
```

### 7.3 规则匹配

**POST** `/cases/{case_id}/rules/match`

**请求体**:
```json
{
  "rule_ids": ["rule_001", "rule_002"],
  "scope": "all_entities"
}
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "matches": [
      {
        "rule_id": "rule_001",
        "rule_name": "时间窗一致性",
        "entity_id": "uuid",
        "matched": true,
        "details": {
          "field": "transaction_time",
          "expected": "2024-01-15",
          "actual": "2024-01-15"
        },
        "score": 1.0
      }
    ]
  }
}
```

---

## 8. 搜索 API

### 8.1 全文搜索

**POST** `/cases/{case_id}/search`

**请求体**:
```json
{
  "query": "代购 微信",
  "scope": ["im", "documents", "emails"],
  "filters": {
    "date_range": {
      "from": "2024-01-01",
      "to": "2024-12-31"
    },
    "file_types": ["image", "pdf"]
  },
  "highlight": true,
  "page": 1,
  "page_size": 20
}
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "uuid",
        "type": "im_message",
        "content": "...高亮内容...",
        "source": {
          "file_id": "uuid",
          "file_name": "微信聊天记录.txt"
        },
        "score": 0.85
      }
    ],
    "pagination": {...}
  }
}
```

### 8.2 向量相似搜索

**POST** `/cases/{case_id}/search/similar`

**请求体**:
```json
{
  "query_type": "image",
  "reference_id": "file_uuid",
  "top_k": 20,
  "threshold": 0.8
}
```

---

## 9. 报告生成 API

### 9.1 生成报告

**POST** `/cases/{case_id}/reports`

**请求体**:
```json
{
  "report_type": "detailed",
  "sections": ["summary", "entities", "timeline", "evidence", "graph"],
  "format": "pdf",
  "options": {
    "include_images": true,
    "watermark": true,
    "language": "zh-CN"
  }
}
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "report_id": "uuid",
    "status": "generating",
    "estimated_time": 60
  }
}
```

### 9.2 下载报告

**GET** `/reports/{report_id}/download`

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| token | string | 临时下载令牌 |

**响应**: 文件流

---

## 10. Webhook 回调

### 10.1 事件类型

| 事件类型 | 说明 |
|---------|------|
| case.created | 案件创建 |
| case.status_changed | 案件状态变更 |
| file.uploaded | 文件上传完成 |
| parse.completed | 解析完成 |
| parse.failed | 解析失败 |
| entity.created | 实体创建 |
| report.ready | 报告就绪 |

### 10.2 回调格式

```json
{
  "event_type": "parse.completed",
  "event_id": "uuid",
  "timestamp": "2026-02-15T12:00:00Z",
  "data": {
    "case_id": "uuid",
    "file_id": "uuid",
    "service_type": "S5",
    "result_count": 10
  }
}
```

---

## 11. WebSocket 实时通信

### 11.1 连接

```
wss://api.customs-analysis.example.com/ws?token=<access_token>
```

### 11.2 消息格式

**订阅**:
```json
{
  "action": "subscribe",
  "channel": "case:{case_id}:parse"
}
```

**推送消息**:
```json
{
  "channel": "case:{case_id}:parse",
  "event": "progress",
  "data": {
    "progress": 75,
    "current_file": "订单列表.xlsx"
  }
}
```

---

*版本: 1.0.0 | 更新日期: 2026-02-15*
