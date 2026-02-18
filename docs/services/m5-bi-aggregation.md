# M5 - BI 指标聚合服务

## 1. 服务概述

M5 BI 指标聚合服务负责对证据数据进行统计分析和指标计算，支持交易统计、时间分布分析和风险指标计算。

**技术栈**: ClickHouse + Druid + 数据分析

---

## 2. 服务接口定义

```typescript
interface M5_AggregationRequest {
  case_id: UUID;
  operation: AggregationOperation;
  input_data: AggregationInput;
  filters?: AggregationFilter;
}

type AggregationOperation =
  | 'transaction_statistics'
  | 'time_distribution'
  | 'risk_metrics'
  | 'entity_statistics'
  | 'pattern_analysis';

interface M5_AggregationResponse {
  code: number;
  message: string;
  data: {
    case_id: UUID;
    operation: AggregationOperation;
    aggregation_result: AggregationResult;
    metadata: AggregationMetadata;
  };
}

interface AggregationMetadata {
  data_points: number;
  time_range: { start: string; end: string };
  aggregation_time_ms: number;
  query_id: UUID;
}
```

---

## 3. 核心类设计

```typescript
class M5_AggregationService {
  private clickhouse: ClickHouseClient;
  private druid: DruidClient;

  constructor(config: AggregationConfig) {
    this.clickhouse = new ClickHouseClient(config.clickhouse);
    this.druid = new DruidClient(config.druid);
  }

  async execute(request: M5_AggregationRequest): Promise<M5_AggregationResponse> {
    const startTime = Date.now();
    const queryId = generateUUID();

    let result: AggregationResult;

    switch (request.operation) {
      case 'transaction_statistics':
        result = await this.calculateTransactionStatistics(request);
        break;
      case 'time_distribution':
        result = await this.calculateTimeDistribution(request);
        break;
      case 'risk_metrics':
        result = await this.calculateRiskMetrics(request);
        break;
      case 'entity_statistics':
        result = await this.calculateEntityStatistics(request);
        break;
      case 'pattern_analysis':
        result = await this.analyzePatterns(request);
        break;
      default:
        throw new Error(`Unknown operation: ${request.operation}`);
    }

    const processingTime = Date.now() - startTime;

    return {
      code: 0,
      message: 'success',
      data: {
        case_id: request.case_id,
        operation: request.operation,
        aggregation_result: result,
        metadata: {
          data_points: result.data_point_count || 0,
          time_range: result.time_range,
          aggregation_time_ms: processingTime,
          query_id
        }
      }
    };
  }
}
```

---

## 4. 子能力详细设计

### 4.1 交易统计

```typescript
interface TransactionStatisticsInput {
  case_id: UUID;
  entity_ids?: UUID[];            // 筛选实体
  time_range?: { start: string; end: string };
  group_by?: string[];              // 分组字段（currency, entity_type, etc.）
  metrics?: string[];               // 计算指标（sum, avg, count, etc.）
}

interface TransactionStatisticsOutput {
  summary: TransactionSummary;
  by_currency: Record<string, CurrencyStats>;
  by_entity_type: Record<string, EntityTypeStats>;
  by_time_period: TimePeriodStats[];
  trends: TrendAnalysis;
}

interface TransactionSummary {
  total_transactions: number;
  total_amount: number;
  total_amount_by_currency: Record<string, number>;
  average_amount: number;
  median_amount: number;
  min_amount: number;
  max_amount: number;
  std_deviation: number;
}

interface CurrencyStats {
  transaction_count: number;
  total_amount: number;
  average_amount: number;
}

interface EntityTypeStats {
  entity_type: string;
  transaction_count: number;
  total_amount: number;
}

interface TimePeriodStats {
  period: 'hour' | 'day' | 'week' | 'month';
  period_value: string;
  transaction_count: number;
  total_amount: number;
}

async function calculateTransactionStatistics(
  input: TransactionStatisticsInput
): Promise<TransactionStatisticsOutput> {
  // 构建 ClickHouse 查询
  const query = `
    SELECT
      COUNT() as total_transactions,
      SUM(amount) as total_amount,
      AVG(amount) as average_amount,
      MEDIAN(amount) as median_amount,
      MIN(amount) as min_amount,
      MAX(amount) as max_amount,
      STDDEV_SAMP(amount) as std_deviation
    FROM transactions
    WHERE case_id = ${input.case_id}
      ${buildTimeFilter(input.time_range)}
      ${buildEntityFilter(input.entity_ids)}
  `;

  const summary = await clickhouse.query(query);

  // 按币种分组统计
  const currencyQuery = `
    SELECT
      currency,
      COUNT() as transaction_count,
      SUM(amount) as total_amount,
      AVG(amount) as average_amount
    FROM transactions
    WHERE case_id = ${input.case_id}
      ${buildTimeFilter(input.time_range)}
    GROUP BY currency
  `;

  const byCurrency = await clickhouse.query(currencyQuery);

  // 按实体类型分组统计
  const entityQuery = `
    SELECT
      entity_type,
      COUNT() as transaction_count,
      SUM(amount) as total_amount
    FROM transactions
    WHERE case_id = ${input.case_id}
      ${buildTimeFilter(input.time_range)}
    GROUP BY entity_type
  `;

  const byEntityType = await clickhouse.query(entityQuery);

  // 时间分布分析
  const timeDistribution = await analyzeTimeDistribution(input.case_id, input.time_range);

  // 趋势分析
  const trends = await analyzeTrends(input.case_id);

  return {
    summary,
    by_currency: byCurrency,
    by_entity_type: byEntityType,
    by_time_period: timeDistribution.periods,
    trends
  };
}
```

