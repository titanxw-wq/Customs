# 海关案件数据分析平台 - 数据库 Schema 设计

## 1. 数据库架构概览

### 1.1 混合存储架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      数据访问层 (DAL)                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ PostgreSQL  │  │   Neo4j     │  │   Milvus    │             │
│  │  关系数据   │  │  关系图谱   │  │  向量检索   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │    ES       │  │   MinIO     │  │   Redis     │             │
│  │  全文检索   │  │  对象存储   │  │   缓存      │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 数据分布策略

| 数据类型 | 存储位置 | 访问模式 |
|---------|---------|---------|
| 案件元数据 | PostgreSQL | CRUD |
| 人员/实体信息 | PostgreSQL + Neo4j | 关系查询 |
| IM 消息内容 | Elasticsearch | 全文检索 |
| 文档内容 | ES + MinIO | 检索+存储 |
| 商品图片特征 | Milvus | 向量检索 |
| 关系网络 | Neo4j | 图遍历 |

---

## 2. PostgreSQL Schema

### 2.1 案件管理表

```sql
-- 案件主表
CREATE TABLE cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number VARCHAR(100) UNIQUE NOT NULL,
    case_type VARCHAR(50) NOT NULL,  -- 案型代码
    case_name VARCHAR(500),
    status VARCHAR(30) DEFAULT 'draft',  -- draft, active, review, closed
    priority INTEGER DEFAULT 1,  -- 1-5
    risk_level VARCHAR(20),  -- low, medium, high, critical

    -- 时间信息
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,

    -- 元数据
    created_by UUID,
    assigned_to UUID[],
    tags VARCHAR(100)[],

    -- 统计信息
    file_count INTEGER DEFAULT 0,
    entity_count INTEGER DEFAULT 0,
    evidence_count INTEGER DEFAULT 0,

    CONSTRAINT valid_status CHECK (status IN ('draft', 'active', 'review', 'closed'))
);

CREATE INDEX idx_cases_case_number ON cases(case_number);
CREATE INDEX idx_cases_case_type ON cases(case_type);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_created_at ON cases(created_at DESC);

-- 案件批次
CREATE TABLE case_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id),
    batch_number VARCHAR(50) NOT NULL,
    source_type VARCHAR(50),  -- im_export, ftp_upload, manual_upload
    source_path TEXT,
    file_count INTEGER DEFAULT 0,
    total_size BIGINT DEFAULT 0,
    status VARCHAR(30) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(case_id, batch_number)
);

CREATE INDEX idx_batches_case_id ON case_batches(case_id);
```

### 2.2 文件管理表

```sql
-- 原始文件表
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id),
    batch_id UUID REFERENCES case_batches(id),

    -- 文件信息
    original_name VARCHAR(500) NOT NULL,
    file_path TEXT NOT NULL,  -- MinIO 路径
    file_type VARCHAR(50),  -- image, video, audio, pdf, excel, email
    mime_type VARCHAR(100),
    file_size BIGINT,
    file_hash VARCHAR(128),  -- SHA-256

    -- 解析状态
    parse_status VARCHAR(30) DEFAULT 'pending',  -- pending, processing, completed, failed
    parse_error TEXT,
    parsed_at TIMESTAMP WITH TIME ZONE,

    -- 元数据
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_parse_status CHECK (parse_status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX idx_files_case_id ON files(case_id);
CREATE INDEX idx_files_batch_id ON files(batch_id);
CREATE INDEX idx_files_file_type ON files(file_type);
CREATE INDEX idx_files_parse_status ON files(parse_status);
CREATE INDEX idx_files_file_hash ON files(file_hash);

-- 解析结果表
CREATE TABLE parse_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id),
    service_type VARCHAR(20) NOT NULL,  -- S1-S12

    -- 解析输出
    result_type VARCHAR(50),  -- timeline, entities, table, transcript
    result_data JSONB NOT NULL,
    confidence FLOAT DEFAULT 1.0,

    -- 处理信息
    processing_time_ms INTEGER,
    model_version VARCHAR(50),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_parse_results_file_id ON parse_results(file_id);
CREATE INDEX idx_parse_results_service_type ON parse_results(service_type);
CREATE INDEX idx_parse_results_result_type ON parse_results(result_type);
```

### 2.3 实体管理表

