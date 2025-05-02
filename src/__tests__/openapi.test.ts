import {apiSpecToOpenApi} from '../openapi';
import apiSchemaJson from './api.schema.json';

describe('Open API integration', () => {
  

  it('should have the expected endpoints', () => {
    const openApi = apiSpecToOpenApi(apiSchemaJson);
    expect(openApi).toMatchSnapshot('open-api');
  });

  it('should have the expected endpoints for v3', () => {
    const openApi = apiSpecToOpenApi(apiSchemaJson, {version: '3.0'});
    expect(openApi).toMatchSnapshot('open-api-v3');
  });


  // TODO:
  // - test that descriptions get set
});
