const API_URL = '/api/sheets';

export async function getSettings() {
  const res = await fetch(`${API_URL}?action=settings`, {
    cache: 'no-store',
  });
  return res.json();
}

export async function getCustomers() {
  const res = await fetch(`${API_URL}?action=customers`, {
    cache: 'no-store',
  });
  return res.json();
}

export async function getPayments() {
  const res = await fetch(`${API_URL}?action=payments`, {
    cache: 'no-store',
  });
  return res.json();
}

export async function addCustomer(data: {
  name: string;
  phone: string;
  principal: number;
  profit_percent: number;
  installments: number;
  paid_installments?: number;
  start_date: string;
  notes?: string;
  status?: string;
}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'add_customer',
      data,
    }),
  });

  return res.json();
}

export async function updateCustomer(data: {
  customer_id: number;
  name: string;
  phone: string;
  principal: number;
  profit_percent: number;
  installments: number;
  start_date: string;
  notes?: string;
  status?: string;
}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'update_customer',
      data,
    }),
  });

  return res.json();
}

export async function addPayment(data: {
  customer_id: number;
  amount: number;
  payment_date?: string;
  notes?: string;
}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'add_payment',
      data,
    }),
  });

  return res.json();
}

export async function deletePayment(data: {
  payment_id: number;
}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'delete_payment',
      data,
    }),
  });

  return res.json();
}

export async function deleteCustomer(data: {
  customer_id: number;
}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'delete_customer',
      data,
    }),
  });

  return res.json();
}

export async function updateSettings(data: {
  system_name: string;
  capital: number;
  default_profit_percent: number;
}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'update_settings',
      data,
    }),
  });

  return res.json();
}