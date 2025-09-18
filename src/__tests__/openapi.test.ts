import {apiSpecToOpenApi} from '../openapi';
import apiSchemaJson from './api.schema.json';

describe('Open API integration', () => {
  it('should have the expected endpoints', () => {
    const openApi = apiSpecToOpenApi(apiSchemaJson, {version: '2.0'});
    expect(openApi).toMatchSnapshot('open-api');
  });

  // TODO:
  // - test that descriptions get set
});

describe('Open API V3', () => {
  it('should have the expected endpoints', () => {
    const openApi = apiSpecToOpenApi(apiSchemaJson, {version: '3.1.0'});
    expect(openApi).toMatchSnapshot('open-api-v3');
  });

  // TODO:
  // - test that descriptions get set
});
