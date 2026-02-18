# M1 - 规则引擎与评分服务 (规则 1-5)

## 1. 服务概述

M1 规则引擎与评分服务负责对证据数据进行规则匹配和评分计算，本部分涵盖前 5 个子能力。

**技术栈**: 规则引擎 + 评分算法

---

## 2. 服务接口定义

```typescript
interface M1_RuleEngineRequest {
  case_id: UUID;
  rule_id: string;
  input_data: RuleInputData;
  options?: {
    threshold?: number;               // 评分阈值
    return_details?: boolean;        // 返回详细评分
  };
}

type RuleInputData =
  | { type: 'time_window'; data: TimeWindowInput }
  | { type: 'order_id'; data: OrderIdInput }
  | { type: 'person_merge'; data: PersonMergeInput }
  | { type: 'amount_validation'; data: AmountInput }
  | { type: 'quantity_validation'; data: QuantityInput };

interface M1_RuleEngineResponse {
  code: number;
  message: string;
  data: {
    case_id: UUID;
    rule_id: string;
    rule_name: string;
    matched: boolean;
    score: number;                   // 0-1
    details?: RuleMatchDetails;
  };
}
```

---

## 3. 核心类设计

```typescript
class M1_RuleEngine {
  private rules: Map<string, RuleDefinition> = new Map();

  constructor() {
    this.registerRules();
  }

  async execute(request: M1_RuleEngineRequest): Promise<M1_RuleEngineResponse> {
    const rule = this.rules.get(request.rule_id);
    if (!rule) {
      return {
        code: 404,
        message: `Rule not found: ${request.rule_id}`,
        data: null
      };
    }

    // 执行规则
    const result = await this.executeRule(rule, request.input_data);

    return {
      code: 0,
      message: 'success',
      data: {
        case_id: request.case_id,
        rule_id: rule.id,
        rule_name: rule.name,
        matched: result.matched,
        score: result.score,
        details: request.options?.return_details ? result.details : undefined
      }
    };
  }

  private registerRules(): void {
    this.rules.set('M1-001', {
      id: 'M1-001',
      name: '时间窗匹配',
      type: 'time_window',
      priority: 10,
      confidence_weight: 0.8,
      handler: this.matchTimeWindow.bind(this)
    });

    this.rules.set('M1-002', {
      id: 'M1-002',
      name: '订单/票据号匹配',
      type: 'order_id',
      priority: 10,
      confidence_weight: 0.9,
      handler: this.matchOrderId.bind(this)
    });

    this.rules.set('M1-003', {
      id: 'M1-003',
      name: '人物主体归并',
      type: 'person_merge',
      priority: 9,
      confidence_weight: 0.7,
      handler: this.mergePerson.bind(this)
    });

    this.rules.set('M1-004', {
      id: 'M1-004',
      name: '金额与币种校验',
      type: 'amount_validation',
      priority: 8,
      confidence_weight: 0.85,
      handler: this.validateAmount.bind(this)
    });

    this.rules.set('M1-005', {
      id: 'M1-005',
      name: '商品数量一致性',
      type: 'quantity_validation',
      priority: 8,
      confidence_weight: 0.8,
      handler: this.validateQuantity.bind(this)
    });
  }
}
```

---

## 4. 规则 1-5 详细设计

### 4.1 规则 M1-001: 时间窗匹配

```typescript
interface TimeWindowInput {
  timestamp: string;              // 待匹配的时间戳
  reference_timestamps: string[]; // 参考时间戳列表
  window_seconds?: number;         // 时间窗大小（秒）
}

interface TimeWindowOutput {
  within_window: boolean;
  closest_timestamp?: string;
  distance_seconds?: number;
  score: number;
}

async function matchTimeWindow(input: TimeWindowInput): Promise<TimeWindowOutput> {
  const windowSeconds = input.window_seconds || 86400; // 默认 24 小时

  const targetTime = new Date(input.timestamp).getTime();
  const refTimes = input.reference_timestamps.map(t => new Date(t).getTime());

  // 计算时间差
  const distances = refTimes.map(t => Math.abs(t - targetTime));

  // 找到最小距离
  const minDistance = Math.min(...distances);
  const minIndex = distances.indexOf(minDistance);
  const withinWindow = minDistance <= windowSeconds * 1000;

  // 计算分数（距离越小分数越高）
  const score = withinWindow
    ? 1.0 - (minDistance / (windowSeconds * 1000))
    : 0.0;

  return {
    within_window: withinWindow,
    closest_timestamp: input.reference_timestamps[minIndex],
    distance_seconds: minDistance / 1000,
    score: Math.max(0, Math.min(1, score))
  };
}
```

### 4.2 规则 M1-002: 订单/票据号匹配

