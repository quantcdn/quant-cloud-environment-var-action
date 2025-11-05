import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import {
    VariablesApi,
    UpdateEnvironmentVariableRequest,
    BulkSetEnvironmentVariablesRequest
} from '@quantcdn/quant-client';
import { Configuration } from '@quantcdn/quant-client';

/**
 * Create API configuration with authentication
 */
const createApiConfig = (apiKey: string, baseUrl: string): Configuration => {
    return new Configuration({
        basePath: baseUrl,
        accessToken: apiKey
    });
}

/**
 * Parse .env file content into key-value pairs
 */
function parseEnvFile(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        // Parse KEY=VALUE format (handle quotes)
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            
            // Remove surrounding quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            
            result[key] = value;
        }
    }
    
    return result;
}

/**
 * Parse various input formats into key-value pairs
 */
function parseVariables(
    envFile?: string,
    jsonVars?: string,
    variables?: string
): Record<string, string> {
    let result: Record<string, string> = {};
    
    // Priority 1: .env file
    if (envFile) {
        core.info(`Loading variables from .env file: ${envFile}`);
        const content = fs.readFileSync(envFile, 'utf-8');
        result = { ...result, ...parseEnvFile(content) };
    }
    
    // Priority 2: JSON string
    if (jsonVars) {
        core.info('Loading variables from JSON');
        const parsed = JSON.parse(jsonVars);
        result = { ...result, ...parsed };
    }
    
    // Priority 3: Individual KEY=VALUE pairs (newline or comma separated)
    if (variables) {
        core.info('Loading individual variables');
        const pairs = variables.split(/[\n,]/).filter(p => p.trim());
        for (const pair of pairs) {
            const [key, ...valueParts] = pair.split('=');
            if (key && valueParts.length > 0) {
                result[key.trim()] = valueParts.join('=').trim();
            }
        }
    }
    
    return result;
}

interface ApiError {
    statusCode?: number;
    body?: {
        message?: string;
    }
}

/**
 * This action manages environment variables in Quant Cloud.
 * 
 * Operations:
 * - list: List all environment variables
 * - set: Set/update variables (from .env file, JSON, or individual pairs)
 * - clear: Delete all variables
 * - delete: Delete specific variables
 */
