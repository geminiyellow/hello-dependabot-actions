# Operations Manual

Complete operational guide for running and maintaining the Permission Management System in production.

## Table of Contents

1. [System Overview](#system-overview)
2. [Monitoring](#monitoring)
3. [Alerting](#alerting)
4. [Troubleshooting](#troubleshooting)
5. [Runbooks](#runbooks)
6. [Maintenance Procedures](#maintenance-procedures)
7. [Disaster Recovery](#disaster-recovery)
8. [Capacity Planning](#capacity-planning)
9. [Security Operations](#security-operations)
10. [On-Call Guide](#on-call-guide)

---

## System Overview

### Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Production Environment                        │
│                                                                   │
│  ALB → EKS Cluster                                               │
│         ├── Permission Service (5 pods)                         │
│         ├── Audit Service (3 pods)                              │
│         ├── Policy Service (3 pods)                             │
│         ├── Tenant Service (2 pods)                             │
│         ├── Integration Service (2 pods)                        │
│         └── GraphQL Gateway (3 pods)                            │
│                                                                   │
│  Data Layer                                                      │
│         ├── RDS Aurora PostgreSQL (3 instances)                 │
│         ├── ElastiCache Redis (3 nodes)                         │
│         └── Amazon MSK Kafka (3 brokers)                        │
│                                                                   │
│  Support Services                                                │
│         ├── Keycloak (3 instances)                              │
│         ├── Prometheus (HA pair)                                │
│         ├── Grafana (2 instances)                               │
│         └── Jaeger (distributed)                                │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Metrics

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| Availability | 99.9% | < 99.5% |
| P95 Latency | < 100ms | > 500ms |
| P99 Latency | < 200ms | > 1000ms |
| Error Rate | < 0.1% | > 1% |
| Cache Hit Rate | > 95% | < 80% |
| Database Connections | < 80% | > 90% |

---

## Monitoring

### Prometheus Configuration

**`monitoring/prometheus/prometheus.yml`**:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'permission-system-prod'
    environment: 'production'

# Alerting configuration
alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093

# Load rules
rule_files:
  - '/etc/prometheus/rules/*.yml'

# Scrape configurations
scrape_configs:
  # Kubernetes API server
  - job_name: 'kubernetes-apiservers'
    kubernetes_sd_configs:
      - role: endpoints
    scheme: https
    tls_config:
      ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
    relabel_configs:
      - source_labels: [__meta_kubernetes_namespace, __meta_kubernetes_service_name, __meta_kubernetes_endpoint_port_name]
        action: keep
        regex: default;kubernetes;https

  # Kubernetes nodes
  - job_name: 'kubernetes-nodes'
    kubernetes_sd_configs:
      - role: node
    scheme: https
    tls_config:
      ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
    relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)

  # Kubernetes pods
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__
      - action: labelmap
        regex: __meta_kubernetes_pod_label_(.+)
      - source_labels: [__meta_kubernetes_namespace]
        action: replace
        target_label: kubernetes_namespace
      - source_labels: [__meta_kubernetes_pod_name]
        action: replace
        target_label: kubernetes_pod_name

  # Permission Service
  - job_name: 'permission-service'
    kubernetes_sd_configs:
      - role: endpoints
        namespaces:
          names:
            - permission-system
    relabel_configs:
      - source_labels: [__meta_kubernetes_service_name]
        action: keep
        regex: permission-service
      - source_labels: [__meta_kubernetes_endpoint_port_name]
        action: keep
        regex: metrics

  # RDS Aurora
  - job_name: 'rds-aurora'
    static_configs:
      - targets:
          - cloudwatch-exporter:9106
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: cloudwatch-exporter:9106

  # ElastiCache Redis
  - job_name: 'elasticache-redis'
    static_configs:
      - targets:
          - redis-exporter:9121

  # Amazon MSK
  - job_name: 'amazon-msk'
    static_configs:
      - targets:
          - jmx-exporter:9308
```

### Grafana Dashboards

#### 1. Permission Service Dashboard

**`monitoring/grafana/dashboards/permission-service.json`** (excerpts):

```json
{
  "dashboard": {
    "title": "Permission Service - Production",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "sum(rate(http_server_requests_seconds_count{job=\"permission-service\"}[5m]))"
          }
        ],
        "type": "graph"
      },
      {
        "title": "P95 Latency",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(http_server_requests_seconds_bucket{job=\"permission-service\"}[5m])) by (le))"
          }
        ],
        "alert": {
          "conditions": [
            {
              "evaluator": {
                "params": [500],
                "type": "gt"
              },
              "operator": {
                "type": "and"
              },
              "query": {
                "params": ["A", "5m", "now"]
              },
              "reducer": {
                "params": [],
                "type": "avg"
              },
              "type": "query"
            }
          ],
          "executionErrorState": "alerting",
          "frequency": "1m",
          "handler": 1,
          "name": "High P95 Latency",
          "noDataState": "no_data",
          "notifications": []
        }
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "sum(rate(http_server_requests_seconds_count{job=\"permission-service\",status=~\"5..\"}[5m])) / sum(rate(http_server_requests_seconds_count{job=\"permission-service\"}[5m]))"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Cache Hit Rate",
        "targets": [
          {
            "expr": "sum(rate(permission_cache_hit_total{level=\"L1\"}[5m])) / (sum(rate(permission_cache_hit_total{level=\"L1\"}[5m])) + sum(rate(permission_cache_miss_total[5m])))"
          }
        ],
        "type": "gauge"
      },
      {
        "title": "Active Database Connections",
        "targets": [
          {
            "expr": "hikaricp_connections_active{job=\"permission-service\"}"
          }
        ],
        "type": "graph"
      },
      {
        "title": "JVM Memory Usage",
        "targets": [
          {
            "expr": "jvm_memory_used_bytes{job=\"permission-service\",area=\"heap\"} / jvm_memory_max_bytes{job=\"permission-service\",area=\"heap\"}"
          }
        ],
        "type": "graph"
      },
      {
        "title": "CPU Usage",
        "targets": [
          {
            "expr": "rate(process_cpu_seconds_total{job=\"permission-service\"}[5m])"
          }
        ],
        "type": "graph"
      }
    ]
  }
}
```

#### 2. Database Dashboard

Key queries:

```promql
# Database connections
sum(hikaricp_connections_active{}) by (pool)

# Query duration P95
histogram_quantile(0.95, sum(rate(database_query_duration_seconds_bucket[5m])) by (le, query_type))

# Database CPU
aws_rds_cpuutilization_average{dbinstance_identifier="permission-system-aurora-writer"}

# Database memory
aws_rds_freeable_memory_average{dbinstance_identifier="permission-system-aurora-writer"}

# Slow queries
increase(database_slow_queries_total[1h])
```

#### 3. Redis Dashboard

Key queries:

```promql
# Memory usage
redis_memory_used_bytes / redis_memory_max_bytes

# Hit rate
rate(redis_keyspace_hits_total[5m]) / (rate(redis_keyspace_hits_total[5m]) + rate(redis_keyspace_misses_total[5m]))

# Connected clients
redis_connected_clients

# Evicted keys
rate(redis_evicted_keys_total[5m])

# Command duration
redis_command_duration_seconds_total
```

---

## Alerting

### AlertManager Configuration

**`monitoring/alertmanager/alertmanager.yml`**:

```yaml
global:
  resolve_timeout: 5m
  slack_api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
  pagerduty_url: 'https://events.pagerduty.com/v2/enqueue'

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default'
  routes:
    # Critical alerts go to PagerDuty
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      continue: true

    # Critical alerts also go to Slack
    - match:
        severity: critical
      receiver: 'slack-critical'

    # Warning alerts go to Slack only
    - match:
        severity: warning
      receiver: 'slack-warnings'

    # Info alerts go to Slack
    - match:
        severity: info
      receiver: 'slack-info'

receivers:
  - name: 'default'
    slack_configs:
      - channel: '#permission-system-alerts'
        title: 'Alert: {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_SERVICE_KEY'
        description: '{{ .GroupLabels.alertname }}: {{ .GroupLabels.instance }}'
        details:
          firing: '{{ .Alerts.Firing | len }}'
          resolved: '{{ .Alerts.Resolved | len }}'

  - name: 'slack-critical'
    slack_configs:
      - channel: '#permission-system-critical'
        color: 'danger'
        title: '🚨 CRITICAL: {{ .GroupLabels.alertname }}'
        text: |-
          {{ range .Alerts }}
          *Alert:* {{ .Annotations.summary }}
          *Description:* {{ .Annotations.description }}
          *Details:*
            {{ range .Labels.SortedPairs }} • *{{ .Name }}:* `{{ .Value }}`
            {{ end }}
          {{ end }}

  - name: 'slack-warnings'
    slack_configs:
      - channel: '#permission-system-alerts'
        color: 'warning'
        title: '⚠️ WARNING: {{ .GroupLabels.alertname }}'

  - name: 'slack-info'
    slack_configs:
      - channel: '#permission-system-info'
        color: 'good'
        title: 'ℹ️ INFO: {{ .GroupLabels.alertname }}'

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'instance']
```

### Alert Rules

**`monitoring/prometheus/rules/permission-service.yml`**:

```yaml
groups:
  - name: permission-service
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: |
          (
            sum(rate(http_server_requests_seconds_count{job="permission-service",status=~"5.."}[5m]))
            /
            sum(rate(http_server_requests_seconds_count{job="permission-service"}[5m]))
          ) > 0.01
        for: 5m
        labels:
          severity: critical
          service: permission-service
        annotations:
          summary: "High error rate on Permission Service"
          description: "Error rate is {{ $value | humanizePercentage }} (threshold: 1%)"
          runbook: "https://wiki.company.com/runbooks/high-error-rate"

      # High P95 latency
      - alert: HighP95Latency
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_server_requests_seconds_bucket{job="permission-service"}[5m])) by (le)
          ) > 0.5
        for: 5m
        labels:
          severity: warning
          service: permission-service
        annotations:
          summary: "High P95 latency on Permission Service"
          description: "P95 latency is {{ $value | humanizeDuration }} (threshold: 500ms)"
          runbook: "https://wiki.company.com/runbooks/high-latency"

      # High P99 latency
      - alert: HighP99Latency
        expr: |
          histogram_quantile(0.99,
            sum(rate(http_server_requests_seconds_bucket{job="permission-service"}[5m])) by (le)
          ) > 1.0
        for: 5m
        labels:
          severity: critical
          service: permission-service
        annotations:
          summary: "High P99 latency on Permission Service"
          description: "P99 latency is {{ $value | humanizeDuration }} (threshold: 1s)"

      # Low cache hit rate
      - alert: LowCacheHitRate
        expr: |
          (
            sum(rate(permission_cache_hit_total{level="L1"}[5m]))
            /
            (sum(rate(permission_cache_hit_total{level="L1"}[5m])) + sum(rate(permission_cache_miss_total[5m])))
          ) < 0.8
        for: 10m
        labels:
          severity: warning
          service: permission-service
        annotations:
          summary: "Low cache hit rate"
          description: "L1 cache hit rate is {{ $value | humanizePercentage }} (threshold: 80%)"
          runbook: "https://wiki.company.com/runbooks/low-cache-hit-rate"

      # Pod not ready
      - alert: PodNotReady
        expr: |
          sum(kube_pod_status_phase{namespace="permission-system",pod=~"permission-service.*",phase!="Running"}) by (pod) > 0
        for: 5m
        labels:
          severity: critical
          service: permission-service
        annotations:
          summary: "Pod {{ $labels.pod }} not ready"
          description: "Pod {{ $labels.pod }} has been in non-Running state for 5 minutes"

      # High memory usage
      - alert: HighMemoryUsage
        expr: |
          (
            jvm_memory_used_bytes{job="permission-service",area="heap"}
            /
            jvm_memory_max_bytes{job="permission-service",area="heap"}
          ) > 0.85
        for: 5m
        labels:
          severity: warning
          service: permission-service
        annotations:
          summary: "High JVM memory usage"
          description: "JVM heap usage is {{ $value | humanizePercentage }} on {{ $labels.instance }}"

      # Database connection pool exhaustion
      - alert: DatabaseConnectionPoolExhaustion
        expr: |
          (
            hikaricp_connections_active{job="permission-service"}
            /
            hikaricp_connections_max{job="permission-service"}
          ) > 0.9
        for: 2m
        labels:
          severity: critical
          service: permission-service
        annotations:
          summary: "Database connection pool near exhaustion"
          description: "Connection pool usage is {{ $value | humanizePercentage }} on {{ $labels.instance }}"
          runbook: "https://wiki.company.com/runbooks/db-connection-pool-exhaustion"

  - name: database
    interval: 30s
    rules:
      # High database CPU
      - alert: HighDatabaseCPU
        expr: |
          aws_rds_cpuutilization_average{dbinstance_identifier=~"permission-system-aurora.*"} > 80
        for: 5m
        labels:
          severity: warning
          service: database
        annotations:
          summary: "High CPU on database {{ $labels.dbinstance_identifier }}"
          description: "CPU usage is {{ $value }}%"

      # Low database storage
      - alert: LowDatabaseStorage
        expr: |
          aws_rds_free_storage_space_average{dbinstance_identifier=~"permission-system-aurora.*"} < 10737418240
        for: 5m
        labels:
          severity: warning
          service: database
        annotations:
          summary: "Low storage on database {{ $labels.dbinstance_identifier }}"
          description: "Free storage is {{ $value | humanize1024 }}B (threshold: 10GB)"

      # High database connections
      - alert: HighDatabaseConnections
        expr: |
          aws_rds_database_connections_average{dbinstance_identifier=~"permission-system-aurora.*"} > 800
        for: 5m
        labels:
          severity: warning
          service: database
        annotations:
          summary: "High database connections"
          description: "{{ $labels.dbinstance_identifier }} has {{ $value }} connections (threshold: 800)"

  - name: redis
    interval: 30s
    rules:
      # High Redis memory
      - alert: HighRedisMemory
        expr: |
          (redis_memory_used_bytes / redis_memory_max_bytes) > 0.85
        for: 5m
        labels:
          severity: warning
          service: redis
        annotations:
          summary: "High Redis memory usage"
          description: "Redis memory usage is {{ $value | humanizePercentage }}"

      # Redis eviction rate
      - alert: HighRedisEvictionRate
        expr: |
          rate(redis_evicted_keys_total[5m]) > 100
        for: 5m
        labels:
          severity: warning
          service: redis
        annotations:
          summary: "High Redis eviction rate"
          description: "Redis is evicting {{ $value }} keys/sec"
          runbook: "https://wiki.company.com/runbooks/redis-evictions"
```

---

## Troubleshooting

### Common Issues

#### 1. High Latency

**Symptoms:**
- P95 latency > 500ms
- Slow API responses
- User complaints

**Investigation:**

```bash
# Check current latency
kubectl exec -n permission-system deployment/permission-service -- \
  curl localhost:8080/actuator/metrics/http.server.requests | jq '.measurements'

# Check cache hit rate
kubectl exec -n permission-system deployment/permission-service -- \
  curl localhost:8080/actuator/metrics/permission.cache.hit.rate | jq '.measurements'

# Check database query performance
kubectl logs -n permission-system deployment/permission-service | \
  grep "SlowQuery" | tail -20

# Check Redis latency
redis-cli --latency-history

# Check database slow queries
aws rds describe-db-log-files \
  --db-instance-identifier permission-system-aurora-writer \
  --filename-contains slow
```

**Resolution:**

1. **If cache hit rate is low (<80%)**:
   ```bash
   # Check cache configuration
   kubectl get configmap app-config -n permission-system -o yaml

   # Increase cache TTL if appropriate
   kubectl patch configmap app-config -n permission-system \
     --patch '{"data":{"CACHE_TTL":"600"}}'

   # Restart pods
   kubectl rollout restart deployment/permission-service -n permission-system
   ```

2. **If database queries are slow**:
   ```sql
   -- Check for missing indexes
   SELECT schemaname, tablename, attname, n_distinct, correlation
   FROM pg_stats
   WHERE schemaname = 'public'
   ORDER BY correlation;

   -- Analyze table statistics
   ANALYZE resource_permissions;

   -- Refresh materialized view
   REFRESH MATERIALIZED VIEW CONCURRENTLY materialized_user_permissions;
   ```

3. **If application is CPU-bound**:
   ```bash
   # Scale horizontally
   kubectl scale deployment/permission-service \
     -n permission-system \
     --replicas=10
   ```

#### 2. High Error Rate

**Symptoms:**
- Error rate > 1%
- 500 errors in logs
- Failed permission checks

**Investigation:**

```bash
# Check error logs
kubectl logs -n permission-system deployment/permission-service \
  --tail=100 | grep ERROR

# Check application metrics
kubectl exec -n permission-system deployment/permission-service -- \
  curl localhost:8080/actuator/metrics/http.server.requests | \
  jq '.availableTags[] | select(.tag == "status") | .values'

# Check database connectivity
kubectl exec -n permission-system deployment/permission-service -- \
  curl localhost:8080/actuator/health | jq '.components.db'

# Check Redis connectivity
kubectl exec -n permission-system deployment/permission-service -- \
  curl localhost:8080/actuator/health | jq '.components.redis'
```

**Resolution:**

1. **If database connection errors**:
   ```bash
   # Check database status
   aws rds describe-db-clusters \
     --db-cluster-identifier permission-system-aurora

   # Check connection pool
   kubectl logs -n permission-system deployment/permission-service | \
     grep "HikariPool"

   # Increase connection pool if needed
   kubectl set env deployment/permission-service \
     -n permission-system \
     SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=50
   ```

2. **If Redis connection errors**:
   ```bash
   # Check Redis cluster status
   aws elasticache describe-replication-groups \
     --replication-group-id permission-system-redis

   # Test Redis connectivity
   kubectl run redis-cli --rm -it --image=redis:7-alpine -- \
     redis-cli -h <redis-endpoint> -p 6379 PING
   ```

3. **If application errors**:
   ```bash
   # Get thread dump
   kubectl exec -n permission-system deployment/permission-service -- \
     curl localhost:8080/actuator/threaddump > threaddump.json

   # Get heap dump
   kubectl exec -n permission-system deployment/permission-service -- \
     curl -X POST localhost:8080/actuator/heapdump > heapdump.hprof

   # Analyze with VisualVM or JProfiler
   ```

#### 3. Memory Leak

**Symptoms:**
- Increasing memory usage over time
- OOMKilled pods
- Frequent pod restarts

**Investigation:**

```bash
# Check memory usage
kubectl top pods -n permission-system

# Get memory metrics
kubectl exec -n permission-system deployment/permission-service -- \
  curl localhost:8080/actuator/metrics/jvm.memory.used | jq

# Check for OOMKilled
kubectl get pods -n permission-system -o json | \
  jq '.items[] | select(.status.containerStatuses[].lastState.terminated.reason == "OOMKilled")'

# Get heap dump
kubectl exec -n permission-system deployment/permission-service -- \
  curl -X POST localhost:8080/actuator/heapdump > heapdump-$(date +%s).hprof
```

**Resolution:**

1. **Increase memory limits**:
   ```bash
   kubectl patch deployment permission-service -n permission-system \
     --patch '{"spec":{"template":{"spec":{"containers":[{"name":"permission-service","resources":{"limits":{"memory":"12Gi"}}}]}}}}'
   ```

2. **Analyze heap dump** with Eclipse MAT or VisualVM

3. **Enable GC logging**:
   ```bash
   kubectl set env deployment/permission-service -n permission-system \
     JAVA_OPTS="-Xms4g -Xmx8g -XX:+UseG1GC -XX:+PrintGCDetails -XX:+PrintGCDateStamps"
   ```

---

## Runbooks

### Runbook 1: Handle Database Failover

**Scenario:** Primary database instance fails

**Steps:**

1. **Verify failover has occurred**:
   ```bash
   aws rds describe-db-clusters \
     --db-cluster-identifier permission-system-aurora \
     --query 'DBClusters[0].Endpoint'
   ```

2. **Check application connectivity**:
   ```bash
   kubectl logs -n permission-system deployment/permission-service | \
     grep "connection" | tail -20
   ```

3. **If application not recovering**:
   ```bash
   # Restart pods to re-establish connections
   kubectl rollout restart deployment/permission-service -n permission-system
   kubectl rollout restart deployment/audit-service -n permission-system
   kubectl rollout restart deployment/policy-service -n permission-system
   ```

4. **Verify recovery**:
   ```bash
   # Check error rate
   kubectl exec -n permission-system deployment/permission-service -- \
     curl localhost:8080/actuator/metrics/http.server.requests

   # Check database health
   kubectl exec -n permission-system deployment/permission-service -- \
     curl localhost:8080/actuator/health | jq '.components.db'
   ```

5. **Post-incident**:
   - Review CloudWatch logs
   - Update incident report
   - Schedule postmortem

### Runbook 2: Handle Traffic Spike

**Scenario:** Unexpected traffic spike causing degraded performance

**Steps:**

1. **Verify traffic spike**:
   ```bash
   # Check request rate
   kubectl exec -n permission-system deployment/permission-service -- \
     curl localhost:8080/actuator/metrics/http.server.requests | \
     jq '.measurements[0].value'
   ```

2. **Scale up immediately**:
   ```bash
   # Permission Service
   kubectl scale deployment/permission-service \
     -n permission-system \
     --replicas=15

   # Other services
   kubectl scale deployment/audit-service -n permission-system --replicas=8
   kubectl scale deployment/policy-service -n permission-system --replicas=8
   ```

3. **Monitor scaling**:
   ```bash
   # Watch pod status
   kubectl get pods -n permission-system -w

   # Check HPA status
   kubectl get hpa -n permission-system
   ```

4. **Verify performance**:
   ```bash
   # Check latency
   kubectl exec -n permission-system deployment/permission-service -- \
     curl localhost:8080/actuator/metrics/http.server.requests | \
     jq '.measurements[] | select(.statistic == "COUNT")'

   # Check error rate
   kubectl logs -n permission-system deployment/permission-service | \
     grep "ERROR" | wc -l
   ```

5. **Scale database if needed**:
   ```bash
   # Add read replica
   aws rds create-db-instance \
     --db-instance-identifier permission-system-aurora-reader-3 \
     --db-instance-class db.r6g.2xlarge \
     --engine aurora-postgresql \
     --db-cluster-identifier permission-system-aurora
   ```

### Runbook 3: Handle Security Incident

**Scenario:** Suspected unauthorized access or security breach

**Steps:**

1. **Assess severity**:
   - Review security alerts
   - Check CloudWatch logs for suspicious activity
   - Review Keycloak audit logs

2. **Immediate containment**:
   ```bash
   # Rotate Keycloak client secrets
   kubectl delete secret keycloak-client-secret -n permission-system
   kubectl create secret generic keycloak-client-secret \
     --from-literal=client-secret=$(openssl rand -base64 32) \
     -n permission-system

   # Force logout all users
   # (execute via Keycloak admin console)

   # Rotate database credentials
   aws secretsmanager update-secret \
     --secret-id permission-system/rds/master-password \
     --secret-string "$(aws secretsmanager get-random-password --output text)"
   ```

3. **Investigation**:
   ```bash
   # Export audit logs
   kubectl logs -n permission-system deployment/audit-service \
     --since=24h > audit-logs-$(date +%s).log

   # Export CloudWatch logs
   aws logs tail /aws/eks/permission-system-prod/cluster \
     --since 24h > cloudwatch-$(date +%s).log

   # Check for unauthorized API calls
   kubectl logs -n permission-system deployment/permission-service | \
     grep "403\|401" | tail -100
   ```

4. **Communication**:
   - Notify security team
   - Prepare incident report
   - Contact affected users if needed

5. **Recovery**:
   - Apply security patches
   - Update WAF rules
   - Conduct security audit

---

## Maintenance Procedures

### Database Maintenance

#### 1. Backup and Restore

**Manual backup**:
```bash
# Create snapshot
aws rds create-db-cluster-snapshot \
  --db-cluster-identifier permission-system-aurora \
  --db-cluster-snapshot-identifier permission-system-manual-$(date +%Y%m%d-%H%M%S)

# Verify snapshot
aws rds describe-db-cluster-snapshots \
  --db-cluster-snapshot-identifier permission-system-manual-*
```

**Restore from snapshot**:
```bash
# Restore to new cluster
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier permission-system-aurora-restore \
  --snapshot-identifier permission-system-manual-20240101-120000 \
  --engine aurora-postgresql

# Create instances
aws rds create-db-instance \
  --db-instance-identifier permission-system-aurora-restore-writer \
  --db-instance-class db.r6g.2xlarge \
  --engine aurora-postgresql \
  --db-cluster-identifier permission-system-aurora-restore
```

#### 2. Index Maintenance

**`scripts/database-maintenance.sql`**:

```sql
-- Reindex tables
REINDEX TABLE resource_permissions;
REINDEX TABLE audit_logs;
REINDEX TABLE user_permissions;

-- Analyze tables
ANALYZE resource_permissions;
ANALYZE audit_logs;
ANALYZE user_permissions;

-- Refresh materialized views
REFRESH MATERIALIZED VIEW CONCURRENTLY materialized_user_permissions;

-- Vacuum
VACUUM ANALYZE resource_permissions;
VACUUM ANALYZE audit_logs;

-- Check bloat
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS external_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Kubernetes Maintenance

#### 1. Node Upgrades

```bash
# Drain node
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# Upgrade node (via EKS managed node group)
aws eks update-nodegroup-version \
  --cluster-name permission-system-eks-prod \
  --nodegroup-name application

# Uncordon node
kubectl uncordon <node-name>
```

#### 2. Certificate Rotation

```bash
# Check certificate expiration
kubectl get certificate -n permission-system

# Renew certificate (cert-manager)
kubectl delete certificate permission-system-tls -n permission-system
# cert-manager will auto-renew

# Verify new certificate
kubectl describe certificate permission-system-tls -n permission-system
```

---

## Disaster Recovery

### Recovery Time Objectives (RTO)

| Scenario | RTO | RPO |
|----------|-----|-----|
| Single pod failure | < 1 minute | 0 |
| Service degradation | < 5 minutes | 0 |
| Database failover | < 2 minutes | < 1 minute |
| AZ failure | < 10 minutes | < 5 minutes |
| Regional outage | < 1 hour | < 15 minutes |

### DR Procedures

#### Regional Failover

**Prerequisites:**
- Multi-region deployment active
- Route 53 health checks configured
- Cross-region database replication

**Steps:**

1. **Activate DR region**:
   ```bash
   # Switch Route 53 to DR region
   aws route53 change-resource-record-sets \
     --hosted-zone-id Z1234567890ABC \
     --change-batch file://failover.json
   ```

2. **Promote read replica**:
   ```bash
   aws rds promote-read-replica \
     --db-instance-identifier permission-system-aurora-dr-writer
   ```

3. **Update application config**:
   ```bash
   kubectl set env deployment/permission-service \
     -n permission-system \
     DATABASE_URL=<dr-database-endpoint>
   ```

4. **Verify DR region**:
   ```bash
   curl https://api.your-domain.com/actuator/health
   ```

---

## On-Call Guide

### On-Call Checklist

- [ ] Access to AWS console
- [ ] kubectl configured for all clusters
- [ ] VPN access
- [ ] PagerDuty app installed
- [ ] Slack permissions
- [ ] Runbooks bookmarked
- [ ] Emergency contacts list

### Escalation Path

1. **L1 - On-call engineer** (15 minutes response)
2. **L2 - Senior engineer** (30 minutes response)
3. **L3 - Engineering manager** (1 hour response)
4. **L4 - VP Engineering** (Critical incidents only)

### Communication Templates

**Status update (Slack)**:
```
🔴 INCIDENT UPDATE

Status: Investigating / Identified / Monitoring / Resolved
Impact: <describe user impact>
Started: <timestamp>
Duration: <duration>

Details:
<brief description>

Next update in 30 minutes or when resolved.
```

**Customer communication**:
```
We are currently experiencing [issue description]. Our team is actively investigating
and working on a resolution. We will provide updates every 30 minutes.

Current status: [status]
Estimated resolution: [time or "unknown"]
```

---

**Related Documentation**:
- [AWS_INFRASTRUCTURE.md](./AWS_INFRASTRUCTURE.md) - Infrastructure setup
- [KUBERNETES_DEPLOYMENT.md](./KUBERNETES_DEPLOYMENT.md) - K8s deployment
- [CICD_PIPELINE.md](./CICD_PIPELINE.md) - CI/CD pipeline
