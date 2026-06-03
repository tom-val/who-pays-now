#!/usr/bin/env bash
#
# One-time bootstrap for the Who Pays Now infrastructure.
# Run this once in AWS CloudShell (or anywhere with admin AWS credentials) BEFORE
# the first GitHub Actions deploy.
#
# It creates, idempotently:
#   1. The Terraform state S3 bucket (versioned + encrypted + private)
#   2. The Terraform state-lock DynamoDB table
#   3. The GitHub Actions OIDC provider (if not already present)
#   4. An IAM role GitHub Actions assumes to deploy (prints its ARN at the end)
#
# Usage:
#   bash bootstrap.sh
#   (override any value via env vars, e.g. GITHUB_REPO=... REGION=... bash bootstrap.sh)
#
set -euo pipefail

# --- Config (override via env vars) ----------------------------------------
PROJECT="${PROJECT:-who-pays-now}"
REGION="${REGION:-eu-central-1}"
GITHUB_REPO="${GITHUB_REPO:-tom-val/who-pays-now}"   # owner/repo allowed to assume the role
ROLE_NAME="${ROLE_NAME:-${PROJECT}-github-actions}"
LOCK_TABLE="${LOCK_TABLE:-${PROJECT}-terraform-locks}"
# ---------------------------------------------------------------------------

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
# S3 bucket names are global; the account id keeps it unique.
STATE_BUCKET="${STATE_BUCKET:-${PROJECT}-tfstate-${ACCOUNT_ID}}"
FRONTEND_BUCKET="${PROJECT}-web-${ACCOUNT_ID}"   # must match infra/terraform/frontend.tf
OIDC_HOST="token.actions.githubusercontent.com"
OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_HOST}"

echo "Account:  ${ACCOUNT_ID}"
echo "Region:   ${REGION}"
echo "Repo:     ${GITHUB_REPO}"
echo "Bucket:   ${STATE_BUCKET}"
echo

# --- 1. State bucket --------------------------------------------------------
if aws s3api head-bucket --bucket "${STATE_BUCKET}" 2>/dev/null; then
  echo "✓ State bucket ${STATE_BUCKET} already exists"
else
  echo "→ Creating state bucket ${STATE_BUCKET}"
  if [[ "${REGION}" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "${STATE_BUCKET}" --region "${REGION}"
  else
    aws s3api create-bucket \
      --bucket "${STATE_BUCKET}" \
      --region "${REGION}" \
      --create-bucket-configuration LocationConstraint="${REGION}"
  fi
fi
aws s3api put-bucket-versioning \
  --bucket "${STATE_BUCKET}" \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption \
  --bucket "${STATE_BUCKET}" \
  --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-public-access-block \
  --bucket "${STATE_BUCKET}" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
echo "✓ State bucket configured (versioning + encryption + private)"
echo

# --- 2. Lock table ----------------------------------------------------------
if aws dynamodb describe-table --table-name "${LOCK_TABLE}" --region "${REGION}" >/dev/null 2>&1; then
  echo "✓ Lock table ${LOCK_TABLE} already exists"
else
  echo "→ Creating lock table ${LOCK_TABLE}"
  aws dynamodb create-table \
    --table-name "${LOCK_TABLE}" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${REGION}" >/dev/null
  aws dynamodb wait table-exists --table-name "${LOCK_TABLE}" --region "${REGION}"
  echo "✓ Lock table created"
fi
echo

# --- 3. GitHub OIDC provider ------------------------------------------------
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "${OIDC_ARN}" >/dev/null 2>&1; then
  echo "✓ GitHub OIDC provider already exists"
else
  echo "→ Creating GitHub OIDC provider"
  aws iam create-open-id-connect-provider \
    --url "https://${OIDC_HOST}" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" >/dev/null
  echo "✓ OIDC provider created"
fi
echo

# --- 4. IAM role for GitHub Actions ----------------------------------------
TRUST_POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "${OIDC_ARN}" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "${OIDC_HOST}:aud": "sts.amazonaws.com" },
      "StringLike": { "${OIDC_HOST}:sub": "repo:${GITHUB_REPO}:*" }
    }
  }]
}
JSON
)

DEPLOY_POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TerraformState",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::${STATE_BUCKET}",
        "arn:aws:s3:::${STATE_BUCKET}/*"
      ]
    },
    {
      "Sid": "TerraformLock",
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"],
      "Resource": "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${LOCK_TABLE}"
    },
    {
      "Sid": "Deploy",
      "Effect": "Allow",
      "Action": [
        "dynamodb:*",
        "lambda:*",
        "apigateway:*",
        "logs:*",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    },
    {
      "Sid": "FrontendBucket",
      "Effect": "Allow",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::${FRONTEND_BUCKET}",
        "arn:aws:s3:::${FRONTEND_BUCKET}/*"
      ]
    },
    {
      "Sid": "CloudFront",
      "Effect": "Allow",
      "Action": "cloudfront:*",
      "Resource": "*"
    },
    {
      "Sid": "DeployIam",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:PassRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:ListRolePolicies",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:ListAttachedRolePolicies",
        "iam:TagRole",
        "iam:UntagRole"
      ],
      "Resource": "arn:aws:iam::${ACCOUNT_ID}:role/${PROJECT}-*"
    }
  ]
}
JSON
)

if aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
  echo "→ Updating trust policy on existing role ${ROLE_NAME}"
  aws iam update-assume-role-policy --role-name "${ROLE_NAME}" --policy-document "${TRUST_POLICY}" >/dev/null
else
  echo "→ Creating role ${ROLE_NAME}"
  aws iam create-role --role-name "${ROLE_NAME}" --assume-role-policy-document "${TRUST_POLICY}" >/dev/null
fi
aws iam put-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name "${PROJECT}-deploy" \
  --policy-document "${DEPLOY_POLICY}" >/dev/null
echo "✓ Role ready"
echo

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo "============================================================"
echo "Bootstrap complete. Configure GitHub → Settings → Secrets and variables → Actions:"
echo
echo "  Secret    AWS_DEPLOY_ROLE_ARN = ${ROLE_ARN}"
echo "  Variable  AWS_REGION          = ${REGION}"
echo "  Variable  TF_STATE_BUCKET     = ${STATE_BUCKET}"
echo
echo "(The state-lock table ${LOCK_TABLE} is wired in automatically by deploy.yml.)"
echo
echo "Then push to main to deploy."
echo "============================================================"
