# 服务编排配置

## 1. 服务依赖图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        标准解析流程                                  │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  S1-S7 多模态/文档解析 (并行执行)                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ S1: IM 对话解析      │                              │   │
│  │ S2: 图片解析        │                              │   │
│  │ S3: 语音解析        │                              │   │
│  │ S4: 视频解析        │                              │   │
│  │ S5: PDF 解析         │                              │   │
│  │ S6: Excel 解析        │                              │   │
│  │ S7: 邮件解析        │                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (等待全部完成)
                    ┌─────────────────────────────────────────────────────────┐
                    │              S8: 实体抽取服务             │
                    │            (NER + LLM 增强)               │
                    └──────────────────────────────────────────────┘
                              │
                              ▼
              ┌─────────────────────────────────────────────────────────┐
              │        S9: 关系图谱服务  │
              │      (Neo4j 图数据库)       │
              └──────────────────────────────────────────────┘
                              │
                              ▼
              ┌─────────────────────────────────────────────────────────┐
              │      S10: 轻量索引服务        │
              │ (Elasticsearch + Milvus)  │
              └──────────────────────────────────────────────┘
                              │
                              ▼
              ┌─────────────────────────────────────────────────────────┐
              │    S11: 质量校验服务       │
              │   (完整性/一致性/准确性)   │
              └──────────────────────────────────────────────┘
                              │
                              ▼ (等待校验通过)
              ┌─────────────────────────────────────────────────────────┐
              │    S12: 落库归档服务        │
              │ (PostgreSQL + MinIO)     │
              └──────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────────────────┐
        │         证据挖掘服务层 (M1-M5)          │
        │                                         │
        │    ┌─────────────────────────────┐        │
        │    │ M1: 规则引擎与评分      │        │
        │    │ M2: 字段填充服务       │        │
        │    │ M3: 图谱路径分析      │        │
        │    │ M4: LLM 推理服务       │        │
        │    │ M5: BI 聚合服务        │        │
        │    └─────────────────────────────┘        │
        └───────────────────────────────────────────────┘
                              │
                              ▼
              ┌─────────────────────────────────────────────────────────┐
              │        报告生成与通知服务              │
              │         ┌─────────────────────────────┐       │
              │         │   图谱分析报告      │        │
              │         │   风险评估报告      │        │
              │         │   BI 统计报告        │        │
              │         └─────────────────────────────┘       │
              └───────────────────────────────────────────────┘
```

---

## 2. 消息队列配置

### 2.1 Kafka Topic 定义

```yaml
# Kafka Topic 配置
kafka:
  topics:
    # 文件解析相关
    - name: "parse.input"
      partitions: 10
      replication_factor: 3
      config:
        cleanup.policy: "delete"
        retention.ms: 604800000  # 7 天

    - name: "parse.im.completed"
      partitions: 10
      replication_factor: 3

    - name: "parse.document.completed"
      partitions: 10
      replication_factor: 3

    - name: "parse.media.completed"
      partitions: 10
      replication_factor: 3

    - name: "parse.failed"
      partitions: 5
      replication_factor: 3

    # 实体抽取相关
    - name: "entity.extract.input"
      partitions: 10
      replication_factor: 3

    - name: "entity.extracted"
      partitions: 10
      replication_factor: 3

    - name: "relation.created"
      partitions: 10
      replication_factor: 3

    # 图谱服务相关
    - name: "graph.operation.input"
      partitions: 10
      replication_factor: 3

    - name: "graph.operation.completed"
      partitions: 10
      replication_factor: 3

    # 质量校验相关
    - name: "validation.input"
      partitions: 10
      replication_factor: 3

    - name: "validation.completed"
      partitions: 10
      replication_factor: 3

    # 证据挖掘相关
    - name: "evidence.mining.input"
      partitions: 10
      replication_factor: 3

    - name: "rule.matched"
      partitions: 10
      replication_factor: 3

    - name: "bi.aggregation.completed"
      partitions: 5
      replication_factor: 3

    # 归档相关
    - name: "archive.input"
      partitions: 10
      replication_factor: 3

    - name: "archive.completed"
      partitions: 5
      replication_factor: 3

    # 通知相关
    - name: "notification.send"
      partitions: 5
      replication_factor: 3

  consumer_groups:
    # 解析服务消费者组
    - name: "parse-workers"
      topics: ["parse.input", "parse.im.completed", "parse.document.completed", "parse.media.completed"]
      config:
        group.initial.rebalance.delay.ms: 3000
        enable.auto.commit: false

    - name: "index-workers"
      topics: ["entity.extracted", "relation.created", "parse.completed"]
      config:
        group.initial.rebalance.delay.ms: 3000

    - name: "mining-workers"
      topics: ["evidence.mining.input", "rule.matched", "bi.aggregation.completed"]
      config:
        group.initial.rebalance.delay.ms: 3000

    - name: "archive-workers"
      topics: ["archive.input", "archive.completed", "parse.failed"]
      config:
        group.initial.rebalance.delay.ms: 3000
