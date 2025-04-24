import {apiSpecToOpenApi} from '../openapi';
import apiSchemaJson from './api.schema.json';

describe('Open API integration', () => {
  const openApi = apiSpecToOpenApi(apiSchemaJson, {version: '2.0'});

  it('should have the expected endpoints', () => {
    expect(openApi).toMatchSnapshot('open-api');
  });

  // TODO:
  // - test that descriptions get set
});

describe('Open API V3', () => {
  const openApi = apiSpecToOpenApi(apiSchemaJson, {version: '3.0'});

  it('should have the expected endpoints', () => {
    expect(openApi).toMatchSnapshot('open-api-v3');
  });

  // TODO:
  // - test that descriptions get set
});
