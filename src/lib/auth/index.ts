import { auth } from './config';

export async function getSession() {
  return await auth();
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user;
}

export { auth, handlers, signIn, signOut } from './config';
