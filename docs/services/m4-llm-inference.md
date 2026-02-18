# M4 - LLM/多模态推理服务

## 1. 服务概述

M4 LLM/多模态推理服务负责使用大语言模型和多模态模型进行语义理解、补全和跨模态推理。

**技术栈**: GPT-4 / Claude + 多模态模型

---

## 2. 服务接口定义

```typescript
interface M4_InferenceRequest {
  case_id: UUID;
  operation: InferenceOperation;
  input_data: InferenceInput;
  model_config?: ModelConfig;
}

type InferenceOperation =
  | 'semantic_understanding'
  | 'semantic_completion'
  | 'cross_modal_reasoning'
  | 'confidence_evaluation';

interface ModelConfig {
  model_name: string;              // 模型名称
  temperature?: number;            // 温度参数
  max_tokens?: number;              // 最大 token 数
  timeout?: number;                 // 超时时间（秒）
}

interface M4_InferenceResponse {
  code: number;
  message: string;
  data: {
    case_id: UUID;
    operation: InferenceOperation;
    inference_result: InferenceResult;
    confidence: number;
    model_info: ModelInfo;
  };
}

interface ModelInfo {
  model_name: string;
  model_version: string;
  tokens_used: number;
  processing_time_ms: number;
}
```

---

## 3. 核心类设计

```typescript
class M4_InferenceService {
  private llmClient: LLMClient;
  private multimodalClient: MultimodalClient;

  constructor(config: InferenceConfig) {
    this.llmClient = new LLMClient(config.llm);
    this.multimodalClient = new MultimodalClient(config.multimodal);
  }

  async execute(request: M4_InferenceRequest): Promise<M4_InferenceResponse> {
    const startTime = Date.now();
    const modelConfig = request.model_config || getDefaultModelConfig();

    let result: InferenceResult;

    switch (request.operation) {
      case 'semantic_understanding':
        result = await this.semanticUnderstanding(request.input_data, modelConfig);
        break;
      case 'semantic_completion':
        result = await this.semanticCompletion(request.input_data, modelConfig);
        break;
      case 'cross_modal_reasoning':
        result = await this.crossModalReasoning(request.input_data, modelConfig);
        break;
      case 'confidence_evaluation':
        result = await this.evaluateConfidence(request.input_data, modelConfig);
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
        inference_result: result,
        confidence: result.confidence || 0.0,
        model_info: {
          model_name: modelConfig.model_name,
          model_version: '1.0.0',
          tokens_used: result.tokens_used || 0,
          processing_time_ms: processingTime
        }
      }
    };
  }
}
```

---

## 4. 子能力详细设计

### 4.1 语义理解

```typescript
interface SemanticUnderstandingInput {
  text?: string;                    // 文本输入
  images?: ImageInput[];           // 图片输入
  context?: UnderstandingContext;
}

interface ImageInput {
  image_id: UUID;
  image_url: string;
  image_data?: Buffer;             // 图片二进制数据
  ocr_text?: string;               // OCR 提取的文本
}

interface UnderstandingContext {
  case_id: UUID;
  related_entities?: Entity[];
  related_relations?: Relation[];
  domain_knowledge?: Record<string, any>;
}

interface SemanticUnderstandingOutput {
  understanding: SemanticUnderstanding;
  extracted_entities?: Entity[];
  extracted_relations?: Relation[];
  confidence: number;
  tokens_used: number;
}

interface SemanticUnderstanding {
  summary: string;
  key_points: string[];
  intents: Intent[];
  sentiment: Sentiment;
  topics: Topic[];
}

interface Intent {
  intent_type: string;            // 'trade' | 'communication' | 'logistics' | 'financial'
  confidence: number;
  description: string;
}

interface Sentiment {
  polarity: 'positive' | 'negative' | 'neutral';
  score: number;                    // -1 到 1
  aspects: Aspect[];
}

interface Aspect {
  aspect: string;                   // 'price' | 'quality' | 'delivery'
  sentiment: string;
  score: number;
}

async function semanticUnderstanding(input: SemanticUnderstandingInput): Promise<SemanticUnderstandingOutput> {
  const modelConfig = getModelConfig(input.model_name || 'gpt-4');

  // 构建上下文
  const contextPrompt = buildContextPrompt(input.context);

  // 处理多模态输入
  const multiModalInputs = [];
  if (input.text) {
    multiModalInputs.push({ type: 'text', content: input.text });
  }
  if (input.images && input.images.length > 0) {
    for (const img of input.images) {
      multiModalInputs.push({
        type: 'image',
        content: img.ocr_text || 'IMAGE_DATA',
        metadata: { image_id: img.image_id }
      });
    }
  }

  // 构建提示词
  const prompt = `
