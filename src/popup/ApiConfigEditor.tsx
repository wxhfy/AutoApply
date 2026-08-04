import React, { useState, useEffect, useCallback } from 'react';
import type { ApiConfig } from '../types';
import { chat } from '../llm/chat';

// ─── Provider Presets ───

interface ProviderPreset {
  name: string;
  endpoint: string;
  model: string;
  models: string[];
}

const PROVIDERS: ProviderPreset[] = [
  {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-4.1', 'o4-mini'],
  },
  {
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    name: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-20250514',
    models: [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-1-20250805',
      'claude-opus-4-5-20251101',
      'claude-fable-5-20250929',
    ],
  },
  {
    name: '自定义',
    endpoint: '',
    model: '',
    models: [],
  },
];

// 推理类模型：字段匹配场景不需要思维链，耗时会显著变长
const REASONING_MODELS = ['reasoner', 'o1', 'o3', 'o4-mini', 'thinking'];

// ─── Component ───

interface Props {
  config: ApiConfig | null;
  onSave: (config: ApiConfig) => Promise<void>;
}

type TestState =
  | { type: 'idle' }
  | { type: 'testing' }
  | { type: 'success'; model: string }
  | { type: 'error'; message: string };

const ApiConfigEditor: React.FC<Props> = ({ config, onSave }) => {
  const [form, setForm] = useState<ApiConfig>(() => {
    if (config) return config;
    const openai = PROVIDERS[0];
    return { endpoint: openai.endpoint, apiKey: '', model: openai.model };
  });
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<TestState>({ type: 'idle' });
  const [provider, setProvider] = useState<string>('OpenAI');
  const [useCustomModel, setUseCustomModel] = useState(false);

  useEffect(() => {
    if (config) {
      setForm(config);
      const matched = PROVIDERS.find(p => p.endpoint === config.endpoint);
      if (matched) {
        setProvider(matched.name);
        setUseCustomModel(!matched.models.includes(config.model));
      } else {
        setProvider('自定义');
        setUseCustomModel(true);
      }
    }
  }, [config]);

  const handleProviderChange = (name: string) => {
    setProvider(name);
    setUseCustomModel(false);
    const p = PROVIDERS.find(p => p.name === name);
    if (p && p.name !== '自定义') {
      setForm(prev => ({
        ...prev,
        endpoint: p.endpoint,
        model: p.model,
      }));
    } else {
      setUseCustomModel(true);
    }
  };

  const handleChange = (key: keyof ApiConfig, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    // Switching endpoint manually → auto-detect provider
    if (key === 'endpoint') {
      const matched = PROVIDERS.find(p => p.endpoint === value);
      setProvider(matched?.name || '自定义');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  // ─── Connectivity Test ───

  const handleTest = useCallback(async () => {
    if (!form.endpoint || !form.apiKey || !form.model) {
      setTest({ type: 'error', message: '请先填写 Endpoint、API Key 和 Model' });
      return;
    }

    setTest({ type: 'testing' });

    try {
      const content = await chat(form, {
        systemPrompt: 'Reply with exactly "OK" and nothing else.',
        userMessage: 'ping',
        temperature: 0,
        maxTokens: 50,
      });

      if (content.trim()) {
        setTest({ type: 'success', model: form.model });
      } else {
        setTest({ type: 'error', message: 'API 返回空内容' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setTest({ type: 'error', message: msg });
    }
  }, [form.endpoint, form.apiKey, form.model]);

  const providerPreset = PROVIDERS.find(p => p.name === provider);
  const models = providerPreset?.models || [];

  return (
    <div className="api-config">
      {/* Provider Selector */}
      <div className="field-group">
        <label>服务商</label>
        <div className="provider-grid">
          {PROVIDERS.map(p => (
            <button
              key={p.name}
              className={`provider-btn ${provider === p.name ? 'active' : ''}`}
              onClick={() => handleProviderChange(p.name)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Endpoint */}
      <div className="field-group">
        <label htmlFor="api-endpoint">Endpoint</label>
        <input
          id="api-endpoint"
          type="text"
          value={form.endpoint}
          onChange={e => handleChange('endpoint', e.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </div>

      {/* API Key */}
      <div className="field-group">
        <label htmlFor="api-key">API Key</label>
        <input
          id="api-key"
          type="password"
          value={form.apiKey}
          onChange={e => handleChange('apiKey', e.target.value)}
          placeholder="sk-..."
        />
      </div>

      {/* Model */}
      <div className="field-group">
        <label htmlFor="api-model">Model</label>
        {models.length > 0 && !useCustomModel ? (
          <select
            id="api-model"
            value={models.includes(form.model) ? form.model : '__custom__'}
            onChange={e => {
              if (e.target.value === '__custom__') {
                setUseCustomModel(true);
                handleChange('model', '');
              } else {
                handleChange('model', e.target.value);
              }
            }}
            className="model-select"
          >
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value="__custom__">自定义...</option>
          </select>
        ) : (
          <input
            id="api-model-custom"
            type="text"
            value={form.model}
            onChange={e => handleChange('model', e.target.value)}
            placeholder="输入模型名称"
          />
        )}
        {useCustomModel && models.length > 0 && (
          <button
            className="switch-preset-btn"
            onClick={() => {
              setUseCustomModel(false);
              handleChange('model', models[0]);
            }}
          >
            ← 选择预设模型
          </button>
        )}
        {REASONING_MODELS.some(m => form.model.includes(m)) && (
          <p className="field-hint field-hint-warn">
            ⚠️ 推理模型会生成大量思维链，字段匹配场景用不上，耗时显著更长。建议改用普通对话模型。
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="api-actions">
        <button
          className={`test-button ${test.type === 'success' ? 'test-success' : test.type === 'error' ? 'test-error' : ''}`}
          onClick={handleTest}
          disabled={test.type === 'testing'}
        >
          {test.type === 'testing' ? '⏳ 测试中...' : '🔌 连通性测试'}
        </button>
        <button className="save-button" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '💾 保存配置'}
        </button>
      </div>

      {/* Test Result */}
      {test.type === 'success' && (
        <p className="status status-success">
          ✅ 连接成功 — 模型 <strong>{test.model}</strong> 可用
        </p>
      )}
      {test.type === 'error' && (
        <p className="status status-error">{test.message}</p>
      )}
    </div>
  );
};

export default ApiConfigEditor;
