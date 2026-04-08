import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  Edit,
  Eye,
  EyeOff,
  History,
  Mail,
  RotateCcw,
  Shield,
  Trash2,
  Upload,
  UserPlus,
  X,
  MessageSquare,
  Save,
} from 'lucide-react';
import { useAppContext, type SystemSettings, type User } from '@/context/AppContext';
import { IRAQ_PHONE_HINT_AR, normalizeIraqMobileOptional } from '@/utils/iraqPhone';
import { usersApi } from '@/modules/auth/api/users.api';
import { settingsApi } from '@/modules/settings/api/settings.api';
import { templatesApi, type MessageTemplate } from '@/modules/settings/api/templates.api';
import { backupApi, type BackupItem } from '@/modules/settings/api/backup.api';
import { activityLogApi, ActivityLogEntry, auditLogApi, AuditLogEntry } from '@/modules/settings/api/activityLog.api';
import { notifyPersistence } from '@/utils/persistence';
import { ApiRequestError } from '@/api/client';

const createDefaultPermissions = () => ({
  sections: {
    dashboard: false,
    internet: false,
    office: false,
    cards: false,
    expenses: false,
    partners: false,
    reports: false,
    settings: false,
  },
  dashboard: {
    viewSummary: false,
    viewAlerts: false,
    exportData: false,
  },
  internet: {
    addSubscriber: false,
    renewSubscription: false,
    editSubscriber: false,
    addMaterial: false,
    sellMaterial: false,
    editMaterial: false,
    deleteMaterial: false,
    addZone: false,
    editZone: false,
    deleteZone: false,
    addFat: false,
    editFat: false,
    deleteFat: false,
    rechargeWallet: false,
    addCategory: false,
    editCategory: false,
    deleteCategory: false,
    reports: false,
    phoneDirectory: false,
    ftthPortal: false,
  },
  office: {
    quickSale: false,
    createInvoice: false,
    addMaterial: false,
    editMaterial: false,
    deleteMaterial: false,
    addCustomer: false,
    editCustomer: false,
    deleteCustomer: false,
    debtAdd: false,
    debtEdit: false,
    debtDelete: false,
    linesAdd: false,
    linesAddPackage: false,
    linesSell: false,
    linesSalesLog: false,
    linesReports: false,
    linesInventoryMovement: false,
    linesAddNumbers: false,
    linesSectionReports: false,
    reports: false,
  },
  cards: {
    topupSwig: false,
    topupQi: false,
    buyCards: false,
    topupCustomerSwig: false,
    topupCustomerQi: false,
    sellCards: false,
    reportSwig: false,
    reportGeneral: false,
  },
  expenses: { addExpense: false },
  partners: {
    addPartner: false,
    calcProfit: false,
    addSupplier: false,
    paySupplier: false,
    purchaseOnCredit: false,
  },
  reports: { viewReports: false },
});

/** دمج صلاحيات محفوظة مع الافتراضي حتى تظهر مفاتيح جديدة (مثل دليل الهاتف / FTTH) في نموذج التعديل */
function mergePermissionsWithDefaults(saved: unknown) {
  const def = createDefaultPermissions();
  if (!saved || typeof saved !== 'object') return def;
  const s = saved as Record<string, unknown>;
  const merged: Record<string, unknown> = {
    ...def,
    ...s,
    sections: { ...def.sections, ...(typeof s.sections === 'object' && s.sections ? s.sections : {}) },
  };
  for (const key of Object.keys(def) as (keyof typeof def)[]) {
    if (key === 'sections') continue;
    const dv = def[key];
    const sv = s[key as string];
    if (dv && typeof dv === 'object' && !Array.isArray(dv)) {
      merged[key as string] = {
        ...(dv as object),
        ...(sv && typeof sv === 'object' && !Array.isArray(sv) ? (sv as object) : {}),
      };
    }
  }
  return merged as ReturnType<typeof createDefaultPermissions>;
}

const sectionLabels: Record<string, string> = {
  dashboard: 'لوحة التحكم',
  internet: 'قسم الإنترنت',
  office: 'قسم المكتب',
  cards: 'قسم البطاقات',
  expenses: 'قسم المصروفات',
  partners: 'قسم الشركاء',
  reports: 'قسم التقارير',
  settings: 'الإعدادات',
};

const featureLabels: Record<string, Record<string, string>> = {
  dashboard: {
    viewSummary: 'عرض ملخص لوحة التحكم',
    viewAlerts: 'عرض التنبيهات',
    exportData: 'تصدير البيانات',
  },
  internet: {
    addSubscriber: 'إضافة مشترك',
    renewSubscription: 'تجديد اشتراك',
    editSubscriber: 'تعديل مشترك',
    addMaterial: 'إضافة مادة إنترنت',
    sellMaterial: 'بيع مادة',
    editMaterial: 'تعديل مادة',
    deleteMaterial: 'حذف مادة',
    addZone: 'إضافة منطقة',
    editZone: 'تعديل منطقة',
    deleteZone: 'حذف منطقة',
    addFat: 'إضافة FAT',
    editFat: 'تعديل FAT',
    deleteFat: 'حذف FAT',
    rechargeWallet: 'تعبئة محفظة الإنترنت',
    addCategory: 'إضافة فئة اشتراك',
    editCategory: 'تعديل فئة',
    deleteCategory: 'حذف فئة',
    reports: 'تقارير الأرباح',
    phoneDirectory: 'دليل الهواتف (قسم الإنترنت)',
    ftthPortal: 'بوابة FTTH (استيراد من لوحة المزوّد)',
  },
  office: {
    quickSale: 'البيع السريع',
    createInvoice: 'إنشاء فاتورة',
    addMaterial: 'إضافة مادة مخزون',
    editMaterial: 'تعديل مادة',
    deleteMaterial: 'حذف مادة',
    addCustomer: 'إضافة زبون',
    editCustomer: 'تعديل زبون',
    deleteCustomer: 'حذف زبون',
    debtAdd: 'إضافة دين',
    debtEdit: 'تعديل دين',
    debtDelete: 'حذف دين',
    linesAdd: 'إضافة خطوط',
    linesAddPackage: 'إضافة باقة',
    linesSell: 'بيع خطوط',
    linesSalesLog: 'سجل المبيعات',
    linesReports: 'تقارير الخطوط',
    linesInventoryMovement: 'حركة المخزن',
    linesAddNumbers: 'إدخال أرقام',
    linesSectionReports: 'تقارير قسم الخطوط',
    reports: 'تقارير المكتب',
  },
  cards: {
    topupSwig: 'شحن محفظة Switch',
    topupQi: 'شحن محفظة Qi',
    buyCards: 'شراء بطاقات',
    topupCustomerSwig: 'تعبئة زبون Switch',
    topupCustomerQi: 'تعبئة زبون Qi',
    sellCards: 'بيع بطاقات',
    reportSwig: 'تقرير Switch والبطاقات',
    reportGeneral: 'التقرير العام للقسم',
  },
  expenses: {
    addExpense: 'إضافة مصروف',
  },
  partners: {
    addPartner: 'إضافة شريك',
    calcProfit: 'حساب الأرباح',
    addSupplier: 'إضافة مورد',
    paySupplier: 'تسديد مورد',
    purchaseOnCredit: 'شراء بالآجل',
  },
  reports: {
    viewReports: 'التقارير العامة',
  },
};

