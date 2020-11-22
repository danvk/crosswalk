// Convert API JSON Schema to Open API format.

import * as fs from 'fs';
import {apiSpecToOpenApi} from './openapi';

if (process.argv.length !== 3) {
  console.error('invalid invocation');
  process.exit(0);
}
let [_node, _src, apiSchemaPath] = process.argv;

const apiSpec = JSON.parse(fs.readFileSync(apiSchemaPath, 'utf8'));
const openApiSpec = apiSpecToOpenApi(apiSpec);

console.log(JSON.stringify(openApiSpec, null, 2));
