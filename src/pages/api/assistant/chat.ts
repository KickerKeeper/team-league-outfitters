import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../lib/auth';
import { getSubmissions } from '../../../lib/inbox';
import { getStats } from '../../../lib/analytics';
import { saveSpec } from '../../../lib/specs';
import { SITE_DOCUMENTATION } from '../../../lib/site-docs';

export const prerender = false;

const GEMINI_MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `You are the AI assistant for Georgetown Jerseys admin portal. You help Jamie Nadeau (the owner) manage her business.

You have three modes:

## Mode 1: Help & Documentation
Answer questions about how the site works, admin features, workflows, email, orders, etc. Use the documentation below.

## Mode 2: Data Queries
Answer questions about orders, analytics, and business data. You have access to live data that will be provided in each message.

## Mode 3: Feature Requests & Defect Reports
When the user describes a new feature they want or a bug to fix:
1. Identify if it's a feature request or defect report
2. Ask 2-3 clarifying questions to fully understand the need (if the request isn't already clear)
3. Once you have enough info, generate a spec in this exact format:

---SPEC---
{
  "type": "feature" or "defect",
  "title": "Short title",
  "description": "Detailed description of what's needed",
  "spec": "Full technical specification including:\\n- What needs to change\\n- Which files/components are likely involved\\n- Acceptance criteria\\n- Edge cases to consider"
}
---END_SPEC---

When you output a spec block, it will be automatically saved. Tell the user it's been saved and they can view it in the Specs tab or run Claude Code to implement it.

## Important Rules
- Be concise and direct. Jamie is busy.
- For order questions, reference the actual data provided.
- For how-to questions, give step-by-step instructions.
- Don't make up data — if you don't have info, say so.
- When generating specs, be thorough but practical. This is a local business site, not a SaaS product.

## Site Documentation
${SITE_DOCUMENTATION}`;

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  if (!getSessionFromCookie(cookie)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const apiKey = import.meta.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), { status: 500 });
  }

  try {
    const { messages } = await request.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid messages' }), { status: 400 });
    }

    // Gather live context data
    let contextData = '';
    try {
      const submissions = await getSubmissions();
      const orders = submissions.filter(s => s.formName !== 'email');
      const emailCount = submissions.filter(s => s.formName === 'email').length;
      const openCount = orders.filter(s => s.status !== 'completed').length;
      const closedCount = orders.filter(s => s.status === 'completed').length;
      const paidCount = orders.filter(s => s.paid).length;

      const recentOrders = orders
        .slice(0, 10)
        .map(s => {
          const status = s.status === 'completed' ? 'Closed' : 'Open';
          const paid = s.paid ? 'Paid' : 'Unpaid';
          return `- ${s.data.name || 'Unknown'} | ${s.data.team || ''} | ${s.data.sport || ''} | ${status} · ${paid} | ${new Date(s.createdAt).toLocaleDateString()}`;
        })
        .join('\n');

      contextData = `\n\n## Live Data (as of now)
Orders: ${orders.length} total (${openCount} open, ${closedCount} closed, ${paidCount} paid) | Email threads: ${emailCount}

Recent orders:
${recentOrders || 'No orders yet'}`;
    } catch {
      contextData = '\n\n(Could not load live data)';
    }

    try {
      const stats = await getStats(7);
      if (stats.length > 0) {
        const totalViews = stats.reduce((a, d) => a + (d.views || 0), 0);
        const totalVisitors = stats.reduce((a, d) => a + (d.uniqueVisitorCount || 0), 0);
        contextData += `\n\nAnalytics (last 7 days): ${totalViews} page views, ${totalVisitors} unique visitors`;
      }
    } catch {}

    // Build Gemini API request
    const geminiMessages = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // Inject context data into the last user message
    const lastMsg = geminiMessages[geminiMessages.length - 1];
    if (lastMsg.role === 'user') {
      lastMsg.parts[0].text += contextData;
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const err = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, err);
      return new Response(JSON.stringify({ error: 'AI service error' }), { status: 500 });
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I couldn\'t generate a response.';

    // Check if response contains a spec to save
    let savedSpecId = null;
    const specMatch = responseText.match(/---SPEC---\s*([\s\S]*?)\s*---END_SPEC---/);
    if (specMatch) {
      try {
        const specData = JSON.parse(specMatch[1]);
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await saveSpec({
          id,
          type: specData.type || 'feature',
          title: specData.title || 'Untitled',
          description: specData.description || '',
          clarifications: [],
          spec: specData.spec || '',
          status: 'ready',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        savedSpecId = id;
      } catch (e) {
        console.error('Failed to save spec:', e);
      }
    }

    // Clean the spec block from the visible response
    const cleanResponse = responseText.replace(/---SPEC---[\s\S]*?---END_SPEC---/, '').trim();

    return new Response(JSON.stringify({
      response: cleanResponse,
      savedSpecId,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Assistant error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
