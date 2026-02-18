# M3 - 图谱路径分析与链路生成

## 1. 服务概述

M3 图谱路径分析与链路生成服务负责在关系图谱中分析实体间的路径关系，识别团伙和上下游关系，包含 5 个子能力。

**技术栈**: Neo4j + 图算法 + NetworkX

---

## 2. 服务接口定义

```typescript
interface M3_GraphAnalysisRequest {
  case_id: UUID;
  operation: GraphAnalysisOperation;
  input_data: GraphAnalysisInput;
}

type GraphAnalysisOperation =
  | 'extract_event_chain'
  | 'calculate_relation_strength'
  | 'identify_upstream_downstream'
  | 'detect_gangs'
  | 'multi_round_conditional_update';

interface M3_GraphAnalysisResponse {
  code: number;
  message: string;
  data: {
    case_id: UUID;
    operation: GraphAnalysisOperation;
    result: any;
    confidence: number;
  };
}
```

---

## 3. 核心类设计

```typescript
class M3_GraphAnalysisService {
  private neo4j: Driver;
  private networkX: any;

  constructor(neo4jConfig: Neo4jConfig) {
    this.neo4j = neo4j.driver(neo4jConfig.uri, neo4jConfig.auth);
    this.networkX = NetworkX();
  }

  async execute(request: M3_GraphAnalysisRequest): Promise<M3_GraphAnalysisResponse> {
    const session = this.neo4j.session();

    try {
      switch (request.operation) {
        case 'extract_event_chain':
          return await this.extractEventChain(session, request.input_data);
        case 'calculate_relation_strength':
          return await this.calculateRelationStrength(session, request.input_data);
        case 'identify_upstream_downstream':
          return await this.identifyUpstreamDownstream(session, request.input_data);
        case 'detect_gangs':
          return await this.detectGangs(session, request.input_data);
        case 'multi_round_conditional_update':
          return await this.multiRoundConditionalUpdate(session, request.input_data);
        default:
          throw new Error(`Unknown operation: ${request.operation}`);
      }
    } finally {
      await session.close();
    }
  }

  private async extractEventChain(session, input: GraphAnalysisInput): Promise<M3_GraphAnalysisResponse> {
    const entityId = input.entity_id;
    const maxDepth = input.max_depth || 3;

    // 查找从实体出发的所有路径
    const cypher = `
      MATCH path = (start:Entity {id: $entity_id})-[:RELATED*1..${maxDepth}]-(end:Entity)
      RETURN path
      ORDER BY length(path) ASC
      LIMIT 100
    `;

    const result = await session.run(cypher, { entity_id: entityId });
    const paths = result.records.map(record => parsePath(record.get('path')));

    // 语义化路径
    const semanticChains = await this.semanticizePaths(paths);

    return {
      code: 0,
      message: 'success',
      data: {
        case_id: input.case_id,
        operation: 'extract_event_chain',
        result: {
          event_chains: semanticChains,
          path_count: paths.length
        },
        confidence: 0.8
      }
    };
  }
}
```

---

## 4. 子能力详细设计

### 4.1 子能力 1: 事件链语义抽取

