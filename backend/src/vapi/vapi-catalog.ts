export interface ModelOption {
  id: string;
  label: string;
  note?: string;
  costPerMinUsd: number;
  latencyMs: number;
  recommended?: boolean;
}

export interface LanguageOption {
  id: string;
  label: string;
  recommended?: boolean;
}

export interface VoiceOption {
  id: string;
  label: string;
  note?: string;
  recommended?: boolean;
}

export interface TranscriberProvider {
  id: string;
  label: string;
  models: ModelOption[];
  languages: LanguageOption[];
  defaultLanguage: string;
  recommended?: boolean;
}

export interface LlmProvider {
  id: string;
  label: string;
  models: ModelOption[];
  modelsFree: boolean;
  recommended?: boolean;
}

export interface VoiceProvider {
  id: string;
  label: string;
  engines: ModelOption[];
  voices: VoiceOption[];
  allowsCustomVoiceId: boolean;
  languages: LanguageOption[];
  defaultLanguage: string;
  recommended?: boolean;
}

export const VAPI_CATALOG = {
  transcribers: [
    {
      id: 'deepgram',
      label: 'Deepgram',
      recommended: true,
      defaultLanguage: 'es',
      languages: [
        { id: 'es', label: 'Español (España / Global)', recommended: true },
        { id: 'es-419', label: 'Español (Latinoamérica)' },
        { id: 'en', label: 'Inglés' },
        { id: 'fr', label: 'Francés' },
        { id: 'de', label: 'Alemán' },
        { id: 'it', label: 'Italiano' },
        { id: 'pt', label: 'Portugués' },
      ],
      models: [
        {
          id: 'nova-3-general',
          label: 'Nova 3 General (Recomendado)',
          costPerMinUsd: 0.01,
          latencyMs: 320,
          recommended: true,
        },
        {
          id: 'nova-2',
          label: 'Nova 2',
          costPerMinUsd: 0.008,
          latencyMs: 350,
        },
      ],
    },
  ] as TranscriberProvider[],

  llms: [
    {
      id: 'openai',
      label: 'OpenAI',
      recommended: true,
      modelsFree: false,
      models: [
        {
          id: 'gpt-5.6-luna',
          label: 'GPT 5.6 Luna (Optimizado para Voz)',
          costPerMinUsd: 0.01,
          latencyMs: 800,
          recommended: true,
        },
        {
          id: 'gpt-4o-mini',
          label: 'GPT-4o Mini (Rápido y Económico)',
          costPerMinUsd: 0.005,
          latencyMs: 650,
          recommended: true,
        },
        {
          id: 'gpt-4o',
          label: 'GPT-4o (Alta Precisión)',
          costPerMinUsd: 0.03,
          latencyMs: 950,
        },
      ],
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      modelsFree: false,
      models: [
        {
          id: 'claude-3-5-sonnet-20241022',
          label: 'Claude 3.5 Sonnet',
          costPerMinUsd: 0.035,
          latencyMs: 1100,
        },
        {
          id: 'claude-3-5-haiku-20241022',
          label: 'Claude 3.5 Haiku',
          costPerMinUsd: 0.008,
          latencyMs: 700,
        },
      ],
    },
    {
      id: 'groq',
      label: 'Groq (Ultra Baja Latencia)',
      modelsFree: false,
      models: [
        {
          id: 'llama-3.3-70b-versatile',
          label: 'Llama 3.3 70B Versatile',
          costPerMinUsd: 0.006,
          latencyMs: 380,
          recommended: true,
        },
      ],
    },
  ] as LlmProvider[],

  voices: [
    {
      id: '11labs',
      label: 'ElevenLabs',
      recommended: true,
      allowsCustomVoiceId: true,
      defaultLanguage: 'es',
      languages: [{ id: 'es', label: 'Español' }],
      engines: [
        {
          id: 'eleven_turbo_v2_5',
          label: 'Turbo v2.5 (Baja Latencia)',
          costPerMinUsd: 0.036,
          latencyMs: 490,
          recommended: true,
        },
        {
          id: 'eleven_multilingual_v2',
          label: 'Multilingual v2',
          costPerMinUsd: 0.04,
          latencyMs: 650,
        },
      ],
      voices: [
        {
          id: 'UOIqAnmS11Reiei1Ytkc',
          label: 'Carolina / Burt (Español Natural)',
          recommended: true,
        },
        {
          id: '21m00Tcm4TlvDq8ikWAM',
          label: 'Rachel (Calma y Profesional)',
        },
        {
          id: 'AZnzlk1XvdvUeBnXmlld',
          label: 'Domi (Cálida y Amable)',
        },
        {
          id: 'EXAVITQu4vr4xnSDxMaL',
          label: 'Bella (Resolutiva)',
        },
      ],
    },
    {
      id: 'openai',
      label: 'OpenAI Voice',
      allowsCustomVoiceId: false,
      defaultLanguage: 'es',
      languages: [{ id: 'es', label: 'Español' }],
      engines: [],
      voices: [
        { id: 'alloy', label: 'Alloy', recommended: true },
        { id: 'echo', label: 'Echo' },
        { id: 'fable', label: 'Fable' },
        { id: 'onyx', label: 'Onyx' },
        { id: 'nova', label: 'Nova' },
        { id: 'shimmer', label: 'Shimmer' },
      ],
    },
    {
      id: 'cartesia',
      label: 'Cartesia Sonic',
      allowsCustomVoiceId: true,
      defaultLanguage: 'es',
      languages: [{ id: 'es', label: 'Español' }],
      engines: [
        {
          id: 'sonic-multilingual',
          label: 'Sonic Multilingual (150ms)',
          costPerMinUsd: 0.02,
          latencyMs: 160,
          recommended: true,
        },
      ],
      voices: [
        { id: 'f114a467-c40a-4db8-964d-aaba16120898', label: 'Español Femenino Fluido' },
        { id: 'a0e99841-438c-4a64-b679-ae501e7d6091', label: 'Español Masculino Barítono' },
      ],
    },
  ] as VoiceProvider[],

  platformCostPerMinUsd: 0.05,
};
