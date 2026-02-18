# S8 - 实体抽取服务

## 1. 服务概述

S8 实体抽取服务负责从解析后的文本中提取结构化实体信息，包括人物、组织、商品、地点等。

**技术栈**: BERT + LLM + 正则表达式

---

## 2. 服务接口定义

```typescript
interface S8_EntityExtractionRequest {
  case_id: UUID;
  file_id: UUID;
  source_data: {
    text: string;
    metadata?: Record<string, unknown>;
  };
  extraction_options: {
    entity_types?: EntityType[];
    use_llm_enhancement?: boolean;
    deduplicate_entities?: boolean;
    extract_attributes?: boolean;
    confidence_threshold?: number;
  };
}

interface S8_EntityExtractionResponse {
  code: number;
  message: string;
  data: {
    case_id: UUID;
    file_id: UUID;
    entities: ExtractedEntity[];
    relations: ExtractedRelation[];
    statistics: ExtractionStats;
    confidence: number;
  };
}
```

---

## 3. 实体类型定义

```typescript
enum EntityType {
  PERSON = 'person',
  ORGANIZATION = 'organization',
  PRODUCT = 'product',
  LOCATION = 'location',
  VEHICLE = 'vehicle',
  PHONE = 'phone',
  EMAIL = 'email',
  ID_CARD = 'id_card',
  PASSPORT = 'passport',
  LICENSE_PLATE = 'license_plate',
  ACCOUNT = 'account',
  TRANSACTION = 'transaction',
  CUSTOMER = 'customer',
  SUPPLIER = 'supplier',
  BANK_CARD = 'bank_card',
  COMPANY = 'company',
  BRAND = 'brand',
  MODEL = 'model'
}
```

---

## 4. 核心类设计

```typescript
// 实体抽取器基类
abstract class EntityExtractor {
  abstract extract(text: string): ExtractedEntity[];
  abstract getEntityTypes(): EntityType[];
}

// BERT NER 抽取器
class BERTNERExtractor extends EntityExtractor {
  private model: any;

  async extract(text: string): ExtractedEntity[] {
    // 使用 BERT 模型进行 NER
    const tokens = await this.model.tokenize(text);
    const predictions = await this.model.predict(tokens);

    return this.parseEntities(predictions, text);
  }
}

// 正则模式抽取器
class PatternExtractor extends EntityExtractor {
  private patterns: Map<EntityType, RegExp>;

  extract(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    for (const [type, pattern] of this.patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        entities.push({
          entity_id: generateUUID(),
          entity_type: type,
          name: match[0],
          confidence: 0.95,
          extraction_source: 'pattern'
        });
      }
    }

    return entities;
  }
}

// LLM 增强抽取器
class LLMExtractor extends EntityExtractor {
  private llmClient: LLMClient;

  async extract(text: string): Promise<ExtractedEntity[]> {
    const prompt = `从以下文本中抽取实体，返回JSON格式: ${text}`;

    const response = await this.llmClient.complete(prompt);
    return this.parseLLMResponse(response);
  }
}

// 实体抽取服务主类
class S8_EntityExtractionService {
  private extractors: EntityExtractor[] = [
    new BERTNERExtractor(),
    new PatternExtractor(),
    new LLMExtractor()
  ];

  async extract(request: S8_EntityExtractionRequest): Promise<S8_EntityExtractionResponse> {
    const allEntities: ExtractedEntity[] = [];

    // 并行执行多种抽取器
    for (const extractor of this.extractors) {
      const entities = await extractor.extract(request.source_data.text);
      allEntities.push(...entities);
    }

    // 实体去重
    if (request.extraction_options.deduplicate_entities) {
      const deduplicated = this.deduplicateEntities(allEntities);
      allEntities.length = 0;
      allEntities.push(...deduplicated);
    }

    // 提取属性
    if (request.extraction_options.extract_attributes) {
      for (const entity of allEntities) {
        entity.attributes = this.extractAttributes(
          entity,
          request.source_data.text
        );
      }
    }

    // 抽取关系
    const relations = await this.extractRelations(allEntities, request.source_data.text);

    return {
      code: 0,
      message: 'success',
      data: {
        case_id: request.case_id,
        file_id: request.file_id,
        entities: allEntities,
        relations: relations,
        statistics: this.calculateStats(allEntities, relations),
        confidence: this.calculateConfidence(allEntities)
      }
    };
  }

  private deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const groups = new Map<string, ExtractedEntity[]>();

    for (const entity of entities) {
      const key = `${entity.entity_type}:${entity.name.toLowerCase()}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(entity);
    }

    const deduplicated: ExtractedEntity[] = [];
    for (const group of groups.values()) {
      if (group.length === 1) {
        deduplicated.push(group[0]);
      } else {
        const merged = group[0];
        merged.aliases = [];
        for (const entity of group) {
          merged.aliases.push(entity.name);
          merged.confidence = Math.max(merged.confidence, entity.confidence);
          merged.extraction_source = 'hybrid';
        }
        deduplicated.push(merged);
      }
    }

    return deduplicated;
  }
}
```

---

## 5. 抽取策略

### 5.1 NER 模型抽取
- 使用 BERT-base-chinese 进行中文实体识别
- 支持 CRF 层优化
- 输出 BIO 标注

### 5.2 正则模式抽取
- 电话: `1[3-9]\d{9}`
- 邮箱: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`
- 身份证: `\d{17}[\dXx]`
- 车牌: `[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-Z0-9]{5}`

### 5.3 LLM 增强抽取
- 语义理解补全
- 跨上下文关联
- 别名识别

---

## 6. 处理流程

```typescript
async function processEntityExtraction(request: S8_EntityExtractionRequest) {
  // 1. 多种抽取器并行执行
  const [nerResult, patternResult, llmResult] = await Promise.all([
    bertExtractor.extract(request.source_data.text),
    patternExtractor.extract(request.source_data.text),
    llmExtractor.extract(request.source_data.text)
  ]);

  // 2. 合并结果
  const allEntities = [...nerResult, ...patternResult, ...llmResult];

  // 3. 实体去重
  const deduplicated = deduplicateEntities(allEntities);

  // 4. 属性提取
  for (const entity of deduplicated) {
    entity.attributes = extractAttributes(entity, request.source_data.text);
  }

  // 5. 关系抽取
  const relations = await extractRelations(deduplicated, request.source_data.text);

  // 6. 统计计算
  const stats = calculateStatistics(deduplicated, relations);

  return { entities: deduplicated, relations, statistics: stats };
}
```

---

## 7. 错误码定义

| 错误码 | 说明 | 处理建议 |
|-------|------|---------|
| S8-001 | NER 模型加载失败 | 检查模型文件 |
| S8-002 | 文本为空 | 提供有效文本 |
| S8-003 | LLM 调用超时 | 增加超时时间 |

---

*版本: 1.0.0 | 更新日期: 2026-02-15*
