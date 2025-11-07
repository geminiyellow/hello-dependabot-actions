#!/usr/bin/env bash

# =============================================================================
# Setup Script for Using Private GitHub Actions
# =============================================================================
# This script helps you configure your repository to use private GitHub Actions
# from a different organization.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/af/actions-packages/main/scripts/setup.sh | bash
#   or
#   bash setup.sh
#
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ACTIONS_REPO="af/actions-packages"
ACTIONS_VERSION="v1.0.0"
SECRET_NAME="AF_ACTIONS_PAT"

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# =============================================================================
# Check Prerequisites
# =============================================================================

check_prerequisites() {
    print_header "Checking Prerequisites"

    local all_ok=true

    # Check git
    if command -v git &> /dev/null; then
        print_success "git is installed"
    else
        print_error "git is not installed"
        all_ok=false
    fi

    # Check if in a git repository
    if git rev-parse --git-dir > /dev/null 2>&1; then
        print_success "Current directory is a git repository"
        REPO_ROOT=$(git rev-parse --show-toplevel)
        REPO_NAME=$(basename "$REPO_ROOT")
        print_info "Repository: $REPO_NAME"
    else
        print_error "Not in a git repository"
        all_ok=false
    fi

    # Check gh CLI (optional but recommended)
    if command -v gh &> /dev/null; then
        print_success "GitHub CLI (gh) is installed"
        HAS_GH_CLI=true
    else
        print_warning "GitHub CLI (gh) is not installed (optional)"
        print_info "Install it from: https://cli.github.com/"
        HAS_GH_CLI=false
    fi

    if [ "$all_ok" = false ]; then
        print_error "Prerequisites check failed. Please install missing tools."
        exit 1
    fi

    echo ""
}

# =============================================================================
# Check PAT Configuration
# =============================================================================

check_pat_config() {
    print_header "Checking PAT Configuration"

    if [ "$HAS_GH_CLI" = true ]; then
        # Check if authenticated
        if gh auth status &> /dev/null; then
            print_success "GitHub CLI is authenticated"

            # Try to check if secret exists
            if gh secret list | grep -q "$SECRET_NAME"; then
                print_success "Secret '$SECRET_NAME' is already configured"
                PAT_CONFIGURED=true
            else
                print_warning "Secret '$SECRET_NAME' is not configured"
                PAT_CONFIGURED=false
            fi
        else
            print_warning "GitHub CLI is not authenticated"
            print_info "Run: gh auth login"
            PAT_CONFIGURED=false
        fi
    else
        print_warning "Cannot automatically check PAT configuration without gh CLI"
        echo ""
        echo "Please manually verify that the secret '$SECRET_NAME' is configured:"
        echo "1. Go to your repository Settings → Secrets and variables → Actions"
        echo "2. Check if '$SECRET_NAME' exists"
        PAT_CONFIGURED=false
    fi

    echo ""
}

# =============================================================================
# Configure PAT
# =============================================================================

configure_pat() {
    print_header "Configuring Personal Access Token"

    echo "You need a Personal Access Token (PAT) with 'repo' scope to access"
    echo "the private actions repository: $ACTIONS_REPO"
    echo ""

    read -p "Do you want to configure the PAT now? (y/n) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ "$HAS_GH_CLI" = true ]; then
            echo ""
            echo "Please enter your PAT (input will be hidden):"
            read -s PAT_TOKEN
            echo ""

            if [ -z "$PAT_TOKEN" ]; then
                print_error "No token provided"
                return 1
            fi

            # Set the secret
            echo "$PAT_TOKEN" | gh secret set "$SECRET_NAME"

            if [ $? -eq 0 ]; then
                print_success "PAT configured successfully as '$SECRET_NAME'"
                PAT_CONFIGURED=true
            else
                print_error "Failed to configure PAT"
                return 1
            fi
        else
            echo ""
            print_info "Without gh CLI, you need to configure the secret manually:"
            echo ""
            echo "1. Generate a PAT at: https://github.com/settings/tokens"
            echo "   - Click 'Generate new token (classic)'"
            echo "   - Check 'repo' scope"
            echo "   - Click 'Generate token' and copy it"
            echo ""
            echo "2. Add the secret to your repository:"
            echo "   - Go to: Settings → Secrets and variables → Actions"
            echo "   - Click 'New repository secret'"
            echo "   - Name: $SECRET_NAME"
            echo "   - Secret: <paste your PAT>"
            echo ""
            read -p "Press Enter when you have configured the secret..."
            PAT_CONFIGURED=true
        fi
    else
        print_info "Skipping PAT configuration"
        print_warning "You must configure '$SECRET_NAME' manually before the workflow will work"
    fi

    echo ""
}

