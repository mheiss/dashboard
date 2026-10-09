import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, DefaultUrlSerializer, Router, RouterStateSnapshot } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '../backend/session.service';
import { PopupService } from '../popup/popup.service';
import { adminGuard, Login } from './login';

describe('Admin password popup', () => {
  const session = {
    session: signal<{ username: string; admin: boolean } | null>(null),
    load: vi.fn(),
    login: vi.fn(),
  };
  const close = vi.fn();
  const home = new DefaultUrlSerializer().parse('/home');
  let closed: Subject<string | undefined>;
  const popup = { open: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    session.session.set(null);
    session.load.mockResolvedValue(false);
    session.login.mockResolvedValue(undefined);
    closed = new Subject<string | undefined>();
    popup.open.mockReturnValue({ closed });
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionService, useValue: session },
        { provide: DialogRef, useValue: { close } },
        { provide: DIALOG_DATA, useValue: { disableClose: false } },
        { provide: PopupService, useValue: popup },
        { provide: Router, useValue: { createUrlTree: vi.fn(() => home) } },
      ],
    });
  });

  const guard = () => TestBed.runInInjectionContext(() =>
    adminGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );

  it('renders only a password field', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="password"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="username"]')).toBeNull();
  });

  it('logs in with the password and closes after success', async () => {
    const fixture = TestBed.createComponent(Login);
    fixture.componentInstance.password = 'fixture-password';
    await fixture.componentInstance.login();
    expect(session.login).toHaveBeenCalledWith('fixture-password');
    expect(close).toHaveBeenCalledWith('authenticated');
    expect(fixture.componentInstance.password).toBe('');
  });

  it('keeps the popup open after a failed login', async () => {
    session.login.mockRejectedValue(new Error('Invalid password'));
    const fixture = TestBed.createComponent(Login);
    fixture.componentInstance.password = 'wrong-password';
    await fixture.componentInstance.login();
    expect(close).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).not.toBeNull();
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('allows an existing admin session without showing the popup', async () => {
    session.session.set({ username: 'admin', admin: true });
    session.load.mockResolvedValue(true);
    expect(await guard()).toBe(true);
    expect(popup.open).not.toHaveBeenCalled();
  });

  it('continues to settings after popup authentication', async () => {
    const result = guard();
    await Promise.resolve();
    expect(popup.open).toHaveBeenCalledWith(Login, expect.objectContaining({ disableClose: false }));
    session.session.set({ username: 'admin', admin: true });
    closed.next('authenticated');
    expect(await result).toBe(true);
  });

  it('returns to the dashboard when the popup is cancelled', async () => {
    const result = guard();
    await Promise.resolve();
    closed.next(undefined);
    expect(await result).toBe(home);
  });
});
