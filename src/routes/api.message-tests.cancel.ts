import { createFileRoute } from '@tanstack/react-router';
import { api } from '@/lib/server/automation.server';
import { messageTestsCancel } from '@/lib/server/message-tests.server';
export const Route = createFileRoute('/api/message-tests/cancel')({server:{handlers:{POST:({request})=>api(()=>messageTestsCancel(request))}}});
