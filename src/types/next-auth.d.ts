import "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    twoFactorEnabled: boolean;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      twoFactorEnabled: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    twoFactorEnabled: boolean;
  }
}