const sectionLabelsLog: Record<string, string> = {
  auth: 'تسجيل الدخول',
  internet: 'قسم الإنترنت',
  office: 'قسم المكتب',
  cards: 'قسم البطاقات',
  expenses: 'قسم المصروفات',
  partners: 'قسم الشركاء',
  settings: 'الإعدادات',
  lines: 'قسم الخطوط',
};

/** تسميات عربية لإجراءات سجل الحركات (اختياري؛ غير المذكور يُعرض كما هو) */
const actionLabelsLog: Record<string, string> = {
  phone_directory_import: 'استيراد دليل الهواتف',
  phone_directory_import_failed: 'فشل استيراد دليل الهواتف',
  phone_directory_export: 'تصدير دليل الهواتف',
  phone_directory_export_failed: 'فشل تصدير دليل الهواتف',
  phone_directory_add: 'إضافة سجل دليل هاتف',
  phone_directory_add_failed: 'فشل إضافة سجل دليل هاتف',
  phone_directory_edit: 'تعديل سجل دليل هاتف',
  phone_directory_edit_failed: 'فشل تعديل سجل دليل هاتف',
  phone_directory_delete: 'حذف سجل دليل هاتف',
  phone_directory_delete_failed: 'فشل حذف سجل دليل هاتف',
  phone_directory_normalize_stored: 'تصحيح أرقام دليل الهواتف في القاعدة',
  phone_directory_normalize_stored_failed: 'فشل تصحيح أرقام دليل الهواتف',
  backup_create: 'إنشاء نسخة احتياطية',
  backup_restore: 'استرجاع من نسخة احتياطية',
  backup_restore_upload: 'استرجاع من ملف مرفوع',
  backup_delete: 'حذف نسخة احتياطية',
  backup_settings_update: 'تحديث إعدادات النسخ الاحتياطي',
  backup_scheduled: 'نسخ احتياطي مجدول (تلقائي)',
};

