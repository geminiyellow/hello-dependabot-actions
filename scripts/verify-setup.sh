#!/usr/bin/env bash

# =============================================================================
# Verification Script for Private GitHub Actions Setup
# =============================================================================
# This script verifies that your repository is correctly configured to use
# private GitHub Actions.
#
# Usage:
#   ./verify-setup.sh
#
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
EXPECTED_SECRET="AF_ACTIONS_PAT"
ACTIONS_REPO="af/actions-packages"

# =============================================================================
# Helper Functions
# =============================================================================

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

print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# =============================================================================
# Verification Functions
# =============================================================================

verify_git_repo() {
    print_header "Checking Git Repository"

    if git rev-parse --git-dir > /dev/null 2>&1; then
        print_success "Current directory is a git repository"
        REPO_ROOT=$(git rev-parse --show-toplevel)
        return 0
    else
        print_error "Not in a git repository"
        return 1
    fi
}

verify_github_cli() {
    print_header "Checking GitHub CLI"

    if command -v gh &> /dev/null; then
        print_success "GitHub CLI (gh) is installed"

        if gh auth status &> /dev/null; then
            print_success "GitHub CLI is authenticated"
            HAS_GH_CLI=true
            return 0
        else
            print_warning "GitHub CLI is not authenticated"
            print_info "Run: gh auth login"
            HAS_GH_CLI=false
            return 1
        fi
    else
        print_warning "GitHub CLI (gh) is not installed"
        print_info "Install from: https://cli.github.com/"
        HAS_GH_CLI=false
        return 1
    fi
}

verify_workflow_files() {
    print_header "Checking Workflow Files"

    local workflows_dir="$REPO_ROOT/.github/workflows"
    local found_workflows=0
    local has_private_actions=false

    if [ ! -d "$workflows_dir" ]; then
        print_error "No .github/workflows directory found"
        return 1
    fi

    print_info "Scanning workflow files..."

    for workflow in "$workflows_dir"/*.yml "$workflows_dir"/*.yaml; do
        if [ -f "$workflow" ]; then
            found_workflows=$((found_workflows + 1))
            local basename=$(basename "$workflow")

            # Check if workflow uses private actions
            if grep -q "repository:.*$ACTIONS_REPO" "$workflow" || \
               grep -q ".github/private-actions" "$workflow"; then
                print_success "Found workflow using private actions: $basename"
                has_private_actions=true

                # Check if it uses the correct secret
                if grep -q "$EXPECTED_SECRET" "$workflow"; then
                    print_success "  Uses correct secret: $EXPECTED_SECRET"
                else
                    print_warning "  May not use expected secret: $EXPECTED_SECRET"
                fi
            fi
        fi
    done

    if [ $found_workflows -eq 0 ]; then
        print_error "No workflow files found"
        return 1
    else
        print_info "Total workflows found: $found_workflows"
    fi

    if [ "$has_private_actions" = false ]; then
        print_warning "No workflows found that use private actions"
        print_info "Run: ./scripts/generate-workflow.sh"
        return 1
    fi

    return 0
}

verify_secret_config() {
    print_header "Checking Secret Configuration"

    if [ "$HAS_GH_CLI" = true ]; then
        if gh secret list | grep -q "$EXPECTED_SECRET"; then
            print_success "Secret '$EXPECTED_SECRET' is configured"
            return 0
        else
            print_error "Secret '$EXPECTED_SECRET' is NOT configured"
            echo ""
            print_info "Configure the secret:"
            echo "  1. Create a PAT: https://github.com/settings/tokens"
            echo "  2. Run: echo 'YOUR_PAT' | gh secret set $EXPECTED_SECRET"
            echo "  OR"
            echo "  3. Manually add in: Settings → Secrets and variables → Actions"
            return 1
        fi
    else
        print_warning "Cannot verify secret without GitHub CLI"
        echo ""
        print_info "To verify manually:"
        echo "  Go to: Settings → Secrets and variables → Actions"
        echo "  Check if '$EXPECTED_SECRET' exists"
        return 1
    fi
}

verify_pat_permissions() {
    print_header "Testing PAT Permissions"

    if [ "$HAS_GH_CLI" = true ]; then
        print_info "Attempting to access private actions repository..."

        # Try to fetch info about the actions repository
        if gh repo view "$ACTIONS_REPO" &> /dev/null; then
            print_success "Can access actions repository: $ACTIONS_REPO"
            return 0
        else
            print_warning "Cannot access actions repository with current authentication"
            print_info "Make sure your PAT has access to: $ACTIONS_REPO"
            return 1
        fi
    else
        print_warning "Cannot test PAT permissions without GitHub CLI"
        return 1
    fi
}

verify_node_setup() {
    print_header "Checking Node.js Setup"

    if [ -f "$REPO_ROOT/package.json" ]; then
        print_success "package.json found"

        # Check for common scripts
        if grep -q '"test"' "$REPO_ROOT/package.json"; then
            print_success "Test script is defined"
        else
            print_warning "No test script defined in package.json"
        fi

        if grep -q '"build"' "$REPO_ROOT/package.json"; then
            print_success "Build script is defined"
        else
            print_warning "No build script defined in package.json"
        fi

        return 0
    else
        print_warning "No package.json found"
        print_info "This may not be a Node.js project"
        return 1
    fi
}

# =============================================================================
# Generate Report
# =============================================================================

generate_report() {
    print_header "Verification Summary"

    local total_checks=0
    local passed_checks=0
    local failed_checks=0
    local warnings=0

    # Count results
    for result in "${RESULTS[@]}"; do
        total_checks=$((total_checks + 1))
        case $result in
            0) passed_checks=$((passed_checks + 1)) ;;
            1) failed_checks=$((failed_checks + 1)) ;;
            2) warnings=$((warnings + 1)) ;;
        esac
    done

    echo "Total Checks:    $total_checks"
    echo -e "Passed:          ${GREEN}$passed_checks${NC}"
    echo -e "Failed:          ${RED}$failed_checks${NC}"
    echo -e "Warnings:        ${YELLOW}$warnings${NC}"
    echo ""

    if [ $failed_checks -eq 0 ]; then
        print_success "All critical checks passed!"
        echo ""
        echo "✨ Your repository is ready to use private GitHub Actions!"
        echo ""
        echo "Next steps:"
        echo "  1. Commit your changes: git add .github && git commit -m 'Setup private actions'"
        echo "  2. Push to GitHub: git push"
        echo "  3. Check the Actions tab to see your workflow run"
        return 0
    else
        print_error "Some checks failed"
        echo ""
        echo "Please fix the issues above and run this script again."
        echo ""
        echo "Need help? Check:"
        echo "  - Documentation: https://github.com/$ACTIONS_REPO/blob/main/CROSS_ORG_PRIVATE_ACCESS.md"
        echo "  - Run setup: ./scripts/setup.sh"
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    clear

    echo -e "${BLUE}"
    cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   Private GitHub Actions Setup Verification                  ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    RESULTS=()

    # Run verifications
    verify_git_repo && RESULTS+=(0) || RESULTS+=(1)
    verify_github_cli && RESULTS+=(0) || RESULTS+=(2)
    verify_workflow_files && RESULTS+=(0) || RESULTS+=(1)
    verify_secret_config && RESULTS+=(0) || RESULTS+=(1)
    verify_pat_permissions && RESULTS+=(0) || RESULTS+=(2)
    verify_node_setup && RESULTS+=(0) || RESULTS+=(2)

    # Generate final report
    generate_report

    exit_code=$?
    echo ""
    exit $exit_code
}

main "$@"
