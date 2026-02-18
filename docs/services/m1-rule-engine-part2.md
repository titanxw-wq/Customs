# M1 - 规则引擎与评分服务 (规则 6-9)

## 1. 规则 6-9 概述

本部分涵盖 M1 规则引擎的后 4 个子能力，专注于物流路径、票据凭证、跨源一致性和异常模式检测。

---

## 2. 规则 6-9 详细设计

### 2.1 规则 M1-006: 物流路径规则

```typescript
interface LogisticsPathInput {
  route: RouteSegment[];
  reference_patterns?: LogisticsPattern[];
  time_constraints?: {
    max_duration_hours?: number;
    min_transit_time_hours?: number;
  };
}

interface RouteSegment {
  origin: Location;
  destination: Location;
  transport_method: string;        // 运输方式（航空、海运、陆运等）
  departure_time: string;
  arrival_time: string;
  carrier?: string;               // 承运商
}

interface LogisticsOutput {
  path_valid: boolean;
  violations: PathViolation[];
  risk_score: number;              // 风险分数 (0-1)
  score: number;
}

interface PathViolation {
  segment_index: number;
  violation_type: 'invalid_route' | 'time_constraint' | 'carrier_mismatch' | 'unsupported_transport';
  description: string;
  severity: 'error' | 'warning' | 'info';
}

async function validateLogisticsPath(input: LogisticsPathInput): Promise<LogisticsOutput> {
  const violations: PathViolation[] = [];

  // 检查路径有效性
  for (let i = 0; i < input.route.length; i++) {
    const segment = input.route[i];

    // 检查运输方式
    if (!isSupportedTransportMethod(segment.transport_method)) {
      violations.push({
        segment_index: i,
        violation_type: 'unsupported_transport',
        description: `Unsupported transport method: ${segment.transport_method}`,
        severity: 'warning'
      });
    }

    // 检查时间约束
    if (input.time_constraints) {
      const duration = calculateDuration(segment.departure_time, segment.arrival_time);

      if (input.time_constraints.max_duration_hours &&
          duration > input.time_constraints.max_duration_hours) {
        violations.push({
          segment_index: i,
          violation_type: 'time_constraint',
          description: `Segment duration exceeds maximum: ${duration}h`,
          severity: 'error'
        });
      }
    }
  }

  // 检查路径连续性
  for (let i = 0; i < input.route.length - 1; i++) {
    const currentDest = input.route[i].destination;
    const nextOrigin = input.route[i + 1].origin;

    if (!isSameLocation(currentDest, nextOrigin)) {
      violations.push({
        segment_index: i,
        violation_type: 'invalid_route',
        description: 'Route segments are not connected',
        severity: 'error'
      });
    }
  }

  // 检查参考模式
  if (input.reference_patterns) {
    const routeMatches = input.reference_patterns.filter(pattern =>
      matchesPattern(input.route, pattern)
    );

    if (routeMatches.length === 0) {
      violations.push({
        segment_index: -1,
        violation_type: 'invalid_route',
        description: 'Route does not match any known pattern',
        severity: 'warning'
      });
    }
  }

  // 计算风险分数
  const riskScore = calculatePathRiskScore(input.route, violations);

  return {
    path_valid: violations.filter(v => v.severity === 'error').length === 0,
    violations,
    risk_score: riskScore,
    score: 1.0 - riskScore
  };
}
```

### 2.2 规则 M1-007: 票据凭证规则