```sql
-- 实体表
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id),

    -- 实体类型
    entity_type VARCHAR(30) NOT NULL,  -- person, organization, location, product, vehicle, etc.

    -- 标识信息
    primary_name VARCHAR(500) NOT NULL,
    aliases VARCHAR(500)[],

    -- 唯一标识
    id_number VARCHAR(100),  -- 身份证号
    phone_numbers VARCHAR(50)[],
    email_addresses VARCHAR(200)[],
    account_ids JSONB,  -- {"wechat": "xxx", "alipay": "yyy"}

    -- 元数据
    attributes JSONB DEFAULT '{}',

    -- 来源追溯
    source_file_ids UUID[],
    source_evidence_ids UUID[],

    -- 置信度
    confidence FLOAT DEFAULT 1.0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_entity_type CHECK (entity_type IN ('person', 'organization', 'location', 'product', 'vehicle', 'account', 'other'))
);

CREATE INDEX idx_entities_case_id ON entities(case_id);
CREATE INDEX idx_entities_entity_type ON entities(entity_type);
CREATE INDEX idx_entities_primary_name ON entities(primary_name);
CREATE INDEX idx_entities_id_number ON entities(id_number);
CREATE INDEX idx_entities_phone_numbers ON entities USING GIN(phone_numbers);

-- 实体关系表 (用于 SQL 查询，图谱关系存 Neo4j)
CREATE TABLE entity_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id),

    source_entity_id UUID NOT NULL REFERENCES entities(id),
    target_entity_id UUID NOT NULL REFERENCES entities(id),

    relation_type VARCHAR(50) NOT NULL,  -- knows, works_for, transacts_with, family_of
    relation_subtype VARCHAR(50),

    -- 证据来源
    evidence_ids UUID[],
    confidence FLOAT DEFAULT 1.0,

    -- 时间范围
    valid_from DATE,
    valid_to DATE,

    attributes JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(source_entity_id, target_entity_id, relation_type)
);

CREATE INDEX idx_relations_case_id ON entity_relations(case_id);
CREATE INDEX idx_relations_source ON entity_relations(source_entity_id);
CREATE INDEX idx_relations_target ON entity_relations(target_entity_id);
CREATE INDEX idx_relations_type ON entity_relations(relation_type);
```

### 2.4 证据大表

```sql
-- 证据大表 (字段候选池)
CREATE TABLE evidence_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id),

    -- 字段标识
    field_name VARCHAR(100) NOT NULL,  -- 字段名
    field_group VARCHAR(50),  -- 字段分组 (buyer, seller, transaction, etc.)

    -- 字段值
    field_value TEXT,
    field_value_normalized TEXT,  -- 标准化后的值

    -- 来源信息
    source_type VARCHAR(50),  -- im, document, excel, email
    source_file_id UUID REFERENCES files(id),
    source_parse_id UUID REFERENCES parse_results(id),

    -- 提取信息
    extraction_method VARCHAR(50),  -- ocr, nlp, llm, rule
    extraction_confidence FLOAT,

    -- 冲突处理
    is_conflicted BOOLEAN DEFAULT FALSE,
    conflict_resolution VARCHAR(50),  -- manual, auto_high_confidence, latest

    -- 版本控制
    version INTEGER DEFAULT 1,
    superseded_by UUID REFERENCES evidence_fields(id),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_extraction_method CHECK (extraction_method IN ('ocr', 'nlp', 'llm', 'rule', 'manual'))
);

CREATE INDEX idx_evidence_fields_case_id ON evidence_fields(case_id);
CREATE INDEX idx_evidence_fields_field_name ON evidence_fields(field_name);
CREATE INDEX idx_evidence_fields_source_file ON evidence_fields(source_file_id);

-- 证据草表
CREATE TABLE evidence_draft (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id),

    -- 草表版本
    version INTEGER NOT NULL,
    status VARCHAR(30) DEFAULT 'draft',  -- draft, review, finalized

    -- 字段数据
    field_data JSONB NOT NULL,

    -- 统计信息
    field_count INTEGER,
    conflict_count INTEGER,
    completeness_score FLOAT,  -- 0-1

    -- 审核信息
    reviewed_by UUID,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_comments JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(case_id, version)
);

CREATE INDEX idx_evidence_draft_case_id ON evidence_draft(case_id);
CREATE INDEX idx_evidence_draft_status ON evidence_draft(status);
```

### 2.5 审计日志表

```sql
-- 操作审计日志
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 操作信息
    action VARCHAR(50) NOT NULL,  -- create, update, delete, export, review
    resource_type VARCHAR(50) NOT NULL,  -- case, file, entity, evidence
    resource_id UUID,

    -- 用户信息
    user_id UUID,
    user_name VARCHAR(200),
    ip_address INET,

    -- 操作详情
    old_values JSONB,
    new_values JSONB,

    -- 关联案件
    case_id UUID REFERENCES cases(id),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_case_id ON audit_logs(case_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- 分区策略 (按月分区)
-- CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs
--     FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

---

## 3. Neo4j 图数据库 Schema

### 3.1 节点类型

```cypher
// 人员节点
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT person_name IF NOT EXISTS FOR (p:Person) REQUIRE p.primary_name IS NOT NULL;

