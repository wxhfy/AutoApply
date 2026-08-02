import React, { useState, useEffect } from 'react';
import type { UserProfile, BasicInfo, Education, Experience, Project } from '../types';
import { EMPTY_PROFILE } from '../types';

interface Props {
  profile: UserProfile | null;
  onSave: (profile: UserProfile) => Promise<void>;
}

const ProfileEditor: React.FC<Props> = ({ profile, onSave }) => {
  const [form, setForm] = useState<UserProfile>(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) setForm(profile);
  }, [profile]);

  const updateBasic = (key: keyof BasicInfo, value: string) => {
    setForm(prev => ({ ...prev, basic: { ...prev.basic, [key]: value } }));
  };

  const updateEducation = (key: keyof Education, value: string) => {
    setForm(prev => ({ ...prev, education: { ...prev.education, [key]: value } }));
  };

  const updateSkills = (value: string) => {
    setForm(prev => ({
      ...prev,
      skills: value
        .split(/[,，、;；\n]/)
        .map(s => s.trim())
        .filter(Boolean),
    }));
  };

  const addExperience = () => {
    setForm(prev => ({
      ...prev,
      experience: [...prev.experience, { company: '', role: '', description: '' }],
    }));
  };

  const updateExperience = (index: number, key: keyof Experience, value: string) => {
    setForm(prev => ({
      ...prev,
      experience: prev.experience.map((e, i) =>
        i === index ? { ...e, [key]: value } : e
      ),
    }));
  };

  const removeExperience = (index: number) => {
    setForm(prev => ({
      ...prev,
      experience: prev.experience.filter((_, i) => i !== index),
    }));
  };

  const addProject = () => {
    setForm(prev => ({
      ...prev,
      projects: [...prev.projects, { name: '', description: '', technologies: '', achievement: '' }],
    }));
  };

  const updateProject = (index: number, key: keyof Project, value: string) => {
    setForm(prev => ({
      ...prev,
      projects: prev.projects.map((p, i) =>
        i === index ? { ...p, [key]: value } : p
      ),
    }));
  };

  const removeProject = (index: number) => {
    setForm(prev => ({
      ...prev,
      projects: prev.projects.filter((_, i) => i !== index),
    }));
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
    <div className="profile-editor">
      {/* ── Basic Info ── */}
      <section className="profile-section">
        <h3 className="section-title">基本信息</h3>
        <FieldRow>
          <Field label="姓名" value={form.basic.name} onChange={v => updateBasic('name', v)} placeholder="张三" />
          <Field label="手机" value={form.basic.phone} onChange={v => updateBasic('phone', v)} placeholder="13800138000" type="tel" />
        </FieldRow>
        <FieldRow>
          <Field label="邮箱" value={form.basic.email} onChange={v => updateBasic('email', v)} placeholder="zhangsan@example.com" type="email" />
          <Field label="所在城市" value={form.basic.location} onChange={v => updateBasic('location', v)} placeholder="北京" />
        </FieldRow>
      </section>

      {/* ── Education ── */}
      <section className="profile-section">
        <h3 className="section-title">教育背景</h3>
        <FieldRow>
          <Field label="学校" value={form.education.school} onChange={v => updateEducation('school', v)} placeholder="清华大学" />
          <Field label="专业" value={form.education.major} onChange={v => updateEducation('major', v)} placeholder="计算机科学与技术" />
        </FieldRow>
        <FieldRow>
          <Field label="学历" value={form.education.degree} onChange={v => updateEducation('degree', v)} placeholder="本科 / 硕士 / 博士" />
          <Field label="毕业时间" value={form.education.graduation} onChange={v => updateEducation('graduation', v)} placeholder="2025.06" />
        </FieldRow>
      </section>

      {/* ── Experience ── */}
      <section className="profile-section">
        <h3 className="section-title">
          工作经历
          <button className="add-btn" onClick={addExperience}>+ 添加</button>
        </h3>
        {form.experience.map((e, i) => (
          <div key={i} className="list-card">
            <div className="list-card-header">
              <span>经历 #{i + 1}</span>
              <button className="remove-btn" onClick={() => removeExperience(i)}>删除</button>
            </div>
            <FieldRow>
              <Field label="公司" value={e.company} onChange={v => updateExperience(i, 'company', v)} placeholder="公司名称" />
              <Field label="职位" value={e.role} onChange={v => updateExperience(i, 'role', v)} placeholder="岗位" />
            </FieldRow>
            <div className="field-group">
              <label>描述</label>
              <textarea
                value={e.description}
                onChange={ev => updateExperience(i, 'description', ev.target.value)}
                placeholder="简述工作内容..."
                rows={2}
              />
            </div>
          </div>
        ))}
      </section>

      {/* ── Projects ── */}
      <section className="profile-section">
        <h3 className="section-title">
          项目经历
          <button className="add-btn" onClick={addProject}>+ 添加</button>
        </h3>
        {form.projects.map((p, i) => (
          <div key={i} className="list-card">
            <div className="list-card-header">
              <span>项目 #{i + 1}</span>
              <button className="remove-btn" onClick={() => removeProject(i)}>删除</button>
            </div>
            <div className="field-group">
              <label>项目名称</label>
              <input value={p.name} onChange={ev => updateProject(i, 'name', ev.target.value)} placeholder="项目名称" />
            </div>
            <div className="field-group">
              <label>描述</label>
              <textarea
                value={p.description}
                onChange={ev => updateProject(i, 'description', ev.target.value)}
                placeholder="简述项目..."
                rows={2}
              />
            </div>
            <div className="field-group">
              <label>技术栈</label>
              <input value={p.technologies} onChange={ev => updateProject(i, 'technologies', ev.target.value)} placeholder="React, TypeScript, Go" />
            </div>
            <div className="field-group">
              <label>成果</label>
              <input value={p.achievement} onChange={ev => updateProject(i, 'achievement', ev.target.value)} placeholder="性能提升 30%" />
            </div>
          </div>
        ))}
      </section>

      {/* ── Skills ── */}
      <section className="profile-section">
        <h3 className="section-title">技能</h3>
        <div className="field-group">
          <label>技能（用逗号或换行分隔）</label>
          <textarea
            value={form.skills.join(', ')}
            onChange={e => updateSkills(e.target.value)}
            placeholder="Python, React, SQL, Docker..."
            rows={2}
          />
        </div>
      </section>

      <button className="save-button" onClick={handleSave} disabled={saving}>
        {saving ? '保存中...' : '💾 保存简历'}
      </button>
    </div>
  );
};

// ─── Helpers ───

const FieldRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="field-row">{children}</div>
);

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}> = ({ label, value, onChange, placeholder, type }) => (
  <div className="field-group">
    <label>{label}</label>
    <input
      type={type || 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  </div>
);

export default ProfileEditor;