# =============================================================================
# Generate Workflow
# =============================================================================

generate_workflow() {
    print_header "Generating Workflow File"

    WORKFLOWS_DIR="$REPO_ROOT/.github/workflows"
    mkdir -p "$WORKFLOWS_DIR"

    WORKFLOW_FILE="$WORKFLOWS_DIR/ci-with-private-actions.yml"

    if [ -f "$WORKFLOW_FILE" ]; then
        print_warning "Workflow file already exists: $WORKFLOW_FILE"
        read -p "Overwrite? (y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Skipping workflow generation"
            return 0
        fi
    fi

    cat > "$WORKFLOW_FILE" << 'EOF'
name: CI with Private Actions

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      # 1. Checkout your repository
      - name: Checkout repository
        uses: actions/checkout@v4

      # 2. Checkout private actions repository
      - name: Checkout private actions
        uses: actions/checkout@v4
        with:
          repository: ACTIONS_REPO_PLACEHOLDER
          token: ${{ secrets.SECRET_NAME_PLACEHOLDER }}
          path: .github/private-actions
          ref: ACTIONS_VERSION_PLACEHOLDER

      # 3. Use composite actions
      - name: Setup Node.js environment
        uses: ./.github/private-actions/composite-actions/setup-node
        with:
          node-version: '18.x'

      # 4. Your build steps
      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

      # 5. Send notification (optional)
      - name: Send notification
        if: always()
        uses: ./.github/private-actions/composite-actions/notify
        with:
          status: ${{ job.status }}
          message: 'Build ${{ job.status }}'
          webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
EOF

    # Replace placeholders
    sed -i.bak "s|ACTIONS_REPO_PLACEHOLDER|$ACTIONS_REPO|g" "$WORKFLOW_FILE"
    sed -i.bak "s|SECRET_NAME_PLACEHOLDER|$SECRET_NAME|g" "$WORKFLOW_FILE"
    sed -i.bak "s|ACTIONS_VERSION_PLACEHOLDER|$ACTIONS_VERSION|g" "$WORKFLOW_FILE"
    rm -f "${WORKFLOW_FILE}.bak"

    print_success "Workflow generated: $WORKFLOW_FILE"

    echo ""
    print_info "Workflow configuration:"
    echo "  - Actions repository: $ACTIONS_REPO"
    echo "  - Version: $ACTIONS_VERSION"
    echo "  - Secret name: $SECRET_NAME"
    echo ""
}

# =============================================================================
# Generate README
# =============================================================================

