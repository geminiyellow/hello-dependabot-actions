# AWS Infrastructure Deployment Guide

Complete AWS infrastructure setup for the Permission Management System using Terraform and AWS best practices.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Terraform Project Structure](#terraform-project-structure)
4. [Core Infrastructure](#core-infrastructure)
5. [Database Layer](#database-layer)
6. [Cache Layer](#cache-layer)
7. [Messaging Layer](#messaging-layer)
8. [Kubernetes Cluster](#kubernetes-cluster)
9. [Networking & Load Balancing](#networking--load-balancing)
10. [Security & Secrets](#security--secrets)
11. [Monitoring & Logging](#monitoring--logging)
12. [Cost Optimization](#cost-optimization)
13. [Deployment Instructions](#deployment-instructions)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS Cloud                                │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Route 53 DNS                             │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                          │
│  ┌────────────────────▼─────────────────────────────────────┐  │
│  │              CloudFront CDN                               │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                          │
│  ┌────────────────────▼─────────────────────────────────────┐  │
│  │          Application Load Balancer (ALB)                  │  │
│  │            SSL Termination (ACM)                          │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                          │
│  ┌────────────────────▼─────────────────────────────────────┐  │
│  │                  VPC (10.0.0.0/16)                        │  │
│  │                                                            │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │         EKS Cluster (Kubernetes 1.28)            │   │  │
│  │  │                                                   │   │  │
│  │  │  ┌─────────────┐  ┌──────────────┐             │   │  │
│  │  │  │ Permission  │  │   Audit      │  ...        │   │  │
│  │  │  │  Service    │  │   Service    │             │   │  │
│  │  │  │  (5 pods)   │  │  (3 pods)    │             │   │  │
│  │  │  └─────────────┘  └──────────────┘             │   │  │
│  │  │                                                   │   │  │
│  │  │  Private Subnets (10.0.1.0/24, 10.0.2.0/24)    │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │                                                            │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │         Data Layer (Private Subnets)              │   │  │
│  │  │                                                   │   │  │
│  │  │  ┌─────────────────┐  ┌──────────────────────┐ │   │  │
│  │  │  │  RDS Aurora     │  │  ElastiCache Redis   │ │   │  │
│  │  │  │  PostgreSQL     │  │  Cluster Mode        │ │   │  │
│  │  │  │  (Multi-AZ)     │  │  (3 nodes)           │ │   │  │
│  │  │  └─────────────────┘  └──────────────────────┘ │   │  │
│  │  │                                                   │   │  │
│  │  │  ┌─────────────────────────────────────────┐   │   │  │
│  │  │  │      Amazon MSK (Kafka)                  │   │  │
│  │  │  │      3 brokers, Multi-AZ                 │   │  │
│  │  │  └─────────────────────────────────────────┘   │   │  │
│  │  │                                                   │   │  │
│  │  │  Isolated Subnets (10.0.10.0/24, 10.0.11.0/24) │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────┐  ┌────────────────┐  ┌──────────────┐   │
│  │ Secrets Manager  │  │  CloudWatch    │  │      S3      │   │
│  │  (Credentials)   │  │   (Logging)    │  │ (Audit Logs) │   │
│  └──────────────────┘  └────────────────┘  └──────────────┘   │
│                                                                   │
└───────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### Required Tools

```bash
# Terraform (>= 1.6.0)
brew install terraform

# AWS CLI (>= 2.0)
brew install awscli

# kubectl
brew install kubectl

# helm
brew install helm

# eksctl (for EKS cluster management)
brew install eksctl
```

### AWS Account Setup

```bash
# Configure AWS credentials
aws configure

# Verify access
aws sts get-caller-identity

# Set environment variables
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export PROJECT_NAME=permission-system
export ENV=production
```

---

## Terraform Project Structure

```
infrastructure/
├── terraform/
│   ├── environments/
│   │   ├── dev/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── terraform.tfvars
│   │   ├── staging/
│   │   └── production/
│   │       ├── main.tf
│   │       ├── variables.tf
│   │       └── terraform.tfvars
│   ├── modules/
│   │   ├── vpc/
│   │   ├── eks/
│   │   ├── rds/
│   │   ├── elasticache/
│   │   ├── msk/
│   │   ├── alb/
│   │   ├── secrets/
│   │   └── monitoring/
│   └── backend.tf
└── scripts/
    ├── deploy.sh
    ├── destroy.sh
    └── update-kubeconfig.sh
```

---

## Core Infrastructure

### Backend Configuration

**`terraform/backend.tf`**

```hcl
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  backend "s3" {
    bucket         = "permission-system-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "permission-system-terraform-locks"
    kms_key_id     = "alias/terraform-state-key"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      CostCenter  = "Engineering"
    }
  }
}
```

### VPC Module

**`terraform/modules/vpc/main.tf`**

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project_name}-vpc-${var.environment}"
  cidr = var.vpc_cidr

  azs              = var.availability_zones
  private_subnets  = var.private_subnets
  public_subnets   = var.public_subnets
  database_subnets = var.database_subnets

  enable_nat_gateway   = true
  single_nat_gateway   = var.environment != "production"
  enable_dns_hostnames = true
  enable_dns_support   = true

  # VPC Flow Logs
  enable_flow_log                      = true
  create_flow_log_cloudwatch_iam_role  = true
  create_flow_log_cloudwatch_log_group = true

  # EKS-specific tags
  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  }

  database_subnet_tags = {
    "Tier" = "Database"
  }

  tags = {
    Name = "${var.project_name}-vpc-${var.environment}"
  }
}

# VPC Endpoints for AWS Services (reduce NAT costs)
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = module.vpc.vpc_id
  service_name = "com.amazonaws.${var.aws_region}.s3"
  route_table_ids = concat(
    module.vpc.private_route_table_ids,
    module.vpc.database_route_table_ids
  )

  tags = {
    Name = "${var.project_name}-s3-endpoint"
  }
}

resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.project_name}-ecr-api-endpoint"
  }
}

resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name = "${var.project_name}-ecr-dkr-endpoint"
  }
}

resource "aws_security_group" "vpc_endpoints" {
  name_prefix = "${var.project_name}-vpc-endpoints-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-vpc-endpoints-sg"
  }
}

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "private_subnets" {
  value = module.vpc.private_subnets
}

output "public_subnets" {
  value = module.vpc.public_subnets
}

output "database_subnets" {
  value = module.vpc.database_subnets
}
```

**`terraform/modules/vpc/variables.tf`**

```hcl
variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
}