// 组织节点
CREATE CONSTRAINT org_id IF NOT EXISTS FOR (o:Organization) REQUIRE o.id IS UNIQUE;

// 地点节点
CREATE CONSTRAINT location_id IF NOT EXISTS FOR (l:Location) REQUIRE l.id IS UNIQUE;

// 商品节点
CREATE CONSTRAINT product_id IF NOT EXISTS FOR (p:Product) REQUIRE p.id IS UNIQUE;

// 账户节点
CREATE CONSTRAINT account_id IF NOT EXISTS FOR (a:Account) REQUIRE a.id IS UNIQUE;

// 交易节点
CREATE CONSTRAINT transaction_id IF NOT EXISTS FOR (t:Transaction) REQUIRE t.id IS UNIQUE;

// 事件节点
CREATE CONSTRAINT event_id IF NOT EXISTS FOR (e:Event) REQUIRE e.id IS UNIQUE;

// 案件节点
CREATE CONSTRAINT case_id IF NOT EXISTS FOR (c:Case) REQUIRE c.case_id IS UNIQUE;
```

### 3.2 节点属性

```cypher
// Person 节点属性
(:Person {
    id: UUID,              // PostgreSQL 实体 ID
    case_id: UUID,         // 关联案件
    primary_name: String,  // 主要名称
    aliases: [String],     // 别名列表
    id_number: String,     // 身份证号
    phone_numbers: [String],
    gender: String,
    birth_date: Date,
    nationality: String,
    confidence: Float,
    source_evidence: [UUID]
})

// Organization 节点属性
(:Organization {
    id: UUID,
    case_id: UUID,
    name: String,
    aliases: [String],
    registration_number: String,
    org_type: String,      // company, shop, logistics, etc.
    address: String,
    confidence: Float
})

// Product 节点属性
(:Product {
    id: UUID,
    case_id: UUID,
    name: String,
    brand: String,
    model: String,
    serial_number: String,
    category: String,
    price: Float,
    currency: String,
    confidence: Float
})

// Transaction 节点属性
(:Transaction {
    id: UUID,
    case_id: UUID,
    transaction_id: String,  // 订单号/运单号
    transaction_type: String, // order, payment, shipment
    amount: Float,
    currency: String,
    status: String,
    timestamp: DateTime,
    platform: String,
    confidence: Float
})

// Event 节点属性
(:Event {
    id: UUID,
    case_id: UUID,
    event_type: String,    // communication, meeting, transfer, shipment
    description: String,
    timestamp: DateTime,
    location: String,
    duration_minutes: Integer,
    confidence: Float
})
```

### 3.3 关系类型

```cypher
// 人物关系
(:Person)-[:KNOWS {since: Date, confidence: Float, evidence: [UUID]}]->(:Person)
(:Person)-[:FAMILY_OF {relation: String, confidence: Float}]->(:Person)
(:Person)-[:WORKS_FOR {position: String, since: Date, confidence: Float}]->(:Organization)

// 交易关系
(:Person)-[:BUYER_OF {confidence: Float}]->(:Transaction)
(:Person)-[:SELLER_OF {confidence: Float}]->(:Transaction)
(:Organization)-[:MERCHANT_OF {confidence: Float}]->(:Transaction)
(:Transaction)-[:CONTAINS {quantity: Integer, unit_price: Float}]->(:Product)

// 物流关系
(:Person)-[:SENDER_OF {confidence: Float}]->(:Transaction)
(:Person)-[:RECEIVER_OF {confidence: Float}]->(:Transaction)
(:Transaction)-[:SHIPPED_FROM {confidence: Float}]->(:Location)
(:Transaction)-[:SHIPPED_TO {confidence: Float}]->(:Location)

// 通讯关系
(:Person)-[:COMMUNICATED_WITH {platform: String, count: Integer, first_contact: DateTime, last_contact: DateTime}]->(:Person)

// 事件参与
(:Person)-[:PARTICIPATED_IN {role: String}]->(:Event)
(:Event)-[:INVOLVES {confidence: Float}]->(:Product)
(:Event)-[:LOCATED_AT {confidence: Float}]->(:Location)

