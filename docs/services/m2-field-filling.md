# M2 - 证据大表字段填充服务

## 1. 服务概述

M2 证据大表字段填充服务负责将各类证据数据填充到结构化的证据大表中，包含 6 个子能力。

**技术栈**: 字段映射 + 语义抽取 + LLM 增强

---

## 2. 服务接口定义

```typescript
interface M2_FieldFillingRequest {
  case_id: UUID;
  operation: FieldFillingOperation;
  input_data: FieldFillingInput;
}

type FieldFillingOperation =
  | 'align_structured_fields'
  | 'extract_product_semantic'
  | 'extract_price_semantic'
  | 'extract_person_role'
  | 'fuse_evidence_source'
  | 'suggest_semantic_fill';

interface M2_FieldFillingResponse {
  code: number;
  message: string;
  data: {
    case_id: UUID;
    operation: FieldFillingOperation;
    filled_fields: FilledField[];
    evidence_record: EvidenceRecord;
    confidence: number;
  };
}
```

---

## 3. 核心类设计

```typescript
class M2_FieldFillingService {
  private fieldDefinitions: Map<string, FieldDefinition>;
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
    this.loadFieldDefinitions();
  }

  async execute(request: M2_FieldFillingRequest): Promise<M2_FieldFillingResponse> {
    const operation = request.operation;

    switch (operation) {
      case 'align_structured_fields':
        return await this.alignStructuredFields(request.input_data);
      case 'extract_product_semantic':
        return await this.extractProductSemantic(request.input_data);
      case 'extract_price_semantic':
        return await this.extractPriceSemantic(request.input_data);
      case 'extract_person_role':
        return await this.extractPersonRole(request.input_data);
      case 'fuse_evidence_source':
        return await this.fuseEvidenceSource(request.input_data);
      case 'suggest_semantic_fill':
        return await this.suggestSemanticFill(request.input_data);
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  private async alignStructuredFields(input: FieldFillingInput): Promise<M2_FieldFillingResponse> {
    const evidenceRecord: EvidenceRecord = {
      case_id: input.case_id,
      filled_fields: [],
      source_map: {}
    };

    // 遍历所有字段定义
    for (const [fieldName, fieldDef] of this.fieldDefinitions) {
      const mappedValue = await this.mapFieldValue(input.source_data, fieldDef);

      if (mappedValue !== undefined) {
        evidenceRecord.filled_fields.push({
          field_name: fieldName,
          value: mappedValue.value,
          source: mappedValue.source,
          confidence: mappedValue.confidence
        });
        evidenceRecord[fieldName] = mappedValue.value;
      }
    }

    const avgConfidence = this.calculateAverageConfidence(evidenceRecord.filled_fields);

    return {
      code: 0,
      message: 'success',
      data: {
        case_id: input.case_id,
        operation: 'align_structured_fields',
        filled_fields: evidenceRecord.filled_fields,
        evidence_record: evidenceRecord,
        confidence: avgConfidence
      }
    };
  }
}
```

---

## 4. 子能力详细设计

### 4.1 子能力 1: 结构化字段对齐

```typescript
interface FieldDefinition {
  field_name: string;              // 字段名
  field_type: 'string' | 'number' | 'date' | 'enum';
  required: boolean;                // 是否必填
  source_mapping: SourceMapping[];   // 数据源映射
  validators: FieldValidator[];      // 验证规则
}

interface SourceMapping {
  source_type: string;             // 数据源类型
  field_path: string;              // 字段路径（支持嵌套）
  transform?: string;              // 转换表达式
}

interface FieldValidator {
  type: 'regex' | 'range' | 'enum' | 'custom';
  rule: string;
  error_message: string;
}

interface StructuredFieldInput {
  case_id: UUID;
  source_data: Record<string, any>;
  field_config?: FieldDefinition[];
}

async function alignStructuredFields(input: StructuredFieldInput): Promise<EvidenceRecord> {
  const evidenceRecord: EvidenceRecord = {
    case_id: input.case_id,
    filled_fields: [],
    source_map: {}
  };

  const fieldDefs = input.field_config || loadDefaultFieldDefinitions();

  for (const fieldDef of fieldDefs) {
    const fieldValue = await mapFieldValue(input.source_data, fieldDef);

    if (fieldValue !== undefined) {
      // 验证字段值
      const validation = await validateField(fieldDef, fieldValue.value);
      if (validation.valid) {
        evidenceRecord.filled_fields.push({
          field_name: fieldDef.field_name,
          value: fieldValue.value,
          source: fieldValue.source,
          confidence: fieldValue.confidence
        });
        evidenceRecord[fieldDef.field_name] = fieldValue.value;
      } else {
        evidenceRecord.validation_errors = evidenceRecord.validation_errors || [];
        evidenceRecord.validation_errors.push({
          field_name: fieldDef.field_name,
          error: validation.error_message
        });
      }
    } else if (fieldDef.required) {
      evidenceRecord.missing_fields = evidenceRecord.missing_fields || [];
      evidenceRecord.missing_fields.push(fieldDef.field_name);
    }
  }

  return evidenceRecord;
}

async function mapFieldValue(
  sourceData: Record<string, any>,
  fieldDef: FieldDefinition
): Promise<FieldValue | undefined> {
  // 遍历源映射，找到第一个匹配的值
  for (const mapping of fieldDef.source_mapping) {
    const value = extractByPath(sourceData, mapping.field_path);

    if (value !== undefined) {
      // 应用转换
      const transformedValue = mapping.transform
        ? applyTransform(value, mapping.transform)
        : value;

      return {
        source: mapping.source_type,
        value: transformedValue,
        confidence: 1.0
      };
    }
  }

  return undefined;
}
```

