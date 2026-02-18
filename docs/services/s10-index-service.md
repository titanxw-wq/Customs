# S10 - 轻量索引服务

## 1. 服务概述

S10 轻量索引服务提供全文检索和向量相似度搜索能力，支持混合检索策略。

**技术栈**: Elasticsearch + Milvus + Sentence Transformers

---

## 2. 服务接口定义

```typescript
interface S10_IndexServiceRequest {
  case_id: UUID;
  operation: IndexOperation;
  data?: IndexDataInput;
  query?: IndexQuery;
}

type IndexOperation =
  | 'index_text'
  | 'index_vector'
  | 'index_hybrid'
  | 'search_text'
  | 'search_vector'
  | 'search_hybrid'
  | 'delete_index';

interface S10_IndexServiceResponse {
  code: number;
  message: string;
  data: {
    case_id: UUID;
    operation: IndexOperation;
    results?: SearchResult[];
    indexed_count?: number;
  };
}
```

---

## 3. 核心类设计

```typescript
class S10_IndexService {
  private es: ElasticsearchClient;
  private milvus: MilvusClient;
  private embedder: SentenceTransformer;

  async execute(request: S10_IndexServiceRequest): Promise<S10_IndexServiceResponse> {
    switch (request.operation) {
      case 'index_text':
        return await this.indexText(request.data.documents);
      case 'index_vector':
        return await this.indexVector(request.data.documents);
      case 'search_text':
        return await this.searchText(request.query);
      case 'search_vector':
        return await this.searchVector(request.query);
      case 'search_hybrid':
        return await this.hybridSearch(request.query);
      default:
        throw new Error(`Unknown operation: ${request.operation}`);
    }
  }

  private async indexText(documents: IndexDocument[]): Promise<S10_IndexServiceResponse> {
    let count = 0;
    for (const doc of documents) {
      const body = {
        _id: doc.document_id,
        case_id: doc.case_id,
        file_id: doc.file_id,
        content: doc.content,
        content_length: doc.content.length,
        ...(doc.metadata || {})
      };
      await this.es.index({ index: 'cases', body });
      count++;
    }
    await this.es.indices.refresh();
    return { code: 0, message: 'success', data: { indexed_count: count } };
  }

  private async indexVector(documents: IndexDocument[]): Promise<S10_IndexServiceResponse> {
    const vectors = [];
    for (const doc of documents) {
      const embedding = await this.embedder.encode(doc.content);
      vectors.push({
        id: doc.document_id,
        vector: embedding,
        case_id: doc.case_id
      });
    }
    await this.milvus.insert('case_vectors', vectors);
    return { code: 0, message: 'success', data: { indexed_count: vectors.length } };
  }

  private async hybridSearch(query: IndexQuery): Promise<S10_IndexServiceResponse> {
    // 并行执行两种检索
    const [textResults, vectorResults] = await Promise.all([
      this.searchText(query),
      this.searchVector(query)
    ]);

    // 融合结果
    const fused = this.rbfFusion(textResults.results, vectorResults.results);

    return {
      code: 0,
      message: 'success',
      data: { case_id: query.case_id, operation: 'search_hybrid', results: fused }
    };
  }

  private rbfFusion(textResults: SearchResult[], vectorResults: SearchResult[]): SearchResult[] {
    const k = 60;
    const scores = new Map<string, number>();

    // RRF 计算
    for (let i = 0; i < textResults.length; i++) {
      const docId = textResults[i].document_id;
      scores.set(docId, (scores.get(docId) || 0) + 1.0 / (k + i + 1));
    }

    for (let i = 0; i < vectorResults.length; i++) {
      const docId = vectorResults[i].document_id;
      scores.set(docId, (scores.get(docId) || 0) + 1.0 / (k + i + 1));
    }

    // 排序并返回
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, score]) => ({ ...textResults.find(r => r.document_id === id), score }));
  }
}
```

---

## 4. Elasticsearch 索引配置

```json
{
  "mappings": {
    "properties": {
      "case_id": { "type": "keyword" },
      "file_id": { "type": "keyword" },
      "content": {
        "type": "text",
        "analyzer": "ik_max_word",
        "search_analyzer": "ik_smart"
      },
      "content_length": { "type": "integer" },
      "entity_ids": { "type": "keyword" },
      "created_at": { "type": "date" }
    }
  },
  "settings": {
    "analysis": {
      "analyzer": {
        "ik_max_word": {
          "type": "custom",
          "tokenizer": "ik_max_word"
        },
        "ik_smart": {
          "type": "custom",
          "tokenizer": "ik_smart"
        }
      }
    }
  }
}
```

---

## 5. Milvus 向量配置

```python
# 集合定义
collection_schema = {
    "fields": [
        {"name": "id", "type": "VARCHAR", "max_length": 36, "is_primary": True},
        {"name": "case_id", "type": "VARCHAR", "max_length": 36},
        {"name": "vector", "type": "FLOAT_VECTOR", "dim": 768}
    ]
}

# 索引配置
index_params = {
    "metric_type": "IP",
    "index_type": "IVF_FLAT",
    "params": {"nlist": 128}
}
```

---

## 6. 混合检索策略

### 6.1 RRF (Reciprocal Rank Fusion)
```typescript
function rrfFusion(results1: SearchResult[], results2: SearchResult[], k: number = 60): SearchResult[] {
  const scores = new Map<string, number>();

  for (let i = 0; i < results1.length; i++) {
    const id = results1[i].document_id;
    scores.set(id, (scores.get(id) || 0) + 1.0 / (k + i));
  }

  for (let i = 0; i < results2.length; i++) {
    const id = results2[i].document_id;
    scores.set(id, (scores.get(id) || 0) + 1.0 / (k + i));
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, score]) => ({ document_id: id, score }));
}
```

### 6.2 加权融合
```typescript
function weightedFusion(textResults: SearchResult[], vectorResults: SearchResult[], textWeight: number = 0.5): SearchResult[] {
  const allDocs = new Set([...textResults, ...vectorResults].map(r => r.document_id));
  const fused: SearchResult[] = [];

  for (const docId of allDocs) {
    const textRes = textResults.find(r => r.document_id === docId);
    const vecRes = vectorResults.find(r => r.document_id === docId);

    const textScore = textRes ? textRes.score : 0;
    const vecScore = vecRes ? vecRes.score : 0;

    fused.push({
      document_id: docId,
      score: textScore * textWeight + vecScore * (1 - textWeight)
    });
  }

  return fused.sort((a, b) => b.score - a.score);
}
```

---

## 7. 查询 DSL 示例

```json
{
  "query": {
    "bool": {
      "must": [
        {
          "multi_match": {
            "query": "走私 案件",
            "fields": ["content^2", "title"],
            "type": "best_fields"
          }
        }
      ],
      "filter": [
        { "term": { "case_id": "uuid" } }
      ]
    }
  },
  "highlight": {
    "fields": { "content": {} }
  },
  "from": 0,
  "size": 10
}
```

---

## 8. 错误码定义

| 错误码 | 说明 | 处理建议 |
|-------|------|---------|
| S10-001 | ES 连接失败 | 检查 ES 服务 |
| S10-002 | Milvus 连接失败 | 检查 Milvus 服务 |
| S10-003 | 向量维度不匹配 | 检查嵌入模型 |

---

*版本: 1.0.0 | 更新日期: 2026-02-15*
