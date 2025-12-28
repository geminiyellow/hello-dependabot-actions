# Kubernetes 部署配置指南

> 适用于 Amazon EKS 或任何标准 Kubernetes 集群

---

## 1. 命名空间和配置

### 1.1 命名空间

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: permission-system
  labels:
    name: permission-system
    environment: production
```

### 1.2 ConfigMap

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: permission-config
  namespace: permission-system
data:
  # Application 配置
  application.yml: |
    spring:
      application:
        name: permission-service
      profiles:
        active: production

      # 数据库配置
      datasource:
        url: jdbc:postgresql://${DB_HOST}:5432/${DB_NAME}
        driver-class-name: org.postgresql.Driver
        hikari:
          maximum-pool-size: 20
          minimum-idle: 5
          connection-timeout: 30000
          idle-timeout: 600000
          max-lifetime: 1800000

      # JPA配置
      jpa:
        hibernate:
          ddl-auto: validate
        properties:
          hibernate:
            dialect: org.hibernate.dialect.PostgreSQLDialect
            jdbc:
              batch_size: 20
            order_inserts: true
            order_updates: true

      # Redis配置
      data:
        redis:
          host: ${REDIS_HOST}
          port: 6379
          lettuce:
            pool:
              max-active: 20
              max-idle: 10
              min-idle: 5

      # Kafka配置
      kafka:
        bootstrap-servers: ${KAFKA_BROKERS}
        producer:
          key-serializer: org.apache.kafka.common.serialization.StringSerializer
          value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
          acks: all
          retries: 3
        consumer:
          group-id: permission-audit
          key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
          value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer

    # Eureka配置
    eureka:
      client:
        service-url:
          defaultZone: http://eureka-server:8761/eureka/
        registry-fetch-interval-seconds: 10
      instance:
        prefer-ip-address: true
        lease-renewal-interval-in-seconds: 10
        lease-expiration-duration-in-seconds: 30

    # Keycloak配置
    keycloak:
      realm: permission-system
      auth-server-url: ${KEYCLOAK_URL}
      ssl-required: external
      resource: permission-service
      bearer-only: true
      use-resource-role-mappings: true

    # 监控配置
    management:
      endpoints:
        web:
          exposure:
            include: health,info,metrics,prometheus
      metrics:
        export:
          prometheus:
            enabled: true
      health:
        livenessState:
          enabled: true
        readinessState:
          enabled: true

    # 缓存配置
    permission:
      cache:
        l1:
          enabled: true
          max-size: 10000
          ttl-seconds: 60
        l2:
          enabled: true
          ttl-seconds: 300
        l3:
          enabled: true
          refresh-interval-minutes: 5

    # 性能配置
    server:
      tomcat:
        threads:
          max: 200
          min-spare: 10
        max-connections: 8192
        accept-count: 100
      compression:
        enabled: true
        min-response-size: 1024

  # Logback 配置
  logback-spring.xml: |
    <?xml version="1.0" encoding="UTF-8"?>
    <configuration>
        <include resource="org/springframework/boot/logging/logback/defaults.xml"/>

        <springProperty scope="context" name="APP_NAME" source="spring.application.name"/>

        <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
            <encoder>
                <pattern>%d{ISO8601} [%thread] %-5level %logger{36} - %msg%n</pattern>
            </encoder>
        </appender>

        <appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
            <encoder class="net.logstash.logback.encoder.LogstashEncoder">
                <customFields>{"service":"${APP_NAME}"}</customFields>
            </encoder>
        </appender>

        <root level="INFO">
            <appender-ref ref="JSON" />
        </root>

        <logger name="com.example.permission" level="DEBUG"/>
        <logger name="org.springframework.web" level="INFO"/>
        <logger name="org.hibernate" level="WARN"/>
    </configuration>
```

### 1.3 Secrets