```

### 2.2 消息格式

```json
{
  "message_type": "parse.input",
  "message_id": "uuid",
  "case_id": "uuid",
  "timestamp": "2026-02-16T13:00:00Z",
  "payload": {
    "file_id": "uuid",
    "file_path": "/path/to/file",
    "file_type": "pdf",
    "priority": 1,
    "options": {
      "extract_tables": true,
      "ocr_enabled": true
    }
  }
}
```

---

## 3. 工作流定义

### 3.1 标准解析流程

```yaml
workflows:
  standard_parse:
    name: "标准解析流程"
    description: "支持多模态和文档文件的解析流程"
    version: "1.0.0"

    steps:
      - id: "receive_files"
        name: "接收文件"
        service: "api-gateway"
        action: "validate_and_store"
        async: false
        timeout: 30

      - id: "determine_parsers"
        name: "确定解析器"
        service: "orchestrator"
        action: "match_file_to_parser"
        parallel: false
        timeout: 5

      - id: "dispatch_parse_tasks"
        name: "分发解析任务"
        service: "kafka-producer"
        action: "send_to_parser_queue"
        async: false
        timeout: 10

      - id: "wait_parse_complete"
        name: "等待解析完成"
        service: "kafka-consumer"
        action: "consume_parse_results"
        async: true
        timeout: 600

      - id: "extract_entities"
        name: "提取实体"
        service: "entity-extraction"
        action: "extract_entities_from_parsed_data"
        async: false
        timeout: 60

      - id: "build_graph"
        name: "构建图谱"
        service: "graph-service"
        action: "create_nodes_and_relations"
        async: false
        timeout: 120

      - id: "validate_quality"
        name: "验证质量"
        service: "validation-service"
        action: "validate_data_quality"
        async: false
        timeout: 30

      - id: "archive_data"
        name: "归档数据"
        service: "archive-service"
        action: "store_final_data"
        async: false
        timeout: 60

    error_handling:
      retry_policy: "exponential_backoff"
      max_retries: 3
      retry_delay_ms: [1000, 2000, 5000]

    compensation_actions:
      - action: "mark_file_failed"
        service: "file-service"

      - action: "send_notification"
        service: "notification-service"
```

### 3.2 证据挖掘流程

```yaml
workflows:
  evidence_mining:
    name: "证据挖掘流程"
    description: "对已解析数据进行规则匹配和 BI 分析"
    version: "1.0.0"

    steps:
      - id: "trigger_mining"
        name: "触发证据挖掘"
        trigger: "cron"
        schedule: "0 */30 * * * *"
        service: "orchestrator"
        action: "check_ready_cases"
        async: false
        timeout: 10

      - id: "rule_matching"
        name: "规则匹配"
        service: "rule-engine"
        action: "execute_all_rules"
        parallel: false
        timeout: 120

      - id: "field_filling"
        name: "字段填充"
        service: "field-filling"
        action: "fill_evidence_table"
        parallel: false
        timeout: 60

      - id: "graph_analysis"
        name: "图谱分析"
        service: "graph-analysis"
        action: "analyze_paths_and_gangs"
        parallel: false
        timeout: 180

      - id: "llm_enhancement"
        name: "LLM 增强"
        service: "llm-inference"
        action: "enhance_semantic_understanding"
        parallel: false
        timeout: 300

      - id: "bi_aggregation"
        name: "BI 聚合"
        service: "bi-aggregation"
        action: "calculate_metrics_and_reports"
        parallel: false
        timeout: 120

    dependencies:
      - step_id: "rule_matching"
        requires:
          - step_id: "trigger_mining"
        state: "completed"

      - step_id: "field_filling"
        requires:
          - step_id: "rule_matching"
          state: "completed"

      - step_id: "graph_analysis"
        requires:
          - step_id: "field_filling"
          state: "completed"