```typescript
interface OrderIdInput {
  order_id: string;              // 待匹配的订单号
  reference_orders: string[];    // 参考订单号列表
  fuzzy?: boolean;               // 是否模糊匹配
}

interface OrderIdOutput {
  matched: boolean;
  matched_order?: string;
  similarity?: number;            // 相似度 (0-1)
  score: number;
}

async function matchOrderId(input: OrderIdInput): Promise<OrderIdOutput> {
  const targetOrderId = input.order_id.toLowerCase().trim();

  // 精确匹配
  for (const refOrder of input.reference_orders) {
    if (refOrder.toLowerCase().trim() === targetOrderId) {
      return {
        matched: true,
        matched_order: refOrder,
        similarity: 1.0,
        score: 1.0
      };
    }
  }

  // 模糊匹配
  if (input.fuzzy) {
    for (const refOrder of input.reference_orders) {
      const similarity = calculateStringSimilarity(targetOrderId, refOrder.toLowerCase().trim());
      if (similarity >= 0.8) {
        return {
          matched: true,
          matched_order: refOrder,
          similarity,
          score: similarity
        };
      }
    }
  }

  return {
    matched: false,
    score: 0.0
  };
}

function calculateStringSimilarity(str1: string, str2: string): number {
  // Levenshtein 距离算法
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  return 1.0 - (distance / Math.max(len1, len2));
}
```

### 4.3 规则 M1-003: 人物主体归并

```typescript
interface PersonMergeInput {
  person_entities: PersonEntity[];
  merge_threshold?: number;      // 相似度阈值 (0-1)
}

interface PersonEntity {
  entity_id: UUID;
  name: string;
  aliases: string[];
  attributes: PersonAttribute[];
}

interface PersonMergeOutput {
  merged_groups: MergedPersonGroup[];
  merge_count: number;
  score: number;
}

interface MergedPersonGroup {
  group_id: UUID;
  entities: PersonEntity[];
  canonical_name: string;
  canonical_attributes: PersonAttribute[];
}

async function mergePerson(input: PersonMergeInput): Promise<PersonMergeOutput> {
  const threshold = input.merge_threshold || 0.85;

  const groups: Map<string, PersonEntity[]> = new Map();

  // 计算两两相似度
  for (let i = 0; i < input.person_entities.length; i++) {
    for (let j = i + 1; j < input.person_entities.length; j++) {
      const sim = calculatePersonSimilarity(
        input.person_entities[i],
        input.person_entities[j]
      );

      if (sim >= threshold) {
        // 将两个实体放入同一组
        const groupKey = `group_${groups.size}`;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, [input.person_entities[i]]);
        }
        groups.get(groupKey)!.push(input.person_entities[j]);
      }
    }
  }

  // 未合并的实体各自成组
  const mergedEntities = new Set<UUID>();
  for (const entity of input.person_entities) {
    if (!mergedEntities.has(entity.entity_id)) {
      groups.set(entity.entity_id, [entity]);
      mergedEntities.add(entity.entity_id);
    }
  }

  // 构建输出
  const mergedGroups: MergedPersonGroup[] = [];
  for (const [groupId, entities] of groups) {
    mergedGroups.push({
      group_id: generateUUID(),
      entities,
      canonical_name: entities[0].name,
      canonical_attributes: mergeAttributes(entities)
    });
  }

  // 计算分数（归并率）
  const mergeRate = (input.person_entities.length - mergedGroups.length) / input.person_entities.length;

  return {
    merged_groups: mergedGroups,
    merge_count: input.person_entities.length - mergedGroups.length,
    score: mergeRate
  };
}

function calculatePersonSimilarity(p1: PersonEntity, p2: PersonEntity): number {
  // 名称相似度
  const nameSim = calculateStringSimilarity(p1.name.toLowerCase(), p2.name.toLowerCase());

  // 别名相似度
  const aliases1 = new Set(p1.aliases.map(a => a.toLowerCase()));
  const aliases2 = new Set(p2.aliases.map(a => a.toLowerCase()));
  const aliasOverlap = intersectionSize(aliases1, aliases2) / unionSize(aliases1, aliases2);

  // 属性相似度（电话、邮箱）
  let attrSim = 0;
  const p1Phone = p1.attributes.find(a => a.name === 'phone');
  const p2Phone = p2.attributes.find(a => a.name === 'phone');
  if (p1Phone && p2Phone && p1Phone.value === p2Phone.value) {
    attrSim += 0.5;
  }

  const p1Email = p1.attributes.find(a => a.name === 'email');
  const p2Email = p2.attributes.find(a => a.name === 'email');
  if (p1Email && p2Email && p1Email.value === p2Email.value) {
    attrSim += 0.5;
  }

  // 加权平均
  return nameSim * 0.5 + aliasOverlap * 0.3 + attrSim * 0.2;
}
```

