'use client';

import { Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { OllamaSetupBanner } from '@/components/geo/visibility-check-results';
import {
  useSimulationPlatformConfig,
  type SimulationPlatformMode,
} from './use-simulation-platform-config';

const MODE_LABEL: Record<SimulationPlatformMode, string> = {
  live: 'Live API',
  local: 'Ollama',
  persona: 'Persona',
  mock: 'Mock',
};

const MODE_VARIANT: Record<SimulationPlatformMode, 'success' | 'accent' | 'outline'> = {
  live: 'success',
  local: 'success',
  persona: 'accent',
  mock: 'outline',
};

export function SimulationHowItWorks() {
  const { data } = useSimulationPlatformConfig();

  return (
    <details className="rounded-lg border border-border-subtle bg-bg-muted/30 px-4 py-3 group">
      <summary className="cursor-pointer list-none flex items-center gap-2 text-sm font-medium text-fg select-none">
        <Info className="w-4 h-4 text-fg-muted shrink-0" />
        How simulation works
        <span className="text-fg-subtle font-normal text-xs ml-1">(click to expand)</span>
      </summary>
      <div className="mt-3 space-y-3 text-[13px] text-fg-muted leading-relaxed">
        {!data?.availability?.available && data?.availability?.message && (
          <p className="text-xs rounded-md border border-border-subtle bg-bg-muted/50 px-2.5 py-2">
            Simulation unavailable: {data.availability.message}
          </p>
        )}
        {data?.localMultiModel ? (
          <p>
            Each question runs against four local Ollama models (shown by real model name below). We extract
            brands and URLs from each answer and score whether your target brand appears.
          </p>
        ) : (
          <p>
            Each question is sent to four answer-engine slots — ChatGPT, Gemini, Claude, and Perplexity.
            We extract brands and URLs from each response and score whether your target brand appears.
          </p>
        )}
        {!data?.localMultiModel && (
          <p>
            When a platform has its own API key configured, we call that provider directly. Otherwise the
            simulation provider
            {data ? ` (${data.simulationProvider})` : ''} runs with a platform-specific system prompt.
          </p>
        )}
        {data?.localMultiModel && (
          <p className="text-xs text-success/90 rounded-md border border-success/30 bg-success/5 px-2.5 py-2">
            Local mode — batch uses one Ollama model with four platform personas. Discovery questions are
            not given your site content or brand hints; visibility is scored after the answer. This is not
            live web search — results reflect model training recall, not today&apos;s Google/ChatGPT results.
          </p>
        )}
        {data && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {data.platforms.map((p) => (
              <li
                key={p.platform}
                className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-bg px-2.5 py-1.5"
              >
                <span className="text-fg text-sm font-mono truncate" title={p.label}>
                  {p.label}
                </span>
                <Badge variant={MODE_VARIANT[p.mode]} className="shrink-0 text-[10px]">
                  {MODE_LABEL[p.mode]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-fg-subtle">
          Batch mode runs each selected question through all four models. With an audit linked, relevant page
          excerpts are prepended as context. Click a visibility-check row for per-model citations.
        </p>
        {data?.ollama && <OllamaSetupBanner ollama={data.ollama} />}
      </div>
    </details>
  );
}