### 4.2 时间分布分析

```typescript
interface TimeDistributionInput {
  case_id: UUID;
  time_range?: { start: string; end: string };
  granularity?: 'hour' | 'day' | 'week' | 'month';
}

interface TimeDistributionOutput {
  periods: TimePeriodData[];
  patterns: TemporalPattern[];
  anomalies: TimeAnomaly[];
}

interface TimePeriodData {
  period_type: string;              // 'hour' | 'day' | 'week' | 'month'
  period_value: string;             // 如 '2023-01', '2023-01-01'
  metrics: PeriodMetrics;
}

interface PeriodMetrics {
  transaction_count: number;
  total_amount: number;
  average_amount: number;
  entity_count: number;
}

interface TemporalPattern {
  pattern_type: string;              // 'seasonal' | 'weekly' | 'daily'
  description: string;
  periods: string[];
  avg_transaction_count: number;
  avg_amount: number;
  strength: number;                 // 模式强度
}

interface TimeAnomaly {
  anomaly_type: string;              // 'spike' | 'dip' | 'gap'
  timestamp: string;
  value: number;
  expected_value: number;
  deviation_percent: number;
}

async function calculateTimeDistribution(
  input: TimeDistributionInput
): Promise<TimeDistributionOutput> {
  const granularity = input.granularity || 'day';

  // 按时间粒度分组统计
  const timeGroupQuery = `
    SELECT
      ${granularity} as period_value,
      COUNT() as transaction_count,
      SUM(amount) as total_amount,
      AVG(amount) as average_amount,
      COUNT(DISTINCT entity_id) as entity_count
    FROM transactions
    WHERE case_id = ${input.case_id}
      ${buildTimeFilter(input.time_range)}
    GROUP BY ${granularity}
    ORDER BY period_value ASC
  `;

  const periods = await clickhouse.query(timeGroupQuery);

  // 识别时间模式
  const patterns = await detectTemporalPatterns(input.case_id, granularity);

  // 识别时间异常
  const anomalies = await detectTimeAnomalies(input.case_id, periods);

  return {
    periods,
    patterns,
    anomalies
  };
}

async function detectTemporalPatterns(
  caseId: UUID,
  granularity: string
): Promise<TemporalPattern[]> {
  const patterns: TemporalPattern[] = [];

  // 季节性模式（如果按月分组）
  if (granularity === 'month') {
    const seasonalQuery = `
      SELECT
        MONTH(timestamp) as month,
        COUNT() as transaction_count,
        AVG(amount) as avg_amount
      FROM transactions
      WHERE case_id = ${caseId}
      GROUP BY MONTH(timestamp)
    `;

    const monthlyData = await clickhouse.query(seasonalQuery);

    // 找出季节性峰值
    const avgCount = monthlyData.reduce((sum, d) => sum + d.transaction_count, 0) / monthlyData.length;
    const peakMonths = monthlyData.filter(d => d.transaction_count > avgCount * 1.2);

    if (peakMonths.length > 0) {
      patterns.push({
        pattern_type: 'seasonal',
        description: `交易高峰期: ${peakMonths.map(m => m.month).join(', ')}`,
        periods: peakMonths.map(m => `month_${m.month}`),
        avg_transaction_count: avgCount,
        avg_amount: monthlyData.reduce((sum, d) => sum + d.avg_amount, 0) / monthlyData.length,
        strength: 0.7
      });
    }
  }

  // 周期性模式（按星期几）
  if (granularity === 'day') {
    const weeklyQuery = `
      SELECT
        DAYOFWEEK(timestamp) as day_of_week,
        COUNT() as transaction_count,
        AVG(amount) as avg_amount
      FROM transactions
      WHERE case_id = ${caseId}
      GROUP BY DAYOFWEEK(timestamp)
    `;

    const weeklyData = await clickhouse.query(weeklyQuery);

    const avgCount = weeklyData.reduce((sum, d) => sum + d.transaction_count, 0) / weeklyData.length;
    const peakDays = weeklyData.filter(d => d.transaction_count > avgCount * 1.2);

    if (peakDays.length > 0) {
      patterns.push({
        pattern_type: 'weekly',
        description: `交易日: ${peakDays.map(d => `周${d.day_of_week}`).join(', ')}`,
        periods: peakDays.map(d => `day_${d.day_of_week}`),
        avg_transaction_count: avgCount,
        avg_amount: weeklyData.reduce((sum, d) => sum + d.avg_amount, 0) / weeklyData.length,
        strength: 0.8
      });
    }
  }

  return patterns;
}
```

