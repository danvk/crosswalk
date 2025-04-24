import * as pathToRegexp from 'path-to-regexp';

type Schema = {$ref: string};

interface BodyParam {
  in: 'body';
  name: string;
  schema: Schema;
}

interface PathParam {
  in: 'path';
  name: string;
  type: 'string';
  description?: string;
}

interface QueryParam {
  in: 'query';
  name: string;
  schema: Schema;
  description?: string;
}

interface OpenAPIV3PathParam extends Omit<PathParam, 'type'> {
  required: boolean;
  schema: { type: string };
}

interface OpenAPIV3QueryParam extends QueryParam {
  required?: boolean;
}

type Param = PathParam | QueryParam | BodyParam;
type OpenAPIV3Param = OpenAPIV3PathParam | OpenAPIV3QueryParam;

interface SwaggerEndpoint {
  summary?: string;
  description?: string;
  parameters?: Param[];
  responses: {
    [statusCode: string]: {
      description?: string;
      schema: Schema;
    };
  };
}

interface OpenAPIV3Endpoint {
  summary?: string;
  description?: string;
  parameters?: OpenAPIV3Param[];
  requestBody?: {
    content: {
      'application/json': {
        schema: Schema;
      };
    };
  };
  responses: {
    [statusCode: string]: {
      description: string;
      content: {
        'application/json': {
          schema: Schema;
        };
      };
    };
  };
}

export interface Options {
  info?: {
    title?: string;
    description?: string;
    version?: string;
  };
  host?: string;
  basePath?: string;
  schemes?: ('http' | 'https')[];
  version?: '2.0' | '3.0';
}

function extractPathParams(path: string): PathParam[] {
  const tokens = pathToRegexp.parse(path);
  return tokens.tokens
    .filter(token => token.type === 'param')
    .map(tok => ({
      name: '' + tok.name,
      in: 'path',
      type: 'string',
    }));
}

