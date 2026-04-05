'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addCustomer as addCustomerToSheet,
  addPayment as addPaymentToSheet,
  deleteCustomer as deleteCustomerFromSheet,
  deletePayment as deletePaymentFromSheet,
  getCustomers,
  getPayments,
  getSettings,
  updateCustomer as updateCustomerInSheet,
  updateSettings,
} from '@/lib/sheets';

function formatIQD(value: number) {
  return new Intl.NumberFormat('ar-IQ').format(value || 0) + ' د.ع';
}

function formatDate(value?: string) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-CA');
}

type Customer = {
  id: number;
  name: string;
  phone: string;
  principal: number;
  profit_percent: number;
  installments: number;
  paid_installments: number;
  start_date: string;
  notes: string;
  status: string;
  created_at?: string;
};

type Settings = {
  id?: number;
  system_name: string;
  capital: number;
  default_profit_percent: number;
};

type Payment = {
  id: number;
  customer_id: number;
  amount: number;
  payment_date: string;
  notes?: string;
  created_at?: string;
};

type ToastType = 'success' | 'error' | 'info';

export default function Page() {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null);
  const [updatingCustomer, setUpdatingCustomer] = useState(false);

  const [settings, setSettings] = useState<Settings>({
    system_name: 'الحوت',
    capital: 400000,
    default_profit_percent: 10,
  });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedCustomerPayments, setSelectedCustomerPayments] = useState<Payment[] | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentCustomerId, setPaymentCustomerId] = useState<number | null>(null);
  const [paymentCustomerName, setPaymentCustomerName] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState({
    customer_id: 0,
    name: '',
    phone: '',
    principal: '',
    profit_percent: '',
    installments: '',
    start_date: '',
    notes: '',
    status: 'نشط',
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    principal: '',
    profit_percent: '10',
    installments: '10',
    start_date: '',
    notes: '',
  });

  const [calculator, setCalculator] = useState({
    amount: '100000',
    profitPercent: '10',
    installments: '12',
  });

  function showToast(message: string, type: ToastType = 'info') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function loadData() {
    try {
      setLoading(true);

      const [settingsData, customersData, paymentsData] = await Promise.all([
        getSettings(),
        getCustomers(),
        getPayments(),
      ]);

      setSettings({
        system_name: settingsData.system_name || 'الحوت',
        capital: Number(settingsData.capital || 0),
        default_profit_percent: Number(settingsData.default_profit_percent || 10),
      });

      setNewCustomer((prev) => ({
        ...prev,
        profit_percent: String(settingsData.default_profit_percent || 10),
      }));

      setCalculator((prev) => ({
        ...prev,
        profitPercent: String(settingsData.default_profit_percent || 10),
      }));

      setCustomers(
        (customersData || []).map((c: Customer) => ({
          ...c,
          principal: Number(c.principal || 0),
          profit_percent: Number(c.profit_percent || 0),
          installments: Number(c.installments || 0),
          paid_installments: Number(c.paid_installments || 0),
        }))
      );

      setPayments(
        (paymentsData || []).map((p: Payment) => ({
          ...p,
          amount: Number(p.amount || 0),
          customer_id: Number(p.customer_id || 0),
        }))
      );
    } catch (error) {
      console.error('Load error:', error);
      showToast('صار خطأ أثناء جلب البيانات من Google Sheets', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const customerRows = useMemo(() => {
    return customers.map((c) => {
      const total = c.principal + c.principal * (c.profit_percent / 100);
      const installmentValue = c.installments > 0 ? total / c.installments : 0;

      const customerPayments = payments.filter(
        (p) => Number(p.customer_id) === Number(c.id)
      );

      const paidAmount = customerPayments.reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0
      );

      const remaining = Math.max(total - paidAmount, 0);

      const sortedPayments = [...customerPayments].sort(
        (a, b) =>
          new Date(a.payment_date || a.created_at || '').getTime() -
          new Date(b.payment_date || b.created_at || '').getTime()
      );

      const lastPayment = sortedPayments.length
        ? Number(sortedPayments[sortedPayments.length - 1].amount || 0)
        : 0;

      const paymentCount = customerPayments.length;
      const remainingInstallments = Math.max(Number(c.installments || 0) - paymentCount, 0);

      let status = c.status || 'نشط';
      if (remaining <= 0) {
        status = 'مكتمل';
      } else if (status !== 'متأخر') {
        status = 'نشط';
      }

      return {
        ...c,
        total,
        installmentValue,
        paidAmount,
        remaining,
        lastPayment,
        paymentCount,
        remainingInstallments,
        status,
      };
    });
  }, [customers, payments]);

  const filteredCustomerRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return customerRows;

    return customerRows.filter((customer) => {
      return (
        customer.name.toLowerCase().includes(q) ||
        customer.phone.toLowerCase().includes(q) ||
        customer.status.toLowerCase().includes(q)
      );
    });
  }, [customerRows, searchTerm]);

  const stats = useMemo(() => {
    const activeFiles = customerRows.filter((c) => c.status !== 'مكتمل').length;
    const memberCount = customerRows.length;
    const totalProfit = customerRows.reduce((sum, c) => sum + (c.total - c.principal), 0);
    const underFollow = customerRows.filter((c) => c.status === 'متأخر').length;

    const totalSpent = customerRows.reduce((sum, c) => sum + c.principal, 0);
    const availableBalance = settings.capital - totalSpent;
    const remainingCollection = customerRows.reduce((sum, c) => sum + c.remaining, 0);
    const completedFiles = customerRows.filter((c) => c.status === 'مكتمل').length;
    const lateCases = customerRows.filter((c) => c.status === 'متأخر').length;
    const totalContracts = customerRows.reduce((sum, c) => sum + c.total, 0);

    return {
      activeFiles,
      memberCount,
      totalProfit,
      underFollow,
      totalSpent,
      availableBalance,
      remainingCollection,
      completedFiles,
      lateCases,
      totalContracts,
    };
  }, [customerRows, settings.capital]);

  const calc = useMemo(() => {
    const amount = Number(calculator.amount || 0);
    const profitPercent = Number(calculator.profitPercent || 0);
    const installments = Number(calculator.installments || 0);

    const profit = amount * (profitPercent / 100);
    const total = amount + profit;
    const installmentValue = installments > 0 ? total / installments : 0;

    return { profit, total, installmentValue };
  }, [calculator]);

  async function saveSettings() {
    try {
      setSavingSettings(true);

      const result = await updateSettings({
        system_name: settings.system_name,
        capital: Number(settings.capital || 0),
        default_profit_percent: Number(settings.default_profit_percent || 10),
      });

      if (result?.ok) {
        showToast('تم حفظ الإعدادات بنجاح', 'success');
        await loadData();
      } else {
        showToast('فشل حفظ الإعدادات', 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('صار خطأ أثناء حفظ الإعدادات', 'error');
    } finally {
      setSavingSettings(false);
    }
  }

  async function addCustomer() {
    if (
      !newCustomer.name ||
      !newCustomer.phone ||
      !newCustomer.principal ||
      !newCustomer.installments ||
      !newCustomer.start_date
    ) {
      showToast('أكمل الحقول المطلوبة', 'error');
      return;
    }

    try {
      setAddingCustomer(true);

      const result = await addCustomerToSheet({
        name: newCustomer.name,
        phone: newCustomer.phone,
        principal: Number(newCustomer.principal),
        profit_percent: Number(newCustomer.profit_percent || settings.default_profit_percent),
        installments: Number(newCustomer.installments),
        paid_installments: 0,
        start_date: newCustomer.start_date,
        notes: newCustomer.notes,
        status: 'نشط',
      });

      if (result?.ok) {
        setNewCustomer({
          name: '',
          phone: '',
          principal: '',
          profit_percent: String(settings.default_profit_percent),
          installments: '10',
          start_date: '',
          notes: '',
        });

        await loadData();
        showToast('تمت إضافة الملف بنجاح', 'success');
      } else {
        showToast('فشلت إضافة الملف', 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('صار خطأ أثناء إضافة الملف', 'error');
    } finally {
      setAddingCustomer(false);
    }
  }

  function openPaymentModal(customerId: number, customerName: string) {
    setPaymentCustomerId(customerId);
    setPaymentCustomerName(customerName);
    setPaymentAmount('');
    setPaymentNotes('');
    setPaymentModalOpen(true);
  }

  async function submitPayment() {
    if (!paymentCustomerId) return;

    const amount = Number(paymentAmount);

    if (!amount || amount <= 0) {
      showToast('ادخل مبلغ صحيح', 'error');
      return;
    }

    const currentCustomer = customerRows.find((c) => c.id === paymentCustomerId);
    if (currentCustomer && amount > currentCustomer.remaining) {
      showToast('مبلغ الدفعة أكبر من المبلغ المتبقي', 'error');
      return;
    }

    try {
      setPayingId(paymentCustomerId);

      const result = await addPaymentToSheet({
        customer_id: paymentCustomerId,
        amount,
        notes: paymentNotes,
      });

      if (result?.ok) {
        setPaymentModalOpen(false);
        setPaymentCustomerId(null);
        setPaymentCustomerName('');
        setPaymentAmount('');
        setPaymentNotes('');
        await loadData();
        showToast('تم تسجيل الدفعة بنجاح', 'success');
      } else {
        showToast('فشل تسجيل الدفعة', 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('صار خطأ أثناء تسجيل الدفعة', 'error');
    } finally {
      setPayingId(null);
    }
  }

  function openEditModal(customer: Customer) {
    setEditCustomer({
      customer_id: customer.id,
      name: customer.name,
      phone: customer.phone,
      principal: String(customer.principal),
      profit_percent: String(customer.profit_percent),
      installments: String(customer.installments),
      start_date: customer.start_date || '',
      notes: customer.notes || '',
      status: customer.status || 'نشط',
    });
    setEditModalOpen(true);
  }

  async function submitEditCustomer() {
    if (
      !editCustomer.customer_id ||
      !editCustomer.name ||
      !editCustomer.phone ||
      !editCustomer.principal ||
      !editCustomer.installments ||
      !editCustomer.start_date
    ) {
      showToast('أكمل الحقول المطلوبة', 'error');
      return;
    }

    try {
      setUpdatingCustomer(true);

      const result = await updateCustomerInSheet({
        customer_id: editCustomer.customer_id,
        name: editCustomer.name,
        phone: editCustomer.phone,
        principal: Number(editCustomer.principal),
        profit_percent: Number(editCustomer.profit_percent || 0),
        installments: Number(editCustomer.installments),
        start_date: editCustomer.start_date,
        notes: editCustomer.notes,
        status: editCustomer.status,
      });

      if (result?.ok) {
        setEditModalOpen(false);
        await loadData();
        showToast('تم تعديل العميل بنجاح', 'success');
      } else {
        showToast('فشل تعديل العميل', 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('صار خطأ أثناء تعديل العميل', 'error');
    } finally {
      setUpdatingCustomer(false);
    }
  }

  async function handleDeleteCustomer(customerId: number, customerName: string) {
    const confirmed = window.confirm(`هل تريد حذف العميل ${customerName}؟`);
    if (!confirmed) return;

    try {
      setDeletingId(customerId);

      const result = await deleteCustomerFromSheet({
        customer_id: customerId,
      });

      if (result?.ok) {
        await loadData();
        showToast('تم حذف العميل بنجاح', 'success');
      } else {
        showToast('فشل حذف العميل', 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('صار خطأ أثناء حذف العميل', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  function handleShowPayments(customerId: number, customerName: string) {
    const customerPayments = payments
      .filter((p) => Number(p.customer_id) === Number(customerId))
      .sort(
        (a, b) =>
          new Date(a.payment_date || a.created_at || '').getTime() -
          new Date(b.payment_date || b.created_at || '').getTime()
      );

    setSelectedCustomerPayments(customerPayments);
    setSelectedCustomerName(customerName);
    setSelectedCustomerId(customerId);
  }

  async function handleDeletePayment(paymentId: number) {
    const confirmed = window.confirm('هل تريد حذف هذه الدفعة؟');
    if (!confirmed) return;

    try {
      setDeletingPaymentId(paymentId);

      const result = await deletePaymentFromSheet({
        payment_id: paymentId,
      });

      if (result?.ok) {
        await loadData();

        if (selectedCustomerId) {
          const refreshedPayments = payments
            .filter((p) => p.customer_id === selectedCustomerId && p.id !== paymentId)
            .sort(
              (a, b) =>
                new Date(a.payment_date || a.created_at || '').getTime() -
                new Date(b.payment_date || b.created_at || '').getTime()
            );

          setSelectedCustomerPayments(refreshedPayments);
        }

        showToast('تم حذف الدفعة بنجاح', 'success');
      } else {
        showToast('فشل حذف الدفعة', 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('صار خطأ أثناء حذف الدفعة', 'error');
    } finally {
      setDeletingPaymentId(null);
    }
  }

  const summaryCards = [
    { title: 'الملفات النشطة', value: stats.activeFiles, icon: '👥' },
    { title: 'عدد الأعضاء', value: stats.memberCount, icon: '👤' },
    { title: 'إجمالي الربح', value: formatIQD(stats.totalProfit), icon: '📈' },
    { title: 'أقساط قيد المتابعة', value: stats.underFollow, icon: '🗓️' },
  ];

  const financeCards = [
    { title: 'رأس المال', value: formatIQD(settings.capital), icon: '💳' },
    { title: 'المبالغ المصروفة', value: formatIQD(stats.totalSpent), icon: '💰' },
    { title: 'الرصيد المتاح', value: formatIQD(stats.availableBalance), icon: '🪙' },
    { title: 'الملفات النشطة', value: stats.activeFiles, icon: '👥' },
    { title: 'المتبقي للتحصيل', value: formatIQD(stats.remainingCollection), icon: '⏰' },
    { title: 'الربح المتوقع', value: formatIQD(stats.totalProfit), icon: '📈' },
    { title: 'إجمالي العقود', value: formatIQD(stats.totalContracts), icon: '📋' },
    { title: 'الملفات المكتملة', value: stats.completedFiles, icon: '✅' },
    { title: 'الحالات المتأخرة', value: stats.lateCases, icon: '⚠️' },
  ];

  if (loading) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f3f4f6]">
        <div className="text-2xl font-black text-slate-700">جاري تحميل البيانات...</div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#f3f4f6] text-[#0f172a]">
      {toast && (
        <div
          className={`fixed left-4 top-4 z-[100] rounded-2xl px-5 py-4 text-white shadow-xl ${
            toast.type === 'success'
              ? 'bg-emerald-600'
              : toast.type === 'error'
              ? 'bg-red-500'
              : 'bg-slate-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
          <nav className="hidden items-center gap-8 text-lg font-extrabold text-slate-800 md:flex">
            <a href="#" className="hover:text-slate-950">الرئيسية</a>
            <a href="#" className="hover:text-slate-950">الإحصائيات</a>
            <a href="#" className="hover:text-slate-950">إضافة ملف</a>
            <a href="#" className="hover:text-slate-950">السجلات</a>
            <a href="#" className="hover:text-slate-950">الدفعات القادمة</a>
          </nav>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <h1 className="text-3xl font-black text-slate-900">{settings.system_name}</h1>
              <p className="text-sm text-slate-500">إدارة رأس المال والأقساط</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-xl text-white shadow-sm">
              ⚙
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
        <section className="rounded-[2rem] bg-gradient-to-l from-[#0d1831] via-[#101f42] to-[#182949] p-6 text-white shadow-lg">
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="grid gap-4 sm:grid-cols-2">
              {summaryCards.map((card) => (
                <div key={card.title} className="rounded-[1.75rem] bg-white/10 p-6 backdrop-blur-sm">
                  <div className="flex items-start justify-between">
                    <span className="text-xl opacity-90">{card.icon}</span>
                  </div>
                  <div className="mt-8 text-lg font-bold text-slate-200">{card.title}</div>
                  <div className="mt-3 text-4xl font-black">{card.value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-col items-end justify-center text-right">
              <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold">
                نظام {settings.system_name}
              </span>
              <h2 className="mt-6 text-5xl font-black leading-tight text-teal-200 md:text-7xl">
                الحوت
                <br />
                إدارة الأقساط
                <br />
                والتحصيل
              </h2>

              <div className="mt-8 flex flex-wrap gap-3">
                <button className="rounded-full bg-white px-6 py-3 text-base font-extrabold text-slate-900 shadow-sm">
                  إضافة ملف
                </button>
                <button className="rounded-full border border-white/30 px-6 py-3 text-base font-extrabold text-white">
                  السجلات المالية
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4 lg:grid-cols-[220px_1fr_260px] lg:items-center">
            <button
              onClick={saveSettings}
              disabled={savingSettings}
              className="h-16 rounded-full bg-[#0f1831] px-6 text-lg font-black text-white shadow-sm disabled:opacity-60"
            >
              {savingSettings ? 'جاري الحفظ...' : 'حفظ رأس المال'}
            </button>

            <div className="flex justify-center">
              <input
                type="number"
                value={settings.capital}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, capital: Number(e.target.value || 0) }))
                }
                className="h-14 w-full max-w-[320px] rounded-2xl border border-slate-200 bg-white px-5 text-center text-xl outline-none"
              />
            </div>

            <div className="text-right">
              <h3 className="text-4xl font-black text-[#0f1831]">إدارة رأس المال</h3>
              <p className="mt-2 text-base text-slate-500">تعديل رأس المال مباشرة من داخل النظام</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {financeCards.map((card) => (
            <div key={card.title} className="rounded-[1.75rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start justify-between">
                <span className="text-xl">{card.icon}</span>
              </div>
              <div className="mt-6 text-2xl font-bold text-slate-500">{card.title}</div>
              <div className="mt-4 text-5xl font-black text-[#0f1831]">{card.value}</div>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_330px]">
          <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-6 text-right">
              <h3 className="text-5xl font-black text-[#0f1831]">ملخص الحاسبة</h3>
              <p className="mt-2 text-lg text-slate-500">عرض مباشر للقيم المحتسبة</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.5rem] bg-slate-50 p-6">
                <div className="text-xl font-bold text-slate-500">المبلغ الأساسي</div>
                <div className="mt-4 text-4xl font-black text-[#0f1831]">
                  {formatIQD(Number(calculator.amount || 0))}
                </div>
              </div>

              <div className="rounded-[1.5rem] bg-slate-50 p-6">
                <div className="text-xl font-bold text-slate-500">الربح</div>
                <div className="mt-4 text-4xl font-black text-[#0f1831]">
                  {formatIQD(calc.profit)}
                </div>
              </div>

              <div className="rounded-[1.5rem] bg-slate-50 p-6">
                <div className="text-xl font-bold text-slate-500">الإجمالي</div>
                <div className="mt-4 text-4xl font-black text-[#0f1831]">
                  {formatIQD(calc.total)}
                </div>
              </div>

              <div className="rounded-[1.5rem] bg-slate-50 p-6">
                <div className="text-xl font-bold text-slate-500">قيمة الدفعة</div>
                <div className="mt-4 text-4xl font-black text-[#0f1831]">
                  {formatIQD(calc.installmentValue)}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-6 flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                🧮
              </div>
              <div className="text-right">
                <h3 className="text-4xl font-black text-[#0f1831]">الحاسبة المالية</h3>
                <p className="mt-2 text-base text-slate-500">احتساب الربح وقيمة القسط</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block text-right">
                <span className="mb-2 block text-lg font-extrabold">المبلغ الأساسي</span>
                <input
                  type="number"
                  value={calculator.amount}
                  onChange={(e) => setCalculator({ ...calculator, amount: e.target.value })}
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-left outline-none"
                />
              </label>

              <label className="block text-right">
                <span className="mb-2 block text-lg font-extrabold">% نسبة الربح</span>
                <input
                  type="number"
                  value={calculator.profitPercent}
                  onChange={(e) => setCalculator({ ...calculator, profitPercent: e.target.value })}
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-left outline-none"
                />
              </label>

              <label className="block text-right">
                <span className="mb-2 block text-lg font-extrabold">عدد الدفعات</span>
                <input
                  type="number"
                  value={calculator.installments}
                  onChange={(e) => setCalculator({ ...calculator, installments: e.target.value })}
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-left outline-none"
                />
              </label>
            </div>

            <div className="mt-6 rounded-[1.5rem] bg-slate-50 p-5">
              <div className="space-y-3 text-base text-slate-500">
                <div className="flex items-center justify-between">
                  <span>{formatIQD(calc.profit)}</span>
                  <span>الربح</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{formatIQD(calc.total)}</span>
                  <span>الإجمالي</span>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-black text-[#0f1831]">
                    {formatIQD(calc.installmentValue)}
                  </span>
                  <span className="text-2xl font-black text-[#0f1831]">قيمة كل دفعة</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-8 text-right">
            <h3 className="text-5xl font-black text-[#0f1831]">إضافة ملف جديد</h3>
            <p className="mt-2 text-lg text-slate-500">إدخال بيانات الملف من داخل النظام</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="mb-2 block text-right text-xl font-extrabold">الاسم</span>
              <input
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                placeholder="مثال: محمد علي"
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-right outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-right text-xl font-extrabold">الرقم</span>
              <input
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                placeholder="07xx xxx xxx"
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-right outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-right text-xl font-extrabold">مبلغ السحب</span>
              <input
                type="number"
                value={newCustomer.principal}
                onChange={(e) => setNewCustomer({ ...newCustomer, principal: e.target.value })}
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-right outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-right text-xl font-extrabold">% نسبة الربح</span>
              <input
                type="number"
                value={newCustomer.profit_percent}
                onChange={(e) => setNewCustomer({ ...newCustomer, profit_percent: e.target.value })}
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-right outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-right text-xl font-extrabold">عدد الدفعات</span>
              <input
                type="number"
                value={newCustomer.installments}
                onChange={(e) => setNewCustomer({ ...newCustomer, installments: e.target.value })}
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-right outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-right text-xl font-extrabold">تاريخ البداية</span>
              <input
                type="date"
                value={newCustomer.start_date}
                onChange={(e) => setNewCustomer({ ...newCustomer, start_date: e.target.value })}
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-right outline-none"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-right text-xl font-extrabold">ملاحظات</span>
              <input
                value={newCustomer.notes}
                onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })}
                placeholder="تفاصيل إضافية"
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-right outline-none"
              />
            </label>
          </div>

          <div className="mt-6 flex justify-start">
            <button
              onClick={addCustomer}
              disabled={addingCustomer}
              className="h-14 rounded-full bg-[#12b8c8] px-8 text-lg font-black text-white shadow-sm disabled:opacity-60"
            >
              {addingCustomer ? 'جاري الحفظ...' : 'حفظ الملف'}
            </button>
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="text-right">
              <h3 className="text-5xl font-black text-[#0f1831]">سجلات الأعضاء</h3>
              <p className="mt-2 text-lg text-slate-500">البحث والمتابعة والحذف والسجلات التفصيلية</p>
            </div>

            <input
              placeholder="ابحث بالاسم أو الرقم أو الحالة"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-14 w-full max-w-[320px] rounded-full border border-slate-200 bg-slate-50 px-5 text-right outline-none"
            />
          </div>

          <div className="overflow-x-auto rounded-[1.5rem] border border-slate-200">
            <table className="min-w-full bg-white text-right">
              <thead className="bg-slate-50">
                <tr className="text-lg font-extrabold text-slate-500">
                  <th className="px-4 py-4">الاسم</th>
                  <th className="px-4 py-4">الرقم</th>
                  <th className="px-4 py-4">الأصل</th>
                  <th className="px-4 py-4">الربح %</th>
                  <th className="px-4 py-4">الدفعات المتبقية</th>
                  <th className="px-4 py-4">إجمالي المدفوع</th>
                  <th className="px-4 py-4">آخر دفعة</th>
                  <th className="px-4 py-4">القسط</th>
                  <th className="px-4 py-4">المتبقي</th>
                  <th className="px-4 py-4">الحالة</th>
                  <th className="px-4 py-4">الإجراءات</th>
                </tr>
              </thead>

              <tbody>
                {filteredCustomerRows.map((customer) => (
                  <tr key={customer.id} className="border-t border-slate-100 text-lg">
                    <td className="px-4 py-5 font-black text-[#0f1831]">{customer.name}</td>
                    <td className="px-4 py-5 text-slate-600">{customer.phone}</td>
                    <td className="px-4 py-5">{formatIQD(customer.principal)}</td>
                    <td className="px-4 py-5">{customer.profit_percent}%</td>
                    <td className="px-4 py-5">{customer.remainingInstallments}</td>
                    <td className="px-4 py-5">{formatIQD(customer.paidAmount)}</td>
                    <td className="px-4 py-5">{formatIQD(customer.lastPayment)}</td>
                    <td className="px-4 py-5">{formatIQD(customer.installmentValue)}</td>
                    <td className="px-4 py-5 font-bold">{formatIQD(customer.remaining)}</td>
                    <td className="px-4 py-5">
                      <span
                        className={`rounded-full px-4 py-2 text-sm font-black ${
                          customer.status === 'مكتمل'
                            ? 'bg-cyan-50 text-cyan-700'
                            : customer.status === 'متأخر'
                            ? 'bg-orange-50 text-orange-600'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {customer.status}
                      </span>
                    </td>
                    <td className="px-4 py-5">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          onClick={() => openPaymentModal(customer.id, customer.name)}
                          disabled={payingId === customer.id}
                          className="rounded-full bg-[#0f1831] px-5 py-2 text-sm font-black text-white disabled:opacity-60"
                        >
                          {payingId === customer.id ? 'جاري...' : 'دفعة'}
                        </button>

                        <button
                          onClick={() => handleShowPayments(customer.id, customer.name)}
                          className="rounded-full bg-[#24304f] px-5 py-2 text-sm font-black text-white"
                        >
                          السجل
                        </button>

                        <button
                          onClick={() => openEditModal(customer)}
                          className="rounded-full bg-amber-500 px-5 py-2 text-sm font-black text-white"
                        >
                          تعديل
                        </button>

                        <button
                          onClick={() => handleDeleteCustomer(customer.id, customer.name)}
                          disabled={deletingId === customer.id}
                          className="rounded-full bg-red-500 px-5 py-2 text-sm font-black text-white disabled:opacity-60"
                        >
                          {deletingId === customer.id ? 'جاري...' : 'حذف'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredCustomerRows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-lg font-bold text-slate-500">
                      لا توجد نتائج
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {selectedCustomerPayments !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-[2rem] bg-white p-6 shadow-2xl">
              <div className="mb-6 flex items-center justify-between">
                <button
                  onClick={() => {
                    setSelectedCustomerPayments(null);
                    setSelectedCustomerName('');
                    setSelectedCustomerId(null);
                  }}
                  className="rounded-full bg-slate-200 px-4 py-2 text-sm font-bold"
                >
                  إغلاق
                </button>
                <div className="text-right">
                  <h3 className="text-3xl font-black text-[#0f1831]">
                    سجل دفعات {selectedCustomerName}
                  </h3>
                  <p className="mt-1 text-slate-500">
                    عدد الدفعات: {selectedCustomerPayments.length} | المجموع: {formatIQD(selectedCustomerPayments.reduce((s, p) => s + p.amount, 0))}
                  </p>
                </div>
              </div>

              {selectedCustomerPayments.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-6 text-center text-lg font-bold text-slate-500">
                  لا توجد دفعات لهذا العميل
                </div>
              ) : (
                <div className="overflow-x-auto rounded-[1.5rem] border border-slate-200">
                  <table className="min-w-full text-right">
                    <thead className="bg-slate-50">
                      <tr className="text-lg font-extrabold text-slate-500">
                        <th className="px-4 py-4">رقم الدفعة</th>
                        <th className="px-4 py-4">المبلغ</th>
                        <th className="px-4 py-4">تاريخ الدفع</th>
                        <th className="px-4 py-4">الملاحظات</th>
                        <th className="px-4 py-4">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...selectedCustomerPayments]
                        .sort(
                          (a, b) =>
                            new Date(a.payment_date || a.created_at || '').getTime() -
                            new Date(b.payment_date || b.created_at || '').getTime()
                        )
                        .map((payment, index) => (
                          <tr key={payment.id} className="border-t border-slate-100 text-lg">
                            <td className="px-4 py-4">{index + 1}</td>
                            <td className="px-4 py-4 font-bold">{formatIQD(payment.amount)}</td>
                            <td className="px-4 py-4">{formatDate(payment.payment_date || payment.created_at)}</td>
                            <td className="px-4 py-4">{payment.notes || '-'}</td>
                            <td className="px-4 py-4">
                              <button
                                onClick={() => handleDeletePayment(payment.id)}
                                disabled={deletingPaymentId === payment.id}
                                className="rounded-full bg-red-500 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                              >
                                {deletingPaymentId === payment.id ? 'جاري...' : 'حذف الدفعة'}
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {paymentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
              <div className="mb-6 flex items-center justify-between">
                <button
                  onClick={() => setPaymentModalOpen(false)}
                  className="rounded-full bg-slate-200 px-4 py-2 text-sm font-bold"
                >
                  إغلاق
                </button>
                <div className="text-right">
                  <h3 className="text-3xl font-black text-[#0f1831]">تسجيل دفعة</h3>
                  <p className="mt-1 text-slate-500">{paymentCustomerName}</p>
                </div>
              </div>

              <div className="space-y-4">
                <label className="block text-right">
                  <span className="mb-2 block text-lg font-extrabold">مبلغ الدفعة</span>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="ادخل مبلغ الدفعة"
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-right outline-none"
                  />
                </label>

                <label className="block text-right">
                  <span className="mb-2 block text-lg font-extrabold">ملاحظات</span>
                  <input
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="ملاحظات اختيارية"
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-right outline-none"
                  />
                </label>

                <button
                  onClick={submitPayment}
                  disabled={payingId !== null}
                  className="h-14 w-full rounded-2xl bg-[#12b8c8] text-lg font-black text-white shadow-sm disabled:opacity-60"
                >
                  {payingId !== null ? 'جاري الحفظ...' : 'حفظ الدفعة'}
                </button>
              </div>
            </div>
          </div>
        )}

        {editModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl">
              <div className="mb-6 flex items-center justify-between">
                <button
                  onClick={() => setEditModalOpen(false)}
                  className="rounded-full bg-slate-200 px-4 py-2 text-sm font-bold"
                >
                  إغلاق
                </button>
                <div className="text-right">
                  <h3 className="text-3xl font-black text-[#0f1831]">تعديل العميل</h3>
                  <p className="mt-1 text-slate-500">عدل البيانات ثم احفظ</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-right font-extrabold">الاسم</span>
                  <input
                    value={editCustomer.name}
                    onChange={(e) => setEditCustomer({ ...editCustomer, name: e.target.value })}
                    className="h-14 w-full rounded-2xl border border-slate-200 px-4 text-right outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-right font-extrabold">الرقم</span>
                  <input
                    value={editCustomer.phone}
                    onChange={(e) => setEditCustomer({ ...editCustomer, phone: e.target.value })}
                    className="h-14 w-full rounded-2xl border border-slate-200 px-4 text-right outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-right font-extrabold">مبلغ السحب</span>
                  <input
                    type="number"
                    value={editCustomer.principal}
                    onChange={(e) => setEditCustomer({ ...editCustomer, principal: e.target.value })}
                    className="h-14 w-full rounded-2xl border border-slate-200 px-4 text-right outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-right font-extrabold">نسبة الربح</span>
                  <input
                    type="number"
                    value={editCustomer.profit_percent}
                    onChange={(e) => setEditCustomer({ ...editCustomer, profit_percent: e.target.value })}
                    className="h-14 w-full rounded-2xl border border-slate-200 px-4 text-right outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-right font-extrabold">عدد الدفعات</span>
                  <input
                    type="number"
                    value={editCustomer.installments}
                    onChange={(e) => setEditCustomer({ ...editCustomer, installments: e.target.value })}
                    className="h-14 w-full rounded-2xl border border-slate-200 px-4 text-right outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-right font-extrabold">تاريخ البداية</span>
                  <input
                    type="date"
                    value={editCustomer.start_date}
                    onChange={(e) => setEditCustomer({ ...editCustomer, start_date: e.target.value })}
                    className="h-14 w-full rounded-2xl border border-slate-200 px-4 text-right outline-none"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="mb-2 block text-right font-extrabold">ملاحظات</span>
                  <input
                    value={editCustomer.notes}
                    onChange={(e) => setEditCustomer({ ...editCustomer, notes: e.target.value })}
                    className="h-14 w-full rounded-2xl border border-slate-200 px-4 text-right outline-none"
                  />
                </label>
              </div>

              <div className="mt-6 flex justify-start">
                <button
                  onClick={submitEditCustomer}
                  disabled={updatingCustomer}
                  className="h-14 rounded-full bg-amber-500 px-8 text-lg font-black text-white shadow-sm disabled:opacity-60"
                >
                  {updatingCustomer ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}