```

---

## 4. 服务发现与负载均衡

### 4.1 服务注册配置

```yaml
service_registry:
  enabled: true
  refresh_interval: 30  # 秒

  services:
    s1_im_parser:
      id: "s1-im-parser"
      name: "IM 对话解析服务"
      type: "parse_service"
      version: "1.0.0"
      host: "s1-im-parser"
      port: 8001
      health_check:
        endpoint: "/health"
        interval: 30
      load_balancing:
          strategy: "round_robin"
          weight: 1

    s2_image_parser:
      id: "s2-image-parser"
      name: "图片解析服务"
      type: "parse_service"
      version: "1.0.0"
      host: "s2-image-parser"
      port: 8002
      health_check:
        endpoint: "/health"
        interval: 30
      load_balancing:
          strategy: "least_connections"
          weight: 2  # 图片解析较重

    s8_entity_extraction:
      id: "s8-entity-extraction"
      name: "实体抽取服务"
      type: "backend_service"
      version: "1.0.0"
      host: "s8-entity-extraction"
      port: 8011
      replicas: 3
      health_check:
        endpoint: "/health"
        interval: 30

    s9_graph_service:
      id: "s9-graph-service"
      name: "关系图谱服务"
      type: "backend_service"
      version: "1.0.0"
      host: "s9-graph-service"
      port: 8012
      replicas: 2
      health_check:
        endpoint: "/health"
        interval: 30

    s10_index_service:
      id: "s10-index-service"
      name: "索引服务"
      type: "backend_service"
      version: "1.0.0"
      host: "s10-index-service"
      port: 8013
      health_check:
        endpoint: "/health"
        interval: 30

    m1_rule_engine:
      id: "m1-rule-engine"
      name: "规则引擎服务"
      type: "mining_service"
      version: "1.0.0"
      host: "m1-rule-engine"
      port: 8021
      health_check:
        endpoint: "/health"
        interval: 30
```

### 4.2 负载均衡策略

```yaml
load_balancing:
  strategies:
    round_robin:
      description: "轮询策略"
      config:
        session_affinity: false

    least_connections:
      description: "最少连接数策略"
      config:
        min_connections: 10

    weighted:
      description: "加权策略"
      config:
        weights:
          s1_im_parser: 1
          s2_image_parser: 2
          s8_entity_extraction: 3

    ip_hash:
      description: "客户端 IP 哈希"
      config:
        algorithm: "crc32"

    consistency_hash:
      description: "一致性哈希"
      config:
        algorithm: "murmur3"
        timeout: 30  # 秒
```

---

## 5. 熔断器与降级配置

```yaml
circuit_breaker:
  enabled: true
  default_config:
    failure_threshold: 5           # 失败阈值
    timeout: 30s                   # 超时时间(秒)
    half_open_timeout: 60s       # 半开状态超时
    recovery_timeout: 120s        # 恢复超时

  service_specific:
    external_services:             # 外部服务调用
      timeout: 30s
      failure_threshold: 3

    database_services:             # 数据库服务
      timeout: 60s
      failure_threshold: 5

    llm_services:                # LLM 服务
      timeout: 120s
      failure_threshold: 2

  fallback:
    enabled: true
    cache_ttl: 3600              # 缓存 TTL (秒)

  rate_limiter:
  enabled: true
  default_config:
    requests_per_second: 100
    burst: 200

  service_specific:
    s1_im_parser:
      qps: 10
      burst: 20

    s2_image_parser:
      qps: 5
      burst: 10

    s8_entity_extraction:
      qps: 20
      burst: 50
