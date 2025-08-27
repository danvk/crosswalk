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
  schema: {type: string};
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
      'application/json'?: {
        schema: Schema;
      };
      'multipart/form-data'?: {
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
      schema: {type: 'string'},
    }));
}

/** Convert /foo/:bar/:baz --> /foo/{bar}/{baz} */
function expressPathToOpenApiPath(path: string): string {
  return path.replace(/:([^/]+)/g, '{$1}');
}

const DEFINITION = '#/definitions/' as const;
const SCHEMA = '#/components/schemas/' as const;

/** Helper to recursively resolve schema references. Return the names of all nested references and the resolved schema. */
function resolveSchemaRef(
  spec: any,
  schema: Schema,
  prefix: typeof DEFINITION | typeof SCHEMA,
): [string[], unknown] {
  if (!schema.$ref) {
    throw new Error(`Expected schema with $ref, got ${JSON.stringify(schema)}`);
  }

  const ref = schema.$ref;
  if (!ref.startsWith(prefix)) {
    throw new Error(`Expected reference starting with ${prefix}, got ${ref}`);
  }

  const name = ref.slice(prefix.length);
  const def = prefix === DEFINITION ? spec.definitions[name] : spec.components?.schemas[name];

  if (!def) {
    throw new Error(`Unable to find definition for ${name}`);
  }

  if (def.$ref) {
    const [nestedNames, resolvedDef] = resolveSchemaRef(spec, def, prefix);
    return [[name, ...nestedNames], resolvedDef];
  }

  return [[name], def];
}

export function followApiRefV2(spec: any, schema: Schema): [string[], unknown] {
  return resolveSchemaRef(spec, schema, DEFINITION);
}

export function followApiRefV3(spec: any, schema: Schema): [string[], unknown] {
  return resolveSchemaRef(spec, schema, SCHEMA);
}

function handleNullTypes(result: any): void {
  if (
    result.anyOf &&
    Array.isArray(result.anyOf) &&
    result.anyOf.some((item: any) => item.type === 'null')
  ) {
    const nonNullTypes = result.anyOf.filter((item: any) => item.type !== 'null');
    if (nonNullTypes.length) {
      if (nonNullTypes.length === 1) {
        Object.assign(result, nonNullTypes[0]);
        delete result.anyOf;
      } else {
        result.anyOf = nonNullTypes;
      }
      result.nullable = true;
    }
  }
  if (Array.isArray(result.type) && result.type.some((item: any) => item === 'null')) {
    const nonNullTypes = result.type.filter((item: any) => item !== 'null');
    if (nonNullTypes) {
      result.type = nonNullTypes.length === 1 ? nonNullTypes[0] : nonNullTypes;
      result.nullable = true;
    }
  }
  if (Array.isArray(result.enum) && result.enum.some((item: any) => item === null)) {
    const nonNullEnums = result.enum.filter((item: any) => item !== null);
    result.enum = nonNullEnums;
  }
}

function handleLiteralTypes(result: any): void {
  if (result.const) {
    result.enum = [result.const];
    delete result.const;
  }
}

/**
 * Recursively transforms all references in an object from OpenAPI 2.0 to 3.0 format
 * and sanitizes component names in the process.
 */
function transformToOpenApiV3(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => transformToOpenApiV3(item));
  }

  // Handle objects
  const result = {...obj};

  if (result.properties) {
    for (const [key, value] of Object.entries(obj.properties)) {
      result.properties[key] = transformToOpenApiV3(value);
    }
  }

  // Transform $ref if it exists
  if (result.$ref && typeof result.$ref === 'string') {
    if (result.$ref.startsWith(DEFINITION)) {
      const refName = result.$ref.slice(DEFINITION.length);
      const sanitizedName = sanitizeComponentName(refName);
      result.$ref = `${SCHEMA}${sanitizedName}`;
    }
  }
  // Handle anyOf with null type (convert to nullable)
  handleNullTypes(result);
  handleLiteralTypes(result);

  if (result.definitions) {
    const componentSchemas: Record<string, any> = {};
    for (const [key, value] of Object.entries(result.definitions)) {
      const sanitizedKey = sanitizeComponentName(key);
      componentSchemas[sanitizedKey] = transformToOpenApiV3(value);
    }
    result.components = {schemas: componentSchemas};
    delete result.definitions;
  }

  // Recursively transform all properties
  for (const [key, value] of Object.entries(result)) {
    result[key] = transformToOpenApiV3(value);
  }

  return result;
}

/**
 * Sanitize component names to be OpenAPI 3.0 compliant
 * Component names can only contain the characters A-Z a-z 0-9 - . _
 */
function sanitizeComponentName(name: string): string {
  return name.replace(/[^A-Za-z0-9\-._]/g, '_');
}

/**
 * Detect if a field should be treated as a file upload in multipart requests.
 * This is a heuristic based on common file field names and types.
 */
function isFileField(schema: any): boolean {
  // Check if it references the File definition
  if (schema.properties?.__type?.enum?.includes('file')) {
    return true;
  }

  return false;
}

