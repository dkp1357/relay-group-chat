# Distributed Task Scheduler — Complete Documentation

> Stack: Spring Boot · Redis Streams · PostgreSQL · Docker Compose · Prometheus · Grafana

---

## Table of Contents

1. [System Design](#1-system-design)
2. [Process Flow](#2-process-flow)
3. [Database Schema](#3-database-schema)
4. [Developer Guide](#4-developer-guide)

---

## 1. System Design

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│              HTTP REST  (POST /tasks, GET /tasks/:id)           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API GATEWAY  (Spring Boot :8000)              │
│  • Validates request           • Checks idempotency key         │
│  • Assigns priority            • Writes job + outbox (1 tx)     │
└───────────┬────────────────────────────┬────────────────────────┘
            │  Postgres (same tx)        │  Postgres (same tx)
            ▼                            ▼
    ┌──────────────┐           ┌──────────────────┐
    │  jobs table  │           │  outbox_events   │
    │  status=PEND │           │  published=false │
    └──────────────┘           └────────┬─────────┘
                                        │  Outbox Relay (100ms poll)
                                        ▼
                          ┌─────────────────────────┐
                          │    REDIS STREAMS         │
                          │  jobs:stream:high        │
                          │  jobs:stream:normal      │
                          │  jobs:stream:low         │
                          └────────────┬────────────┘
                                       │  Consumer Groups (XREADGROUP)
                     ┌─────────────────┼─────────────────┐
                     ▼                 ▼                 ▼
            ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
            │  worker-1   │   │  worker-2   │   │  worker-3   │
            │  4 threads  │   │  4 threads  │   │  4 threads  │
            │  SET NX EX  │   │  SET NX EX  │   │  SET NX EX  │
            └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
                   │                 │                  │
                   └─────────────────┴──────────────────┘
                                     │  status updates
                                     ▼
                          ┌─────────────────────┐
                          │  PostgreSQL :5432    │
                          │  jobs audit log      │
                          └──────────┬──────────┘
                                     │
                          ┌──────────┴──────────┐
                          │  Prometheus :9090    │
                          │  Grafana :3000       │
                          └─────────────────────┘
```

### 1.2 Component Responsibilities

| Component | Tech | Port | Key Responsibility |
|---|---|---|---|
| API Gateway | Spring Boot | 8000 | Ingest, idempotency, outbox write |
| Redis Streams | Redis 7 | 6379 | Three priority streams + distributed lock |
| Outbox Relay | Scheduled Thread | — | Decouples DB write from Redis push |
| Worker Pool | Java containers | — | Job execution, lifecycle, lock management |
| State Store | PostgreSQL 15 | 5432 | Audit log, idempotency keys, outbox table |
| Prometheus | Prometheus | 9090 | Metrics scraping |
| Grafana | Grafana | 3000 | Dashboards |

### 1.3 Design Decisions & Rationale

**Why Redis Streams over RabbitMQ?**
Redis is already in the stack for distributed locking. Adding RabbitMQ would mean operating two brokers, two connection pools, and two failure domains. Redis Streams provides consumer groups, ACK delivery, and message replay natively — everything needed without the added complexity. The tradeoff is that Redis is memory-first; this is mitigated with AOF persistence enabled.

**Why Transactional Outbox over direct Redis push?**
A direct push creates a dual-write bug: if Postgres commits but Redis crashes, the job is silently lost. The Outbox pattern makes Postgres the single source of truth. Redis becomes a delivery mechanism, not a data store.

**Why three separate streams over a scored sorted set?**
Consumer group semantics are cleaner per-stream. A scored sorted set requires atomic ZPOPMIN + lock acquisition in a single Lua script, and priority inversion under load is harder to reason about. Three streams with worker polling order (HIGH → NORMAL → LOW) is explicit and debuggable.

**Why single-node SET NX EX over Redlock?**
Redlock requires consensus across N Redis nodes under strict clock assumptions. For this system, single-node locking provides sufficient guarantees — the EX expiry handles worker crashes. Redlock is documented as a known tradeoff if multi-node Redis is added later.

---

## 2. Process Flow

### 2.1 Happy Path — Job Submission to Completion

```
Step 1 — Submit
  Client  →  POST /api/v1/tasks  →  API Gateway
  Body: { "payload": {...}, "priority": "HIGH", "idempotency_key": "req-xyz" }

Step 2 — Idempotency Check
  API  →  SELECT FROM jobs WHERE idempotency_key = 'req-xyz'
  If found  →  return existing job (HTTP 200), STOP
  If not    →  continue

Step 3 — Atomic DB Write (single transaction)
  BEGIN
    INSERT INTO jobs          (id, status='PENDING', priority, idempotency_key, ...)
    INSERT INTO outbox_events (job_id, payload, published=false)
  COMMIT

Step 4 — Outbox Relay (background, every 100ms)
  SELECT * FROM outbox_events WHERE published = false  FOR UPDATE SKIP LOCKED
  XADD jobs:stream:high * job_id <uuid> payload <json>
  UPDATE outbox_events SET published = true WHERE id = <outbox_id>
  UPDATE jobs SET status = 'QUEUED' WHERE id = <job_id>

Step 5 — Worker Polls (XREADGROUP, blocks up to 2000ms)
  Priority order: jobs:stream:high → jobs:stream:normal → jobs:stream:low
  Worker reads message, attempts lock:
    SET <job_id>:lock "worker-2" NX EX 30
  If lock acquired → continue
  If lock not acquired → NACK, another worker has it

Step 6 — Execution
  UPDATE jobs SET status='PROCESSING', worker_id='worker-2', started_at=NOW()
  Execute task logic (IO-bound sleep / CPU-bound calculation / flaky task)
  On success → UPDATE jobs SET status='COMPLETED', completed_at=NOW(), result={...}
  On failure → UPDATE jobs SET status='FAILED', attempt=attempt+1, error={...}
              Apply exponential backoff: requeue after base * 2^n seconds
              If attempt >= max_retries → XADD jobs:stream:dlq, status='DEAD'

Step 7 — Lock Release + ACK
  DEL <job_id>:lock
  XACK jobs:stream:high <consumer_group> <message_id>

Step 8 — Client Polls
  GET /api/v1/tasks/{id}  →  returns current status + result
```

### 2.2 Failure Scenarios

#### Worker Crash Mid-Task

```
Worker-2 acquires lock (EX 30s), begins execution
Worker-2 container OOM-killed at t=15s
Lock expires at t=30s (EX auto-release)
Redis Streams marks message as PENDING (unacknowledged)
PEL monitor (runs every 60s): XPENDING jobs:stream:high workers > 30s
  → XCLAIM message to worker-1
Worker-1 acquires new lock, re-executes
attempt counter incremented
```

#### Redis Unavailable (Outbox Relay)

```
API writes job to Postgres, outbox_events.published = false
Outbox Relay polls → Redis connection fails → exception caught, logged
Relay retries every 100ms — outbox row stays unpublished
Job stays in PENDING status — no data loss
When Redis recovers → relay processes all unpublished rows
```

#### Duplicate Submission

```
Client sends POST with idempotency_key = "order-confirm-789"
  → job created, HTTP 201
Client network timeout, resends same request
  → SELECT finds existing job, HTTP 200 returned
  → NO duplicate job created
Postgres UNIQUE constraint on idempotency_key handles concurrent race
```

#### Max Retries Exceeded (DLQ)

```
Job fails on attempt 1 → requeue after 2s
Job fails on attempt 2 → requeue after 4s
Job fails on attempt 3 → requeue after 8s
Job fails on attempt 4 → requeue after 16s
Job fails on attempt 5 → XADD jobs:stream:dlq
                          UPDATE jobs SET status='DEAD'
                          Alert fires (Prometheus → Grafana)
DLQ entries require manual inspection — never auto-retried
```

### 2.3 Graceful Shutdown

```
Container receives SIGTERM
JVM shutdown hook fires:
  1. Stop accepting new jobs from Redis (stop XREADGROUP polling)
  2. Wait for in-flight tasks to complete (up to 30s drain window)
  3. Release any held locks (DEL <job_id>:lock)
  4. Flush metrics to Prometheus endpoint
  5. Exit cleanly
If drain window exceeded → force kill, lock expires via EX
```

---

## 3. Database Schema

### 3.1 Full Schema

```sql
-- ─────────────────────────────────────────────
-- Core job record
-- ─────────────────────────────────────────────
CREATE TABLE jobs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status            VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  priority          VARCHAR(10) NOT NULL DEFAULT 'NORMAL',
  idempotency_key   VARCHAR(128) UNIQUE,
  payload           JSONB       NOT NULL,
  result            JSONB,
  error             JSONB,
  attempt           INT         NOT NULL DEFAULT 0,
  max_retries       INT         NOT NULL DEFAULT 5,
  worker_id         VARCHAR(64),
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queued_at         TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  next_retry_at     TIMESTAMPTZ,
  CONSTRAINT valid_status   CHECK (status   IN ('PENDING','QUEUED','PROCESSING','COMPLETED','FAILED','DEAD')),
  CONSTRAINT valid_priority CHECK (priority IN ('HIGH','NORMAL','LOW'))
);

-- ─────────────────────────────────────────────
-- Transactional Outbox
-- Written in same transaction as the jobs row
-- ─────────────────────────────────────────────
CREATE TABLE outbox_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stream_key   VARCHAR(64) NOT NULL,   -- e.g. 'jobs:stream:high'
  payload      JSONB       NOT NULL,
  published    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

-- ─────────────────────────────────────────────
-- Status transition audit trail
-- Append-only, never updated
-- ─────────────────────────────────────────────
CREATE TABLE job_status_history (
  id           BIGSERIAL   PRIMARY KEY,
  job_id       UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  from_status  VARCHAR(20),
  to_status    VARCHAR(20) NOT NULL,
  worker_id    VARCHAR(64),
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note         TEXT
);

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
CREATE INDEX idx_jobs_status          ON jobs(status);
CREATE INDEX idx_jobs_priority        ON jobs(priority);
CREATE INDEX idx_jobs_next_retry      ON jobs(next_retry_at) WHERE status = 'FAILED';
CREATE INDEX idx_jobs_idempotency     ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_outbox_unpublished   ON outbox_events(created_at) WHERE published = FALSE;
CREATE INDEX idx_status_history_job   ON job_status_history(job_id, changed_at);
```

### 3.2 Entity Relationship

```
jobs (1) ──────< outbox_events (many)
  id ─────────── job_id

jobs (1) ──────< job_status_history (many)
  id ─────────── job_id
```

### 3.3 Status Transitions

```
PENDING ──→ QUEUED ──→ PROCESSING ──→ COMPLETED
                              │
                              └──→ FAILED ──→ (retry) ──→ PROCESSING
                                        │
                                        └──→ (max retries) ──→ DEAD
```

### 3.4 Sample Queries

```sql
-- Jobs currently stuck in PROCESSING for > 5 minutes (potential zombie)
SELECT id, worker_id, started_at, attempt
FROM jobs
WHERE status = 'PROCESSING'
  AND started_at < NOW() - INTERVAL '5 minutes';

-- DLQ contents — jobs needing manual inspection
SELECT id, payload, error, attempt, completed_at
FROM jobs
WHERE status = 'DEAD'
ORDER BY completed_at DESC;

-- Throughput last hour by priority
SELECT priority, status, COUNT(*) as count
FROM jobs
WHERE submitted_at > NOW() - INTERVAL '1 hour'
GROUP BY priority, status
ORDER BY priority, status;

-- P95 latency (submitted → completed)
SELECT priority,
       PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
       PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_ms
FROM (
  SELECT priority,
         EXTRACT(EPOCH FROM (completed_at - submitted_at)) * 1000 AS latency_ms
  FROM jobs
  WHERE status = 'COMPLETED'
    AND completed_at > NOW() - INTERVAL '1 hour'
) t
GROUP BY priority;

-- Unpublished outbox events older than 30s (relay health check)
SELECT COUNT(*) as stuck_events
FROM outbox_events
WHERE published = FALSE
  AND created_at < NOW() - INTERVAL '30 seconds';
```

---

## 4. Developer Guide

### 4.1 Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Java | 21 | Worker + API runtime |
| Maven | 3.9+ | Build |
| Docker | 24+ | Container runtime |
| Docker Compose | 2.20+ | Orchestration |
| Redis CLI | 7+ | Debugging streams |
| psql | 15+ | DB inspection |

### 4.2 Project Structure

```
distributed-task-scheduler/
├── api/                          # Spring Boot API Gateway
│   ├── src/main/java/
│   │   ├── controller/
│   │   │   └── TaskController.java
│   │   ├── service/
│   │   │   ├── JobService.java          # Core job creation logic
│   │   │   └── OutboxRelayService.java  # @Scheduled relay thread
│   │   ├── repository/
│   │   │   ├── JobRepository.java
│   │   │   └── OutboxEventRepository.java
│   │   └── model/
│   │       ├── Job.java
│   │       └── OutboxEvent.java
│   └── src/main/resources/
│       └── application.yml
├── worker/                       # Worker consumer
│   └── src/main/java/
│       ├── WorkerApplication.java
│       ├── JobConsumer.java          # Redis Stream XREADGROUP loop
│       ├── LockService.java          # SET NX EX wrapper
│       ├── TaskExecutor.java         # IO/CPU/Flaky task simulation
│       └── MetricsService.java       # Prometheus custom metrics
├── simulation/
│   ├── load_generator.py         # 500rps burst script
│   └── fault_injector.py         # Random container killer
├── monitoring/
│   ├── prometheus.yml
│   └── grafana/
│       └── dashboards/
│           └── task-scheduler.json
├── docker-compose.yml
└── README.md
```

### 4.3 Configuration (Environment Variables)

All configuration is externalised — no hardcoded values.

```yaml
# application.yml (all overridable via ENV)

server:
  port: ${APP_PORT:8000}

spring:
  datasource:
    url: ${DB_URL:jdbc:postgresql://postgres-db:5432/taskdb}
    username: ${DB_USER:taskuser}
    password: ${DB_PASS:secret}

redis:
  host: ${REDIS_HOST:redis-broker}
  port: ${REDIS_PORT:6379}

worker:
  threads:           ${WORKER_THREADS:4}
  poll-block-ms:     ${POLL_BLOCK_MS:2000}
  lock-ttl-seconds:  ${LOCK_TTL:30}
  max-retries:       ${MAX_RETRIES:5}
  backoff-base-ms:   ${BACKOFF_BASE_MS:1000}
  drain-window-ms:   ${DRAIN_WINDOW_MS:30000}

outbox:
  poll-interval-ms:  ${OUTBOX_POLL_MS:100}
  batch-size:        ${OUTBOX_BATCH:50}
```

### 4.4 Running Locally

```bash
# Clone and build
git clone https://github.com/yourname/distributed-task-scheduler
cd distributed-task-scheduler
mvn clean package -DskipTests

# Start the full stack (API + workers + Redis + Postgres + Prometheus + Grafana)
docker-compose up --build

# Scale workers (e.g. 5 worker instances)
docker-compose up --scale worker=5

# Verify everything is running
docker-compose ps

# Expected output:
# app-api        running   0.0.0.0:8000->8000/tcp
# redis-broker   running   0.0.0.0:6379->6379/tcp
# postgres-db    running   0.0.0.0:5432->5432/tcp
# worker-1       running
# worker-2       running
# worker-3       running
# prometheus     running   0.0.0.0:9090->9090/tcp
# grafana        running   0.0.0.0:3000->3000/tcp
```

### 4.5 API Reference

#### Submit a Job

```
POST /api/v1/tasks
Content-Type: application/json
X-Idempotency-Key: <optional-client-key>

{
  "payload": { "type": "image-resize", "url": "https://..." },
  "priority": "HIGH"
}

Response 201 Created:
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "priority": "HIGH",
  "submitted_at": "2024-01-15T10:00:00Z"
}

Response 200 OK (idempotent duplicate):
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "COMPLETED",
  ...
}
```

#### Poll Job Status

```
GET /api/v1/tasks/{id}

Response 200 OK:
{
  "job_id":          "550e8400-e29b-41d4-a716-446655440000",
  "status":          "COMPLETED",
  "priority":        "HIGH",
  "idempotency_key": "client-req-xyz-789",
  "submitted_at":    "2024-01-15T10:00:00Z",
  "queued_at":       "2024-01-15T10:00:00Z",
  "started_at":      "2024-01-15T10:00:02Z",
  "completed_at":    "2024-01-15T10:00:07Z",
  "attempt":         1,
  "worker_id":       "worker-node-2",
  "result":          { "output": "..." },
  "error":           null
}
```

#### List Jobs (with filters)

```
GET /api/v1/tasks?status=FAILED&priority=HIGH&limit=20&offset=0
```

#### Inspect DLQ

```
GET /api/v1/tasks/dlq?limit=50

Response:
{
  "total": 3,
  "jobs": [...]
}
```

#### Requeue a Dead Job (manual retry)

```
POST /api/v1/tasks/{id}/requeue

Response 202 Accepted
```

### 4.6 Key Code Patterns

#### Transactional Outbox Write (API)

```java
@Transactional
public Job createJob(CreateJobRequest request) {

    // Idempotency check
    if (request.getIdempotencyKey() != null) {
        Optional<Job> existing = jobRepository
            .findByIdempotencyKey(request.getIdempotencyKey());
        if (existing.isPresent()) return existing.get();
    }

    // Create job
    Job job = Job.builder()
        .id(UUID.randomUUID())
        .status(JobStatus.PENDING)
        .priority(request.getPriority())
        .payload(request.getPayload())
        .idempotencyKey(request.getIdempotencyKey())
        .submittedAt(Instant.now())
        .build();

    jobRepository.save(job);

    // Write outbox event IN SAME TRANSACTION
    String streamKey = "jobs:stream:" + job.getPriority().name().toLowerCase();
    OutboxEvent outbox = OutboxEvent.builder()
        .jobId(job.getId())
        .streamKey(streamKey)
        .payload(buildPayload(job))
        .build();

    outboxEventRepository.save(outbox);

    return job;
    // Both rows committed atomically or neither is
}
```

#### Outbox Relay

```java
@Scheduled(fixedDelayString = "${outbox.poll-interval-ms:100}")
@Transactional
public void relay() {
    List<OutboxEvent> pending = outboxEventRepository
        .findUnpublishedBatch(BATCH_SIZE);  // SELECT ... FOR UPDATE SKIP LOCKED

    for (OutboxEvent event : pending) {
        try {
            redisTemplate.opsForStream()
                .add(event.getStreamKey(), event.getPayload());

            event.setPublished(true);
            event.setPublishedAt(Instant.now());
            outboxEventRepository.save(event);

            jobRepository.updateStatus(event.getJobId(), JobStatus.QUEUED);
        } catch (Exception e) {
            log.warn("Relay failed for {}, will retry: {}", event.getId(), e.getMessage());
            // Row stays published=false, next poll picks it up
        }
    }
}
```

#### Worker Lock + Execute

```java
public void processMessage(MapRecord<String, String, String> message) {
    String jobId = message.getValue().get("job_id");
    String lockKey = jobId + ":lock";

    Boolean acquired = redisTemplate.opsForValue()
        .setIfAbsent(lockKey, workerId, lockTtl, TimeUnit.SECONDS);

    if (!acquired) {
        log.info("Job {} already locked, skipping", jobId);
        return;
    }

    try {
        jobRepository.updateStatus(jobId, JobStatus.PROCESSING, workerId);
        Object result = taskExecutor.execute(jobId, message.getValue());
        jobRepository.complete(jobId, result);
        redisTemplate.opsForStream().acknowledge(streamKey, consumerGroup, message.getId());
    } catch (Exception e) {
        handleFailure(jobId, e);
    } finally {
        redisTemplate.delete(lockKey);
    }
}
```

#### Exponential Backoff + DLQ

```java
private void handleFailure(String jobId, Exception e) {
    Job job = jobRepository.findById(jobId).orElseThrow();
    int attempt = job.getAttempt() + 1;

    if (attempt >= job.getMaxRetries()) {
        jobRepository.updateStatus(jobId, JobStatus.DEAD);
        redisTemplate.opsForStream()
            .add("jobs:stream:dlq", Map.of("job_id", jobId, "error", e.getMessage()));
        metricsService.incrementDlq();
        return;
    }

    long delayMs = backoffBaseMs * (long) Math.pow(2, attempt);
    Instant retryAt = Instant.now().plusMillis(delayMs);

    jobRepository.markFailed(jobId, attempt, retryAt, e.getMessage());
    // Scheduler re-queues jobs WHERE status='FAILED' AND next_retry_at <= NOW()
}
```

### 4.7 Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `queue_depth` | Gauge | `priority` | Pending jobs per stream |
| `job_latency_seconds` | Histogram | `priority` | Submission → completion time |
| `worker_active_threads` | Gauge | `worker_id` | Busy threads per worker |
| `retry_count_total` | Counter | `priority` | Total retry attempts |
| `dlq_depth` | Gauge | — | Dead jobs awaiting review |
| `outbox_lag_seconds` | Gauge | — | DB write → Redis push delay |
| `jobs_processed_total` | Counter | `priority`, `status` | Total completed/failed |

Custom metrics registration example:

```java
@Component
public class MetricsService {

    private final Gauge queueDepth;
    private final Counter dlqCounter;
    private final DistributionSummary latency;

    public MetricsService(MeterRegistry registry) {
        this.queueDepth = Gauge.builder("queue_depth", this, m -> m.getCurrentDepth())
            .tag("priority", "high")
            .register(registry);

        this.dlqCounter = Counter.builder("dlq_depth_total")
            .register(registry);

        this.latency = DistributionSummary.builder("job_latency_seconds")
            .publishPercentiles(0.5, 0.95, 0.99)
            .register(registry);
    }
}
```

### 4.8 Running the Simulation Suite

```bash
# Load generator — 500 concurrent requests
python simulation/load_generator.py \
  --url http://localhost:8000 \
  --requests 500 \
  --concurrency 50 \
  --priority-mix HIGH:0.2,NORMAL:0.6,LOW:0.2

# Fault injector — kills random workers every 30s
python simulation/fault_injector.py \
  --compose-file docker-compose.yml \
  --service worker \
  --interval 30 \
  --duration 300

# Watch DLQ fill during fault injection
watch -n 2 'curl -s http://localhost:8000/api/v1/tasks/dlq | jq .total'

# Monitor Redis Streams live
redis-cli XLEN jobs:stream:high
redis-cli XPENDING jobs:stream:high workers - + 10
```

### 4.9 Debugging Cheatsheet

```bash
# Check stream depths
redis-cli XLEN jobs:stream:high
redis-cli XLEN jobs:stream:normal
redis-cli XLEN jobs:stream:low
redis-cli XLEN jobs:stream:dlq

# Check pending (unacknowledged) messages — these are potential zombies
redis-cli XPENDING jobs:stream:high workers - + 10

# Check active locks
redis-cli KEYS "*:lock"
redis-cli TTL "<job_id>:lock"

# Check outbox lag
psql $DB_URL -c "
  SELECT COUNT(*), MIN(created_at) as oldest_unpublished
  FROM outbox_events WHERE published = FALSE;"

# Worker logs — follow all workers
docker-compose logs -f worker

# Inspect a specific job
curl http://localhost:8000/api/v1/tasks/<job_id> | jq .

# Force requeue a dead job
curl -X POST http://localhost:8000/api/v1/tasks/<job_id>/requeue
```

### 4.10 Docker Compose (Abridged)

```yaml
version: "3.9"

services:

  app-api:
    build: ./api
    ports: ["8000:8000"]
    environment:
      DB_URL: jdbc:postgresql://postgres-db:5432/taskdb
      REDIS_HOST: redis-broker
    depends_on: [postgres-db, redis-broker]

  worker:
    build: ./worker
    deploy:
      replicas: 3
    environment:
      REDIS_HOST: redis-broker
      DB_URL: jdbc:postgresql://postgres-db:5432/taskdb
      WORKER_THREADS: 4
      MAX_RETRIES: 5
      BACKOFF_BASE_MS: 1000
    depends_on: [redis-broker, postgres-db]

  redis-broker:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --appendonly yes   # AOF persistence

  postgres-db:
    image: postgres:15-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: taskdb
      POSTGRES_USER: taskuser
      POSTGRES_PASSWORD: secret
    volumes:
      - ./schema.sql:/docker-entrypoint-initdb.d/schema.sql

  prometheus:
    image: prom/prometheus
    ports: ["9090:9090"]
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports: ["3000:3000"]
    volumes:
      - ./monitoring/grafana:/etc/grafana/provisioning
```

---

## Resume Talking Points Reference

| Claim | Supporting Evidence in Codebase |
|---|---|
| "Implemented Transactional Outbox to eliminate the dual-write problem" | `JobService.java` — single `@Transactional` writing both `jobs` + `outbox_events` |
| "Idempotency keys prevent duplicate jobs on client retry" | `JobService.java` — `findByIdempotencyKey` check before creation |
| "Three-tier priority queue using separate Redis Streams" | `docker-compose.yml` streams + `JobConsumer.java` poll order |
| "Externalised all config as ENV for per-environment tuning" | `application.yml` — every value uses `${ENV_VAR:default}` |
| "Distributed locking with SET NX EX, aware of Redlock tradeoffs" | `LockService.java` + architecture doc |
| "Used Prometheus to identify P95 latency spikes at 450rps" | `MetricsService.java` + Grafana dashboard |
| "Graceful shutdown drains in-flight tasks on SIGTERM" | `WorkerApplication.java` JVM shutdown hook |
| "Dead Letter Queue for jobs exceeding retry budget" | `handleFailure()` in `JobConsumer.java` |
