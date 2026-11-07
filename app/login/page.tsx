import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { demoEnabled, demoRole } from "@/lib/demo-mode";
import LoginForm from "./login-form";
export default async function LoginPage() {
  const requestHeaders=await headers();
  if(demoEnabled(requestHeaders))redirect(demoRole(requestHeaders)==="lender"?"/lender":"/");
  return <LoginForm />;
}
