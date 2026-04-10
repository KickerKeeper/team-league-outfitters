import { getStore } from '@netlify/blobs';

export interface Submission {
  id: string;
  formName: string;
  data: Record<string, string>;
  createdAt: string;
  status: 'new' | 'read' | 'completed';
  replies: Reply[];
}

export interface Reply {
  body: string;
  sentAt: string;
  to: string;
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
        if (data) submissions.push(JSON.parse(data));
      } catch { /* skip missing */ }
    }

    // Sort newest first
    return submissions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

export async function saveSubmission(sub: Submission) {
  const store = getStore('inbox');

  // Save the submission
  await store.set(`submission/${sub.id}`, JSON.stringify(sub));

  // Update the index
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

export async function addReply(id: string, reply: Reply) {
  const store = getStore('inbox');
  const data = await store.get(`submission/${id}`);
  if (!data) return null;

  const sub: Submission = JSON.parse(data);
  sub.replies.push(reply);
  sub.status = 'read';
  await store.set(`submission/${id}`, JSON.stringify(sub));
  return sub;
}
