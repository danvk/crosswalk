import {apiSpecToOpenApi} from '../openapi';
import apiSchemaJson from './api.schema.json';

describe('Open API integration', () => {
  const openApi = apiSpecToOpenApi(apiSchemaJson);

  it('should have the expected endpoints', () => {
    expect(openApi).toMatchSnapshot('open-api');
  });

  // TODO:
  // - test that descriptions get set
});
