import { Suspense } from 'react';
import { ContactsView } from '@/components/contacts/contacts-view';

export default function ContactsPage() {
  return (
    <Suspense fallback={null}>
      <ContactsView />
    </Suspense>
  );
}
