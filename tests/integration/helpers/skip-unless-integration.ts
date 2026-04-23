import { it } from 'vitest';

export const itIntegration = process.env.AZDO_INTEGRATION === '1' ? it : it.skip;
