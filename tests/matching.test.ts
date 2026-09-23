import assert from 'node:assert/strict';
import test from 'node:test';
import { matchFields } from '../src/matching/MatchingEngine.ts';
import { formatDateForControl, normalizeValue } from '../src/matching/ValueNormalizer.ts';
import { matchesDateOption } from '../src/content/ComponentAdapters.ts';

const profile = {
  basic: {
    name: '张三',
    phone: '13800138000',
    email: 'zhangsan@example.com',
    gender: '男',
    birthDate: '',
    ethnicity: '',
    politicalStatus: '共青团员',
    nativePlace: '',
    currentCity: '北京',
  },
  links: { github: '', linkedin: '', website: '' },
  education: [{
    school: '燕山大学', college: '', major: '计算机科学与技术', degree: '硕士研究生',
    gpa: '', courses: '', startDate: '', endDate: '2027-06', cet4: '550', cet6: '500',
  }],
  experience: [], internships: [], projects: [], awards: [], skills: [], selfIntroduction: '',
};

test('normalizes degree aliases to the same canonical value', () => {
  assert.equal(normalizeValue('硕士研究生', 'degree'), 'MASTER');
  assert.equal(normalizeValue("Master's", 'degree'), 'MASTER');
});

test('adapts profile month values to the browser date control contract', () => {
  assert.equal(formatDateForControl('2027-06', 'month'), '2027-06');
  assert.equal(formatDateForControl('2027-06', 'date'), '2027-06-01');
  assert.equal(formatDateForControl('2027.6.30', 'date'), '2027-06-30');
  assert.equal(formatDateForControl('not a date', 'date'), null);
});

test('matches custom date-picker month candidates without guessing a day', () => {
  assert.equal(matchesDateOption('2027-06', '2027年6月'), true);
  assert.equal(matchesDateOption('2027-06', '2027-06-01'), true);
  assert.equal(matchesDateOption('2027-06', '2026年6月'), false);
});

test('matches exact aliases without an LLM and preserves existing page values', () => {
  const proposals = matchFields([
    { id: 'name', tag: 'input', type: 'text', label: '姓名', placeholder: '', name: '', ariaLabel: '', nearbyText: '', currentValue: '', required: true, componentType: 'text', locator: '[data-jf-id="name"]' },
    { id: 'degree', tag: 'select', type: 'select-one', label: '最高学历', placeholder: '', name: '', ariaLabel: '', nearbyText: '', currentValue: '', required: true, componentType: 'native-select', locator: '[data-jf-id="degree"]', options: ['本科', '硕士研究生', '博士研究生'] },
    { id: 'phone', tag: 'input', type: 'tel', label: '手机号', placeholder: '', name: '', ariaLabel: '', nearbyText: '', currentValue: '13900000000', required: true, componentType: 'text', locator: '[data-jf-id="phone"]' },
  ], profile);

  assert.deepEqual(
    proposals.map(({ fieldId, value, action }) => ({ fieldId, value, action })),
    [
      { fieldId: 'name', value: '张三', action: 'auto_fill' },
      { fieldId: 'degree', value: '硕士研究生', action: 'auto_fill' },
      { fieldId: 'phone', value: null, action: 'confirm' },
    ],
  );
});

test('matches an English form when label and name are separate signals', () => {
  const proposals = matchFields([
    { id: 'custname', tag: 'input', type: 'text', label: 'Customer name', placeholder: '', name: 'custname', ariaLabel: '', nearbyText: '', currentValue: '', required: true, componentType: 'text', locator: '[data-jf-id="custname"]' },
    { id: 'custtel', tag: 'input', type: 'tel', label: 'Telephone', placeholder: '', name: 'custtel', ariaLabel: '', nearbyText: '', currentValue: '', required: true, componentType: 'text', locator: '[data-jf-id="custtel"]' },
    { id: 'custemail', tag: 'input', type: 'email', label: 'E-mail address', placeholder: '', name: 'custemail', ariaLabel: '', nearbyText: '', currentValue: '', required: true, componentType: 'text', locator: '[data-jf-id="custemail"]' },
  ], profile);

  assert.deepEqual(proposals.map(({ fieldType, value, action }) => ({ fieldType, value, action })), [
    { fieldType: 'NAME', value: '张三', action: 'auto_fill' },
    { fieldType: 'PHONE', value: '13800138000', action: 'auto_fill' },
    { fieldType: 'EMAIL', value: 'zhangsan@example.com', action: 'auto_fill' },
  ]);
});

test('matches a birth-date field from the existing profile', () => {
  const [proposal] = matchFields([
    { id: 'birth-date', tag: 'input', type: 'date', label: '出生日期', placeholder: '', name: '', ariaLabel: '', nearbyText: '', currentValue: '', required: false, componentType: 'date', locator: '[data-jf-id="birth-date"]' },
  ], {
    ...profile,
    basic: { ...profile.basic, birthDate: '1999.1.2' },
  });

  assert.equal(proposal.fieldType, 'BIRTH_DATE');
  assert.equal(proposal.value, '1999.1.2');
  assert.equal(proposal.action, 'auto_fill');
});

test('keeps human-gate fields out of automatic filling', () => {
  const [proposal] = matchFields([
    { id: 'salary', tag: 'input', type: 'text', label: '期望薪资', placeholder: '', name: '', ariaLabel: '', nearbyText: '', currentValue: '', required: false, componentType: 'text', locator: '[data-jf-id="salary"]' },
  ], profile);

  assert.equal(proposal.action, 'confirm');
  assert.equal(proposal.value, null);
});

test('keeps cascader fields in review until the profile has a structured address', () => {
  const [proposal] = matchFields([
    { id: 'native-place', tag: 'div', type: 'combobox', label: '籍贯', placeholder: '', name: '', ariaLabel: '', nearbyText: '', currentValue: '', required: true, componentType: 'cascader', locator: '[data-jf-id="native-place"]' },
  ], profile);

  assert.equal(proposal.action, 'confirm');
  assert.equal(proposal.reason, '省市区层级控件暂需人工确认');
});
