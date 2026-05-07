'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from './button';
import {
	AtSignIcon,
	DoorOpen,
	LogIn,
	UserPlus,
	Shield,
	Moon,
	Sun,
	ChevronLeftIcon,
} from 'lucide-react';
import { Input } from './input';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import posthog from 'posthog-js';

const QUOTES = [
	"Every model. Every provider. One key to rule them all.",
	"Stop juggling API keys. One gateway, every frontier model.",
	"GPT-4o, Claude, Gemini — one endpoint to reach them all.",
	"Your AI stack, unified. Route anywhere from a single key.",
	"From prototype to production — one API for every LLM.",
	"Switch models without changing code. That's the OpenDoor promise.",
	"The last API key you'll ever provision for AI.",
	"All the models, none of the vendor lock-in.",
];

const SEGMENT_LABELS = {
	standard: 'Self-serve setup',
	education: 'Education onboarding',
	enterprise_intent: 'Enterprise evaluation',
} as const;

export function AuthPage() {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [name, setName] = useState('');
	const [orgName, setOrgName] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const [ssoLoading, setSsoLoading] = useState(false);
	const router = useRouter();
	const searchParams = useSearchParams();
	const signupParam = searchParams.get('signup');
	const [mode, setMode] = useState<'password' | 'sso' | 'signup'>(
		signupParam ? 'signup' : 'password'
	);
	const [orgSlug, setOrgSlug] = useState('');
	const ssoError = searchParams.get('error');
	const ssoSlug = searchParams.get('sso');
	const segmentParam = searchParams.get('segment');
	const modeParam = searchParams.get('mode');
	const { theme, setTheme } = useTheme();
	const quote = React.useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);
	const segment =
		segmentParam === 'education' || segmentParam === 'enterprise_intent'
			? segmentParam
			: 'standard';

	function posthogRequestHeaders(): Record<string, string> {
		const h: Record<string, string> = {};
		try {
			const sid = posthog.get_session_id();
			const did = posthog.get_distinct_id();
			if (typeof sid === 'string' && sid) h['x-posthog-session-id'] = sid;
			if (typeof did === 'string' && did) h['x-posthog-distinct-id'] = did;
		} catch {
			// PostHog may be unavailable in some environments.
		}
		return h;
	}

	React.useEffect(() => {
		if (signupParam) {
			setMode('signup');
		}
		if (modeParam === 'sso') {
			setMode('sso');
		}
		if (ssoSlug) {
			setOrgSlug(ssoSlug);
			setMode('sso');
			window.location.href = `/api/auth/sso?org=${encodeURIComponent(ssoSlug)}`;
		}
	}, [modeParam, signupParam, ssoSlug]);

	async function handleLogin(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError('');
		const res = await fetch('/api/auth/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...posthogRequestHeaders() },
			body: JSON.stringify({ email, password }),
		});
		if (res.ok) {
			const data = await res.json().catch(() => ({}));
			try {
				if (data.user?.id) {
					posthog.identify(data.user.id, { email: data.user.email });
				}
				posthog.capture('user_logged_in_client', { auth_method: 'password' });
			} catch {
				// Analytics is optional.
			}
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
			headers: { 'Content-Type': 'application/json', ...posthogRequestHeaders() },
			body: JSON.stringify({ email, password, name, orgName, segment }),
		});
		if (res.ok) {
			const data = await res.json().catch(() => ({}));
			try {
				if (data.user?.id) {
					posthog.identify(data.user.id, {
						email: data.user.email,
						name: data.user.name,
						onboarding_segment: segment,
					});
				}
				posthog.capture('user_signed_up_client', {
					auth_method: 'password',
					onboarding_segment: segment,
				});
			} catch {
				// Analytics is optional.
			}
			router.push('/dashboard/onboarding');
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
		<main className="relative bg-white text-zinc-900 dark:bg-black dark:text-white md:h-screen md:overflow-hidden lg:grid lg:grid-cols-2">
			{/* Left Panel */}
			<div className="relative hidden h-full flex-col border-r border-zinc-200 bg-zinc-50 p-10 dark:border-zinc-800 dark:bg-zinc-950 lg:flex">
				<div className="absolute inset-0 z-10 bg-gradient-to-t from-white to-transparent dark:from-black" />
				<div className="z-10 flex items-center justify-between">
					<Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
						<DoorOpen className="size-6 text-zinc-900 dark:text-white" />
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
							&ldquo;{quote}&rdquo;
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
			<div className="relative flex min-h-screen flex-col justify-center bg-white p-4 dark:bg-black">
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

				<Button
					variant="ghost"
					className="absolute top-7 left-5 !bg-transparent !text-zinc-900 hover:!bg-zinc-100 dark:!text-white dark:hover:!bg-white/10"
					asChild
				>
					<Link href="/">
						<ChevronLeftIcon className="size-4 me-2" />
						Home
					</Link>
				</Button>

				<div className="mx-auto w-full max-w-sm space-y-4">
					<Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80 lg:hidden">
						<DoorOpen className="size-6 text-zinc-900 dark:text-white" />
						<p className="text-xl font-semibold text-zinc-900 dark:text-white">OpenDoor</p>
					</Link>

					<div className="flex flex-col space-y-1">
						{mode === 'signup' && (
							<span className="inline-flex w-fit items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
								{SEGMENT_LABELS[segment]}
							</span>
						)}
						<h1 className="text-2xl font-bold tracking-wide text-zinc-900 dark:text-white">
							{mode === 'signup' ? 'Create your account' : 'Welcome back'}
						</h1>
						<p className="text-base text-zinc-500 dark:text-zinc-400">
							{mode === 'signup'
								? segment === 'education'
									? 'Get started with an education-focused setup'
									: 'Get started with the LLM gateway'
								: 'Sign in to your LLM Gateway'}
						</p>
					</div>

					{mode === 'signup' && segment === 'enterprise_intent' && (
						<div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
							Enterprise SSO is provisioned by your admin team. If you are joining an existing enterprise org, use the Enterprise SSO tab.
						</div>
					)}

					{(error || ssoErrorMessage) && (
						<div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
							{error || ssoErrorMessage}
						</div>
					)}

					{/* Social login buttons */}
					<div className="space-y-2">
						<Button
							type="button"
							size="lg"
							className="w-full !border-zinc-900 !bg-transparent !text-zinc-900 hover:!bg-zinc-100 dark:!border-white dark:!text-white dark:hover:!bg-white/10"
							variant="outline"
						>
							<GoogleIcon className="size-4 me-2" />
							Continue with Google
						</Button>
						<Button
							type="button"
							size="lg"
							className="w-full !border-zinc-900 !bg-transparent !text-zinc-900 hover:!bg-zinc-100 dark:!border-white dark:!text-white dark:hover:!bg-white/10"
							variant="outline"
						>
							<AppleIcon className="size-4 me-2" />
							Continue with Apple
						</Button>
						<Button
							type="button"
							size="lg"
							className="w-full !border-zinc-900 !bg-transparent !text-zinc-900 hover:!bg-zinc-100 dark:!border-white dark:!text-white dark:hover:!bg-white/10"
							variant="outline"
						>
							<GithubIcon className="size-4 me-2" />
							Continue with GitHub
						</Button>
					</div>

					<AuthSeparator />

					{/* Mode tabs */}
					<div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-900">
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
									className="peer ps-9 !bg-white !border-zinc-300 !text-zinc-900 placeholder:!text-zinc-400 dark:!bg-zinc-900 dark:!border-zinc-700 dark:!text-white dark:placeholder:!text-zinc-500"
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
									className="peer ps-9 !bg-white !border-zinc-300 !text-zinc-900 placeholder:!text-zinc-400 dark:!bg-zinc-900 dark:!border-zinc-700 dark:!text-white dark:placeholder:!text-zinc-500"
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
								/>
								<div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-zinc-400 peer-disabled:opacity-50">
									<Shield className="size-4" aria-hidden="true" />
								</div>
							</div>

							<Button
								type="submit"
								className="w-full !bg-zinc-900 !text-white hover:!bg-zinc-800 dark:!bg-white dark:!text-black dark:hover:!bg-zinc-200"
								disabled={loading}
							>
								<LogIn className="me-2 size-4" />
								{loading ? 'Signing in…' : 'Continue With Email'}
							</Button>
							<p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
								No account?{' '}
								<button
									type="button"
									onClick={() => setMode('signup')}
									className="font-medium text-zinc-900 hover:text-zinc-700 dark:text-white dark:hover:text-zinc-200"
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
									className="peer ps-9 !bg-white !border-zinc-300 !text-zinc-900 placeholder:!text-zinc-400 dark:!bg-zinc-900 dark:!border-zinc-700 dark:!text-white dark:placeholder:!text-zinc-500"
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
									className="peer ps-9 !bg-white !border-zinc-300 !text-zinc-900 placeholder:!text-zinc-400 dark:!bg-zinc-900 dark:!border-zinc-700 dark:!text-white dark:placeholder:!text-zinc-500"
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
									className="peer ps-9 !bg-white !border-zinc-300 !text-zinc-900 placeholder:!text-zinc-400 dark:!bg-zinc-900 dark:!border-zinc-700 dark:!text-white dark:placeholder:!text-zinc-500"
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
									className="peer ps-9 !bg-white !border-zinc-300 !text-zinc-900 placeholder:!text-zinc-400 dark:!bg-zinc-900 dark:!border-zinc-700 dark:!text-white dark:placeholder:!text-zinc-500"
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

							<Button
								type="submit"
								className="w-full !bg-zinc-900 !text-white hover:!bg-zinc-800 dark:!bg-white dark:!text-black dark:hover:!bg-zinc-200"
								disabled={loading}
							>
								<UserPlus className="me-2 size-4" />
								{loading ? 'Creating account…' : 'Create Account'}
							</Button>
							<p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
								Already have an account?{' '}
								<button
									type="button"
									onClick={() => setMode('password')}
									className="font-medium text-zinc-900 hover:text-zinc-700 dark:text-white dark:hover:text-zinc-200"
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
									className="peer ps-9 !bg-white !border-zinc-300 !text-zinc-900 placeholder:!text-zinc-400 dark:!bg-zinc-900 dark:!border-zinc-700 dark:!text-white dark:placeholder:!text-zinc-500"
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
							<Button
								type="submit"
								className="w-full !bg-zinc-900 !text-white hover:!bg-zinc-800 dark:!bg-white dark:!text-black dark:hover:!bg-zinc-200"
								disabled={ssoLoading}
							>
								<Shield className="me-2 size-4" />
								{ssoLoading ? 'Redirecting…' : 'Continue with SSO'}
							</Button>
						</form>
					)}

					<p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
						By clicking continue, you agree to our{' '}
						<a
							href="#"
							className="underline underline-offset-4 hover:text-zinc-700 dark:hover:text-zinc-200"
						>
							Terms of Service
						</a>{' '}
						and{' '}
						<a
							href="#"
							className="underline underline-offset-4 hover:text-zinc-700 dark:hover:text-zinc-200"
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
		color: `rgba(15,23,42,${0.1 + i * 0.03})`,
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