```typescript
interface EventChainInput {
  entity_id: UUID;
  max_depth?: number;
  min_relation_weight?: number;
}

interface EventChain {
  chain_id: UUID;
  events: ChainEvent[];
  semantic_type: string;            // 'trade' | 'communication' | 'logistics' | 'financial'
  confidence: number;
}

interface ChainEvent {
  event_id: UUID;
  entity_id: UUID;
  event_type: string;
  timestamp?: string;
  attributes: Record<string, any>;
}

async function extractEventChain(input: EventChainInput): Promise<EventChain[]> {
  // 查找路径
  const paths = await findPaths(input.entity_id, input.max_depth || 3);

  // 语义化路径
  const semanticChains: EventChain[] = [];

  for (const path of paths) {
    const semanticType = await classifyPathType(path);
    const events: ChainEvent[] = [];

    for (let i = 0; i < path.nodes.length - 1; i++) {
      const relation = path.relations[i];
      events.push({
        event_id: generateUUID(),
        entity_id: path.nodes[i + 1].entity_id,
        event_type: relation.relation_type,
        timestamp: relation.attributes?.timestamp,
        attributes: relation.attributes
      });
    }

    semanticChains.push({
      chain_id: generateUUID(),
      events,
      semantic_type: semanticType,
      confidence: calculatePathConfidence(path)
    });
  }

  return semanticChains;
}

async function classifyPathType(path: GraphPath): Promise<string> {
  const relationTypes = path.relations.map(r => r.relation_type);

  // 统计关系类型
  const typeCount = relationTypes.reduce((counts, type) => {
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});

  // 确定主导类型
  const dominantType = Object.entries(typeCount)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  // 映射到语义类型
  const typeMapping = {
    'owns': 'trade',
    'payment_to': 'financial',
    'works_for': 'trade',
    'knows': 'communication',
    'supplied_to': 'logistics'
  };

  // 使用 LLM 进行语义分类
  const prompt = `
基于以下关系类型序列，判断事件链的语义类型:

关系序列: ${relationTypes.join(' -> ')}

可能的类型:
1. trade - 交易
2. communication - 通信
3. logistics - 物流
4. financial - 金融

返回格式:
{
  "semantic_type": "trade|communication|logistics|financial",
  "reasoning": "判断依据"
}
`;

  const response = await llmClient.complete(prompt);
  const llmResult = parseLLMResponse(response);

  return llmResult?.semantic_type || typeMapping[dominantType] || 'unknown';
}
```

### 4.2 子能力 2: 关系强度计算

```typescript
interface RelationStrengthInput {
  relation_id: UUID;
  include_attributes?: boolean;
}

interface RelationStrength {
  relation_id: UUID;
  base_strength: number;            // 基础强度 (0-1)
  weighted_strength: number;          // 加权强度
  strength_factors: StrengthFactor[];
}

interface StrengthFactor {
  factor_name: string;              // 因子名称
  factor_value: number;            // 因子值 (0-1)
  weight: number;                    // 权重
  contribution: number;            // 贡献值
}

async function calculateRelationStrength(input: RelationStrengthInput): Promise<RelationStrength> {
  // 获取关系信息
  const relation = await getRelation(input.relation_id);

  // 计算强度因子
  const factors: StrengthFactor[] = [];

  // 因子 1: 交互频率
  const interactionCount = await countInteractions(relation.source_id, relation.target_id);
  const freqScore = Math.min(1.0, interactionCount / 10);
  factors.push({
    factor_name: 'interaction_frequency',
    factor_value: freqScore,
    weight: 0.3,
    contribution: freqScore * 0.3
  });

  // 因子 2: 时间跨度
  const timeSpan = await calculateTimeSpan(relation);
  const timeScore = Math.max(0.0, 1.0 - (timeSpan / 365)); // 一年以上衰减
  factors.push({
    factor_name: 'time_span',
    factor_value: timeScore,
    weight: 0.2,
    contribution: timeScore * 0.2
  });

  // 因子 3: 证据数量
  const evidenceCount = await countEvidence(relation);
  const evidenceScore = Math.min(1.0, evidenceCount / 5);
  factors.push({
    factor_name: 'evidence_count',
    factor_value: evidenceScore,
    weight: 0.3,
    contribution: evidenceScore * 0.3
  });

  // 因子 4: 关系类型权重
  const typeWeights = {
    'owns': 0.9,
    'works_for': 0.8,
    'supplied_to': 0.7,
    'knows': 0.5,
    'related_to': 0.3
  };
  const typeScore = typeWeights[relation.relation_type] || 0.5;
  factors.push({
    factor_name: 'relation_type',
    factor_value: typeScore,
    weight: 0.2,
    contribution: typeScore * 0.2
  });

  // 计算加权强度
  const weightedStrength = factors.reduce((sum, f) => sum + f.contribution, 0);

  return {
    relation_id: input.relation_id,
    base_strength: weightedStrength,
    weighted_strength: weightedStrength,
    strength_factors: factors
  };
}
```

