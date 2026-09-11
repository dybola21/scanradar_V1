import { createFileRoute } from '@tanstack/react-router';
import { api } from '@/lib/server/automation.server';
import { messageTestsReconcile } from '@/lib/server/message-tests.server';
export const Route = createFileRoute('/api/message-tests/reconcile')({server:{handlers:{POST:({request})=>api(()=>messageTestsReconcile(request))}}});
