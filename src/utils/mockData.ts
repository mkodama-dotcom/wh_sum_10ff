import type { WorkRecord, AdjustRecord } from './dataTypes';

export const mockSheet1: WorkRecord[] = [
  // いなべ - 栽培
  { flag: 1, employeeType: '社員＋技能実習生', site: 'いなべ', prj: 'いなべ', role: '栽培', employeeId: 260001, workHours: 7.5 },
  { flag: 1, employeeType: '社員＋技能実習生', site: 'いなべ', prj: 'いなべ', role: '栽培', employeeId: 260002, workHours: 8.0 },
  { flag: 1, employeeType: '社員＋技能実習生', site: 'いなべ', prj: 'いなべ', role: '栽培', employeeId: 260003, workHours: 6.5 },
  { flag: 1, employeeType: 'アルバイト',       site: 'いなべ', prj: 'いなべ', role: '栽培', employeeId: 260101, workHours: 4.0 },
  { flag: 1, employeeType: 'アルバイト',       site: 'いなべ', prj: 'いなべ', role: '栽培', employeeId: 260102, workHours: 3.5 },
  { flag: 1, employeeType: 'アルバイト',       site: 'いなべ', prj: 'いなべ', role: '栽培', employeeId: 260103, workHours: 5.0 },
  // いなべ - 出荷
  { flag: 1, employeeType: '社員＋技能実習生', site: 'いなべ', prj: 'いなべ', role: '出荷', employeeId: 260004, workHours: 7.0 },
  { flag: 1, employeeType: 'アルバイト',       site: 'いなべ', prj: 'いなべ', role: '出荷', employeeId: 260104, workHours: 3.0 },
  { flag: 1, employeeType: 'アルバイト',       site: 'いなべ', prj: 'いなべ', role: '出荷', employeeId: 260105, workHours: 2.5 },
  // いなべ - 配送（配送・栽培 / 配送・出荷）
  { flag: 1, employeeType: '社員＋技能実習生', site: 'いなべ', prj: 'いなべ', role: '配送・栽培', employeeId: 260005, workHours: 5.0 },
  { flag: 1, employeeType: '社員＋技能実習生', site: 'いなべ', prj: 'いなべ', role: '配送・出荷', employeeId: 260006, workHours: 4.8 },
  { flag: 1, employeeType: 'アルバイト',       site: 'いなべ', prj: 'いなべ', role: '配送・栽培', employeeId: 260106, workHours: 2.2 },
  // 除外対象（フラグ0）
  { flag: 0, employeeType: '社員＋技能実習生', site: 'いなべ', prj: 'いなべ', role: '栽培', employeeId: 299999, workHours: 10.0 },
  // 除外対象（研修）
  { flag: 1, employeeType: '社員＋技能実習生', site: 'いなべ', prj: 'いなべ', role: '研修_社内', employeeId: 260007, workHours: 8.0 },
  // 群馬
  { flag: 1, employeeType: '社員＋技能実習生', site: '群馬', prj: '群馬', role: '栽培', employeeId: 270001, workHours: 9.0 },
  { flag: 1, employeeType: '社員＋技能実習生', site: '群馬', prj: '群馬', role: '栽培', employeeId: 270002, workHours: 8.5 },
  { flag: 1, employeeType: 'アルバイト',       site: '群馬', prj: '群馬', role: '栽培', employeeId: 270101, workHours: 4.5 },
  { flag: 1, employeeType: '社員＋技能実習生', site: '群馬', prj: '群馬', role: '出荷', employeeId: 270003, workHours: 7.5 },
  { flag: 1, employeeType: 'アルバイト',       site: '群馬', prj: '群馬', role: '出荷', employeeId: 270102, workHours: 3.5 },
];

export const mockSheet2: AdjustRecord[] = [
  // 栽培から出荷へ1.5h移動（いなべ・社員）
  { flag: 1, employeeType: '社員＋技能実習生', site: 'いなべ', prj: '栽培', role: '出荷', adjustHours: 1.5 },
  // 出荷から自身を-0.5h（同一PRJ=担当）
  { flag: 1, employeeType: 'アルバイト',       site: 'いなべ', prj: '出荷', role: '出荷', adjustHours: 0.5 },
];