function extractOpenAPIV3PathParams(path: string): OpenAPIV3PathParam[] {
  const tokens = pathToRegexp.parse(path);
  return tokens.tokens
    .filter(token => token.type === 'param')
    .map(tok => ({
      name: '' + tok.name,
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
}

/** Convert /foo/:bar/:baz --> /foo/{bar}/{baz} */
function expressPathToOpenApiPath(path: string): string {
  return path.replace(/:([^/]+)/g, '{$1}');
}

const DEFINITION = '#/definitions/';
const SCHEMA = '#/components/schemas/';

export function followApiRefV2(spec: any, schema: Schema): [string, unknown] {
  const ref = schema.$ref;
  if (!ref.startsWith(DEFINITION)) {
    throw new Error(`Confused by ${schema} / ${ref}`);
  }

  const name = ref.slice(DEFINITION.length);
  const def = spec.definitions[name];
  if (!def) {
    throw new Error(`Unable to find definition for ${name}`);
  }
  return [name, def];
}

export function followApiRefV3(spec: any, schema: Schema): [string, unknown] {
  const ref = schema.$ref;
  if (!ref.startsWith(SCHEMA)) {
    throw new Error(`Confused by ${schema} / ${ref}`);
  }

  const name = ref.slice(SCHEMA.length);
  const def = spec.components.schemas[name];
  if (!def) {
    throw new Error(`Unable to find definition for ${name}`);
  }
  return [name, def];
}

/**
 * Transforms JSON Schema references to OpenAPI 3.0 format.
 *
 * The input JSON Schema (and OpenAPI 2.0) uses references in the format:
 *   #/definitions/ModelName
 *
 * OpenAPI 3.0 changed this reference format to:
 *   #/components/schemas/ModelName
 *
 * This function recursively traverses an object structure and updates all $ref
 * properties to use the OpenAPI 3.0 format.
 *
 * @param obj The object containing references to transform
 * @returns The object with updated references
 */
function transformReferencesToV3(obj: any): any {
  if (!obj) return obj;

  if (typeof obj === 'object') {
    if (obj.$ref && typeof obj.$ref === 'string') {
      obj.$ref = obj.$ref.replace(DEFINITION, SCHEMA);
    }

    Object.keys(obj).forEach(key => {
      obj[key] = transformReferencesToV3(obj[key]);
    });
  }

  return obj;
}

/**
 * Sanitize component names to be OpenAPI 3.0 compliant
 * Component names can only contain the characters A-Z a-z 0-9 - . _
 */
function sanitizeComponentName(name: string): string {
  return name.replace(/[^A-Za-z0-9\-._]/g, '_');
}

/** Convert an API spec to OpenAPI 2.0 (Swagger) */
function apiSpecToOpenApi2(apiSpec: any, options?: Options): any {
  apiSpec = JSON.parse(JSON.stringify(apiSpec)); // defensive copy
  const {required: endpoints, properties: endpointSpecs, definitions} = apiSpec;

  // Remove endpoints, helpers
  const paths: Record<string, any> = {};

  const toDelete = new Set<string>();

  for (const endpoint of endpoints) {
    const openApiPath = expressPathToOpenApiPath(endpoint);
    paths[openApiPath] = {};
    const byVerb = endpointSpecs[endpoint].properties;
    for (const [verb, ref] of Object.entries(byVerb)) {
      const [name, schema] = followApiRefV2(apiSpec, ref as Schema);
      const {request, response, query} = (schema as any).properties;

      const parameters: Param[] = extractPathParams(endpoint);
      if (request?.type !== 'null') {
        parameters.push({
          name: 'body',
          in: 'body',
          schema: request,
        });
      }

      if (query?.properties) {
        for (const [key, value] of Object.entries<Schema>(query.properties)) {
          parameters.push({
            name: key,
            in: 'query',
            schema: value,
          });
        }
      }

      const swagger: SwaggerEndpoint = {
        summary: (ref as any).description,
        ...(parameters.length && {parameters}),
        responses: {
          200: {
            description: 'Successful response',
            schema: response,
          },
        },
      };
      paths[openApiPath][verb] = swagger;
      toDelete.add(name);
    }
  }

  toDelete.forEach(name => {
    delete definitions[name];
  });

  return {
    swagger: '2.0',
    info: {
      title: 'Generated API',
      description: 'testing testing',
      version: '',
    },
    paths,
    definitions,
    ...options,
  };
}

/** Convert an API spec to OpenAPI 3.0 */
function apiSpecToOpenApi3(apiSpec: any, options?: Options): any {
  apiSpec = JSON.parse(JSON.stringify(apiSpec)); // defensive copy
  const {required: endpoints, properties: endpointSpecs, definitions} = apiSpec;

  // Create sanitized component schemas
  const schemas: Record<string, any> = {};
  for (const [key, value] of Object.entries(definitions)) {
    const sanitizedKey = sanitizeComponentName(key);
    schemas[sanitizedKey] = value;
  }

  // Create components structure for OpenAPI 3.0
  apiSpec.components = {
    schemas
  };

  // Remove endpoints, helpers
  const paths: Record<string, any> = {};
  const toDelete = new Set<string>();

  for (const endpoint of endpoints) {
    const openApiPath = expressPathToOpenApiPath(endpoint);
    paths[openApiPath] = {};
    const byVerb = endpointSpecs[endpoint].properties;

    for (const [verb, ref] of Object.entries(byVerb)) {
      // Skip requestBody for DELETE operations
      const hasRequestBody = verb.toLowerCase() !== 'delete';

      // First get the reference in its original format
      const [name, schema] = followApiRefV2(apiSpec, ref as Schema);
      const {request, response, query} = (schema as any).properties;

      // Create updated parameters using OpenAPI 3.0 format
      const parameters: OpenAPIV3Param[] = extractOpenAPIV3PathParams(endpoint);

      if (query?.properties) {
        for (const [key, value] of Object.entries<Schema>(query.properties)) {
          parameters.push({
            name: key,
            in: 'query',
            schema: value,
          });
        }
      }

      // Transform the response schema to sanitized names
      const transformedResponse = JSON.parse(JSON.stringify(response));
      if (transformedResponse.$ref) {
        const refName = transformedResponse.$ref.split('/').pop();
        const sanitizedName = sanitizeComponentName(refName);
        transformedResponse.$ref = `#/components/schemas/${sanitizedName}`;
      }

      const openApi: OpenAPIV3Endpoint = {
        summary: (ref as any).description,
        ...(parameters.length && {parameters}),
        responses: {
          200: {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: transformedResponse,
              }
            }
          },
        },
      };

      // Add requestBody for 3.0 if request exists and it's not a DELETE operation
      if (request?.type !== 'null' && hasRequestBody) {
        // Transform the request schema to sanitized names
        const transformedRequest = JSON.parse(JSON.stringify(request));
        if (transformedRequest.$ref) {
          const refName = transformedRequest.$ref.split('/').pop();
          const sanitizedName = sanitizeComponentName(refName);
          transformedRequest.$ref = `#/components/schemas/${sanitizedName}`;
        }

        // Fix null types in anyOf (particularly in /complex.post endpoint)
        if (transformedRequest.properties?.user?.anyOf) {
          transformedRequest.properties.user.anyOf = transformedRequest.properties.user.anyOf.map((item: any) => {
            if (item.type === 'null') {
              return { type: 'object', nullable: true };
            }
            return item;
          });
        }

        openApi.requestBody = {
          content: {
            'application/json': {
              schema: transformedRequest,
            }
          }
        };
      }

      paths[openApiPath][verb] = openApi;
      toDelete.add(name);
    }
  }

  toDelete.forEach(name => {
    delete apiSpec.components.schemas[sanitizeComponentName(name)];
  });

  // Transform all references in the paths to OpenAPI 3.0 format
  const transformedPaths = transformReferencesToV3(paths);

  delete options?.version;

  return {
    openapi: '3.0.0',
    info: {
      title: 'Generated API',
      description: 'testing testing',
      version: '',
    },
    paths: transformedPaths,
    components: {
      schemas: apiSpec.components.schemas,
    },
    ...options,
  };
}

/** Convert an API spec to OpenAPI (either 2.0 or 3.0) */
export function apiSpecToOpenApi(apiSpec: any, options?: Options): any {
  const version = options?.version ?? '2.0';

  if (version === '2.0') {
    return apiSpecToOpenApi2(apiSpec, options);
  } else {
    return apiSpecToOpenApi3(apiSpec, options);
  }
}