async function run(): Promise<void> {
    try {
        const apiKey = core.getInput('api_key', { required: true });
        const appName = core.getInput('app_name', { required: true });
        const organisation = core.getInput('organization', { required: true });
        const environmentName = core.getInput('environment_name', { required: true });
        const operation = core.getInput('operation', { required: false }) || 'list';
        const replace = core.getInput('replace', { required: false }) === 'true';

        const baseUrl = core.getInput('base_url') || 'https://dashboard.quantcdn.io/api/v3';

        const config = createApiConfig(apiKey, baseUrl);
        const client = new VariablesApi(config);

        core.info('Quant Cloud Environment Variables Action');
        core.info(`Operation: ${operation}`);

        // Handle LIST operation
        if (operation === 'list') {
            core.info(`Listing variables for environment: ${environmentName}`);
            const response = await client.listEnvironmentVariables(organisation, appName, environmentName) as any;
            const variables = (response.data || {}) as Record<string, string>;
            
            core.info(`Found ${Object.keys(variables).length} variable(s)`);
            
            // Output variables as JSON
            core.setOutput('variables', JSON.stringify(variables, null, 2));
            core.setOutput('count', Object.keys(variables).length);
            
            // Log individual variables (keys only for security)
            for (const key of Object.keys(variables)) {
                core.info(`  - ${key}`);
            }
            
            return;
        }

        // Handle CLEAR operation
        if (operation === 'clear') {
            core.info(`Clearing all variables for environment: ${environmentName}`);
            
            // Use bulk endpoint with empty array for fast clear
            const bulkRequest: BulkSetEnvironmentVariablesRequest = {
                environment: []
            };
            
            try {
                await client.bulkSetEnvironmentVariables(organisation, appName, environmentName, bulkRequest);
                core.info('✓ All variables cleared successfully');
                core.setOutput('deleted_count', 'all');
                core.setOutput('failed_count', 0);
            } catch (error) {
                const apiError = error as Error & ApiError;
                core.error(`Failed to clear variables: ${apiError.body?.message || (error as Error).message}`);
                throw error;
            }
            
            return;
        }

        // Handle DELETE operation
        if (operation === 'delete') {
            const keysInput = core.getInput('keys', { required: true });
            const keys = keysInput.split(/[\n,]/).map(k => k.trim()).filter(k => k);
            
            if (keys.length === 0) {
                throw new Error('No keys provided for delete operation');
            }
            
            core.info(`Deleting ${keys.length} variable(s)...`);
            
            let deleted = 0;
            let failed = 0;
            
            for (const key of keys) {
                try {
                    await client.deleteEnvironmentVariable(organisation, appName, environmentName, key);
                    core.info(`  ✓ Deleted: ${key}`);
                    deleted++;
                } catch (error) {
                    const apiError = error as Error & ApiError;
                    if (apiError.statusCode === 404) {
                        core.info(`  - Not found (already deleted): ${key}`);
                        deleted++;
                    } else {
                        core.warning(`  ✗ Failed to delete ${key}: ${apiError.body?.message || (error as Error).message}`);
                        failed++;
                    }
                }
            }
            
            core.info(`Deleted ${deleted} variable(s), ${failed} failed`);
            core.setOutput('deleted_count', deleted);
            core.setOutput('failed_count', failed);
            
            return;
        }

        // Handle SET operation
        if (operation === 'set') {
            const envFile = core.getInput('env_file', { required: false });
            const jsonVars = core.getInput('json_vars', { required: false });
            const variables = core.getInput('variables', { required: false });
            
            if (!envFile && !jsonVars && !variables) {
                throw new Error('At least one of env_file, json_vars, or variables must be provided for set operation');
            }
            
            const vars = parseVariables(envFile, jsonVars, variables);
            const keys = Object.keys(vars);
            
            if (keys.length === 0) {
                core.warning('No variables to set');
                return;
            }
            
            core.info(`Setting ${keys.length} variable(s)...${replace ? ' (replace mode - bulk API)' : ' (merge mode - individual updates)'}`);
            
            try {
                if (replace) {
                    // Replace mode: Use bulk API (replaces ALL variables)
                    const bulkRequest: BulkSetEnvironmentVariablesRequest = {
                        environment: keys.map(key => ({
                            name: key,
                            value: vars[key]
                        }))
                    };
                    
                    await client.bulkSetEnvironmentVariables(organisation, appName, environmentName, bulkRequest);
                    core.info(`✓ Successfully replaced all variables with ${keys.length} new variable(s)`);
                    
                    // Log individual variables (keys only for security)
                    for (const key of keys) {
                        core.info(`  - ${key}`);
                    }
                    
                    core.setOutput('updated_count', keys.length);
                    core.setOutput('failed_count', 0);
                } else {
                    // Merge mode: Update each variable individually (preserves existing vars)
                    let updated = 0;
                    let failed = 0;
                    
                    for (const key of keys) {
                        try {
                            const request: UpdateEnvironmentVariableRequest = { value: vars[key] };
                            await client.updateEnvironmentVariable(organisation, appName, environmentName, key, request);
                            core.info(`  ✓ Set: ${key}`);
                            updated++;
                        } catch (error) {
                            const apiError = error as Error & ApiError;
                            core.warning(`  ✗ Failed to set ${key}: ${apiError.body?.message || (error as Error).message}`);
                            failed++;
                        }
                    }
                    
                    core.info(`Set ${updated} variable(s), ${failed} failed`);
                    core.setOutput('updated_count', updated);
                    core.setOutput('failed_count', failed);
                    
                    if (failed > 0) {
                        throw new Error(`Failed to set ${failed} variable(s)`);
                    }
                }
            } catch (error) {
                if (replace) {
                    const apiError = error as Error & ApiError;
                    core.error(`Failed to set variables: ${apiError.body?.message || (error as Error).message}`);
                    core.setOutput('updated_count', 0);
                    core.setOutput('failed_count', keys.length);
                }
                throw error;
            }
            
            return;
        }

        throw new Error(`Unknown operation: ${operation}. Valid operations are: list, set, clear, delete`);

    } catch (error) {
        const apiError = error as Error & ApiError;
        const errorMessage = apiError.body?.message || (error as Error).message || 'Unknown error';
        core.setFailed(errorMessage);
    }

    return;
}

run(); 