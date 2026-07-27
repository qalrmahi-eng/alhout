'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Archive,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileText,
  Gauge,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  Moon,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  Sun,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import WhaleLogo from '@/components/whale-logo';
import ReceiptModal from '@/features/receipts/receipt-modal';
import {
  buildCustomerFormPayload,
  customerDeliveryInputValue,
  customerFirstDueInputValue,
} from '@/lib/customer-form';
import { formatBaghdadDateTime } from '@/lib/dates';
import {
  addCustomer,
  addPayment,
  archiveCustomer,
  cancelPayment,
  customerAvatar,
  customerMatchesSearch,
  getDashboard,
  restoreCustomer,
  updateCustomer,
  updateSettings,
} from '@/lib/sheets';
import { baghdadToday, summarizeContract, validatePayment } from '@/lib/finance';
import type {
  ContractSummary,
  Customer,
  CustomerStatus,
  Payment,
  Settings,
} from '@/types/domain';

type Section = 'dashboard' | 'customers' | 'dues' | 'payments' | 'reports' | 'settings';
type CustomerView = Customer & { summary: ContractSummary; incomplete: boolean };
type DashboardStats = {
  capital: number;
  available: number;
  receivables: number;
  expectedProfit: number;
  collected: number;
  late: number;
  active: number;
};

const money = (value: number) => `${new Intl.NumberFormat('ar-IQ').format(value)} د.ع`;
const dateText = (value?: string | null) => value || '—';
const today = baghdadToday();

