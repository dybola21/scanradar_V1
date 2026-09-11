import { createFileRoute } from '@tanstack/react-router';
import { api } from '@/lib/server/automation.server';
import { messageTestsStart } from '@/lib/server/message-tests.server';
export const Route = createFileRoute('/api/message-tests/start')({server:{handlers:{POST:({request})=>api(()=>messageTestsStart(request))}}});
