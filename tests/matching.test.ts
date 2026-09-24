import assert from 'node:assert/strict';
import test from 'node:test';
import { matchFields } from '../src/matching/MatchingEngine.ts';
import { formatDateForControl, normalizeValue } from '../src/matching/ValueNormalizer.ts';
import { matchesDateOption, matchesSelectOption } from '../src/content/ComponentAdapters.ts';
import { parseGuopinAddress } from '../src/site/GuopinAdapter.ts';
import { deriveAcademicGrade } from '../src/matching/MatchingEngine.ts';

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
    gpa: '', courses: '', startDate: '2024-09', endDate: '2027-06', cet4: '550', cet6: '500',
  }],
  experience: [], internships: [], projects: [], awards: [], skills: [], selfIntroduction: '',
};

test('normalizes degree aliases to the same canonical value', () => {
  assert.equal(normalizeValue('硕士研究生', 'degree'), 'MASTER');
  assert.equal(normalizeValue("Master's", 'degree'), 'MASTER');
});

test('school labels with explanatory notes still match the school field', () => {
  const [proposal] = matchFields([{ id: 'school', tag: 'input', type: 'search', label: '毕业院校（此处仅填写完整学校名称，方便用人单位搜索）', placeholder: '', name: '', ariaLabel: '', nearbyText: '', currentValue: '', required: true, componentType: 'autocomplete', locator: '#school' }], profile);
  assert.equal(proposal.value, '燕山大学');
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

test('keeps unmatched cascader fields in review', () => {
  const [proposal] = matchFields([
    { id: 'native-place', tag: 'div', type: 'combobox', label: '籍贯', placeholder: '', name: '', ariaLabel: '', nearbyText: '', currentValue: '', required: true, componentType: 'cascader', locator: '[data-jf-id="native-place"]' },
  ], profile);

  assert.equal(proposal.action, 'confirm');
  assert.equal(proposal.reason, '没有确定性规则匹配');
});

test('matches Guopin fields by their stable control ids', () => {
  const proposals = matchFields([
    { id: 'status', tag: 'input', type: 'search', label: '', placeholder: '', name: 'work_status', ariaLabel: '', nearbyText: '', currentValue: '', required: true, componentType: 'custom-select', locator: '#work_status' },
    { id: 'location', tag: 'input', type: 'search', label: '', placeholder: '', name: 'location-fe-1601-customization', ariaLabel: '', nearbyText: '', currentValue: '', required: true, componentType: 'cascader', locator: '#location-fe-1601-customization' },
    { id: 'hukou', tag: 'input', type: 'search', label: '', placeholder: '', name: 'hukou-fe-1601-customization', ariaLabel: '', nearbyText: '', currentValue: '', required: true, componentType: 'cascader', locator: '#hukou-fe-1601-customization' },
  ], {
    ...profile,
    basic: {
      ...profile.basic,
      currentCity: '河北省秦皇岛市海港区',
      hukouPlace: '江西省南昌市进贤县',
      jobStatus: '我是毕业生，参加校招',
    },
  });

  assert.deepEqual(proposals.map(({ value, action }) => ({ value, action })), [
    { value: '我是毕业生，参加校招', action: 'auto_fill' },
    { value: '河北省秦皇岛市海港区', action: 'auto_fill' },
    { value: '江西省南昌市进贤县', action: 'auto_fill' },
  ]);
});

test('adapts structured profile addresses to Guopin province and city option text', () => {
  assert.deepEqual(parseGuopinAddress('河北省秦皇岛市海港区'), ['河北', '秦皇岛', '海港区']);
  assert.deepEqual(parseGuopinAddress('江西省 / 南昌市 / 进贤县'), ['江西', '南昌', '进贤县']);
});

test('normalizes Guopin address display text to the same profile value', () => {
  assert.equal(normalizeValue('河北省秦皇岛市海港区', 'location'), '河北秦皇岛海港区');
  assert.equal(normalizeValue('中国 / 河北 / 秦皇岛 / 海港区', 'location'), '河北秦皇岛海港区');
});

test('derives the current academic grade from degree and graduation month', () => {
  const [proposal] = matchFields([
    { id: 'grade', tag: 'input', type: 'search', label: '年级', placeholder: '请选择', name: 'grade', ariaLabel: '', nearbyText: '', currentValue: '', required: true, componentType: 'custom-select', locator: '#grade' },
  ], profile, new Date('2026-09-24T00:00:00+08:00'));

  assert.equal(proposal.value, '研三');
  assert.equal(proposal.action, 'auto_fill');
  assert.equal(proposal.source, 'rule');
  assert.equal(deriveAcademicGrade('2023-09', '2027-06', '本科', new Date('2026-02-01T00:00:00+08:00')), '大三');
  assert.equal(deriveAcademicGrade('', '2027-06', '硕士研究生', new Date('2026-09-24T00:00:00+08:00')), null);
});

test('matches page degree labels through canonical degree values', () => {
  assert.equal(matchesSelectOption('硕士研究生', '硕士', 'degree'), true);
  assert.equal(matchesSelectOption('硕士研究生', '本科', 'degree'), false);
});