const navigation: { id: Section; label: string; icon: typeof Gauge }[] = [
  { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { id: 'customers', label: 'العملاء', icon: UsersRound },
  { id: 'dues', label: 'الاستحقاقات', icon: CalendarClock },
  { id: 'payments', label: 'الدفعات', icon: WalletCards },
  { id: 'reports', label: 'التقارير', icon: BarChart3 },
  { id: 'settings', label: 'الإعدادات', icon: SettingsIcon },
];

export default function DashboardApp({ username }: { username: string }) {
  const [section, setSection] = useState<Section>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    system_name: 'الحوت',
    capital: 0,
    default_profit_percent: 10,
    default_installment_type: 'monthly',
  });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | 'الكل'>('الكل');
  const [customerModal, setCustomerModal] = useState<Customer | null | undefined>(undefined);
  const [paymentCustomer, setPaymentCustomer] = useState<CustomerView | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerView | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Payment | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CustomerView | null>(null);
  const [receipt, setReceipt] = useState<{
    customer: Customer;
    payment: Payment;
    summary: ContractSummary;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function notify(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4_000);
  }

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const dashboard = await getDashboard();
      setSettings(dashboard.settings);
      setCustomers(dashboard.customers);
      setPayments(dashboard.payments);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'تعذر جلب البيانات', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // The first authenticated load runs once; later refreshes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const customerViews = useMemo<CustomerView[]>(
    () =>
      customers.map((customer) => ({
        ...customer,
        summary: summarizeContract(customer, payments, today),
        incomplete: !customer.installment_type || !customer.first_due_date,
      })),
    [customers, payments],
  );

  const filteredCustomers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return customerViews.filter((customer) => {
      const matchesSearch =
        !normalized ||
        customerMatchesSearch(customer, normalized);
      const matchesStatus = statusFilter === 'الكل' || customer.summary.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [customerViews, query, statusFilter]);

  const stats = useMemo(() => {
    const visible = customerViews.filter((customer) => customer.summary.status !== 'مؤرشف');
    const principal = visible.reduce((sum, customer) => sum + customer.principal, 0);
    const activePayments = payments.filter((payment) => (payment.status || 'active') === 'active');
    return {
      capital: settings.capital,
      available: settings.capital - principal,
      receivables: visible.reduce((sum, customer) => sum + customer.summary.remaining, 0),
      expectedProfit: visible.reduce((sum, customer) => sum + customer.summary.profitAmount, 0),
      collected: activePayments.reduce((sum, payment) => sum + payment.amount, 0),
      late: visible.filter((customer) => customer.summary.status === 'متأخر').length,
      active: visible.filter((customer) => customer.summary.status !== 'مكتمل').length,
    };
  }, [customerViews, payments, settings.capital]);

  const chartData = useMemo(() => {
    const months = new Map<string, number>();
    payments
      .filter((payment) => (payment.status || 'active') === 'active')
      .forEach((payment) => {
        const month = (payment.payment_date || payment.created_at || '').slice(0, 7);
        if (month) months.set(month, (months.get(month) || 0) + payment.amount);
      });
    return [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, amount]) => ({ month, amount }));
  }, [payments]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  }

  function go(next: Section) {
    setSection(next);
    setSidebarOpen(false);
  }

  if (loading) return <LoadingScreen />;

  return (
    <div className="app-shell">
      <aside className={sidebarOpen ? 'sidebar sidebar-open' : 'sidebar'}>
        <div className="flex items-center justify-between px-5 py-7">
          <WhaleLogo />
          <button className="icon-button lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={19} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={section === item.id ? 'nav-item nav-item-active' : 'nav-item'}
              onClick={() => go(item.id)}
            >
              <item.icon size={19} />
              {item.label}
              {item.id === 'dues' && stats.late > 0 && <b>{stats.late}</b>}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-2 p-4">
          <button className="nav-item" onClick={() => setDark((value) => !value)}>
            {dark ? <Sun size={19} /> : <Moon size={19} />}
            {dark ? 'الوضع النهاري' : 'الوضع الليلي'}
          </button>
          <button className="nav-item text-rose-300" onClick={logout}>
            <LogOut size={19} /> تسجيل الخروج
          </button>
          <div className="sidebar-user">
            <span className="grid size-9 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
              <UserRound size={17} />
            </span>
            <span><small>مدير النظام</small><strong>{username}</strong></span>
          </div>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button className="icon-button lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu size={21} />
            </button>
            <div>
              <p className="text-xs font-bold text-cyan-600">لوحة التحكم</p>
              <h1 className="text-xl font-black">{navigation.find((item) => item.id === section)?.label}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-slate-500 sm:block">
              {new Date().toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad', dateStyle: 'full' })}
            </span>
            <button className="icon-button" onClick={() => void load(true)} disabled={refreshing}>
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button className="primary-button compact" onClick={() => setCustomerModal(null)}>
              <Plus size={17} /> عميل جديد
            </button>
          </div>
        </header>

        <div className="content-wrap">
          {section === 'dashboard' && (
            <DashboardSection
              stats={stats}
              chartData={chartData}
              customers={customerViews}
              onPay={setPaymentCustomer}
              onCustomers={() => go('customers')}
            />
          )}
          {section === 'customers' && (
            <CustomersSection
              customers={filteredCustomers}
              query={query}
              status={statusFilter}
              onQuery={setQuery}
              onStatus={setStatusFilter}
              onSelect={setSelectedCustomer}
              onPay={setPaymentCustomer}
              onEdit={(customer) => setCustomerModal(customer)}
              onArchive={setArchiveTarget}
              onRestore={async (customer) => {
                try {
                  await restoreCustomer(customer.id);
                  notify('تم استرجاع العميل');
                  await load(true);
                } catch (error) {
                  notify(error instanceof Error ? error.message : 'تعذر الاسترجاع', 'error');
                }
              }}
            />
          )}
          {section === 'dues' && (
            <DuesSection customers={customerViews} onPay={setPaymentCustomer} />
          )}
          {section === 'payments' && (
            <PaymentsSection
              payments={payments}
              customers={customerViews}
              onReceipt={(payment) => {
                const customer = customerViews.find((item) => item.id === payment.customer_id);
                if (customer) setReceipt({ customer, payment, summary: customer.summary });
              }}
              onCancel={setCancelTarget}
            />
          )}
          {section === 'reports' && (
            <ReportsSection stats={stats} customers={customerViews} payments={payments} />
          )}
          {section === 'settings' && (
            <SettingsSection
              settings={settings}
              dark={dark}
              onDark={setDark}
              onSaved={async () => {
                notify('تم حفظ الإعدادات');
                await load(true);
              }}
            />
          )}
        </div>
      </main>

      <nav className="bottom-nav">
        {navigation.slice(0, 5).map((item) => (
          <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => go(item.id)}>
            <item.icon size={20} /><span>{item.label}</span>
          </button>
        ))}
      </nav>

      {customerModal !== undefined && (
        <CustomerForm
          customer={customerModal}
          defaults={settings}
          onClose={() => setCustomerModal(undefined)}
          onSaved={async () => {
            setCustomerModal(undefined);
            notify(customerModal ? 'تم تحديث بيانات العميل' : 'تمت إضافة العميل');
            await load(true);
          }}
        />
      )}
      {paymentCustomer && (
        <PaymentForm
          customer={paymentCustomer}
          onClose={() => setPaymentCustomer(null)}
          onSaved={async (saved) => {
            const nextPayments = [...payments, saved];
            const summary = summarizeContract(paymentCustomer, nextPayments, today);
            setPayments(nextPayments);
            setPaymentCustomer(null);
            setReceipt({ customer: paymentCustomer, payment: saved, summary });
            notify('تم تسجيل الدفعة');
            await load(true);
          }}
        />
      )}
      {selectedCustomer && (
        <CustomerDetails
          customer={selectedCustomer}
          payments={payments.filter((payment) => payment.customer_id === selectedCustomer.id)}
          onClose={() => setSelectedCustomer(null)}
          onPay={() => {
            setSelectedCustomer(null);
            setPaymentCustomer(selectedCustomer);
          }}
          onReceipt={(payment) => setReceipt({ customer: selectedCustomer, payment, summary: selectedCustomer.summary })}
        />
      )}
      {cancelTarget && (
        <CancelPaymentDialog
          payment={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onDone={async () => {
            setCancelTarget(null);
            notify('أُلغيت الدفعة وأعيد حساب العقد');
            await load(true);
          }}
        />
      )}
      {archiveTarget && (
        <ConfirmDialog
          title="أرشفة العميل"
          message={`سيختفي ${archiveTarget.name} من العقود النشطة، مع إبقاء بياناته ودفعاته كاملة.`}
          confirmLabel="أرشفة"
          onClose={() => setArchiveTarget(null)}
          onConfirm={async () => {
            await archiveCustomer(archiveTarget.id);
            setArchiveTarget(null);
            notify('تمت أرشفة العميل');
            await load(true);
          }}
        />
      )}
      {receipt && (
        <ReceiptModal
          {...receipt}
          settings={settings}
          notify={notify}
          onClose={() => setReceipt(null)}
        />
      )}
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
      <div className="text-center">
        <div className="mx-auto mb-5 w-fit"><WhaleLogo /></div>
        <LoaderCircle className="mx-auto animate-spin text-cyan-300" />
        <p className="mt-3 text-sm text-slate-400">نجهّز لوحة الحوت...</p>
      </div>
    </main>
  );
}

