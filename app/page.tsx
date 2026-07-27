import { redirect } from 'next/navigation';
import DashboardApp from '@/features/dashboard/dashboard-app';
import { getSession } from '@/lib/auth';

export default async function Page() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <DashboardApp username={session.username} />;
}