### 4.4 规则 M1-004: 金额与币种校验

```typescript
interface AmountInput {
  amount: number;
  currency: string;
  reference_amounts: Array<{ amount: number; currency: string }>;
  exchange_rates?: Map<string, Map<string, number>>; // 币种汇率
}

interface AmountOutput {
  valid: boolean;
  matched_reference?: { amount: number; currency: string };
  converted_amount?: number;        // 转换后金额
  deviation_percent?: number;        // 偏差百分比
  score: number;
}

async function validateAmount(input: AmountInput): Promise<AmountOutput> {
  const targetCurrency = input.currency;
  const targetAmount = input.amount;

  // 转换所有参考金额到目标币种
  const convertedRefs = input.reference_amounts.map(ref => {
    if (ref.currency === targetCurrency) {
      return { ...ref, converted: ref.amount };
    }
    const rate = input.exchange_rates?.get(ref.currency)?.get(targetCurrency);
    if (!rate) {
      return { ...ref, converted: null };
    }
    return { ...ref, converted: ref.amount * rate };
  });

  // 查找匹配
  const threshold = 0.05; // 5% 容差
  for (const ref of convertedRefs) {
    if (ref.converted !== null) {
      const deviation = Math.abs(targetAmount - ref.converted) / ref.converted;
      if (deviation <= threshold) {
        return {
          valid: true,
          matched_reference: ref,
          converted_amount: ref.converted,
          deviation_percent: deviation * 100,
          score: 1.0 - deviation
        };
      }
    }
  }

  return {
    valid: false,
    score: 0.0
  };
}
```

### 4.5 规则 M1-005: 商品数量一致性

```typescript
interface QuantityInput {
  product_id: string;
  quantity: number;
  unit: string;                   // 单位（个、件、箱等）
  reference_quantities: Array<{ product_id: string; quantity: number; unit: string }>;
  unit_conversions?: Map<string, Map<string, number>>; // 单位换算
}

interface QuantityOutput {
  consistent: boolean;
  matched_reference?: { product_id: string; quantity: number; unit: string };
  converted_quantity?: number;      // 换算后数量
  deviation_percent?: number;
  score: number;
}

async function validateQuantity(input: QuantityInput): Promise<QuantityOutput> {
  const targetProduct = input.product_id;
  const targetQuantity = input.quantity;
  const targetUnit = input.unit;

  // 转换所有参考数量到目标单位
  const convertedRefs = input.reference_quantities.map(ref => {
    if (ref.product_id !== targetProduct) {
      return { ...ref, converted: null };
    }
    if (ref.unit === targetUnit) {
      return { ...ref, converted: ref.quantity };
    }
    const conversion = input.unit_conversions?.get(ref.unit)?.get(targetUnit);
    if (!conversion) {
      return { ...ref, converted: null };
    }
    return { ...ref, converted: ref.quantity * conversion };
  });

  // 查找匹配
  const threshold = 0.1; // 10% 容差
  for (const ref of convertedRefs) {
    if (ref.converted !== null) {
      const deviation = Math.abs(targetQuantity - ref.converted) / ref.converted;
      if (deviation <= threshold) {
        return {
          consistent: true,
          matched_reference: ref,
          converted_quantity: ref.converted,
          deviation_percent: deviation * 100,
          score: 1.0 - deviation
        };
      }
    }
  }

  return {
    consistent: false,
    score: 0.0
  };
}
```

---

## 5. 规则定义格式

```typescript
interface RuleDefinition {
  id: string;                       // 规则 ID (M1-001 ~ M1-009)
  name: string;                      // 规则名称
  type: string;                       // 规则类型
  priority: number;                    // 优先级 (1-10)
  confidence_weight: number;             // 置信度权重 (0-1)
  condition: string;                   // 规则条件（表达式）
  handler: (input: any) => Promise<RuleResult>;
}

interface RuleResult {
  matched: boolean;
  score: number;                      // 0-1
  details?: any;
}
```

---

## 6. 评分机制

```typescript
function calculateOverallScore(ruleResults: RuleResult[]): number {
  if (ruleResults.length === 0) return 0;

  let totalWeight = 0;
  let weightedScore = 0;

  for (const result of ruleResults) {
    const rule = getRuleById(result.rule_id);
    totalWeight += rule.confidence_weight;
    weightedScore += result.score * rule.confidence_weight;
  }

  return weightedScore / totalWeight;
}
```

---

## 7. 错误码定义

| 错误码 | 说明 | 处理建议 |
|-------|------|---------|
| M1-001 | 规则不存在 | 检查规则 ID |
| M1-002 | 输入数据格式错误 | 检查输入格式 |
| M1-003 | 汇率转换失败 | 提供汇率数据 |

---

*版本: 1.0.0 | 更新日期: 2026-02-15*
