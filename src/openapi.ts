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

type Param = PathParam | QueryParam | BodyParam;

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

export interface Options {
  info?: {
    title?: string;
    description?: string;
    version?: string;
  };
  host?: string;
  basePath?: string;
  schemes?: ('http' | 'https')[];
}

const isObject = <T>(x: T): x is object & T => !!x && typeof x === 'object';

function extractPathParams(path: string): PathParam[] {
  const tokens = pathToRegexp.parse(path);
  return tokens.filter(isObject).map(tok => ({
    name: '' + tok.name,
    in: 'path',
    type: 'string',
  }));
}

/** Convert /foo/:bar/:baz --> /foo/{bar}/{baz} */
function expressPathToOpenApiPath(path: string): string {
  return path.replace(/:([^/]+)/g, '{$1}');
}

const DEFINITION = '#/definitions/';
export function followApiRef(spec: any, schema: Schema): [string, unknown] {
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

/** Convert an API spec (generated via typescript-json-schema) to OpenAPI. */
export function apiSpecToOpenApi(apiSpec: any, options?: Options): any {
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
      const [name, schema] = followApiRef(apiSpec, ref as Schema);
      const {request, response, query} = (schema as any).properties;

      const parameters: Param[] = extractPathParams(endpoint);
      if (request?.type !== 'null') {
        parameters.push({
          name: 'body',
          in: 'body',
          schema: request,
        });
      }

      if (query.properties) {
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
          // TODO: do I need to break this down by status?
          200: {
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
