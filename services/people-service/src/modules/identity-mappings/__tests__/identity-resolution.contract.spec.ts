import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONTRACT_ROOT = resolve(
  process.cwd(),
  '../../docs/integrations/contracts',
);

function readJson(fileName: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(resolve(CONTRACT_ROOT, fileName), 'utf8'),
  ) as Record<string, unknown>;
}

describe('identity resolution wire contract', () => {
  it('publishes the versioned request, response, and status contract', () => {
    const contract = readJson('people-identity-resolution-openapi-v1.0.0.json');
    const paths = contract.paths as Record<string, unknown>;
    const route = (
      paths['/api/v1/internal/identity-mappings/resolve'] as Record<
        string,
        unknown
      >
    ).post as Record<string, unknown>;
    const responses = route.responses as Record<string, unknown>;

    expect(route.operationId).toBe('resolveIdentity');
    expect(Object.keys(responses).sort()).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
      '409',
      '503',
    ]);
    expect((responses['404'] as Record<string, unknown>).$ref as string).toBe(
      '#/components/responses/NotFound',
    );
  });

  it('keeps fixtures compatible and problem details free of identity material', () => {
    const request = readJson(
      'people-identity-resolution.resolve.v1.request.json',
    );
    const response = readJson(
      'people-identity-resolution.resolve.v1.response.json',
    );
    const problems = readJson(
      'people-identity-resolution.problem.v1.fixtures.json',
    );

    expect(Object.keys(request).sort()).toEqual(['issuer', 'subject']);
    expect(Object.keys(response)).toEqual(['personId']);
    for (const problem of Object.values(problems)) {
      expect(Object.keys(problem as Record<string, unknown>).sort()).toEqual([
        'correlationId',
        'detail',
        'instance',
        'status',
        'title',
        'type',
      ]);
      expect(JSON.stringify(problem)).not.toContain('subject');
      expect(JSON.stringify(problem)).not.toContain('token');
    }
  });
});
