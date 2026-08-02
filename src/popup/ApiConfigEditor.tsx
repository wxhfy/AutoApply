import React, { useState, useEffect } from 'react';
import type { ApiConfig } from '../types';

const DEFAULT_CONFIG: ApiConfig = {
  endpoint: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};

interface Props {
  config: ApiConfig | null;
  onSave: (config: ApiConfig) => Promise<void>;
}

const ApiConfigEditor: React.FC<Props> = ({ config, onSave }) => {
  const [form, setForm] = useState<ApiConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const handleChange = (key: keyof ApiConfig, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="api-config">
      <div className="field-group">
        <label htmlFor="api-endpoint">API Endpoint</label>
        <input
          id="api-endpoint"
          type="text"
          value={form.endpoint}
          onChange={e => handleChange('endpoint', e.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </div>
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
      <div className="field-group">
        <label htmlFor="api-model">Model</label>
        <input
          id="api-model"
          type="text"
          value={form.model}
          onChange={e => handleChange('model', e.target.value)}
          placeholder="gpt-4o-mini"
        />
      </div>
      <button className="save-button" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : '💾 Save Config'}
      </button>
    </div>
  );
};

export default ApiConfigEditor;