// 案件关联
(:Person)-[:INVOLVED_IN]->(:Case)
(:Organization)-[:INVOLVED_IN]->(:Case)
(:Transaction)-[:EVIDENCE_FOR]->(:Case)
(:Event)-[:EVIDENCE_FOR]->(:Case)
```

### 3.4 图查询示例

```cypher
// 1. 查找两个实体之间的所有路径
MATCH path = (a:Person {id: $person1_id})-[*1..5]-(b:Person {id: $person2_id})
WHERE ALL(n IN nodes(path) WHERE n.case_id = $case_id)
RETURN path
ORDER BY length(path)
LIMIT 10;

// 2. 查找交易链路
MATCH (buyer:Person)-[:BUYER_OF]->(t:Transaction)-[:CONTAINS]->(p:Product)
WHERE t.case_id = $case_id
MATCH (seller:Person)-[:SELLER_OF]->(t)
RETURN buyer.primary_name, seller.primary_name, t.transaction_id, p.name, t.amount
ORDER BY t.timestamp DESC;

// 3. 查找团伙识别 (社区发现)
CALL gds.louvain.write('case-graph', {
    nodeLabels: ['Person'],
    relationshipTypes: ['KNOWS', 'COMMUNICATED_WITH', 'WORKS_FOR'],
    writeProperty: 'community'
})
YIELD communityCount;

// 4. 中心性分析 (关键人物)
CALL gds.pageRank.stream('case-graph', {
    nodeLabels: ['Person'],
    relationshipTypes: ['KNOWS', 'COMMUNICATED_WITH', 'BUYER_OF', 'SELLER_OF']
})
YIELD nodeId, score
RETURN gds.util.asNode(nodeId).primary_name AS name, score
ORDER BY score DESC
LIMIT 10;
```

---

## 4. Milvus 向量数据库 Schema

### 4.1 Collection 定义

```python
# 商品图像向量 Collection
from pymilvus import Collection, FieldSchema, CollectionSchema, DataType

fields = [
    FieldSchema(name="id", dtype=DataType.VARCHAR, max_length=36, is_primary=True),
    FieldSchema(name="case_id", dtype=DataType.VARCHAR, max_length=36),
    FieldSchema(name="file_id", dtype=DataType.VARCHAR, max_length=36),
    FieldSchema(name="image_hash", dtype=DataType.VARCHAR, max_length=64),
    FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=512),  # 图像特征向量
    FieldSchema(name="category", dtype=DataType.VARCHAR, max_length=50),
    FieldSchema(name="created_at", dtype=DataType.INT64),  # timestamp
]

schema = CollectionSchema(fields, description="Product image embeddings")
product_images = Collection("product_images", schema)

# 创建索引
index_params = {
    "metric_type": "COSINE",
    "index_type": "IVF_FLAT",
    "params": {"nlist": 1024}
}
product_images.create_index("embedding", index_params)
```

### 4.2 文本向量 Collection

```python
# 文本嵌入 Collection
text_fields = [
    FieldSchema(name="id", dtype=DataType.VARCHAR, max_length=36, is_primary=True),
    FieldSchema(name="case_id", dtype=DataType.VARCHAR, max_length=36),
    FieldSchema(name="source_type", dtype=DataType.VARCHAR, max_length=20),  # im, doc, email
    FieldSchema(name="source_id", dtype=DataType.VARCHAR, max_length=36),
    FieldSchema(name="text_hash", dtype=DataType.VARCHAR, max_length=64),
    FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=768),  # BERT embedding
    FieldSchema(name="created_at", dtype=DataType.INT64),
]

text_schema = CollectionSchema(text_fields, description="Text embeddings")
text_embeddings = Collection("text_embeddings", text_schema)

text_embeddings.create_index("embedding", {
    "metric_type": "COSINE",
    "index_type": "HNSW",
    "params": {"M": 16, "efConstruction": 256}
})
```

### 4.3 向量查询示例

```python
# 商品图像相似检索
def search_similar_products(query_embedding, case_id, top_k=10):
    results = product_images.search(
        data=[query_embedding],
        anns_field="embedding",
        param={"metric_type": "COSINE", "params": {"nprobe": 16}},
        limit=top_k,
        expr=f'case_id == "{case_id}"',
        output_fields=["file_id", "image_hash", "category"]
    )
    return results

# 文本语义检索
def search_similar_texts(query_embedding, case_id, source_type=None, top_k=20):
    filter_expr = f'case_id == "{case_id}"'
    if source_type:
        filter_expr += f' && source_type == "{source_type}"'

    results = text_embeddings.search(
        data=[query_embedding],
        anns_field="embedding",
        param={"metric_type": "COSINE", "params": {"ef": 64}},
        limit=top_k,
        expr=filter_expr,
        output_fields=["source_type", "source_id", "text_hash"]
    )
    return results
