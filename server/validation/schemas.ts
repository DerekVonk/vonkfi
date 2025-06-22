import { z } from 'zod';

// Re-export schemas from middleware for convenience
export { pathParams, queryParams, apiSchemas as createSchemas, updateSchemas } from '../middleware/validation';