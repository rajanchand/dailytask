import { isPublicRegisterAllowed } from "@/server/auth-flags";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return <LoginForm allowRegister={isPublicRegisterAllowed()} />;
}
