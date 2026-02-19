'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Shield,
  Wallet,
  Github,
  Mail,
  Check,
  Download,
  Loader2,
  Link2,
  Unlink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile, useUpdateProfile } from '@/hooks';
import { apiFetch } from '@/lib/api/client';
import { signIn } from 'next-auth/react';

export default function SettingsPage() {
  const { data: session } = useSession();
  const { publicKey, connected, signMessage } = useWallet();
  const { t, locale, setLocale } = useLocale();
  const { data: profile, isLoading, refetch } = useProfile();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
  const [isPublic, setIsPublic] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [walletLinking, setWalletLinking] = useState(false);
  const [walletError, setWalletError] = useState('');

  // Initialize form values from profile data
  useEffect(() => {
    if (profile && !initialized) {
      setName(profile.displayName || '');
      setBio(profile.bio || '');
      setTheme((profile.theme as 'dark' | 'light' | 'system') || 'dark');
      setIsPublic(profile.isPublic);
      setInitialized(true);
    }
  }, [profile, initialized]);

  // Persist wallet address to DB after proving ownership via signMessage
  const linkWallet = useCallback(async () => {
    if (!publicKey || !connected || !signMessage) return;
    setWalletLinking(true);
    setWalletError('');
    try {
      const message = `${t('settings.verifyWalletMessage')}\n${publicKey.toBase58()}\n${Date.now()}`;
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
      const signature = Buffer.from(signatureBytes).toString('base64');

      await apiFetch('/api/user/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: publicKey.toBase58(), signature, message }),
      });
      refetch();
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Failed to link wallet');
    } finally {
      setWalletLinking(false);
    }
  }, [publicKey, connected, signMessage, refetch]);

  const unlinkWallet = useCallback(async () => {
    setWalletLinking(true);
    setWalletError('');
    try {
      await apiFetch('/api/user/wallet', { method: 'DELETE' });
      refetch();
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Failed to unlink wallet');
    } finally {
      setWalletLinking(false);
    }
  }, [refetch]);

  const handleSaveProfile = () => {
    updateProfile.mutate({
      displayName: name,
      bio,
    });
  };

  const handleThemeChange = (newTheme: 'dark' | 'light' | 'system') => {
    setTheme(newTheme);
    updateProfile.mutate({ theme: newTheme });
  };

  const handleLocaleChange = (newLocale: Locale) => {
    setLocale(newLocale);
    updateProfile.mutate({ locale: newLocale });
  };

  const handlePublicToggle = () => {
    const newValue = !isPublic;
    setIsPublic(newValue);
    updateProfile.mutate({ isPublic: newValue });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">
                {t('settings.profile.bio')}
              </label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={t('settings.profile.bioPlaceholder')}
              />
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={updateProfile.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {updateProfile.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('common.save')
              )}
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
                  <p className="text-xs text-muted-foreground">{session?.user?.email || t('settings.account.notConnected')}</p>
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
                    {profile?.walletAddress
                      ? shortenAddress(profile.walletAddress, 6)
                      : connected && publicKey
                        ? shortenAddress(publicKey.toBase58(), 6)
                        : t('settings.account.notConnected')}
                  </p>
                  {walletError && (
                    <p className="text-xs text-destructive">{walletError}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {profile?.walletAddress ? (
                  <button
                    onClick={unlinkWallet}
                    disabled={walletLinking}
                    className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 disabled:opacity-50"
                  >
                    {walletLinking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
                    {t('settings.account.unlink')}
                  </button>
                ) : connected && publicKey ? (
                  <button
                    onClick={linkWallet}
                    disabled={walletLinking}
                    className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {walletLinking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                    {t('common.linkWallet')}
                  </button>
                ) : (
                  <WalletMultiButton className="!h-8 !rounded-lg !bg-primary !px-3 !text-xs !font-medium" />
                )}
              </div>
            </div>

            {/* GitHub */}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <Github className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t('settings.account.github')}</p>
                  <p className="text-xs text-muted-foreground">
                    {session?.user?.image?.includes('github') ? t('settings.account.connected') : t('settings.account.notConnected')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => signIn('github')}
                className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80"
              >
                {t('settings.account.connect')}
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
                {(Object.entries(localeNames) as [Locale, string][]).map(([key, langName]) => (
                  <button
                    key={key}
                    onClick={() => handleLocaleChange(key)}
                    className={cn(
                      'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                      locale === key
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {langName}
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
                    onClick={() => handleThemeChange(th)}
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
                onClick={handlePublicToggle}
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