```

---

## 6. 缓存策略

```yaml
cache:
  redis:
    enabled: true
    host: "redis"
    port: 6379
    db: 0

  cache_keys:
    - prefix: "cache:"
      ttl: 3600  # 1 小时

    entities:
      key: "cache:entity:{entity_id}"
      ttl: 1800  # 30 分钟

    parsed_data:
      key: "cache:parsed:{file_id}"
      ttl: 7200  # 2 小时

    validation_results:
      key: "cache:validation:{rule_id}:{entity_id}"
      ttl: 600  # 10 分钟

    bi_reports:
      key: "cache:bi:{case_id}:{report_type}"
      ttl: 86400  # 24 小时

  cache_stategies:
    cache_aside:
      description: "缓存穿透保护"
      enabled: true
      timeout: 200  # 毫秒

    cache_through:
      description: "缓存击穿保护"
      enabled: true
      lock_timeout: 5000  # 5 秒

  warming:
      enabled: true
      strategies:
        - type: "proactive"
          services: ["s10_index_service"]
        warmup_count: 100
```

---

## 7. 监控配置

```yaml
monitoring:
  metrics:
    enabled: true
    collection_interval: 30  # 秒

  service_metrics:
    s1_im_parser:
      enabled: true
      metrics:
        - name: "parse_requests_total"
          type: "counter"
          description: "解析请求总数"
        - name: "parse_requests_success"
          type: "counter"
          description: "解析成功数"
        - name: "parse_latency_avg"
          type: "gauge"
          description: "平均解析延迟"
          thresholds:
            warning: 5000  # 5 秒
            critical: 10000  # 10 秒

    s8_entity_extraction:
      enabled: true
      metrics:
        - name: "entity_extracted_total"
          type: "counter"
        - name: "entity_extraction_accuracy"
          type: "gauge"
          description: "实体抽取准确率"

  database_metrics:
    postgresql:
      enabled: true
      metrics:
        - name: "connection_pool_usage"
          type: "gauge"
        - name: "query_latency_avg"
          type: "gauge"

    neo4j:
      enabled: true
      metrics:
        - name: "query_latency_avg"
          type: "gauge"

    milvus:
      enabled: true
      metrics:
        - name: "search_latency_avg"
          type: "gauge"

    elasticsearch:
      enabled: true
      metrics:
        - name: "index_latency_avg"
          type: "gauge"

  alerts:
    enabled: true

    rules:
      - name: "high_error_rate"
        condition: "error_rate > 0.05"
        severity: "critical"
        cooldown: 300  # 5 分钟

      - name: "high_latency"
        condition: "latency_avg > 10000"
        severity: "warning"
        cooldown: 300

      - name: "service_down"
        condition: "service_availability < 0.8"
        severity: "critical"
        cooldown: 60
```

---

## 8. 部署配置

### 8.1 Docker Compose 配置

```yaml
version: '3.8'