variable "private_subnets" {
  description = "Private subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnets" {
  description = "Public subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

variable "database_subnets" {
  description = "Database subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
}
```

---

## Database Layer

### RDS Aurora PostgreSQL Module

**`terraform/modules/rds/main.tf`**

```hcl
resource "aws_security_group" "rds" {
  name_prefix = "${var.project_name}-rds-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.eks_worker_security_group_id]
    description     = "PostgreSQL access from EKS workers"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-rds-sg"
  }
}

module "aurora" {
  source  = "terraform-aws-modules/rds-aurora/aws"
  version = "~> 8.0"

  name           = "${var.project_name}-aurora-${var.environment}"
  engine         = "aurora-postgresql"
  engine_version = "15.4"
  engine_mode    = "provisioned"

  vpc_id                 = var.vpc_id
  db_subnet_group_name   = aws_db_subnet_group.aurora.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  master_username = "postgres"
  master_password = random_password.db_master_password.result

  database_name = "permissions"

  # Storage
  storage_encrypted   = true
  kms_key_id          = aws_kms_key.rds.arn
  storage_type        = "io1"
  allocated_storage   = 100
  iops                = 3000

  # Instances
  instances = {
    writer = {
      identifier     = "${var.project_name}-aurora-writer"
      instance_class = var.environment == "production" ? "db.r6g.2xlarge" : "db.r6g.large"
      publicly_accessible = false
    }
    reader1 = {
      identifier     = "${var.project_name}-aurora-reader-1"
      instance_class = var.environment == "production" ? "db.r6g.2xlarge" : "db.r6g.large"
      publicly_accessible = false
    }
    reader2 = {
      identifier     = "${var.project_name}-aurora-reader-2"
      instance_class = var.environment == "production" ? "db.r6g.2xlarge" : "db.r6g.large"
      publicly_accessible = false
    }
  }

  # Serverless v2 scaling (for Aurora Serverless v2)
  serverlessv2_scaling_configuration = {
    min_capacity = 2
    max_capacity = 16
  }

  # Backup
  backup_retention_period      = var.environment == "production" ? 30 : 7
  preferred_backup_window      = "03:00-04:00"
  preferred_maintenance_window = "mon:04:00-mon:05:00"
  skip_final_snapshot          = var.environment != "production"
  final_snapshot_identifier    = "${var.project_name}-aurora-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  # Enhanced Monitoring
  enabled_cloudwatch_logs_exports = ["postgresql"]
  monitoring_interval             = 60
  monitoring_role_arn             = aws_iam_role.rds_monitoring.arn

  # Performance Insights
  performance_insights_enabled          = true
  performance_insights_retention_period = var.environment == "production" ? 731 : 7

  # Autoscaling for read replicas
  autoscaling_enabled      = true
  autoscaling_min_capacity = 2
  autoscaling_max_capacity = 5
  autoscaling_target_cpu   = 70

  # Parameter groups
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.aurora.name
  db_parameter_group_name         = aws_db_parameter_group.aurora.name

  tags = {
    Name = "${var.project_name}-aurora-cluster"
  }
}

resource "aws_db_subnet_group" "aurora" {
  name       = "${var.project_name}-aurora-subnet-group"
  subnet_ids = var.database_subnets

  tags = {
    Name = "${var.project_name}-aurora-subnet-group"
  }
}

resource "aws_rds_cluster_parameter_group" "aurora" {
  name        = "${var.project_name}-aurora-cluster-pg"
  family      = "aurora-postgresql15"
  description = "Custom cluster parameter group for Aurora PostgreSQL 15"

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,auto_explain"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"  # Log queries slower than 1 second
  }

  parameter {
    name  = "auto_explain.log_min_duration"
    value = "5000"  # Auto-explain queries slower than 5 seconds
  }

  parameter {
    name  = "auto_explain.log_analyze"
    value = "1"
  }

  parameter {
    name  = "auto_explain.log_buffers"
    value = "1"
  }

  tags = {
    Name = "${var.project_name}-aurora-cluster-pg"
  }
}