const GoogleIcon = (props: React.ComponentProps<'svg'>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="currentColor"
		{...props}
	>
		<g>
			<path d="M12.479,14.265v-3.279h11.049c0.108,0.571,0.164,1.247,0.164,1.979c0,2.46-0.672,5.502-2.84,7.669   C18.744,22.829,16.051,24,12.483,24C5.869,24,0.308,18.613,0.308,12S5.869,0,12.483,0c3.659,0,6.265,1.436,8.223,3.307L18.392,5.62   c-1.404-1.317-3.307-2.341-5.913-2.341C7.65,3.279,3.873,7.171,3.873,12s3.777,8.721,8.606,8.721c3.132,0,4.916-1.258,6.059-2.401   c0.927-0.927,1.537-2.251,1.777-4.059L12.479,14.265z" />
		</g>
	</svg>
);

const AppleIcon = (props: React.ComponentProps<'svg'>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="currentColor"
		{...props}
	>
		<path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
	</svg>
);

const GithubIcon = (props: React.ComponentProps<'svg'>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="currentColor"
		{...props}
	>
		<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
	</svg>
);

const AuthSeparator = () => {
	return (
		<div className="flex w-full items-center justify-center">
			<div className="h-px w-full bg-zinc-200 dark:bg-zinc-700" />
			<span className="px-2 text-xs text-zinc-400">OR</span>
			<div className="h-px w-full bg-zinc-200 dark:bg-zinc-700" />
		</div>
	);
};