### 4.3 子能力 3: 上下游识别

```typescript
interface UpstreamDownstreamInput {
  entity_id: UUID;
  max_depth?: number;
  direction?: 'upstream' | 'downstream' | 'both';
}

interface UpstreamDownstream {
  entity_id: UUID;
  upstream: EntityNode[];
  downstream: EntityNode[];
  flow_graph: FlowGraph;
}

interface EntityNode {
  entity_id: UUID;
  entity_type: EntityType;
  distance: number;
  relationship_count: number;
}

interface FlowGraph {
  nodes: EntityNode[];
  edges: FlowEdge[];
}

interface FlowEdge {
  from: UUID;
  to: UUID;
  relation_type: string;
  weight: number;
}

async function identifyUpstreamDownstream(input: UpstreamDownstreamInput): Promise<UpstreamDownstream> {
  const maxDepth = input.max_depth || 3;
  const direction = input.direction || 'both';

  const upstream: EntityNode[] = [];
  const downstream: EntityNode[] = [];

  // 识别上游（入边）
  if (direction === 'upstream' || direction === 'both') {
    const upstreamQuery = `
      MATCH (target:Entity {id: $entity_id})
      MATCH (source:Entity)-[r:RELATED*1..${maxDepth}]->(target)
      RETURN DISTINCT source.id as entity_id,
             source.entity_type,
             length(r) as distance,
             count(r) as relationship_count
      ORDER BY distance ASC
    `;

    const result = await neo4j.run(upstreamQuery, { entity_id: input.entity_id });
    upstream.push(...result.records.map(record => ({
      entity_id: record.get('entity_id'),
      entity_type: record.get('entity_type'),
      distance: record.get('distance'),
      relationship_count: record.get('relationship_count')
    })));
  }

  // 识别下游（出边）
  if (direction === 'downstream' || direction === 'both') {
    const downstreamQuery = `
      MATCH (source:Entity {id: $entity_id})
      MATCH (source)-[r:RELATED*1..${maxDepth}]->(target:Entity)
      RETURN DISTINCT target.id as entity_id,
             target.entity_type,
             length(r) as distance,
             count(r) as relationship_count
      ORDER BY distance ASC
    `;

    const result = await neo4j.run(downstreamQuery, { entity_id: input.entity_id });
    downstream.push(...result.records.map(record => ({
      entity_id: record.get('entity_id'),
      entity_type: record.get('entity_type'),
      distance: record.get('distance'),
      relationship_count: record.get('relationship_count')
    })));
  }

  // 构建流图
  const flowGraph = buildFlowGraph(input.entity_id, upstream, downstream);

  return {
    entity_id: input.entity_id,
    upstream,
    downstream,
    flow_graph: flowGraph
  };
}

function buildFlowGraph(
  centerEntityId: UUID,
  upstream: EntityNode[],
  downstream: EntityNode[]
): FlowGraph {
  const nodes: EntityNode[] = [
    {
      entity_id: centerEntityId,
      entity_type: 'center',
      distance: 0,
      relationship_count: upstream.length + downstream.length
    },
    ...upstream,
    ...downstream
  ];

  const edges: FlowEdge[] = [];

  // 上游边
  for (const node of upstream) {
    edges.push({
      from: node.entity_id,
      to: centerEntityId,
      relation_type: 'upstream',
      weight: 1.0 / (node.distance + 1)
    });
  }

  // 下游边
  for (const node of downstream) {
    edges.push({
      from: centerEntityId,
      to: node.entity_id,
      relation_type: 'downstream',
      weight: 1.0 / (node.distance + 1)
    });
  }

  return { nodes, edges };
}
```