resource "aws_db_parameter_group" "aurora" {
  name        = "${var.project_name}-aurora-db-pg"
  family      = "aurora-postgresql15"
  description = "Custom DB parameter group for Aurora PostgreSQL 15"

  parameter {
    name  = "max_connections"
    value = "1000"
  }

  parameter {
    name  = "shared_buffers"
    value = "{DBInstanceClassMemory/10240}"  # 25% of instance memory
  }

  parameter {
    name  = "effective_cache_size"
    value = "{DBInstanceClassMemory/10240*3}"  # 75% of instance memory
  }

  parameter {
    name  = "maintenance_work_mem"
    value = "2097152"  # 2GB
  }

  parameter {
    name  = "random_page_cost"
    value = "1.1"  # For SSD storage
  }

  tags = {
    Name = "${var.project_name}-aurora-db-pg"
  }
}

# KMS key for encryption
resource "aws_kms_key" "rds" {
  description             = "KMS key for RDS encryption"
  deletion_window_in_days = 10
  enable_key_rotation     = true

  tags = {
    Name = "${var.project_name}-rds-kms-key"
  }
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${var.project_name}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# Random password for master user
resource "random_password" "db_master_password" {
  length  = 32
  special = true
}

# Store password in Secrets Manager
resource "aws_secretsmanager_secret" "db_master_password" {
  name = "${var.project_name}/rds/master-password"
  kms_key_id = aws_kms_key.rds.id

  tags = {
    Name = "${var.project_name}-rds-master-password"
  }
}

resource "aws_secretsmanager_secret_version" "db_master_password" {
  secret_id = aws_secretsmanager_secret.db_master_password.id
  secret_string = jsonencode({
    username = "postgres"
    password = random_password.db_master_password.result
    engine   = "postgres"
    host     = module.aurora.cluster_endpoint
    port     = 5432
    dbname   = "permissions"
  })
}

# IAM role for Enhanced Monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.project_name}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  managed_policy_arns = [
    "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
  ]

  tags = {
    Name = "${var.project_name}-rds-monitoring-role"
  }
}

output "cluster_endpoint" {
  value = module.aurora.cluster_endpoint
}

output "reader_endpoint" {
  value = module.aurora.cluster_reader_endpoint
}

output "database_name" {
  value = module.aurora.cluster_database_name
}

output "master_password_secret_arn" {
  value = aws_secretsmanager_secret.db_master_password.arn
}
```

---

## Cache Layer

### ElastiCache Redis Module

**`terraform/modules/elasticache/main.tf`**

```hcl
resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-redis-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.eks_worker_security_group_id]
    description     = "Redis access from EKS workers"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-redis-sg"
  }
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project_name}-redis-subnet-group"
  subnet_ids = var.database_subnets

  tags = {
    Name = "${var.project_name}-redis-subnet-group"
  }
}