${contextPrompt}

请理解以下证据内容，进行语义分析。

证据内容:
${multiModalInputs.map(i => `[${i.type}]: ${i.content}`).join('\n')}

请提供以下信息:
1. 内容摘要
2. 关键要点（最多 10 条）
3. 识别的意图（trade/communication/logistics/financial）
4. 情感分析
5. 主题标签
6. 识别的实体（人物、组织、地点、商品等）
7. 识别的关系

返回 JSON 格式:
{
  "summary": "...",
  "key_points": ["...", "..."],
  "intents": [
    {"intent_type": "...", "confidence": 0.0-1.0, "description": "..."}
  ],
  "sentiment": {
    "polarity": "positive|negative|neutral",
    "score": -1.0-1.0,
    "aspects": [
      {"aspect": "...", "sentiment": "...", "score": -1.0-1.0}
    ]
  },
  "topics": ["...", "..."],
  "entities": [...],
  "relations": [...]
}
`;

  // 调用 LLM
  const response = await llmClient.complete(prompt, modelConfig);
  const result = parseLLMResponse(response);

  // 计算置信度
  const confidence = calculateUnderstandingConfidence(result);

  return {
    understanding: result,
    extracted_entities: result.entities,
    extracted_relations: result.relations,
    confidence,
    tokens_used: response.usage?.total_tokens || 0
  };
}
```

### 4.2 语义补全

```typescript
interface SemanticCompletionInput {
  partial_data: PartialData;
  completion_type: 'entity' | 'relation' | 'field' | 'summary';
  completion_context?: Record<string, any>;
}

interface PartialData {
  data_type: string;
  incomplete_fields: string[];
  available_content: Record<string, any>;
  confidence: number;
}

interface SemanticCompletionOutput {
  completed_data: CompletedData;
  completion_suggestions: CompletionSuggestion[];
  confidence: number;
}

interface CompletedData {
  completed: boolean;
  filled_fields: Record<string, any>;
  data_quality_score: number;
}

interface CompletionSuggestion {
  field_name: string;
  suggested_value: any;
  suggestion_type: 'fill' | 'flag_for_review';
  confidence: number;
  reasoning: string;
}

async function semanticCompletion(input: SemanticCompletionInput): Promise<SemanticCompletionOutput> {
  // 构建补全提示词
  const prompt = `
请补全以下不完整的数据：

数据类型: ${input.partial_data.data_type}

不完整字段:
${input.partial_data.incomplete_fields.map(f => `- ${f}`).join('\n')}

可用内容:
${JSON.stringify(input.partial_data.available_content, null, 2)}

补全类型: ${input.completion_type}

上下文信息:
${JSON.stringify(input.completion_context || {}, null, 2)}

请提供:
1. 补全后的字段值
2. 补全建议（如果无法确定）
3. 数据质量评分

