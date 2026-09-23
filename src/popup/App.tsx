import React, { useCallback, useEffect, useState } from 'react';
import type { ApiConfig, FillHistory, UserProfile } from '../types';
import { getApiConfig, getHistory, getProfile, saveApiConfig, saveProfile } from '../storage';
import { runAutofill, type AutofillProgress, type AutofillStep } from '../autofill/AutofillOrchestrator';
import ProfileEditor from './ProfileEditor';
import ApiConfigEditor from './ApiConfigEditor';
import ResumeImport from './ResumeImport';

type Phase = 'config' | 'analyzing';
type Tab = 'profile' | 'api' | 'import' | 'history';
type StepStatus = 'pending' | 'active' | 'done' | 'skipped';

interface Step {
  id: AutofillStep;
  label: string;
  status: StepStatus;
  detail?: string;
  progress?: { current: number; total: number };
}

const STEP_DEFS: { id: AutofillStep; label: string }[] = [
  { id: 'scan', label: '扫描页面表单' },
  { id: 'match', label: '规则匹配字段' },
  { id: 'fill', label: '写入确定字段' },
  { id: 'verify', label: '验证并高亮结果' },
];

function initSteps(): Step[] {
  return STEP_DEFS.map(step => ({ ...step, status: 'pending' }));
}

const App: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [tab, setTab] = useState<Tab>('profile');
  const [phase, setPhase] = useState<Phase>('config');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [history, setHistory] = useState<FillHistory[]>([]);
  const [steps, setSteps] = useState<Step[]>(initSteps);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    getProfile().then(setProfile);
    getApiConfig().then(setApiConfig);
  }, []);

  useEffect(() => {
    if (phase !== 'analyzing') return;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const updateStep = useCallback((progress: AutofillProgress) => {
    setSteps(previous => previous.map(step => {
      if (step.id === progress.step) {
        return {
          ...step,
          status: 'active',
          detail: progress.detail,
          progress: progress.total === undefined ? undefined : { current: progress.current || 0, total: progress.total },
        };
      }
      const currentIndex = STEP_DEFS.findIndex(item => item.id === progress.step);
      const stepIndex = STEP_DEFS.findIndex(item => item.id === step.id);
      return stepIndex < currentIndex && step.status === 'active' ? { ...step, status: 'done' } : step;
    }));
  }, []);

  const handleSaveProfile = useCallback(async (next: UserProfile) => {
    await saveProfile(next);
    setProfile(next);
    setStatus({ type: 'success', message: '个人信息已保存到本地' });
    window.setTimeout(() => setStatus(null), 2000);
  }, []);

  const handleImportProfile = useCallback(async (next: UserProfile) => {
    await saveProfile(next);
    setProfile(next);
    setStatus({ type: 'success', message: '已导入个人信息，请检查后保存' });
  }, []);

  const handleSaveApiConfig = useCallback(async (next: ApiConfig) => {
    await saveApiConfig(next);
    setApiConfig(next);
    setStatus({ type: 'success', message: 'API 配置已保存（仅用于后续可选能力）' });
    window.setTimeout(() => setStatus(null), 2000);
  }, []);

  const handleAutofill = useCallback(async () => {
    if (!profile) {
      setStatus({ type: 'error', message: '请先在“个人信息”中填写并保存 Profile' });
      setTab('profile');
      return;
    }
    setPhase('analyzing');
    setSteps(initSteps());
    setStatus(null);
    try {
      const summary = await runAutofill(profile, updateStep);
      setSteps(previous => previous.map(step => ({ ...step, status: 'done' })));
      setStatus({
        type: summary.errorCount > 0 ? 'error' : 'success',
        message: `已验证 ${summary.verifiedCount} 个，待确认 ${summary.reviewCount} 个，失败 ${summary.errorCount} 个`,
      });
    } catch (error) {
      setSteps(previous => previous.map(step => step.status === 'active' ? { ...step, status: 'skipped' } : step));
      setStatus({ type: 'error', message: error instanceof Error ? error.message : '自动填写失败' });
    } finally {
      setPhase('config');
    }
  }, [profile, updateStep]);

  useEffect(() => {
    if (tab === 'history') getHistory().then(setHistory);
  }, [tab]);

  return (
    <div className="app">
      <header className="app-header"><h1>🤖 AutoApply</h1></header>
      {phase === 'config' && (
        <nav className="tabs">
          {(['profile', 'api', 'import', 'history'] as Tab[]).map(item => (
            <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
              {{ profile: '个人信息', api: 'API（可选）', import: '导入', history: '历史' }[item]}
            </button>
          ))}
        </nav>
      )}
      <main className="app-main">
        {phase === 'analyzing' ? (
          <div className="analyzing-screen">
            <div className="steps-header"><span className="steps-title">正在智能填写</span><span className="steps-elapsed">{elapsed}s</span></div>
            <ol className="step-list">{steps.map(step => <StepRow key={step.id} step={step} />)}</ol>
            <p className="steps-hint">请保持此弹窗打开，结束后可回到页面查看黄色/红色字段。</p>
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
      {phase === 'config' && (
        <footer className="app-footer">
          <button className="fill-button" disabled={!profile} onClick={handleAutofill}>
            {profile ? '🚀 一键智能填写' : '请先保存个人信息'}
          </button>
          {status && <p className={`status status-${status.type}`}>{status.message}</p>}
        </footer>
      )}
    </div>
  );
};

const StepRow: React.FC<{ step: Step }> = ({ step }) => {
  const percent = step.progress && step.progress.total > 0
    ? (step.progress.current / step.progress.total) * 100
    : 0;
  return (
    <li className={`step-row step-${step.status}`}>
      <span className="step-icon">{step.status === 'active' ? <span className="step-spinner" /> : step.status === 'done' ? '✓' : '○'}</span>
      <div className="step-body">
        <div className="step-label"><span>{step.label}</span>{step.progress && <span className="step-count">{step.progress.current}/{step.progress.total}</span>}</div>
        {step.detail && <div className="step-detail">{step.detail}</div>}
        {step.status === 'active' && step.progress && <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${percent}%` }} /></div>}
      </div>
    </li>
  );
};

const HistoryList: React.FC<{ history: FillHistory[] }> = ({ history }) => {
  if (!history.length) return <p className="empty-hint">暂无填写记录</p>;
  return <div className="history-list">{history.map((item, index) => {
    let hostname = item.url;
    try { hostname = new URL(item.url).hostname; } catch { /* local fixture or incomplete URL */ }
    return <div key={`${item.timestamp}-${index}`} className="history-item">
      <div className="history-url" title={item.url}>{item.company || hostname}</div>
      <div className="history-meta"><span>✅ {item.filledCount} 已验证</span><span>⚠️ {item.skippedCount} 待处理</span><span className="history-time">{new Date(item.timestamp).toLocaleDateString('zh-CN')}</span></div>
    </div>;
  })}</div>;
};

export default App;
