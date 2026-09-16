import { test, expect } from '@playwright/test';

test.use({ timezoneId: 'Asia/Seoul' });

const config = {
  availableModels: [{ label: 'GPT 5.6 Sol', value: 'gpt-5.6-sol', supportsSarcastic: true }],
  defaultModel: 'gpt-5.6-sol',
  search: { enabled: true, modes: ['off', 'auto', 'on'], defaultMode: 'auto' },
  limits: { maxMessageLength: 12000, maxMessages: 40, maxContextLength: 48000 }
};

test('browser timezone, superscript citations, and precise code/answer copying work together', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (text) => { window.copiedText = text; } }
    });
  });
  const requests = [];
  const code = 'const values = [1, 2];\n  console.log(values[1]);\n';
  await page.route('**/api/chat', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: config });
    requests.push(route.request().postDataJSON());
    const events = [
      { type: 'sources', query: 'JavaScript arrays', sources: [{ id: 1, title: 'Reference', domain: 'example.org', url: 'https://example.org/' }] },
      { content: 'An array example [1](source:1), another citation [1], and a direct source [1](https://example.org/).\n\n' +
        '[Documentation](https://example.org/) and unknown [9].\n\n```javascript\n' + code + '```\n\nInline `values[1]` stays code.' }
    ];
    return route.fulfill({ contentType: 'text/event-stream', body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n' });
  });
  await page.goto('/');
  await expect(page.getByLabel('Your model')).toHaveValue('gpt-5.6-sol');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Explain arrays');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Web-assisted answer', { exact: true })).toBeVisible();
  expect(requests[0].timeZone).toBe('Asia/Seoul');
  expect(requests[0].currentTime).toBeUndefined();
  await expect(page.locator('.citation')).toHaveCount(3);
  await expect(page.locator('.citation a').first()).toHaveAccessibleName('Source 1: Reference');
  await expect(page.locator('.citation a').first()).toHaveAttribute('title', 'Reference — example.org');
  expect(await page.locator('.citation').first().evaluate((element) =>
    parseFloat(getComputedStyle(element).fontSize) < parseFloat(getComputedStyle(element.parentElement).fontSize)
  )).toBe(true);
  await expect(page.locator('.citation a', { hasText: 'Documentation' })).toHaveCount(0);
  await expect(page.locator('.answer-text a', { hasText: 'Documentation' })).toHaveCount(1);
  await expect(page.locator('.code-block .citation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy code', exact: true }).click();
  expect(await page.evaluate(() => window.copiedText)).toBe(code);
  await expect(page.getByRole('status')).toHaveText('Code copied.');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  const copied = await page.evaluate(() => window.copiedText);
  expect(copied).toContain('https://example.org/');
  expect(copied).not.toContain('source:1');
  expect(copied).toContain(code);
  await expect(page.getByRole('status')).toHaveText('Answer copied.');
});

test('clipboard permission failures remain visible', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async () => { throw new DOMException('Permission denied', 'NotAllowedError'); } }
    });
  });
  await page.route('**/api/chat', (route) => route.request().method() === 'GET'
    ? route.fulfill({ json: config })
    : route.fulfill({ contentType: 'text/event-stream', body: 'data: {"content":"```js\\nconst x = 1;\\n```"}\n\ndata: [DONE]\n\n' }));
  await page.goto('/');
  await expect(page.getByLabel('Your model')).toHaveValue('gpt-5.6-sol');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Example code');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Answered without web', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Copy code', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Clipboard access is unavailable');
});
