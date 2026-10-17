// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { emailOtp } from "./auth/emailOtp";
import { discord } from "./auth/discord";

// `discord` é um provider de credenciais customizado (OAuth feito no servidor)
// porque o @convex-dev/auth não traz um provider de Discord pronto e os
// providers OAuth dele só leem credenciais de variáveis de ambiente. Assim o
// dono da loja configura tudo pela aba Discord do painel.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, Anonymous, discord],
});