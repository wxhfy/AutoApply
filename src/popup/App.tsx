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

// ─── Step tracking ───

type StepId = 'scan' | 'expand' | 'match' | 'fill';
type StepStatus = 'pending' | 'active' | 'done' | 'skipped';

interface Step {
  id: StepId;
  label: string;
  status: StepStatus;
  detail?: string;
  progress?: { current: number; total: number };
}

const STEP_DEFS: { id: StepId; label: string }[] = [
  { id: 'scan', label: '扫描页面表单' },
  { id: 'expand', label: '展开多条目区域' },
  { id: 'match', label: 'AI 匹配字段' },
  { id: 'fill', label: '写入表单' },
];

function initSteps(): Step[] {
  return STEP_DEFS.map(d => ({ ...d, status: 'pending' as StepStatus }));
}

const App: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [tab, setTab] = useState<Tab>('profile');
  const [phase, setPhase] = useState<Phase>('config');
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [history, setHistory] = useState<FillHistory[]>([]);
  const [steps, setSteps] = useState<Step[]>(initSteps);
  const [elapsed, setElapsed] = useState(0);

  // Tick a seconds counter while any step is active
  useEffect(() => {
    if (phase !== 'analyzing') return;
    setElapsed(0);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const updateStep = useCallback((id: StepId, patch: Partial<Step>) => {
    setSteps(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

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
    setSteps(initSteps());
    setStatus(null);

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
      updateStep('scan', { status: 'active', detail: '正在读取页面元素' });
      let analyzeResult = await chrome.tabs.sendMessage(tabInfo.id, { type: 'ANALYZE' });

      if (analyzeResult.type === 'ERROR') {
        updateStep('scan', { status: 'skipped', detail: analyzeResult.message });
        setStatus({ type: 'error', message: analyzeResult.message });
        setPhase('config');
        return;
      }

      updateStep('scan', {
        status: 'done',
        detail: `找到 ${analyzeResult.fields.length} 个字段`,
      });

      // Step 1.5: Expand repeatable sections if profile has multiple entries
      const expandCounts: { section: string; need: number }[] = [];
      if (profile.experience.length > 1) {
        expandCounts.push({ section: '工作', need: profile.experience.length - 1 });
      }
      if (profile.internships.length > 1) {
        expandCounts.push({ section: '实习', need: profile.internships.length - 1 });
      }
      if (profile.projects.length > 1) {
        expandCounts.push({ section: '项目', need: profile.projects.length - 1 });
      }
      if (profile.awards.length > 1) {
        expandCounts.push({ section: '获奖', need: profile.awards.length - 1 });
      }
      if (profile.education.length > 1) {
        expandCounts.push({ section: '教育', need: profile.education.length - 1 });
      }

      if (expandCounts.length > 0) {
        updateStep('expand', { status: 'active' });
        // Send one section at a time so progress stays visible
        for (let i = 0; i < expandCounts.length; i++) {
          const { section, need } = expandCounts[i];
          updateStep('expand', {
            detail: `${section}经历 +${need}`,
            progress: { current: i + 1, total: expandCounts.length },
          });
          try {
            await chrome.tabs.sendMessage(tabInfo.id, {
              type: 'EXPAND_SECTIONS',
              counts: [{ section, need }],
            });
          } catch {
            // Section expand failed, continue with the rest
          }
        }

        // Re-analyze after expanding
        updateStep('expand', { detail: '重新扫描新增字段', progress: undefined });
        await new Promise(r => setTimeout(r, 800));
        try {
          const reAnalyze = await chrome.tabs.sendMessage(tabInfo.id, { type: 'ANALYZE' });
          if (
            reAnalyze.type === 'ANALYZE_RESULT' &&
            reAnalyze.fields.length > analyzeResult.fields.length
          ) {
            const added = reAnalyze.fields.length - analyzeResult.fields.length;
            analyzeResult = reAnalyze;
            updateStep('expand', { status: 'done', detail: `新增 ${added} 个字段` });
          } else {
            updateStep('expand', { status: 'done', detail: '无新增字段' });
          }
        } catch {
          updateStep('expand', { status: 'done', detail: '重新扫描失败，使用原字段' });
        }
      } else {
        updateStep('expand', { status: 'skipped', detail: '无需展开' });
      }

      const fields: DOMField[] = analyzeResult.fields;

      if (fields.length === 0) {
        updateStep('match', { status: 'skipped' });
        updateStep('fill', { status: 'skipped' });
        setStatus({ type: 'error', message: '当前页面未找到表单字段' });
        setPhase('config');
        return;
      }

      // Step 2: LLM matching
      updateStep('match', {
        status: 'active',
        detail: `${fields.length} 个字段送 AI 分析，通常需要 10-40 秒`,
      });

      const client = createLLMClient(apiConfig.endpoint, apiConfig.apiKey, apiConfig.model);
      const matches: FillProposal[] = await client.matchFields(
        fields,
        profile,
        (attempt, max, reason) => {
          updateStep('match', { detail: `${reason}，第 ${attempt}/${max} 次重试` });
        },
      );

      if (matches.length === 0) {
        updateStep('match', { status: 'skipped', detail: '未匹配任何字段' });
        updateStep('fill', { status: 'skipped' });
        setStatus({ type: 'error', message: 'AI 未能匹配任何字段' });
        setPhase('config');
        return;
      }

      // Auto-fill: skip preview, fill all fields with value directly
      const fillable = matches.filter(m => m.value !== null);

      if (fillable.length === 0) {
        updateStep('match', { status: 'skipped', detail: '未匹配任何字段' });
        updateStep('fill', { status: 'skipped' });
        setStatus({ type: 'error', message: 'AI 未能匹配任何字段' });
        setPhase('config');
        return;
      }

      updateStep('match', {
        status: 'done',
        detail: `匹配到 ${fillable.length} 个可填字段`,
      });

      // Step 3: Fill fields one by one with progress
      updateStep('fill', {
        status: 'active',
        progress: { current: 0, total: fillable.length },
      });

      let filledCount = 0;
      for (let i = 0; i < fillable.length; i++) {
        const proposal = fillable[i];
        const label = proposal.originalLabel || proposal.fieldType || `字段${i + 1}`;
        updateStep('fill', {
          detail: label,
          progress: { current: i + 1, total: fillable.length },
        });

        try {
          const result = await chrome.tabs.sendMessage(tabInfo.id, {
            type: 'FILL_SINGLE',
            proposal,
          });
          if (result?.success) filledCount++;
        } catch {
          // Field fill failed, continue with next
        }
      }

      updateStep('fill', {
        status: 'done',
        detail: `成功写入 ${filledCount} 个`,
        progress: undefined,
      });

      const skipped = matches.length - fillable.length;
      const info: FillHistory = {
        url: tabInfo.url || '',
        timestamp: Date.now(),
        filledCount: filledCount,
        skippedCount: skipped,
      };
      await addHistory(info);

      setStatus({
        type: 'success',
        message: `✅ 已填写 ${filledCount} 个字段${skipped > 0 ? `，${skipped} 个无法匹配已跳过` : ''}`,
      });
      setPhase('config');
      setTimeout(() => setStatus(null), 4000);
    } catch (err) {
      setSteps(prev =>
        prev.map(s => (s.status === 'active' ? { ...s, status: 'skipped' as StepStatus } : s))
      );
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : '未知错误',
      });
      setPhase('config');
    }
  }, [profile, apiConfig, updateStep]);

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
            <div className="steps-header">
              <span className="steps-title">正在自动填写</span>
              <span className="steps-elapsed">{formatElapsed(elapsed)}</span>
            </div>
            <ol className="step-list">
              {steps.map(s => (
                <StepRow key={s.id} step={s} />
              ))}
            </ol>
            <p className="steps-hint">请保持此弹窗打开，关闭会中断填写</p>
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

// ─── Step Row Sub-component ───

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s`;
}

const STEP_ICON: Record<StepStatus, string> = {
  pending: '○',
  active: '',
  done: '✓',
  skipped: '–',
};

const StepRow: React.FC<{ step: Step }> = ({ step }) => {
  const pct =
    step.progress && step.progress.total > 0
      ? (step.progress.current / step.progress.total) * 100
      : 0;

  return (
    <li className={`step-row step-${step.status}`}>
      <span className="step-icon">
        {step.status === 'active' ? <span className="step-spinner" /> : STEP_ICON[step.status]}
      </span>
      <div className="step-body">
        <div className="step-label">
          <span>{step.label}</span>
          {step.progress && step.progress.total > 0 && (
            <span className="step-count">
              {step.progress.current}/{step.progress.total}
            </span>
          )}
        </div>
        {step.detail && <div className="step-detail">{step.detail}</div>}
        {step.status === 'active' && step.progress && step.progress.total > 0 && (
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </li>
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