resource "aws_elasticache_parameter_group" "redis" {
  name   = "${var.project_name}-redis-params"
  family = "redis7"

  # Memory management
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  # Persistence (disable for pure cache)
  parameter {
    name  = "appendonly"
    value = "no"
  }

  # Timeout settings
  parameter {
    name  = "timeout"
    value = "300"
  }

  # Slow log
  parameter {
    name  = "slowlog-log-slower-than"
    value = "10000"  # 10ms
  }

  parameter {
    name  = "slowlog-max-len"
    value = "128"
  }

  tags = {
    Name = "${var.project_name}-redis-params"
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${var.project_name}-redis"
  replication_group_description = "Redis cluster for permission caching"

  engine               = "redis"
  engine_version       = "7.0"
  node_type            = var.environment == "production" ? "cache.r7g.xlarge" : "cache.r7g.large"
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.redis.name

  # Cluster configuration
  automatic_failover_enabled = true
  multi_az_enabled          = true
  num_cache_clusters        = var.environment == "production" ? 3 : 2

  # Subnet and security
  subnet_group_name  = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]

  # Encryption
  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.redis.arn
  transit_encryption_enabled = true
  auth_token_enabled         = true
  auth_token                 = random_password.redis_auth_token.result

  # Backup
  snapshot_retention_limit = var.environment == "production" ? 7 : 1
  snapshot_window          = "03:00-05:00"
  maintenance_window       = "mon:05:00-mon:07:00"

  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_engine_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "engine-log"
  }

  # Notifications
  notification_topic_arn = aws_sns_topic.cache_notifications.arn

  tags = {
    Name = "${var.project_name}-redis-cluster"
  }
}

# KMS key for encryption
resource "aws_kms_key" "redis" {
  description             = "KMS key for Redis encryption"
  deletion_window_in_days = 10
  enable_key_rotation     = true

  tags = {
    Name = "${var.project_name}-redis-kms-key"
  }
}

resource "aws_kms_alias" "redis" {
  name          = "alias/${var.project_name}-redis"
  target_key_id = aws_kms_key.redis.key_id
}

# Auth token
resource "random_password" "redis_auth_token" {
  length  = 32
  special = false  # Redis AUTH token constraints
}

# Store auth token in Secrets Manager
resource "aws_secretsmanager_secret" "redis_auth_token" {
  name       = "${var.project_name}/redis/auth-token"
  kms_key_id = aws_kms_key.redis.id

  tags = {
    Name = "${var.project_name}-redis-auth-token"
  }
}

resource "aws_secretsmanager_secret_version" "redis_auth_token" {
  secret_id = aws_secretsmanager_secret.redis_auth_token.id
  secret_string = jsonencode({
    auth_token = random_password.redis_auth_token.result
    host       = aws_elasticache_replication_group.redis.primary_endpoint_address
    port       = 6379
  })
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "redis_slow_log" {
  name              = "/aws/elasticache/${var.project_name}/redis/slow-log"
  retention_in_days = 7

  tags = {
    Name = "${var.project_name}-redis-slow-log"
  }
}

resource "aws_cloudwatch_log_group" "redis_engine_log" {
  name              = "/aws/elasticache/${var.project_name}/redis/engine-log"
  retention_in_days = 7

  tags = {
    Name = "${var.project_name}-redis-engine-log"
  }
}

# SNS topic for notifications
resource "aws_sns_topic" "cache_notifications" {
  name = "${var.project_name}-cache-notifications"

  tags = {
    Name = "${var.project_name}-cache-notifications"
  }
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${var.project_name}-redis-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "75"
  alarm_description   = "This metric monitors redis cpu utilization"
  alarm_actions       = [aws_sns_topic.cache_notifications.arn]

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.redis.id
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${var.project_name}-redis-high-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors redis memory usage"
  alarm_actions       = [aws_sns_topic.cache_notifications.arn]

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.redis.id
  }
}

output "primary_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "reader_endpoint" {
  value = aws_elasticache_replication_group.redis.reader_endpoint_address
}