/**
 * Generate a multipart/form-data schema from a JSON Schema.
 * This converts the schema to follow OpenAPI 3.0 multipart specification.
 */
function generateMultipartSchema(requestSchema: any, apiSchema?: any): any {
  if (requestSchema.$ref) {
    requestSchema = followApiRefV3(apiSchema, requestSchema)[1];
  }

  if (!requestSchema || !requestSchema.properties) {
    return requestSchema;
  }

  const multipartSchema = {
    type: 'object',
    properties: {} as Record<string, any>,
    required: [] as string[],
  };

  for (const [fieldName, fieldSchema] of Object.entries(requestSchema.properties)) {
    // Resolve the schema if it's a reference
    const resolvedSchema = (fieldSchema as any).$ref
      ? (followApiRefV3(apiSchema, fieldSchema as Schema)[1] as Schema)
      : fieldSchema;

    const isFile = isFileField(resolvedSchema);

    if (isFile) {
      // Mark as binary file upload
      multipartSchema.properties[fieldName] = {
        type: 'string',
        format: 'binary',
      };
    } else {
      // Regular form field
      multipartSchema.properties[fieldName] = fieldSchema;
    }
  }

  // Copy required fields
  if (requestSchema.required) {
    multipartSchema.required = requestSchema.required;
  }

  return multipartSchema;
}

/** Convert an API spec to OpenAPI 2.0 (Swagger) */
function apiSpecToOpenApi2(apiSpec: any, options?: Options): any {
  apiSpec = JSON.parse(JSON.stringify(apiSpec)); // defensive copy
  const {required: endpoints, properties: endpointSpecs, definitions} = apiSpec;

  // Remove endpoints, helpers
  const paths: Record<string, any> = {};

  const typesToDelete = new Set<string>();

  for (const endpoint of endpoints) {
    const openApiPath = expressPathToOpenApiPath(endpoint);
    paths[openApiPath] = {};
    const byVerb = endpointSpecs[endpoint].properties;
    for (const [verb, ref] of Object.entries(byVerb)) {
      const [names, schema] = followApiRefV2(apiSpec, ref as Schema);
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
          // Resolve query parameter references to track types that should be preserved
          if (value.$ref) {
            const [queryNames] = followApiRefV2(apiSpec, value);
            for (const name of queryNames) {
              typesToDelete.delete(name); // Don't delete types used in query parameters
            }
          }
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
      for (const name of names) {
        typesToDelete.add(name);
      }
    }
  }

  typesToDelete.forEach(name => {
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
  const transformedSpec = transformToOpenApiV3(apiSpec);
  const {required: endpoints, properties: endpointSpecs} = transformedSpec;

  // Remove endpoints, helpers
  const paths: Record<string, any> = {};
  const typesToDelete = new Set<string>();

  for (const endpoint of endpoints) {
    const openApiPath = expressPathToOpenApiPath(endpoint);
    paths[openApiPath] = {};
    const byVerb = endpointSpecs[endpoint].properties;

    for (const [verb, ref] of Object.entries(byVerb)) {
      const [names, schema] = followApiRefV3(transformedSpec, ref as Schema);
      const {request, response, query, contentType} = (schema as any).properties;
      let resolvedQuery = query;

      // Create updated parameters using OpenAPI 3.0 format
      const parameters: OpenAPIV3Param[] = extractOpenAPIV3PathParams(endpoint);

      if (resolvedQuery?.$ref) {
        resolvedQuery = followApiRefV3(transformedSpec, query)[1];
      }

      if (resolvedQuery?.properties) {
        for (const [key, value] of Object.entries<Schema>(resolvedQuery.properties)) {
          parameters.push({
            name: key,
            in: 'query',
            schema: value,
          });
        }
      }

      const openApi: OpenAPIV3Endpoint = {
        summary: (ref as any).description,
        ...(parameters.length && {parameters}),
        responses: {
          200: {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: response?.type === 'null' ? {} : response,
              },
            },
          },
        },
      };

      // Add requestBody for 3.0 if request exists and it's not a DELETE operation
      if (request?.type !== 'null' && verb.toLowerCase() !== 'delete') {
        const isMultipart =
          contentType?.const === 'multipart' || contentType?.enum?.includes('multipart');

        if (isMultipart) {
          // Generate multipart/form-data schema
          const multipartSchema = generateMultipartSchema(request, transformedSpec);
          openApi.requestBody = {
            content: {
              'multipart/form-data': {
                schema: multipartSchema,
              },
            },
          };
        } else {
          // Standard JSON request body
          openApi.requestBody = {
            content: {
              'application/json': {
                schema: request,
              },
            },
          };
        }
      }

      paths[openApiPath][verb] = openApi;
      for (const name of names) {
        typesToDelete.add(sanitizeComponentName(name));
      }
    }
  }

  typesToDelete.forEach(name => {
    delete transformedSpec.components.schemas[name];
  });

  delete options?.version;

  return {
    openapi: '3.0.0',
    info: {
      title: 'Generated API',
      description: 'testing testing',
      version: '',
    },
    paths,
    components: transformedSpec.components,
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
