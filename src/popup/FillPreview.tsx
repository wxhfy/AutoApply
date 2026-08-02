import React from 'react';
import type { FillProposal, FillAction } from '../types';

interface Props {
  proposals: FillProposal[];
  onConfirm: (approved: FillProposal[]) => void;
  onCancel: () => void;
}

const ACTION_LABELS: Record<FillAction, { text: string; className: string }> = {
  auto_fill: { text: '自动填写', className: 'badge-auto' },
  confirm: { text: '待确认', className: 'badge-confirm' },
  skip: { text: '跳过', className: 'badge-skip' },
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  NAME: '姓名',
  PHONE: '手机',
  EMAIL: '邮箱',
  LOCATION: '城市',
  SCHOOL: '学校',
  MAJOR: '专业',
  DEGREE: '学历',
  GRADUATION_DATE: '毕业时间',
  WORK_EXPERIENCE: '工作经历',
  INTERNSHIP_EXPERIENCE: '实习经历',
  PROJECT_EXPERIENCE: '项目经历',
  SKILLS: '技能',
  SELF_INTRODUCTION: '自我介绍',
  CAREER_GOAL: '职业目标',
  SALARY_EXPECTATION: '期望薪资',
  OTHER: '其他',
};

const FillPreview: React.FC<Props> = ({ proposals, onConfirm, onCancel }) => {
  const [toggles, setToggles] = React.useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    proposals.forEach(p => {
      // auto_fill on by default, confirm off by default
      map[p.fieldId] = p.action === 'auto_fill';
    });
    return map;
  });

  const autoFill = proposals.filter(p => p.action === 'auto_fill');
  const confirm = proposals.filter(p => p.action === 'confirm');
  const skip = proposals.filter(p => p.action === 'skip');

  const handleToggle = (fieldId: string) => {
    setToggles(prev => ({ ...prev, [fieldId]: !prev[fieldId] }));
  };

  const handleConfirm = () => {
    const approved = proposals.filter(p => toggles[p.fieldId]);
    if (approved.length === 0) return;
    onConfirm(approved);
  };

  return (
    <div className="fill-preview">
      <div className="preview-header">
        <h3>AI 填写建议</h3>
        <p className="preview-summary">
          共 {proposals.length} 个字段：
          <span className="badge-auto">{autoFill.length} 自动填写</span>
          <span className="badge-confirm">{confirm.length} 待确认</span>
          <span className="badge-skip">{skip.length} 跳过</span>
        </p>
      </div>

      <div className="preview-list">
        {autoFill.map(renderProposal)}
        {confirm.map(renderProposal)}
        {skip.map(renderProposal)}
      </div>

      <div className="preview-actions">
        <button className="fill-button" onClick={handleConfirm}>
          ✅ 确认填写
        </button>
        <button className="cancel-button" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );

  function renderProposal(p: FillProposal) {
    const checked = toggles[p.fieldId] ?? false;
    const badge = ACTION_LABELS[p.action];

    return (
      <div key={p.fieldId} className={`preview-card ${p.action}`}>
        <div className="preview-card-header">
          <label className="preview-checkbox">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => handleToggle(p.fieldId)}
            />
            <span className="preview-label">
              {p.originalLabel || p.fieldId}
            </span>
          </label>
          <span className={`badge ${badge.className}`}>{badge.text}</span>
        </div>

        {p.value ? (
          <div className="preview-value">
            <span className="field-type-tag">{FIELD_TYPE_LABELS[p.fieldType] || p.fieldType}</span>
            {p.value}
          </div>
        ) : (
          <div className="preview-value empty">— 无法匹配 —</div>
        )}

        {p.reason && (
          <div className="preview-reason">
            {p.reason}
            {p.confidence > 0 && (
              <span className="confidence">置信度: {Math.round(p.confidence * 100)}%</span>
            )}
          </div>
        )}
      </div>
    );
  }
};

export default FillPreview;
