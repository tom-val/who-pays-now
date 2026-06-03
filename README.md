# Who Pays Now

Whose turn is it to pay? Create a group, add your crew, and never argue about
whose round it is again. Each person gets their own colour; the screen shows who
pays next for the current category. Tap when they've paid and it rolls to the
next person. Swipe between categories (Restaurant, Coffee, Gas, …) — each keeps
its own fair rotation.

No accounts. Create or join a group by its unique name, or share a link.

<p align="center"><em>Installable PWA · .NET 10 Lambda · DynamoDB · Terraform · GitHub Actions</em></p>

## How it works

- **Groups** get a random unguessable id on creation; the name is just a display
  label (and need not be unique). You join with the invite link `…/g/<id>` — or by
  pasting the link / id into **Join**. Sharing the link is the normal path in.
- **Members** each pick a name and colour. Your device remembers which member
  you are per group (in `localStorage`) — that's the only "identity".
- **Turns** are balance-based and fair: within each category the person who has
  paid the fewest times is up next, ties broken by join order. Marking a payment
  bumps that person's count, so turns rotate naturally and stay fair even as
  people join or leave.
- **Sync** is by polling — every device refreshes the group every few seconds and
  on focus, so everyone sees the current payer.

## Architecture

```
┌────────────┐    HTTPS    ┌──────────────┐   $default   ┌──────────────────┐
│  PWA (S3 + │ ──────────► │  API Gateway │ ───────────► │  .NET 10 Lambda  │
│ CloudFront)│             │  (HTTP API)  │              │ (ASP.NET min API)│
└────────────┘             └──────────────┘              └────────┬─────────┘
                                                                   │
                                                          ┌────────▼─────────┐
                                                          │    DynamoDB      │
                                                          │  (single table)  │
                                                          └──────────────────┘
```

| Layer    | Tech                                                                   |
|----------|------------------------------------------------------------------------|
| Frontend | React + Vite, installable PWA (`vite-plugin-pwa`), no router dependency |
| Backend  | .NET 10 ASP.NET Core minimal API on Lambda (managed `dotnet10` runtime, arm64) |
| Data     | DynamoDB single table (`PK = GROUP#<id>`, `SK = META \| MEMBER# \| CATEGORY#`) |
| Infra    | Terraform (DynamoDB, Lambda, API Gateway, S3 + CloudFront)             |
| CI/CD    | GitHub Actions — CI on PRs, deploy on `main`                           |

## Repository layout

```
backend/            .NET solution
  WhoPaysNow.Api/   minimal API + DynamoDB store + domain logic
  WhoPaysNow.Tests/ xUnit tests for slug / colour / turn logic
frontend/           React + Vite PWA
  src/screens/      Home · Join · PayScreen · Manage
infra/terraform/    all AWS resources
.github/workflows/  ci.yml (build+test+validate) · deploy.yml (provision+ship)
docker-compose.yml  DynamoDB Local for development
```

## Local development

Prerequisites: .NET 10 SDK, Node 20+, Docker.

```bash
# 1. DynamoDB Local (the API auto-creates the table in Development)
docker compose up -d

# 2. Backend on http://localhost:5080
cd backend/WhoPaysNow.Api
ASPNETCORE_ENVIRONMENT=Development dotnet run --urls http://localhost:5080

# 3. Frontend on http://localhost:5173 (talks to the local API by default)
cd frontend
npm install
npm run dev
```

Run the backend tests:

```bash
dotnet test backend/WhoPaysNow.slnx
```

## API

| Method | Path                                          | Purpose                          |
|--------|-----------------------------------------------|----------------------------------|
| POST   | `/groups`                                     | Create a group (returns its generated id) |
| GET    | `/groups/{id}`                                | Full group state (members, categories, current payers) |
| POST   | `/groups/{id}/members`                        | Join / add a member              |
| DELETE | `/groups/{id}/members/{memberId}`             | Remove a member                  |
| POST   | `/groups/{id}/categories`                     | Add a category                   |
| PUT    | `/groups/{id}/categories/{categoryId}`        | Rename / re-emoji a category     |
| DELETE | `/groups/{id}/categories/{categoryId}`        | Delete a category                |
| POST   | `/groups/{id}/categories/{categoryId}/pay`    | Record a payment, advance the turn |

`pay` accepts an optional `expectedPayerId`; if the turn has already moved on it
returns `409` so a double-tap can't pay for the wrong person. The endpoint also
uses optimistic concurrency (a per-category `rev`) to serialise simultaneous taps.

## Deployment

Deployment runs through GitHub Actions (`.github/workflows/deploy.yml`) on push to
`main`. One-time setup — run the bootstrap once with admin AWS credentials (e.g. in
AWS CloudShell):

```bash
bash infra/bootstrap.sh
```

It idempotently creates the Terraform **state bucket**, the **state-lock table**,
the **GitHub OIDC provider**, and the **deploy IAM role** (scoped to this repo and
project), then prints the three values to add under
**GitHub → Settings → Secrets and variables → Actions**:

- Secret `AWS_DEPLOY_ROLE_ARN`
- Variables `AWS_REGION`, `TF_STATE_BUCKET`

The pipeline then, on every push to `main`:

1. runs `terraform apply` (provisioning/updating all infra; Terraform owns the
   Lambda function but not its code),
2. publishes the backend (framework-dependent, arm64) and ships it with
   `aws lambda update-function-code`,
3. builds the frontend with `VITE_API_BASE` pointing at the freshly-applied API,
4. syncs `dist/` to S3 and invalidates CloudFront.

The PWA URL and API URL are printed in the job summary.

### Custom domain

The app is served at **https://whopays.valiunas.dev**. It reuses the existing
`*.valiunas.dev` wildcard certificate in ACM (us-east-1) — set via the
`acm_certificate_arn` variable — so there's no per-deploy certificate validation.
CloudFront attaches the cert and the domain as an alias automatically on `apply`.

The only manual step is pointing DNS at CloudFront, at your DNS host (Cloudflare):

```
CNAME  whopays.valiunas.dev  →  <cloudfront_domain>
```

Get the target with `terraform output -raw cloudfront_domain` (e.g.
`d2dwwqiza3pkey.cloudfront.net`). To disable the custom domain, set
`domain_name = ""` (CloudFront falls back to its default `*.cloudfront.net` name).

### Deploying by hand

```bash
# provision (Lambda starts with a placeholder zip)
cd infra/terraform
terraform init -backend-config="bucket=<state-bucket>" -backend-config="region=<region>"
terraform apply

# ship the backend code onto the managed dotnet10 runtime
cd ../..
dotnet publish backend/WhoPaysNow.Api/WhoPaysNow.Api.csproj -c Release -r linux-arm64 -o backend/publish
( cd backend/publish && zip -r ../lambda.zip . )
aws lambda update-function-code \
  --function-name "$(terraform -chdir=infra/terraform output -raw lambda_function_name)" \
  --zip-file fileb://backend/lambda.zip

# build + ship the frontend
cd frontend
VITE_API_BASE="$(terraform -chdir=../infra/terraform output -raw api_base_url)" npm run build
aws s3 sync dist "s3://$(terraform -chdir=../infra/terraform output -raw frontend_bucket)" --delete
```

## License

MIT