```yaml
# secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: permission-secrets
  namespace: permission-system
type: Opaque
data:
  # Base64 编码的敏感数据
  DB_PASSWORD: <base64-encoded>
  REDIS_PASSWORD: <base64-encoded>
  KEYCLOAK_CLIENT_SECRET: <base64-encoded>
  JWT_SECRET: <base64-encoded>

---
# 使用 AWS Secrets Manager (推荐)
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: permission-aws-secrets
  namespace: permission-system
spec:
  provider: aws
  parameters:
    objects: |
      - objectName: "prod/permission-system/db-password"
        objectType: "secretsmanager"
        objectAlias: "DB_PASSWORD"
      - objectName: "prod/permission-system/redis-password"
        objectType: "secretsmanager"
        objectAlias: "REDIS_PASSWORD"
      - objectName: "prod/permission-system/keycloak-secret"
        objectType: "secretsmanager"
        objectAlias: "KEYCLOAK_CLIENT_SECRET"
```

---

## 2. 核心服务部署

### 2.1 Permission Service

```yaml
# permission-service-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: permission-service
  namespace: permission-system
  labels:
    app: permission-service
    version: v1
spec:
  replicas: 5  # 至少5个副本
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2
      maxUnavailable: 1
  selector:
    matchLabels:
      app: permission-service
  template:
    metadata:
      labels:
        app: permission-service
        version: v1
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8082"
        prometheus.io/path: "/actuator/prometheus"
    spec:
      # Pod 反亲和性（确保跨节点分布）
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - permission-service
                topologyKey: kubernetes.io/hostname

      # 服务账号
      serviceAccountName: permission-service-sa

      # 容器配置
      containers:
        - name: permission-service
          image: <AWS_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/permission-service:latest
          imagePullPolicy: Always

          ports:
            - name: http
              containerPort: 8082
              protocol: TCP
            - name: metrics
              containerPort: 8082

          # 环境变量
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: "production"
            - name: DB_HOST
              value: "permission-db.cluster-xxxxx.us-east-1.rds.amazonaws.com"
            - name: DB_NAME
              value: "permission_db"
            - name: DB_USER
              valueFrom:
                secretKeyRef:
                  name: permission-secrets
                  key: DB_USER
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: permission-secrets
                  key: DB_PASSWORD
            - name: REDIS_HOST
              value: "permission-redis.xxxxx.cache.amazonaws.com"
            - name: REDIS_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: permission-secrets
                  key: REDIS_PASSWORD
            - name: KEYCLOAK_URL
              value: "https://auth.example.com"
            - name: KEYCLOAK_CLIENT_SECRET
              valueFrom:
                secretKeyRef:
                  name: permission-secrets
                  key: KEYCLOAK_CLIENT_SECRET
            - name: KAFKA_BROKERS
              value: "b-1.permission-kafka.xxxxx.kafka.us-east-1.amazonaws.com:9092"

            # JVM 参数
            - name: JAVA_OPTS
              value: "-Xms2g -Xmx4g -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:+UseStringDeduplication"

          # 资源限制
          resources:
            requests:
              cpu: "2"
              memory: "4Gi"
            limits:
              cpu: "4"
              memory: "8Gi"

          # 健康检查
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8082
            initialDelaySeconds: 60
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3

          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8082
            initialDelaySeconds: 30
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3

          # 启动探针
          startupProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8082
            initialDelaySeconds: 0
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 30

          # 卷挂载
          volumeMounts:
            - name: config
              mountPath: /config
            - name: logs
              mountPath: /logs

      # 卷定义
      volumes:
        - name: config
          configMap:
            name: permission-config
        - name: logs
          emptyDir: {}

---
# Service
apiVersion: v1
kind: Service
metadata:
  name: permission-service
  namespace: permission-system
  labels:
    app: permission-service
spec:
  type: ClusterIP
  ports:
    - port: 8082
      targetPort: 8082
      protocol: TCP
      name: http
  selector:
    app: permission-service

---
# Horizontal Pod Autoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: permission-service-hpa
  namespace: permission-system
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: permission-service
  minReplicas: 5
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "1000"

  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60

---
# Pod Disruption Budget
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: permission-service-pdb
  namespace: permission-system
spec:
  minAvailable: 3
  selector:
    matchLabels:
      app: permission-service
```

### 2.2 API Gateway