output "auth_token_secret_arn" {
  value = aws_secretsmanager_secret.redis_auth_token.arn
}
```

---

## Messaging Layer

### Amazon MSK (Kafka) Module

**`terraform/modules/msk/main.tf`**

```hcl
resource "aws_security_group" "msk" {
  name_prefix = "${var.project_name}-msk-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 9092
    to_port         = 9092
    protocol        = "tcp"
    security_groups = [var.eks_worker_security_group_id]
    description     = "Kafka plaintext from EKS"
  }

  ingress {
    from_port       = 9094
    to_port         = 9094
    protocol        = "tcp"
    security_groups = [var.eks_worker_security_group_id]
    description     = "Kafka TLS from EKS"
  }

  ingress {
    from_port       = 2181
    to_port         = 2181
    protocol        = "tcp"
    security_groups = [var.eks_worker_security_group_id]
    description     = "Zookeeper from EKS"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-msk-sg"
  }
}

resource "aws_cloudwatch_log_group" "msk" {
  name              = "/aws/msk/${var.project_name}"
  retention_in_days = 7

  tags = {
    Name = "${var.project_name}-msk-logs"
  }
}

resource "aws_kms_key" "msk" {
  description             = "KMS key for MSK encryption"
  deletion_window_in_days = 10
  enable_key_rotation     = true

  tags = {
    Name = "${var.project_name}-msk-kms-key"
  }
}

resource "aws_msk_configuration" "kafka" {
  name              = "${var.project_name}-kafka-config"
  kafka_versions    = ["3.5.1"]
  server_properties = <<PROPERTIES
auto.create.topics.enable=false
default.replication.factor=3
min.insync.replicas=2
num.io.threads=8
num.network.threads=5
num.replica.fetchers=2
replica.lag.time.max.ms=30000
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600
socket.send.buffer.bytes=102400
unclean.leader.election.enable=false
zookeeper.session.timeout.ms=18000
log.retention.hours=168
log.segment.bytes=1073741824
compression.type=snappy
PROPERTIES

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_msk_cluster" "kafka" {
  cluster_name           = "${var.project_name}-kafka"
  kafka_version          = "3.5.1"
  number_of_broker_nodes = 3
  enhanced_monitoring    = "PER_TOPIC_PER_BROKER"

  broker_node_group_info {
    instance_type  = var.environment == "production" ? "kafka.m5.2xlarge" : "kafka.m5.large"
    client_subnets = var.database_subnets
    storage_info {
      ebs_storage_info {
        provisioned_throughput {
          enabled           = true
          volume_throughput = 250
        }
        volume_size = var.environment == "production" ? 1000 : 500
      }
    }
    security_groups = [aws_security_group.msk.id]
  }

  encryption_info {
    encryption_at_rest_kms_key_arn = aws_kms_key.msk.arn
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.kafka.arn
    revision = aws_msk_configuration.kafka.latest_revision
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk.name
      }
      s3 {
        enabled = true
        bucket  = aws_s3_bucket.msk_logs.id
        prefix  = "kafka-broker-logs/"
      }
    }
  }

  client_authentication {
    sasl {
      iam = true
    }
    unauthenticated = false
  }

  tags = {
    Name = "${var.project_name}-kafka-cluster"
  }
}

