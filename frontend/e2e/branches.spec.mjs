import { test, expect } from '@playwright/test';

const config = {
  availableModels: [{ label: 'GPT 5.6 Sol', value: 'gpt-5.6-sol', supportsSarcastic: true }],
  defaultModel: 'gpt-5.6-sol',
  search: { enabled: true, modes: ['off', 'auto', 'on'], defaultMode: 'auto' },
  limits: { maxMessageLength: 12000, maxMessages: 40, maxContextLength: 48000 }
};

test('response versions preserve both downstream branches and regenerate earlier turns', async ({ page }) => {
  const requests = [];
  let version = 0;
  await page.route('**/api/chat', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: config });
    const body = route.request().postDataJSON();
    requests.push(body);
    const question = body.messages.at(-1).content;
    const content = question === 'Starting question' ? `Version ${++version}` : `Follow-up from ${body.messages.at(-2).content}`;
    return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ content })}\n\ndata: [DONE]\n\n` });
  });
  await page.goto('/');
  await expect(page.getByLabel('Your model')).toHaveValue('gpt-5.6-sol');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  const root = page.locator('.message-assistant').first();
  await input.fill('Starting question');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(root.locator('.answer-text')).toHaveText('Version 1');
  await root.getByRole('button', { name: 'Try again' }).click();
  await expect(root.getByRole('group', { name: 'Response versions' })).toHaveText('2 of 2');
  await expect(root.locator('.answer-text')).toHaveText('Version 2');
  await root.getByRole('button', { name: 'Try again' }).click();
  await expect(root.getByRole('group', { name: 'Response versions' })).toHaveText('3 of 3');
  await root.getByRole('button', { name: 'Previous response' }).click();
  await expect(root.locator('.answer-text')).toHaveText('Version 2');
  await root.getByRole('button', { name: 'Previous response' }).click();
  await expect(root.locator('.answer-text')).toHaveText('Version 1');
  await expect(root.getByRole('button', { name: 'Previous response' })).toBeDisabled();
  expect(requests).toHaveLength(3);

  await input.fill('Continue the original');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Follow-up from Version 1', { exact: true })).toBeVisible();
  expect(requests.at(-1).messages.map((message) => message.content)).toEqual(['Starting question', 'Version 1', 'Continue the original']);

  await root.getByRole('button', { name: 'Next response' }).click();
  await expect(page.getByText('Follow-up from Version 1', { exact: true })).toHaveCount(0);
  await expect(root.locator('.answer-text')).toHaveText('Version 2');
  await input.fill('Continue the alternative');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Follow-up from Version 2', { exact: true })).toBeVisible();
  expect(requests.at(-1).messages.map((message) => message.content)).toEqual(['Starting question', 'Version 2', 'Continue the alternative']);

  await root.getByRole('button', { name: 'Previous response' }).click();
  await expect(page.getByText('Follow-up from Version 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Follow-up from Version 2', { exact: true })).toHaveCount(0);
  await root.getByRole('button', { name: 'Try again' }).click();
  await expect(root.getByRole('group', { name: 'Response versions' })).toHaveText('4 of 4');
  expect(requests.at(-1).messages).toEqual([{ role: 'user', content: 'Starting question' }]);
  await expect(page.getByText('Follow-up from Version 1', { exact: true })).toHaveCount(0);
  for (let i = 0; i < 3; i++) await root.getByRole('button', { name: 'Previous response' }).click();
  await expect(root.locator('.answer-text')).toHaveText('Version 1');
  await expect(page.getByText('Follow-up from Version 1', { exact: true })).toBeVisible();
});

test('Auto shows whether the server used the web without expanding the composer', async ({ page }) => {
  const requests = [];
  await page.route('**/api/chat', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: config });
    const body = route.request().postDataJSON();
    requests.push(body);
    const search = body.messages.at(-1).content.includes('latest');
    const events = [
      { type: 'web', mode: body.searchMode, action: search ? 'search' : 'answer' },
      ...(search ? [{ type: 'sources', query: 'latest news', sources: [{ id: 1, title: 'Source', url: 'https://example.org/', domain: 'example.org' }] }] : []),
      { content: search ? 'An update [1].' : 'Hello.' }
    ];
    return route.fulfill({ contentType: 'text/event-stream', body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n' });
  });
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Web search' })).toHaveValue('auto');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Hello');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Answered without web', { exact: true })).toBeVisible();
  await expect(page.locator('.sources')).toHaveCount(0);
  await input.fill('What is the latest news?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Web-assisted answer', { exact: true })).toBeVisible();
  await expect(page.locator('.sources')).toHaveCount(1);
  expect(requests.every((request) => request.searchMode === 'auto')).toBe(true);
});
