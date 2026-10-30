import { describe, expect, it } from 'vitest';
import { templates } from '../src/lib/mailer.js';

const pass = {
  name: 'Asha <Rao>', examName: 'Campus Placement Test', examId: 'CPT-26', userId: 'WUE261004', password: 'uGQ&rVM#2m',
  inviteLink: 'https://example.com/join/abc', startTime: '31 Oct 2026, 10:00 am', appLink: 'https://example.com/download',
};

describe('email templates', () => {
  it('leads the credentials email with the logo, the exam pass and a Join button', () => {
    const { html, text } = templates.credentials('Your sign-in details', 'Hello Asha', pass);
    expect(html).toContain('http://localhost:3000/images/logo.png');
    expect(html).toContain('Your exam pass');
    expect(html).toContain('href="https://example.com/join/abc"');
    expect(html).toContain('WUE261004');
    expect(html).toContain('Powered by <b style="color:#0A4DA6">Tech Knights</b>');
    expect(text).toBe('Hello Asha');
  });

  it('escapes names and passwords so they cannot inject markup', () => {
    const { html } = templates.credentials('s', 'b', pass);
    expect(html).toContain('Asha &lt;Rao&gt;');
    expect(html).toContain('uGQ&amp;rVM#2m');
    expect(html).not.toContain('<Rao>');
  });

  it('keeps the plain layout when no exam pass is given', () => {
    expect(templates.credentials('s', 'Hello').html).not.toContain('Your exam pass');
  });
});
