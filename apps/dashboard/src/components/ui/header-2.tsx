'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, DoorOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MenuToggleIcon } from '@/components/ui/menu-toggle-icon';
import { useScroll } from '@/components/ui/use-scroll';
import { docsHref } from '@/lib/public-urls';

const NAV_LINKS = [
  { label: 'Platform', href: '/platform' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Rankings', href: '/rankings' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Security', href: '/security' },
  { label: 'Status', href: '/status' },
  { label: 'Docs', href: docsHref('/') },
];

function isNavActive(href: string, pathname: string) {
  if (href === '/docs' || href.startsWith('/docs/')) {
    return pathname === '/docs' || pathname.startsWith('/docs/');
  }
  return pathname === href;
}

interface HeaderProps {
  signedIn?: boolean;
}

export function Header({ signedIn = false }: HeaderProps) {
  const [open, setOpen] = React.useState(false);
  const scrolled = useScroll(10);
  const pathname = usePathname();

  React.useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 mx-auto w-full transition-all duration-300 ease-out',
        scrolled && !open
          ? 'border-b border-slate-200/80 bg-white/90 shadow-sm shadow-slate-950/5 backdrop-blur-xl md:top-3 md:max-w-5xl md:rounded-2xl md:border md:border-slate-200/80'
          : 'border-b border-white/70 bg-white/75 backdrop-blur-xl',
        open && 'bg-white/95',
      )}
    >
      <nav
        className={cn(
          'flex h-20 w-full items-center justify-between px-6 transition-all duration-300 ease-out lg:px-8',
          scrolled && !open && 'md:h-14 md:px-5',
        )}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-blue-900/10 transition-all duration-300 ease-out">
            <DoorOpen className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-950">OpenDoor</span>
        </Link>

          {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = isNavActive(link.href, pathname);
            return (
              <Link
                key={link.label}
                href={link.href}
                scroll
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition',
                  active
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-3 md:flex">
          {signedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-xl shadow-slate-950/10 transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              Open dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Sign in
              </Link>
              <Link
                href="/get-started"
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-xl shadow-slate-950/10 transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setOpen(!open)}
          className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          <MenuToggleIcon open={open} className="h-5 w-5 text-slate-700" duration={300} />
        </button>
      </nav>

      {/* Mobile menu overlay */}
      <div
        className={cn(
          'fixed inset-x-0 top-[80px] bottom-0 z-50 border-t border-slate-200/80 bg-white/95 backdrop-blur-xl md:hidden',
          open ? 'flex flex-col' : 'hidden',
        )}
      >
        <div
          data-slot={open ? 'open' : 'closed'}
          className={cn(
            'data-[slot=open]:animate-in data-[slot=open]:zoom-in-95 data-[slot=closed]:animate-out data-[slot=closed]:zoom-out-95 ease-out',
            'flex h-full w-full flex-col justify-between gap-y-2 p-6',
          )}
        >
          <div className="grid gap-1">
            {NAV_LINKS.map((link) => {
              const active = isNavActive(link.href, pathname);
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  scroll
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-2xl px-4 py-3 text-base font-medium transition',
                    active
                      ? 'bg-slate-950 text-white'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950',
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 pb-4">
            {signedIn ? (
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Open dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  Sign in
                </Link>
                <Link
                  href="/get-started"
                  onClick={() => setOpen(false)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Get started <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
