'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Sun,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import WhaleLogo from '@/components/whale-logo';
import { Field, ModalHeader, PanelTitle } from '@/components/business-ui';
import ContractDetails from '@/features/contracts/contract-details';
import ContractFormDialog from '@/features/contracts/contract-form-dialog';
import ManualReminderDialog from '@/features/contracts/manual-reminder-dialog';
import CustomerFormDialog from '@/features/customers/customer-form-dialog';
import CustomerWorkspace from '@/features/customers/customer-workspace';
import DashboardOverview from '@/features/dashboard/dashboard-overview';
import PaymentDialog from '@/features/payments/payment-dialog';
import PaymentHistory from '@/features/payments/payment-history';
import EditPaymentDialog from '@/features/payments/edit-payment-dialog';
import ReceiptModal from '@/features/receipts/receipt-modal';
import ReminderCenter from '@/features/reminders/reminder-center';
import ReportsSection from '@/features/reports/reports-section';
import { baghdadToday, indexPaymentsByContract, summarizeContract } from '@/lib/finance';
import { reminderBadgeCount } from '@/lib/reminders';
import {
  archiveContract,
  cancelPayment,
  deleteCustomerPermanently,
  getDashboard,
  restoreContract,
  updateSettings,
} from '@/lib/sheets';
import type {
  Contract,
  ContractSummary,
  ContractView,
  Customer,
  DashboardSummary,
  Payment,
  Settings,
} from '@/types/domain';

type Section = 'dashboard' | 'customers' | 'reminders' | 'payments' | 'reports' | 'settings';

const today = baghdadToday();
const emptySummary: DashboardSummary = {
  total_principal: 0,
  total_contract_value: 0,
  total_received: 0,
  total_remaining: 0,
  total_expected_profit: 0,
  received_this_month: 0,
  customers_count: 0,
  active_contracts_count: 0,
  completed_contracts_count: 0,
  overdue_contracts_count: 0,
};

const navigation: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { id: 'customers', label: 'العملاء', icon: UsersRound },
  { id: 'reminders', label: 'التذكيرات', icon: BellRing },
  { id: 'payments', label: 'الدفعات', icon: WalletCards },
  { id: 'reports', label: 'التقارير', icon: FileText },
  { id: 'settings', label: 'الإعدادات', icon: SettingsIcon },
];

