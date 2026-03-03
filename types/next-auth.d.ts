import "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    tenantId?: string | null;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      tenantId: string | null;
      isImpersonating?: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    id?: string;
    tenantId?: string | null;
    isImpersonating?: boolean;
    impersonatedBy?: string;
  }
}