```typescript
interface VoucherInput {
  voucher_type: string;             // 票据类型（发票、提单、装箱单等）
  voucher_data: VoucherData;
  reference_documents: DocumentData[];
  required_fields?: string[];
}

interface VoucherData {
  voucher_number: string;
  date: string;
  amount?: number;
  currency?: string;
  issuer?: string;
  receiver?: string;
  items?: VoucherItem[];
}

interface DocumentData {
  document_id: UUID;
  document_type: string;
  content: string;
  metadata?: Record<string, any>;
}

interface VoucherOutput {
  voucher_valid: boolean;
  missing_fields: string[];
  invalid_fields: InvalidField[];
  consistency_score: number;
  score: number;
}

interface InvalidField {
  field_name: string;
  invalid_reason: string;
  expected_value?: any;
  severity: 'error' | 'warning';
}

async function validateVoucher(input: VoucherInput): Promise<VoucherOutput> {
  const missingFields: string[] = [];
  const invalidFields: InvalidField[] = [];

  // 检查必填字段
  const requiredFields = input.required_fields || getDefaultRequiredFields(input.voucher_type);
  for (const field of requiredFields) {
    if (!(field in input.voucher_data)) {
      missingFields.push(field);
    }
  }

  // 检查字段有效性
  if (input.voucher_data.voucher_number) {
    if (!isValidVoucherNumber(input.voucher_data.voucher_number, input.voucher_type)) {
      invalidFields.push({
        field_name: 'voucher_number',
        invalid_reason: 'Invalid format for voucher type',
        severity: 'error'
      });
    }
  }

  if (input.voucher_data.date) {
    const voucherDate = new Date(input.voucher_data.date);
    const now = new Date();
    if (voucherDate > now) {
      invalidFields.push({
        field_name: 'date',
        invalid_reason: 'Voucher date cannot be in the future',
        severity: 'error'
      });
    }
  }

  // 跨文档一致性检查
  if (input.reference_documents.length > 0) {
    const consistencyViolations = await checkCrossDocumentConsistency(
      input.voucher_data,
      input.reference_documents
    );
    invalidFields.push(...consistencyViolations);
  }

  // 计算一致性分数
  const consistencyScore = calculateConsistencyScore(
    missingFields.length,
    invalidFields.length,
    requiredFields.length
  );

  return {
    voucher_valid: missingFields.length === 0 &&
                     invalidFields.filter(f => f.severity === 'error').length === 0,
    missing_fields: missingFields,
    invalid_fields: invalidFields,
    consistency_score: consistencyScore,
    score: consistencyScore
  };
}
```

### 2.3 规则 M1-008: 跨源一致性校验

