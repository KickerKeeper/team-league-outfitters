import { getStore } from '@netlify/blobs';

export interface FeatureSpec {
  id: string;
  type: 'feature' | 'defect';
  title: string;
  description: string;
  clarifications: string[];
  spec: string;
  status: 'draft' | 'ready' | 'in-progress' | 'done';
  createdAt: string;
  updatedAt: string;
}

export async function saveSpec(spec: FeatureSpec) {
  const store = getStore('tlo-specs');
  await store.set(`spec/${spec.id}`, JSON.stringify(spec));

  let ids: string[] = [];
  try {
    const index = await store.get('index');
    if (index) ids = JSON.parse(index);
  } catch {}

  if (!ids.includes(spec.id)) {
    ids.push(spec.id);
    await store.set('index', JSON.stringify(ids));
  }
}

export async function getSpecs(): Promise<FeatureSpec[]> {
  const store = getStore('tlo-specs');
  try {
    const index = await store.get('index');
    if (!index) return [];

    const ids: string[] = JSON.parse(index);
    const specs: FeatureSpec[] = [];

    for (const id of ids) {
      try {
        const data = await store.get(`spec/${id}`);
        if (data) specs.push(JSON.parse(data));
      } catch {}
    }

    return specs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

export async function getSpec(id: string): Promise<FeatureSpec | null> {
  const store = getStore('tlo-specs');
  try {
    const data = await store.get(`spec/${id}`);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}