### 4.2 子能力 2: 商品语义抽取

```typescript
interface ProductSemanticInput {
  text: string;
  context?: Record<string, any>;
  entity_references?: string[];     // 已识别的商品实体
}

interface ProductSemanticOutput {
  product_name: string;
  brand?: string;
  model?: string;
  category?: string;
  specifications?: ProductSpec[];
  confidence: number;
}

interface ProductSpec {
  spec_name: string;              // 规格名称（颜色、尺寸等）
  spec_value: string;
}

async function extractProductSemantic(input: ProductSemanticInput): Promise<ProductSemanticOutput> {
  // 使用 LLM 进行语义抽取
  const prompt = `
从以下文本中抽取商品信息，返回JSON格式:

文本: ${input.text}

抽取以下信息:
1. 商品名称
2. 品牌
3. 型号
4. 类别
5. 规格（颜色、尺寸等）

返回格式:
{
  "product_name": "...",
  "brand": "...",
  "model": "...",
  "category": "...",
  "specifications": [
    {"spec_name": "颜色", "spec_value": "..."},
    {"spec_name": "尺寸", "spec_value": "..."}
  ]
}
`;

  const response = await llmClient.complete(prompt);
  const result = parseLLMResponse(response);

  // 如果有实体引用，进行对齐
  if (input.entity_references && result.product_name) {
    const matchedEntity = findBestMatch(input.entity_references, result.product_name);
    if (matchedEntity) {
      result.confidence = Math.min(result.confidence, 0.9);
    }
  }

  return result;
}
```

### 4.3 子能力 3: 价格与交易语义

```typescript
interface PriceSemanticInput {
  text: string;
  context?: Record<string, any>;
}

interface PriceSemanticOutput {
  amount: number;
  currency: string;
  price_type: 'unit_price' | 'total_price' | 'discount' | 'surcharge';
  unit?: string;                   // 单位
  confidence: number;
}

async function extractPriceSemantic(input: PriceSemanticInput): Promise<PriceSemanticOutput> {
  // 使用正则表达式 + LLM 混合抽取
  const regexResults = extractPriceByRegex(input.text);

  if (regexResults.length > 0) {
    return regexResults[0];
  }

  // LLM 兜底
  const prompt = `
从以下文本中抽取价格信息，返回JSON格式:

文本: ${input.text}

抽取以下信息:
1. 金额（数字）
2. 货币（CNY, USD, HKD 等）
3. 价格类型（单价/总价/折扣/附加费）
4. 单位（如适用）

返回格式:
{
  "amount": 123.45,
  "currency": "CNY",
  "price_type": "unit_price",
  "unit": "件"
}
`;

  const response = await llmClient.complete(prompt);
  return parseLLMResponse(response);
}

function extractPriceByRegex(text: string): PriceSemanticOutput[] {
  const patterns = [
    // 人民币
    {
      pattern: /￥|¥|CNY)\s*(\d+(?:\.\d{1,2})?)/g,
      currency: 'CNY'
    },
    // 美元
    {
      pattern: /\$\s*(\d+(?:\.\d{1,2})?)\s*(USD?)?/g,
      currency: 'USD'
    },
    // 港币
    {
      pattern: /HK\$|HKD)\s*(\d+(?:\.\d{1,2})?)/g,
      currency: 'HKD'
    }
  ];

  const results: PriceSemanticOutput[] = [];
  for (const { pattern, currency } of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      results.push({
        amount: parseFloat(match[1]),
        currency,
        price_type: 'unit_price',
        confidence: 0.95
      });
    }
  }

  return results;
}
```

### 4.4 子能力 4: 人物角色语义