# S3 bucket for MSK logs
resource "aws_s3_bucket" "msk_logs" {
  bucket = "${var.project_name}-msk-logs-${var.environment}"

  tags = {
    Name = "${var.project_name}-msk-logs"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "msk_logs" {
  bucket = aws_s3_bucket.msk_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "msk_logs" {
  bucket = aws_s3_bucket.msk_logs.id

  rule {
    id     = "delete-old-logs"
    status = "Enabled"

    expiration {
      days = 30
    }
  }
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "kafka_cpu" {
  alarm_name          = "${var.project_name}-kafka-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CpuUser"
  namespace           = "AWS/Kafka"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors kafka cpu utilization"

  dimensions = {
    "Cluster Name" = aws_msk_cluster.kafka.cluster_name
  }
}

output "bootstrap_brokers_tls" {
  value = aws_msk_cluster.kafka.bootstrap_brokers_tls
}

output "zookeeper_connect_string" {
  value = aws_msk_cluster.kafka.zookeeper_connect_string
}
```

---

## Kubernetes Cluster

### EKS Module

**`terraform/modules/eks/main.tf`**

```hcl
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = var.cluster_name
  cluster_version = "1.28"

  vpc_id     = var.vpc_id
  subnet_ids = var.private_subnets

  # Cluster endpoint access
  cluster_endpoint_public_access  = false
  cluster_endpoint_private_access = true

  # Encryption
  cluster_encryption_config = {
    provider_key_arn = aws_kms_key.eks.arn
    resources        = ["secrets"]
  }

  # Cluster addons
  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent              = true
      before_compute           = true
      service_account_role_arn = module.vpc_cni_irsa.iam_role_arn
      configuration_values = jsonencode({
        env = {
          ENABLE_PREFIX_DELEGATION = "true"
          WARM_PREFIX_TARGET       = "1"
        }
      })
    }
    aws-ebs-csi-driver = {
      most_recent              = true
      service_account_role_arn = module.ebs_csi_irsa.iam_role_arn
    }
  }

  # Managed node groups
  eks_managed_node_groups = {
    # System node group
    system = {
      name           = "${var.cluster_name}-system"
      instance_types = ["t3.large"]

      min_size     = 2
      max_size     = 4
      desired_size = 2

      labels = {
        role = "system"
      }

      taints = [{
        key    = "CriticalAddonsOnly"
        value  = "true"
        effect = "NO_SCHEDULE"
      }]

      tags = {
        NodeGroup = "system"
      }
    }

    # Application node group
    application = {
      name           = "${var.cluster_name}-application"
      instance_types = var.environment == "production" ? ["c6i.2xlarge"] : ["c6i.xlarge"]

      min_size     = var.environment == "production" ? 5 : 2
      max_size     = var.environment == "production" ? 20 : 10
      desired_size = var.environment == "production" ? 5 : 2

      # Use latest EKS-optimized AMI
      ami_type = "AL2_x86_64"

      labels = {
        role = "application"
      }

      tags = {
        NodeGroup = "application"
      }

      # Enable IMDSv2
      metadata_options = {
        http_endpoint               = "enabled"
        http_tokens                 = "required"
        http_put_response_hop_limit = 1
      }
    }
  }

  # AWS Auth configuration
  manage_aws_auth_configmap = true
  aws_auth_roles = concat(
    [
      {
        rolearn  = aws_iam_role.eks_admin.arn
        username = "eks-admin"
        groups   = ["system:masters"]
      }
    ],
    var.additional_aws_auth_roles
  )

  # Security groups
  node_security_group_additional_rules = {
    ingress_self_all = {
      description = "Node to node all ports/protocols"
      protocol    = "-1"
      from_port   = 0
      to_port     = 0
      type        = "ingress"
      self        = true
    }

    ingress_cluster_all = {
      description                   = "Cluster to node all ports/protocols"
      protocol                      = "-1"
      from_port                     = 0
      to_port                       = 0
      type                          = "ingress"
      source_cluster_security_group = true
    }

    egress_all = {
      description      = "Node all egress"
      protocol         = "-1"
      from_port        = 0
      to_port          = 0
      type             = "egress"
      cidr_blocks      = ["0.0.0.0/0"]
      ipv6_cidr_blocks = ["::/0"]
    }
  }

  tags = {
    Name = var.cluster_name
  }
}

# KMS key for EKS encryption
resource "aws_kms_key" "eks" {
  description             = "KMS key for EKS cluster encryption"
  deletion_window_in_days = 10
  enable_key_rotation     = true

  tags = {
    Name = "${var.cluster_name}-kms-key"
  }
}

resource "aws_kms_alias" "eks" {
  name          = "alias/${var.cluster_name}"
  target_key_id = aws_kms_key.eks.key_id
}

# IRSA for VPC CNI
module "vpc_cni_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name             = "${var.cluster_name}-vpc-cni"
  attach_vpc_cni_policy = true
  vpc_cni_enable_ipv4   = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:aws-node"]
    }
  }

  tags = {
    Name = "${var.cluster_name}-vpc-cni-role"
  }
}

# IRSA for EBS CSI Driver
module "ebs_csi_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name             = "${var.cluster_name}-ebs-csi"
  attach_ebs_csi_policy = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:ebs-csi-controller-sa"]
    }
  }

  tags = {
    Name = "${var.cluster_name}-ebs-csi-role"
  }
}

# IRSA for Application Pods (Secrets Manager access)
module "app_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "${var.cluster_name}-app-pods"

  role_policy_arns = {
    secrets = aws_iam_policy.app_secrets_access.arn
    rds     = aws_iam_policy.app_rds_access.arn
    msk     = aws_iam_policy.app_msk_access.arn
  }

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["permission-system:permission-service", "permission-system:audit-service"]
    }
  }

  tags = {
    Name = "${var.cluster_name}-app-pods-role"
  }
}