### 4.4 子能力 4: 团伙识别

```typescript
interface GangDetectionInput {
  case_id: UUID;
  min_gang_size?: number;          // 最小团伙规模
  max_gang_size?: number;          // 最大团伙规模
  min_connections?: number;          // 最小连接数
}

interface GangDetection {
  gangs: Gang[];
  statistics: GangStatistics;
}

interface Gang {
  gang_id: UUID;
  members: GangMember[];
  gang_type: string;              // 'trade' | 'communication' | 'financial'
  central_member: UUID;
  cohesion_score: number;
  activity_score: number;
}

interface GangMember {
  entity_id: UUID;
  role: string;                   // 'leader' | 'core' | 'peripheral'
  degree: number;
  betweenness: number;
}

interface GangStatistics {
  total_gangs: number;
  total_members: number;
  avg_gang_size: number;
  max_gang_size: number;
}

async function detectGangs(input: GangDetectionInput): Promise<GangDetection> {
  const minGangSize = input.min_gang_size || 3;
  const maxGangSize = input.max_gang_size || 10;

  // 使用社区检测算法
  const communities = await detectCommunities(input.case_id);

  // 过滤和增强社区信息
  const gangs: Gang[] = [];

  for (const community of communities) {
    if (community.members.length >= minGangSize &&
        community.members.length <= maxGangSize) {
      const gang = await enrichGangInfo(community);
      gangs.push(gang);
    }
  }

  // 计算统计信息
  const statistics = calculateGangStatistics(gangs);

  return {
    gangs,
    statistics
  };
}

async function enrichGangInfo(community: Community): Promise<Gang> {
  const members: GangMember[] = [];

  // 计算每个成员的网络指标
  for (const memberId of community.nodes) {
    const degree = await getNodeDegree(memberId);
    const betweenness = await getNodeBetweenness(memberId, community.nodes);

    members.push({
      entity_id: memberId,
      degree,
      betweenness,
      role: determineMemberRole(degree, betweenness)
    });
  }

  // 识别核心成员
  const centralMember = members.reduce((max, member) =>
    member.degree * member.betweenness > max.degree * max.betweenness ? member : max
  );

  // 识别团伙类型
  const gangType = await classifyGangType(community);

  // 计算凝聚度
  const cohesion = calculateCohesion(community);

  // 计算活跃度
  const activity = await calculateGangActivity(community);

  return {
    gang_id: generateUUID(),
    members,
    gang_type: gangType,
    central_member: centralMember.entity_id,
    cohesion_score: cohesion,
    activity_score: activity
  };
}

function determineMemberRole(degree: number, betweenness: number): string {
  if (degree > 5 && betweenness > 0.3) {
    return 'leader';
  } else if (degree > 3) {
    return 'core';
  } else {
    return 'peripheral';
  }
}

function calculateCohesion(community: Community): number {
  const nodeCount = community.nodes.length;
  const edgeCount = community.edges.length;

  // 最大可能边数
  const maxEdges = (nodeCount * (nodeCount - 1)) / 2;

  return edgeCount / maxEdges;
}

async function calculateGangActivity(community: Community): Promise<number> {
  // 计算团伙的活动度
  const activities = await getActivityPattern(community.nodes);

  const avgActivity = activities.reduce((sum, a) => sum + a.frequency, 0) / activities.length;
  const maxActivity = Math.max(...activities.map(a => a.frequency));

  return avgActivity / maxActivity;
}

async function classifyGangType(community: Community): Promise<string> {
  const relations = community.relations || await getRelations(community.nodes);
  const relationTypes = relations.map(r => r.relation_type);

  const typeCounts = relationTypes.reduce((counts, type) => {
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});

  const dominantType = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  const typeMapping = {
    'owns': 'trade',
    'works_for': 'trade',
    'supplied_to': 'trade',
    'payment_to': 'financial',
    'knows': 'communication'
  };

  return typeMapping[dominantType] || 'unknown';
}
```

