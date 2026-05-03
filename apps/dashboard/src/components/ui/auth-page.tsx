'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from './button';
import {
	AtSignIcon,
	ChevronLeftIcon,
	DoorOpen,
	LogIn,
	UserPlus,
	Shield,
	Moon,
	Sun,
} from 'lucide-react';
import { Input } from './input';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import Link from 'next/link';

export function AuthPage() {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [name, setName] = useState('');
	const [orgName, setOrgName] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const [ssoLoading, setSsoLoading] = useState(false);
	const [mode, setMode] = useState<'password' | 'sso' | 'signup'>('password');
	const [orgSlug, setOrgSlug] = useState('');
	const router = useRouter();
	const searchParams = useSearchParams();
	const ssoError = searchParams.get('error');
	const ssoSlug = searchParams.get('sso');
	const { theme, setTheme } = useTheme();

	React.useEffect(() => {
		if (ssoSlug) {
			setOrgSlug(ssoSlug);
			setMode('sso');
			window.location.href = `/api/auth/sso?org=${encodeURIComponent(ssoSlug)}`;
		}
	}, [ssoSlug]);

	async function handleLogin(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError('');
		const res = await fetch('/api/auth/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password }),
		});
		if (res.ok) {
			router.push('/dashboard');
			router.refresh();
		} else {
			const data = await res.json();
			setError(data.error || 'Login failed');
		}
		setLoading(false);
	}

	async function handleSignup(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError('');
		const res = await fetch('/api/auth/signup', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password, name, orgName }),
		});
		if (res.ok) {
			router.push('/dashboard');
			router.refresh();
		} else {
			const data = await res.json();
			setError(data.error || 'Sign up failed');
		}
		setLoading(false);
	}

	function handleSSO(e: React.FormEvent) {
		e.preventDefault();
		if (!orgSlug.trim()) return;
		setSsoLoading(true);
		window.location.href = `/api/auth/sso?org=${encodeURIComponent(orgSlug.trim())}`;
	}

	const ssoErrorMessage =
		ssoError === 'sso_failed' ? 'SSO authentication failed' :
		ssoError === 'org_not_found' ? 'Organization not found' :
		ssoError === 'sso_disabled' ? 'SSO is not enabled for your organization' :
		ssoError === 'invalid_org' ? 'Invalid organization' :
		ssoError ? 'SSO callback failed' : null;

	return (
		<main className="relative md:h-screen md:overflow-hidden lg:grid lg:grid-cols-2">
			{/* Left Panel */}
			<div className="relative hidden h-full flex-col border-r bg-zinc-50 p-10 dark:bg-zinc-950 lg:flex">
				<div className="absolute inset-0 z-10 bg-gradient-to-t from-background to-transparent" />
				<div className="z-10 flex items-center justify-between">
					<Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
						<DoorOpen className="size-6 text-indigo-600 dark:text-indigo-400" />
						<p className="text-xl font-semibold text-zinc-900 dark:text-white">OpenDoor</p>
					</Link>
					<button
						onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
						className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
					>
						{theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
					</button>
				</div>
				<div className="z-10 mt-auto">
					<blockquote className="space-y-2">
						<p className="text-lg italic text-zinc-600 dark:text-zinc-300">
							&ldquo;The LLM gateway built for teams. Route to GPT-4o, Claude,
							Gemini and open models through one API.&rdquo;
						</p>
						<footer className="font-mono text-sm font-semibold text-zinc-500 dark:text-zinc-400">
							~ OpenDoor
						</footer>
					</blockquote>
				</div>
				<div className="absolute inset-0">
					<FloatingPaths position={1} />
					<FloatingPaths position={-1} />
				</div>
			</div>

			{/* Right Panel */}
			<div className="relative flex min-h-screen flex-col justify-center bg-white p-4 dark:bg-zinc-950">
				<div
					aria-hidden
					className="absolute inset-0 isolate -z-10 opacity-60 contain-strict"
				>
					<div className="absolute top-0 right-0 h-[320px] w-[140px] -translate-y-[87.5%] rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,rgba(0,0,0,0.06)_0,rgba(0,0,0,0.02)_50%,rgba(0,0,0,0.01)_80%)] dark:bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,rgba(255,255,255,0.06)_0,rgba(255,255,255,0.02)_50%,rgba(255,255,255,0.01)_80%)]" />
					<div className="absolute top-0 right-0 h-[320px] w-[60px] translate-x-[5%] -translate-y-[50%] rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,rgba(0,0,0,0.04)_0,rgba(0,0,0,0.01)_80%,transparent_100%)] dark:bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,255,255,0.04)_0,rgba(255,255,255,0.01)_80%,transparent_100%)]" />
					<div className="absolute top-0 right-0 h-[320px] w-[60px] -translate-y-[87.5%] rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,rgba(0,0,0,0.04)_0,rgba(0,0,0,0.01)_80%,transparent_100%)] dark:bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,255,255,0.04)_0,rgba(255,255,255,0.01)_80%,transparent_100%)]" />
				</div>

				{/* Mobile theme toggle */}
				<button
					onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
					className="absolute top-4 right-4 rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 lg:hidden"
				>
					{theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
				</button>

				<div className="mx-auto w-full max-w-sm space-y-4">
					<Link href="/" className="flex items-center gap-2 lg:hidden hover:opacity-80 transition-opacity">
						<DoorOpen className="size-6 text-indigo-600 dark:text-indigo-400" />
						<p className="text-xl font-semibold text-zinc-900 dark:text-white">OpenDoor</p>
					</Link>
					<div className="flex flex-col space-y-1">
						<h1 className="text-2xl font-bold tracking-wide text-zinc-900 dark:text-white">
							{mode === 'signup' ? 'Create your account' : 'Welcome back'}
						</h1>
						<p className="text-base text-zinc-500 dark:text-zinc-400">
							{mode === 'signup'
								? 'Get started with the LLM gateway'
								: 'Sign in to your LLM Gateway'}
						</p>
					</div>

					{(error || ssoErrorMessage) && (
						<div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
							{error || ssoErrorMessage}
						</div>
					)}

					<div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900">
						<button
							onClick={() => setMode('password')}
							className={cn(
								'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
								mode === 'password' || mode === 'signup'
									? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
									: 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
							)}
						>
							{mode === 'signup' ? 'Sign up' : 'Email'}
						</button>
						<button
							onClick={() => setMode('sso')}
							className={cn(
								'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
								mode === 'sso'
									? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
									: 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
							)}
						>
							Enterprise SSO
						</button>
					</div>

					{mode === 'password' && (
						<form onSubmit={handleLogin} className="space-y-2">
							<div className="relative">
								<Input
									placeholder="you@company.com"
									className="peer ps-9"
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
								/>
								<div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-zinc-400 peer-disabled:opacity-50">
									<AtSignIcon className="size-4" aria-hidden="true" />
								</div>
							</div>
							<div className="relative">
								<Input
									placeholder="Password"
									className="peer ps-9"
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
								/>
								<div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-zinc-400 peer-disabled:opacity-50">
									<Shield className="size-4" aria-hidden="true" />
								</div>
							</div>

							<Button type="submit" className="w-full" disabled={loading}>
								<LogIn className="me-2 size-4" />
								{loading ? 'Signing in…' : 'Continue With Email'}
							</Button>
							<p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
								No account?{' '}
								<button
									type="button"
									onClick={() => setMode('signup')}
									className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
								>
									Sign up free
								</button>
							</p>
						</form>
					)}

					{mode === 'signup' && (
						<form onSubmit={handleSignup} className="space-y-2">
							<div className="relative">
								<Input
									placeholder="Full Name"
									className="peer ps-9"
									type="text"
									value={name}
									onChange={(e) => setName(e.target.value)}
									required
								/>
								<div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-zinc-400 peer-disabled:opacity-50">
									<UserPlus className="size-4" aria-hidden="true" />
								</div>
							</div>
							<div className="relative">
								<Input
									placeholder="Organization (optional)"
									className="peer ps-9"
									type="text"
									value={orgName}
									onChange={(e) => setOrgName(e.target.value)}
								/>
								<div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-zinc-400 peer-disabled:opacity-50">
									<AtSignIcon className="size-4" aria-hidden="true" />
								</div>
							</div>
							<div className="relative">
								<Input
									placeholder="you@company.com"
									className="peer ps-9"
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
								/>
								<div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-zinc-400 peer-disabled:opacity-50">
									<AtSignIcon className="size-4" aria-hidden="true" />
								</div>
							</div>
							<div className="relative">
								<Input
									placeholder="Password (min 8 chars)"
									className="peer ps-9"
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
									minLength={8}
								/>
								<div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-zinc-400 peer-disabled:opacity-50">
									<Shield className="size-4" aria-hidden="true" />
								</div>
							</div>

							<Button type="submit" className="w-full" disabled={loading}>
								<UserPlus className="me-2 size-4" />
								{loading ? 'Creating account…' : 'Create Account'}
							</Button>
							<p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
								Already have an account?{' '}
								<button
									type="button"
									onClick={() => setMode('password')}
									className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
								>
									Sign in
								</button>
							</p>
						</form>
					)}

					{mode === 'sso' && (
						<form onSubmit={handleSSO} className="space-y-2">
							<div className="relative">
								<Input
									placeholder="Organization Slug"
									className="peer ps-9"
									type="text"
									value={orgSlug}
									onChange={(e) => setOrgSlug(e.target.value)}
									required
								/>
								<div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-zinc-400 peer-disabled:opacity-50">
									<AtSignIcon className="size-4" aria-hidden="true" />
								</div>
							</div>
							<p className="text-xs text-zinc-500 dark:text-zinc-400">
								Enter your organization slug to sign in via Okta, Azure AD, Google Workspace, etc.
							</p>
							<Button type="submit" className="w-full" disabled={ssoLoading}>
								<Shield className="me-2 size-4" />
								{ssoLoading ? 'Redirecting…' : 'Continue with SSO'}
							</Button>
						</form>
					)}

					<p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
						By clicking continue, you agree to our{' '}
						<a
							href="#"
							className="underline underline-offset-4 hover:text-indigo-600 dark:hover:text-indigo-400"
						>
							Terms of Service
						</a>{' '}
						and{' '}
						<a
							href="#"
							className="underline underline-offset-4 hover:text-indigo-600 dark:hover:text-indigo-400"
						>
							Privacy Policy
						</a>
						.
					</p>
				</div>
			</div>
		</main>
	);
}

function FloatingPaths({ position }: { position: number }) {
	const paths = Array.from({ length: 36 }, (_, i) => ({
		id: i,
		d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
			380 - i * 5 * position
		} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
			152 - i * 5 * position
		} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
			684 - i * 5 * position
		} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
		width: 0.5 + i * 0.03,
	}));

	return (
		<div className="pointer-events-none absolute inset-0">
			<svg
				className="h-full w-full text-slate-950 dark:text-white"
				viewBox="0 0 696 316"
				fill="none"
			>
				<title>Background Paths</title>
				{paths.map((path) => (
					<motion.path
						key={path.id}
						d={path.d}
						stroke="currentColor"
						strokeWidth={path.width}
						strokeOpacity={0.1 + path.id * 0.03}
						initial={{ pathLength: 0.3, opacity: 0.6 }}
						animate={{
							pathLength: 1,
							opacity: [0.3, 0.6, 0.3],
							pathOffset: [0, 1, 0],
						}}
						transition={{
							duration: 20 + Math.random() * 10,
							repeat: Number.POSITIVE_INFINITY,
							ease: 'linear',
						}}
					/>
				))}
			</svg>
		</div>
	);
}
