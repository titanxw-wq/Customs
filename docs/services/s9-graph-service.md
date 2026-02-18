# S9 - 关系图谱服务

## 1. 服务概述

S9 关系图谱服务基于 Neo4j 图数据库，构建和管理案件相关的实体关系网络。

**技术栈**: Neo4j + Cypher + NetworkX

---

## 2. 服务接口定义

```typescript
interface S9_GraphServiceRequest {
  case_id: UUID;
  operation: GraphOperation;
  data?: GraphDataInput;
  query?: GraphQuery;
}

type GraphOperation =
  | 'create_nodes'
  | 'create_relations'
  | 'update_node'
  | 'delete_node'
  | 'find_paths'
  | 'find_shortest_path'
  | 'find_communities'
  | 'get_subgraph';

interface S9_GraphServiceResponse {
  code: number;
  message: string;
  data: {
    case_id: UUID;
    operation: GraphOperation;
    nodes?: GraphNode[];
    relations?: GraphRelation[];
    paths?: GraphPath[];
    communities?: GraphCommunity[];
  };
}
```

---

## 3. 核心类设计

```typescript
class S9_GraphService {
  private neo4j: Driver;

  constructor(uri: string, username: string, password: string) {
    this.neo4j = neo4j.driver(uri, { auth: neo4j.auth.basic(username, password) });
  }

  async execute(request: S9_GraphServiceRequest): Promise<S9_GraphServiceResponse> {
    const session = this.neo4j.session();

    try {
      switch (request.operation) {
        case 'create_nodes':
          return await this.createNodes(session, request.data);
        case 'create_relations':
          return await this.createRelations(session, request.data);
        case 'find_paths':
          return await this.findPaths(session, request.query);
        case 'find_communities':
          return await this.findCommunities(session, request.query);
        default:
          throw new Error(`Unknown operation: ${request.operation}`);
      }
    } finally {
      await session.close();
    }
  }

  private async createNodes(session, data: GraphDataInput): Promise<S9_GraphServiceResponse> {
    const result: GraphNode[] = [];

    for (const node of data.nodes) {
      const labels = ['Entity', node.entity_type];
      const cypher = `
        CREATE (n:${labels.join(':')} $props)
        RETURN n.id as id
      `;
      const res = await session.run(cypher, { props: node });
      result.push(node);
    }

    return {
      code: 0,
      message: 'success',
      data: { case_id: data.case_id, operation: 'create_nodes', nodes: result }
    };
  }

  private async createRelations(session, data: GraphDataInput): Promise<S9_GraphServiceResponse> {
    const result: GraphRelation[] = [];

    for (const rel of data.relations) {
      const cypher = `
        MATCH (source:Entity {id: $source_id})
        MATCH (target:Entity {id: $target_id})
        CREATE (source)-[r:RELATED {type: $relation_type, props}]->(target)
        RETURN r.id as id
      `;
      await session.run(cypher, {
        source_id: rel.source_id,
        target_id: rel.target_id,
        relation_type: rel.relation_type,
        props: rel
      });
      result.push(rel);
    }

    return {
      code: 0,
      message: 'success',
      data: { case_id: data.case_id, operation: 'create_relations', relations: result }
    };
  }

  private async findPaths(session, query: GraphQuery): Promise<S9_GraphServiceResponse> {
    const maxDepth = query.path_query?.max_depth || 5;
    const cypher = `
      MATCH path = shortestPath(
        (start:Entity {id: $start_id})-[:RELATED*1..${maxDepth}]-(end:Entity {id: $end_id})
      )
      RETURN path
      LIMIT 10
    `;

    const result = await session.run(cypher, {
      start_id: query.path_query.start_node_id,
      end_id: query.path_query.end_node_id
    });

    const paths = this.parsePaths(result.records);

    return {
      code: 0,
      message: 'success',
      data: { case_id: query.case_id, operation: 'find_paths', paths }
    };
  }

  private async findCommunities(session, query: GraphQuery): Promise<S9_GraphServiceResponse> {
    // 使用 Louvain 算法进行社区检测
    const cypher = `
      MATCH (n:Entity {case_id: $case_id})
      OPTIONAL MATCH (n)-[r:RELATED]-(m)
      RETURN n.id as node_id, r.weight as weight, m.id as target_id
    `;

    const result = await session.run(cypher, { case_id: query.case_id });

    // 构建图并运行社区检测
    const graph = this.buildGraph(result.records);
    const communities = this.detectCommunities(graph);

    return {
      code: 0,
      message: 'success',
      data: { case_id: query.case_id, operation: 'find_communities', communities }
    };
  }
}
```

---

## 4. Neo4j Cypher 查询示例

### 4.1 创建节点
```cypher
CREATE (n:Entity:Person {
  id: $node_id,
  name: $name,
  case_id: $case_id
})
```

### 4.2 创建关系
```cypher
MATCH (source:Entity {id: $source_id})
MATCH (target:Entity {id: $target_id})
CREATE (source)-[r:RELATED {
  type: 'knows',
  weight: $weight,
  case_id: $case_id
}]->(target)
```

### 4.3 查找最短路径
```cypher
MATCH path = shortestPath(
  (start:Entity {id: $start_id})-[:RELATED*1..5]-(end:Entity {id: $end_id})
)
RETURN path
```

### 4.4 查找共同邻居
```cypher
MATCH (a:Entity {id: $id1})-[:RELATED]-(common)-[:RELATED]-(b:Entity {id: $id2})
RETURN DISTINCT common
```

### 4.5 获取节点度数
```cypher
MATCH (n:Entity {id: $id})-[r:RELATED]-(m)
RETURN count(r) as degree
```

---

## 5. 社区检测算法

### 5.1 Louvain 算法
```python
import networkx as nx
from community import best_partition

def detect_communities(graph: nx.Graph) -> dict:
    partition = best_partition(graph)
    modularity = partition.modularity(partition, graph)
    return {
        'partition': partition,
        'modularity': modularity
    }
```

### 5.2 标签传播算法
```python
def label_propagation(graph: nx.Graph) -> dict:
    communities = nx.algorithms.community.label_propagation_communities(graph)
    result = {}
    for i, community in enumerate(communities):
        for node in community:
            result[node] = i
    return result
```

---

## 6. 处理流程

```typescript
async function processGraphOperation(request: S9_GraphServiceRequest) {
  const session = neo4j.session();

  try {
    switch (request.operation) {
      case 'create_nodes':
        for (const node of request.data.nodes) {
          await session.run('CREATE (:Entity $props)', { props: node });
        }
        break;

      case 'find_paths':
        const paths = await session.run(`
          MATCH path = shortestPath(
            (start {id: $start})-[:RELATED*1..5]-(end {id: $end})
          ) RETURN path
        `, { start: request.query.start, end: request.query.end });
        return paths;

      case 'find_communities':
        const graphData = await session.run('MATCH (n)-[r]-(m) RETURN n, r, m');
        const graph = buildNetworkXGraph(graphData);
        const communities = detectLouvainCommunities(graph);
        return communities;
    }
  } finally {
    await session.close();
  }
}
```

---

## 7. 错误码定义

| 错误码 | 说明 | 处理建议 |
|-------|------|---------|
| S9-001 | Neo4j 连接失败 | 检查数据库连接 |
| S9-002 | 节点不存在 | 先创建节点 |
| S9-003 | 路径未找到 | 检查节点ID |

---

*版本: 1.0.0 | 更新日期: 2026-02-15*
