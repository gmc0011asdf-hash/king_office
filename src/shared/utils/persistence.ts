import type { TraceResult } from '@/api/client';

export function buildPersistenceMessage(result: TraceResult<any>) {
  const lines = [result.message];
  if (result.source === 'local') lines.push('تم الحفظ محليًا');
  if (result.source === 'database' && result.ok) lines[0] = 'تم الحفظ في قاعدة البيانات';
  if (result.reason) lines.push(`السبب: ${result.reason}`);
  if (result.table) lines.push(`الجدول: ${result.table}`);
  if (result.column) lines.push(`العمود: ${result.column}`);
  return lines.join('\n');
}

export function notifyPersistence(result: TraceResult<any>) {
  console.group('Persistence Trace');
  result.trace.forEach((step, index) => console.log(`${index + 1}. ${step}`));
  if (result.reason) console.error(result.reason);
  console.groupEnd();
  alert(buildPersistenceMessage(result));
}