generate_readme() {
    print_header "Generating Documentation"

    README_FILE="$REPO_ROOT/.github/PRIVATE_ACTIONS_SETUP.md"

    cat > "$README_FILE" << EOF
# Private Actions Setup

This repository uses private GitHub Actions from \`$ACTIONS_REPO\`.

## Configuration

### Required Secret

- **Name**: \`$SECRET_NAME\`
- **Purpose**: Access the private actions repository
- **Scope**: \`repo\` (Full control of private repositories)

### How to Generate PAT

1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Give it a descriptive name (e.g., "Access to $ACTIONS_REPO")
4. Select scopes:
   - ✅ \`repo\` (Full control of private repositories)
5. Click "Generate token"
6. Copy the token immediately (you won't see it again!)

### How to Add Secret to Repository

1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: \`$SECRET_NAME\`
4. Secret: Paste your PAT
5. Click "Add secret"

## Workflow

The workflow file is located at: \`.github/workflows/ci-with-private-actions.yml\`

It automatically:
1. Checks out your code
2. Checks out the private actions repository (using the PAT)
3. Uses composite actions from the private repository
4. Runs your build and tests

## Available Composite Actions

From \`$ACTIONS_REPO\`:

- \`composite-actions/setup-node\` - Setup Node.js with caching
- \`composite-actions/notify\` - Send workflow notifications
- \`composite-actions/cache-dependencies\` - Smart dependency caching

## Updating Actions Version

To update the version of private actions used:

1. Edit \`.github/workflows/ci-with-private-actions.yml\`
2. Change the \`ref\` parameter in the checkout step
3. Commit and push

## Troubleshooting

### Workflow fails with "Resource not accessible by integration"

- Check that the secret \`$SECRET_NAME\` is configured
- Verify the PAT has not expired
- Ensure the PAT has \`repo\` scope

### "Repository not found" error

- Verify the actions repository name is correct: \`$ACTIONS_REPO\`
- Check that the PAT has access to the actions repository
- Ensure you have permission to access the actions repository

## References

- Actions repository: https://github.com/$ACTIONS_REPO
- Full documentation: https://github.com/$ACTIONS_REPO/blob/main/CROSS_ORG_PRIVATE_ACCESS.md
EOF

    print_success "Documentation generated: $README_FILE"
    echo ""
}

# =============================================================================
# Verify Configuration
# =============================================================================

verify_configuration() {
    print_header "Verifying Configuration"

    local all_ok=true

    # Check workflow file exists
    WORKFLOW_FILE="$REPO_ROOT/.github/workflows/ci-with-private-actions.yml"
    if [ -f "$WORKFLOW_FILE" ]; then
        print_success "Workflow file exists"
    else
        print_error "Workflow file not found"
        all_ok=false
    fi

    # Check PAT configuration
    if [ "$PAT_CONFIGURED" = true ]; then
        print_success "PAT is configured"
    else
        print_warning "PAT configuration not verified"
        print_info "Please configure '$SECRET_NAME' secret manually"
        all_ok=false
    fi

    # Check if workflow file has correct content
    if [ -f "$WORKFLOW_FILE" ]; then
        if grep -q "$ACTIONS_REPO" "$WORKFLOW_FILE" && \
           grep -q "$SECRET_NAME" "$WORKFLOW_FILE"; then
            print_success "Workflow file has correct configuration"
        else
            print_error "Workflow file is missing required configuration"
            all_ok=false
        fi
    fi

    echo ""

    if [ "$all_ok" = true ]; then
        print_success "Configuration verified successfully!"
    else
        print_warning "Configuration incomplete. Please review the warnings above."
    fi

    echo ""
}

# =============================================================================
# Summary and Next Steps
# =============================================================================

print_summary() {
    print_header "Setup Complete!"

    echo "✨ Your repository is now configured to use private GitHub Actions."
    echo ""
    echo "📝 Next Steps:"
    echo ""
    echo "1. Review the generated workflow:"
    echo "   $WORKFLOW_FILE"
    echo ""

    if [ "$PAT_CONFIGURED" != true ]; then
        echo "2. ⚠️  Configure the required secret '$SECRET_NAME':"
        echo "   Repository Settings → Secrets and variables → Actions"
        echo ""
    fi

    echo "3. Customize the workflow for your needs"
    echo ""
    echo "4. Commit and push the changes:"
    echo "   git add .github/"
    echo "   git commit -m 'chore: setup private actions'"
    echo "   git push"
    echo ""
    echo "5. The workflow will run automatically on next push!"
    echo ""
    echo "📚 Documentation: $REPO_ROOT/.github/PRIVATE_ACTIONS_SETUP.md"
    echo ""
    echo "❓ Need help? Check: https://github.com/$ACTIONS_REPO/blob/main/CROSS_ORG_PRIVATE_ACCESS.md"
    echo ""
}

# =============================================================================
# Main
# =============================================================================

main() {
    clear

    print_header "🚀 Private GitHub Actions Setup Script"

    echo "This script will help you configure your repository to use"
    echo "private GitHub Actions from: $ACTIONS_REPO"
    echo ""

    read -p "Continue? (y/n) " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Setup cancelled"
        exit 0
    fi

    check_prerequisites
    check_pat_config

    if [ "$PAT_CONFIGURED" != true ]; then
        configure_pat
    fi

    generate_workflow
    generate_readme
    verify_configuration
    print_summary
}

# Run main function
main "$@"
