#!/usr/bin/env bash

# =============================================================================
# Workflow Generator for Private GitHub Actions
# =============================================================================
# This script generates a workflow file that uses private GitHub Actions.
#
# Usage:
#   ./generate-workflow.sh [OPTIONS]
#
# Options:
#   -r, --repo REPO       Actions repository (default: af/actions-packages)
#   -v, --version VER     Actions version (default: v1.0.0)
#   -s, --secret SECRET   Secret name for PAT (default: AF_ACTIONS_PAT)
#   -o, --output FILE     Output file (default: .github/workflows/ci.yml)
#   -t, --type TYPE       Workflow type: basic|full|test-only (default: basic)
#   -h, --help            Show this help
#
# =============================================================================

set -e

# Default configuration
ACTIONS_REPO="af/actions-packages"
ACTIONS_VERSION="v1.0.0"
SECRET_NAME="AF_ACTIONS_PAT"
OUTPUT_FILE=".github/workflows/ci-with-private-actions.yml"
WORKFLOW_TYPE="basic"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# =============================================================================
# Help
# =============================================================================

show_help() {
    cat << EOF
Workflow Generator for Private GitHub Actions

Usage:
  ./generate-workflow.sh [OPTIONS]

Options:
  -r, --repo REPO       Actions repository (default: af/actions-packages)
  -v, --version VER     Actions version (default: v1.0.0)
  -s, --secret SECRET   Secret name for PAT (default: AF_ACTIONS_PAT)
  -o, --output FILE     Output file (default: .github/workflows/ci-with-private-actions.yml)
  -t, --type TYPE       Workflow type: basic|full|test-only (default: basic)
  -h, --help            Show this help

Workflow Types:
  basic       - Basic CI with tests and build
  full        - Full CI/CD with lint, test, build, and deploy
  test-only   - Only run tests (fast)

Examples:
  # Generate basic workflow
  ./generate-workflow.sh

  # Generate full CI/CD workflow
  ./generate-workflow.sh -t full -o .github/workflows/main.yml

  # Use custom actions repository
  ./generate-workflow.sh -r myorg/actions -v v2.0.0

EOF
}

# =============================================================================
# Parse Arguments
# =============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--repo)
            ACTIONS_REPO="$2"
            shift 2
            ;;
        -v|--version)
            ACTIONS_VERSION="$2"
            shift 2
            ;;
        -s|--secret)
            SECRET_NAME="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        -t|--type)
            WORKFLOW_TYPE="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# =============================================================================
# Generate Workflow Templates
# =============================================================================

generate_basic_workflow() {
    cat << EOF
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Checkout private actions
        uses: actions/checkout@v4
        with:
          repository: $ACTIONS_REPO
          token: \${{ secrets.$SECRET_NAME }}
          path: .github/private-actions
          ref: $ACTIONS_VERSION

      - name: Setup Node.js
        uses: ./.github/private-actions/composite-actions/setup-node
        with:
          node-version: '18.x'

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

      - name: Notify on failure
        if: failure()
        uses: ./.github/private-actions/composite-actions/notify
        with:
          status: 'failure'
          message: 'CI failed'
          webhook-url: \${{ secrets.SLACK_WEBHOOK_URL }}
EOF
}

generate_full_workflow() {
    cat << EOF
name: Full CI/CD

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  prepare:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Checkout private actions
        uses: actions/checkout@v4
        with:
          repository: $ACTIONS_REPO
          token: \${{ secrets.$SECRET_NAME }}
          path: .github/private-actions
          ref: $ACTIONS_VERSION

      - name: Cache private actions
        uses: actions/cache@v3
        with:
          path: .github/private-actions
          key: private-actions-$ACTIONS_VERSION

  lint:
    needs: prepare
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/checkout@v4
        with:
          repository: $ACTIONS_REPO
          token: \${{ secrets.$SECRET_NAME }}
          path: .github/private-actions
          ref: $ACTIONS_VERSION

      - uses: ./.github/private-actions/composite-actions/setup-node

      - name: Run lint
        run: npm run lint

  test:
    needs: prepare
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/checkout@v4
        with:
          repository: $ACTIONS_REPO
          token: \${{ secrets.$SECRET_NAME }}
          path: .github/private-actions
          ref: $ACTIONS_VERSION

      - uses: ./.github/private-actions/composite-actions/setup-node

      - name: Run tests
        run: npm test

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/checkout@v4
        with:
          repository: $ACTIONS_REPO
          token: \${{ secrets.$SECRET_NAME }}
          path: .github/private-actions
          ref: $ACTIONS_VERSION

      - uses: ./.github/private-actions/composite-actions/setup-node

      - name: Build
        run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: build
          path: dist/

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Download build artifacts
        uses: actions/download-artifact@v3
        with:
          name: build
          path: dist/

      - name: Deploy
        run: |
          echo "Deploying..."
          # Add your deploy commands here

  notify:
    needs: [lint, test, build, deploy]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/checkout@v4
        with:
          repository: $ACTIONS_REPO
          token: \${{ secrets.$SECRET_NAME }}
          path: .github/private-actions
          ref: $ACTIONS_VERSION

      - uses: ./.github/private-actions/composite-actions/notify
        with:
          status: \${{ job.status }}
          message: 'CI/CD pipeline \${{ job.status }}'
          webhook-url: \${{ secrets.SLACK_WEBHOOK_URL }}
EOF
}

generate_test_only_workflow() {
    cat << EOF
name: Test

on:
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Checkout private actions
        uses: actions/checkout@v4
        with:
          repository: $ACTIONS_REPO
          token: \${{ secrets.$SECRET_NAME }}
          path: .github/private-actions
          ref: $ACTIONS_VERSION

      - name: Setup Node.js
        uses: ./.github/private-actions/composite-actions/setup-node
        with:
          node-version: '18.x'

      - name: Run tests
        run: npm test
EOF
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo -e "${BLUE}🔧 Generating workflow...${NC}"
    echo ""
    echo "Configuration:"
    echo "  Type:              $WORKFLOW_TYPE"
    echo "  Actions Repo:      $ACTIONS_REPO"
    echo "  Version:           $ACTIONS_VERSION"
    echo "  Secret:            $SECRET_NAME"
    echo "  Output:            $OUTPUT_FILE"
    echo ""

    # Create directory if it doesn't exist
    mkdir -p "$(dirname "$OUTPUT_FILE")"

    # Generate workflow based on type
    case $WORKFLOW_TYPE in
        basic)
            generate_basic_workflow > "$OUTPUT_FILE"
            ;;
        full)
            generate_full_workflow > "$OUTPUT_FILE"
            ;;
        test-only)
            generate_test_only_workflow > "$OUTPUT_FILE"
            ;;
        *)
            echo -e "${YELLOW}Unknown workflow type: $WORKFLOW_TYPE${NC}"
            echo "Using 'basic' instead"
            generate_basic_workflow > "$OUTPUT_FILE"
            ;;
    esac

    echo -e "${GREEN}✅ Workflow generated: $OUTPUT_FILE${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review the workflow file"
    echo "  2. Configure the secret '$SECRET_NAME' in repository settings"
    echo "  3. Commit and push: git add .github && git commit -m 'Add workflow' && git push"
    echo ""
}

main