```yaml
# api-gateway-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: permission-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
        - name: api-gateway
          image: <AWS_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/api-gateway:latest
          ports:
            - containerPort: 8080
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: "production"
            - name: EUREKA_CLIENT_SERVICEURL_DEFAULTZONE
              value: "http://eureka-server:8761/eureka/"
          resources:
            requests:
              cpu: "1"
              memory: "2Gi"
            limits:
              cpu: "2"
              memory: "4Gi"
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 20
            periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: api-gateway
  namespace: permission-system
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
    service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: "true"
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8080
      protocol: TCP
  selector:
    app: api-gateway
```

### 2.3 Keycloak

```yaml
# keycloak-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: keycloak
  namespace: permission-system
spec:
  serviceName: keycloak-headless
  replicas: 3
  selector:
    matchLabels:
      app: keycloak
  template:
    metadata:
      labels:
        app: keycloak
    spec:
      containers:
        - name: keycloak
          image: quay.io/keycloak/keycloak:23.0
          args:
            - start
            - --cache-stack=kubernetes
            - --hostname-strict=false
            - --proxy=edge
          env:
            - name: KC_DB
              value: "postgres"
            - name: KC_DB_URL
              value: "jdbc:postgresql://keycloak-db.cluster-xxxxx.us-east-1.rds.amazonaws.com:5432/keycloak_db"
            - name: KC_DB_USERNAME
              valueFrom:
                secretKeyRef:
                  name: permission-secrets
                  key: DB_USER
            - name: KC_DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: permission-secrets
                  key: DB_PASSWORD
            - name: KEYCLOAK_ADMIN
              value: "admin"
            - name: KEYCLOAK_ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: permission-secrets
                  key: KEYCLOAK_ADMIN_PASSWORD
            - name: KC_HEALTH_ENABLED
              value: "true"
            - name: KC_METRICS_ENABLED
              value: "true"
            - name: KC_HOSTNAME
              value: "auth.example.com"
            - name: JAVA_OPTS_APPEND
              value: "-Xms1g -Xmx2g -XX:MetaspaceSize=96M -XX:MaxMetaspaceSize=256m -Djava.net.preferIPv4Stack=true"
            - name: jgroups.dns.query
              value: "keycloak-headless.permission-system.svc.cluster.local"
          ports:
            - name: http
              containerPort: 8080
            - name: https
              containerPort: 8443
          resources:
            requests:
              cpu: "1"
              memory: "2Gi"
            limits:
              cpu: "2"
              memory: "4Gi"
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8080
            initialDelaySeconds: 300
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            initialDelaySeconds: 60
            periodSeconds: 10

---
apiVersion: v1
kind: Service
metadata:
  name: keycloak
  namespace: permission-system
spec:
  type: ClusterIP
  ports:
    - port: 8080
      targetPort: 8080
      name: http
  selector:
    app: keycloak

---
apiVersion: v1
kind: Service
metadata:
  name: keycloak-headless
  namespace: permission-system
spec:
  type: ClusterIP
  clusterIP: None
  ports:
    - port: 8080
      targetPort: 8080
      name: http
  selector:
    app: keycloak
```

---

## 3. Ingress 配置

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: permission-ingress
  namespace: permission-system
  annotations:
    # ALB annotations
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
    alb.ingress.kubernetes.io/ssl-redirect: '443'
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:123456789012:certificate/xxxxx
    alb.ingress.kubernetes.io/healthcheck-path: /actuator/health
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: '30'
    alb.ingress.kubernetes.io/healthcheck-timeout-seconds: '5'
    alb.ingress.kubernetes.io/healthy-threshold-count: '2'
    alb.ingress.kubernetes.io/unhealthy-threshold-count: '3'

    # CORS
    alb.ingress.kubernetes.io/actions.ssl-redirect: '{"Type": "redirect", "RedirectConfig": { "Protocol": "HTTPS", "Port": "443", "StatusCode": "HTTP_301"}}'

    # WAF
    alb.ingress.kubernetes.io/wafv2-acl-arn: arn:aws:wafv2:us-east-1:123456789012:regional/webacl/xxxxx

spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /api/v1/permission
            pathType: Prefix
            backend:
              service:
                name: permission-service
                port:
                  number: 8082

          - path: /api/v1/identity
            pathType: Prefix
            backend:
              service:
                name: identity-service
                port:
                  number: 8081

          - path: /api/v1/graphql
            pathType: Prefix
            backend:
              service:
                name: graphql-gateway
                port:
                  number: 8084

    - host: auth.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: keycloak
                port:
                  number: 8080

  tls:
    - hosts:
        - api.example.com
        - auth.example.com
      secretName: tls-secret
```

---

## 4. 监控配置

### 4.1 ServiceMonitor (Prometheus Operator)

```yaml
# servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: permission-service-monitor
  namespace: permission-system
  labels:
    app: permission-service
spec:
  selector:
    matchLabels:
      app: permission-service
  endpoints:
    - port: metrics
      path: /actuator/prometheus
      interval: 30s
      scrapeTimeout: 10s
```

### 4.2 Prometheus Rules

```yaml
# prometheus-rules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: permission-service-alerts
  namespace: permission-system
spec:
  groups:
    - name: permission-service
      interval: 30s
      rules:
        # 高错误率
        - alert: HighErrorRate
          expr: |
            rate(http_server_requests_seconds_count{status=~"5..", job="permission-service"}[5m]) > 0.05
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "High error rate on Permission Service"
            description: "Error rate is {{ $value }} errors per second"

        # 高延迟
        - alert: HighLatency
          expr: |
            histogram_quantile(0.95, rate(http_server_requests_seconds_bucket{job="permission-service"}[5m])) > 0.5
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "High latency on Permission Service"
            description: "P95 latency is {{ $value }} seconds"

        # 低缓存命中率
        - alert: LowCacheHitRate
          expr: |
            rate(cache_gets_total{result="hit", job="permission-service"}[5m])
            /
            rate(cache_gets_total{job="permission-service"}[5m])
            < 0.7
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Low cache hit rate"
            description: "Cache hit rate is {{ $value | humanizePercentage }}"

        # Pod 不可用
        - alert: PodDown
          expr: |
            up{job="permission-service"} == 0
          for: 2m
          labels:
            severity: critical
          annotations:
            summary: "Permission Service pod is down"
            description: "Pod {{ $labels.pod }} is down"

        # 数据库连接池耗尽
        - alert: DBConnectionPoolExhausted
          expr: |
            hikaricp_connections_active{job="permission-service"} / hikaricp_connections_max{job="permission-service"} > 0.9
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Database connection pool almost exhausted"
            description: "Connection pool usage is {{ $value | humanizePercentage }}"
```

---

## 5. 网络策略

```yaml
# network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: permission-service-network-policy
  namespace: permission-system
spec:
  podSelector:
    matchLabels:
      app: permission-service
  policyTypes:
    - Ingress
    - Egress

  # 入站规则
  ingress:
    # 允许来自 API Gateway 的流量
    - from:
        - podSelector:
            matchLabels:
              app: api-gateway
      ports:
        - protocol: TCP
          port: 8082

    # 允许来自 Prometheus 的流量
    - from:
        - namespaceSelector:
            matchLabels:
              name: monitoring
      ports:
        - protocol: TCP
          port: 8082

  # 出站规则
  egress:
    # 允许访问 PostgreSQL
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432

    # 允许访问 Redis
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379

    # 允许访问 Keycloak
    - to:
        - podSelector:
            matchLabels:
              app: keycloak
      ports:
        - protocol: TCP
          port: 8080

    # 允许访问 Eureka
    - to:
        - podSelector:
            matchLabels:
              app: eureka-server
      ports:
        - protocol: TCP
          port: 8761

    # 允许 DNS
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: UDP
          port: 53
```

---

## 6. 部署脚本

```bash
#!/bin/bash
# deploy.sh

set -e

# 变量
NAMESPACE="permission-system"
REGION="us-east-1"
CLUSTER_NAME="permission-eks-cluster"
AWS_ACCOUNT_ID="123456789012"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}部署 Permission System 到 Kubernetes${NC}"
echo -e "${GREEN}========================================${NC}"

# 1. 更新 kubeconfig
echo -e "${YELLOW}1. 更新 kubeconfig...${NC}"
aws eks update-kubeconfig --region ${REGION} --name ${CLUSTER_NAME}