返回 JSON 格式:
{
  "filled_fields": {
    "字段名": "补全值",
    ...
  },
  "suggestions": [
    {
      "field_name": "字段名",
      "suggested_value": "建议值",
      "suggestion_type": "fill|flag_for_review",
      "confidence": 0.0-1.0,
      "reasoning": "推断依据"
    }
  ],
  "data_quality_score": 0.0-1.0
}
`;

  const response = await llmClient.complete(prompt, getModelConfig('gpt-4'));
  const result = parseLLMResponse(response);

  return {
    completed_data: {
      completed: Object.keys(result.filled_fields || {}).length > 0,
      filled_fields: result.filled_fields || {},
      data_quality_score: result.data_quality_score || 0.5
    },
    completion_suggestions: result.suggestions || [],
    confidence: result.data_quality_score || 0.5
  };
}
```

### 4.3 跨模态推理

```typescript
interface CrossModalReasoningInput {
  modalities: ModalInput[];
  reasoning_task: string;
  domain?: string;
}

interface ModalInput {
  modality: 'text' | 'image' | 'audio' | 'video';
  content: string | Buffer;
  metadata?: Record<string, any>;
}

interface CrossModalReasoningOutput {
  reasoning_result: ReasoningResult;
  cross_modal_fusion: FusionResult;
  confidence: number;
}

interface ReasoningResult {
  conclusion: string;
  reasoning_chain: ReasoningStep[];
  supporting_evidence: Evidence[];
  alternatives: string[];
}

interface ReasoningStep {
  step_number: number;
  modality_used: string;
  observation: string;
  inference: string;
  confidence: number;
}

interface Evidence {
  modality: string;
  content: string;
  relevance_score: number;
}

async function crossModalReasoning(input: CrossModalReasoningInput): Promise<CrossModalReasoningOutput> {
  // 提取每种模态的特征
  const features = await extractModalFeatures(input.modalities);

  // 构建推理提示词
  const prompt = `
请基于以下多模态信息进行推理：

推理任务: ${input.reasoning_task}
领域: ${input.domain || 'general'}

多模态输入:
${input.modalities.map((m, i) => `
[模态 ${i + 1}]: ${m.modality}
内容: ${typeof m.content === 'string' ? m.content : '[BINARY DATA]'}
元数据: ${JSON.stringify(m.metadata || {}, null, 2)}`).join('\n')}

请提供:
1. 推理结论
2. 推理链路（每一步的观察、推理、置信度）
3. 支持结论的证据
4. 可能的替代结论

返回 JSON 格式:
{
  "conclusion": "...",
  "reasoning_chain": [
    {
      "step_number": 1,
      "modality_used": "text|image|audio|video",
      "observation": "...",
      "inference": "...",
      "confidence": 0.0-1.0
    }
  ],
  "supporting_evidence": [
    {
      "modality": "text|image|audio|video",
      "content": "...",
      "relevance_score": 0.0-1.0
    }
  ],
  "alternatives": ["...", "..."]
}
`;

  const response = await llmClient.complete(prompt, getModelConfig('gpt-4'));
  const result = parseLLMResponse(response);

  // 跨模态融合
  const fusion = await performCrossModalFusion(input.modalities, result);

  return {
    reasoning_result: result,
    cross_modal_fusion: fusion,
    confidence: result.confidence || 0.5
  };
}

async function performCrossModalFusion(
  modalities: ModalInput[],
  reasoning: ReasoningResult
): Promise<FusionResult> {
  // 计算每种模态的相关性
  const relevanceScores = await Promise.all(
    modalities.map(async (m) => ({
      modality: m.modality,
      relevance: await calculateModalityRelevance(m, reasoning)
    }))
  );

  // 融合权重
  const weights = {
    text: 0.4,
    image: 0.3,
    audio: 0.15,
    video: 0.15
  };

  // 计算融合置信度
  let totalWeight = 0;
  let weightedScore = 0;

  for (const score of relevanceScores) {
    const weight = weights[score.modality] || 0;
    totalWeight += weight;
    weightedScore += score.relevance * weight;
  }

  return {
    modality_weights: relevanceScores,
    fusion_confidence: weightedScore / totalWeight,
    dominant_modality: relevanceScores.reduce(
      (max, score) => score.relevance > max.relevance ? score : max
    ).modality
  };
}
```

### 4.4 置信度评估

