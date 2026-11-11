import type { ContractStatus, Customer } from '@/types/domain';

export type CustomerFilter = 'all' | 'balance' | 'completed' | 'no-contracts' | 'archived';
export type CustomerContractFilter = 'all' | 'active' | 'completed' | 'archived';

export type ClassifiableContract = {
  archived?: boolean | string;
  status: ContractStatus;
  remaining_amount: number;
  principal: number;
};

export function isArchivedCustomer(customer: Pick<Customer, 'archived'>): boolean {
  return customer.archived === true || customer.archived === 'true';
}

export function isArchivedContract(contract: ClassifiableContract): boolean {
  return contract.archived === true || contract.archived === 'true' || contract.status === 'مؤرشف';
}

export function contractClassification(contract: ClassifiableContract): Exclude<CustomerContractFilter, 'all'> | 'inconsistent' {
  if (isArchivedContract(contract)) return 'archived';
  if (contract.remaining_amount > 0) return 'active';
  if (contract.remaining_amount === 0) return 'completed';
  return 'inconsistent';
}

export function buildCustomerPortfolio<T extends ClassifiableContract>(contracts: T[]) {
  const active: T[] = [];
  const completed: T[] = [];
  const archived: T[] = [];
  const inconsistent: T[] = [];
  let hasStatusMismatch = false;

  for (const contract of contracts) {
    const classification = contractClassification(contract);
    if (classification === 'active') active.push(contract);
    else if (classification === 'completed') completed.push(contract);
    else if (classification === 'archived') archived.push(contract);
    else inconsistent.push(contract);

    if (!isArchivedContract(contract)) {
      const statusSaysCompleted = contract.status === 'مكتمل';
      const balanceSaysCompleted = contract.remaining_amount === 0;
      if (statusSaysCompleted !== balanceSaysCompleted) hasStatusMismatch = true;
    }
  }

  return {
    all: contracts,
    active,
    completed,
    archived,
    inconsistent,
    mixed: active.length > 0 && completed.length > 0,
    archiveOnly: contracts.length > 0 && archived.length === contracts.length,
    hasStatusMismatch,
    currentPrincipal: [...active, ...completed].reduce((sum, contract) => sum + contract.principal, 0),
    remaining: active.reduce((sum, contract) => sum + contract.remaining_amount, 0),
  };
}

export type CustomerPortfolio = ReturnType<typeof buildCustomerPortfolio>;

export function matchesCustomerFilter(
  customer: Pick<Customer, 'archived'>,
  portfolio: CustomerPortfolio,
  filter: CustomerFilter,
): boolean {
  const customerArchived = isArchivedCustomer(customer);
  if (filter === 'archived') return customerArchived;
  if (customerArchived) return false;
  if (filter === 'all') return true;
  if (filter === 'balance') return portfolio.active.length > 0;
  if (filter === 'completed') {
    const currentContracts = [...portfolio.active, ...portfolio.completed, ...portfolio.inconsistent];
    return currentContracts.length > 0 && currentContracts.every((contract) => contract.remaining_amount === 0);
  }
  return portfolio.all.length === 0;
}

export function matchesContractFilter(
  contract: ClassifiableContract,
  filter: CustomerContractFilter,
): boolean {
  return filter === 'all' || contractClassification(contract) === filter;
}