# 2. 创建命名空间
echo -e "${YELLOW}2. 创建命名空间...${NC}"
kubectl apply -f namespace.yaml

# 3. 创建 Secrets
echo -e "${YELLOW}3. 创建 Secrets...${NC}"
kubectl apply -f secrets.yaml

# 4. 创建 ConfigMaps
echo -e "${YELLOW}4. 创建 ConfigMaps...${NC}"
kubectl apply -f configmap.yaml

# 5. 部署基础设施组件
echo -e "${YELLOW}5. 部署基础设施组件...${NC}"
kubectl apply -f eureka-server-deployment.yaml
kubectl apply -f config-server-deployment.yaml

# 等待基础设施就绪
echo -e "${YELLOW}等待基础设施就绪...${NC}"
kubectl wait --for=condition=ready pod -l app=eureka-server -n ${NAMESPACE} --timeout=300s
kubectl wait --for=condition=ready pod -l app=config-server -n ${NAMESPACE} --timeout=300s

# 6. 部署 Keycloak
echo -e "${YELLOW}6. 部署 Keycloak...${NC}"
kubectl apply -f keycloak-statefulset.yaml

# 等待 Keycloak 就绪
kubectl wait --for=condition=ready pod -l app=keycloak -n ${NAMESPACE} --timeout=600s

# 7. 部署核心服务
echo -e "${YELLOW}7. 部署核心服务...${NC}"
kubectl apply -f identity-service-deployment.yaml
kubectl apply -f permission-service-deployment.yaml
kubectl apply -f api-gateway-deployment.yaml
kubectl apply -f audit-service-deployment.yaml

# 8. 部署 Ingress
echo -e "${YELLOW}8. 部署 Ingress...${NC}"
kubectl apply -f ingress.yaml

# 9. 部署监控
echo -e "${YELLOW}9. 部署监控...${NC}"
kubectl apply -f servicemonitor.yaml
kubectl apply -f prometheus-rules.yaml

# 10. 部署网络策略
echo -e "${YELLOW}10. 部署网络策略...${NC}"
kubectl apply -f network-policy.yaml

# 11. 验证部署
echo -e "${YELLOW}11. 验证部署...${NC}"
kubectl get pods -n ${NAMESPACE}
kubectl get svc -n ${NAMESPACE}
kubectl get ingress -n ${NAMESPACE}

# 12. 检查健康状态
echo -e "${YELLOW}12. 检查健康状态...${NC}"
for service in permission-service identity-service api-gateway; do
    echo -e "检查 ${service}..."
    kubectl wait --for=condition=ready pod -l app=${service} -n ${NAMESPACE} --timeout=300s
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ ${service} 就绪${NC}"
    else
        echo -e "${RED}✗ ${service} 未就绪${NC}"
        exit 1
    fi
done

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"

# 显示访问信息
echo -e "${YELLOW}访问信息:${NC}"
INGRESS_URL=$(kubectl get ingress permission-ingress -n ${NAMESPACE} -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo -e "API Gateway: https://${INGRESS_URL}"
echo -e "Keycloak: https://auth.example.com"
```

---

## 7. 滚动更新

```bash
#!/bin/bash
# rolling-update.sh

NAMESPACE="permission-system"
SERVICE="permission-service"
IMAGE_TAG=$1

if [ -z "$IMAGE_TAG" ]; then
    echo "Usage: ./rolling-update.sh <image-tag>"
    exit 1
fi

echo "开始滚动更新 ${SERVICE} 到版本 ${IMAGE_TAG}..."

# 更新镜像
kubectl set image deployment/${SERVICE} \
    ${SERVICE}=${ECR_REGISTRY}/${SERVICE}:${IMAGE_TAG} \
    -n ${NAMESPACE}

# 监控滚动更新状态
kubectl rollout status deployment/${SERVICE} -n ${NAMESPACE}

# 验证新版本
echo "验证新版本..."
NEW_POD=$(kubectl get pod -n ${NAMESPACE} -l app=${SERVICE} -o jsonpath='{.items[0].metadata.name}')
kubectl logs ${NEW_POD} -n ${NAMESPACE} --tail=50

echo "滚动更新完成！"
```

---

继续创建配置管理和运维手册文档？