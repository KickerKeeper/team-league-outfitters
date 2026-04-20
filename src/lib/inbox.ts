import { getStore } from '@netlify/blobs';

export interface Submission {
  id: string;
  formName: string;
  data: Record<string, string>;
  createdAt: string;
  status: 'new' | 'read' | 'completed';
  paid?: boolean;
  paidAt?: string;
  messages: Message[];
}

export interface Message {
  type: 'note' | 'sent' | 'received';
  body: string;
  fullBody?: string;
  timestamp: string;
  from?: string;
  to?: string;
  subject?: string;
  messageId?: string;
}

export async function getSubmissions(): Promise<Submission[]> {
  const store = getStore('inbox');

  try {
    const index = await store.get('index');
    if (!index) return [];

    const ids: string[] = JSON.parse(index);
    const submissions: Submission[] = [];

    for (const id of ids) {
      try {
        const data = await store.get(`submission/${id}`);
        if (data) {
          const sub = JSON.parse(data);
          // Migrate old format: convert 'replies' to 'messages'
          if (sub.replies && !sub.messages) {
            sub.messages = sub.replies.map((r: any) => ({
              type: r.to === 'internal' ? 'note' : 'sent',
              body: r.body,
              timestamp: r.sentAt,
              to: r.to === 'internal' ? undefined : r.to,
            }));
            delete sub.replies;
          }
          if (!sub.messages) sub.messages = [];
          submissions.push(sub);
        }
      } catch { /* skip missing */ }
    }

    return submissions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const store = getStore('inbox');
  try {
    const data = await store.get(`submission/${id}`);
    if (!data) return null;
    const sub = JSON.parse(data);
    if (sub.replies && !sub.messages) {
      sub.messages = sub.replies.map((r: any) => ({
        type: r.to === 'internal' ? 'note' : 'sent',
        body: r.body,
        timestamp: r.sentAt,
        to: r.to === 'internal' ? undefined : r.to,
      }));
      delete sub.replies;
    }
    if (!sub.messages) sub.messages = [];
    return sub;
  } catch {
    return null;
  }
}

export async function saveSubmission(sub: Submission) {
  const store = getStore('inbox');
  await store.set(`submission/${sub.id}`, JSON.stringify(sub));

  let ids: string[] = [];
  try {
    const index = await store.get('index');
    if (index) ids = JSON.parse(index);
  } catch { /* new index */ }

  if (!ids.includes(sub.id)) {
    ids.push(sub.id);
    await store.set('index', JSON.stringify(ids));
  }
}

export async function updateSubmissionStatus(id: string, status: Submission['status']) {
  const store = getStore('inbox');
  const data = await store.get(`submission/${id}`);
  if (!data) return null;

  const sub: Submission = JSON.parse(data);
  sub.status = status;
  await store.set(`submission/${id}`, JSON.stringify(sub));
  return sub;
}

export async function setPaid(id: string, paid: boolean): Promise<Submission | null> {
  const store = getStore('inbox');
  const data = await store.get(`submission/${id}`);
  if (!data) return null;

  const sub: Submission = JSON.parse(data);
  sub.paid = paid;
  if (paid) {
    sub.paidAt = new Date().toISOString();
  } else {
    delete sub.paidAt;
  }
  await store.set(`submission/${id}`, JSON.stringify(sub));
  return sub;
}

export async function addMessage(id: string, message: Message) {
  const store = getStore('inbox');
  const data = await store.get(`submission/${id}`);
  if (!data) return null;

  const sub: Submission = JSON.parse(data);
  if (!sub.messages) sub.messages = [];
  sub.messages.push(message);
  if (message.type === 'received') sub.status = 'new'; // Mark as new when customer replies
  await store.set(`submission/${id}`, JSON.stringify(sub));
  return sub;
}

// Find a submission by customer email (for matching inbound replies)
export async function findByEmail(email: string): Promise<Submission | null> {
  const submissions = await getSubmissions();
  // Find the most recent submission from this email
  return submissions.find(s => s.data.email?.toLowerCase() === email.toLowerCase()) || null;
}