services:
  # API 网关
  api-gateway:
    build: ./services/api-gateway
    ports:
      - "8080:8080"
    environment:
      - LOG_LEVEL=info
      - RATE_LIMIT_ENABLED=true
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
      replicas: 2
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # 解析服务集群
  parse-cluster:
    build: ./services/s1-s7-parser-cluster
    ports:
      - "8001-8008"   # S1-S4
      - "8005-8007"   # S5-S7
    environment:
      - WORKER_THREADS=4
      - MAX_FILE_SIZE=500MB
    deploy:
      mode: "replicated"
      replicas: 3

  # 后端服务集群
  backend-cluster:
    build: ./services/s8-s12-backend-cluster
    ports:
      - "8011-8015"   # S8-S12
      - "8021-8025"   # M1-M5
    environment:
      - DB_POOL_SIZE=20
      - ENABLE_CACHE=true
      - LOG_LEVEL=info

  # 数据库集群
  postgres-cluster:
    image: postgres:15-alpine
    environment:
      - POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password
      - POSTGRES_DB=customs
    volumes:
      - postgres_data:/var/lib/postgresql/data
    deploy:
      mode: "replicated"
      replicas: 2

  neo4j-cluster:
    image: neo4j:5-enterprise
    environment:
      - NEO4J_AUTH=neo4j/customs
      - NEO4J_dbms.data=/data/neo4j
    volumes:
      - neo4j_data:/data/neo4j

  milvus-cluster:
    image: milvusdb/milvus:latest
    environment:
      - ETCD_ENDPOINT=etcd:8488
    command:
      - python3 -m milvus.bin server
    volumes:
      - milvus_data:/var/lib/milvus
    deploy:
      mode: "replicated"
      replicas: 2

  elasticsearch-cluster:
    image: docker.elastic.co/elasticsearch:8.10.0
    environment:
      - cluster.name=customs-cluster
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms2g -Xmx1g"
    volumes:
      - es_data:/usr/share/elasticsearch/data
    deploy:
      mode: "replicated"
      replicas: 1

  # 消息队列集群
  kafka-cluster:
    image: bitnami/kafka:3.5
    environment:
      - KAFKA_CFG_ZOOKEEPER_CONNECT=zk:2181
      - KAFKA_HEAP_OPTS=-Xmx2g -Xms2g
    volumes:
      - kafka_data:/var/lib/kafka/data
    deploy:
      mode: "replicated"
      replicas: 3

  redis-cluster:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 512mb
    volumes:
      - redis_data:/data/redis
    deploy:
      mode: "replicated"
      replicas: 3
      command: redis-server --appendonly yes --maxmemory 512mb --replicaof redis-1 --replicaof redis-2 --replicaof redis-3

  # 监控服务
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - prometheus_data:/prometheus
      - ./prometheus.yml:/etc/prometheus

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=true
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning/dashboards:/etc/grafana/provisioning/dashboards
```

---

## 9. 配置文件示例

### 9.1 应用配置

```yaml
# 应用配置
app:
  name: "customs-analysis-platform"
  version: "1.0.0"
  environment: production

  services:
  # 解析服务
  s1_im_parser:
    enabled: true
    workers: 3
    timeout: 600  # 10 分钟

  s2_image_parser:
    enabled: true
    workers: 2
    timeout: 120  # 2 分钟

  # 后端服务
  s8_entity_extraction:
    enabled: true
    workers: 3
    timeout: 60

  s9_graph_service:
    enabled: true
    workers: 2

  # 证据挖掘
  m1_rule_engine:
    enabled: true
    workers: 2

  m5_bi_aggregation:
    enabled: true
    batch_size: 1000

  # 数据库
  connection_pools:
    postgres:
      max_connections: 50
      min_idle: 10
      max_idle: 20

    neo4j:
      max_connections: 20

    milvus:
      max_connections: 10

  elasticsearch:
      max_connections: 30

  redis:
      max_connections: 20
```

### 9.2 Kafka 生产者配置

```yaml
kafka_producer:
  bootstrap_servers: "kafka:9092"
  client_id: "customs-platform-producer"
  acks: "all"
  retries: 3
  compression_type: "snappy"  # 压缩
  linger_ms: 10

  topics:
    parse_input:
      num_partitions: 10
      replication_factor: 3
    parse_completed:
      num_partitions: 5
      replication_factor: 2
```

### 9.3 Kafka 消费者配置

```yaml
kafka_consumer:
  bootstrap_servers: "kafka:9092"
  group_id: "customs-platform-consumer"

  consumers:
    parse_workers:
      topics: ["parse.input", "parse.completed"]
      max_poll_records: 100
      enable_auto_commit: false
      session_timeout_ms: 30000

    entity_workers:
      topics: ["entity.extracted", "relation.created"]
      max_poll_records: 50
      enable_auto_commit: true
      session_timeout_ms: 10000

    mining_workers:
      topics: ["evidence.mining.input", "rule.matched", "bi.completed"]
      max_poll_records: 200
      enable_auto_commit: false
      session_timeout_ms: 60000
```

---

*版本: 1.0.0 | 更新日期: 2026-02-16*