```typescript
interface CrossSourceInput {
  entity_id: UUID;
  entity_type: EntityType;
  source_records: SourceRecord[];
  comparison_fields: string[];
}

interface SourceRecord {
  source_id: string;
  source_type: string;              // 数据源类型（IM、PDF、Excel 等）
  data: Record<string, any>;
  confidence: number;
}

interface CrossSourceOutput {
  consistent: boolean;
  conflicts: SourceConflict[];
  consensus_data: ConsensusData;
  score: number;
}

interface SourceConflict {
  field_name: string;
  conflicting_values: Array<{ source: string; value: any; confidence: number }>;
  recommended_value: any;
  confidence: number;
}

interface ConsensusData {
  entity_id: UUID;
  consensus_fields: Record<string, ConsensusField>;
}

interface ConsensusField {
  field_name: string;
  value: any;
  confidence: number;
  sources_agreeing: string[];
}

async function validateCrossSourceConsistency(input: CrossSourceInput): Promise<CrossSourceOutput> {
  const conflicts: SourceConflict[] = [];
  const consensusFields: Record<string, ConsensusField> = {};

  // 检查每个比较字段
  for (const fieldName of input.comparison_fields) {
    const fieldValues = input.source_records
      .filter(r => fieldName in r.data)
      .map(r => ({
        source: r.source_id,
        value: r.data[fieldName],
        confidence: r.confidence
      }));

    if (fieldValues.length === 0) continue;

    // 检查值一致性
    const uniqueValues = new Set(fieldValues.map(v => JSON.stringify(v.value)));
    const isConsistent = uniqueValues.size === 1;

    if (!isConsistent) {
      // 计算推荐值（加权平均，基于置信度）
      const weightedValue = calculateWeightedAverage(fieldValues);

      conflicts.push({
        field_name: fieldName,
        conflicting_values: fieldValues,
        recommended_value: weightedValue,
        confidence: calculateConfidenceScore(fieldValues)
      });
    }

    // 记录共识数据
    consensusFields[fieldName] = {
      field_name: fieldName,
      value: isConsistent ? fieldValues[0].value : calculateWeightedAverage(fieldValues),
      confidence: calculateConfidenceScore(fieldValues),
      sources_agreeing: fieldValues.filter(v =>
        JSON.stringify(v.value) === JSON.stringify(fieldValues[0].value)
      ).map(v => v.source)
    };
  }

  // 计算整体一致性
  const totalFields = input.comparison_fields.length;
  const consistentFields = totalFields - conflicts.length;
  const consistencyScore = consistentFields / totalFields;

  return {
    consistent: conflicts.length === 0,
    conflicts,
    consensus_data: {
      entity_id: input.entity_id,
      consensus_fields: consensusFields
    },
    score: consistencyScore
  };
}

function calculateWeightedAverage(values: Array<{ value: any; confidence: number }>): any {
  const totalWeight = values.reduce((sum, v) => sum + v.confidence, 0);
  const weightedSum = values.reduce((sum, v) => {
    // 对于数值类型，使用加权平均
    if (typeof v.value === 'number') {
      return sum + v.value * v.confidence;
    }
    // 对于其他类型，返回最高置信度的值
    if (v.confidence === Math.max(...values.map(vv => vv.confidence))) {
      return sum + v.value;
    }
    return sum;
  }, 0);

  if (values.every(v => typeof v.value === 'number')) {
    return weightedSum / totalWeight;
  }

  return values.reduce((best, current) =>
    current.confidence > best.confidence ? current : best
  ).value;
}
```

### 2.4 规则 M1-009: 异常模式检测

```typescript
interface AnomalyDetectionInput {
  data_points: Array<{ timestamp: string; value: number }>;
  detection_method?: 'statistical' | 'isolation_forest' | 'time_series';
  threshold?: number;               // 异常阈值
  window_size?: number;             // 时间窗口大小
}

interface AnomalyOutput {
  anomalies: Anomaly[];
  anomaly_count: number;
  anomaly_rate: number;            // 异常率
  score: number;                   // 正常性分数 (0-1)
}

interface Anomaly {
  index: number;
  timestamp: string;
  value: number;
  anomaly_type: 'high' | 'low' | 'spike' | 'dip';
  score: number;                    // 异常分数
  confidence: number;
}

async function detectAnomalies(input: AnomalyDetectionInput): Promise<AnomalyOutput> {
  const method = input.detection_method || 'statistical';
  const threshold = input.threshold || 3; // 默认 3σ

  let anomalies: Anomaly[];

  switch (method) {
    case 'statistical':
      anomalies = detectStatisticalAnomalies(input.data_points, threshold);
      break;
    case 'time_series':
      anomalies = detectTimeSeriesAnomalies(input.data_points, threshold, input.window_size);
      break;
    case 'isolation_forest':
      anomalies = await detectIsolationForestAnomalies(input.data_points);
      break;
  }

  const anomalyRate = anomalies.length / input.data_points.length;
  const normalityScore = 1.0 - anomalyRate;

  return {
    anomalies,
    anomaly_count: anomalies.length,
    anomaly_rate: anomalyRate,
    score: normalityScore
  };
}

function detectStatisticalAnomalies(
  dataPoints: Array<{ timestamp: string; value: number }>,
  threshold: number
): Anomaly[] {
  const values = dataPoints.map(d => d.value);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const std = Math.sqrt(
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  );
  const upperBound = mean + threshold * std;
  const lowerBound = mean - threshold * std;

  const anomalies: Anomaly[] = [];
  for (let i = 0; i < dataPoints.length; i++) {
    const point = dataPoints[i];
    if (point.value > upperBound) {
      anomalies.push({
        index: i,
        timestamp: point.timestamp,
        value: point.value,
        anomaly_type: 'high',
        score: (point.value - upperBound) / std,
        confidence: 0.8
      });
    } else if (point.value < lowerBound) {
      anomalies.push({
        index: i,
        timestamp: point.timestamp,
        value: point.value,
        anomaly_type: 'low',
        score: (lowerBound - point.value) / std,
        confidence: 0.8
      });
    }
  }

  return anomalies;
}

function detectTimeSeriesAnomalies(
  dataPoints: Array<{ timestamp: string; value: number }>,
  threshold: number,
  windowSize?: number
): Anomaly[] {
  const window = windowSize || 7; // 默认 7 天窗口
  const anomalies: Anomaly[] = [];

  // 使用移动平均和标准差
  for (let i = windowSize; i < dataPoints.length; i++) {
    const windowValues = dataPoints.slice(i - windowSize, i).map(d => d.value);
    const mean = windowValues.reduce((sum, v) => sum + v, 0) / windowSize;
    const std = Math.sqrt(
      windowValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / windowSize
    );

    const point = dataPoints[i];
    const zScore = (point.value - mean) / std;

    if (Math.abs(zScore) > threshold) {
      anomalies.push({
        index: i,
        timestamp: point.timestamp,
        value: point.value,
        anomaly_type: zScore > 0 ? 'high' : 'low',
        score: Math.abs(zScore) / threshold,
        confidence: 0.75
      });
    }
  }

  return anomalies;
}
```

