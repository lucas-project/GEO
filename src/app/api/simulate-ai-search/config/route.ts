/**
 * GET /api/simulate-ai-search/config — platform modes + Ollama readiness
 */

import { NextResponse } from 'next/server';
import { getSimulationPlatformConfig } from '@shared/ai/multi';
import { getCapabilityAvailability } from '@shared/ai';
import { checkOllamaSimulationHealth, ollamaSetupSteps } from '@shared/ai/ollama-health';

export async function GET() {
  const platformConfig = getSimulationPlatformConfig();
  const availability = getCapabilityAvailability('simulation');
  const ollamaHealth = await checkOllamaSimulationHealth();

  return NextResponse.json({
    ...platformConfig,
    availability,
    ollama: {
      enabled: ollamaHealth.enabled,
      reachable: ollamaHealth.reachable,
      ready: ollamaHealth.ready,
      baseUrl: ollamaHealth.baseUrl,
      missingModels: ollamaHealth.missingModels,
      setupSteps: ollamaSetupSteps(ollamaHealth),
    },
  });
}
