import { createFileRoute } from '@tanstack/react-router';
import { api } from '@/lib/server/automation.server';
import { messageTestsGet, messageTestsSave } from '@/lib/server/message-tests.server';
export const Route = createFileRoute('/api/message-tests')({server:{handlers:{GET:({request})=>api(()=>messageTestsGet(request)),PUT:({request})=>api(()=>messageTestsSave(request))}}});