---

## 3. 规则执行流程

```typescript
async function executeRulesPipeline(caseData: CaseData): Promise<RuleExecutionResult> {
  const results: RuleResult[] = [];

  // 1. 时间窗匹配
  const timeWindowResult = await matchTimeWindow(caseData.time_window_input);
  results.push({ rule_id: 'M1-001', ...timeWindowResult });

  // 2. 订单号匹配
  const orderIdResult = await matchOrderId(caseData.order_id_input);
  results.push({ rule_id: 'M1-002', ...orderIdResult });

  // 3. 人物归并
  const personMergeResult = await mergePerson(caseData.person_entities);
  results.push({ rule_id: 'M1-003', ...personMergeResult });

  // 4. 金额校验
  const amountResult = await validateAmount(caseData.amount_input);
  results.push({ rule_id: 'M1-004', ...amountResult });

  // 5. 数量校验
  const quantityResult = await validateQuantity(caseData.quantity_input);
  results.push({ rule_id: 'M1-005', ...quantityResult });

  // 6. 物流路径检查
  const logisticsResult = await validateLogisticsPath(caseData.logistics_input);
  results.push({ rule_id: 'M1-006', ...logisticsResult });

  // 7. 票据检查
  const voucherResult = await validateVoucher(caseData.voucher_input);
  results.push({ rule_id: 'M1-007', ...voucherResult });

  // 8. 跨源一致性
  const crossSourceResult = await validateCrossSourceConsistency(caseData.cross_source_input);
  results.push({ rule_id: 'M1-008', ...crossSourceResult });

  // 9. 异常检测
  const anomalyResult = await detectAnomalies(caseData.anomaly_input);
  results.push({ rule_id: 'M1-009', ...anomalyResult });

  // 计算总体分数
  const overallScore = calculateOverallScore(results);

  return {
    case_id: caseData.case_id,
    rule_results: results,
    overall_score: overallScore,
    passed_rules: results.filter(r => r.score > 0.5).length,
    failed_rules: results.filter(r => r.score <= 0.5).length
  };
}
```

---

## 4. 错误码定义

| 错误码 | 说明 | 处理建议 |
|-------|------|---------|
| M1-004 | 数据源不足 | 提供更多参考数据 |
| M1-005 | 时间戳格式错误 | 检查时间格式 |

---

*版本: 1.0.0 | 更新日期: 2026-02-15*
