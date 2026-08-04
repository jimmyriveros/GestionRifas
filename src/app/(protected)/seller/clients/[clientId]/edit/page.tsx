import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/data/PageHeader'
import { ClientForm } from '@/features/clients/components/ClientForm'
import { getClientDetail } from '@/features/clients/queries'

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const client = await getClientDetail(clientId)

  if (!client) notFound()

  return (
    <div className="space-y-6">
      <PageHeader title={`Editar ${client.name}`} />
      <ClientForm
        client={{
          id: client.id,
          name: client.name,
          alias: client.alias ?? '',
          phone: client.phone,
          email: client.email ?? '',
          notes: client.notes ?? '',
        }}
      />
    </div>
  )
}
