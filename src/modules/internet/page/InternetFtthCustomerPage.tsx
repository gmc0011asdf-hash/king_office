import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, Globe2, Users } from 'lucide-react';
import { ftthPortalApi } from '@/modules/internet/api/ftthPortal.api';
import { ApiRequestError } from '@/api/client';
import { formatDateDDMMYYYY } from '@/utils/ftthDateCalculations';
import type { FtthExternalRow, FtthPortalCustomerRow } from '@/modules/internet/page/components/types';

function portalDetailToFtthExternalRow(p: FtthPortalCustomerRow): FtthExternalRow {
  const start = p.subscription_start_date ? String(p.subscription_start_date).slice(0, 10) : null;
  const end = p.subscription_end_date ? String(p.subscription_end_date).slice(0, 10) : null;
  const sid = p.staging_row_id != null && p.staging_row_id > 0 ? p.staging_row_id : p.id;
  return {
    id: sid,
    external_id: p.external_customer_id,
    national_name: p.full_name,
    phone: p.phone,
    zone: p.zone,
    fat: p.fat,
    location: null,
    service_username: p.onu_username ?? null,
    start_date: start,
    end_date: end,
    resolved_subscription_date: null,
    resolved_expiration_date: null,
    calculated_subscription_date: null,
    remaining_days: null,
    commitment_days: null,
    status: p.subscription_status,
    imported_subscriber_id: p.subscriber_id,
    synced_at: p.last_synced_at ?? null,
    last_synced_at: p.last_synced_at ?? null,
    data_source: 'database',
  };
}

/**
 * صفحة مستقلة لتفاصيل عميل FTTH حسب المعرف الخارجي (بدون اعتماد على ترحيل أو مزامنة).
 * المسار: /internet/ftth-customer/:externalId — يعمل مع التحديث (refresh).
 */
export default function InternetFtthCustomerPage() {
  const { externalId } = useParams<{ externalId: string }>();
  const navigate = useNavigate();
  const [row, setRow] = useState<FtthExternalRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const eid = String(id || '').trim();
    if (!eid || !/^\d+$/.test(eid)) {
      setError('معرّف FTTH غير صالح (أرقام فقط).');
      setRow(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setRow(null);
    try {
      try {
        const portal = await ftthPortalApi.getPortalCustomerDetail(eid);
        setRow(portalDetailToFtthExternalRow(portal));
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          const data = await ftthPortalApi.getExternalCustomerByExternalId(eid);
          setRow(data);
        } else {
          throw err;
        }
      }
    } catch (err) {
      const msg =
        err instanceof ApiRequestError
          ? err.status === 403
            ? 'لا صلاحية لجلب هذا السجل مباشرة من FTTH (صلاحية «بوابة FTTH» أو سجل مزامَن محلياً).'
            : err.status === 404
              ? String(err.message || 'لم يُعثر على بيانات لهذا المعرف.')
              : String(err.message || 'تعذر تحميل بيانات FTTH.')
        : 'تعذر تحميل بيانات FTTH.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(externalId ?? '');
  }, [externalId, load]);

  const openLocalSubscriber = (sid: number) => {
    navigate(`/internet?openSubscriber=${String(sid)}`);
  };

  const ds = row?.data_source ?? row?.dataSource;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/internet"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          <ArrowRight size={16} className="rotate-180" />
          العودة إلى قسم الإنترنت
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 flex items-start gap-3">
          <Globe2 size={28} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">تفاصيل FTTH (معرّف خارجي)</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono" dir="ltr">
              {externalId ? `ID ${externalId}` : '—'}
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {loading && (
            <p className="text-sm text-slate-500 dark:text-slate-400">جاري جلب بيانات FTTH…</p>
          )}
          {error && (
            <div
              className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-800 dark:text-rose-200"
              role="alert"
            >
              {error}
            </div>
          )}
          {!loading && row && (
            <>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {ds === 'live'
                  ? 'عرض مباشر من بوابة FTTH (لم يُحفظ تلقائياً في الجدول الوسيط).'
                  : 'من السجل الوسيط المحلي بعد المزامنة.'}
              </p>
              {!row.imported_subscriber_id && (
                <p className="text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-2 py-1.5">
                  لا يوجد مشترك محلي مرتبط بهذا السجل بعد — يمكن الترحيل لاحقاً من تبويب بوابة FTTH.
                </p>
              )}
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">معرّف FTTH</dt>
                  <dd className="font-mono text-slate-900 dark:text-slate-100" dir="ltr">
                    {row.external_id}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-slate-500 dark:text-slate-400">الاسم (الوطني)</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{row.national_name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-slate-500 dark:text-slate-400">هاتف</dt>
                  <dd className="font-mono text-slate-900 dark:text-slate-100" dir="ltr">
                    {row.phone || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-slate-500 dark:text-slate-400">منطقة / FAT</dt>
                  <dd className="font-mono text-slate-900 dark:text-slate-100" dir="ltr">
                    {[row.zone, row.fat].filter(Boolean).join(' · ') || '—'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-bold text-slate-500 dark:text-slate-400">خدمة / عنوان</dt>
                  <dd className="text-slate-800 dark:text-slate-200 break-words">
                    {[row.service_username, row.location].filter(Boolean).join(' — ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-slate-500 dark:text-slate-400">بداية / نهاية</dt>
                  <dd className="font-mono text-xs text-slate-800 dark:text-slate-200" dir="ltr">
                    {formatDateDDMMYYYY(row.start_date) || row.start_date || '—'} →{' '}
                    {formatDateDDMMYYYY(row.end_date) || row.end_date || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-slate-500 dark:text-slate-400">حالة</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{row.status || '—'}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2 pt-2">
                <a
                  href={`https://admin.ftth.iq/customer-details/${encodeURIComponent(row.external_id)}/details/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-500"
                >
                  <ExternalLink size={14} />
                  فتح في admin.ftth.iq
                </a>
                {row.imported_subscriber_id ? (
                  <button
                    type="button"
                    onClick={() => {
                      const sid = row.imported_subscriber_id;
                      if (sid) openLocalSubscriber(sid);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <Users size={14} />
                    فتح المشترك المحلي #{row.imported_subscriber_id}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
