import type { OfficeCustomer, Invoice } from '../types';

export interface PrintContext {
  systemSettings?: {
    officeName?: string;
    office_name?: string;
    officePhone?: string;
    office_phone?: string;
    officeAddress?: string;
    office_address?: string;
  };
}

export async function printCustomerReport(
  c: OfficeCustomer,
  context: PrintContext,
  customerSales: unknown[],
  customerInstallments: unknown[],
  customerInvoices: unknown[],
  customerHistory: unknown[]
): Promise<void> {
  const customerName = String(c?.name ?? '-');
  const customerPhone = String(c?.phone ?? '-');
  const debt = Number(c?.debt ?? 0);
  const dateStr = new Date().toLocaleString();
  const officeName = String(context.systemSettings?.officeName ?? context.systemSettings?.office_name ?? 'مكتب الملك');
  const officePhone = String(context.systemSettings?.officePhone ?? context.systemSettings?.office_phone ?? '');
  const officeAddress = String(context.systemSettings?.officeAddress ?? context.systemSettings?.office_address ?? '');

  const sales = Array.isArray(customerSales) ? customerSales : [];
  const installments = Array.isArray(customerInstallments) ? customerInstallments : [];
  const invoices = Array.isArray(customerInvoices) ? customerInvoices : [];
  const history = Array.isArray(customerHistory) ? customerHistory : [];

  const purchasesRows = sales
    .map((raw: unknown) => {
      const s = raw as Record<string, unknown>;
      const purchaseDate = String(s?.purchaseDate ?? s?.purchase_date ?? s?.date ?? '-');
      const name = String(s?.materialName ?? s?.material_name ?? '-');
      const paymentMethod = String(s?.paymentMethod ?? s?.payment_method ?? '');
      const total = Number(s?.totalWithCommission ?? s?.total_with_commission ?? s?.totalAmount ?? s?.total_amount ?? 0);
      return `<tr>
        <td dir="ltr">${purchaseDate}</td>
        <td>${name}</td>
        <td>${paymentMethod === 'installments' ? 'أقساط' : paymentMethod === 'debt' ? 'آجل' : 'نقد'}</td>
        <td dir="ltr">${total.toLocaleString()}</td>
      </tr>`;
    })
    .join('');

  const invoiceRows = invoices
    .map((raw: unknown) => {
      const inv = raw as Record<string, unknown>;
      const invNo = String(inv?.invoiceNo ?? inv?.invoice_no ?? inv?.id ?? '-');
      const invDate = inv?.date ? String(inv.date).slice(0, 10) : '-';
      const total = Number(inv?.totalAmount ?? inv?.total_amount ?? 0);
      const paid = Number(inv?.paidAmount ?? inv?.paid_amount ?? 0);
      const remaining = Math.max(0, total - paid);
      return `<tr>
        <td dir="ltr">${invNo}</td>
        <td dir="ltr">${invDate}</td>
        <td dir="ltr">${total.toLocaleString()}</td>
        <td dir="ltr">${paid.toLocaleString()}</td>
        <td dir="ltr">${remaining.toLocaleString()}</td>
      </tr>`;
    })
    .join('');

  const historyRows = history
    .map((raw: unknown) => {
      const h = raw as Record<string, unknown>;
      const hDate = h?.date ? String(h.date).slice(0, 10) : '-';
      const hType = String(h?.type ?? '-');
      const hAmount = Number(h?.amount ?? 0);
      const hDesc = String(h?.description ?? '-');
      return `<tr>
        <td dir="ltr">${hDate}</td>
        <td>${hType}</td>
        <td dir="ltr">${hAmount.toLocaleString()}</td>
        <td>${hDesc}</td>
      </tr>`;
    })
    .join('');

  const instRows = installments
    .map((raw: unknown) => {
      const it = raw as Record<string, unknown>;
      const idx = Number(it?.installmentIndex ?? it?.installment_index ?? 0);
      const due = String(it?.dueDate ?? it?.due_date ?? '-');
      const amount = Number(it?.amount ?? 0);
      const paid = Number(it?.paidAmount ?? it?.paid_amount ?? 0);
      const remaining = Math.max(0, amount - paid);
      const paidDate = String(it?.paidDate ?? it?.paid_date ?? '-');
      const status = remaining === 0 && amount > 0 ? 'مسدد' : paid > 0 ? 'مسدد جزئيًا' : 'غير مسدد';
      return `<tr>
        <td>#${idx}</td>
        <td dir="ltr">${due}</td>
        <td dir="ltr">${amount.toLocaleString()}</td>
        <td dir="ltr">${paid.toLocaleString()}</td>
        <td dir="ltr">${remaining.toLocaleString()}</td>
        <td dir="ltr">${paidDate}</td>
        <td>${status}</td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>تقرير زبون - ${customerName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body{font-family:"Cairo", Arial, sans-serif; padding:24px; color:#0f172a; text-align:right; direction:rtl}
    .h{display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:16px; text-align:right}
    .title{font-size:22px; font-weight:800; text-align:right}
    .meta{font-size:12px; color:#475569; line-height:1.7; text-align:right}
    .kpi{margin-top:10px; padding:12px; border:1px solid #e2e8f0; background:#f8fafc; border-radius:10px; font-weight:800; text-align:right}
    table{width:100%; border-collapse:collapse; margin-top:12px}
    th,td{border:1px solid #e2e8f0; padding:10px; font-size:12px; vertical-align:middle; text-align:right}
    th{background:#f8fafc; text-align:right}
    h3{margin:18px 0 8px; font-size:14px; text-align:right}
  </style>
</head>
<body>
  <div class="h">
    <div>
      <div class="title">${officeName}</div>
      ${officePhone ? `<div class="meta" dir="ltr">الهاتف: ${officePhone}</div>` : ''}
      ${officeAddress ? `<div class="meta">العنوان: ${officeAddress}</div>` : ''}
      <div class="meta" style="margin-top:8px">تقرير تسديدات وتفاصيل الزبون</div>
    </div>
    <div class="meta">
      <div>تاريخ الطباعة: ${dateStr}</div>
      <div>الزبون: <b>${customerName}</b> - ${customerPhone}</div>
    </div>
  </div>

  <div class="kpi">الدين الحالي: <span dir="ltr">${debt.toLocaleString()}</span> د.ع</div>

  <h3>الفواتير</h3>
  <table>
    <thead>
      <tr>
        <th>رقم الفاتورة</th>
        <th>التاريخ</th>
        <th>المجموع</th>
        <th>المدفوع</th>
        <th>المتبقي</th>
      </tr>
    </thead>
    <tbody>
      ${invoiceRows || `<tr><td colspan="5">لا توجد فواتير</td></tr>`}
    </tbody>
  </table>

  <h3>سجل حركات الأموال</h3>
  <table>
    <thead>
      <tr>
        <th>التاريخ</th>
        <th>النوع</th>
        <th>المبلغ</th>
        <th>الوصف</th>
      </tr>
    </thead>
    <tbody>
      ${historyRows || `<tr><td colspan="4">لا توجد حركات</td></tr>`}
    </tbody>
  </table>

  <h3>المشتريات (البيع السريع)</h3>
  <table>
    <thead>
      <tr>
        <th>تاريخ الشراء</th>
        <th>اسم المادة</th>
        <th>نوع العملية</th>
        <th>السعر</th>
      </tr>
    </thead>
    <tbody>
      ${purchasesRows || `<tr><td colspan="4">لا توجد مشتريات</td></tr>`}
    </tbody>
  </table>

  <h3>الأقساط</h3>
  <table>
    <thead>
      <tr>
        <th>الشهر</th>
        <th>تاريخ</th>
        <th>المبلغ</th>
        <th>المدفوع</th>
        <th>المتبقي</th>
        <th>تاريخ التسديد</th>
        <th>الحالة</th>
      </tr>
    </thead>
    <tbody>
      ${instRows || `<tr><td colspan="6">لا توجد أقساط</td></tr>`}
    </tbody>
  </table>

</body>
</html>`;

  const w = window.open('', '_blank', 'width=950,height=750');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

export function printInvoice(inv: Invoice, context: PrintContext): void {
  const officeName = String(inv?.officeName ?? inv?.office_name ?? context.systemSettings?.officeName ?? context.systemSettings?.office_name ?? 'مكتب الملك');
  const officePhone = String(context.systemSettings?.officePhone ?? context.systemSettings?.office_phone ?? '');
  const officeAddress = String(context.systemSettings?.officeAddress ?? context.systemSettings?.office_address ?? '');
  const invoiceNo = String(inv?.invoiceNo ?? inv?.invoice_no ?? '-');
  const dateStr = new Date(inv?.date ?? Date.now()).toLocaleString();
  const customerName = String(inv?.customerName ?? inv?.customer_name ?? '-');
  const customerPhone = String(inv?.customerPhone ?? inv?.customer_phone ?? '-');
  const paymentMethod = String(inv?.paymentMethod ?? inv?.payment_method ?? '-');
  const totalAmount = Number(inv?.totalAmount ?? inv?.total_amount ?? 0);
  const paidAmount = Number(inv?.paidAmount ?? inv?.paid_amount ?? 0);
  const remaining = Math.max(0, totalAmount - paidAmount);
  const items = Array.isArray(inv?.items) ? inv.items : [];

  const html = `<!doctype html>
<html dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>فاتورة - ${invoiceNo}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box}
    body{font-family:"Cairo",Arial,sans-serif;padding:28px;color:#0f172a;direction:rtl;margin:0}
    .header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:24px;flex-wrap:wrap}
    .header-right{flex:1;min-width:200px}
    .header-left{font-size:13px;color:#475569;line-height:1.8}
    .office-name{font-size:24px;font-weight:800;color:#0f172a;margin-bottom:4px}
    .invoice-title{font-size:14px;color:#64748b;margin-top:8px}
    .inv-table{width:100%;border-collapse:collapse;margin-top:20px}
    .inv-table th,.inv-table td{border:1px solid #cbd5e1;padding:12px 14px;font-size:14px}
    .inv-table th{background:#f1f5f9;font-weight:700;text-align:right}
    .inv-table td:nth-child(1){text-align:right}
    .inv-table td:nth-child(2){text-align:center;width:80px}
    .inv-table td:nth-child(3),.inv-table td:nth-child(4){text-align:left;font-family:ui-monospace,monospace;font-variant-numeric:tabular-nums;min-width:120px}
    .summary{margin-top:24px;display:flex;justify-content:flex-end}
    .summary-box{min-width:300px;border:1px solid #e2e8f0;background:#f8fafc;padding:16px;border-radius:8px}
    .summary-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:14px}
    .summary-row .val{font-weight:700;font-variant-numeric:tabular-nums}
  </style>
</head>
<body>
  <div class="header">
    <div class="header-right">
      <div class="office-name">${officeName}</div>
      ${officePhone ? `<div class="header-left" dir="ltr">الهاتف: ${officePhone}</div>` : ''}
      ${officeAddress ? `<div class="header-left">العنوان: ${officeAddress}</div>` : ''}
      <div class="invoice-title">فاتورة مبيعات</div>
    </div>
    <div class="header-left">
      <div>رقم الفاتورة: <strong>${invoiceNo}</strong></div>
      <div>التاريخ: ${dateStr}</div>
      <div>الزبون: ${customerName} - ${customerPhone}</div>
      <div>الدفع: ${paymentMethod === 'cash' ? 'نقدًا' : 'آجل'}</div>
    </div>
  </div>
  <table class="inv-table">
    <thead>
      <tr>
        <th>المادة</th>
        <th>الكمية</th>
        <th>سعر البيع</th>
        <th>المجموع</th>
      </tr>
    </thead>
    <tbody>
      ${items
        .map((raw: unknown) => {
          const it = raw as Record<string, unknown>;
          const name = String(it?.materialName ?? it?.material_name ?? '-');
          const qty = Number(it?.quantity ?? 0);
          const price = Number(it?.sellingPrice ?? it?.selling_price ?? 0);
          const line = Number(it?.totalAmount ?? it?.total_amount ?? qty * price);
          return `<tr><td>${name}</td><td>${qty}</td><td dir="ltr">${price.toLocaleString()}</td><td dir="ltr">${line.toLocaleString()}</td></tr>`;
        })
        .join('')}
    </tbody>
  </table>
  <div class="summary">
    <div class="summary-box">
      <div class="summary-row"><span>المجموع</span><span class="val">${totalAmount.toLocaleString()} د.ع</span></div>
      <div class="summary-row"><span>المدفوع</span><span class="val">${paidAmount.toLocaleString()} د.ع</span></div>
      <div class="summary-row"><span>المتبقي</span><span class="val">${remaining.toLocaleString()} د.ع</span></div>
      <div class="summary-row"><span>الحالة</span><span class="val">${remaining === 0 && totalAmount > 0 ? 'مسدد' : paidAmount > 0 ? 'مسدد جزئيًا' : 'غير مسدد'}</span></div>
    </div>
  </div>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