### 4.3 风险指标计算

```typescript
interface RiskMetricsInput {
  case_id: UUID;
  entity_id?: UUID;
  time_range?: { start: string; end: string };
  metrics?: RiskMetricType[];
}

type RiskMetricType =
  | 'amount_outliers'
  | 'frequency_anomalies'
  | 'velocity_risk'
  | 'concentration_risk'
  | 'connection_risk';

interface RiskMetricsOutput {
  overall_risk_score: number;         // 0-1
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_factors: RiskFactor[];
  high_risk_entities: HighRiskEntity[];
  risk_timeline: RiskTimelinePoint[];
}

interface RiskFactor {
  metric_type: RiskMetricType;
  value: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  weight: number;                    // 在总风险中的权重
  description: string;
}

interface HighRiskEntity {
  entity_id: UUID;
  entity_type: EntityType;
  risk_score: number;
  risk_factors: RiskMetricType[];
}

interface RiskTimelinePoint {
  timestamp: string;
  risk_score: number;
  risk_level: string;
}

async function calculateRiskMetrics(input: RiskMetricsInput): Promise<RiskMetricsOutput> {
  const metrics = input.metrics || [
    'amount_outliers',
    'frequency_anomalies',
    'velocity_risk',
    'concentration_risk',
    'connection_risk'
  ];

  const riskFactors: RiskFactor[] = [];

  // 1. 金额异常检测
  const amountOutlierScore = await detectAmountOutliers(input.case_id);
  riskFactors.push({
    metric_type: 'amount_outliers',
    value: amountOutlierScore,
    threshold: 0.1,
    severity: determineSeverity(amountOutlierScore),
    weight: 0.3,
    description: '交易金额异常'
  });

  // 2. 频率异常检测
  const frequencyScore = await detectFrequencyAnomalies(input.case_id);
  riskFactors.push({
    metric_type: 'frequency_anomalies',
    value: frequencyScore,
    threshold: 0.15,
    severity: determineSeverity(frequencyScore),
    weight: 0.2,
    description: '交易频率异常'
  });

  // 3. 速度风险检测
  const velocityScore = await detectVelocityRisk(input.case_id);
  riskFactors.push({
    metric_type: 'velocity_risk',
    value: velocityScore,
    threshold: 0.1,
    severity: determineSeverity(velocityScore),
    weight: 0.2,
    description: '交易速度风险'
  });

  // 4. 集中度风险
  const concentrationScore = await detectConcentrationRisk(input.case_id);
  riskFactors.push({
    metric_type: 'concentration_risk',
    value: concentrationScore,
    threshold: 0.2,
    severity: determineSeverity(concentrationScore),
    weight: 0.15,
    description: '交易集中度风险'
  });

  // 5. 关联风险
  const connectionScore = await detectConnectionRisk(input.case_id);
  riskFactors.push({
    metric_type: 'connection_risk',
    value: connectionScore,
    threshold: 0.15,
    severity: determineSeverity(connectionScore),
    weight: 0.15,
    description: '实体关联风险'
  });

  // 计算整体风险分数
  const overallRiskScore = riskFactors.reduce(
    (sum, factor) => sum + factor.value * factor.weight,
    0
  );

  const riskLevel = determineRiskLevel(overallRiskScore);

  // 识别高风险实体
  const highRiskEntities = await identifyHighRiskEntities(input.case_id, riskFactors);

  // 风险时间线
  const riskTimeline = await calculateRiskTimeline(input.case_id);

  return {
    overall_risk_score: overallRiskScore,
    risk_level: riskLevel,
    risk_factors: riskFactors,
    high_risk_entities,
    risk_timeline: riskTimeline
  };
}

async function detectAmountOutliers(caseId: UUID): Promise<number> {
  const query = `
    SELECT
      COUNT() as total_count,
      AVG(amount) as avg_amount,
      STDDEV_SAMP(amount) as std_dev
    FROM transactions
    WHERE case_id = ${caseId}
  `;

  const stats = await clickhouse.queryOne(query);

  const upperThreshold = stats.avg_amount + 3 * stats.std_dev;
  const lowerThreshold = stats.avg_amount - 3 * stats.std_dev;

  const outlierQuery = `
    SELECT COUNT() as outlier_count
    FROM transactions
    WHERE case_id = ${caseId}
      AND (amount > ${upperThreshold} OR amount < ${lowerThreshold})
  `;

  const outlierStats = await clickhouse.queryOne(outlierQuery);

  return outlierStats.outlier_count / stats.total_count;
}

async function detectVelocityRisk(caseId: UUID): Promise<number> {
  // 检测短时间内大量交易
  const velocityQuery = `
    SELECT
      entity_id,
      COUNT() as hourly_count,
      SUM(amount) as hourly_amount
    FROM transactions
    WHERE case_id = ${caseId}
    GROUP BY
      entity_id,
      toStartOfHour(timestamp)
    HAVING hourly_count > 5 OR hourly_amount > 100000
  `;

  const velocityRisk = await clickhouse.query(velocityQuery);

  return Math.min(1.0, velocityRisk.length / 10);
}
```