export default function Settings() {
  const {
    users,
    setUsers,
    systemSettings,
    setSystemSettings,
    darkMode,
    setDarkMode,
    addNotification,
    currentUser,
    logActivity,
    setSuspendIdleLogout,
  } = useAppContext();
  const [activeTab, setActiveTab] = useState<'users' | 'system' | 'templates' | 'activity' | 'audit' | 'backup'>('users');
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityFilterUser, setActivityFilterUser] = useState<number | ''>('');
  const [activityFilterSection, setActivityFilterSection] = useState<string>('');
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const [walletThreshold, setWalletThreshold] = useState('50000');
  const [stockThreshold, setStockThreshold] = useState('5');
  const [earthlinkThreshold, setEarthlinkThreshold] = useState('50000');
  const [swigThreshold, setSwigThreshold] = useState('50000');
  const [qiThreshold, setQiThreshold] = useState('50000');
  const [cardsThreshold, setCardsThreshold] = useState('5');
  const [materialsThreshold, setMaterialsThreshold] = useState('5');
  const [officeName, setOfficeName] = useState('مكتب الملك');
  const [officePhone, setOfficePhone] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [cardsReportName, setCardsReportName] = useState('قضاء علي الغربي SWG70');

  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupCreating, setBackupCreating] = useState(false);
  const [backupDownloading, setBackupDownloading] = useState(false);
  const [restoreTyping, setRestoreTyping] = useState('');
  const [restoreModal, setRestoreModal] = useState<
    { kind: 'server'; filename: string } | { kind: 'upload'; file: File } | null
  >(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreStartedAt, setRestoreStartedAt] = useState<number | null>(null);
  const [restoreElapsedTick, setRestoreElapsedTick] = useState(0);
  const isAdmin = currentUser?.role === 'admin';

  const [backupStoragePath, setBackupStoragePath] = useState('');
  const [backupSchedule, setBackupSchedule] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [backupScheduleTime, setBackupScheduleTime] = useState('02:00');
  const [backupScheduleWeekday, setBackupScheduleWeekday] = useState(5);
  const [backupScheduleMonthDay, setBackupScheduleMonthDay] = useState(1);
  const [backupLastRun, setBackupLastRun] = useState<string | null>(null);
  const [backupCfgSaving, setBackupCfgSaving] = useState(false);

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesSaving, setTemplatesSaving] = useState<string | null>(null);

  const weekdayOptions: { v: number; label: string }[] = [
    { v: 0, label: 'الاثنين' },
    { v: 1, label: 'الثلاثاء' },
    { v: 2, label: 'الأربعاء' },
    { v: 3, label: 'الخميس' },
    { v: 4, label: 'الجمعة' },
    { v: 5, label: 'السبت' },
    { v: 6, label: 'الأحد' },
  ];

  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState<'admin' | 'user'>('user');
  const [userPassword, setUserPassword] = useState('');
  const [showUserPassword, setShowUserPassword] = useState(false);
  const [userRecoveryEmail, setUserRecoveryEmail] = useState('');
  const [userPermissions, setUserPermissions] = useState<any>(createDefaultPermissions());

  useEffect(() => {
    if (activeTab === 'activity') {
      setActivityLoading(true);
      activityLogApi.getAll({
        userId: activityFilterUser || undefined,
        section: activityFilterSection || undefined,
        limit: 100,
      }).then(setActivityLogs).catch(() => setActivityLogs([])).finally(() => setActivityLoading(false));
    }
  }, [activeTab, activityFilterUser, activityFilterSection]);

  useEffect(() => {
    if (activeTab === 'audit') {
      setAuditLoading(true);
      auditLogApi.getAll({ limit: 200 })
        .then(setAuditLogs)
        .catch(() => setAuditLogs([]))
        .finally(() => setAuditLoading(false));
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'backup' && !isAdmin) setActiveTab('users');
  }, [activeTab, isAdmin]);

  useEffect(() => {
    if (activeTab !== 'backup' || !isAdmin) return;
    let cancel = false;
    setBackupsLoading(true);
    backupApi
      .list()
      .then((list) => {
        if (!cancel) setBackups(list);
      })
      .catch(() => {
        if (!cancel) {
          setBackups([]);
          addNotification?.('النسخ الاحتياطي', 'تعذر تحميل قائمة النسخ', 'alert');
        }
      })
      .finally(() => {
        if (!cancel) setBackupsLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [activeTab, isAdmin, addNotification]);

  useEffect(() => {
    setBackupStoragePath(systemSettings.backupStoragePath ?? '');
    setBackupSchedule((systemSettings.backupSchedule ?? (systemSettings as any).backup_schedule ?? 'none') as 'none' | 'daily' | 'weekly' | 'monthly');
    setBackupScheduleTime(
      (systemSettings.backupScheduleTime ?? (systemSettings as any).backup_schedule_time ?? '02:00').toString().slice(0, 5),
    );
    setBackupScheduleWeekday(systemSettings.backupScheduleWeekday ?? (systemSettings as any).backup_schedule_weekday ?? 5);
    setBackupScheduleMonthDay(systemSettings.backupScheduleMonthDay ?? (systemSettings as any).backup_schedule_month_day ?? 1);
    setBackupLastRun(systemSettings.backupLastScheduledAt ?? (systemSettings as any).backup_last_scheduled_at ?? null);
  }, [systemSettings]);

  useEffect(() => {
    if (activeTab !== 'backup' || !isAdmin) return;
    let cancel = false;
    backupApi
      .getSettings()
      .then((c) => {
        if (cancel) return;
        setBackupStoragePath(c.backup_storage_path || '');
        setBackupSchedule((c.backup_schedule as typeof backupSchedule) || 'none');
        setBackupScheduleTime((c.backup_schedule_time || '02:00').slice(0, 5));
        setBackupScheduleWeekday(c.backup_schedule_weekday ?? 5);
        setBackupScheduleMonthDay(c.backup_schedule_month_day ?? 1);
        setBackupLastRun(c.backup_last_scheduled_at);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [activeTab, isAdmin]);

  useEffect(() => {
    setWalletThreshold(String(systemSettings.walletAlertThreshold ?? 50000));
    setStockThreshold(String(systemSettings.stockAlertThreshold ?? 5));
    setEarthlinkThreshold(String(systemSettings.earthlinkThreshold ?? 50000));
    setSwigThreshold(String(systemSettings.swigThreshold ?? 50000));
    setQiThreshold(String(systemSettings.qiThreshold ?? 50000));
    setCardsThreshold(String(systemSettings.cardsThreshold ?? 5));
    setMaterialsThreshold(String(systemSettings.materialsThreshold ?? 5));
    setOfficeName(String(systemSettings.officeName ?? systemSettings.office_name ?? 'مكتب الملك'));
    setOfficePhone(String(systemSettings.officePhone ?? systemSettings.office_phone ?? ''));
    setOfficeAddress(String(systemSettings.officeAddress ?? systemSettings.office_address ?? ''));
    setCardsReportName(String(systemSettings.cardsReportName ?? systemSettings.cards_report_name ?? 'قضاء علي الغربي SWG70'));
  }, [systemSettings]);

  useEffect(() => {
    if (activeTab === 'templates') {
      setTemplatesLoading(true);
      templatesApi.getAll()
        .then(setTemplates)
        .catch(() => setTemplates([]))
        .finally(() => setTemplatesLoading(false));
    }
  }, [activeTab]);

  const handleUpdateTemplate = async (key: string, body: string) => {
    setTemplatesSaving(key);
    try {
      const updated = await templatesApi.update(key, body);
      setTemplates((prev: MessageTemplate[]) => prev.map((t: MessageTemplate) => t.key === key ? updated : t));
      addNotification?.('حفظ القالب', 'تم حفظ قالب الرسالة بنجاح', 'info');
      logActivity?.('settings', 'template_update', `تحديث قالب: ${key}`);
    } catch (error) {
      console.error(error);
      addNotification?.('حفظ القالب', 'فشل في حفظ القالب', 'alert');
    } finally {
      setTemplatesSaving(null);
    }
  };

  const openAddUser = () => {
    setSelectedUser(null);
    setUserName('');
    setUserEmail('');
    setUserRole('user');
    setUserPassword('');
    setUserRecoveryEmail('');
    setUserPermissions(createDefaultPermissions());
    setIsAddUserOpen(true);
  };

  const openEditUser = (user: any) => {
    setSelectedUser(user);
    setUserName(user.name || '');
    setUserEmail(user.email || '');
    setUserRole(user.role || 'user');
    setUserPassword('');
    setUserRecoveryEmail(user.recoveryEmail || '');
    setUserPermissions(mergePermissionsWithDefaults(user.permissions));
    setIsEditUserOpen(true);
  };

  const closeUserModal = () => {
    setIsAddUserOpen(false);
    setIsEditUserOpen(false);
    setSelectedUser(null);
  };

  const toggleSectionPermission = (key: string) => {
    setUserPermissions((prev: any) => ({
      ...prev,
      sections: { ...prev.sections, [key]: !prev.sections?.[key] },
    }));
  };

  const toggleFeaturePermission = (section: string, key: string) => {
    setUserPermissions((prev: any) => ({
      ...prev,
      [section]: { ...(prev[section] || {}), [key]: !prev?.[section]?.[key] },
    }));
  };

  const handleAddUser = async () => {
    if (!userName || !userEmail || !userPassword) return;
    try {
      const result = await usersApi.createTracked({
        name: userName,
        email: userEmail,
        role: userRole,
        password: userPassword,
        recoveryEmail: userRecoveryEmail,
        status: 'active',
        permissions: userRole === 'user' ? userPermissions : null,
      });
      if (!result.ok || !result.data) {
        notifyPersistence(result);
        return;
      }
      setUsers([...users, result.data as User]);
      addNotification?.('إضافة مستخدم', `تم إضافة المستخدم ${userName} (${userEmail}) بنجاح`, 'info');
      logActivity?.('settings', 'add_user', `إضافة المستخدم ${userName} (${userEmail})`);
      closeUserModal();
      notifyPersistence(result);
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء إضافة المستخدم');
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser || !userName || !userEmail) return;
    try {
      const updatedUser = await usersApi.update(selectedUser.id, {
        name: userName,
        email: userEmail,
        role: userRole,
        password: userPassword || undefined,
        recoveryEmail: userRecoveryEmail,
        permissions: userRole === 'user' ? userPermissions : null,
      });
      setUsers(users.map((u) => (u.id === selectedUser.id ? (updatedUser as User) : u)));
      addNotification?.('تعديل مستخدم', `تم تعديل بيانات المستخدم ${userName} (${userEmail}) بنجاح`, 'info');
      logActivity?.('settings', 'edit_user', `تعديل المستخدم ${userName} (${userEmail})`);
      closeUserModal();
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء تعديل المستخدم');
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
    try {
      const deletedUser = users.find(u => u.id === id);
      await usersApi.delete(id);
      setUsers(users.filter((u) => u.id !== id));
      addNotification?.('حذف مستخدم', `تم حذف المستخدم ${deletedUser?.name || deletedUser?.email || ''} من النظام`, 'info');
      logActivity?.('settings', 'delete_user', `حذف المستخدم ${deletedUser?.name || deletedUser?.email || ''}`);
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء حذف المستخدم');
    }
  };

  const handleSaveSystemSettings = async () => {
    let officePhoneNorm: string | null = null;
    try {
      officePhoneNorm = normalizeIraqMobileOptional(officePhone);
    } catch {
      alert(IRAQ_PHONE_HINT_AR);
      return;
    }
    const payload = {
      walletAlertThreshold: Number(walletThreshold) || 50000,
      stockAlertThreshold: Number(stockThreshold) || 5,
      earthlinkThreshold: Number(earthlinkThreshold) || 50000,
      swigThreshold: Number(swigThreshold) || 50000,
      qiThreshold: Number(qiThreshold) || 50000,
      cardsThreshold: Number(cardsThreshold) || 5,
      materialsThreshold: Number(materialsThreshold) || 5,
      officeName: officeName || 'مكتب الملك',
      officePhone: officePhoneNorm,
      officeAddress: officeAddress || null,
      cardsReportName: cardsReportName || 'قضاء علي الغربي SWG70',
    };
    try {
      const saved: any = await settingsApi.update(1, payload);
      setSystemSettings(saved);
      addNotification?.('حفظ الإعدادات', 'تم حفظ إعدادات النظام بنجاح', 'info');
      logActivity?.('settings', 'save_settings', 'حفظ إعدادات النظام');
      alert('تم حفظ إعدادات النظام في قاعدة البيانات بنجاح');
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء حفظ الإعدادات');
    }
  };

  const permissionSections = useMemo(() => Object.keys(sectionLabels), []);

  const exportActivityLogToExcel = () => {
    const headers = ['المستخدم', 'القسم', 'الإجراء', 'التفاصيل', 'التاريخ والوقت'];
    const rows = activityLogs.map((log) => [
      log.userName || '-',
      sectionLabelsLog[log.section] || log.section,
      actionLabelsLog[log.action] || log.action,
      log.details || '-',
      log.createdAt ? new Date(log.createdAt).toLocaleString('ar-IQ') : '-',
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `سجل_الحركات_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const toggleAllSectionFeatures = (sectionKey: string, checked: boolean) => {
    const fields = featureLabels[sectionKey];
    if (!fields) return;
    setUserPermissions((prev: any) => ({
      ...prev,
      [sectionKey]: Object.fromEntries(Object.keys(fields).map(k => [k, checked])),
    }));
  };

  const RESTORE_CONFIRM_PHRASE = 'استرجاع';

  const formatBackupSize = (n: number) => {
    if (n >= 1048576) return `${(n / 1048576).toFixed(2)} ميجابايت`;
    if (n >= 1024) return `${(n / 1024).toFixed(1)} كيلوبايت`;
    return `${n} بايت`;
  };

  const handleSaveBackupConfig = async () => {
    setBackupCfgSaving(true);
    try {
      const saved = await backupApi.putSettings({
        backup_storage_path: backupStoragePath.trim() || null,
        backup_schedule: backupSchedule,
        backup_schedule_time: backupScheduleTime,
        backup_schedule_weekday: backupSchedule === 'weekly' ? backupScheduleWeekday : null,
        backup_schedule_month_day: backupSchedule === 'monthly' ? backupScheduleMonthDay : null,
      });
      setBackupLastRun(saved.backup_last_scheduled_at);
      setSystemSettings((prev) => ({
        ...prev,
        backupStoragePath: saved.backup_storage_path ?? undefined,
        backupSchedule: saved.backup_schedule as SystemSettings['backupSchedule'],
        backupScheduleTime: saved.backup_schedule_time,
        backupScheduleWeekday: saved.backup_schedule_weekday,
        backupScheduleMonthDay: saved.backup_schedule_month_day,
        backupLastScheduledAt: saved.backup_last_scheduled_at,
      }));
      addNotification?.('النسخ الاحتياطي', 'تم حفظ إعدادات المسار والجدولة', 'info');
      logActivity?.('settings', 'backup_settings_update', 'إعدادات النسخ الاحتياطي');
    } catch (e: unknown) {
      const msg = e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : 'فشل الحفظ';
      addNotification?.('النسخ الاحتياطي', msg, 'alert');
    } finally {
      setBackupCfgSaving(false);
    }
  };

  const handleCreateBackup = async () => {
    setBackupCreating(true);
    try {
      const r = await backupApi.create();
      addNotification?.('النسخ الاحتياطي', r.message || 'تم إنشاء النسخة', 'info');
      logActivity?.('settings', 'backup_create', r.backup?.filename || '');
      const list = await backupApi.list();
      setBackups(list);
    } catch (e: unknown) {
      const msg = e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : 'فشل إنشاء النسخة';
      addNotification?.('النسخ الاحتياطي', msg, 'alert');
    } finally {
      setBackupCreating(false);
    }
  };

  const handleDownloadNow = async () => {
    setBackupDownloading(true);
    try {
      await backupApi.downloadNow();
      addNotification?.('تحميل النسخة الاحتياطية', 'بدأ التحميل إلى جهازك', 'info');
      const list = await backupApi.list();
      setBackups(list);
    } catch (e: unknown) {
      const msg = e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : 'فشل التحميل';
      addNotification?.('تحميل النسخة الاحتياطية', msg, 'alert');
    } finally {
      setBackupDownloading(false);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!window.confirm(`حذف النسخة «${filename}» نهائياً؟`)) return;
    try {
      await backupApi.remove(filename);
      addNotification?.('النسخ الاحتياطي', 'تم حذف النسخة', 'info');
      logActivity?.('settings', 'backup_delete', filename);
      setBackups((prev) => prev.filter((b) => b.filename !== filename));
    } catch (e: unknown) {
      const msg = e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : 'فشل الحذف';
      addNotification?.('النسخ الاحتياطي', msg, 'alert');
    }
  };

  useEffect(() => {
    if (!restoreBusy) return;
    const id = window.setInterval(() => setRestoreElapsedTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [restoreBusy]);

  const runRestore = async () => {
    if (!restoreModal || restoreTyping.trim() !== RESTORE_CONFIRM_PHRASE) return;
    setSuspendIdleLogout(true);
    setRestoreBusy(true);
    setRestoreStartedAt(Date.now());
    setRestoreElapsedTick(0);
    addNotification?.(
      'النسخ الاحتياطي',
      'بدأ الاسترجاع — قد يستغرق وقتاً طويلاً (دقائق). لا تغلق المتصفح. الخادم يعمل في الخلفية؛ سيظهر تنبيه عند الانتهاء.',
      'info',
    );
    try {
      if (restoreModal.kind === 'server') {
        const r = await backupApi.restore(restoreModal.filename);
        addNotification?.('النسخ الاحتياطي', r.message, 'info');
        logActivity?.('settings', 'backup_restore', restoreModal.filename);
      } else {
        const r = await backupApi.restoreUpload(restoreModal.file);
        addNotification?.('النسخ الاحتياطي', r.message, 'info');
        logActivity?.('settings', 'backup_restore_upload', restoreModal.file.name);
      }
      setRestoreModal(null);
      setRestoreTyping('');
    } catch (e: unknown) {
      const msg = e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : 'فشل الاسترجاع';
      addNotification?.('النسخ الاحتياطي', msg, 'alert');
    } finally {
      setRestoreBusy(false);
      setRestoreStartedAt(null);
      setSuspendIdleLogout(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">الإعدادات</h1>
        <p className="text-slate-500 text-sm mt-1">إدارة المستخدمين والصلاحيات وإعدادات النظام</p>
      </div>

      <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto sticky top-0 bg-slate-50 dark:bg-slate-900 z-30 pt-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <button onClick={() => setActiveTab('users')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'users' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
          <Shield size={18} /> إدارة المستخدمين والصلاحيات
        </button>
        <button onClick={() => setActiveTab('system')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'system' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
          <CheckCircle2 size={18} /> إعدادات النظام
        </button>
        <button onClick={() => setActiveTab('templates')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'templates' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
          <MessageSquare size={18} /> قوالب الرسائل
        </button>
        <button onClick={() => setActiveTab('activity')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'activity' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
          <History size={18} /> سجل الحركات
        </button>
        {isAdmin && (
          <button onClick={() => setActiveTab('audit')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'audit' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
            <ClipboardList size={18} /> سجل التدقيق
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'backup' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            <Database size={18} /> النسخ الاحتياطي
          </button>
        )}
      </div>

      {activeTab === 'users' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 dark:text-white">قائمة المستخدمين</h3>
            <button onClick={openAddUser} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 flex items-center gap-1"><UserPlus size={16} /> إضافة مستخدم</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-white dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                <tr>
                  <th className="px-4 py-3 font-medium">المستخدم</th>
                  <th className="px-4 py-3 font-medium">الدور</th>
                  <th className="px-4 py-3 font-medium">كلمة المرور</th>
                  <th className="px-4 py-3 font-medium">بريد الاستعادة</th>
                  <th className="px-4 py-3 font-medium">آخر تسجيل دخول</th>
                  <th className="px-4 py-3 font-medium">الحالة</th>
                  <th className="px-4 py-3 font-medium text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-600 text-sm">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <td className="px-4 py-3"><div className="font-medium text-slate-800 dark:text-slate-200">{user.name}</div><div className="text-xs text-slate-500 dark:text-slate-400">{user.email}</div></td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{user.role === 'admin' ? 'مدير عام' : 'موظف'}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{showPasswords[user.id] ? (user.password || 'غير معروضة') : '••••••••'}</span>
                        <button onClick={() => setShowPasswords((prev) => ({ ...prev, [user.id]: !prev[user.id] }))} className="text-slate-400 hover:text-indigo-600 transition-colors">{showPasswords[user.id] ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                      </div>
                    </td>
                    <td className="px-4 py-3"><div className="flex items-center gap-1 text-slate-600 dark:text-slate-400"><Mail size={14} className="text-slate-400" /><span className="text-xs">{user.recoveryEmail || 'غير محدد'}</span></div></td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs" dir="ltr">{user.lastLogin || 'لم يسجل الدخول'}</td>
                    <td className="px-4 py-3"><span className={`font-medium text-xs ${user.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{user.status === 'active' ? 'نشط' : 'غير نشط'}</span></td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => openEditUser(user)} className="text-slate-400 hover:text-indigo-600 p-1"><Edit size={16} /></button>
                        {user.role !== 'admin' && <button onClick={() => handleDeleteUser(user.id)} className="text-slate-400 hover:text-rose-600 p-1"><Trash2 size={16} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'system' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
              <h3 className="font-bold text-slate-800 dark:text-white mb-4 text-lg">معلومات المكتب</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">تظهر على الفواتير والوثائق المطبوعة</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">اسم المكتب</label>
                  <input type="text" value={officeName} onChange={(e) => setOfficeName(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="مكتب الملك" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">رقم الهاتف (11 رقمًا)</label>
                  <input type="text" inputMode="numeric" maxLength={15} value={officePhone} onChange={(e) => setOfficePhone(e.target.value.replace(/\D/g, '').slice(0, 15))} className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" dir="ltr" placeholder="077… أو 7712345678" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">العنوان</label>
                  <textarea value={officeAddress} onChange={(e) => setOfficeAddress(e.target.value)} rows={2} className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" placeholder="العنوان للطباعة على الفواتير" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
              <h3 className="font-bold text-slate-800 dark:text-white mb-4 text-lg">مظهر الواجهة</h3>
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                <div>
                  <p className="font-medium text-slate-800 dark:text-white">الوضع الليلي</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">تفعيل الوضع الداكن للواجهة</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDarkMode(v => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-600'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <h3 className="font-bold text-slate-800 dark:text-white mb-4 text-lg">تنبيهات النظام</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">الحدود الدنيا التي تظهر عندها تنبيهات في لوحة التحكم</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                ['محفظة الإنترنت', earthlinkThreshold, setEarthlinkThreshold, 'د.ع'],
                ['محفظة سويج', swigThreshold, setSwigThreshold, 'د.ع'],
                ['محفظة كي', qiThreshold, setQiThreshold, 'د.ع'],
                ['عدد البطاقات', cardsThreshold, setCardsThreshold, 'بطاقة'],
                ['مخزون مواد الإنترنت', stockThreshold, setStockThreshold, 'وحدة'],
                ['مخزون مواد المكتب', materialsThreshold, setMaterialsThreshold, 'وحدة'],
              ].map(([label, value, setter, unit]: any, index) => (
                <div key={index} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600">
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">{label}</label>
                  <input type="number" value={value} onChange={(e) => setter(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" dir="ltr" />
                  {unit && <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">{unit}</span>}
                </div>
              ))}
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">اسم تقرير Switch والبطاقات المستقل</label>
              <input type="text" value={cardsReportName} onChange={(e) => setCardsReportName(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="قضاء علي الغربي SWG70" />
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={handleSaveSystemSettings} className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors">حفظ الإعدادات</button>
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <h3 className="font-bold text-slate-800 dark:text-white mb-2 text-lg">إدارة قوالب رسائل WhatsApp</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">يمكنك هنا تخصيص الرسائل التلقائية التي يتم إرسالها للزبائن. استخدم المتغيرات التالية:</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800 text-center">
                <code className="text-indigo-600 dark:text-indigo-400 font-bold">[Name]</code>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">اسم الزبون</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800 text-center">
                <code className="text-emerald-600 dark:text-emerald-400 font-bold">[Date]</code>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">تاريخ الانتهاء</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-lg border border-amber-100 dark:border-amber-800 text-center">
                <code className="text-amber-600 dark:text-amber-400 font-bold">[Amount]</code>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">المبلغ المالي</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-lg border border-purple-100 dark:border-purple-800 text-center">
                <code className="text-purple-600 dark:text-purple-400 font-bold">[Days]</code>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">عدد الأيام</p>
              </div>
            </div>

            {templatesLoading && (
              <div className="flex justify-center py-10 text-slate-400 italic">جاري تحميل القوالب...</div>
            )}

            {!templatesLoading && (
              <div className="space-y-8">
                {[
                  { key: 'internet_expiry_msg', label: 'تنبيه انتهاء اشتراك الإنترنت', desc: 'تظهر عند اقتراب موعد انتهاء باقة المشترك' },
                  { key: 'internet_debt_msg', label: 'تذكير ديون الإنترنت', desc: 'تظهر عند وجود مبالغ مستحقة على اشتراك الإنترنت' },
                  { key: 'office_debt_msg', label: 'تنبيه ديون المكتب', desc: 'تظهر في لوحة تنبيهات ديون قسم المكتب' },
                  { key: 'promo_msg', label: 'رسالة العروض الترويجية', desc: 'تستخدم لإرسال عروض عامة للزبائن' },
                ].map((item: any) => {
                  const t = templates.find((x: MessageTemplate) => x.key === item.key);
                  return (
                    <div key={item.key} className="relative group">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">{item.label}</label>
                          <p className="text-[11px] text-slate-500">{item.desc}</p>
                        </div>
                        <button
                          onClick={() => handleUpdateTemplate(item.key, t?.body || '')}
                          disabled={templatesSaving === item.key}
                          className="flex items-center gap-1.5 px-3 py-1 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          {templatesSaving === item.key ? <RotateCcw size={14} className="animate-spin" /> : <Save size={14} />}
                          حفظ
                        </button>
                      </div>
                      <textarea
                        value={t?.body || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTemplates((prev: MessageTemplate[]) => {
                            if (!prev.find((x: MessageTemplate) => x.key === item.key)) {
                              return [...prev, { key: item.key, body: val, id: 0, updatedAt: '' }];
                            }
                            return prev.map((x: MessageTemplate) => x.key === item.key ? { ...x, body: val } : x);
                          });
                        }}
                        className="w-full h-24 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                        placeholder="اكتب نص الرسالة هنا..."
                        dir="rtl"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex flex-wrap justify-between items-center gap-4">
            <h3 className="font-bold text-slate-800 dark:text-white">سجل الحركات</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={exportActivityLogToExcel}
                disabled={activityLogs.length === 0}
                className="text-sm px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Download size={16} />
                تحميل Excel
              </button>
              {currentUser?.role === 'admin' && (
                <select
                  value={activityFilterUser}
                  onChange={(e) => setActivityFilterUser(e.target.value === '' ? '' : Number(e.target.value))}
                  className="text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2"
                >
                  <option value="">جميع المستخدمين</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              )}
              <select
                value={activityFilterSection}
                onChange={(e) => setActivityFilterSection(e.target.value)}
                className="text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2"
              >
                <option value="">جميع الأقسام</option>
                {Object.entries(sectionLabelsLog).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            {activityLoading ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400">جاري تحميل سجل الحركات...</div>
            ) : (
              <table className="w-full text-right">
                <thead className="bg-white dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium">المستخدم</th>
                    <th className="px-4 py-3 font-medium">القسم</th>
                    <th className="px-4 py-3 font-medium">الإجراء</th>
                    <th className="px-4 py-3 font-medium">التفاصيل</th>
                    <th className="px-4 py-3 font-medium">التاريخ والوقت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-600 text-sm">
                  {activityLogs.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">لا توجد حركات مسجلة</td></tr>
                  ) : (
                    activityLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{log.userName || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{sectionLabelsLog[log.section] || log.section}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{actionLabelsLog[log.action] || log.action}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-xs truncate" title={log.details || ''}>{log.details || '-'}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs" dir="ltr">{log.createdAt ? new Date(log.createdAt).toLocaleString('ar-IQ') : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'audit' && isAdmin && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex justify-between items-center gap-4">
            <h3 className="font-bold text-slate-800 dark:text-white">سجل التدقيق</h3>
            <button
              onClick={() => { setAuditLoading(true); auditLogApi.getAll({ limit: 200 }).then(setAuditLogs).catch(() => setAuditLogs([])).finally(() => setAuditLoading(false)); }}
              className="text-sm px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2"
            >
              <RotateCcw size={15} /> تحديث
            </button>
          </div>
          <div className="overflow-x-auto">
            {auditLoading ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400">جاري تحميل سجل التدقيق...</div>
            ) : (
              <table className="w-full text-right">
                <thead className="bg-white dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium">التاريخ والوقت</th>
                    <th className="px-4 py-3 font-medium">البريد الإلكتروني</th>
                    <th className="px-4 py-3 font-medium">الإجراء</th>
                    <th className="px-4 py-3 font-medium">المسار</th>
                    <th className="px-4 py-3 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-600 text-sm">
                  {auditLogs.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">لا توجد سجلات تدقيق</td></tr>
                  ) : (
                    auditLogs.map((log) => {
                      const methodColor: Record<string, string> = {
                        POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                        PUT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                        PATCH: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                        DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                      };
                      const statusColor = log.status_code && log.status_code >= 400
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400';
                      return (
                        <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap" dir="ltr">
                            {log.created_at ? new Date(log.created_at).toLocaleString('ar-IQ') : '-'}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-xs" dir="ltr">
                            {log.user_email || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-bold ${methodColor[log.http_method] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                              {log.http_method}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs max-w-xs truncate font-mono" dir="ltr" title={log.path}>
                            {log.path}
                          </td>
                          <td className={`px-4 py-3 text-xs font-medium ${statusColor}`} dir="ltr">
                            {log.status_code ?? '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'backup' && isAdmin && (
        <div className="space-y-6">
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-950 dark:text-amber-100">
            <p className="font-bold mb-2">تنبيهات مهمة</p>
            <ul className="list-disc list-inside space-y-1.5 text-amber-900/90 dark:text-amber-200/90">
              <li>
                امتداد <span className="font-mono text-xs bg-white/60 dark:bg-white/10 px-1 rounded">.sql</span> هنا هو{' '}
                <strong>نسخة PostgreSQL الحقيقية</strong>: ملف نصي أنتجه أمر{' '}
                <span className="font-mono text-xs">pg_dump</span> (تنسيق Plain SQL). ليست قاعدة منفصلة عن PostgreSQL — هي قاعدة البيانات نفسها
                مُصدَّرة كنصوص SQL يعيد استيرادها <span className="font-mono text-xs">psql</span>.
              </li>
              <li>
                يتطلب الخادم أدوات PostgreSQL: <span className="font-mono text-xs bg-white/60 dark:bg-white/10 px-1 rounded">pg_dump</span> و
                <span className="font-mono text-xs bg-white/60 dark:bg-white/10 px-1 rounded mx-0.5">psql</span> (أو ضبط{' '}
                <span className="font-mono text-xs">PG_TOOLS_BIN</span> في <span className="font-mono text-xs">.env</span>).
              </li>
              <li>
                أسماء الملفات الجديدة تبدأ بـ{' '}
                <span className="font-mono text-xs">postgresql_king_office_backup_</span> ثم التاريخ والوقت. النسخ القديمة باسم{' '}
                <span className="font-mono text-xs">king_office_backup_*</span> ما زالت صالحة.
              </li>
              <li>
                <strong>الاسترجاع</strong> يعيد كتابة قاعدة البيانات. يُفضّل إيقاف الاستخدام مؤقتاً ثم إعادة تشغيل خادم الـ API.
              </li>
              <li>
                وقت الجدولة أدناه يعتمد على <strong>ساعة الخادم</strong> (الجهاز الذي يشغّل Python/FastAPI)، وليس بالضرورة منطقتك الزمنية في المتصفح.
              </li>
            </ul>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-4">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white text-lg">مكان الحفظ والجدولة التلقائية</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                المسار هو مجلد على <strong>جهاز الخادم</strong> (مسار مطلق مثل <span className="font-mono" dir="ltr">D:\Backups\king</span>). إذا تركته
                فارغاً يُستخدم الافتراضي أو <span className="font-mono text-xs">BACKUP_DIR</span> من <span className="font-mono text-xs">.env</span>.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">مسار المجلد للنسخ الاحتياطي</label>
                <input
                  type="text"
                  value={backupStoragePath}
                  onChange={(e) => setBackupStoragePath(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-mono"
                  dir="ltr"
                  placeholder="مثال: D:\backups\king_office — اتركه فارغاً للافتراضي"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">تكرار النسخ التلقائي</label>
                <select
                  value={backupSchedule}
                  onChange={(e) => setBackupSchedule(e.target.value as typeof backupSchedule)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                >
                  <option value="none">معطّل (يدوي فقط)</option>
                  <option value="daily">يومي</option>
                  <option value="weekly">أسبوعي</option>
                  <option value="monthly">شهري</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">وقت التنفيذ (ساعة الخادم)</label>
                <input
                  type="time"
                  value={backupScheduleTime}
                  onChange={(e) => setBackupScheduleTime(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>
              {backupSchedule === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">يوم الأسبوع</label>
                  <select
                    value={backupScheduleWeekday}
                    onChange={(e) => setBackupScheduleWeekday(Number(e.target.value))}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  >
                    {weekdayOptions.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {backupSchedule === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">يوم الشهر (1–28)</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={backupScheduleMonthDay}
                    onChange={(e) => setBackupScheduleMonthDay(Number(e.target.value) || 1)}
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    dir="ltr"
                  />
                </div>
              )}
            </div>
            {backupLastRun && (
              <p className="text-xs text-slate-500 dark:text-slate-400" dir="ltr">
                آخر نسخ تلقائي (إن وُجد): {new Date(backupLastRun).toLocaleString('ar-IQ')}
              </p>
            )}
            <button
              type="button"
              onClick={handleSaveBackupConfig}
              disabled={backupCfgSaving}
              className="px-5 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-600 text-white text-sm font-medium hover:bg-slate-900 dark:hover:bg-slate-500 disabled:opacity-50"
            >
              {backupCfgSaving ? 'جاري الحفظ...' : 'حفظ إعدادات المسار والجدولة'}
            </button>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white text-lg">إنشاء نسخة احتياطية</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  لقطة PostgreSQL كاملة عبر <span className="font-mono">pg_dump</span> (ملف SQL نصي) — يُحفظ في المجلد المحدد أعلاه.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCreateBackup}
                  disabled={backupCreating || backupDownloading}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Database size={18} />
                  {backupCreating ? 'جاري الإنشاء...' : 'نسخ احتياطي الآن'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadNow}
                  disabled={backupCreating || backupDownloading}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={18} />
                  {backupDownloading ? 'جاري التحميل...' : 'تحميل لجهازي'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <h3 className="font-bold text-slate-800 dark:text-white text-lg mb-1">استرجاع من ملف على جهازك</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              اختر ملف <span className="font-mono">.sql</span> (مثلاً نسخة محمّلة سابقاً). الحد الأقصى للحجم 500 ميجابايت.
            </p>
            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700">
              <Upload size={18} />
              اختيار ملف SQL
              <input
                type="file"
                accept=".sql,application/sql,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) setRestoreModal({ kind: 'upload', file: f });
                }}
              />
            </label>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex flex-wrap justify-between items-center gap-3">
              <h3 className="font-bold text-slate-800 dark:text-white">النسخ المحفوظة على الخادم</h3>
              <button
                type="button"
                onClick={() => {
                  setBackupsLoading(true);
                  backupApi
                    .list()
                    .then(setBackups)
                    .catch(() => addNotification?.('النسخ الاحتياطي', 'تعذر التحديث', 'alert'))
                    .finally(() => setBackupsLoading(false));
                }}
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                تحديث القائمة
              </button>
            </div>
            <div className="overflow-x-auto">
              {backupsLoading ? (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400">جاري التحميل...</div>
              ) : backups.length === 0 ? (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400">لا توجد نسخ بعد. استخدم «نسخ احتياطي الآن».</div>
              ) : (
                <table className="w-full text-right">
                  <thead className="bg-white dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 text-slate-500 dark:text-slate-300 text-sm">
                    <tr>
                      <th className="px-4 py-3 font-medium">اسم الملف (يضم التاريخ والوقت)</th>
                      <th className="px-4 py-3 font-medium">الحجم</th>
                      <th className="px-4 py-3 font-medium">آخر تعديل</th>
                      <th className="px-4 py-3 font-medium text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-600 text-sm">
                    {backups.map((b) => (
                      <tr key={b.filename} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300" dir="ltr">
                          {b.filename}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatBackupSize(b.size_bytes)}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs" dir="ltr">
                          {b.modified_at ? new Date(b.modified_at).toLocaleString('ar-IQ') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-center gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await backupApi.download(b.filename);
                                  addNotification?.('النسخ الاحتياطي', 'تم بدء التحميل', 'info');
                                } catch (err: unknown) {
                                  const msg =
                                    err instanceof ApiRequestError ? err.message : 'فشل التحميل';
                                  addNotification?.('النسخ الاحتياطي', msg, 'alert');
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-100 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-500"
                            >
                              <Download size={14} />
                              تحميل
                            </button>
                            <button
                              type="button"
                              onClick={() => setRestoreModal({ kind: 'server', filename: b.filename })}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 text-xs font-medium hover:bg-amber-200 dark:hover:bg-amber-900/60"
                            >
                              <RotateCcw size={14} />
                              استرجاع
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBackup(b.filename)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-950/50"
                            >
                              <Trash2 size={14} />
                              حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {restoreModal && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-800 dark:text-white">تأكيد الاسترجاع</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {restoreModal.kind === 'server' ? (
                <>
                  سيتم استبدال قاعدة البيانات الحالية بالمحتوى من الملف:{' '}
                  <span className="font-mono text-xs break-all" dir="ltr">
                    {restoreModal.filename}
                  </span>
                </>
              ) : (
                <>
                  سيتم الاسترجاع من الملف:{' '}
                  <span className="font-mono text-xs break-all" dir="ltr">
                    {restoreModal.file.name}
                  </span>
                </>
              )}
            </p>
            <p className="text-sm text-rose-600 dark:text-rose-400 font-medium">
              لا يمكن التراجع. تأكد من صحة النسخة قبل المتابعة.
            </p>
            {restoreBusy && restoreStartedAt != null && (
              <div
                className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-900 dark:text-amber-100"
                dir="rtl"
              >
                <p className="font-medium">جاري الاسترجاع على الخادم…</p>
                <p className="mt-1 text-xs opacity-90">
                  مضت{' '}
                  <span className="font-mono font-bold" dir="ltr">
                    {restoreElapsedTick}
                  </span>{' '}
                  ثانية. قد تستغرق القواعد الكبيرة عشرات الدقائق. لن يُسجَّل خروجك تلقائياً أثناء الانتظار.
                </p>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                اكتب <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">{RESTORE_CONFIRM_PHRASE}</span> للمتابعة
              </label>
              <input
                type="text"
                value={restoreTyping}
                onChange={(e) => setRestoreTyping(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                placeholder={RESTORE_CONFIRM_PHRASE}
                autoComplete="off"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRestoreModal(null);
                  setRestoreTyping('');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={restoreTyping.trim() !== RESTORE_CONFIRM_PHRASE || restoreBusy}
                onClick={runRestore}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {restoreBusy ? 'جاري الاسترجاع...' : 'تنفيذ الاسترجاع'}
              </button>
            </div>
          </div>
        </div>
      )}

      {(isAddUserOpen || isEditUserOpen) && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-4xl overflow-hidden max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50">
              <h3 className="font-bold text-slate-800 dark:text-white">{selectedUser ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}</h3>
              <button type="button" onClick={closeUserModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X size={20} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); (selectedUser ? handleEditUser : handleAddUser)(); }} className="flex flex-col flex-1 min-h-0">
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">الاسم</label>
                  <input value={userName} onChange={(e) => setUserName(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">البريد الإلكتروني</label>
                  <input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">الدور</label>
                  <select value={userRole} onChange={(e) => setUserRole(e.target.value as any)} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100">
                    <option value="user">موظف</option>
                    <option value="admin">مدير عام</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{selectedUser ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'}</label>
                  <div className="relative">
                    <input type={showUserPassword ? "text" : "password"} value={userPassword} onChange={(e) => setUserPassword(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 pr-10 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100" />
                    <button type="button" onClick={() => setShowUserPassword(!showUserPassword)} className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-600" title={showUserPassword ? "إخفاء" : "إظهار"}>
                      {showUserPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">بريد الاستعادة</label>
                  <input type="email" value={userRecoveryEmail} onChange={(e) => setUserRecoveryEmail(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100" dir="ltr" />
                </div>
              </div>

              {userRole === 'user' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    حدد الأقسام التي يمكن للمستخدم الوصول إليها، ثم حدد الصلاحيات التفصيلية داخل كل قسم. وضع علامة ✓ يمنح الصلاحية.
                  </p>
                  {permissionSections.map((sectionKey) => {
                    const fields = featureLabels[sectionKey];
                    const hasAccess = !!userPermissions.sections?.[sectionKey];
                    const allChecked = fields ? Object.keys(fields).every(k => !!userPermissions?.[sectionKey]?.[k]) : false;
                    const someChecked = fields ? Object.keys(fields).some(k => !!userPermissions?.[sectionKey]?.[k]) : false;
                    return (
                      <div key={sectionKey} className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600">
                          <label className="flex items-center gap-3 cursor-pointer flex-1">
                            <input type="checkbox" checked={hasAccess} onChange={() => toggleSectionPermission(sectionKey)} className="w-4 h-4 text-indigo-600 rounded" />
                            <span className="font-bold text-slate-800 dark:text-white">{sectionLabels[sectionKey] || sectionKey}</span>
                          </label>
                          {hasAccess && fields && Object.keys(fields).length > 0 && (
                            <button type="button" onClick={() => toggleAllSectionFeatures(sectionKey, !allChecked)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                              {allChecked ? 'إلغاء الكل' : 'تحديد الكل'}
                            </button>
                          )}
                        </div>
                        {hasAccess && fields && Object.keys(fields).length > 0 && (
                          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {Object.entries(fields).map(([fieldKey, label]) => (
                              <label key={fieldKey} className="flex items-center gap-2 text-sm border border-slate-100 dark:border-slate-600 rounded-lg p-3 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer">
                                <input type="checkbox" checked={!!userPermissions?.[sectionKey]?.[fieldKey]} onChange={() => toggleFeaturePermission(sectionKey, fieldKey)} className="w-4 h-4 text-indigo-600 rounded" />
                                <span>{label}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-700/50">
              <button type="button" onClick={closeUserModal} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-500">إلغاء</button>
              <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">{selectedUser ? 'حفظ التعديلات' : 'إضافة المستخدم'}</button>
            </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