export default function DashboardApp({ username }: { username: string }) {
  const [section, setSection] = useState<Section>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [settings, setSettings] = useState<Settings>({ system_name: 'الحوت', capital: 0, default_profit_percent: 10, default_installment_type: 'monthly' });
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [query, setQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [customerModal, setCustomerModal] = useState<Customer | null | undefined>(undefined);
  const [contractModal, setContractModal] = useState<{ contract: Contract | null; customerId?: number } | undefined>(undefined);
  const [paymentContract, setPaymentContract] = useState<ContractView | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Payment | null>(null);
  const [editPaymentTarget, setEditPaymentTarget] = useState<Payment | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ContractView | null>(null);
  const [reminderTarget, setReminderTarget] = useState<ContractView | null>(null);
  const [deleteCustomerTarget, setDeleteCustomerTarget] = useState<Customer | null>(null);
  const [receipt, setReceipt] = useState<{ customer: Customer; contract: Contract; payment: Payment; summary: ContractSummary; autoPrint?: boolean } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4_000);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const dashboard = await getDashboard();
      setSettings(dashboard.settings);
      setSummary(dashboard.summary);
      setCustomers(dashboard.customers);
      setContracts(dashboard.contracts);
      setPayments(dashboard.payments);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'تعذر جلب البيانات', 'error');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);

  const contractViews = useMemo<ContractView[]>(() => {
    const customersById = new Map(customers.map((customer) => [customer.id, customer]));
    const paymentsByContract = indexPaymentsByContract(payments);
    return contracts.flatMap((contract) => {
      const customer = customersById.get(contract.customer_id);
      if (!customer) return [];
      const preview = summarizeContract(contract, paymentsByContract.get(contract.id) || [], today);
      return [{ ...contract, customer, incomplete: !contract.first_due_date, summary: {
        ...preview,
        profitAmount: contract.profit_amount,
        contractTotal: contract.contract_total,
        installmentValue: contract.installment_value,
        paidAmount: contract.paid_amount,
        remaining: contract.remaining_amount,
        currentInstallmentPaid: contract.current_installment_paid,
        currentInstallmentRemaining: contract.current_installment_remaining,
        nextDueDate: contract.next_due_date || null,
        expectedEndDate: contract.expected_end_date,
        status: contract.status,
      } }];
    });
  }, [contracts, customers, payments]);

  const selectedContract = contractViews.find((contract) => contract.id === selectedContractId) || null;
  const editPaymentContract = editPaymentTarget ? contractViews.find((contract) => contract.id === editPaymentTarget.contract_id) || null : null;
  const reminderCount = useMemo(
    () => reminderBadgeCount(customers, contracts, today),
    [customers, contracts],
  );

  function go(next: Section) {
    setSection(next); setSelectedContractId(null); setSidebarOpen(false);
    if (next !== 'customers') setSelectedCustomerId(null);
  }

  function showReceipt(payment: Payment, print = false) {
    const contract = payment.contract_after || contracts.find((item) => item.id === payment.contract_id);
    const customer = customers.find((item) => item.id === payment.customer_id);
    if (!contract || !customer) return notify('تعذر تجهيز بيانات الوصل', 'error');
    const rows = indexPaymentsByContract(payments).get(contract.id) || [];
    const receiptRows: Payment[] = payment.paid_after !== undefined
      ? [{ ...payment, id: -1, amount: payment.paid_after, status: 'active' }]
      : rows.some((row) => row.id === payment.id) ? rows : [...rows, payment];
    const preview = summarizeContract(contract, receiptRows, today);
    const contractSummary: ContractSummary = payment.contract_after ? {
      ...preview,
      profitAmount: contract.profit_amount,
      contractTotal: contract.contract_total,
      installmentValue: contract.installment_value,
      paidAmount: contract.paid_amount,
      remaining: contract.remaining_amount,
      currentInstallmentPaid: contract.current_installment_paid,
      currentInstallmentRemaining: contract.current_installment_remaining,
      nextDueDate: contract.next_due_date || null,
      expectedEndDate: contract.expected_end_date,
      status: contract.status,
    } : preview;
    setReceipt({ customer, contract, payment, summary: contractSummary, autoPrint: print });
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  }

  if (loading) return <LoadingScreen />;

  return <div className="app-shell">
    <aside className={sidebarOpen ? 'sidebar sidebar-open' : 'sidebar'}>
      <div className="flex items-center justify-between px-5 py-7"><WhaleLogo /><button className="icon-button lg:hidden" onClick={() => setSidebarOpen(false)}><X size={19} /></button></div>
      <nav className="sidebar-nav">{navigation.map((item) => <button key={item.id} className={section === item.id ? 'nav-item nav-item-active' : 'nav-item'} onClick={() => go(item.id)}><item.icon size={19} />{item.label}{item.id === 'reminders' && reminderCount > 0 && <b>{reminderCount}</b>}</button>)}</nav>
      <div className="mt-auto space-y-2 p-4">
        <button className="nav-item" onClick={() => setDark((value) => !value)}>{dark ? <Sun size={19} /> : <Moon size={19} />}{dark ? 'الوضع النهاري' : 'الوضع الليلي'}</button>
        <button className="nav-item text-rose-300" onClick={logout}><LogOut size={19} /> تسجيل الخروج</button>
        <div className="sidebar-user"><span className="grid size-9 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><UserRound size={17} /></span><span><small>مدير النظام</small><strong>{username}</strong></span></div>
      </div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}

    <main className="main-content">
      <header className="topbar">
        <div className="flex items-center gap-3"><button className="icon-button lg:hidden" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><div><p className="text-xs font-bold text-cyan-600">لوحة التحكم</p><h1 className="text-xl font-black">{selectedContract ? 'تفاصيل العقد' : navigation.find((item) => item.id === section)?.label}</h1></div></div>
        <div className="top-actions"><button className="icon-button" onClick={() => void load(true)} disabled={refreshing}><RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} /></button><button className="secondary-button compact" onClick={() => setCustomerModal(null)}><Plus size={16} /> عميل</button></div>
      </header>
      <div className="content-wrap">
        {selectedContract ? <ContractDetails
          contract={selectedContract}
          payments={(indexPaymentsByContract(payments).get(selectedContract.id) || [])}
          today={today}
          onBack={() => { setSelectedContractId(null); setSelectedCustomerId(selectedContract.customer_id); setSection('customers'); }}
          onPay={() => setPaymentContract(selectedContract)}
          onEdit={() => setContractModal({ contract: selectedContract, customerId: selectedContract.customer_id })}
          onReceipt={(payment) => showReceipt(payment)}
          onCancel={setCancelTarget}
          onEditPayment={setEditPaymentTarget}
          onArchive={() => setArchiveTarget(selectedContract)}
          onReminder={() => setReminderTarget(selectedContract)}
          onWhatsAppError={(message) => notify(message, 'error')}
        /> : <>
          {section === 'dashboard' && <DashboardOverview summary={summary} contracts={contractViews} payments={payments} today={today} onPay={setPaymentContract} onNavigate={go} />}
          {section === 'customers' && <CustomerWorkspace customers={customers} contracts={contractViews} query={query} selectedCustomerId={selectedCustomerId} onQuery={setQuery} onSelectCustomer={setSelectedCustomerId} onEditCustomer={setCustomerModal} onDeleteCustomer={setDeleteCustomerTarget} onAddContract={(customer) => setContractModal({ contract: null, customerId: customer.id })} onOpenContract={(contract) => setSelectedContractId(contract.id)} onPay={setPaymentContract} />}
          {section === 'reminders' && <ReminderCenter customers={customers} contracts={contractViews} today={today} onPay={setPaymentContract} notify={notify} />}
          {section === 'payments' && <PaymentHistory payments={payments} customers={customers} contracts={contracts} onReceipt={(payment) => showReceipt(payment)} onEdit={setEditPaymentTarget} onCancel={setCancelTarget} />}
          {section === 'reports' && <ReportsSection customers={customers} contracts={contractViews} payments={payments} today={today} />}
          {section === 'settings' && <SettingsSection settings={settings} onSaved={async () => { notify('تم حفظ الإعدادات'); await load(true); }} />}
        </>}
      </div>
    </main>

    <nav className="bottom-nav">{navigation.filter((item) => item.id !== 'settings').map((item) => <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => go(item.id)}><item.icon size={20} /><span>{item.label}</span></button>)}</nav>

    {customerModal !== undefined && <CustomerFormDialog customer={customerModal} onClose={() => setCustomerModal(undefined)} onSaved={async (saved) => { setCustomerModal(undefined); setSelectedCustomerId(saved.id); setSection('customers'); notify(customerModal ? 'تم تحديث بيانات العميل' : 'تمت إضافة العميل — يمكنك إضافة عقد الآن'); await load(true); }} />}
    {contractModal !== undefined && <ContractFormDialog value={contractModal} customers={customers.filter((customer) => !customer.archived)} defaults={settings} today={today} onClose={() => setContractModal(undefined)} onSaved={async (saved) => { setContractModal(undefined); setSelectedContractId(saved.id); setSelectedCustomerId(saved.customer_id); setSection('customers'); notify(contractModal.contract ? 'تم تحديث العقد' : 'تمت إضافة العقد'); await load(true); }} />}
    {paymentContract && <PaymentDialog contract={paymentContract} today={today} onClose={() => setPaymentContract(null)} onRecorded={(saved) => { setPayments((current) => [...current, saved]); if (saved.contract_after) setContracts((current) => current.map((contract) => contract.id === saved.contract_id ? saved.contract_after! : contract)); void load(true); }} onReceipt={(payment, print) => showReceipt(payment, print)} />}
    {editPaymentTarget && editPaymentContract && <EditPaymentDialog payment={editPaymentTarget} contract={editPaymentContract} onClose={() => setEditPaymentTarget(null)} onSaved={async (saved) => { setEditPaymentTarget(null); setPayments((current) => current.map((payment) => payment.id === saved.id ? saved : payment)); if (saved.contract_after) setContracts((current) => current.map((contract) => contract.id === saved.contract_id ? saved.contract_after! : contract)); notify('تم تعديل الدفعة وتحديث أرصدة العقد'); await load(true); }} />}
    {reminderTarget && <ManualReminderDialog contract={reminderTarget} onClose={() => setReminderTarget(null)} onSaved={async (saved) => { setReminderTarget(null); setContracts((current) => current.map((contract) => contract.id === saved.id ? saved : contract)); notify(saved.reminder_mode === 'manual' ? 'تم حفظ موعد التذكير اليدوي' : 'تمت العودة إلى موعد التذكير التلقائي'); await load(true); }} />}
    {cancelTarget && <CancelPaymentDialog payment={cancelTarget} onClose={() => setCancelTarget(null)} onDone={async () => { setCancelTarget(null); notify('أُلغيت الدفعة وأعيد حساب العقد'); await load(true); }} />}
    {archiveTarget && <ConfirmDialog title={archiveTarget.status === 'مؤرشف' ? 'استرجاع العقد' : 'أرشفة العقد'} message={`سيبقى العقد ${archiveTarget.id} ودفعاته محفوظين بالكامل.`} confirmLabel={archiveTarget.status === 'مؤرشف' ? 'استرجاع' : 'أرشفة'} onClose={() => setArchiveTarget(null)} onConfirm={async () => { if (archiveTarget.status === 'مؤرشف') await restoreContract(archiveTarget.id); else await archiveContract(archiveTarget.id); setArchiveTarget(null); setSelectedContractId(null); notify('تم تحديث حالة العقد'); await load(true); }} />}
    {deleteCustomerTarget && <ConfirmDialog title="حذف العميل نهائياً" message="سيتم حذف العميل وجميع عقوده ودفعاته نهائياً. لا يمكن التراجع عن هذه العملية." confirmLabel="حذف نهائي" onClose={() => setDeleteCustomerTarget(null)} onConfirm={async () => { const customerId = deleteCustomerTarget.id; const contractIds = new Set(contracts.filter((contract) => contract.customer_id === customerId).map((contract) => contract.id)); const deleted = await deleteCustomerPermanently(customerId); setCustomers((current) => current.filter((customer) => customer.id !== customerId)); setContracts((current) => current.filter((contract) => contract.customer_id !== customerId)); setPayments((current) => current.filter((payment) => payment.customer_id !== customerId && !contractIds.has(payment.contract_id))); setDeleteCustomerTarget(null); setSelectedCustomerId(null); setSelectedContractId(null); notify(`حُذف العميل مع ${deleted.deleted_contracts} عقد و${deleted.deleted_payments} دفعة`); await load(true); }} />}
    {receipt && <ReceiptModal {...receipt} settings={settings} notify={notify} onClose={() => setReceipt(null)} />}
    {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
  </div>;
}

