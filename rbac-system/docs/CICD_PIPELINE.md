# CI/CD Pipeline Guide

Complete CI/CD pipeline setup for the Permission Management System using GitHub Actions, AWS ECR, and Amazon EKS.

## Table of Contents

1. [Pipeline Overview](#pipeline-overview)
2. [Prerequisites](#prerequisites)
3. [GitHub Actions Workflows](#github-actions-workflows)
4. [Docker Build Pipeline](#docker-build-pipeline)
5. [Deployment Pipeline](#deployment-pipeline)
6. [Rollback Procedures](#rollback-procedures)
7. [Security Scanning](#security-scanning)
8. [Environment Management](#environment-management)
9. [Monitoring and Notifications](#monitoring-and-notifications)

---

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Repository                             │
│                                                                   │
│  Developer Push → Pull Request → Code Review → Merge to Main    │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                  GitHub Actions Workflow                         │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ Test Stage   │→ │ Build Stage  │→ │ Deploy Stage        │  │
│  │              │  │              │  │                     │  │
│  │ • Unit Tests │  │ • Maven      │  │ • Dev (auto)        │  │
│  │ • Integration│  │ • Docker     │  │ • Staging (manual)  │  │
│  │ • Security   │  │ • Push ECR   │  │ • Prod (manual)     │  │
│  └──────────────┘  └──────────────┘  └─────────────────────┘  │
│                                                                   │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AWS Infrastructure                            │
│                                                                   │
│  ECR → EKS Cluster → Application Load Balancer → Users          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### GitHub Secrets Configuration

Configure the following secrets in your GitHub repository (`Settings` → `Secrets and variables` → `Actions`):

```bash
# AWS Credentials
AWS_ACCOUNT_ID                    # AWS account ID
AWS_ACCESS_KEY_ID                 # IAM user access key for CI/CD
AWS_SECRET_ACCESS_KEY             # IAM user secret key
AWS_REGION                        # us-east-1

# EKS Configuration
EKS_CLUSTER_NAME_DEV              # permission-system-eks-dev
EKS_CLUSTER_NAME_STAGING          # permission-system-eks-staging
EKS_CLUSTER_NAME_PROD             # permission-system-eks-prod

# Container Registry
ECR_REPOSITORY_PERMISSION         # permission-service
ECR_REPOSITORY_AUDIT              # audit-service
ECR_REPOSITORY_POLICY             # policy-service

# Notifications
SLACK_WEBHOOK_URL                 # Slack webhook for notifications
PAGERDUTY_INTEGRATION_KEY         # PagerDuty for production alerts

# Code Quality
SONAR_TOKEN                       # SonarCloud token
SNYK_TOKEN                        # Snyk security scanning token
```

### IAM Policy for GitHub Actions

**`github-actions-policy.json`**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "eks:DescribeCluster",
        "eks:ListClusters"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
```

Create IAM user:

```bash
# Create IAM user for GitHub Actions
aws iam create-user --user-name github-actions-deployer

# Attach policy
aws iam put-user-policy \
  --user-name github-actions-deployer \
  --policy-name GitHubActionsPolicy \
  --policy-document file://github-actions-policy.json

# Create access key
aws iam create-access-key --user-name github-actions-deployer
```

---

## GitHub Actions Workflows

### Main CI/CD Workflow

**`.github/workflows/cicd.yml`**:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        type: choice
        options:
          - dev
          - staging
          - production

env:
  AWS_REGION: us-east-1
  JAVA_VERSION: '17'
  MAVEN_OPTS: -Xmx4g

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: testdb
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for SonarCloud

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
          cache: maven

      - name: Cache Maven dependencies
        uses: actions/cache@v3
        with:
          path: ~/.m2/repository
          key: ${{ runner.os }}-maven-${{ hashFiles('**/pom.xml') }}
          restore-keys: |
            ${{ runner.os }}-maven-

      - name: Run unit tests
        run: mvn test -B
        env:
          SPRING_PROFILES_ACTIVE: test

      - name: Run integration tests
        run: mvn verify -B -DskipUnitTests
        env:
          SPRING_PROFILES_ACTIVE: test
          DATABASE_URL: jdbc:postgresql://localhost:5432/testdb
          DATABASE_USER: test
          DATABASE_PASSWORD: test
          REDIS_HOST: localhost
          REDIS_PORT: 6379

      - name: Generate test coverage report
        run: mvn jacoco:report

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          file: ./target/site/jacoco/jacoco.xml
          flags: unittests
          name: codecov-umbrella

      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        with:
          args: >
            -Dsonar.projectKey=permission-system
            -Dsonar.organization=your-org
            -Dsonar.java.binaries=target/classes
            -Dsonar.coverage.jacoco.xmlReportPaths=target/site/jacoco/jacoco.xml

      - name: Archive test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: |
            target/surefire-reports/
            target/failsafe-reports/
          retention-days: 30

  security-scan:
    name: Security Scanning
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
          cache: maven

      - name: OWASP Dependency Check
        run: mvn org.owasp:dependency-check-maven:check

      - name: Snyk Security Scan
        uses: snyk/actions/maven@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

      - name: Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'

  build-and-push:
    name: Build and Push Docker Images
    needs: [test, security-scan]
    runs-on: ubuntu-latest
    if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'

    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}

    strategy:
      matrix:
        service: [permission-service, audit-service, policy-service]

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
          cache: maven

      - name: Build with Maven
        run: mvn clean package -DskipTests -pl ${{ matrix.service }} -am

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ steps.login-ecr.outputs.registry }}/${{ matrix.service }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: ./${{ matrix.service }}
          file: ./${{ matrix.service }}/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            BUILD_DATE=${{ github.event.head_commit.timestamp }}
            VCS_REF=${{ github.sha }}
            VERSION=${{ steps.meta.outputs.version }}

      - name: Scan Docker image with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ steps.login-ecr.outputs.registry }}/${{ matrix.service }}:${{ steps.meta.outputs.version }}
          format: 'sarif'
          output: 'trivy-image-results.sarif'

      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-image-results.sarif'

  deploy-dev:
    name: Deploy to Development
    needs: build-and-push
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    environment:
      name: development
      url: https://dev-api.your-domain.com

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Update kubeconfig
        run: |
          aws eks update-kubeconfig \
            --region ${{ env.AWS_REGION }} \
            --name ${{ secrets.EKS_CLUSTER_NAME_DEV }}

      - name: Deploy to Kubernetes
        run: |
          # Update image tags in manifests
          export IMAGE_TAG=${{ needs.build-and-push.outputs.image-tag }}
          envsubst < k8s/overlays/dev/kustomization.yaml | kubectl apply -f -

      - name: Verify deployment
        run: |
          kubectl rollout status deployment/permission-service -n permission-system --timeout=5m
          kubectl rollout status deployment/audit-service -n permission-system --timeout=5m
          kubectl rollout status deployment/policy-service -n permission-system --timeout=5m

      - name: Run smoke tests
        run: |
          export API_URL=https://dev-api.your-domain.com
          ./scripts/smoke-tests.sh

      - name: Notify Slack
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Deployment to DEV: ${{ job.status }}'
          webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}

  deploy-staging:
    name: Deploy to Staging
    needs: build-and-push
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment:
      name: staging
      url: https://staging-api.your-domain.com

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Update kubeconfig
        run: |
          aws eks update-kubeconfig \
            --region ${{ env.AWS_REGION }} \
            --name ${{ secrets.EKS_CLUSTER_NAME_STAGING }}

      - name: Deploy to Kubernetes
        run: |
          export IMAGE_TAG=${{ needs.build-and-push.outputs.image-tag }}
          envsubst < k8s/overlays/staging/kustomization.yaml | kubectl apply -f -

      - name: Verify deployment
        run: |
          kubectl rollout status deployment/permission-service -n permission-system --timeout=10m
          kubectl rollout status deployment/audit-service -n permission-system --timeout=10m
          kubectl rollout status deployment/policy-service -n permission-system --timeout=10m

      - name: Run integration tests
        run: |
          export API_URL=https://staging-api.your-domain.com
          ./scripts/integration-tests.sh

      - name: Run performance tests
        run: |
          export API_URL=https://staging-api.your-domain.com
          ./scripts/performance-tests.sh

      - name: Notify Slack
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Deployment to STAGING: ${{ job.status }}'
          webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}

  deploy-production:
    name: Deploy to Production
    needs: [build-and-push, deploy-staging]
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch' && github.event.inputs.environment == 'production'
    environment:
      name: production
      url: https://api.your-domain.com

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Update kubeconfig
        run: |
          aws eks update-kubeconfig \
            --region ${{ env.AWS_REGION }} \
            --name ${{ secrets.EKS_CLUSTER_NAME_PROD }}

      - name: Create deployment backup
        run: |
          kubectl get deployment permission-service -n permission-system -o yaml > backup-permission-service.yaml
          kubectl get deployment audit-service -n permission-system -o yaml > backup-audit-service.yaml
          kubectl get deployment policy-service -n permission-system -o yaml > backup-policy-service.yaml

      - name: Deploy to Kubernetes (Canary)
        run: |
          export IMAGE_TAG=${{ needs.build-and-push.outputs.image-tag }}
          # Deploy canary with 10% traffic
          kubectl patch deployment permission-service -n permission-system \
            -p '{"spec":{"template":{"spec":{"containers":[{"name":"permission-service","image":"'$IMAGE_TAG'"}]}}}}'
          kubectl set image deployment/permission-service-canary \
            permission-service=$IMAGE_TAG -n permission-system

      - name: Monitor canary metrics
        run: |
          # Wait 5 minutes and check error rate
          sleep 300
          ./scripts/check-canary-metrics.sh

      - name: Full rollout
        run: |
          export IMAGE_TAG=${{ needs.build-and-push.outputs.image-tag }}
          envsubst < k8s/overlays/production/kustomization.yaml | kubectl apply -f -

      - name: Verify deployment
        run: |
          kubectl rollout status deployment/permission-service -n permission-system --timeout=15m
          kubectl rollout status deployment/audit-service -n permission-system --timeout=15m
          kubectl rollout status deployment/policy-service -n permission-system --timeout=15m

      - name: Run smoke tests
        run: |
          export API_URL=https://api.your-domain.com
          ./scripts/smoke-tests.sh

      - name: Create Git tag
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git tag -a "v${{ github.run_number }}" -m "Production release ${{ github.run_number }}"
          git push origin "v${{ github.run_number }}"

      - name: Notify Slack - Success
        if: success()
        uses: 8398a7/action-slack@v3
        with:
          status: custom
          custom_payload: |
            {
              text: '🚀 Production Deployment Successful',
              attachments: [{
                color: 'good',
                text: `Version: v${{ github.run_number }}\nCommit: ${{ github.sha }}\nAuthor: ${{ github.actor }}`
              }]
            }
          webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}

      - name: Notify PagerDuty - Success
        if: success()
        run: |
          curl -X POST https://events.pagerduty.com/v2/enqueue \
            -H 'Content-Type: application/json' \
            -d '{
              "routing_key": "${{ secrets.PAGERDUTY_INTEGRATION_KEY }}",
              "event_action": "trigger",
              "payload": {
                "summary": "Production deployment successful - v${{ github.run_number }}",
                "severity": "info",
                "source": "GitHub Actions"
              }
            }'

      - name: Rollback on failure
        if: failure()
        run: |
          kubectl apply -f backup-permission-service.yaml
          kubectl apply -f backup-audit-service.yaml
          kubectl apply -f backup-policy-service.yaml

      - name: Notify Slack - Failure
        if: failure()
        uses: 8398a7/action-slack@v3
        with:
          status: custom
          custom_payload: |
            {
              text: '❌ Production Deployment Failed - Rolled Back',
              attachments: [{
                color: 'danger',
                text: `Version: v${{ github.run_number }}\nCommit: ${{ github.sha }}\nAuthor: ${{ github.actor }}`
              }]
            }
          webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}

      - name: Notify PagerDuty - Failure
        if: failure()
        run: |
          curl -X POST https://events.pagerduty.com/v2/enqueue \
            -H 'Content-Type: application/json' \
            -d '{
              "routing_key": "${{ secrets.PAGERDUTY_INTEGRATION_KEY }}",
              "event_action": "trigger",
              "payload": {
                "summary": "Production deployment failed - rolled back",
                "severity": "critical",
                "source": "GitHub Actions"
              }
            }'
```

---

## Docker Build Pipeline

### Multi-stage Dockerfile

**`permission-service/Dockerfile`**:

```dockerfile
# Stage 1: Build
FROM maven:3.9-eclipse-temurin-17 AS builder

WORKDIR /app

# Copy pom files first for dependency caching
COPY pom.xml .
COPY permission-service/pom.xml permission-service/
COPY audit-service/pom.xml audit-service/
COPY policy-service/pom.xml policy-service/

# Download dependencies
RUN mvn dependency:go-offline -pl permission-service -am

# Copy source code
COPY permission-service/src permission-service/src

# Build application
RUN mvn clean package -pl permission-service -am -DskipTests

# Stage 2: Runtime
FROM eclipse-temurin:17-jre-alpine

# Add non-root user
RUN addgroup -S spring && adduser -S spring -G spring

WORKDIR /app

# Copy JAR from builder
COPY --from=builder /app/permission-service/target/permission-service-*.jar app.jar

# Change ownership
RUN chown spring:spring app.jar

# Switch to non-root user
USER spring:spring

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/actuator/health || exit 1

# Expose port
EXPOSE 8080

# JVM options
ENV JAVA_OPTS="-Xms2g -Xmx2g -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:+UseStringDeduplication"

# Run application
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]

# Build arguments for metadata
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

LABEL org.opencontainers.image.created=$BUILD_DATE \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.title="Permission Service" \
      org.opencontainers.image.description="Enterprise permission management service"
```

---

## Rollback Procedures

### Automated Rollback Script

**`scripts/rollback.sh`**:

```bash
#!/bin/bash
set -e

ENVIRONMENT=${1:-staging}
SERVICE=${2:-all}
VERSION=${3}

if [ -z "$VERSION" ]; then
  echo "Usage: ./rollback.sh <environment> <service> <version>"
  echo "Example: ./rollback.sh production permission-service v123"
  exit 1
fi

echo "Rolling back $SERVICE in $ENVIRONMENT to version $VERSION"

# Set cluster name
case $ENVIRONMENT in
  dev)
    CLUSTER_NAME="permission-system-eks-dev"
    ;;
  staging)
    CLUSTER_NAME="permission-system-eks-staging"
    ;;
  production)
    CLUSTER_NAME="permission-system-eks-prod"
    ;;
  *)
    echo "Invalid environment: $ENVIRONMENT"
    exit 1
    ;;
esac

# Update kubeconfig
aws eks update-kubeconfig --region us-east-1 --name $CLUSTER_NAME

# Rollback function
rollback_service() {
  local service=$1
  local version=$2

  echo "Rolling back $service to $version..."

  # Get ECR image
  ECR_REGISTRY=$(aws ecr describe-repositories \
    --repository-names $service \
    --query 'repositories[0].repositoryUri' \
    --output text | cut -d'/' -f1)

  IMAGE="$ECR_REGISTRY/$service:$version"

  # Update deployment
  kubectl set image deployment/$service \
    $service=$IMAGE \
    -n permission-system

  # Wait for rollout
  kubectl rollout status deployment/$service \
    -n permission-system \
    --timeout=10m

  echo "✓ $service rolled back to $version"
}

# Rollback services
if [ "$SERVICE" == "all" ]; then
  rollback_service "permission-service" $VERSION
  rollback_service "audit-service" $VERSION
  rollback_service "policy-service" $VERSION
else
  rollback_service $SERVICE $VERSION
fi

echo "Rollback complete!"
```

### Manual Rollback

```bash
# List deployment history
kubectl rollout history deployment/permission-service -n permission-system

# Rollback to previous version
kubectl rollout undo deployment/permission-service -n permission-system

# Rollback to specific revision
kubectl rollout undo deployment/permission-service \
  -n permission-system \
  --to-revision=5

# Verify rollback
kubectl rollout status deployment/permission-service -n permission-system
```

---

## Security Scanning

### Maven Security Plugins

**`pom.xml`**:

```xml
<build>
  <plugins>
    <!-- OWASP Dependency Check -->
    <plugin>
      <groupId>org.owasp</groupId>
      <artifactId>dependency-check-maven</artifactId>
      <version>8.4.0</version>
      <configuration>
        <failBuildOnCVSS>7</failBuildOnCVSS>
        <suppressionFile>owasp-suppressions.xml</suppressionFile>
      </configuration>
      <executions>
        <execution>
          <goals>
            <goal>check</goal>
          </goals>
        </execution>
      </executions>
    </plugin>

    <!-- JaCoCo Code Coverage -->
    <plugin>
      <groupId>org.jacoco</groupId>
      <artifactId>jacoco-maven-plugin</artifactId>
      <version>0.8.10</version>
      <executions>
        <execution>
          <goals>
            <goal>prepare-agent</goal>
          </goals>
        </execution>
        <execution>
          <id>report</id>
          <phase>test</phase>
          <goals>
            <goal>report</goal>
          </goals>
        </execution>
        <execution>
          <id>jacoco-check</id>
          <goals>
            <goal>check</goal>
          </goals>
          <configuration>
            <rules>
              <rule>
                <element>PACKAGE</element>
                <limits>
                  <limit>
                    <counter>LINE</counter>
                    <value>COVEREDRATIO</value>
                    <minimum>0.80</minimum>
                  </limit>
                </limits>
              </rule>
            </rules>
          </configuration>
        </execution>
      </executions>
    </plugin>
  </plugins>
</build>
```

---

## Environment Management

### Kustomize Overlays

**`k8s/base/kustomization.yaml`**:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: permission-system

commonLabels:
  app.kubernetes.io/name: permission-system
  app.kubernetes.io/managed-by: kustomize

resources:
  - namespace.yaml
  - permission-service/deployment.yaml
  - permission-service/service.yaml
  - audit-service/deployment.yaml
  - audit-service/service.yaml
  - policy-service/deployment.yaml
  - policy-service/service.yaml
  - ingress.yaml

configMapGenerator:
  - name: app-config
    literals:
      - LOG_LEVEL=INFO
      - METRICS_ENABLED=true
```

**`k8s/overlays/production/kustomization.yaml`**:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: permission-system

bases:
  - ../../base

commonLabels:
  environment: production

replicas:
  - name: permission-service
    count: 5
  - name: audit-service
    count: 3
  - name: policy-service
    count: 3

images:
  - name: permission-service
    newName: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/permission-service
    newTag: ${IMAGE_TAG}
  - name: audit-service
    newName: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/audit-service
    newTag: ${IMAGE_TAG}
  - name: policy-service
    newName: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/policy-service
    newTag: ${IMAGE_TAG}

patchesStrategicMerge:
  - resources.yaml
  - hpa.yaml

configMapGenerator:
  - name: app-config
    behavior: merge
    literals:
      - LOG_LEVEL=WARN
      - CACHE_TTL=300
      - MAX_CONNECTIONS=1000
```

**`k8s/overlays/production/resources.yaml`**:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: permission-service
spec:
  template:
    spec:
      containers:
        - name: permission-service
          resources:
            requests:
              cpu: "2"
              memory: "4Gi"
            limits:
              cpu: "4"
              memory: "8Gi"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: audit-service
spec:
  template:
    spec:
      containers:
        - name: audit-service
          resources:
            requests:
              cpu: "1"
              memory: "2Gi"
            limits:
              cpu: "2"
              memory: "4Gi"
```

---

## Monitoring and Notifications

### Smoke Tests Script

**`scripts/smoke-tests.sh`**:

```bash
#!/bin/bash
set -e

API_URL=${API_URL:-http://localhost:8080}

echo "Running smoke tests against $API_URL"

# Health check
echo "1. Health check..."
curl -f $API_URL/actuator/health || exit 1
echo "✓ Health check passed"

# Metrics endpoint
echo "2. Metrics check..."
curl -f $API_URL/actuator/metrics || exit 1
echo "✓ Metrics check passed"

# Permission check API
echo "3. Permission check API..."
curl -f -X POST $API_URL/api/v1/permissions/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{
    "userId": "test-user",
    "resourceId": "test-resource",
    "requiredPermission": "READ"
  }' || exit 1
echo "✓ Permission check passed"

echo "All smoke tests passed!"
```

### Performance Tests Script

**`scripts/performance-tests.sh`**:

```bash
#!/bin/bash
set -e

API_URL=${API_URL:-http://localhost:8080}

echo "Running performance tests against $API_URL"

# Install k6 if not present
if ! command -v k6 &> /dev/null; then
  echo "Installing k6..."
  brew install k6
fi

# Run load test
k6 run - <<EOF
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up
    { duration: '5m', target: 100 },  // Stay at 100
    { duration: '2m', target: 200 },  // Ramp to 200
    { duration: '5m', target: 200 },  // Stay at 200
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% under 500ms
    http_req_failed: ['rate<0.01'],    // Error rate < 1%
  },
};

export default function () {
  const res = http.post('$API_URL/api/v1/permissions/check',
    JSON.stringify({
      userId: 'user-' + Math.floor(Math.random() * 1000),
      resourceId: 'resource-' + Math.floor(Math.random() * 10000),
      requiredPermission: 'READ',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $TEST_TOKEN',
      },
    }
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
EOF

echo "Performance tests complete!"
```

---

## Best Practices

### 1. Branch Strategy

- **`main`**: Production-ready code
- **`develop`**: Integration branch
- **`feature/*`**: Feature branches
- **`hotfix/*`**: Emergency fixes

### 2. Deployment Strategy

- **Development**: Auto-deploy on merge to `develop`
- **Staging**: Auto-deploy on merge to `main`
- **Production**: Manual approval via `workflow_dispatch`

### 3. Rollback Strategy

- Keep last 10 deployment artifacts
- Automated rollback on health check failure
- Manual rollback capability via script

### 4. Security Best Practices

- Scan dependencies daily
- Scan Docker images before push
- Use non-root containers
- Rotate secrets quarterly
- Enable audit logging for all deployments

---

**Related Documentation**:
- [AWS_INFRASTRUCTURE.md](./AWS_INFRASTRUCTURE.md) - AWS infrastructure setup
- [KUBERNETES_DEPLOYMENT.md](./KUBERNETES_DEPLOYMENT.md) - Kubernetes manifests
- [OPERATIONS_MANUAL.md](./OPERATIONS_MANUAL.md) - Operations guide
