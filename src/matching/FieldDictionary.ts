import type { ValueKind } from './ValueNormalizer.ts';

export interface FieldRule {
  fieldType: string;
  profilePath: string;
  exact: string[];
  aliases: string[];
  patterns?: RegExp[];
  valueKind?: ValueKind;
}

export const FIELD_RULES: FieldRule[] = [
  { fieldType: 'NAME', profilePath: 'basic.name', exact: ['姓名'], aliases: ['真实姓名', '中文名', '全名', 'name', 'fullname', 'customername', 'applicantname', 'custname'] },
  { fieldType: 'PHONE', profilePath: 'basic.phone', exact: ['手机号'], aliases: ['手机', '手机号码', '联系电话', '移动电话', 'phone', 'mobile', 'tel', 'telephone', 'customertelephone', 'custtel'] },
  { fieldType: 'EMAIL', profilePath: 'basic.email', exact: ['邮箱'], aliases: ['电子邮箱', '电子邮件', 'email', 'emailaddress', 'customeremail', 'custemail'] },
  { fieldType: 'GENDER', profilePath: 'basic.gender', exact: ['性别'], aliases: ['男女', 'gender', 'sex'], valueKind: 'gender' },
  { fieldType: 'BIRTH_DATE', profilePath: 'basic.birthDate', exact: ['出生日期'], aliases: ['生日', '出生年月', 'birthdate', 'dateofbirth'], valueKind: 'date' },
  { fieldType: 'LOCATION', profilePath: 'basic.currentCity', exact: ['现居城市'], aliases: ['居住城市', '当前城市', '所在城市', 'currentcity'], valueKind: 'text' },
  { fieldType: 'POLITICAL_STATUS', profilePath: 'basic.politicalStatus', exact: ['政治面貌'], aliases: ['政治身份', '党派', 'politicalstatus'], valueKind: 'text' },
  { fieldType: 'SCHOOL', profilePath: 'education[0].school', exact: ['学校'], aliases: ['院校', '毕业院校', '就读院校', 'school', 'university'] },
  { fieldType: 'MAJOR', profilePath: 'education[0].major', exact: ['专业'], aliases: ['所学专业', '主修专业', '专业名称', 'major'] },
  { fieldType: 'DEGREE', profilePath: 'education[0].degree', exact: ['学历'], aliases: ['最高学历', '学位', '学历层次', 'degree', 'educationlevel'], valueKind: 'degree' },
  { fieldType: 'GRADUATION_DATE', profilePath: 'education[0].endDate', exact: ['毕业时间'], aliases: ['毕业日期', '毕业年月'], patterns: [/(预计)?毕业(日期|年月|时间)/], valueKind: 'date' },
  { fieldType: 'GPA', profilePath: 'education[0].gpa', exact: ['绩点'], aliases: ['gpa', '平均绩点', '学分绩'] },
  { fieldType: 'OTHER', profilePath: 'education[0].cet4', exact: ['英语四级'], aliases: ['四级', 'cet4', 'cet-4'] },
  { fieldType: 'OTHER', profilePath: 'education[0].cet6', exact: ['英语六级'], aliases: ['六级', 'cet6', 'cet-6'] },
];

export const HUMAN_GATE_PATTERN = /接受调剂|接受外派|其他岗位|期望薪资|期望工作城市|竞业限制|家属任职|真实性声明/;