# IAM policy for accessing Secrets Manager
resource "aws_iam_policy" "app_secrets_access" {
  name        = "${var.cluster_name}-app-secrets-access"
  description = "Allow application pods to access specific secrets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.project_name}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = [
          aws_kms_key.eks.arn
        ]
      }
    ]
  })
}

# IAM policy for RDS IAM authentication
resource "aws_iam_policy" "app_rds_access" {
  name        = "${var.cluster_name}-app-rds-access"
  description = "Allow application pods to use RDS IAM authentication"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "rds-db:connect"
        ]
        Resource = [
          "arn:aws:rds-db:${var.aws_region}:${data.aws_caller_identity.current.account_id}:dbuser:*/*"
        ]
      }
    ]
  })
}

# IAM policy for MSK access
resource "aws_iam_policy" "app_msk_access" {
  name        = "${var.cluster_name}-app-msk-access"
  description = "Allow application pods to access MSK"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:Connect",
          "kafka-cluster:AlterCluster",
          "kafka-cluster:DescribeCluster"
        ]
        Resource = [
          "arn:aws:kafka:${var.aws_region}:${data.aws_caller_identity.current.account_id}:cluster/${var.project_name}-kafka/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:*Topic*",
          "kafka-cluster:WriteData",
          "kafka-cluster:ReadData"
        ]
        Resource = [
          "arn:aws:kafka:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/${var.project_name}-kafka/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:AlterGroup",
          "kafka-cluster:DescribeGroup"
        ]
        Resource = [
          "arn:aws:kafka:${var.aws_region}:${data.aws_caller_identity.current.account_id}:group/${var.project_name}-kafka/*"
        ]
      }
    ]
  })
}

# EKS Admin IAM role
resource "aws_iam_role" "eks_admin" {
  name = "${var.cluster_name}-admin-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name = "${var.cluster_name}-admin-role"
  }
}

data "aws_caller_identity" "current" {}

output "cluster_id" {
  value = module.eks.cluster_id
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "cluster_certificate_authority_data" {
  value     = module.eks.cluster_certificate_authority_data
  sensitive = true
}

output "oidc_provider_arn" {
  value = module.eks.oidc_provider_arn
}

output "node_security_group_id" {
  value = module.eks.node_security_group_id
}
```

---

## Networking & Load Balancing

### ALB Module

**`terraform/modules/alb/main.tf`**

```hcl
# Security group for ALB
resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-alb-"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP from internet"
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS from internet"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-alb-sg"
  }
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnets

  enable_deletion_protection = var.environment == "production"
  enable_http2              = true
  enable_waf_fail_open      = false

  # Access logs
  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = "alb"
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-alb"
  }
}