function DashboardSection({
  stats,
  chartData,
  customers,
  onPay,
  onCustomers,
}: {
  stats: DashboardStats;
  chartData: { month: string; amount: number }[];
  customers: CustomerView[];
  onPay: (customer: CustomerView) => void;
  onCustomers: () => void;
}) {
  const cards = [
    ['رأس المال', stats.capital, CircleDollarSign, 'navy'],
    ['الرصيد المتاح', stats.available, WalletCards, 'cyan'],
    ['المبالغ المتبقية', stats.receivables, CalendarClock, 'amber'],
    ['الربح المتوقع', stats.expectedProfit, BarChart3, 'teal'],
  ] as const;
  const priorities = customers
    .filter((customer) => ['متأخر', 'مستحق اليوم'].includes(customer.summary.status))
    .slice(0, 5);
  return (
    <div className="space-y-6">
      <section className="hero-card">
        <div>
          <p className="eyebrow text-cyan-200">نظرة مالية مباشرة</p>
          <h2>كل دينار، في مكانه الصحيح.</h2>
          <p>تابع رأس المال والتحصيل والاستحقاقات من شاشة واحدة واضحة.</p>
        </div>
        <div className="hero-metric">
          <span>إجمالي التحصيل</span><strong>{money(stats.collected)}</strong>
          <small>{stats.active} عقد نشط · {stats.late} متأخر</small>
        </div>
      </section>
      <div className="stats-grid">
        {cards.map(([label, value, Icon, tone], index) => (
          <motion.article
            key={label}
            className={`stat-card tone-${tone}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <span className="stat-icon"><Icon size={21} /></span>
            <small>{label}</small><strong>{money(value)}</strong>
          </motion.article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <PanelTitle title="حركة التحصيل" subtitle="آخر ستة أشهر مسجلة" icon={BarChart3} />
          <div className="h-72 pt-5" dir="ltr">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="collection" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e122" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(value) => money(Number(value))} />
                  <Area type="monotone" dataKey="amount" stroke="#14b8a6" strokeWidth={3} fill="url(#collection)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyState text="ستظهر حركة التحصيل بعد تسجيل أول دفعة." />}
          </div>
        </section>
        <section className="panel">
          <PanelTitle title="أولوية المتابعة" subtitle="المستحق والمتأخر" icon={CalendarClock} />
          <div className="mt-4 space-y-3">
            {priorities.length ? priorities.map((customer) => (
              <div className="priority-row" key={customer.id}>
                <StatusBadge status={customer.summary.status} />
                <div className="min-w-0 flex-1">
                  <strong>{customer.name}</strong>
                  <small>{money(customer.summary.currentInstallmentRemaining)} · {dateText(customer.summary.nextDueDate)}</small>
                </div>
                <button className="mini-button" onClick={() => onPay(customer)}>دفع</button>
              </div>
            )) : <EmptyState text="لا توجد استحقاقات عاجلة الآن." />}
          </div>
          <button className="text-button mt-4" onClick={onCustomers}>عرض كل العملاء</button>
        </section>
      </div>
    </div>
  );
}

function CustomersSection({
  customers,
  query,
  status,
  onQuery,
  onStatus,
  onSelect,
  onPay,
  onEdit,
  onArchive,
  onRestore,
}: {
  customers: CustomerView[];
  query: string;
  status: CustomerStatus | 'الكل';
  onQuery: (value: string) => void;
  onStatus: (value: CustomerStatus | 'الكل') => void;
  onSelect: (customer: CustomerView) => void;
  onPay: (customer: CustomerView) => void;
  onEdit: (customer: Customer) => void;
  onArchive: (customer: CustomerView) => void;
  onRestore: (customer: CustomerView) => void;
}) {
  const filters: (CustomerStatus | 'الكل')[] = ['الكل', 'مستحق اليوم', 'متأخر', 'منتظم', 'مكتمل', 'مؤرشف'];
  return (
    <div className="space-y-5">
      <div className="panel filter-panel">
        <label className="search-box"><Search size={18} /><input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="ابحث بالاسم أو الهاتف..." /></label>
        <div className="filter-pills">
          {filters.map((filter) => <button key={filter} className={status === filter ? 'active' : ''} onClick={() => onStatus(filter)}>{filter}</button>)}
        </div>
      </div>
      {customers.length ? (
        <div className="customer-grid">
          {customers.map((customer) => (
            <article className="customer-card" key={customer.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="avatar">{customerAvatar(customer.name)}</span>
                  <div className="min-w-0"><h3>{customer.name}</h3><a href={`tel:${customer.phone}`}>{customer.phone}</a></div>
                </div>
                <StatusBadge status={customer.summary.status} />
              </div>
              {customer.incomplete && <p className="data-warning">بيانات قديمة: راجع نوع القسط وأول استحقاق.</p>}
              <div className="progress-meta"><span>التقدم</span><strong>{Math.round((customer.summary.paidAmount / Math.max(customer.summary.contractTotal, 1)) * 100)}%</strong></div>
              <div className="progress-track"><i style={{ width: `${Math.min(100, (customer.summary.paidAmount / Math.max(customer.summary.contractTotal, 1)) * 100)}%` }} /></div>
              <div className="customer-money">
                <span><small>المدفوع</small><strong>{money(customer.summary.paidAmount)}</strong></span>
                <span><small>المتبقي</small><strong>{money(customer.summary.remaining)}</strong></span>
              </div>
              <div className="next-due"><CalendarClock size={16} /><span>القسط القادم</span><strong>{dateText(customer.summary.nextDueDate)}</strong></div>
              <div className="card-actions">
                <button className="primary-button compact" onClick={() => onPay(customer)} disabled={customer.summary.status === 'مكتمل' || customer.summary.status === 'مؤرشف'}>تسجيل دفعة</button>
                <button className="secondary-button compact" onClick={() => onSelect(customer)}>التفاصيل</button>
                <button className="icon-button" onClick={() => onEdit(customer)} aria-label="تعديل"><SettingsIcon size={16} /></button>
                {customer.summary.status === 'مؤرشف'
                  ? <button className="icon-button" onClick={() => onRestore(customer)} aria-label="استرجاع"><RotateCcw size={16} /></button>
                  : <button className="icon-button danger" onClick={() => onArchive(customer)} aria-label="أرشفة"><Archive size={16} /></button>}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="panel"><EmptyState text="لا توجد نتائج مطابقة. جرّب تغيير البحث أو الفلتر." /></div>}
    </div>
  );
}

function DuesSection({ customers, onPay }: { customers: CustomerView[]; onPay: (customer: CustomerView) => void }) {
  const groups = [
    ['متأخر', customers.filter((c) => c.summary.status === 'متأخر')],
    ['مستحق اليوم', customers.filter((c) => c.summary.status === 'مستحق اليوم')],
    ['خلال 7 أيام', customers.filter((c) => c.summary.nextDueDate && c.summary.nextDueDate > today && c.summary.nextDueDate <= addDays(today, 7))],
  ] as const;
  return <div className="grid gap-5 xl:grid-cols-3">{groups.map(([title, rows]) => (
    <section className="panel" key={title}>
      <PanelTitle title={title} subtitle={`${rows.length} عميل`} icon={CalendarClock} />
      <div className="mt-4 space-y-3">{rows.length ? rows.map((customer) => (
        <div className="due-row" key={customer.id}>
          <div><strong>{customer.name}</strong><small>{dateText(customer.summary.nextDueDate)} · {money(customer.summary.currentInstallmentRemaining)}</small></div>
          <div className="flex gap-1"><a className="icon-button" href={`tel:${customer.phone}`}><Phone size={16} /></a><button className="mini-button" onClick={() => onPay(customer)}>دفع</button></div>
        </div>
      )) : <EmptyState text="لا توجد حالات في هذه المجموعة." />}</div>
    </section>
  ))}</div>;
}

function PaymentsSection({ payments, customers, onReceipt, onCancel }: {
  payments: Payment[]; customers: CustomerView[]; onReceipt: (payment: Payment) => void; onCancel: (payment: Payment) => void;
}) {
  const names = new Map(customers.map((customer) => [customer.id, customer.name]));
  return (
    <section className="panel overflow-hidden">
      <PanelTitle title="سجل الدفعات" subtitle={`${payments.length} عملية محفوظة`} icon={WalletCards} />
      <div className="table-wrap mt-5">
        <table><thead><tr><th>رقم الوصل</th><th>العميل</th><th>المبلغ</th><th>التاريخ</th><th>الحالة</th><th>إجراء</th></tr></thead>
          <tbody>{[...payments].reverse().map((payment) => {
            const cancelled = payment.status === 'cancelled';
            return <tr key={payment.id} className={cancelled ? 'cancelled-row' : ''}>
              <td dir="ltr">{payment.receipt_number || `#${payment.id}`}</td>
              <td>{names.get(payment.customer_id) || `عميل #${payment.customer_id}`}</td>
              <td className="font-black">{money(payment.amount)}</td><td>{payment.payment_date}</td>
              <td><span className={cancelled ? 'status status-archived' : 'status status-paid'}>{cancelled ? 'ملغاة' : 'نشطة'}</span>{cancelled && <small className="block mt-1">{payment.cancellation_reason}</small>}</td>
              <td><div className="flex gap-2"><button className="mini-button" onClick={() => onReceipt(payment)}>الوصل</button>{!cancelled && <button className="mini-button danger" onClick={() => onCancel(payment)}>إلغاء</button>}</div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {!payments.length && <EmptyState text="لا توجد دفعات مسجلة بعد." />}
    </section>
  );
}

function ReportsSection({ stats, customers, payments }: {
  stats: DashboardStats; customers: CustomerView[]; payments: Payment[];
}) {
  function exportCsv() {
    const header = ['العميل', 'الهاتف', 'إجمالي العقد', 'المدفوع', 'المتبقي', 'الحالة'];
    const rows = customers.map((customer) => [customer.name, customer.phone, customer.summary.contractTotal, customer.summary.paidAmount, customer.summary.remaining, customer.summary.status]);
    const csv = '\uFEFF' + [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `alhout-report-${today}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  const cards = [['التحصيل الكلي', stats.collected], ['المبالغ المتبقية', stats.receivables], ['الربح المتوقع', stats.expectedProfit], ['العقود النشطة', stats.active]];
  return <div className="space-y-5">
    <div className="flex justify-end"><button className="secondary-button" onClick={exportCsv}><Download size={17} /> تصدير CSV</button></div>
    <div className="stats-grid">{cards.map(([label, value]) => <article className="stat-card" key={String(label)}><small>{label}</small><strong>{typeof value === 'number' && label !== 'العقود النشطة' ? money(value) : value}</strong></article>)}</div>
    <section className="panel"><PanelTitle title="ملخص العقود" subtitle={`${payments.filter((p) => p.status !== 'cancelled').length} دفعة نشطة`} icon={FileText} />
      <div className="report-bars mt-6">
        <ReportBar label="عقود مكتملة" value={customers.filter((c) => c.summary.status === 'مكتمل').length} max={customers.length} />
        <ReportBar label="عقود نشطة" value={customers.filter((c) => !['مكتمل', 'مؤرشف'].includes(c.summary.status)).length} max={customers.length} />
        <ReportBar label="حالات متأخرة" value={customers.filter((c) => c.summary.status === 'متأخر').length} max={customers.length} />
      </div>
    </section>
  </div>;
}

function SettingsSection({ settings, dark, onDark, onSaved }: { settings: Settings; dark: boolean; onDark: (value: boolean) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      await updateSettings({
        system_name: form.get('system_name'),
        capital: Number(form.get('capital')),
        default_profit_percent: Number(form.get('default_profit_percent')),
        default_installment_type: form.get('default_installment_type'),
        receipt_footer: form.get('receipt_footer'),
      });
      onSaved();
    } finally { setSaving(false); }
  }
  return <section className="panel max-w-3xl"><PanelTitle title="إعدادات النظام" subtitle="القيم الافتراضية وهوية الوصل" icon={SettingsIcon} />
    <form className="form-grid mt-6" onSubmit={submit}>
      <Field label="اسم النظام"><input name="system_name" defaultValue={settings.system_name} required /></Field>
      <Field label="رأس المال"><input name="capital" type="number" min="0" step="1" defaultValue={settings.capital} required /></Field>
      <Field label="نسبة الربح الافتراضية"><input name="default_profit_percent" type="number" min="0" step="0.01" defaultValue={settings.default_profit_percent} required /></Field>
      <Field label="نوع الأقساط الافتراضي"><select name="default_installment_type" defaultValue={settings.default_installment_type || 'monthly'}><option value="monthly">شهري</option><option value="weekly">أسبوعي</option></select></Field>
      <Field label="عبارة أسفل الوصل" wide><textarea name="receipt_footer" defaultValue={settings.receipt_footer} rows={3} /></Field>
      <label className="toggle-row form-wide"><span><strong>الوضع الليلي</strong><small>راحة أكبر في الإضاءة المنخفضة</small></span><input type="checkbox" checked={dark} onChange={(e) => onDark(e.target.checked)} /></label>
      <div className="form-wide flex justify-end"><button className="primary-button" disabled={saving}>{saving && <LoaderCircle className="animate-spin" size={17} />}حفظ الإعدادات</button></div>
    </form>
  </section>;
}

function CustomerForm({ customer, defaults, onClose, onSaved }: { customer: Customer | null; defaults: Settings; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const deliveryDate = customerDeliveryInputValue(customer);
  const firstDueDate = customerFirstDueInputValue(customer);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const data = buildCustomerFormPayload(new FormData(event.currentTarget));
      if (customer) await updateCustomer({ ...data, customer_id: customer.id });
      else await addCustomer(data);
      onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'تعذر الحفظ');
    } finally { setSaving(false); }
  }
  return <div className="modal-backdrop"><div className="modal-panel max-w-3xl"><ModalHeader title={customer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'} onClose={onClose} />
    <form className="form-grid" onSubmit={submit}>
      <Field label="اسم العميل"><input name="name" defaultValue={customer?.name} required /></Field>
      <Field label="رقم الهاتف"><input name="phone" inputMode="tel" defaultValue={customer?.phone} required /></Field>
      <Field label="العنوان"><input name="address" defaultValue={customer?.address} /></Field>
      <Field label="اسم الكفيل"><input name="guarantor_name" defaultValue={customer?.guarantor_name} /></Field>
      <Field label="هاتف الكفيل"><input name="guarantor_phone" inputMode="tel" defaultValue={customer?.guarantor_phone} /></Field>
      <Field label="أصل المبلغ"><input name="principal" type="number" min="1" step="1" defaultValue={customer?.principal} required /></Field>
      <Field label="نسبة الربح %"><input name="profit_percent" type="number" min="0" step="0.01" defaultValue={customer?.profit_percent ?? defaults.default_profit_percent} required /></Field>
      <Field label="عدد الأقساط"><input name="installments" type="number" min="1" step="1" defaultValue={customer?.installments || 10} required /></Field>
      <Field label="نوع الأقساط"><select name="installment_type" defaultValue={customer?.installment_type || defaults.default_installment_type || 'monthly'}><option value="monthly">شهري</option><option value="weekly">أسبوعي</option></select></Field>
      <Field label="تاريخ تسليم المبلغ"><input name="delivery_date" type="date" defaultValue={deliveryDate} required /></Field>
      <Field label="تاريخ أول استحقاق"><input name="first_due_date" type="date" defaultValue={firstDueDate} required /></Field>
      {customer && <AuditDates customer={customer} className="form-wide" />}
      <Field label="ملاحظات" wide><textarea name="notes" defaultValue={customer?.notes} rows={3} /></Field>
      {error && <p className="error-banner form-wide">{error}</p>}
      <div className="form-wide modal-actions"><button type="button" className="secondary-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving && <LoaderCircle size={17} className="animate-spin" />}{customer ? 'حفظ التعديلات' : 'إضافة العميل'}</button></div>
    </form>
  </div></div>;
}

function PaymentForm({ customer, onClose, onSaved }: { customer: CustomerView; onClose: () => void; onSaved: (payment: Payment) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const amount = validatePayment(Number(form.get('amount')), customer.summary.remaining);
      const saved = await addPayment({
        customer_id: customer.id, amount, payment_date: form.get('payment_date'),
        notes: form.get('notes'), request_id: crypto.randomUUID(),
      });
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تسجيل الدفعة');
    } finally { setSaving(false); }
  }
  return <div className="modal-backdrop"><div className="modal-panel max-w-xl"><ModalHeader title="تسجيل دفعة" onClose={onClose} />
    <div className="payment-summary"><div><small>العميل</small><strong>{customer.name}</strong></div><div><small>المتبقي</small><strong>{money(customer.summary.remaining)}</strong></div><div><small>القسط الحالي</small><strong>{money(customer.summary.currentInstallmentRemaining)}</strong></div></div>
    <form className="mt-5 space-y-4" onSubmit={submit}>
      <Field label="مبلغ الدفعة"><input name="amount" type="number" min="1" max={customer.summary.remaining} step="1" autoFocus required /></Field>
      <Field label="تاريخ الدفع"><input name="payment_date" type="date" defaultValue={today} required /></Field>
      <Field label="ملاحظة"><textarea name="notes" rows={3} placeholder="اختياري" /></Field>
      {error && <p className="error-banner">{error}</p>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving && <LoaderCircle size={17} className="animate-spin" />}حفظ وإصدار الوصل</button></div>
    </form>
  </div></div>;
}

function CustomerDetails({ customer, payments, onClose, onPay, onReceipt }: { customer: CustomerView; payments: Payment[]; onClose: () => void; onPay: () => void; onReceipt: (payment: Payment) => void }) {
  return <div className="modal-backdrop"><div className="modal-panel max-w-5xl"><ModalHeader title={`تفاصيل ${customer.name}`} onClose={onClose} />
    <div className="detail-summary">
      <DetailMetric label="إجمالي العقد" value={money(customer.summary.contractTotal)} />
      <DetailMetric label="المدفوع" value={money(customer.summary.paidAmount)} />
      <DetailMetric label="المتبقي" value={money(customer.summary.remaining)} />
      <DetailMetric label="المكتمل" value={`${customer.summary.completedInstallments} من ${customer.installments}`} />
    </div>
    <AuditDates customer={customer} className="mt-3" />
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <div><h3 className="section-heading">جدول الأقساط</h3><div className="table-wrap max-h-96"><table><thead><tr><th>#</th><th>الاستحقاق</th><th>المطلوب</th><th>المغطى</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>{customer.summary.schedule.map((row) => <tr key={row.number}><td>{row.number}</td><td>{row.dueDate}</td><td>{money(row.amount)}</td><td>{money(row.paid)}</td><td>{money(row.remaining)}</td><td><span className="status">{row.status}</span></td></tr>)}</tbody></table></div></div>
      <div><h3 className="section-heading">سجل الدفعات</h3><div className="timeline">{[...payments].reverse().map((payment) => <div className={payment.status === 'cancelled' ? 'timeline-item cancelled-row' : 'timeline-item'} key={payment.id}><i /><div><strong>{money(payment.amount)}</strong><small>{payment.payment_date} · {payment.receipt_number || `#${payment.id}`}</small>{payment.notes && <p>{payment.notes}</p>}</div><button className="mini-button" onClick={() => onReceipt(payment)}>الوصل</button></div>)}{!payments.length && <EmptyState text="لا توجد دفعات." />}</div></div>
    </div>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>إغلاق</button><button className="primary-button" onClick={onPay} disabled={customer.summary.remaining === 0}>تسجيل دفعة</button></div>
  </div></div>;
}

function CancelPaymentDialog({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); const form = new FormData(event.currentTarget);
    try { await cancelPayment(payment.id, String(form.get('reason'))); onDone(); } finally { setSaving(false); }
  }
  return <div className="modal-backdrop"><div className="modal-panel max-w-lg"><ModalHeader title="إلغاء دفعة مالية" onClose={onClose} /><p className="mb-4 text-sm leading-7 text-slate-500">لن تُحذف الدفعة. ستبقى في السجل كملغاة ويعاد حساب العقد بدونها.</p><form onSubmit={submit}><Field label="سبب الإلغاء"><textarea name="reason" rows={4} minLength={3} required /></Field><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>تراجع</button><button className="danger-button" disabled={saving}>تأكيد الإلغاء</button></div></form></div></div>;
}

function ConfirmDialog({ title, message, confirmLabel, onClose, onConfirm }: { title: string; message: string; confirmLabel: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  return <div className="modal-backdrop"><div className="modal-panel max-w-md"><ModalHeader title={title} onClose={onClose} /><p className="text-sm leading-7 text-slate-500">{message}</p><div className="modal-actions"><button className="secondary-button" onClick={onClose}>تراجع</button><button className="danger-button" disabled={saving} onClick={async () => { setSaving(true); try { await onConfirm(); } finally { setSaving(false); } }}>{confirmLabel}</button></div></div></div>;
}

function PanelTitle({ title, subtitle, icon: Icon }: { title: string; subtitle: string; icon: typeof Gauge }) {
  return <div className="panel-title"><span><Icon size={19} /></span><div><h2>{title}</h2><p>{subtitle}</p></div></div>;
}
function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) { return <div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose}><X size={19} /></button></div>; }
function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) { return <label className={wide ? 'field-label form-wide' : 'field-label'}>{label}{children}</label>; }
function DetailMetric({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><strong>{value}</strong></div>; }
function AuditDates({ customer, className = '' }: { customer: Customer; className?: string }) {
  return <div className={`detail-summary ${className}`.trim()}>
    <DetailMetric label="تاريخ إضافة العميل" value={formatBaghdadDateTime(customer.created_at)} />
    <DetailMetric label="آخر تحديث" value={formatBaghdadDateTime(customer.updated_at)} />
  </div>;
}
function EmptyState({ text }: { text: string }) { return <div className="empty-state"><CheckCircle2 size={30} /><p>{text}</p></div>; }
function StatusBadge({ status }: { status: CustomerStatus }) { const key = status === 'متأخر' ? 'late' : status === 'مستحق اليوم' ? 'today' : status === 'مكتمل' ? 'paid' : status === 'مؤرشف' ? 'archived' : 'regular'; return <span className={`status status-${key}`}>{status}</span>; }
function ReportBar({ label, value, max }: { label: string; value: number; max: number }) { return <div><div className="progress-meta"><span>{label}</span><strong>{value}</strong></div><div className="progress-track"><i style={{ width: `${max ? (value / max) * 100 : 0}%` }} /></div></div>; }
function addDays(date: string, days: number) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
