import { test, expect } from '@playwright/test';

const configuration = {
  availableModels: [
    { label: 'GPT 5.6 Sol', value: 'gpt-5.6-sol', supportsSarcastic: true },
    { label: 'GPT 5.6 Luna', value: 'gpt-5.6-luna', supportsSarcastic: true },
    { label: 'GPT 5.6 Terra', value: 'gpt-5.6-terra', supportsSarcastic: true },
    { label: 'Claude Opus 4.8', value: 'claude-opus-4.8', supportsSarcastic: false }
  ],
  defaultModel: 'gpt-5.6-sol',
  search: { enabled: true, maxQueryLength: 400, maxResults: 5 },
  limits: { maxMessageLength: 12000, maxMessages: 40, maxContextLength: 48000 }
};
const sse = (events) => events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join('');

async function setup(page, reply) {
  const requests = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/chat', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: configuration });
    requests.push(route.request().postDataJSON());
    return reply(route, requests.length);
  });
  await page.goto('/');
  await expect(page.getByLabel('Your model')).toHaveValue('gpt-5.6-sol');
  return { requests, errors };
}

test('welcome, model selection, theme and mobile layout', async ({ page }, testInfo) => {
  const { errors } = await setup(page, (route) => route.fulfill({ contentType: 'text/event-stream', body: sse([{ content: 'OK' }, '[DONE]']) }));
  await expect(page.getByRole('heading', { name: 'Think it through. Look it up.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search web' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Your model').locator('option')).toHaveCount(4);
  await page.getByLabel('Your model').selectOption('claude-opus-4.8');
  await expect(page.getByLabel('Response tone')).toBeDisabled();
  await page.getByLabel('Your model').selectOption('gpt-5.6-sol');
  await expect(page.getByLabel('Response tone')).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('welcome.png'), fullPage: true });
  await page.getByRole('button', { name: 'Switch to dark theme' }).filter({ visible: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: testInfo.outputPath('dark.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('normal chat and follow-up preserve Unicode and completed history', async ({ page }) => {
  const { requests, errors } = await setup(page, (route) => route.fulfill({
    contentType: 'text/event-stream', body: sse([{ content: 'Hello, 안녕하세요 🌍\n\n' }, { content: '**A clear answer.**' }, '[DONE]'])
  }));
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Hello');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Answer complete', { exact: true })).toBeVisible();
  await expect(page.getByText('Hello, 안녕하세요 🌍')).toBeVisible();
  expect(requests[0].webSearch).toBe(false);
  expect(requests[0].messages).toEqual([{ role: 'user', content: 'Hello' }]);
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('A follow-up');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Answer complete', { exact: true })).toHaveCount(2);
  expect(requests[1].messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(errors).toEqual([]);
});

test('web search cites actual sources without rendering injected HTML, images or links', async ({ page }, testInfo) => {
  const external = [];
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4173')) external.push(request.url()); });
  const { requests, errors } = await setup(page, (route) => route.fulfill({
    contentType: 'text/event-stream',
    body: sse([
      { type: 'sources', query: 'MDN fetch docs', sources: [{ id: 1, title: 'Fetch API - MDN', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API', domain: 'developer.mozilla.org' }] },
      { content: 'Fetch retrieves resources. [1](source:1) It also returns promises [1].\n\n`array[1]` Unknown [9].\n\n![tracking](https://attacker.example/pixel)\n\n<script>window.hacked=true</script>\n\n[Unsafe](javascript:alert(1)) [Invented source](https://attacker.example/)' },
      '[DONE]'
    ])
  }));
  await page.getByRole('button', { name: 'Search web' }).click();
  await expect(page.getByText(/Your query, or the first 400 characters/)).toBeVisible();
  await page.getByLabel('Search query (optional)').fill('MDN fetch docs');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Explain fetch');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Web-assisted answer', { exact: true })).toBeVisible();
  expect(requests[0].searchQuery).toBe('MDN fetch docs');
  expect(requests[0].webSearch).toBe(true);
  await page.locator('.sources summary').click();
  await expect(page.getByRole('link', { name: 'Fetch API - MDN', exact: false })).toBeVisible();
  await expect(page.locator('.answer-text a')).toHaveCount(2);
  await expect(page.locator('.answer-text a').first()).toHaveAttribute('href', 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API');
  await expect(page.locator('.answer-text a').last()).toHaveAttribute('href', 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API');
  await expect(page.locator('.answer-text code')).toHaveText('array[1]');
  await expect(page.locator('.answer-text img, .answer-text script')).toHaveCount(0);
  expect(await page.evaluate(() => window.hacked)).toBeUndefined();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('search-answer.png'), fullPage: true });
});

test('search failures stay explicit, keep partial text and can retry with another model', async ({ page }) => {
  const { requests } = await setup(page, (route, count) => route.fulfill({
    contentType: 'text/event-stream',
    body: count === 1
      ? sse([{ content: 'A partial answer.' }, { error: 'The free search provider is at its limit. Turn search off or try again later.' }])
      : sse([{ content: 'Recovered answer.' }, '[DONE]'])
  }));
  await page.getByRole('button', { name: 'Search web' }).click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('A question');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('alert')).toContainText('free search provider');
  await expect(page.getByText('A partial answer.')).toBeVisible();
  await expect(page.getByText('Answer complete', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Search web' }).click();
  await page.getByLabel('Your model').selectOption('gpt-5.6-luna');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Recovered answer.')).toBeVisible();
  expect(requests[1].messages).toHaveLength(1);
  expect(requests[1].model).toBe('gpt-5.6-luna');
  expect(requests[0].webSearch).toBe(true);
  expect(requests[1].webSearch).toBe(false);
});

test('stop, download and clear controls work without persisting conversation', async ({ page }) => {
  let held;
  await setup(page, (route) => { held = route; });
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('A slow question');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Stop response' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop response' }).click();
  await expect(page.getByText('Response stopped.', { exact: true })).toBeVisible();
  if (held) await held.abort();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download conversation' }).click();
  expect((await download).suggestedFilename()).toMatch(/^jawon-chat-.*\.md$/);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'New conversation', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: 'Think it through. Look it up.' })).toBeVisible();
});

test('keyboard handling preserves shift-enter and IME composition', async ({ page }) => {
  const { requests } = await setup(page, (route) => route.fulfill({ contentType: 'text/event-stream', body: sse([{ content: 'OK' }, '[DONE]']) }));
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('안녕');
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 });
  expect(requests).toHaveLength(0);
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('안녕\n');
  await input.press('Enter');
  await expect(page.getByText('Answer complete', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
});

test('model configuration failures expose reconnect instead of a broken composer', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/chat', (route) => {
    attempts += 1;
    return attempts === 1 ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.fulfill({ json: configuration });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('model list is unavailable');
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
  await page.getByRole('button', { name: 'Reconnect' }).click();
  await expect(page.getByLabel('Your model')).toHaveValue('gpt-5.6-sol');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