```

---

## 5. Elasticsearch 索引设计

### 5.1 IM 消息索引

```json
{
  "mappings": {
    "properties": {
      "id": {"type": "keyword"},
      "case_id": {"type": "keyword"},
      "conversation_id": {"type": "keyword"},
      "message_type": {"type": "keyword"},
      "sender": {
        "properties": {
          "id": {"type": "keyword"},
          "name": {"type": "text", "analyzer": "ik_max_word"},
          "account": {"type": "keyword"}
        }
      },
      "content": {
        "type": "text",
        "analyzer": "ik_max_word",
        "search_analyzer": "ik_smart"
      },
      "media_files": {
        "type": "nested",
        "properties": {
          "file_id": {"type": "keyword"},
          "file_type": {"type": "keyword"},
          "ocr_text": {"type": "text", "analyzer": "ik_max_word"}
        }
      },
      "timestamp": {"type": "date"},
      "created_at": {"type": "date"}
    }
  }
}
```

### 5.2 文档内容索引

```json
{
  "mappings": {
    "properties": {
      "id": {"type": "keyword"},
      "case_id": {"type": "keyword"},
      "file_id": {"type": "keyword"},
      "file_name": {"type": "text", "analyzer": "ik_max_word"},
      "file_type": {"type": "keyword"},
      "content": {
        "type": "text",
        "analyzer": "ik_max_word",
        "search_analyzer": "ik_smart"
      },
      "ocr_text": {
        "type": "text",
        "analyzer": "ik_max_word"
      },
      "table_data": {
        "type": "nested",
        "properties": {
          "sheet_name": {"type": "keyword"},
          "headers": {"type": "keyword"},
          "rows": {"type": "object", "enabled": false}
        }
      },
      "metadata": {
        "type": "object",
        "enabled": false
      },
      "created_at": {"type": "date"}
    }
  }
}
```

### 5.3 实体索引

```json
{
  "mappings": {
    "properties": {
      "id": {"type": "keyword"},
      "case_id": {"type": "keyword"},
      "entity_type": {"type": "keyword"},
      "primary_name": {
        "type": "text",
        "analyzer": "ik_max_word",
        "fields": {
          "keyword": {"type": "keyword"}
        }
      },
      "aliases": {"type": "text", "analyzer": "ik_max_word"},
      "id_number": {"type": "keyword"},
      "phone_numbers": {"type": "keyword"},
      "attributes": {
        "type": "object",
        "enabled": false
      },
      "confidence": {"type": "float"},
      "created_at": {"type": "date"}
    }
  }
}
```

---

## 6. MinIO 对象存储结构

### 6.1 Bucket 策略

```
customs-evidence/
├── raw/                          # 原始文件
│   └── {case_id}/
│       ├── {batch_id}/
│       │   ├── im/               # IM 导出
│       │   ├── documents/        # 文档
│       │   ├── media/            # 多媒体
│       │   └── manifest.json     # 批次清单
│
├── processed/                    # 处理后文件
│   └── {case_id}/
│       ├── ocr/                  # OCR 结果
│       ├── transcripts/          # 转写文本
│       ├── frames/               # 视频帧
│       └── thumbnails/           # 缩略图
│
├── exports/                      # 导出文件
│   └── {case_id}/
│       ├── reports/              # 报告
│       └── packages/             # 打包文件
│
└── temp/                         # 临时文件 (定期清理)
```

### 6.2 文件命名规范

```
{case_id}/{batch_id}/{type}/{file_hash}_{original_name}

示例:
c123e456/b789f012/documents/a1b2c3d4e5f6_订单列表.xlsx
c123e456/b789f012/media/a1b2c3d4e5f7_IMG_20240115_001.jpg
```

---

## 7. Redis 缓存设计

### 7.1 缓存键命名

```
case:{case_id}:info              # 案件基本信息
case:{case_id}:stats             # 案件统计
case:{case_id}:entities          # 实体列表缓存
file:{file_id}:parse_status      # 解析状态
search:{case_id}:query:{hash}    # 搜索结果缓存
session:{session_id}             # 用户会话
rate_limit:{user_id}:{endpoint}  # 限流计数
```

### 7.2 缓存策略

| 数据类型 | 过期时间 | 更新策略 |
|---------|---------|---------|
| 案件信息 | 1 小时 | 写入失效 |
| 统计数据 | 5 分钟 | 定时刷新 |
| 搜索结果 | 10 分钟 | LRU 淘汰 |
| 解析状态 | 24 小时 | 状态变更失效 |
| 会话信息 | 30 分钟 | 滑动过期 |

---

*版本: 1.0.0 | 更新日期: 2026-02-15*
