import React, { useState, useEffect } from 'react';
import type { UserProfile, BasicInfo, Links, Education, Experience, Internship, Project, Award } from '../types';
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

  const updateLinks = (key: keyof Links, value: string) => {
    setForm(prev => ({ ...prev, links: { ...prev.links, [key]: value } }));
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

  // ─── Education ───
  const addEducation = () => {
    setForm(prev => ({
      ...prev,
      education: [...prev.education, { school: '', college: '', major: '', degree: '', gpa: '', courses: '', startDate: '', endDate: '' }],
    }));
  };

  const updateEducation = (index: number, key: keyof Education, value: string) => {
    setForm(prev => ({
      ...prev,
      education: prev.education.map((e, i) => i === index ? { ...e, [key]: value } : e),
    }));
  };

  const removeEducation = (index: number) => {
    setForm(prev => ({ ...prev, education: prev.education.filter((_, i) => i !== index) }));
  };

  // ─── Experience ───
  const addExperience = () => {
    setForm(prev => ({
      ...prev,
      experience: [...prev.experience, { company: '', role: '', startDate: '', endDate: '', description: '' }],
    }));
  };

  const updateExperience = (index: number, key: keyof Experience, value: string) => {
    setForm(prev => ({
      ...prev,
      experience: prev.experience.map((e, i) => i === index ? { ...e, [key]: value } : e),
    }));
  };

  const removeExperience = (index: number) => {
    setForm(prev => ({ ...prev, experience: prev.experience.filter((_, i) => i !== index) }));
  };

  // ─── Internships ───
  const addInternship = () => {
    setForm(prev => ({
      ...prev,
      internships: [...prev.internships, { company: '', role: '', startDate: '', endDate: '', description: '' }],
    }));
  };

  const updateInternship = (index: number, key: keyof Internship, value: string) => {
    setForm(prev => ({
      ...prev,
      internships: prev.internships.map((e, i) => i === index ? { ...e, [key]: value } : e),
    }));
  };

  const removeInternship = (index: number) => {
    setForm(prev => ({ ...prev, internships: prev.internships.filter((_, i) => i !== index) }));
  };

  // ─── Awards ───
  const addAward = () => {
    setForm(prev => ({
      ...prev,
      awards: [...prev.awards, { name: '', date: '', level: '', description: '' }],
    }));
  };

  const updateAward = (index: number, key: keyof Award, value: string) => {
    setForm(prev => ({
      ...prev,
      awards: prev.awards.map((a, i) => i === index ? { ...a, [key]: value } : a),
    }));
  };

  const removeAward = (index: number) => {
    setForm(prev => ({ ...prev, awards: prev.awards.filter((_, i) => i !== index) }));
  };

  // ─── Projects ───
  const addProject = () => {
    setForm(prev => ({
      ...prev,
      projects: [...prev.projects, { name: '', startDate: '', endDate: '', description: '' }],
    }));
  };

  const updateProject = (index: number, key: keyof Project, value: string) => {
    setForm(prev => ({
      ...prev,
      projects: prev.projects.map((p, i) => i === index ? { ...p, [key]: value } : p),
    }));
  };

  const removeProject = (index: number) => {
    setForm(prev => ({ ...prev, projects: prev.projects.filter((_, i) => i !== index) }));
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
          <Field label="性别" value={form.basic.gender} onChange={v => updateBasic('gender', v)} placeholder="男/女" />
        </FieldRow>
        <FieldRow>
          <Field label="出生日期" value={form.basic.birthDate} onChange={v => updateBasic('birthDate', v)} placeholder="1999-01-01" />
          <Field label="民族" value={form.basic.ethnicity} onChange={v => updateBasic('ethnicity', v)} placeholder="汉族" />
        </FieldRow>
        <FieldRow>
          <Field label="政治面貌" value={form.basic.politicalStatus} onChange={v => updateBasic('politicalStatus', v)} placeholder="共青团员" />
          <Field label="籍贯" value={form.basic.nativePlace} onChange={v => updateBasic('nativePlace', v)} placeholder="广东深圳" />
        </FieldRow>
      </section>

      {/* ── Links ── */}
      <section className="profile-section">
        <h3 className="section-title">个人链接</h3>
        <Field label="GitHub" value={form.links.github} onChange={v => updateLinks('github', v)} placeholder="https://github.com/username" />
        <Field label="LinkedIn" value={form.links.linkedin} onChange={v => updateLinks('linkedin', v)} placeholder="https://linkedin.com/in/username" />
        <Field label="个人网站" value={form.links.website} onChange={v => updateLinks('website', v)} placeholder="https://your-site.com" />
      </section>

      {/* ── Education ── */}
      <section className="profile-section">
        <h3 className="section-title">
          教育经历
          <button className="add-btn" onClick={addEducation}>+ 添加</button>
        </h3>
        {form.education.map((e, i) => (
          <div key={i} className="list-card">
            <div className="list-card-header">
              <span>教育 #{i + 1}</span>
              <button className="remove-btn" onClick={() => removeEducation(i)}>删除</button>
            </div>
            <FieldRow>
              <Field label="学校" value={e.school} onChange={v => updateEducation(i, 'school', v)} placeholder="清华大学" />
              <Field label="学院" value={e.college} onChange={v => updateEducation(i, 'college', v)} placeholder="计算机科学与技术学院" />
            </FieldRow>
            <FieldRow>
              <Field label="专业" value={e.major} onChange={v => updateEducation(i, 'major', v)} placeholder="计算机科学" />
              <Field label="学历" value={e.degree} onChange={v => updateEducation(i, 'degree', v)} placeholder="本科/硕士/博士" />
            </FieldRow>
            <FieldRow>
              <Field label="入学时间" value={e.startDate} onChange={v => updateEducation(i, 'startDate', v)} placeholder="2019.09" />
              <Field label="毕业时间" value={e.endDate} onChange={v => updateEducation(i, 'endDate', v)} placeholder="2023.06" />
            </FieldRow>
            <Field label="绩点 / 成绩" value={e.gpa} onChange={v => updateEducation(i, 'gpa', v)} placeholder="3.8/4.0 或 89分" />
            <div className="field">
              <label>主修课程</label>
              <textarea
                rows={2}
                value={e.courses}
                onChange={ev => updateEducation(i, 'courses', ev.target.value)}
                placeholder="数据结构、操作系统、计算机网络、数据库原理"
              />
            </div>
          </div>
        ))}
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
            <FieldRow>
              <Field label="开始时间" value={e.startDate} onChange={v => updateExperience(i, 'startDate', v)} placeholder="2023.07" />
              <Field label="结束时间" value={e.endDate} onChange={v => updateExperience(i, 'endDate', v)} placeholder="2024.06" />
            </FieldRow>
            <div className="field-group">
              <label>描述</label>
              <textarea
                value={e.description}
                onChange={ev => updateExperience(i, 'description', ev.target.value)}
                placeholder="工作内容描述..."
                rows={3}
              />
            </div>
          </div>
        ))}
      </section>

      {/* ── Internships ── */}
      <section className="profile-section">
        <h3 className="section-title">
          实习经历
          <button className="add-btn" onClick={addInternship}>+ 添加</button>
        </h3>
        {form.internships.map((e, i) => (
          <div key={i} className="list-card">
            <div className="list-card-header">
              <span>实习 #{i + 1}</span>
              <button className="remove-btn" onClick={() => removeInternship(i)}>删除</button>
            </div>
            <FieldRow>
              <Field label="公司" value={e.company} onChange={v => updateInternship(i, 'company', v)} placeholder="公司名称" />
              <Field label="岗位" value={e.role} onChange={v => updateInternship(i, 'role', v)} placeholder="实习岗位" />
            </FieldRow>
            <FieldRow>
              <Field label="开始时间" value={e.startDate} onChange={v => updateInternship(i, 'startDate', v)} placeholder="2023.07" />
              <Field label="结束时间" value={e.endDate} onChange={v => updateInternship(i, 'endDate', v)} placeholder="2023.09" />
            </FieldRow>
            <div className="field-group">
              <label>描述</label>
              <textarea
                value={e.description}
                onChange={ev => updateInternship(i, 'description', ev.target.value)}
                placeholder="实习内容描述..."
                rows={3}
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
            <FieldRow>
              <Field label="项目名" value={p.name} onChange={v => updateProject(i, 'name', v)} placeholder="项目名称" />
            </FieldRow>
            <FieldRow>
              <Field label="开始时间" value={p.startDate} onChange={v => updateProject(i, 'startDate', v)} placeholder="2023.03" />
              <Field label="结束时间" value={p.endDate} onChange={v => updateProject(i, 'endDate', v)} placeholder="2023.09" />
            </FieldRow>
            <div className="field-group">
              <label>描述</label>
              <textarea
                value={p.description}
                onChange={ev => updateProject(i, 'description', ev.target.value)}
                placeholder="项目描述..."
                rows={4}
              />
            </div>
          </div>
        ))}
      </section>

      {/* ── Awards ── */}
      <section className="profile-section">
        <h3 className="section-title">
          获奖经历
          <button className="add-btn" onClick={addAward}>+ 添加</button>
        </h3>
        {form.awards.map((a, i) => (
          <div key={i} className="list-card">
            <div className="list-card-header">
              <span>奖项 #{i + 1}</span>
              <button className="remove-btn" onClick={() => removeAward(i)}>删除</button>
            </div>
            <FieldRow>
              <Field label="奖项名称" value={a.name} onChange={v => updateAward(i, 'name', v)} placeholder="全国大学生数学建模竞赛一等奖" />
            </FieldRow>
            <FieldRow>
              <Field label="获奖时间" value={a.date} onChange={v => updateAward(i, 'date', v)} placeholder="2023.10" />
              <Field label="级别" value={a.level} onChange={v => updateAward(i, 'level', v)} placeholder="国家级/省级/校级" />
            </FieldRow>
            <div className="field-group">
              <label>描述（可选）</label>
              <textarea
                value={a.description}
                onChange={ev => updateAward(i, 'description', ev.target.value)}
                placeholder="奖项相关说明..."
                rows={2}
              />
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

      {/* ── Self Introduction ── */}
      <section className="profile-section">
        <h3 className="section-title">自我评价</h3>
        <div className="field-group">
          <textarea
            value={form.selfIntroduction}
            onChange={e => setForm(prev => ({ ...prev, selfIntroduction: e.target.value }))}
            placeholder="自我评价/自我介绍..."
            rows={4}
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
