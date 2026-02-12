# Customization Guide

## Theme Customization

### Colors

The design system uses CSS custom properties defined in `src/app/globals.css`. Edit the HSL values to change the theme:

```css
:root {
  --primary: 268 100% 64%;      /* Main brand color (Solana purple) */
  --accent: 157 93% 51%;        /* Accent color (Solana green) */
  --background: 240 10% 4%;     /* Page background */
  --card: 240 10% 8%;           /* Card backgrounds */
  --border: 240 10% 16%;        /* Border color */
}
```

The Solana gradient is defined in `tailwind.config.ts`:

```typescript
backgroundImage: {
  'solana-gradient': 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
}
```

### Light Mode

Light mode variables are defined under `.light` class in `globals.css`. Toggle by changing the `className` on `<html>` in `layout.tsx` from `"dark"` to `"light"`.

### XP Tier Colors

```typescript
// tailwind.config.ts
xp: {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  diamond: '#B9F2FF',
},
```

## Adding a Language

### 1. Create Translation File

Copy `src/lib/i18n/en.ts` and translate all strings:

```typescript
// src/lib/i18n/fr.ts
import type { TranslationKeys } from './en';

export const fr: TranslationKeys = {
  common: {
    appName: 'SolDojo',
    tagline: 'Ou les Builders Solana s\'entrainent',
    // ... translate all keys
  },
};
```

### 2. Register the Locale

In `src/lib/i18n/index.ts`:

```typescript
import { fr } from './fr';

export type Locale = 'en' | 'pt-br' | 'es' | 'fr';

export const translations: Record<Locale, TranslationKeys> = {
  en, 'pt-br': ptBR, es, fr,
};

export const localeNames: Record<Locale, string> = {
  en: 'English', 'pt-br': 'Portugues', es: 'Espanol', fr: 'Francais',
};
```

### 3. Update Locale Context

In `src/contexts/locale-context.tsx`, add the new locale to the validation array:

```typescript
if (saved && ['en', 'pt-br', 'es', 'fr'].includes(saved)) return saved;
```

The language switcher in the header and settings page will automatically include the new language.

## Extending Gamification

### Adding Achievements

Achievements are stored as a 256-bit bitmap. To add a new one:

1. Define the achievement in `src/lib/i18n/en.ts` under `gamification.achievements`
2. Add translations in other locale files
3. Define the bitmap index in your achievement definitions
4. Award by setting the corresponding bit in the user's achievement bitmap

### Modifying XP Rewards

XP amounts are configurable per lesson and course:

- **Per lesson:** `xpReward` field in Prisma schema and CMS
- **Per course:** `xpReward` field on Course model
- **Streak bonus:** Modify in `learning-progress.ts` service
- **Level formula:** `calculateLevel()` in `src/lib/utils.ts`

```typescript
// Change the leveling curve
export function calculateLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)); // Adjust 100 to change curve
}
```

### Adding Daily Challenges

1. Create a new lesson type `DAILY_CHALLENGE` in the Prisma enum
2. Add a daily challenge rotation API route
3. Create a daily challenge component on the dashboard

## Adding a New Page

1. Create `src/app/your-page/page.tsx`
2. Add navigation link in `src/components/layout/header.tsx`
3. Add translation keys for the page title
4. The page will be automatically routed by Next.js App Router

## Swapping to On-Chain

When the Anchor program is ready:

1. Create a new class implementing `LearningProgressService`
2. Replace `StubLearningProgressService` with the on-chain implementation
3. The interface contract ensures all pages continue working

```typescript
// src/lib/services/onchain-progress.ts
export class OnChainLearningProgressService implements LearningProgressService {
  async getXP(userId: string): Promise<number> {
    // Read Token-2022 soulbound token balance
    const connection = new Connection(SOLANA_RPC_ENDPOINT);
    // ... fetch token account balance
  }

  async getCredentials(wallet: PublicKey): Promise<Credential[]> {
    // Read cNFTs via Helius DAS API
    // ... fetch compressed NFTs for wallet
  }
}
```

## Forking for Other Communities

SolDojo is designed to be forkable:

1. **Brand:** Change colors in `globals.css`, logo in header/footer
2. **Content:** Point CMS to your own Sanity project
3. **Auth:** Update OAuth credentials in `.env`
4. **Chain:** Change RPC endpoint for your target network
5. **Translations:** Add your community's language
6. **Program:** Deploy your own Anchor program instance
