'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useLocale } from '@/contexts/locale-context';
import { type Locale, localeNames } from '@/lib/i18n';
import { shortenAddress } from '@/lib/utils';
import {
  User,
  Globe,
  Palette,
  Bell,
  Shield,
  Wallet,
  Github,
  Mail,
  Check,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const { data: session } = useSession();
  const { publicKey, connected } = useWallet();
  const { t, locale, setLocale } = useLocale();
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
  const [isPublic, setIsPublic] = useState(true);

  const sections = [
    { id: 'profile', label: t('settings.profile.title'), icon: User },
    { id: 'account', label: t('settings.account.title'), icon: Shield },
    { id: 'preferences', label: t('settings.preferences.title'), icon: Palette },
    { id: 'privacy', label: t('settings.privacy.title'), icon: Shield },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="mb-8 text-2xl font-bold">{t('settings.title')}</h1>

      <div className="space-y-8">
        {/* Profile */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <User className="h-5 w-5" />
            {t('settings.profile.title')}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">
                {t('settings.profile.name')}
              </label>
              <input
                type="text"
                defaultValue={session?.user?.name || ''}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">
                {t('settings.profile.bio')}
              </label>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Tell us about yourself..."
              />
            </div>
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              {t('common.save')}
            </button>
          </div>
        </section>

        {/* Account / Connected services */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Shield className="h-5 w-5" />
            {t('settings.account.title')}
          </h2>

          <div className="space-y-4">
            {/* Email */}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t('settings.account.email')}</p>
                  <p className="text-xs text-muted-foreground">{session?.user?.email || 'Not connected'}</p>
                </div>
              </div>
              {session?.user?.email && <Check className="h-4 w-4 text-accent" />}
            </div>

            {/* Wallet */}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t('settings.account.connectedWallets')}</p>
                  <p className="text-xs text-muted-foreground">
                    {connected && publicKey ? shortenAddress(publicKey.toBase58(), 6) : 'Not connected'}
                  </p>
                </div>
              </div>
              {connected ? (
                <Check className="h-4 w-4 text-accent" />
              ) : (
                <WalletMultiButton className="!h-8 !rounded-lg !bg-primary !px-3 !text-xs !font-medium" />
              )}
            </div>

            {/* GitHub */}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <Github className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">GitHub</p>
                  <p className="text-xs text-muted-foreground">Not connected</p>
                </div>
              </div>
              <button className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80">
                Connect
              </button>
            </div>
          </div>
        </section>

        {/* Preferences */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Palette className="h-5 w-5" />
            {t('settings.preferences.title')}
          </h2>

          <div className="space-y-4">
            {/* Language */}
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Globe className="h-4 w-4" />
                {t('settings.preferences.language')}
              </label>
              <div className="flex gap-2">
                {(Object.entries(localeNames) as [Locale, string][]).map(([key, name]) => (
                  <button
                    key={key}
                    onClick={() => setLocale(key)}
                    className={cn(
                      'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                      locale === key
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div>
              <label className="mb-2 block text-sm text-muted-foreground">
                {t('settings.preferences.theme')}
              </label>
              <div className="flex gap-2">
                {(['dark', 'light', 'system'] as const).map((th) => (
                  <button
                    key={th}
                    onClick={() => setTheme(th)}
                    className={cn(
                      'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                      theme === th
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t(`settings.preferences.theme${th.charAt(0).toUpperCase() + th.slice(1)}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Shield className="h-5 w-5" />
            {t('settings.privacy.title')}
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('settings.privacy.profileVisibility')}</p>
                <p className="text-xs text-muted-foreground">
                  {isPublic ? t('settings.privacy.public') : t('settings.privacy.private')}
                </p>
              </div>
              <button
                onClick={() => setIsPublic(!isPublic)}
                className={cn(
                  'h-6 w-11 rounded-full transition-colors',
                  isPublic ? 'bg-accent' : 'bg-secondary'
                )}
              >
                <div
                  className={cn(
                    'h-5 w-5 rounded-full bg-white shadow transition-transform',
                    isPublic ? 'translate-x-5' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>

            <button className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80">
              <Download className="h-4 w-4" />
              {t('settings.privacy.exportData')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
