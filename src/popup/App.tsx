import React, { useState, useEffect, useCallback } from 'react';
import type { UserProfile, ApiConfig, DOMField, FillProposal, FillHistory } from '../types';
import { getProfile, saveProfile, getApiConfig, saveApiConfig, addHistory, getHistory } from '../storage';
import { createLLMClient } from '../llm';
import ProfileEditor from './ProfileEditor';
import ApiConfigEditor from './ApiConfigEditor';
import ResumeImport from './ResumeImport';

type Phase = 'config' | 'analyzing';
type Tab = 'profile' | 'api' | 'import' | 'history';

// ─── Ensure content script is injected ───

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: '__PING__' });
  } catch {
    // Content script not present — programmatically inject it
    // Read the content script filename from the manifest
    const manifest = chrome.runtime.getManifest();
    const contentScriptFiles = manifest.content_scripts?.[0]?.js;
    if (!contentScriptFiles?.length) {
      throw new Error('Content script not found in manifest');
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files: contentScriptFiles,
    });
    await new Promise(r => setTimeout(r, 100));
  }
}

interface StatusMsg {
  type: 'loading' | 'success' | 'error';
  message: string;
}

const App: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [tab, setTab] = useState<Tab>('profile');
  const [phase, setPhase] = useState<Phase>('config');
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [history, setHistory] = useState<FillHistory[]>([]);

  useEffect(() => {
    getProfile().then(setProfile);
    getApiConfig().then(setApiConfig);
  }, []);

  // ── Save handlers ──

  const handleSaveProfile = useCallback(async (p: UserProfile) => {
    await saveProfile(p);
    setProfile(p);
    setStatus({ type: 'success', message: '简历已保存' });
    setTimeout(() => setStatus(null), 2000);
  }, []);

  const handleImportProfile = useCallback(async (p: UserProfile) => {
    await saveProfile(p);
    setProfile(p);
  }, []);

  const handleSaveApiConfig = useCallback(async (c: ApiConfig) => {
    await saveApiConfig(c);
    setApiConfig(c);
    setStatus({ type: 'success', message: 'API 配置已保存' });
    setTimeout(() => setStatus(null), 2000);
  }, []);

  // ── Phase 1: Analyze ──

  const handleAnalyze = useCallback(async () => {
    if (!profile) {
      setStatus({ type: 'error', message: '请先保存简历' });
      return;
    }
    if (!apiConfig) {
      setStatus({ type: 'error', message: '请先配置 API' });
      return;
    }

    setPhase('analyzing');
    setStatus({ type: 'loading', message: '正在分析页面...' });

    try {
      const [tabInfo] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabInfo?.id) {
        setStatus({ type: 'error', message: '无法访问当前标签页' });
        setPhase('config');
        return;
      }

      // Ensure content script is injected (handles extension reload / first visit)
      await ensureContentScript(tabInfo.id);

      // Step 1: DOM analysis
      const analyzeResult = await chrome.tabs.sendMessage(tabInfo.id, { type: 'ANALYZE' });

      if (analyzeResult.type === 'ERROR') {
        setStatus({ type: 'error', message: analyzeResult.message });
        setPhase('config');
        return;
      }

      const fields: DOMField[] = analyzeResult.fields;

      if (fields.length === 0) {
        setStatus({ type: 'error', message: '当前页面未找到表单字段' });
        setPhase('config');
        return;
      }

      // Step 2: LLM matching
      setStatus({ type: 'loading', message: `找到 ${fields.length} 个字段，正在 AI 分析...` });

      const client = createLLMClient(apiConfig.endpoint, apiConfig.apiKey, apiConfig.model);
      const matches: FillProposal[] = await client.matchFields(fields, profile);

      if (matches.length === 0) {
        setStatus({ type: 'error', message: 'AI 未能匹配任何字段' });
        setPhase('config');
        return;
      }

      // Auto-fill: skip preview, fill all fields with value directly
      const fillable = matches.filter(m => m.value !== null);

      if (fillable.length === 0) {
        setStatus({ type: 'error', message: 'AI 未能匹配任何字段' });
        setPhase('config');
        return;
      }

      setStatus({ type: 'loading', message: `正在填写 ${fillable.length} 个字段...` });

      const fillResult = await chrome.tabs.sendMessage(tabInfo.id, {
        type: 'FILL',
        proposals: fillable,
      });

      if (fillResult.type === 'FILL_RESULT') {
        const skipped = matches.length - fillable.length;
        const info: FillHistory = {
          url: tabInfo.url || '',
          timestamp: Date.now(),
          filledCount: fillResult.filled,
          skippedCount: skipped,
        };
        await addHistory(info);

        setStatus({
          type: 'success',
          message: `✅ 已填写 ${fillResult.filled} 个字段${skipped > 0 ? `，${skipped} 个无法匹配已跳过` : ''}`,
        });
        setPhase('config');
        setTimeout(() => setStatus(null), 4000);
      } else {
        setStatus({ type: 'error', message: fillResult.message });
        setPhase('config');
      }
    } catch (err) {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : '未知错误',
      });
      setPhase('config');
    }
  }, [profile, apiConfig]);

  // ── History ──

  useEffect(() => {
    if (tab === 'history') {
      getHistory().then(setHistory);
    }
  }, [tab]);

  const canAnalyze = !!(profile && apiConfig);

  // ── Render ──

  return (
    <div className="app">
      <header className="app-header">
        <h1>🤖 AI Job Filler</h1>
      </header>

      {/* Tabs — hidden during analyzing */}
      {phase === 'config' && (
        <nav className="tabs">
          {(['profile', 'api', 'import', 'history'] as Tab[]).map(t => (
            <button
              key={t}
              className={tab === t ? 'active' : ''}
              onClick={() => setTab(t)}
            >
              {{ profile: '简历', api: 'API', import: '导入', history: '历史' }[t]}
            </button>
          ))}
        </nav>
      )}

      {/* Main Content */}
      <main className="app-main">
        {phase === 'analyzing' ? (
          <div className="analyzing-screen">
            <div className="spinner" />
            <p>{status?.message}</p>
          </div>
        ) : tab === 'profile' ? (
          <ProfileEditor profile={profile} onSave={handleSaveProfile} />
        ) : tab === 'api' ? (
          <ApiConfigEditor config={apiConfig} onSave={handleSaveApiConfig} />
        ) : tab === 'import' ? (
          <ResumeImport apiConfig={apiConfig} onImported={handleImportProfile} />
        ) : (
          <HistoryList history={history} />
        )}
      </main>

      {/* Footer: Analyze button (only in config phase) */}
      {phase === 'config' && (
        <footer className="app-footer">
          <button
            className="fill-button"
            disabled={!canAnalyze}
            onClick={handleAnalyze}
          >
            {apiConfig && profile ? '🚀 一键填写' : '请先完成配置'}
          </button>
          {status && (
            <p className={`status status-${status.type}`}>{status.message}</p>
          )}
        </footer>
      )}
    </div>
  );
};

// ─── History Sub-component ───

const HistoryList: React.FC<{ history: FillHistory[] }> = ({ history }) => {
  if (history.length === 0) {
    return <p className="empty-hint">暂无填写记录</p>;
  }

  return (
    <div className="history-list">
      {history.map((h, i) => (
        <div key={i} className="history-item">
          <div className="history-url" title={h.url}>
            {h.company || new URL(h.url).hostname}
          </div>
          <div className="history-meta">
            <span>✅ {h.filledCount} 已填</span>
            <span>⏭️ {h.skippedCount} 跳过</span>
            <span className="history-time">
              {new Date(h.timestamp).toLocaleDateString('zh-CN')}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default App;
