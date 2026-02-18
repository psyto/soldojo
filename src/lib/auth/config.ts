import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/db';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      walletAddress?: string | null;
      locale?: string;
    };
  }

  interface User {
    id: string;
    walletAddress?: string | null;
    locale?: string;
  }
}

const providers = [];

// Dev credentials provider — email-only login for local testing
if (process.env.ENABLE_DEV_AUTH === 'true') {
  providers.push(
    Credentials({
      name: 'Dev Login',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'dev@soldojo.com' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        if (!email) return null;

        // Find or create user
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.create({
            data: {
              email,
              name: email.split('@')[0],
            },
          });
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          walletAddress: user.walletAddress,
          locale: user.locale,
        };
      },
    })
  );
}

if (process.env.GITHUB_ID) {
  providers.push(
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET!,
    })
  );
}

if (process.env.GOOGLE_CLIENT_ID) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  adapter: PrismaAdapter(prisma),
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.walletAddress = user.walletAddress;
        token.locale = user.locale;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.walletAddress = token.walletAddress as string | null;
        session.user.locale = token.locale as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
  },
  debug: process.env.NODE_ENV === 'development',
});