# S3 bucket for ALB access logs
resource "aws_s3_bucket" "alb_logs" {
  bucket = "${var.project_name}-alb-logs-${var.environment}"

  tags = {
    Name = "${var.project_name}-alb-logs"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    id     = "delete-old-logs"
    status = "Enabled"

    expiration {
      days = 90
    }
  }
}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = data.aws_elb_service_account.main.arn
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.alb_logs.arn}/alb/*"
      }
    ]
  })
}

data "aws_elb_service_account" "main" {}

# ACM Certificate
resource "aws_acm_certificate" "main" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  subject_alternative_names = [
    "*.${var.domain_name}"
  ]

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project_name}-certificate"
  }
}

# HTTPS Listener
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = aws_acm_certificate.main.arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }
}

# HTTP Listener (redirect to HTTPS)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# Route 53
resource "aws_route53_zone" "main" {
  name = var.domain_name

  tags = {
    Name = "${var.project_name}-hosted-zone"
  }
}

resource "aws_route53_record" "alb" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

output "alb_arn" {
  value = aws_lb.main.arn
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "alb_security_group_id" {
  value = aws_security_group.alb.id
}

output "https_listener_arn" {
  value = aws_lb_listener.https.arn
}

output "zone_id" {
  value = aws_route53_zone.main.zone_id
}
```

---

## Deployment Instructions

### Initialize Terraform State Backend

```bash
# Create S3 bucket for state
aws s3api create-bucket \
  --bucket permission-system-terraform-state \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket permission-system-terraform-state \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket permission-system-terraform-state \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name permission-system-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

### Deploy Infrastructure

**`infrastructure/terraform/environments/production/terraform.tfvars`**

```hcl
project_name = "permission-system"
environment  = "production"
aws_region   = "us-east-1"

# VPC
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

# Domain
domain_name = "your-domain.com"

# EKS
cluster_name = "permission-system-eks-prod"
```

**Deploy**:

```bash
cd infrastructure/terraform/environments/production

# Initialize Terraform
terraform init

# Plan
terraform plan -out=tfplan

# Apply
terraform apply tfplan

# Update kubeconfig
aws eks update-kubeconfig \
  --region us-east-1 \
  --name permission-system-eks-prod

# Verify
kubectl get nodes
```

### Complete Deployment Script

**`infrastructure/scripts/deploy.sh`**

```bash
#!/bin/bash
set -e

ENVIRONMENT=${1:-production}
AWS_REGION=${2:-us-east-1}

echo "Deploying Permission System - Environment: $ENVIRONMENT"

# Step 1: Deploy infrastructure
echo "Step 1/3: Deploying AWS infrastructure..."
cd infrastructure/terraform/environments/$ENVIRONMENT
terraform init
terraform plan -out=tfplan
terraform apply -auto-approve tfplan

# Step 2: Update kubeconfig
echo "Step 2/3: Updating kubeconfig..."
CLUSTER_NAME=$(terraform output -raw cluster_name)
aws eks update-kubeconfig --region $AWS_REGION --name $CLUSTER_NAME

# Step 3: Deploy Kubernetes resources
echo "Step 3/3: Deploying Kubernetes resources..."
cd ../../../../

# Install metrics-server
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Install AWS Load Balancer Controller
helm repo add eks https://aws.github.io/eks-charts
helm repo update
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=$CLUSTER_NAME \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller

# Create namespace
kubectl create namespace permission-system

# Deploy application
kubectl apply -f rbac-system/k8s/

echo "Deployment complete!"
echo "Cluster: $CLUSTER_NAME"
echo "Region: $AWS_REGION"
```

---

## Cost Optimization

### Monthly Cost Estimate (Production)

| Service | Configuration | Est. Monthly Cost |
|---------|--------------|-------------------|
| EKS Cluster | Control plane | $73 |
| EC2 (EKS Nodes) | 5x c6i.2xlarge (8 vCPU, 16 GB) | $1,200 |
| RDS Aurora | 3x db.r6g.2xlarge (8 vCPU, 64 GB) | $2,400 |
| ElastiCache Redis | 3x cache.r7g.xlarge (4 vCPU, 26 GB) | $900 |
| Amazon MSK | 3x kafka.m5.2xlarge (8 vCPU, 32 GB) | $1,800 |
| ALB | 1 ALB + data transfer | $50 |
| Data Transfer | 1 TB/month | $90 |
| CloudWatch | Logs + Metrics | $100 |
| **Total** | | **~$6,613/month** |

### Cost Optimization Tips

1. **Use Spot Instances for non-critical workloads**:
   ```hcl
   capacity_type = "SPOT"
   ```

2. **Use Savings Plans** for predictable workloads (30-50% savings)

3. **Right-size instances** based on actual usage metrics

4. **Use VPC Endpoints** to reduce NAT Gateway costs (already configured)

5. **Enable S3 Intelligent Tiering** for audit logs

6. **Use Aurora Serverless v2** for variable workloads:
   ```hcl
   serverlessv2_scaling_configuration = {
     min_capacity = 0.5
     max_capacity = 8
   }
   ```

---

## Next Steps

1. **Apply Terraform Configuration**: Deploy the infrastructure
2. **Configure DNS**: Point your domain to Route 53 name servers
3. **Deploy Application**: Use Kubernetes manifests from KUBERNETES_DEPLOYMENT.md
4. **Set up CI/CD**: Configure GitHub Actions or GitLab CI (see CICD_PIPELINE.md)
5. **Configure Monitoring**: Set up Grafana dashboards (see OPERATIONS_MANUAL.md)
6. **Run Load Tests**: Validate performance targets
7. **Enable Backups**: Verify RDS and Redis snapshot schedules
8. **Security Audit**: Run AWS Security Hub and GuardDuty

---

**References**:
- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) - System architecture
- [KUBERNETES_DEPLOYMENT.md](./KUBERNETES_DEPLOYMENT.md) - K8s manifests
- [SPRING_BOOT_IMPLEMENTATION.md](./SPRING_BOOT_IMPLEMENTATION.md) - Application code
