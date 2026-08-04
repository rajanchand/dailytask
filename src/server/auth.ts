import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import type { Role } from "@/server/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      image?: string | null;
      role: Role;
      timezone: string;
      mustChangePassword: boolean;
    };
  }

  interface User {
    role: Role;
    timezone: string;
    mustChangePassword: boolean;
  }
}

type AuthToken = {
  id?: string;
  role?: Role;
  timezone?: string;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
  sub?: string;
  mustChangePassword?: boolean;
};

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, parsed.data.email.toLowerCase()))
          .limit(1);

        if (!user || user.disabled) return null;

        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          timezone: user.timezone,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      const t = token as AuthToken;
      if (user) {
        t.id = user.id!;
        t.role = user.role;
        t.timezone = user.timezone;
        t.mustChangePassword = user.mustChangePassword;
        t.name = user.name;
        t.email = user.email;
        t.picture = user.image;
      }
      if (trigger === "update" && session) {
        t.name = session.name ?? t.name;
        t.email = session.email ?? t.email;
        t.picture = session.image ?? t.picture;
        t.timezone = session.timezone ?? t.timezone;
        if (typeof session.mustChangePassword === "boolean") {
          t.mustChangePassword = session.mustChangePassword;
        }
      }
      return t;
    },
    async session({ session, token }) {
      const t = token as AuthToken;
      if (session.user) {
        session.user.id = t.id as string;
        session.user.role = t.role as Role;
        session.user.timezone = t.timezone as string;
        if (t.email) session.user.email = t.email;
        session.user.image = t.picture;
        session.user.mustChangePassword = Boolean(t.mustChangePassword);
      }
      return session;
    },
  },
});
