// Convert API JSON Schema to Open API format.

import * as fs from 'fs';

if (process.argv.length !== 3) {
  console.error('invalid invocation');
  process.exit(0);
}
let [_node, _src, apiSchemaPath] = process.argv;

const apiSpec = JSON.parse(fs.readFileSync(apiSchemaPath, 'utf8'));

const {required: endpoints, properties: endpointSpecs, definitions} = apiSpec;

const DEFINITION = '#/definitions/';
function followRef(schema: Schema): [string, unknown] {
  const ref = schema.$ref;
  if (!ref.startsWith(DEFINITION)) {
    throw new Error(`Confused by ${schema} / ${ref}`);
  }

  const name = ref.slice(DEFINITION.length);
  const def = definitions[name];
  if (!def) {
    throw new Error(`Unable to find definition for ${name}`);
  }
  return [name, def];
}

// Remove endpoints, helpers
const paths: Record<string, any> = {};

for (const endpoint of endpoints) {
  paths[endpoint] = {};
  const byVerb = endpointSpecs[endpoint].properties;
  for (const [verb, ref] of Object.entries(byVerb)) {
    const [name, schema] = followRef(ref as Schema);
    const {request, response} = (schema as any).properties;
    const parameters: Param[] = [];

    if (request?.type !== 'null') {
      parameters.push({
        name: 'body',
        in: 'body',
        schema: request,
      });
    }
    // TODO: path parameters

    const swagger: SwaggerEndpoint = {
      summary: (ref as any).description,
      ...(parameters.length && {parameters}),
      responses: {
        200: {
          schema: response
        }
      }
    };
    paths[endpoint][verb] = swagger;
    delete definitions[name];
  }
}

type Schema = { $ref: string };

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

type Param = PathParam | BodyParam;

interface SwaggerEndpoint {
  summary?: string;
  description?: string;
  parameters?: Param[];
  responses: {[statusCode: string]: {
    description?: string;
    schema: Schema;
  }};
}

const openApiSpec = {
  swagger: "2.0",
  info: {
    title: "Generated API",
    description: "testing testing",
    version: "",
  },
  host: 'localhost',
  basePath: '/',
  schemes: [
    "https",
  ],
  paths,
  definitions,
};

console.log(JSON.stringify(openApiSpec, null, 2));