```typescript
interface ConfidenceEvaluationInput {
  data: any;
  context?: EvaluationContext;
  evaluation_criteria?: EvaluationCriteria[];
}

interface EvaluationContext {
  source_confidence?: number;
  cross_validation?: any[];
  domain_consistency?: boolean;
}

interface EvaluationCriteria {
  criterion: string;                // 'source_reliability' | 'cross_consistency' | 'domain_alignment'
  weight: number;
  threshold?: number;
}

interface ConfidenceEvaluationOutput {
  overall_confidence: number;
  confidence_breakdown: ConfidenceBreakdown;
  recommendations: Recommendation[];
}

interface ConfidenceBreakdown {
  source_reliability: number;
  cross_consistency: number;
  domain_alignment: number;
  uncertainty_level: 'low' | 'medium' | 'high';
}

interface Recommendation {
  type: 'improve_source' | 'cross_validate' | 'human_review';
  priority: 'high' | 'medium' | 'low';
  description: string;
}

async function evaluateConfidence(input: ConfidenceEvaluationInput): Promise<ConfidenceEvaluationOutput> {
  const criteria = input.evaluation_criteria || [
    { criterion: 'source_reliability', weight: 0.4 },
    { criterion: 'cross_consistency', weight: 0.35 },
    { criterion: 'domain_alignment', weight: 0.25 }
  ];

  const scores = {};

  // 1. 源可靠性评估
  const sourceReliability = input.context?.source_confidence || 0.5;
  scores.source_reliability = sourceReliability;

  // 2. 跨源一致性评估
  if (input.context?.cross_validation) {
    const consistencyScore = await calculateCrossConsistency(
      input.data,
      input.context.cross_validation
    );
    scores.cross_consistency = consistencyScore;
  }

  // 3. 领域对齐评估
  if (input.context?.domain_consistency !== undefined) {
    scores.domain_alignment = input.context.domain_consistency ? 1.0 : 0.0;
  }

  // 计算加权总分
  let totalWeight = 0;
  let weightedScore = 0;

  for (const criterion of criteria) {
    const score = scores[criterion.criterion] || 0;
    totalWeight += criterion.weight;
    weightedScore += score * criterion.weight;
  }

  const overallConfidence = weightedScore / totalWeight;

  // 确定不确定性级别
  const uncertaintyLevel = determineUncertaintyLevel(overallConfidence);

  // 生成建议
  const recommendations = generateRecommendations(scores, overallConfidence);

  return {
    overall_confidence: overallConfidence,
    confidence_breakdown: {
      ...scores,
      uncertainty_level: uncertaintyLevel
    },
    recommendations
  };
}

function determineUncertaintyLevel(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence >= 0.8) return 'low';
  if (confidence >= 0.5) return 'medium';
  return 'high';
}

function generateRecommendations(
  scores: Record<string, number>,
  overallConfidence: number
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  if (scores.source_reliability < 0.6) {
    recommendations.push({
      type: 'improve_source',
      priority: 'high',
      description: '数据源可靠性较低，建议增加数据验证'
    });
  }

  if (scores.cross_consistency !== undefined && scores.cross_consistency < 0.7) {
    recommendations.push({
      type: 'cross_validate',
      priority: 'medium',
      description: '跨源一致性不足，建议补充更多来源'
    });
  }

  if (overallConfidence < 0.5) {
    recommendations.push({
      type: 'human_review',
      priority: 'high',
      description: '整体置信度较低，建议人工复核'
    });
  }

  return recommendations;
}
```

---

## 5. 错误码定义

| 错误码 | 说明 | 处理建议 |
|-------|------|---------|
| M4-001 | LLM 调用失败 | 检查 API 密钥 |
| M4-002 | 输入模态不支持 | 提供支持的模态类型 |
| M4-003 | 推理超时 | 减少输入复杂度 |
| M4-004 | 结果解析失败 | 检查返回格式 |

---

*版本: 1.0.0 | 更新日期: 2026-02-15*