```typescript
interface PersonRoleInput {
  person_id: UUID;
  person_name: string;
  context: PersonContext;
}

interface PersonContext {
  transaction_records: TransactionRecord[];
  communication_records: CommunicationRecord[];
  document_references: DocumentReference[];
}

interface PersonRoleOutput {
  person_id: UUID;
  role: PersonRole;
  role_confidence: number;
  supporting_evidence: string[];
}

enum PersonRole {
  BUYER = 'buyer',
  SELLER = 'seller',
  SUPPLIER = 'supplier',
  CUSTOMER = 'customer',
  INTERMEDIARY = 'intermediary',
  WITNESS = 'witness',
  UNKNOWN = 'unknown'
}

async function extractPersonRole(input: PersonRoleInput): Promise<PersonRoleOutput> {
  const roleScores = new Map<PersonRole, number>();

  // 基于交易记录判断
  for (const tx of input.context.transaction_records) {
    if (tx.buyer === input.person_name) {
      incrementScore(roleScores, PersonRole.BUYER, 0.8);
    }
    if (tx.seller === input.person_name) {
      incrementScore(roleScores, PersonRole.SELLER, 0.8);
    }
  }

  // 基于通信记录判断
  for (const comm of input.context.communication_records) {
    if (comm.sender === input.person_name) {
      incrementScore(roleScores, PersonRole.SUPPLIER, 0.5);
    }
  }

  // 使用 LLM 进行角色推断
  const prompt = `
基于以下上下文信息，判断此人物在交易中的角色:

人物姓名: ${input.person_name}

交易记录:
${JSON.stringify(input.context.transaction_records, null, 2)}

可能的角色:
1. 买方
2. 卖方
3. 供应商
4. 中介
5. 证人

返回格式:
{
  "role": "buyer|seller|supplier|intermediary|witness",
  "confidence": 0.0-1.0,
  "reasoning": "判断依据"
}
`;

  const response = await llmClient.complete(prompt);
  const llmResult = parseLLMResponse(response);

  // 合并规则和 LLM 结果
  if (llmResult) {
    const existingScore = roleScores.get(llmResult.role) || 0;
    roleScores.set(llmResult.role, Math.max(existingScore, llmResult.confidence));
  }

  // 确定最终角色
  let finalRole = PersonRole.UNKNOWN;
  let maxScore = 0;
  for (const [role, score] of roleScores) {
    if (score > maxScore) {
      maxScore = score;
      finalRole = role;
    }
  }

  return {
    person_id: input.person_id,
    role: finalRole,
    role_confidence: maxScore,
    supporting_evidence: extractSupportingEvidence(input, finalRole)
  };
}
```

### 4.5 子能力 5: 证据来源融合

