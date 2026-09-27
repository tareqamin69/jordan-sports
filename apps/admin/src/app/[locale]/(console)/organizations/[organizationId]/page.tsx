import { use } from 'react';
import { OrganizationDetailPage } from '@/components/organizations';

export default function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = use(params);
  return <OrganizationDetailPage organizationId={organizationId} />;
}