### 4.4 实体统计

```typescript
interface EntityStatisticsInput {
  case_id: UUID;
  entity_type?: EntityType;
  time_range?: { start: string; end: string };
}

interface EntityStatisticsOutput {
  total_entities: number;
  by_type: Record<string, EntityTypeStats>;
  top_entities: TopEntity[];
  entity_relations: EntityRelationStats;
  entity_activity: EntityActivityStats;
}

interface EntityTypeStats {
  entity_type: string;
  count: number;
  transaction_count: number;
  total_amount: number;
}

interface TopEntity {
  entity_id: UUID;
  entity_type: EntityType;
  name: string;
  transaction_count: number;
  total_amount: number;
  rank: number;
}

interface EntityRelationStats {
  avg_relations_per_entity: number;
  max_relations: number;
  relation_type_distribution: Record<string, number>;
}

interface EntityActivityStats {
  active_entities: number;
  inactive_entities: number;
  avg_activity_days: number;
  most_active_time_range: string;
}

async function calculateEntityStatistics(
  input: EntityStatisticsInput
): Promise<EntityStatisticsOutput> {
  // 总体实体统计
  const totalQuery = `
    SELECT
      entity_type,
      COUNT(DISTINCT entity_id) as count,
      COUNT(DISTINCT transaction_id) as transaction_count,
      SUM(amount) as total_amount
    FROM entities e
    LEFT JOIN transactions t ON e.entity_id = t.entity_id
    WHERE e.case_id = ${input.case_id}
      ${buildEntityFilter(input.entity_type)}
    GROUP BY entity_type
  `;

  const byType = await clickhouse.query(totalQuery);
  const totalEntities = Object.values(byType).reduce((sum, t) => sum + t.count, 0);

  // Top 实体（按交易量排序）
  const topQuery = `
    SELECT
      e.entity_id,
      e.entity_type,
      e.name,
      COUNT(t.id) as transaction_count,
      COALESCE(SUM(t.amount), 0) as total_amount
    FROM entities e
    LEFT JOIN transactions t ON e.entity_id = t.entity_id
    WHERE e.case_id = ${input.case_id}
    GROUP BY e.entity_id, e.entity_type, e.name
    ORDER BY transaction_count DESC
    LIMIT 20
  `;

  const topEntities = await clickhouse.query(topQuery);

  // 实体关系统计
  const relationStats = await calculateEntityRelationStats(input.case_id);

  // 实体活跃度统计
  const activityStats = await calculateEntityActivityStats(input.case_id);

  return {
    total_entities: totalEntities,
    by_type,
    top_entities,
    entity_relations: relationStats,
    entity_activity: activityStats
  };
}
```

### 4.5 模式分析