```typescript
interface EvidenceSourceFusionInput {
  evidence_id: UUID;
  source_records: SourceRecord[];
  conflict_resolution?: 'priority' | 'confidence' | 'llm';
  priority_order?: string[];           // 优先级顺序
}

interface SourceRecord {
  source_id: string;
  source_type: string;              // 数据源类型
  data: Record<string, any>;
  confidence: number;
  timestamp: string;
}

interface FusedEvidence {
  evidence_id: UUID;
  fused_data: Record<string, any>;
  source_map: Record<string, SourceInfo>;
  conflicts: ConflictInfo[];
}

interface SourceInfo {
  source_id: string;
  source_type: string;
  confidence: number;
  provided_fields: string[];
}

interface ConflictInfo {
  field_name: string;
  conflicting_sources: SourceInfo[];
  resolved_value: any;
  resolution_method: string;
}

async function fuseEvidenceSource(input: EvidenceSourceFusionInput): Promise<FusedEvidence> {
  const fusedData: Record<string, any> = {};
  const sourceMap: Record<string, SourceInfo> = {};
  const conflicts: ConflictInfo[] = [];

  // 收集所有字段的来源信息
  const fieldSources = new Map<string, SourceRecord[]>();
  for (const record of input.source_records) {
    for (const [fieldName, value] of Object.entries(record.data)) {
      if (!fieldSources.has(fieldName)) {
        fieldSources.set(fieldName, []);
      }
      fieldSources.get(fieldName)!.push(record);
    }
  }

  // 解决每个字段的冲突
  for (const [fieldName, sources] of fieldSources) {
    const uniqueValues = new Set(sources.map(s => JSON.stringify(s.data[fieldName])));

    if (uniqueValues.size === 1) {
      // 无冲突，直接使用
      const source = sources[0];
      fusedData[fieldName] = source.data[fieldName];
      sourceMap[fieldName] = {
        source_id: source.source_id,
        source_type: source.source_type,
        confidence: source.confidence,
        provided_fields: [fieldName]
      };
    } else {
      // 有冲突，需要解决
      const conflict = await resolveConflict(fieldName, sources, input);
      fusedData[fieldName] = conflict.resolved_value;
      conflicts.push(conflict);
      sourceMap[fieldName] = conflict.selected_source;
    }
  }

  return {
    evidence_id: input.evidence_id,
    fused_data: fusedData,
    source_map: sourceMap,
    conflicts
  };
}

async function resolveConflict(
  fieldName: string,
  sources: SourceRecord[],
  input: EvidenceSourceFusionInput
): Promise<ConflictInfo> {
  const resolutionMethod = input.conflict_resolution || 'confidence';

  switch (resolutionMethod) {
    case 'priority':
      return resolveByPriority(fieldName, sources, input.priority_order);
    case 'confidence':
      return resolveByConfidence(fieldName, sources);
    case 'llm':
      return resolveByLLM(fieldName, sources);
  }
}

function resolveByPriority(
  fieldName: string,
  sources: SourceRecord[],
  priorityOrder?: string[]
): ConflictInfo {
  const priorityMap = new Map(priorityOrder?.map((p, i) => [p, i]) || []);

  let bestSource = sources[0];
  let bestPriority = Infinity;

  for (const source of sources) {
    const priority = priorityMap.get(source.source_type) ?? 99;
    if (priority < bestPriority) {
      bestPriority = priority;
      bestSource = source;
    }
  }

  return {
    field_name: fieldName,
    conflicting_sources: sources.map(s => ({
      source_id: s.source_id,
      source_type: s.source_type,
      confidence: s.confidence,
      provided_fields: [fieldName]
    })),
    resolved_value: bestSource.data[fieldName],
    resolution_method: 'priority_order',
    selected_source: {
      source_id: bestSource.source_id,
      source_type: bestSource.source_type,
      confidence: bestSource.confidence,
      provided_fields: [fieldName]
    }
  };
}

function resolveByConfidence(
  fieldName: string,
  sources: SourceRecord[]
): ConflictInfo {
  let bestSource = sources[0];
  let bestConfidence = -1;

  for (const source of sources) {
    if (source.confidence > bestConfidence) {
      bestConfidence = source.confidence;
      bestSource = source;
    }
  }

  return {
    field_name: fieldName,
    conflicting_sources: sources.map(s => ({
      source_id: s.source_id,
      source_type: s.source_type,
      confidence: s.confidence,
      provided_fields: [fieldName]
    })),
    resolved_value: bestSource.data[fieldName],
    resolution_method: 'highest_confidence',
    selected_source: {
      source_id: bestSource.source_id,
      source_type: bestSource.source_type,
      confidence: bestSource.confidence,
      provided_fields: [fieldName]
    }
  };
}
```

### 4.6 子能力 6: 语义补证建议

```typescript
interface SemanticFillSuggestionInput {
  evidence_id: UUID;
  missing_fields: string[];         // 缺失的字段
  available_context: Record<string, any>;  // 可用上下文信息
}

interface SemanticFillSuggestion {
  suggestions: FieldSuggestion[];
  confidence: number;
}

interface FieldSuggestion {
  field_name: string;
  suggested_value: any;
  suggestion_type: 'fill' | 'flag_for_review';
  reasoning: string;                // 建议理由
  confidence: number;
  sources: string[];
}

async function suggestSemanticFill(input: SemanticFillSuggestionInput): Promise<SemanticFillSuggestion> {
  const suggestions: FieldSuggestion[] = [];

  for (const field of input.missing_fields) {
    const prompt = `
基于以下上下文信息，为证据记录填写缺失字段。

缺失字段: ${field}

可用上下文:
${JSON.stringify(input.available_context, null, 2)}

如果可以确定字段值，返回:
{
  "field_name": "${field}",
  "suggested_value": "...",
  "suggestion_type": "fill",
  "reasoning": "推断依据",
  "confidence": 0.0-1.0,
  "sources": ["..."]
}

如果无法确定，返回:
{
  "field_name": "${field}",
  "suggested_value": null,
  "suggestion_type": "flag_for_review",
  "reasoning": "无法推断原因",
  "confidence": 0.0,
  "sources": []
}
`;

    const response = await llmClient.complete(prompt);
    const suggestion = parseLLMResponse(response);
    suggestions.push(suggestion);
  }

  const avgConfidence = suggestions.length > 0
    ? suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length
    : 0;

  return {
    suggestions,
    confidence: avgConfidence
  };
}
```

---

## 5. 错误码定义

| 错误码 | 说明 | 处理建议 |
|-------|------|---------|
| M2-001 | 字段映射失败 | 检查字段定义 |
| M2-002 | 数据源冲突 | 指定解决策略 |

---

*版本: 1.0.0 | 更新日期: 2026-02-15*
