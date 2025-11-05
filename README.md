# Quant Cloud Environment Variables Action

This GitHub Action manages environment variables in Quant Cloud environments.

## Features

- **List** all environment variables
- **Set** variables from multiple sources:
  - .env files
  - JSON strings
  - Individual KEY=VALUE pairs
- **Clear** all variables in an environment
- **Delete** specific variables by key

## Usage Examples

### List All Environment Variables

```yaml
- uses: quantcdn/quant-cloud-environment-var-action@v1
  with:
    api_key: ${{ secrets.QUANT_API_KEY }}
    organization: your-org-id
    app_name: my-app
    environment_name: production
    operation: list
```

### Set Variables from .env File

```yaml
- uses: quantcdn/quant-cloud-environment-var-action@v1
  with:
    api_key: ${{ secrets.QUANT_API_KEY }}
    organization: your-org-id
    app_name: my-app
    environment_name: production
    operation: set
    env_file: .env.production
```

### Set Variables from JSON

```yaml
- uses: quantcdn/quant-cloud-environment-var-action@v1
  with:
    api_key: ${{ secrets.QUANT_API_KEY }}
    organization: your-org-id
    app_name: my-app
    environment_name: production
    operation: set
    json_vars: |
      {
        "DATABASE_URL": "postgres://...",
        "API_KEY": "secret123",
        "DEBUG": "false"
      }
```

### Set Individual Variables

```yaml
- uses: quantcdn/quant-cloud-environment-var-action@v1
  with:
    api_key: ${{ secrets.QUANT_API_KEY }}
    organization: your-org-id
    app_name: my-app
    environment_name: production
    operation: set
    variables: |
      DATABASE_URL=postgres://...
      API_KEY=secret123
      DEBUG=false
```

### Set Variables from Multiple Sources

Variables from all sources are merged (later sources override earlier ones):

```yaml
- uses: quantcdn/quant-cloud-environment-var-action@v1
  with:
    api_key: ${{ secrets.QUANT_API_KEY }}
    organization: your-org-id
    app_name: my-app
    environment_name: production
    operation: set
    env_file: .env.production          # Base configuration
    json_vars: '{"API_KEY": "override"}'  # Override specific values
    variables: DEBUG=true                  # Final overrides
```

### Delete Specific Variables

```yaml
- uses: quantcdn/quant-cloud-environment-var-action@v1
  with:
    api_key: ${{ secrets.QUANT_API_KEY }}
    organization: your-org-id
    app_name: my-app
    environment_name: production
    operation: delete
    keys: |
      OLD_VAR_1
      OLD_VAR_2
      DEPRECATED_KEY
```

### Clear All Variables

```yaml
- uses: quantcdn/quant-cloud-environment-var-action@v1
  with:
    api_key: ${{ secrets.QUANT_API_KEY }}
    organization: your-org-id
    app_name: my-app
    environment_name: staging
    operation: clear
```

## Complete Workflow Example

```yaml
name: Deploy with Environment Variables

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      # Clear existing variables
      - name: Clear old variables
        uses: quantcdn/quant-cloud-environment-var-action@v1
        with:
          api_key: ${{ secrets.QUANT_API_KEY }}
          organization: your-org-id
          app_name: my-app
          environment_name: production
          operation: clear
      
      # Set new variables from .env file
      - name: Set production variables
        uses: quantcdn/quant-cloud-environment-var-action@v1
        with:
          api_key: ${{ secrets.QUANT_API_KEY }}
          organization: your-org-id
          app_name: my-app
          environment_name: production
          operation: set
          env_file: .env.production
          variables: |
            BUILD_NUMBER=${{ github.run_number }}
            COMMIT_SHA=${{ github.sha }}
      
      # List variables for verification
      - name: List variables
        id: list-vars
        uses: quantcdn/quant-cloud-environment-var-action@v1
        with:
          api_key: ${{ secrets.QUANT_API_KEY }}
          organization: your-org-id
          app_name: my-app
          environment_name: production
          operation: list
      
      - name: Show variable count
        run: echo "Total variables: ${{ steps.list-vars.outputs.count }}"
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `api_key` | Quant API key | Yes | - |
| `organization` | Quant organisation ID | Yes | - |
| `app_name` | Name of your application | Yes | - |
| `environment_name` | Name of the environment | Yes | - |
| `operation` | Operation to perform: `list`, `set`, `clear`, `delete` | No | `list` |
| `base_url` | Quant Cloud API URL | No | `https://dashboard.quantcdn.io/api/v3` |
| `env_file` | Path to .env file (for `set` operation) | No | - |
| `json_vars` | JSON string of variables (for `set` operation) | No | - |
| `variables` | Newline or comma-separated KEY=VALUE pairs (for `set` operation) | No | - |
| `keys` | Newline or comma-separated list of variable keys (for `delete` operation) | No | - |

## Outputs

| Output | Description | Operations |
|--------|-------------|------------|
| `variables` | JSON string of all variables | `list` |
| `count` | Number of variables | `list` |
| `updated_count` | Number of variables successfully set | `set` |
| `deleted_count` | Number of variables successfully deleted | `clear`, `delete` |
| `failed_count` | Number of variables that failed to update/delete | `set`, `clear`, `delete` |

## Operations

### `list`

Lists all environment variables for the specified environment. Variable keys are logged, but values are only available in the `variables` output (for security).

### `set`

Sets or updates environment variables. Supports three input methods that can be combined:

1. **env_file**: Path to a .env file
   - Supports `KEY=VALUE` format
   - Handles comments (lines starting with #)
   - Strips quotes from values
   
2. **json_vars**: JSON object as a string
   - Must be valid JSON: `{"KEY": "value", ...}`
   
3. **variables**: Individual KEY=VALUE pairs
   - Newline or comma-separated
   - Example: `KEY1=value1\nKEY2=value2`

Variables are merged with priority: env_file → json_vars → variables (later overrides earlier)

### `clear`

Deletes all environment variables in the specified environment. Lists variables first, then deletes each one.

### `delete`

Deletes specific environment variables by key. Provide a newline or comma-separated list of keys in the `keys` input.

## .env File Format

The action supports standard .env file format:

```bash
# Comments are ignored
DATABASE_URL=postgres://user:pass@host:5432/db
API_KEY=secret123

# Quoted values are supported
APP_NAME="My Application"
APP_DESCRIPTION='A great app'

# Empty lines are ignored

DEBUG=true
PORT=3000
```

## Error Handling

- Failed operations log warnings but don't fail the action
- Outputs include `failed_count` to track partial failures
- 404 errors on delete operations are treated as success (already deleted)
- For `set` operations, the action continues even if some variables fail

## Security Notes

- API keys should always be stored in GitHub Secrets
- Variable values are never logged (only keys are shown in logs)
- The `list` operation outputs values only in the `variables` output, not in logs
- Consider using GitHub Environments with protection rules for production deployments

## Development

### Building

```bash
npm install
npm run build
```

### Local Testing

Set environment variables and run the test script:

```bash
export QUANT_API_KEY=your-api-key
export QUANT_ORGANIZATION=your-org-id
export QUANT_APP_NAME=your-app
export QUANT_ENVIRONMENT_NAME=your-environment
node test-dist/test-local.js
```