```typescript
interface PatternAnalysisInput {
  case_id: UUID;
  pattern_types?: PatternType[];
  time_range?: { start: string; end: string };
}

type PatternType =
  | 'transaction_pattern'
  | 'entity_network'
  | 'geographic_pattern'
  | 'temporal_pattern'
  | 'amount_pattern';

interface PatternAnalysisOutput {
  patterns: DetectedPattern[];
  pattern_clusters: PatternCluster[];
  anomaly_patterns: AnomalyPattern[];
}

interface DetectedPattern {
  pattern_id: UUID;
  pattern_type: PatternType;
  description: string;
  support: number;                 // 支持度（出现次数）
  confidence: number;              // 置信度
  instances: PatternInstance[];
}

interface PatternInstance {
  instance_id: UUID;
  timestamp: string;
  entities: UUID[];
  attributes: Record<string, any>;
}

interface PatternCluster {
  cluster_id: UUID;
  pattern_type: PatternType;
  cluster_size: number;
  common_attributes: Record<string, any>;
  central_entities: UUID[];
}

async function analyzePatterns(input: PatternAnalysisInput): Promise<PatternAnalysisOutput> {
  const patternTypes = input.pattern_types || [
    'transaction_pattern',
    'entity_network',
    'temporal_pattern'
  ];

  const patterns: DetectedPattern[] = [];

  // 分析交易模式
  if (patternTypes.includes('transaction_pattern')) {
    const transactionPatterns = await analyzeTransactionPatterns(input.case_id);
    patterns.push(...transactionPatterns);
  }

  // 分析实体网络模式
  if (patternTypes.includes('entity_network')) {
    const networkPatterns = await analyzeEntityNetworkPatterns(input.case_id);
    patterns.push(...networkPatterns);
  }

  // 分析时间模式
  if (patternTypes.includes('temporal_pattern')) {
    const temporalPatterns = await analyzeTemporalPatterns(input.case_id);
    patterns.push(...temporalPatterns);
  }

  // 模式聚类
  const clusters = await clusterPatterns(patterns);

  // 异常模式检测
  const anomalyPatterns = await detectAnomalyPatterns(patterns, clusters);

  return {
    patterns,
    pattern_clusters: clusters,
    anomaly_patterns: anomalyPatterns
  };
}

async function analyzeTransactionPatterns(caseId: UUID): Promise<DetectedPattern[]> {
  // 使用频繁模式挖掘算法
  const patterns: DetectedPattern[] = [];

  // 模式 1: 固定金额交易
  const fixedAmountQuery = `
    SELECT
      amount,
      COUNT() as frequency,
      COUNT(DISTINCT entity_id) as distinct_entities,
      COUNT(DISTINCT DATE(timestamp)) as distinct_days
    FROM transactions
    WHERE case_id = ${caseId}
    GROUP BY amount
    HAVING frequency >= 3
    ORDER BY frequency DESC
  `;

  const fixedAmountPatterns = await clickhouse.query(fixedAmountQuery);

  for (const pattern of fixedAmountPatterns) {
    if (pattern.distinct_days >= 3) {
      patterns.push({
        pattern_id: generateUUID(),
        pattern_type: 'transaction_pattern',
        description: `固定金额交易模式: ${pattern.amount}`,
        support: pattern.frequency,
        confidence: calculatePatternConfidence(pattern),
        instances: []
      });
    }
  }

  // 模式 2: 固定实体组合
  const entityComboQuery = `
    SELECT
      arrayJoin(arrayMap(arraySort(groupUniqArray(groupArray(entity_ids)), 'x', x.1)), ', ') as entity_combo,
      COUNT() as frequency
    FROM transactions
    WHERE case_id = ${caseId}
      AND length(entity_ids) >= 2
    GROUP BY entity_combo
    HAVING frequency >= 3
    ORDER BY frequency DESC
  `;

  const entityComboPatterns = await clickhouse.query(entityComboQuery);

  for (const pattern of entityComboPatterns) {
    patterns.push({
      pattern_id: generateUUID(),
      pattern_type: 'transaction_pattern',
      description: `实体组合模式: ${pattern.entity_combo}`,
      support: pattern.frequency,
      confidence: calculatePatternConfidence(pattern),
      instances: []
    });
  }

  return patterns;
}
```

---

## 5. 错误码定义

| 错误码 | 说明 | 处理建议 |
|-------|------|---------|
| M5-001 | 查询超时 | 增加超时时间 |
| M5-002 | 数据量过大 | 减少时间范围 |
| M5-003 | 聚合失败 | 检查输入数据 |

---

*版本: 1.0.0 | 更新日期: 2026-02-15*
