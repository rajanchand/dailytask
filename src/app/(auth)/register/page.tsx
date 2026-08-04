import { isPublicRegisterAllowed } from "@/server/auth-flags";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return <RegisterForm allowRegister={isPublicRegisterAllowed()} />;
}