function LoadingScreen() {
  return <main className="grid min-h-screen place-items-center bg-slate-950 text-white"><div className="text-center"><div className="mx-auto mb-5 w-fit"><WhaleLogo /></div><LoaderCircle className="mx-auto animate-spin text-cyan-300" /><p className="mt-3 text-sm text-slate-400">نجهّز لوحة الحوت...</p></div></main>;
}

function SettingsSection({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); const form = new FormData(event.currentTarget);
    try { await updateSettings({ system_name: form.get('system_name'), receipt_footer: form.get('receipt_footer') }); onSaved(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر حفظ الإعدادات'); }
    finally { setSaving(false); }
  }
  return <section className="panel max-w-3xl"><PanelTitle title="إعدادات النظام" subtitle="هوية النظام والوصل" icon={SettingsIcon} /><form className="form-grid mt-6" onSubmit={submit}><Field label="اسم النظام"><input name="system_name" defaultValue={settings.system_name} required /></Field><Field label="عبارة أسفل الوصل" wide><textarea name="receipt_footer" defaultValue={settings.receipt_footer} rows={3} /></Field>{error && <p className="error-banner form-wide">{error}</p>}<div className="form-wide flex justify-end"><button className="primary-button" disabled={saving}>{saving && <LoaderCircle className="animate-spin" size={17} />}حفظ الإعدادات</button></div></form></section>;
}

function CancelPaymentDialog({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(''); const form = new FormData(event.currentTarget); try { await cancelPayment(payment.id, String(form.get('reason'))); onDone(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر إلغاء الدفعة'); } finally { setSaving(false); } }
  return <div className="modal-backdrop"><div className="modal-panel max-w-lg"><ModalHeader title="إلغاء دفعة مالية" onClose={onClose} /><p className="mb-4 text-sm leading-7 text-slate-500">لن تُحذف الدفعة. ستبقى في السجل كملغاة ويعاد حساب العقد بدونها.</p><form onSubmit={submit}><Field label="سبب الإلغاء"><textarea name="reason" rows={4} minLength={3} required /></Field>{error && <p className="error-banner mt-3">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>تراجع</button><button className="danger-button" disabled={saving}>تأكيد الإلغاء</button></div></form></div></div>;
}

function ConfirmDialog({ title, message, confirmLabel, onClose, onConfirm }: { title: string; message: string; confirmLabel: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return <div className="modal-backdrop"><div className="modal-panel max-w-md"><ModalHeader title={title} onClose={onClose} /><p className="text-sm leading-7 text-slate-500">{message}</p>{error && <p className="error-banner mt-3">{error}</p>}<div className="modal-actions"><button className="secondary-button" onClick={onClose}>تراجع</button><button className="danger-button" disabled={saving} onClick={async () => { setSaving(true); setError(''); try { await onConfirm(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر تنفيذ العملية'); } finally { setSaving(false); } }}>{confirmLabel}</button></div></div></div>;
}
