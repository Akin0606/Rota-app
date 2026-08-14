import { redirect } from "next/navigation";

// Login is now a single two-step screen (see app/login/page.tsx) — the code
// entry lives inside it rather than on its own route. This redirect keeps any
// old bookmark or in-flight link from 404-ing.
export default function VerifyCodeRedirect() {
  redirect("/login");
}
