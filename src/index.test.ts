const mockCore = {
    getInput: jest.fn(),
    setOutput: jest.fn(),
    setFailed: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warning: jest.fn()
};
const mockConfiguration = jest.fn();
const mockApi = { listEnvironmentVariables: jest.fn() };

jest.mock('@actions/core', () => mockCore);
jest.mock('@quantcdn/quant-client', () => ({
    Configuration: mockConfiguration,
    VariablesApi: jest.fn(() => mockApi)
}));

const flush = () => new Promise(resolve => setTimeout(resolve, 10));

async function basePathFor(baseUrl: string): Promise<string> {
    const inputs: Record<string, string> = {
        api_key: 'k', organization: 'org', app_name: 'app', environment_name: 'env',
        operation: 'list', base_url: baseUrl
    };
    mockCore.getInput.mockImplementation((name: string) => inputs[name] ?? '');
    jest.isolateModules(() => {
        require('./index');
    });
    await flush();
    return mockConfiguration.mock.calls[0][0].basePath;
}

describe('base_url normalisation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockApi.listEnvironmentVariables.mockResolvedValue({ data: {} });
    });

    it.each([
        ['https://dashboard.quantcdn.io', 'https://dashboard.quantcdn.io'],
        ['https://dashboard.quantcdn.io/', 'https://dashboard.quantcdn.io'],
        ['https://dashboard.quantcdn.io/api/v3', 'https://dashboard.quantcdn.io'],
        ['https://dashboard.quantcdn.io/api/v3/', 'https://dashboard.quantcdn.io'],
        ['https://dashboard.quantcdn.io/api', 'https://dashboard.quantcdn.io'],
        ['https://api.example.com', 'https://api.example.com'],
        ['', 'https://dashboard.quantcdn.io']
    ])('%s -> %s', async (input, expected) => {
        expect(await basePathFor(input)).toBe(expected);
    });
});
