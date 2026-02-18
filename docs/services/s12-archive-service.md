# S12 - 落库归档服务

## 1. 服务概述

S12 落库归档服务负责将解析和验证后的数据持久化到 PostgreSQL 数据库和 MinIO 对象存储。

**技术栈**: PostgreSQL + MinIO + 连接池

---

## 2. 服务接口定义

```typescript
interface S12_ArchiveRequest {
  case_id: UUID;
  operation: ArchiveOperation;
  data?: ArchiveData;
  query?: ArchiveQuery;
}

type ArchiveOperation =
  | 'store_case'
  | 'store_file'
  | 'store_entities'
  | 'archive_case'
  | 'retrieve_case'
  | 'delete_case';

interface S12_ArchiveResponse {
  code: number;
  message: string;
  data: {
    case_id: UUID;
    operation: ArchiveOperation;
    stored_count?: number;
    retrieved_data?: CaseFullData;
    storage_info?: StorageInfo;
  };
}
```

---

## 3. 核心类设计

```typescript
class S12_ArchiveService {
  private dbPool: ConnectionPool;
  private storage: StorageBackend;

  constructor(dbConfig: DBConfig, storageConfig: StorageConfig) {
    this.dbPool = new ConnectionPool(dbConfig);
    this.storage = new MinIOBackend(storageConfig);
  }

  async execute(request: S12_ArchiveRequest): Promise<S12_ArchiveResponse> {
    const conn = await this.dbPool.getConnection();

    try {
      await conn.beginTransaction();

      switch (request.operation) {
        case 'store_case':
          return await this.storeCase(conn, request.data.case);
        case 'store_file':
          return await this.storeFile(conn, request.data.file);
        case 'store_entities':
          return await this.storeEntities(conn, request.data.entities);
        case 'archive_case':
          return await this.archiveCase(conn, request.case_id);
        case 'retrieve_case':
          return await this.retrieveCase(conn, request.case_id);
        default:
          throw new Error(`Unknown operation: ${request.operation}`);
      }

      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  private async storeCase(conn: Connection, caseData: CaseData): Promise<S12_ArchiveResponse> {
    const sql = `
      INSERT INTO cases (
        id, case_type, title, description, status,
        priority, created_at, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        status = excluded.status,
        updated_at = excluded.updated_at
    `;

    await conn.execute(sql, [
      caseData.case_id,
      caseData.case_type,
      caseData.title,
      caseData.description,
      caseData.status,
      caseData.priority,
      caseData.created_at,
      caseData.updated_at,
      JSON.stringify(caseData.metadata || {})
    ]);

    return {
      code: 0,
      message: 'success',
      data: { case_id: caseData.case_id, operation: 'store_case', stored_count: 1 }
    };
  }

  private async storeFile(conn: Connection, fileData: FileData): Promise<S12_ArchiveResponse> {
    // 计算文件哈希
    const fileHash = await this.calculateFileHash(fileData.file_path);

    // 存储到 MinIO
    const storagePath = await this.storage.storeFile(
      fileData.file_id.toString(),
      fileData.file_path
    );

    // 插入数据库记录
    const sql = `
      INSERT INTO files (
        id, case_id, file_name, file_type, file_size,
        file_hash, storage_path, mime_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO NOTHING
    `;

    await conn.execute(sql, [
      fileData.file_id,
      fileData.case_id,
      fileData.file_name,
      fileData.file_type,
      fileData.file_size,
      fileHash,
      storagePath,
      fileData.mime_type,
      new Date().toISOString()
    ]);

    return {
      code: 0,
      message: 'success',
      data: {
        case_id: fileData.case_id,
        operation: 'store_file',
        stored_count: 1,
        storage_info: { storage_path: storagePath, file_hash: fileHash }
      }
    };
  }

  private async archiveCase(conn: Connection, caseId: UUID): Promise<S12_ArchiveResponse> {
    const sql = `
      UPDATE cases
      SET status = 'archived', archived_at = ?
      WHERE id = ?
    `;

    await conn.execute(sql, [new Date().toISOString(), caseId]);

    const storageInfo = await this.getStorageInfo(conn, caseId);

    return {
      code: 0,
      message: 'success',
      data: { case_id: caseId, operation: 'archive_case', storage_info: storageInfo }
    };
  }

  private async retrieveCase(conn: Connection, caseId: UUID): Promise<S12_ArchiveResponse> {
    // 获取案件信息
    const caseRow = await conn.query(
      'SELECT * FROM cases WHERE id = ?',
      [caseId]
    );

    // 获取文件列表
    const files = await conn.query(
      'SELECT * FROM files WHERE case_id = ?',
      [caseId]
    );

    // 获取实体列表
    const entities = await conn.query(
      'SELECT * FROM entities WHERE case_id = ?',
      [caseId]
    );

    return {
      code: 0,
      message: 'success',
      data: {
        case_id: caseId,
        operation: 'retrieve_case',
        retrieved_data: { case: caseRow[0], files, entities }
      }
    };
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    const fs = require('fs');

    const stream = fs.createReadStream(filePath);
    return new Promise((resolve, reject) => {
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async getStorageInfo(conn: Connection, caseId: UUID): Promise<StorageInfo> {
    const result = await conn.query(`
      SELECT COUNT(*) as file_count,
             COALESCE(SUM(file_size), 0) as total_size
      FROM files WHERE case_id = ?
    `, [caseId]);

    const { file_count, total_size } = result[0];

    return {
      used_storage_mb: Math.round(total_size / (1024 * 1024) * 100) / 100,
      total_files: file_count,
      archive_location: `/archive/cases/${caseId.toString().slice(0, 8)}`,
      retention_policy: '10_years'
    };
  }
}

interface StorageBackend {
  storeFile(fileId: string, filePath: string): Promise<string>;
  retrieveFile(storagePath: string, destPath: string): Promise<void>;
  deleteFile(storagePath: string): Promise<void>;
}

class MinIOBackend implements StorageBackend {
  private client: any;
  private bucket: string;

  constructor(config: { endpoint: string; accessKey: string; secretKey: string; bucket: string }) {
    const Minio = require('minio');
    this.client = new Minio.Client({
      endPoint: config.endpoint,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      useSSL: false
    });
    this.bucket = config.bucket;
  }

  async storeFile(fileId: string, filePath: string): Promise<string> {
    const objectName = `cases/${fileId.slice(0, 8)}/${fileId.slice(8, 16)}/${fileId.slice(16)}`;
    await this.client.fPutObject(this.bucket, objectName, filePath);
    return objectName;
  }

  async retrieveFile(storagePath: string, destPath: string): Promise<void> {
    await this.client.fGetObject(this.bucket, storagePath, destPath);
  }

  async deleteFile(storagePath: string): Promise<void> {
    await this.client.removeObject(this.bucket, storagePath);
  }
}
```

---

## 4. 数据库操作

### 4.1 CRUD 操作
```sql
-- 创建案件
INSERT INTO cases (id, case_type, title, description, status, priority, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?);

-- 更新案件
UPDATE cases SET status = ?, updated_at = ? WHERE id = ?;

-- 删除案件
DELETE FROM cases WHERE id = ?;

-- 查询案件
SELECT * FROM cases WHERE id = ?;
```

### 4.2 事务处理
```typescript
async function withTransaction<T>(
  pool: ConnectionPool,
  fn: (conn: Connection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
```

### 4.3 连接池配置
```typescript
interface ConnectionPool {
  minConnections: number;      // 最小连接数
  maxConnections: number;      // 最大连接数
  acquireTimeout: number;      // 获取连接超时
  idleTimeout: number;        // 空闲超时
}
```

---

## 5. 对象存储集成

### 5.1 存储路径规划
```
cases/
  └── {case_id 前 8 位}/
      └── {case_id 中间 8 位}/
          └── {case_id 后续位}/
              └── {file_id}
```

### 5.2 文件上传流程
```typescript
async function uploadFile(fileData: FileData, storage: StorageBackend): Promise<string> {
  // 1. 计算文件哈希
  const hash = await calculateHash(fileData.file_path);

  // 2. 上传到对象存储
  const storagePath = await storage.storeFile(
    fileData.file_id.toString(),
    fileData.file_path
  );

  // 3. 保存元数据到数据库
  await saveFileMetadata({ ...fileData, storage_path: storagePath, file_hash: hash });

  return storagePath;
}
```

---

## 6. 归档策略

### 6.1 案件状态流转
```
draft → processing → analyzing → reviewed → closed
                              ↓
                          archived
```

### 6.2 冷热数据分离
- **热数据**: 最近 6 个月的活动案件
- **冷数据**: 6 个月以上的归档案件
- **存储策略**:
  - 热数据: SSD 存储，快速访问
  - 冷数据: HDD 存储，成本优化

### 6.3 保留策略
- 活跃案件: 永久保留
- 已归档案件: 保留 10 年
- 审计日志: 保留 15 年

---

## 7. 错误码定义

| 错误码 | 说明 | 处理建议 |
|-------|------|---------|
| S12-001 | 数据库连接失败 | 检查数据库配置 |
| S12-002 | 文件上传失败 | 检查 MinIO 服务 |
| S12-003 | 事务冲突 | 重试操作 |

---

*版本: 1.0.0 | 更新日期: 2026-02-15*
