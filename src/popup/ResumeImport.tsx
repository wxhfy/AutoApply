import React, { useState, useRef } from 'react';
import type { UserProfile, ApiConfig } from '../types';
import { extractPDFText, parseResume, mapToProfile } from '../resume';
import type { ParsedResume } from '../resume';
import { addImportHistory } from '../storage';

type ImportPhase = 'upload' | 'extracting' | 'parsing' | 'preview' | 'importing' | 'done';

interface Props {
  apiConfig: ApiConfig | null;
  onImported: (profile: UserProfile) => Promise<void>;
}

const ResumeImport: React.FC<Props> = ({ apiConfig, onImported }) => {
  const [phase, setPhase] = useState<ImportPhase>('upload');
  const [status, setStatus] = useState('');
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [filename, setFilename] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!apiConfig) {
      setStatus('请先在 API 标签页配置 LLM');
      return;
    }

    setFilename(file.name);

    try {
      // Phase 1: Extract PDF text
      setPhase('extracting');
      setStatus('正在提取 PDF 文本...');
      const resume = await extractPDFText(file);

      if (!resume.text.trim()) {
        setStatus('PDF 内容为空或无法提取文本。请确认文件不是扫描件。');
        setPhase('upload');
        return;
      }

      // Phase 2: LLM parse
      setPhase('parsing');
      setStatus(`提取到 ${resume.pageCount} 页，共 ${resume.text.length} 字符。正在 AI 解析...`);
      const result = await parseResume(resume, apiConfig);

      setParsed(result);
      setPhase('preview');
      setStatus('');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '解析失败');
      setPhase('upload');
    }
  };

  const handleConfirm = async () => {
    if (!parsed) return;

    setPhase('importing');
    setStatus('正在保存...');

    try {
      const profile = mapToProfile(parsed);
      await onImported(profile);

      await addImportHistory({
        filename,
        timestamp: Date.now(),
        success: true,
      });

      setPhase('done');
      setStatus('✅ 简历已导入！切换到「简历」标签查看和编辑。');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '保存失败');
      setPhase('preview');
    }
  };

  const handleReset = () => {
    setPhase('upload');
    setParsed(null);
    setFilename('');
    setStatus('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Upload Phase ──
  if (phase === 'upload') {
    return (
      <div className="resume-import">
        <div className="upload-area" onClick={() => fileInputRef.current?.click()}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
          <div className="upload-icon">📄</div>
          <p className="upload-title">上传简历 PDF</p>
          <p className="upload-hint">支持 Word 导出的 PDF，不需要扫描件</p>
        </div>
        {status && <p className="status status-error">{status}</p>}
      </div>
    );
  }

  // ── Extracting / Parsing Phase ──
  if (phase === 'extracting' || phase === 'parsing') {
    return (
      <div className="resume-import">
        <div className="analyzing-screen">
          <div className="spinner" />
          <p>{status}</p>
          <p className="progress-step">
            {phase === 'extracting' ? '步骤 1/2: 提取文本' : '步骤 2/2: AI 解析'}
          </p>
        </div>
      </div>
    );
  }

  // ── Preview Phase ──
  if (phase === 'preview' && parsed) {
    return (
      <div className="resume-import">
        <div className="preview-header">
          <h3>解析预览</h3>
          <p className="preview-file">{filename}</p>
        </div>

        <div className="resume-preview-list">
          {/* Basic Info */}
          <SectionPreview title="基本信息" items={[
            ['姓名', parsed.basic?.name],
            ['手机', parsed.basic?.phone],
            ['邮箱', parsed.basic?.email],
            ['城市', parsed.basic?.location],
          ]} />

          {/* Education */}
          <SectionPreview title="教育背景" items={[
            ['学校', parsed.education?.school],
            ['专业', parsed.education?.major],
            ['学历', parsed.education?.degree],
            ['毕业时间', parsed.education?.graduation],
          ]} />

          {/* Experience */}
          {(parsed.experience || []).length > 0 && (
            <div className="profile-section">
              <h3 className="section-title">工作经历 ({parsed.experience.length})</h3>
              {(parsed.experience || []).map((e, i) => (
                <div key={i} className="list-card">
                  <div className="list-card-header">
                    <span>{e.company} — {e.role}</span>
                    {e.startDate && <span className="date-range">{e.startDate} ~ {e.endDate}</span>}
                  </div>
                  <p className="list-card-desc">{e.description}</p>
                </div>
              ))}
            </div>
          )}

          {/* Projects */}
          {(parsed.projects || []).length > 0 && (
            <div className="profile-section">
              <h3 className="section-title">项目经历 ({parsed.projects.length})</h3>
              {(parsed.projects || []).map((p, i) => (
                <div key={i} className="list-card">
                  <div className="list-card-header">
                    <span>📁 {p.name}</span>
                  </div>
                  <p className="list-card-desc">{p.description}</p>
                  {(p.technologies || []).length > 0 && (
                    <div className="tags">
                      {(p.technologies || []).map((t, j) => (
                        <span key={j} className="tag">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Skills */}
          {(parsed.skills || []).length > 0 && (
            <div className="profile-section">
              <h3 className="section-title">技能</h3>
              <div className="tags">
                {(parsed.skills || []).map((s, i) => (
                  <span key={i} className="tag">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="preview-actions">
          <button className="fill-button" onClick={handleConfirm}>
            ✅ 确认导入
          </button>
          <button className="cancel-button" onClick={handleReset}>
            取消
          </button>
        </div>
      </div>
    );
  }

  // ── Done Phase ──
  return (
    <div className="resume-import">
      <div className="analyzing-screen">
        <p className="status status-success">{status}</p>
        <button className="save-button" onClick={handleReset}>
          导入另一份简历
        </button>
      </div>
    </div>
  );
};

// ─── Helper ───

const SectionPreview: React.FC<{
  title: string;
  items: [string, string | undefined | null][];
}> = ({ title, items }) => {
  const filled = items.filter(([, v]) => v);
  if (filled.length === 0) return null;

  return (
    <div className="profile-section">
      <h3 className="section-title">{title}</h3>
      <div className="section-grid">
        {items.map(([label, value]) => (
          <div key={label} className="section-item">
            <span className="section-label">{label}</span>
            <span className={value ? 'section-value' : 'section-value empty'}>
              {value || '—'}
              {value && <span className="check-mark"> ✓</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResumeImport;