### 4.5 子能力 5: 多轮条件更新

```typescript
interface MultiRoundUpdateInput {
  case_id: UUID;
  entity_id?: UUID;
  conditions: UpdateCondition[];
  max_rounds?: number;
}

interface UpdateCondition {
  condition_id: string;
  condition_type: 'time_window' | 'relation_strength' | 'evidence_count';
  threshold: number;
  action: string;                 // 'add_relation' | 'remove_relation' | 'update_weight'
  confidence?: number;
}

interface MultiRoundUpdate {
  rounds: UpdateRound[];
  final_state: GraphState;
  convergence: boolean;
}

interface UpdateRound {
  round_number: number;
  updated_entities: UUID[];
  updated_relations: UUID[];
  new_relations: NewRelation[];
}

interface NewRelation {
  source_id: UUID;
  target_id: UUID;
  relation_type: string;
  confidence: number;
  reasoning: string;
}

async function multiRoundConditionalUpdate(input: MultiRoundUpdateInput): Promise<MultiRoundUpdate> {
  const maxRounds = input.max_rounds || 5;
  const rounds: UpdateRound[] = [];

  let graphState = await getCurrentGraphState(input.case_id);
  let converged = false;

  for (let round = 1; round <= maxRounds && !converged; round++) {
    const updates = await processRound(input, graphState, round);
    rounds.push(updates);

    // 应用更新
    await applyUpdates(updates);
    graphState = await getCurrentGraphState(input.case_id);

    // 检查收敛
    converged = checkConvergence(rounds);
  }

  return {
    rounds,
    final_state: graphState,
    convergence: converged
  };
}

async function processRound(
  input: MultiRoundUpdateInput,
  currentState: GraphState,
  roundNumber: number
): Promise<UpdateRound> {
  const updatedEntities: UUID[] = [];
  const updatedRelations: UUID[] = [];
  const newRelations: NewRelation[] = [];

  for (const condition of input.conditions) {
    // 评估条件
    const evaluation = await evaluateCondition(condition, currentState);

    if (evaluation.meets) {
      // 执行动作
      const result = await executeAction(condition.action, evaluation, currentState);
      updatedEntities.push(...result.entities);
      updatedRelations.push(...result.relations);
      newRelations.push(...result.new_relations);
    }
  }

  return {
    round_number: roundNumber,
    updated_entities: updatedEntities,
    updated_relations: updatedRelations,
    new_relations: newRelations
  };
}

async function evaluateCondition(
  condition: UpdateCondition,
  state: GraphState
): Promise<ConditionEvaluation> {
  switch (condition.condition_type) {
    case 'time_window':
      return evaluateTimeWindowCondition(condition, state);
    case 'relation_strength':
      return evaluateRelationStrengthCondition(condition, state);
    case 'evidence_count':
      return evaluateEvidenceCountCondition(condition, state);
  }
}

function checkConvergence(rounds: UpdateRound[]): boolean {
  // 检查最近几轮的变化
  const recentRounds = rounds.slice(-3);

  if (recentRounds.length < 3) return false;

  const totalUpdates = recentRounds.reduce(
    (sum, r) => sum +
      r.updated_entities.length +
      r.updated_relations.length +
      r.new_relations.length,
    0
  );

  // 如果最近3轮的总更新数小于阈值，认为已收敛
  return totalUpdates < 3;
}
```

---

## 5. 错误码定义

| 错误码 | 说明 | 处理建议 |
|-------|------|---------|
| M3-001 | 图数据不足 | 提供更多节点和关系 |
| M3-002 | 路径查找超时 | 减少最大深度 |
| M3-003 | 团伙识别失败 | 调整参数 |

---

*版本: 1.0.0 | 更新日期: 2026-02-15*
