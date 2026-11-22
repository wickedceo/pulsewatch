import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';
import { getWebsiteStatus } from './websiteStatus.js';

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('Pulsewatch authentication', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url === '/api/auth/me') return jsonResponse(401, {});
        if (url === '/api/websites') return jsonResponse(200, { data: [] });
        return jsonResponse(404, { message: 'Not found' });
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('requires sign-in, registers an account, and signs out', async () => {
    const user = userEvent.setup();
    fetch.mockImplementation(async (url, options = {}) => {
      if (url === '/api/auth/me') return jsonResponse(401, {});
      if (url === '/api/auth/register') {
        return jsonResponse(201, {
          data: { user: { id: 'user-1', email: 'dev@example.com' } },
        });
      }
      if (url === '/api/websites') return jsonResponse(200, { data: [] });
      if (url === '/api/auth/logout' && options.method === 'POST') {
        return jsonResponse(200, { success: true });
      }
      return jsonResponse(404, { message: 'Not found' });
    });

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Email address'), 'dev@example.com');
    await user.type(screen.getByLabelText('Password'), 'a sufficiently long password');
    await user.click(screen.getAllByRole('button', { name: 'Create account' }).at(-1));

    expect(await screen.findByRole('heading', { name: 'Know when it matters.' })).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/register',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
  });

  it('announces rejected credentials and keeps the dashboard protected', async () => {
    const user = userEvent.setup();
    fetch.mockImplementation(async (url, options = {}) => {
      if (url === '/api/auth/me') return jsonResponse(401, {});
      if (url === '/api/auth/login' && options.method === 'POST') {
        return jsonResponse(401, {
          success: false,
          message: 'Invalid email or password',
        });
      }
      return jsonResponse(200, { data: [] });
    });

    render(<App />);
    await screen.findByRole('heading', { name: 'Welcome back' });
    expect(screen.queryByRole('heading', { name: 'Know when it matters.' })).toBeNull();

    await user.type(screen.getByLabelText('Email address'), 'dev@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong password');
    await user.click(screen.getAllByRole('button', { name: 'Sign in' }).at(-1));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Invalid email or password'
    );
    expect(screen.queryByRole('heading', { name: 'Know when it matters.' })).toBeNull();
  });

  it('provides labelled, required credentials fields', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Welcome back' });

    expect(screen.getByLabelText('Email address').required).toBe(true);
    expect(screen.getByLabelText('Password').required).toBe(true);
  });
});

describe('Pulsewatch website management', () => {
  beforeEach(() => {
    let website = {
      id: 'website-1',
      name: 'Alpha',
      url: 'https://alpha.example',
      current_url_generation: 1,
      last_checked_at: '2025-01-01T12:00:00.000Z',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options = {}) => {
        if (url === '/api/auth/me') {
          return jsonResponse(200, {
            data: { user: { id: 'user-1', email: 'dev@example.com' } },
          });
        }

        if (url === '/api/websites/website-1' && options.method === 'PUT') {
          const changes = JSON.parse(options.body);
          website = {
            ...website,
            ...changes,
            current_url_generation:
              changes.url === website.url
                ? website.current_url_generation
                : website.current_url_generation + 1,
          };
          return jsonResponse(200, { message: 'Website updated successfully.' });
        }

        if (url === '/api/websites/website-1' && options.method === 'DELETE') {
          website = null;
          return jsonResponse(200, { message: 'Website deleted successfully.' });
        }

        if (url === '/api/websites') {
          return jsonResponse(200, { data: website ? [website] : [] });
        }

        if (url === '/api/monitor/website-1/stats') {
          return jsonResponse(200, {
            data: website.current_url_generation === 1
              ? { uptime_percentage: 99.5, average_response_time_ms: 100 }
              : {
                  uptime_percentage: null,
                  average_response_time_ms: null,
                },
          });
        }

        if (url === '/api/monitor/website-1/history') {
          return jsonResponse(200, {
            data: [{
              checked_at: '2025-01-01T12:00:00.000Z',
              response_time_ms: 100,
              status_code: 200,
              is_online: true,
              url_generation: 1,
            }],
          });
        }

        return jsonResponse(404, { message: 'Not found' });
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('edits a website and confirms history is retained before deleting it', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('heading', { name: 'Know when it matters.' });
    await user.click(await screen.findByRole('button', { name: 'Edit Alpha' }));
    await user.clear(screen.getByLabelText(/Website name/));
    await user.type(screen.getByLabelText(/Website name/), 'Alpha Updated');
    await user.clear(screen.getByLabelText('Website URL'));
    await user.type(screen.getByLabelText('Website URL'), 'https://new-alpha.example');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByRole('button', { name: 'Edit Alpha Updated' });
    expect(fetch).toHaveBeenCalledWith(
      '/api/websites/website-1',
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        body: JSON.stringify({
          name: 'Alpha Updated',
          url: 'https://new-alpha.example',
        }),
      })
    );
    expect(screen.queryByText('99.50%')).toBeNull();
    const updatedCard = screen.getByRole('button', {
      name: 'Edit Alpha Updated',
    }).closest('.website-card');
    expect(within(updatedCard).getByText('Pending')).toBeTruthy();
    expect(screen.getByText('No monitoring data yet')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Delete Alpha Updated' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(within(confirmation).getByText(/monitoring history will be permanently deleted/)).toBeTruthy();
    await user.click(within(confirmation).getByRole('button', { name: 'Delete website' }));

    await screen.findByText('No websites yet. Add your first website to get started.');
    expect(fetch).toHaveBeenCalledWith(
      '/api/websites/website-1',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' })
    );
  });
});

describe('website status classification', () => {
  it('distinguishes restricted HTTP responses from offline and other errors', () => {
    expect(getWebsiteStatus({ status_code: 403, is_online: true }).label).toBe('Restricted');
    expect(getWebsiteStatus({ status_code: 429, is_online: false }).label).toBe('Restricted');
    expect(getWebsiteStatus({ status_code: 404, is_online: false }).label).toBe('Client error');
    expect(getWebsiteStatus({ status_code: 503, is_online: false }).label).toBe('Server error');
    expect(getWebsiteStatus({ status_code: null, is_online: false }).label).toBe('Offline');
  });
});
